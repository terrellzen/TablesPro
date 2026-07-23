<?php

namespace App\Services\Records;

use App\Exceptions\ApiException;
use App\Services\PostgresArray;
use App\Services\SqlIdentifier;
use Illuminate\Support\Facades\DB;

final class RecordService
{
    public function __construct(private readonly FieldValueValidator $validator, private readonly FilterCompiler $filters, private readonly CursorService $cursors) {}

    public function list(string $tableId, array $input): array
    {
        $limit = min(max((int) ($input['limit'] ?? 100), 1), 500);
        $selected = $input['fields'] ?? [];
        $fields = $this->fields($tableId, $selected);
        $sort = $input['sort'] ?? [];
        $compiled = $this->filters->compile($input['filter'] ?? null, $fields);
        $columns = collect($fields)->map(fn ($field) => SqlIdentifier::quote($field->physical_column_name))->all();
        $select = implode(', ', ['record_id', 'created_at', 'created_by', 'updated_at', 'updated_by', 'row_version', ...$columns]);
        [$cursorSql, $cursorBindings] = $this->cursorWhere($input['cursor'] ?? null, $tableId, $sort, $fields);
        $order = $this->orderBy($sort, $fields);
        $rows = DB::select("SELECT {$select} FROM ".SqlIdentifier::dataTable($tableId)." WHERE deleted_at IS NULL AND {$compiled['sql']} {$cursorSql} ORDER BY {$order} LIMIT ?", [...$compiled['bindings'], ...$cursorBindings, $limit + 1]);
        $hasMore = count($rows) > $limit;
        $rows = array_map(fn (object $row): object => $this->normalizeRecord($row, $fields), array_slice($rows, 0, $limit));
        $next = $hasMore && $rows ? $this->makeCursor($tableId, $sort, $fields, end($rows)) : null;

        return ['data' => $rows, 'page' => ['nextCursor' => $next, 'previousCursor' => null, 'hasMore' => $hasMore, 'requestedLimit' => $limit]];
    }

    public function create(string $tableId, array $values, string $actorId): object
    {
        $fields = $this->fields($tableId, array_keys($values));
        $columns = ['created_by', 'updated_by'];
        $bindings = [$actorId, $actorId];
        foreach ($fields as $field) {
            $columns[] = SqlIdentifier::quote($field->physical_column_name);
            $bindings[] = $this->databaseValue($this->validator->validate($values[$field->field_id], $field->field_type), $field->field_type);
        }
        $row = DB::selectOne('INSERT INTO '.SqlIdentifier::dataTable($tableId).' ('.implode(', ', $columns).') VALUES ('.implode(', ', array_fill(0, count($bindings), '?')).') RETURNING *', $bindings);

        return $this->normalizeRecord($row, $fields);
    }

    public function update(string $tableId, string $recordId, array $values, int $version, string $actorId): array
    {
        $fields = $this->fields($tableId, array_keys($values));
        if ($fields === []) {
            throw new ApiException(400, 'VALIDATION_ERROR', 'At least one record value is required');
        }
        $fieldColumns = array_map(fn ($field): string => SqlIdentifier::quote($field->physical_column_name), $fields);
        $before = DB::selectOne(
            'SELECT '.implode(', ', $fieldColumns).' FROM '.SqlIdentifier::dataTable($tableId).' WHERE record_id = ? AND deleted_at IS NULL',
            [$recordId],
        );
        $sets = [];
        $bindings = [];
        foreach ($fields as $field) {
            $sets[] = SqlIdentifier::quote($field->physical_column_name).' = ?';
            $bindings[] = $this->databaseValue($this->validator->validate($values[$field->field_id], $field->field_type), $field->field_type);
        }
        $bindings = [...$bindings, $actorId, $recordId, $version];
        $row = DB::selectOne('UPDATE '.SqlIdentifier::dataTable($tableId).' SET '.implode(', ', $sets).', updated_by = ?, updated_at = now(), row_version = row_version + 1 WHERE record_id = ? AND row_version = ? AND deleted_at IS NULL RETURNING *', $bindings);
        if (! $row) {
            $current = DB::selectOne('SELECT record_id, row_version FROM '.SqlIdentifier::dataTable($tableId).' WHERE record_id = ? AND deleted_at IS NULL', [$recordId]);
            throw ApiException::conflict('Record version conflict', $current);
        }

        $diff = [];
        foreach ($fields as $field) {
            $column = $field->physical_column_name;
            $old = $before?->{$column};
            $new = $row->{$column};
            if (json_encode($old) !== json_encode($new)) {
                $diff[$field->name] = ['before' => $old, 'after' => $new];
            }
        }

        return ['record' => $this->normalizeRecord($row, $fields), 'fields' => $fields, 'diff' => $diff];
    }

    public function delete(string $tableId, string $recordId, string $actorId): void
    {
        DB::update('UPDATE '.SqlIdentifier::dataTable($tableId).' SET deleted_at=now(), updated_at=now(), updated_by=?, row_version=row_version+1 WHERE record_id=? AND deleted_at IS NULL', [$actorId, $recordId]);
    }

    private function fields(string $tableId, array $selected): array
    {
        $query = DB::table('app.fields')->where('table_id', $tableId)->whereNull('tombstoned_at');
        if ($selected !== []) {
            $query->whereIn('field_id', $selected);
        }
        $fields = $query->orderBy('position')->orderBy('field_id')->get(['field_id', 'name', 'physical_column_name', 'field_type'])->all();
        if ($selected !== [] && count($fields) !== count(array_unique($selected))) {
            throw new ApiException(400, 'VALIDATION_ERROR', 'One or more selected fields are invalid');
        }

        return $fields;
    }

    private function orderBy(array $sort, array $fields): string
    {
        if ($sort === []) {
            return 'updated_at DESC, record_id DESC';
        }
        $map = collect($fields)->keyBy('field_id');
        $clauses = [];
        foreach ($sort as $entry) {
            $field = $map->get($entry['fieldId'] ?? '');
            $direction = $entry['direction'] ?? '';
            if (! $field || ! in_array($direction, ['asc', 'desc'], true)) {
                throw new ApiException(400, 'VALIDATION_ERROR', 'One or more sort fields are invalid');
            }
            $clauses[] = SqlIdentifier::quote($field->physical_column_name).' '.strtoupper($direction).' NULLS LAST';
        }

        return implode(', ', [...$clauses, 'record_id ASC']);
    }

    private function cursorWhere(?string $cursor, string $tableId, array $sort, array $fields): array
    {
        if (! $cursor) {
            return ['', []];
        }
        $payload = $this->cursors->decode($cursor);
        if ($payload['tableId'] !== $tableId) {
            throw new ApiException(400, 'VALIDATION_ERROR', 'Cursor does not belong to this table');
        }
        if ($sort === []) {
            $value = collect($payload['sort'])->firstWhere('fieldId', 'updated_at')['value'] ?? null;
            if ($value === null) {
                throw new ApiException(400, 'VALIDATION_ERROR', 'Cursor does not match the requested sort');
            }

            return ['AND (updated_at, record_id) < (?::timestamptz, ?::uuid)', [$value, $payload['recordId']]];
        }
        $map = collect($fields)->keyBy('field_id');
        $cursorSort = collect($payload['sort'])->keyBy('fieldId');
        $branches = [];
        $bindings = [];
        foreach ($sort as $index => $entry) {
            $prefix = [];
            for ($prefixIndex = 0; $prefixIndex < $index; $prefixIndex++) {
                $prefixSort = $sort[$prefixIndex];
                $prefixField = $map->get($prefixSort['fieldId']);
                $prefixCursor = $cursorSort->get($prefixSort['fieldId']);
                $this->assertCursorEntry($prefixField, $prefixCursor, $prefixSort['direction']);
                $prefix[] = SqlIdentifier::quote($prefixField->physical_column_name).' IS NOT DISTINCT FROM ?';
                $bindings[] = $this->databaseValue($prefixCursor['value'], $prefixField->field_type);
            }
            $field = $map->get($entry['fieldId']);
            $item = $cursorSort->get($entry['fieldId']);
            $this->assertCursorEntry($field, $item, $entry['direction']);
            if ($item['value'] === null) {
                continue;
            }
            $column = SqlIdentifier::quote($field->physical_column_name);
            $operator = $entry['direction'] === 'asc' ? '>' : '<';
            $bindings[] = $this->databaseValue($item['value'], $field->field_type);
            $prefix[] = "({$column} {$operator} ? OR {$column} IS NULL)";
            $branches[] = '('.implode(' AND ', $prefix).')';
        }
        $equal = [];
        foreach ($sort as $entry) {
            $field = $map->get($entry['fieldId']);
            $item = $cursorSort->get($entry['fieldId']);
            $this->assertCursorEntry($field, $item, $entry['direction']);
            $equal[] = SqlIdentifier::quote($field->physical_column_name).' IS NOT DISTINCT FROM ?';
            $bindings[] = $this->databaseValue($item['value'], $field->field_type);
        }
        $equal[] = 'record_id > ?::uuid';
        $bindings[] = $payload['recordId'];
        $branches[] = '('.implode(' AND ', $equal).')';

        return ['AND ('.implode(' OR ', $branches).')', $bindings];
    }

    private function makeCursor(string $tableId, array $sort, array $fields, object $row): string
    {
        $map = collect($fields)->keyBy('field_id');
        $payloadSort = $sort === [] ? [['fieldId' => 'updated_at', 'direction' => 'desc', 'value' => $row->updated_at]] : array_map(fn (array $entry): array => ['fieldId' => $entry['fieldId'], 'direction' => $entry['direction'], 'value' => $row->{$map[$entry['fieldId']]->physical_column_name}], $sort);

        return $this->cursors->encode(['tableId' => $tableId, 'recordId' => $row->record_id, 'sort' => $payloadSort]);
    }

    private function databaseValue(mixed $value, string $type): mixed
    {
        return $type === 'multiple_select' && $value !== null ? PostgresArray::encode($value) : $value;
    }

    private function assertCursorEntry(mixed $field, mixed $entry, string $direction): void
    {
        if (! $field || ! is_array($entry) || ($entry['direction'] ?? null) !== $direction) {
            throw new ApiException(400, 'VALIDATION_ERROR', 'Cursor does not match the requested sort');
        }
    }

    private function normalizeRecord(object $row, array $fields): object
    {
        foreach ($fields as $field) {
            if ($field->field_type === 'multiple_select' && isset($row->{$field->physical_column_name})) {
                $row->{$field->physical_column_name} = PostgresArray::decode($row->{$field->physical_column_name});
            }
        }

        return $row;
    }
}
