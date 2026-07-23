<?php

namespace App\Http\Controllers;

use App\Exceptions\ApiException;
use App\Http\Requests\NameRequest;
use App\Models\Workspace;
use App\Services\AuditService;
use App\Services\Authorization\PermissionService;
use App\Services\MetadataService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;

final class WorkspaceController
{
    public function __construct(private readonly PermissionService $permissions, private readonly MetadataService $metadata, private readonly AuditService $audit) {}

    public function index(Request $request): JsonResponse
    {
        $rows = DB::table('app.workspaces as w')->join('app.workspace_members as wm', 'wm.workspace_id', '=', 'w.workspace_id')
            ->where('wm.user_id', $request->user()->getKey())->whereNull('w.deleted_at')
            ->orderByDesc('w.updated_at')->orderByDesc('w.workspace_id')
            ->selectRaw("w.workspace_id, w.name, CASE WHEN wm.permissions IS NOT NULL AND wm.permissions->>'workspace' IS NULL THEN 'restricted' ELSE wm.role::text END AS role, w.created_at, w.updated_at, w.row_version")
            ->get();

        return response()->json(['data' => $rows]);
    }

    public function store(NameRequest $request): JsonResponse
    {
        $profile = DB::table('app.user_profiles')->where('user_id', $request->user()->getKey())->first();
        if (! $profile?->can_create_workspaces || $profile->disabled_at) {
            throw ApiException::forbidden('You do not have permission to create workspaces');
        }
        $row = $this->metadata->createWorkspace((string) $request->string('name'), $request->user()->getKey());
        $this->audit->write($request, $request->user(), $row->workspace_id, 'workspace.create', 'workspace', $row->workspace_id, ['name' => $row->name]);

        return response()->json(['data' => $row], 201);
    }

    public function show(Request $request, string $workspaceId): JsonResponse
    {
        $workspace = Workspace::query()->findOrFail($workspaceId);
        Gate::authorize('perform', [$workspace, 'workspace:read']);

        return response()->json(['data' => $workspace]);
    }

    public function update(NameRequest $request, string $workspaceId): JsonResponse
    {
        $this->permissions->workspace($request->user(), $workspaceId, 'workspace:update');
        $row = $this->metadata->rename('workspaces', 'workspace_id', $workspaceId, (string) $request->string('name'), $request->user()->getKey());
        $this->audit->write($request, $request->user(), $workspaceId, 'workspace.update', 'workspace', $workspaceId, ['name' => $row->name]);

        return response()->json(['data' => $row]);
    }

    public function destroy(Request $request, string $workspaceId): JsonResponse
    {
        $this->permissions->workspace($request->user(), $workspaceId, 'workspace:delete');
        $this->metadata->softDeleteWorkspace($workspaceId, $request->user()->getKey());
        $this->audit->write($request, $request->user(), $workspaceId, 'workspace.delete', 'workspace', $workspaceId);

        return response()->json(null, 204);
    }
}
