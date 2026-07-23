<?php

namespace App\Services;

use App\Enums\FieldType;
use App\Exceptions\ApiException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final class DuplicateService
{
    public function table(string $sourceTableId, string $actorId, bool $suffix = true, ?string $targetBaseId = null): array
    {
        return DB::transaction(function () use ($sourceTableId, $actorId, $suffix, $targetBaseId): array {
            $source = DB::table('app.tables')->where('table_id', $sourceTableId)->whereNull('deleted_at')->first();
            if (! $source) throw ApiException::notFound('Source table not found');
            $newId = (string) Str::uuid(); $name = $source->name.($suffix ? ' (copy)' : '');
            DB::table('app.tables')->insert(['table_id' => $newId, 'base_id' => $targetBaseId ?? $source->base_id, 'name' => $name, 'physical_table_name' => SqlIdentifier::tableName($newId), 'created_by' => $actorId, 'updated_by' => $actorId]);
            $fields = DB::table('app.fields')->where('table_id', $sourceTableId)->whereNull('tombstoned_at')->orderBy('position')->get();
            $definitions = []; $sourceColumns = []; $targetColumns = [];
            foreach ($fields as $field) {
                $id = (string) Str::uuid(); $column = SqlIdentifier::fieldName($id);
                DB::table('app.fields')->insert(['field_id' => $id, 'table_id' => $newId, 'name' => $field->name, 'physical_column_name' => $column, 'field_type' => $field->field_type, 'position' => $field->position, 'width' => $field->width, 'pinned' => $field->pinned, 'hidden' => $field->hidden, 'indexed' => $field->indexed, 'options' => $field->options, 'created_by' => $actorId, 'updated_by' => $actorId]);
                $definitions[] = SqlIdentifier::quote($column).' '.FieldType::from($field->field_type)->sqlType();
                $sourceColumns[] = SqlIdentifier::quote($field->physical_column_name); $targetColumns[] = SqlIdentifier::quote($column);
            }
            $extra = $definitions ? ', '.implode(', ', $definitions) : '';
            DB::statement('CREATE TABLE '.SqlIdentifier::dataTable($newId).' (record_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(), created_by text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), updated_by text NOT NULL, row_version bigint NOT NULL DEFAULT 1, deleted_at timestamptz'.$extra.')');
            $core = ['record_id', 'created_at', 'created_by', 'updated_at', 'updated_by', 'row_version', 'deleted_at'];
            DB::statement('INSERT INTO '.SqlIdentifier::dataTable($newId).' ('.implode(', ', [...$core, ...$targetColumns]).') SELECT '.implode(', ', [...$core, ...$sourceColumns]).' FROM '.SqlIdentifier::dataTable($sourceTableId).' WHERE deleted_at IS NULL');
            return ['tableId' => $newId, 'baseId' => $targetBaseId ?? $source->base_id, 'name' => $name];
        });
    }

    public function base(string $sourceBaseId, string $actorId, bool $suffix = true, ?string $targetWorkspaceId = null): array
    {
        return DB::transaction(function () use ($sourceBaseId, $actorId, $suffix, $targetWorkspaceId): array {
            $source = DB::table('app.bases')->where('base_id', $sourceBaseId)->whereNull('deleted_at')->first();
            if (! $source) throw ApiException::notFound('Source base not found');
            $id = (string) Str::uuid(); $name = $source->name.($suffix ? ' (copy)' : '');
            DB::table('app.bases')->insert(['base_id' => $id, 'workspace_id' => $targetWorkspaceId ?? $source->workspace_id, 'name' => $name, 'created_by' => $actorId, 'updated_by' => $actorId]);
            $tables = DB::table('app.tables')->where('base_id', $sourceBaseId)->whereNull('deleted_at')->orderBy('created_at')->pluck('table_id');
            foreach ($tables as $tableId) $this->table($tableId, $actorId, $suffix, $id);
            return ['base_id' => $id, 'workspace_id' => $targetWorkspaceId ?? $source->workspace_id, 'name' => $name];
        });
    }

    public function workspace(string $sourceWorkspaceId, string $actorId): array
    {
        return DB::transaction(function () use ($sourceWorkspaceId, $actorId): array {
            $source = DB::table('app.workspaces')->where('workspace_id', $sourceWorkspaceId)->whereNull('deleted_at')->first();
            if (! $source) throw ApiException::notFound('Source workspace not found');
            $id = (string) Str::uuid(); $name = $source->name.' (copy)';
            DB::table('app.workspaces')->insert(['workspace_id' => $id, 'name' => $name, 'created_by' => $actorId, 'updated_by' => $actorId]);
            DB::table('app.workspace_members')->insert(['workspace_id' => $id, 'user_id' => $actorId, 'role' => 'admin', 'created_by' => $actorId, 'updated_by' => $actorId]);
            $bases = DB::table('app.bases')->where('workspace_id', $sourceWorkspaceId)->whereNull('deleted_at')->orderBy('created_at')->pluck('base_id');
            foreach ($bases as $baseId) $this->base($baseId, $actorId, false, $id);
            return ['workspace_id' => $id, 'name' => $name];
        });
    }
}
