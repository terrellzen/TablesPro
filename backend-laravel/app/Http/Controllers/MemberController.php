<?php

namespace App\Http\Controllers;

use App\Exceptions\ApiException;
use App\Services\AuditService;
use App\Services\Authorization\PermissionService;
use App\Services\MemberService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

final class MemberController
{
    public function __construct(private readonly PermissionService $permissions, private readonly MemberService $members, private readonly AuditService $audit) {}

    public function resources(Request $request, string $workspaceId): JsonResponse
    {
        $this->permissions->workspace($request->user(), $workspaceId, 'member:update');
        $bases = DB::table('app.bases')->where('workspace_id', $workspaceId)->whereNull('deleted_at')->orderBy('name')->get(['base_id', 'workspace_id', 'name']);
        $tables = DB::table('app.tables as t')->join('app.bases as b', 'b.base_id', '=', 't.base_id')->where('b.workspace_id', $workspaceId)->whereNull('t.deleted_at')->whereNull('b.deleted_at')->orderBy('t.name')->get(['t.table_id', 't.base_id', 't.name']);
        return response()->json(['data' => ['bases' => $bases, 'tables' => $tables]]);
    }

    public function index(Request $request, string $workspaceId): JsonResponse
    {
        $this->permissions->workspace($request->user(), $workspaceId, 'member:read');
        $rows = DB::table('app.workspace_members as wm')->leftJoin('app.user_profiles as up', 'up.user_id', '=', 'wm.user_id')->where('wm.workspace_id', $workspaceId)->orderBy('wm.created_at')->orderBy('wm.user_id')->get(['wm.workspace_id', 'wm.user_id', DB::raw('up.handle::text'), 'up.display_name', 'wm.role', 'wm.permissions', 'wm.created_at', 'wm.updated_at']);
        return response()->json(['data' => $rows]);
    }

    public function store(Request $request, string $workspaceId): JsonResponse
    {
        $this->permissions->workspace($request->user(), $workspaceId, 'member:create');
        $input = $request->validate(['userId' => ['required', 'string'], 'permissions' => ['required', 'array'], 'confirmDestructive' => ['sometimes', 'boolean']]);
        $userId = $this->members->resolveUser($input['userId']);
        $permissions = $this->members->validatePermissions($workspaceId, $input['permissions'], $input['confirmDestructive'] ?? false);
        $member = $this->members->save($workspaceId, $userId, $permissions, $request->user()->getKey());
        $this->audit->write($request, $request->user(), $workspaceId, 'member.create', 'workspace_member', $userId, ['permissions' => $permissions]);
        return response()->json(['data' => $member], 201);
    }

    public function update(Request $request, string $workspaceId, string $userId): JsonResponse
    {
        $this->permissions->workspace($request->user(), $workspaceId, 'member:update');
        if ($userId === $request->user()->getKey()) throw ApiException::forbidden('Members cannot change their own permissions');
        $input = $request->validate(['permissions' => ['required', 'array'], 'confirmDestructive' => ['sometimes', 'boolean']]);
        $permissions = $this->members->validatePermissions($workspaceId, $input['permissions'], $input['confirmDestructive'] ?? false);
        $member = $this->members->save($workspaceId, $userId, $permissions, $request->user()->getKey());
        $this->audit->write($request, $request->user(), $workspaceId, 'member.update', 'workspace_member', $userId, ['permissions' => $permissions]);
        return response()->json(['data' => $member]);
    }

    public function destroy(Request $request, string $workspaceId, string $userId): JsonResponse
    {
        $this->permissions->workspace($request->user(), $workspaceId, 'member:delete');
        if ($userId === $request->user()->getKey()) throw ApiException::forbidden('Members cannot remove themselves');
        $this->members->remove($workspaceId, $userId);
        $this->audit->write($request, $request->user(), $workspaceId, 'member.delete', 'workspace_member', $userId, ['permissions' => null]);
        return response()->json(null, 204);
    }
}
