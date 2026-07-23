<?php

namespace App\Http\Controllers;

use App\Http\Requests\NameRequest;
use App\Services\AuditService;
use App\Services\Authorization\PermissionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final class FieldGroupController
{
    public function __construct(private readonly PermissionService $permissions, private readonly AuditService $audit) {}

    public function index(Request $request, string $tableId): JsonResponse
    {
        $this->permissions->table($request->user(), $tableId, 'field:read');
        return response()->json(['data' => DB::table('app.field_groups')->where('table_id', $tableId)->orderBy('position')->orderBy('field_group_id')->get()]);
    }

    public function store(NameRequest $request, string $tableId): JsonResponse
    {
        $request->validate(['parentFieldGroupId' => ['sometimes', 'nullable', 'uuid']]);
        $scope = $this->permissions->table($request->user(), $tableId, 'field:create');
        $id = (string) Str::uuid();
        $position = (int) (DB::table('app.field_groups')->where('table_id', $tableId)->max('position') ?? -1) + 1;
        DB::table('app.field_groups')->insert(['field_group_id' => $id, 'table_id' => $tableId, 'parent_field_group_id' => $request->input('parentFieldGroupId'), 'name' => (string) $request->string('name'), 'position' => $position]);
        $group = DB::table('app.field_groups')->where('field_group_id', $id)->first();
        $this->audit->write($request, $request->user(), $scope['workspaceId'], 'field_group.create', 'field_group', $id, ['tableId' => $tableId, 'name' => $group->name]);
        return response()->json(['data' => $group], 201);
    }
}
