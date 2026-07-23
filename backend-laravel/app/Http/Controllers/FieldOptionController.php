<?php

namespace App\Http\Controllers;

use App\Exceptions\ApiException;
use App\Services\AuditService;
use App\Services\Authorization\PermissionService;
use App\Services\SqlIdentifier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

final class FieldOptionController
{
    public function __construct(private readonly PermissionService $permissions, private readonly AuditService $audit) {}

    public function index(Request $request, string $tableId, string $fieldId): JsonResponse
    {
        $this->permissions->table($request->user(), $tableId, 'field:read');
        $field = $this->field($tableId, $fieldId);
        $column = SqlIdentifier::quote($field->physical_column_name);
        $values = DB::select("SELECT {$column}::text AS value, count(*)::int AS usage_count FROM ".SqlIdentifier::dataTable($tableId)." WHERE deleted_at IS NULL AND {$column} IS NOT NULL AND btrim({$column}::text) <> '' GROUP BY {$column} ORDER BY usage_count DESC, value ASC LIMIT 200");
        $options = json_decode($field->options, true) ?: [];
        $colors = array_filter($options['choiceColors'] ?? [], fn ($color) => is_string($color) && preg_match('/^#[0-9a-f]{6}$/i', $color));
        return response()->json(['data' => ['values' => collect($values)->pluck('value'), 'colors' => $colors]]);
    }

    public function update(Request $request, string $tableId, string $fieldId): JsonResponse
    {
        $input = $request->validate(['value' => ['required', 'string', 'max:1000'], 'color' => ['required', 'regex:/^#[0-9a-fA-F]{6}$/']]);
        $scope = $this->permissions->table($request->user(), $tableId, 'field:update');
        $field = $this->field($tableId, $fieldId); $options = json_decode($field->options, true) ?: [];
        $options['choiceColors'][$input['value']] = strtolower($input['color']);
        DB::table('app.fields')->where('field_id', $fieldId)->update(['options' => json_encode($options, JSON_THROW_ON_ERROR), 'updated_at' => now(), 'updated_by' => $request->user()->getKey(), 'row_version' => DB::raw('row_version + 1')]);
        $this->audit->write($request, $request->user(), $scope['workspaceId'], 'field.update', 'field', $fieldId, ['tableId' => $tableId, 'dropdownValue' => $input['value'], 'color' => strtolower($input['color'])]);
        return response()->json(['data' => ['options' => $options]]);
    }

    private function field(string $tableId, string $fieldId): object
    {
        $field = DB::table('app.fields')->where('table_id', $tableId)->where('field_id', $fieldId)->whereNull('tombstoned_at')->first();
        if (! $field) throw ApiException::notFound('Field was not found');
        if ($field->field_type !== 'single_select') throw new ApiException(400, 'VALIDATION_ERROR', 'Field is not a Dropdown field');
        return $field;
    }
}
