<?php

namespace App\Http\Controllers;

use App\Http\Resources\UserProfileResource;
use App\Services\Auth\AuthenticationService;
use App\Services\UserService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

final class UserController
{
    public function __construct(private readonly UserService $users, private readonly AuthenticationService $auth) {}

    public function index(Request $request): JsonResponse
    {
        $profiles = DB::table('app.user_profiles')->whereNull('disabled_at')->orderBy('handle')->get(['user_id', DB::raw('handle::text'), 'display_name', 'can_create_workspaces', 'can_manage_users', 'disabled_at']);

        return response()->json(['data' => UserProfileResource::collection($profiles)->resolve()]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->users->assertManager($request->user());
        $input = $request->validate(['email' => ['required', 'email', 'max:320'], 'password' => ['required', 'string', 'min:8'], 'handle' => ['required', 'string'], 'displayName' => ['required', 'string', 'max:255'], 'canCreateWorkspaces' => ['sometimes', 'boolean'], 'canManageUsers' => ['sometimes', 'boolean']]);
        return response()->json(['data' => $this->users->create($input)]);
    }

    public function profile(Request $request): JsonResponse
    {
        $input = $request->validate(['handle' => ['required', 'string'], 'displayName' => ['required', 'string', 'max:255']]);
        return response()->json(['data' => $this->users->profile($request->user(), $input['handle'], $input['displayName'])]);
    }

    public function permissions(Request $request, string $userId): JsonResponse
    {
        $this->users->assertManager($request->user());
        $input = $request->validate(['canCreateWorkspaces' => ['sometimes', 'boolean'], 'canManageUsers' => ['sometimes', 'boolean']]);
        return response()->json(['data' => $this->users->permissions($userId, $input['canCreateWorkspaces'] ?? false, $input['canManageUsers'] ?? false)]);
    }

    public function destroy(Request $request, string $userId): JsonResponse
    {
        $this->users->assertManager($request->user()); $this->users->disable($request->user(), $userId);
        return response()->json(null, 204);
    }

    public function changePassword(Request $request): JsonResponse
    {
        $input = $request->validate(['currentPassword' => ['required', 'string'], 'newPassword' => ['required', 'string', 'min:8']]);
        $this->auth->changePassword($request->user(), $input['currentPassword'], $input['newPassword']);
        return response()->json(['data' => ['status' => true]]);
    }

    public function resetPassword(Request $request, string $userId): JsonResponse
    {
        $this->users->assertManager($request->user());
        $input = $request->validate(['adminPassword' => ['required', 'string'], 'newPassword' => ['required', 'string', 'min:8']]);
        $this->users->resetPassword($request->user(), $userId, $input['adminPassword'], $input['newPassword']);
        return response()->json(['data' => ['status' => true]]);
    }
}
