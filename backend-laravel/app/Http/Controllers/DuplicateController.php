<?php

namespace App\Http\Controllers;

use App\Services\AuditService;
use App\Services\Authorization\PermissionService;
use App\Services\DuplicateService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class DuplicateController
{
    public function __construct(private readonly PermissionService $permissions, private readonly DuplicateService $duplicates, private readonly AuditService $audit) {}

    public function workspace(Request $request, string $workspaceId): JsonResponse
    {
        $this->permissions->workspace($request->user(), $workspaceId, 'workspace:read');
        $row = $this->duplicates->workspace($workspaceId, $request->user()->getKey());
        $this->audit->write($request, $request->user(), $row['workspace_id'], 'workspace.create', 'workspace', $row['workspace_id'], ['name' => $row['name'], 'duplicatedFrom' => $workspaceId]);
        return response()->json(['data' => $row], 201);
    }

    public function base(Request $request, string $baseId): JsonResponse
    {
        $scope = $this->permissions->base($request->user(), $baseId, 'base:create');
        $row = $this->duplicates->base($baseId, $request->user()->getKey());
        $this->audit->write($request, $request->user(), $scope['workspaceId'], 'base.create', 'base', $row['base_id'], ['name' => $row['name'], 'duplicatedFrom' => $baseId]);
        return response()->json(['data' => $row], 201);
    }

    public function table(Request $request, string $tableId): JsonResponse
    {
        $scope = $this->permissions->table($request->user(), $tableId, 'table:create');
        $row = $this->duplicates->table($tableId, $request->user()->getKey());
        $this->audit->write($request, $request->user(), $scope['workspaceId'], 'table.create', 'table', $row['tableId'], ['name' => $row['name'], 'baseId' => $row['baseId'], 'duplicatedFrom' => $tableId]);
        return response()->json(['data' => $row], 201);
    }
}
