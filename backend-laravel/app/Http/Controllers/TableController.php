<?php

namespace App\Http\Controllers;

use App\Http\Requests\NameRequest;
use App\Services\AuditService;
use App\Services\Authorization\PermissionService;
use App\Services\DynamicTableService;
use App\Services\MetadataService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

final class TableController
{
    public function __construct(private readonly PermissionService $permissions, private readonly DynamicTableService $dynamic, private readonly MetadataService $metadata, private readonly AuditService $audit) {}

    public function index(Request $request, string $baseId): JsonResponse
    {
        $this->permissions->base($request->user(), $baseId, 'table:read');
        $profile = DB::table('app.user_profiles')->where('user_id', $request->user()->getKey())->first();
        $isAdmin = in_array($profile?->role, ['owner', 'admin'], true);

        $query = DB::table('app.tables as t')->join('app.bases as b', 'b.base_id', '=', 't.base_id')
            ->where('t.base_id', $baseId)->whereNull('t.deleted_at');
        if ($isAdmin) {
            $query->orderBy('t.created_at');
        } else {
            $query->join('app.workspace_members as wm', fn ($join) => $join->on('wm.workspace_id', '=', 'b.workspace_id')->where('wm.user_id', $request->user()->getKey()))
                ->whereRaw("wm.permissions IS NULL OR wm.permissions->>'workspace' IS NOT NULL OR jsonb_exists(wm.permissions->'bases', t.base_id::text) OR jsonb_exists(wm.permissions->'tables', t.table_id::text)")
                ->orderBy('t.created_at');
        }
        $rows = $query->select('t.table_id', 't.base_id', 't.name', 't.primary_display_field_id', 't.created_at', 't.updated_at', 't.row_version')->get();

        return response()->json(['data' => $rows]);
    }

    public function store(NameRequest $request, string $baseId): JsonResponse
    {
        $scope = $this->permissions->base($request->user(), $baseId, 'table:create');
        $row = $this->dynamic->createTable($baseId, (string) $request->string('name'), $request->user()->getKey());
        $this->audit->write($request, $request->user(), $scope['workspaceId'], 'table.create', 'table', $row['tableId'], ['name' => $row['name'], 'physicalTableName' => $row['physicalTableName']]);

        return response()->json(['data' => $row], 201);
    }

    public function update(NameRequest $request, string $tableId): JsonResponse
    {
        $scope = $this->permissions->table($request->user(), $tableId, 'table:update');
        $previousName = DB::table('app.tables')->where('table_id', $tableId)->whereNull('deleted_at')->value('name');
        $row = $this->metadata->rename('tables', 'table_id', $tableId, (string) $request->string('name'), $request->user()->getKey());
        $this->audit->write($request, $request->user(), $scope['workspaceId'], 'table.update', 'table', $tableId, ['name' => $row->name], ['Name' => ['before' => $previousName, 'after' => $row->name]]);

        return response()->json(['data' => $row]);
    }

    public function destroy(Request $request, string $baseId, string $tableId): JsonResponse
    {
        $scope = $this->permissions->table($request->user(), $tableId, 'table:delete');
        $this->dynamic->assertTableBelongsToBase($tableId, $baseId);
        $this->dynamic->dropTable($tableId, $request->user()->getKey());
        $this->audit->write($request, $request->user(), $scope['workspaceId'], 'table.delete', 'table', $tableId, ['baseId' => $baseId]);

        return response()->json(null, 204);
    }
}
