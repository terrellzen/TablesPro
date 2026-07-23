<?php

namespace App\Services;

use App\Exceptions\ApiException;
use App\Models\AuthAccount;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

final class UserService
{
    public function __construct(private readonly MemberService $members) {}

    public function assertManager(User $actor): void
    {
        $profile = DB::table('app.user_profiles')->where('user_id', $actor->getKey())->first();
        if (! $profile?->can_manage_users || $profile->disabled_at) throw ApiException::forbidden('You do not have permission to manage users');
    }

    public function create(array $input): object
    {
        $handle = $this->handle($input['handle']);
        return DB::transaction(function () use ($input, $handle): object {
            if (User::query()->whereRaw('lower(email)=lower(?)', [$input['email']])->exists()) throw ApiException::conflict('A user with this email already exists');
            if (DB::table('app.user_profiles')->whereRaw('handle=?::citext', [$handle])->exists()) throw ApiException::conflict('This handle is already taken by another user');
            $id = (string) Str::ulid();
            User::query()->create(['id' => $id, 'name' => trim($input['displayName']), 'email' => trim($input['email']), 'emailVerified' => false, 'createdAt' => now(), 'updatedAt' => now()]);
            AuthAccount::query()->create(['id' => (string) Str::ulid(), 'accountId' => $id, 'providerId' => 'email', 'userId' => $id, 'password' => Hash::make($input['password']), 'createdAt' => now(), 'updatedAt' => now()]);
            DB::table('app.user_profiles')->insert(['user_id' => $id, 'handle' => $handle, 'display_name' => trim($input['displayName']), 'can_create_workspaces' => $input['canCreateWorkspaces'] ?? false, 'can_manage_users' => $input['canManageUsers'] ?? false]);
            return DB::table('app.user_profiles')->where('user_id', $id)->first();
        });
    }

    public function profile(User $user, string $handle, string $displayName): object
    {
        $handle = $this->handle($handle);
        if (DB::table('app.user_profiles')->whereRaw('handle=?::citext', [$handle])->where('user_id', '<>', $user->getKey())->exists()) throw ApiException::conflict('This handle is already taken by another user');
        $first = DB::table('app.user_profiles')->count() === 0;
        DB::statement('INSERT INTO app.user_profiles (user_id,handle,display_name,can_create_workspaces,can_manage_users) VALUES (?, ?::citext, ?, ?, ?) ON CONFLICT (user_id) DO UPDATE SET handle=EXCLUDED.handle,display_name=EXCLUDED.display_name,updated_at=now()', [$user->getKey(), $handle, trim($displayName), $first, $first]);
        return DB::table('app.user_profiles')->where('user_id', $user->getKey())->first();
    }

    public function permissions(string $userId, bool $create, bool $manage): object
    {
        $updated = DB::table('app.user_profiles')->where('user_id', $userId)->update(['can_create_workspaces' => $create, 'can_manage_users' => $manage, 'updated_at' => now()]);
        if (! $updated) throw ApiException::notFound('User was not found');
        return DB::table('app.user_profiles')->where('user_id', $userId)->first();
    }

    public function disable(User $actor, string $userId): void
    {
        if ($actor->getKey() === $userId) throw ApiException::forbidden('Users cannot disable themselves');
        DB::transaction(function () use ($userId): void {
            $this->members->assertUserCanBeDisabled($userId);
            DB::table('app.user_profiles')->where('user_id', $userId)->update(['disabled_at' => now(), 'updated_at' => now()]);
            DB::table('app.workspace_members')->where('user_id', $userId)->delete();
            DB::table('laravel_sessions')->where('user_id', $userId)->delete();
        });
    }

    public function resetPassword(User $actor, string $userId, string $adminPassword, string $newPassword): void
    {
        $account = $actor->account;
        if (! $account) throw new ApiException(400, 'VALIDATION_ERROR', 'No password set on your account');
        if (! Hash::check($adminPassword, $account->password)) throw ApiException::forbidden('Your password is incorrect');
        if (! AuthAccount::query()->where('userId', $userId)->where('providerId', 'email')->update(['password' => Hash::make($newPassword), 'updatedAt' => now()])) throw ApiException::notFound('User was not found');
    }

    private function handle(string $value): string
    {
        $handle = strtolower(ltrim(trim($value), '@'));
        if (! preg_match('/^[a-z0-9][a-z0-9_-]{2,31}$/', $handle)) throw new ApiException(400, 'VALIDATION_ERROR', 'User id must be 3-32 letters, numbers, underscores, or dashes');
        return $handle;
    }
}
