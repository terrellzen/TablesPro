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
    private const HIGHER_ROLES = ['owner' => 4, 'admin' => 3, 'creator' => 2, 'member' => 1];

    public function __construct(private readonly MemberService $members) {}

    public function assertCanManageUsers(User $actor): void
    {
        $profile = $this->profileRow($actor->getKey());
        if (! $profile || ! in_array($profile->role, ['owner', 'admin'], true) || $profile->disabled_at) {
            throw ApiException::forbidden('You do not have permission to manage users');
        }
    }

    public function assertCanCreateWorkspaces(User $actor): void
    {
        $profile = $this->profileRow($actor->getKey());
        if (! $profile || ! in_array($profile->role, ['owner', 'admin', 'creator'], true) || $profile->disabled_at) {
            throw ApiException::forbidden('You do not have permission to create workspaces');
        }
    }

    public function create(array $input, User $actor): object
    {
        $handle = $this->handle($input['handle']);
        $actorProfile = $this->profileRow($actor->getKey());
        $requestedRole = $input['role'] ?? 'member';
        $this->assertRoleAssignable($actorProfile, $requestedRole);

        return DB::transaction(function () use ($input, $handle, $requestedRole): object {
            if (User::query()->whereRaw('lower(email)=lower(?)', [$input['email']])->exists()) {
                throw ApiException::conflict('A user with this email already exists');
            }
            if (DB::table('app.user_profiles')->whereRaw('handle=?::citext', [$handle])->exists()) {
                throw ApiException::conflict('This handle is already taken by another user');
            }
            $id = (string) Str::ulid();
            User::query()->create([
                'id' => $id, 'name' => trim($input['displayName']),
                'email' => trim($input['email']), 'emailVerified' => false,
                'createdAt' => now(), 'updatedAt' => now(),
            ]);
            AuthAccount::query()->create([
                'id' => (string) Str::ulid(), 'accountId' => $id, 'providerId' => 'email',
                'userId' => $id, 'password' => Hash::make($input['password']),
                'createdAt' => now(), 'updatedAt' => now(),
            ]);
            DB::table('app.user_profiles')->insert([
                'user_id' => $id, 'handle' => $handle,
                'display_name' => trim($input['displayName']),
                'role' => $requestedRole,
            ]);
            return DB::table('app.user_profiles')->where('user_id', $id)->first();
        });
    }

    public function profile(User $user, string $handle, string $displayName): object
    {
        $handle = $this->handle($handle);
        if (DB::table('app.user_profiles')->whereRaw('handle=?::citext', [$handle])->where('user_id', '<>', $user->getKey())->exists()) {
            throw ApiException::conflict('This handle is already taken by another user');
        }
        $first = DB::table('app.user_profiles')->count() === 0;
        DB::statement(
            'INSERT INTO app.user_profiles (user_id, handle, display_name, role) VALUES (?, ?::citext, ?, ?) ON CONFLICT (user_id) DO UPDATE SET handle=EXCLUDED.handle, display_name=EXCLUDED.display_name, updated_at=now()',
            [$user->getKey(), $handle, trim($displayName), $first ? 'owner' : 'member']
        );
        return DB::table('app.user_profiles')->where('user_id', $user->getKey())->first();
    }

    public function changeRole(User $actor, string $userId, string $newRole): object
    {
        $actorProfile = $this->profileRow($actor->getKey());
        $targetProfile = $this->profileRow($userId);
        if (! $targetProfile) throw ApiException::notFound('User was not found');

        $this->assertRoleAssignable($actorProfile, $newRole, $targetProfile);

        DB::table('app.user_profiles')->where('user_id', $userId)->update(['role' => $newRole, 'updated_at' => now()]);
        return DB::table('app.user_profiles')->where('user_id', $userId)->first();
    }

    public function disable(User $actor, string $userId): void
    {
        if ($actor->getKey() === $userId) throw ApiException::forbidden('Users cannot disable themselves');
        $actorProfile = $this->profileRow($actor->getKey());
        $targetProfile = $this->profileRow($userId);
        if (! $targetProfile) throw ApiException::notFound('User was not found');

        if (in_array($targetProfile->role, ['owner', 'admin'], true) && ! $actorProfile?->is_owner) {
            throw ApiException::forbidden('Only the Owner can disable an Admin or Owner');
        }

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
        if (! AuthAccount::query()->where('userId', $userId)->where('providerId', 'email')->update(['password' => Hash::make($newPassword), 'updatedAt' => now()])) {
            throw ApiException::notFound('User was not found');
        }
    }

    private function assertRoleAssignable(?object $actorProfile, string $newRole, ?object $targetProfile = null): void
    {
        if (! $actorProfile) throw ApiException::forbidden('No profile found');
        $actorRole = $actorProfile->role;
        $actorLevel = self::HIGHER_ROLES[$actorRole] ?? 0;
        $targetLevel = self::HIGHER_ROLES[$newRole] ?? 0;

        if ($actorRole !== 'owner' && in_array($newRole, ['owner', 'admin'], true)) {
            throw ApiException::forbidden('Only the Owner can assign Owner or Admin roles');
        }
        if ($actorRole === 'admin' && $targetProfile && in_array($targetProfile->role, ['owner', 'admin'], true) && $actor->getKey() !== $targetProfile->user_id) {
            throw ApiException::forbidden('Admins cannot modify other Admins or the Owner');
        }
    }

    private function profileRow(string $userId): ?object
    {
        return DB::table('app.user_profiles')->where('user_id', $userId)->first();
    }

    private function handle(string $value): string
    {
        $handle = strtolower(ltrim(trim($value), '@'));
        if (! preg_match('/^[a-z0-9][a-z0-9_-]{2,31}$/', $handle)) {
            throw new ApiException(400, 'VALIDATION_ERROR', 'User id must be 3-32 letters, numbers, underscores, or dashes');
        }
        return $handle;
    }
}
