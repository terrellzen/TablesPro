<?php

namespace App\Services;

use App\Enums\FieldType;
use App\Exceptions\ApiException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final class DynamicTableService
{
    public function createTable(string $baseId, string $name, string $actorId): array
    {
        return DB::transaction(function () use ($baseId, $name, $actorId): array {
            $tableId = (string) Str::uuid();
            $physical = SqlIdentifier::tableName($tableId);
            DB::table('app.tables')->insert([
                'table_id' => $tableId, 'base_id' => $baseId, 'name' => $name,
                'physical_table_name' => $physical, 'created_by' => $actorId, 'updated_by' => $actorId,
            ]);
            DB::statement('CREATE TABLE '.SqlIdentifier::dataTable($tableId).' (
                record_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                created_at timestamptz NOT NULL DEFAULT now(), created_by text NOT NULL,
                updated_at timestamptz NOT NULL DEFAULT now(), updated_by text NOT NULL,
                row_version bigint NOT NULL DEFAULT 1, deleted_at timestamptz
            )');
            DB::statement('CREATE INDEX '.SqlIdentifier::quote($physical.'_updated_idx').' ON '.SqlIdentifier::dataTable($tableId).' (updated_at DESC, record_id DESC)');

            return ['tableId' => $tableId, 'baseId' => $baseId, 'name' => $name, 'physicalTableName' => $physical];
        });
    }

    public function addField(string $tableId, string $name, FieldType $type, string $actorId): array
    {
        return DB::transaction(function () use ($tableId, $name, $type, $actorId): array {
            DB::select('SELECT pg_advisory_xact_lock(hashtext(?))', [$tableId]);
            $position = (int) (DB::table('app.fields')->where('table_id', $tableId)->max('position') ?? -1) + 1;
            $fieldId = (string) Str::uuid();
            $physical = SqlIdentifier::fieldName($fieldId);
            DB::table('app.fields')->insert([
                'field_id' => $fieldId, 'table_id' => $tableId, 'name' => $name,
                'physical_column_name' => $physical, 'field_type' => $type->value,
                'position' => $position, 'created_by' => $actorId, 'updated_by' => $actorId,
            ]);
            DB::statement('ALTER TABLE '.SqlIdentifier::dataTable($tableId).' ADD COLUMN '.SqlIdentifier::quote($physical).' '.$type->sqlType());

            return ['fieldId' => $fieldId, 'tableId' => $tableId, 'name' => $name, 'fieldType' => $type->value, 'physicalColumnName' => $physical, 'position' => $position];
        });
    }

    public function removeField(string $tableId, string $fieldId, string $actorId): ?object
    {
        return DB::transaction(function () use ($tableId, $fieldId, $actorId): ?object {
            $field = DB::table('app.fields')->where('field_id', $fieldId)->where('table_id', $tableId)->lockForUpdate()->first();
            if (! $field || $field->tombstoned_at) {
                return null;
            }
            DB::table('app.fields')->where('field_id', $fieldId)->update([
                'tombstoned_at' => now(), 'updated_at' => now(), 'updated_by' => $actorId,
                'row_version' => DB::raw('row_version + 1'),
            ]);
            DB::statement('ALTER TABLE '.SqlIdentifier::dataTable($tableId).' DROP COLUMN IF EXISTS '.SqlIdentifier::quote($field->physical_column_name));

            return $field;
        });
    }

    public function dropTable(string $tableId, string $actorId): void
    {
        DB::transaction(function () use ($tableId, $actorId): void {
            DB::table('app.tables')->where('table_id', $tableId)->whereNull('deleted_at')->update([
                'deleted_at' => now(), 'updated_at' => now(), 'updated_by' => $actorId,
                'row_version' => DB::raw('row_version + 1'),
            ]);
            DB::statement('DROP TABLE IF EXISTS '.SqlIdentifier::dataTable($tableId));
        });
    }

    public function assertTableBelongsToBase(string $tableId, string $baseId): void
    {
        if (! DB::table('app.tables')->where('table_id', $tableId)->where('base_id', $baseId)->exists()) {
            throw ApiException::notFound('Table not found in this base');
        }
    }
}
