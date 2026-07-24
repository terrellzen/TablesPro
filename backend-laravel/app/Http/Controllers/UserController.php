<?php

namespace App\Http\Controllers;

use App\Http\Resources\UserProfileResource;
use App\Services\Auth\AuthenticationService;
use App\Services\AuditService;
use App\Services\UserService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

final class UserController
{
    public function __construct(private readonly UserService $users, private readonly AuthenticationService $auth, private readonly AuditService $audit) {}

    public function index(Request $request): JsonResponse
    {
        $profiles = DB::table('app.user_profiles')->whereNull('disabled_at')->orderBy('handle')->get(['user_id', DB::raw('handle::text'), 'display_name', 'can_create_workspaces', 'can_manage_users', 'disabled_at']);

        return response()->json(['data' => UserProfileResource::collection($profiles)->resolve()]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->users->assertManager($request->user());
        $input = $request->validate(['email' => ['required', 'email', 'max:320'], 'password' => ['required', 'string', 'min:8'], 'handle' => ['required', 'string'], 'displayName' => ['required', 'string', 'max:255'], 'canCreateWorkspaces' => ['sometimes', 'boolean'], 'canManageUsers' => ['sometimes', 'boolean']]);
        $target = $this->users->create($input);
        $this->auditUser($request, 'user.create', $target);
        return response()->json(['data' => $target]);
    }

    public function profile(Request $request): JsonResponse
    {
        $input = $request->validate(['handle' => ['required', 'string'], 'displayName' => ['required', 'string', 'max:255']]);
        $before = DB::table('app.user_profiles')->where('user_id', $request->user()->getKey())->first();
        $target = $this->users->profile($request->user(), $input['handle'], $input['displayName']);
        $this->auditUser($request, 'user.update', $target, ['Display name' => ['before' => $before?->display_name, 'after' => $target->display_name], 'Handle' => ['before' => $before?->handle, 'after' => $target->handle]]);
        return response()->json(['data' => $target]);
    }

    public function permissions(Request $request, string $userId): JsonResponse
    {
        $this->users->assertManager($request->user());
        $before = DB::table('app.user_profiles')->where('user_id', $userId)->first();
        $input = $request->validate(['canCreateWorkspaces' => ['sometimes', 'boolean'], 'canManageUsers' => ['sometimes', 'boolean']]);
        $target = $this->users->permissions($userId, $input['canCreateWorkspaces'] ?? false, $input['canManageUsers'] ?? false);
        $this->auditUser($request, 'user.update', $target, ['Can create workspaces' => ['before' => $before?->can_create_workspaces, 'after' => $target->can_create_workspaces], 'Can manage users' => ['before' => $before?->can_manage_users, 'after' => $target->can_manage_users]]);
        return response()->json(['data' => $target]);
    }

    public function destroy(Request $request, string $userId): JsonResponse
    {
        $this->users->assertManager($request->user());
        $target = DB::table('app.user_profiles')->where('user_id', $userId)->first();
        $this->users->disable($request->user(), $userId);
        if ($target) $this->auditUser($request, 'user.disable', $target);
        return response()->json(null, 204);
    }

    public function changePassword(Request $request): JsonResponse
    {
        $input = $request->validate(['currentPassword' => ['required', 'string'], 'newPassword' => ['required', 'string', 'min:8']]);
        $this->auth->changePassword($request->user(), $input['currentPassword'], $input['newPassword']);
        $target = DB::table('app.user_profiles')->where('user_id', $request->user()->getKey())->first();
        if ($target) $this->auditUser($request, 'user.password_change', $target);
        return response()->json(['data' => ['status' => true]]);
    }

    public function resetPassword(Request $request, string $userId): JsonResponse
    {
        $this->users->assertManager($request->user());
        $target = DB::table('app.user_profiles')->where('user_id', $userId)->first();
        $input = $request->validate(['adminPassword' => ['required', 'string'], 'newPassword' => ['required', 'string', 'min:8']]);
        $this->users->resetPassword($request->user(), $userId, $input['adminPassword'], $input['newPassword']);
        if ($target) $this->auditUser($request, 'user.password_reset', $target);
        return response()->json(['data' => ['status' => true]]);
    }
    private function auditUser(Request $request, string $action, object $target, array $diff = []): void { $this->audit->write($request, $request->user(), null, $action, 'user', $target->user_id, ['name' => $target->display_name, 'handle' => (string) $target->handle, 'targetUserId' => $target->user_id], $diff); }

}
