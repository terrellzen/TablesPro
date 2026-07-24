<?php

namespace App\Http\Controllers;

use App\Exceptions\ApiException;
use App\Http\Requests\NameRequest;
use App\Models\Base;
use App\Services\AuditService;
use App\Services\Authorization\PermissionService;
use App\Services\MetadataService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;

final class BaseController
{
    public function __construct(private readonly PermissionService $permissions, private readonly MetadataService $metadata, private readonly AuditService $audit) {}

    public function index(Request $request, string $workspaceId): JsonResponse
    {
        $this->permissions->workspace($request->user(), $workspaceId, 'workspace:read');
        $rows = DB::table('app.bases as b')->join('app.workspace_members as wm', fn ($join) => $join->on('wm.workspace_id', '=', 'b.workspace_id')->where('wm.user_id', $request->user()->getKey()))
            ->where('b.workspace_id', $workspaceId)->whereNull('b.deleted_at')
            ->whereRaw("wm.permissions IS NULL OR wm.permissions->>'workspace' IS NOT NULL OR jsonb_exists(wm.permissions->'bases', b.base_id::text) OR EXISTS (SELECT 1 FROM app.tables t WHERE t.base_id=b.base_id AND jsonb_exists(wm.permissions->'tables', t.table_id::text))")
            ->select('b.base_id', 'b.workspace_id', 'b.name', 'b.created_at', 'b.updated_at', 'b.row_version')->orderByDesc('b.updated_at')->get();

        return response()->json(['data' => $rows]);
    }

    public function store(NameRequest $request, string $workspaceId): JsonResponse
    {
        $this->permissions->workspace($request->user(), $workspaceId, 'base:create');
        $row = $this->metadata->createBase($workspaceId, (string) $request->string('name'), $request->user()->getKey());
        $this->audit->write($request, $request->user(), $workspaceId, 'base.create', 'base', $row->base_id, ['name' => $row->name]);

        return response()->json(['data' => $row], 201);
    }

    public function show(Request $request, string $baseId): JsonResponse
    {
        $base = Base::query()->findOrFail($baseId);
        Gate::authorize('perform', [$base, 'base:read']);

        return response()->json(['data' => $base]);
    }

    public function update(NameRequest $request, string $baseId): JsonResponse
    {
        $scope = $this->permissions->base($request->user(), $baseId, 'base:update');
        $previousName = DB::table('app.bases')->where('base_id', $baseId)->whereNull('deleted_at')->value('name');
        $row = $this->metadata->rename('bases', 'base_id', $baseId, (string) $request->string('name'), $request->user()->getKey());
        $this->audit->write($request, $request->user(), $scope['workspaceId'], 'base.update', 'base', $baseId, ['name' => $row->name], ['Name' => ['before' => $previousName, 'after' => $row->name]]);

        return response()->json(['data' => $row]);
    }

    public function destroy(Request $request, string $workspaceId, string $baseId): JsonResponse
    {
        $scope = $this->permissions->base($request->user(), $baseId, 'base:delete');
        if ($scope['workspaceId'] !== $workspaceId) {
            throw ApiException::notFound('Base not found in this workspace');
        }
        $this->metadata->softDeleteBase($baseId, $request->user()->getKey());
        $this->audit->write($request, $request->user(), $workspaceId, 'base.delete', 'base', $baseId);

        return response()->json(null, 204);
    }
}
