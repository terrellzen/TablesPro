<?php

namespace App\Http\Controllers;

use App\Enums\FieldType;
use App\Exceptions\ApiException;
use App\Http\Requests\FieldRequest;
use App\Http\Requests\NameRequest;
use App\Services\AuditService;
use App\Services\Authorization\PermissionService;
use App\Services\DynamicTableService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

final class FieldController
{
    public function __construct(private readonly PermissionService $permissions, private readonly DynamicTableService $dynamic, private readonly AuditService $audit) {}

    public function index(Request $request, string $tableId): JsonResponse
    {
        $this->permissions->table($request->user(), $tableId, 'field:read');
        $rows = DB::table('app.fields')->where('table_id', $tableId)->whereNull('tombstoned_at')->orderBy('position')->orderBy('field_id')->get();

        return response()->json(['data' => $rows]);
    }

    public function store(FieldRequest $request, string $tableId): JsonResponse
    {
        $scope = $this->permissions->table($request->user(), $tableId, 'field:create');
        $row = $this->dynamic->addField($tableId, (string) $request->string('name'), FieldType::from((string) $request->string('fieldType')), $request->user()->getKey());
        $this->audit->write($request, $request->user(), $scope['workspaceId'], 'field.create', 'field', $row['fieldId'], ['tableId' => $tableId, 'name' => $row['name'], 'fieldType' => $row['fieldType']]);

        return response()->json(['data' => $row], 201);
    }

    public function update(NameRequest $request, string $tableId, string $fieldId): JsonResponse
    {
        $scope = $this->permissions->table($request->user(), $tableId, 'field:update');
        $previousName = DB::table('app.fields')->where('field_id', $fieldId)->where('table_id', $tableId)->whereNull('tombstoned_at')->value('name');
        DB::table('app.fields')->where('field_id', $fieldId)->where('table_id', $tableId)->whereNull('tombstoned_at')->update([
            'name' => (string) $request->string('name'), 'updated_at' => now(), 'updated_by' => $request->user()->getKey(), 'row_version' => DB::raw('row_version + 1'),
        ]);
        $row = DB::table('app.fields')->where('field_id', $fieldId)->where('table_id', $tableId)->whereNull('tombstoned_at')->first();
        if (! $row) throw ApiException::notFound('Field was not found');
        $this->audit->write($request, $request->user(), $scope['workspaceId'], 'field.update', 'field', $fieldId, ['tableId' => $tableId, 'name' => $row->name], ['Name' => ['before' => $previousName, 'after' => $row->name]]);

        return response()->json(['data' => $row]);
    }

    public function destroy(Request $request, string $tableId, string $fieldId): JsonResponse
    {
        $scope = $this->permissions->table($request->user(), $tableId, 'field:delete');
        $field = $this->dynamic->removeField($tableId, $fieldId, $request->user()->getKey());
        if ($field) $this->audit->write($request, $request->user(), $scope['workspaceId'], 'field.delete', 'field', $fieldId, ['tableId' => $tableId, 'name' => $field->name]);

        return response()->json(null, 204);
    }

    public function reorder(Request $request, string $tableId): JsonResponse
    {
        $validated = $request->validate(['fieldOrder' => ['required', 'array', 'min:1'], 'fieldOrder.*' => ['uuid', 'distinct']]);
        $scope = $this->permissions->table($request->user(), $tableId, 'field:update');
        DB::transaction(fn () => collect($validated['fieldOrder'])->each(fn (string $id, int $position) => DB::table('app.fields')->where('field_id', $id)->where('table_id', $tableId)->whereNull('tombstoned_at')->update(['position' => $position, 'updated_at' => now(), 'updated_by' => $request->user()->getKey(), 'row_version' => DB::raw('row_version + 1')])));
        $this->audit->write($request, $request->user(), $scope['workspaceId'], 'field.reorder', 'field', $tableId, ['tableId' => $tableId, 'fieldOrder' => $validated['fieldOrder']]);

        return response()->json(['data' => ['fieldOrder' => $validated['fieldOrder']]]);
    }
}
