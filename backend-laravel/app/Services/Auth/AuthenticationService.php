<?php

namespace App\Services\Auth;

use App\Exceptions\ApiException;
use App\Models\AuthAccount;
use App\Models\User;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

final class AuthenticationService
{
    public function signIn(Request $request, string $email, string $password): array
    {
        $user = User::query()->with('account')->whereRaw('lower(email) = lower(?)', [$email])->first();
        if (! $user || ! Hash::check($password, $user->getAuthPassword())) {
            throw new ApiException(401, 'UNAUTHORIZED', 'Invalid email or password');
        }
        if ($user->profile?->disabled_at) {
            throw ApiException::forbidden('This account is disabled');
        }
        Auth::login($user);
        $request->session()->regenerate();

        return ['user' => $this->userPayload($user)];
    }

    public function signUp(Request $request, string $name, string $email, string $password): array
    {
        if (! config('app.signup_enabled')) {
            throw ApiException::forbidden('Account signup is disabled on this server');
        }

        $user = DB::transaction(function () use ($name, $email, $password): User {
            if (User::query()->whereRaw('lower(email) = lower(?)', [$email])->exists()) {
                throw ApiException::conflict('A user with this email already exists');
            }
            $user = User::query()->create([
                'id' => (string) Str::ulid(), 'name' => $name, 'email' => $email,
                'emailVerified' => false, 'createdAt' => now(), 'updatedAt' => now(),
            ]);
            AuthAccount::query()->create([
                'id' => (string) Str::ulid(), 'accountId' => $user->id, 'providerId' => 'email',
                'userId' => $user->id, 'password' => Hash::make($password), 'createdAt' => now(), 'updatedAt' => now(),
            ]);

            return $user;
        });
        Auth::login($user);
        $request->session()->regenerate();

        return ['user' => $this->userPayload($user)];
    }

    public function signOut(Request $request): void
    {
        Auth::logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();
    }

    public function changePassword(User $user, string $current, string $new): void
    {
        $account = $user->account;
        if (! $account || ! Hash::check($current, (string) $account->password)) {
            throw new AuthenticationException('Current password is incorrect');
        }
        $account->update(['password' => Hash::make($new), 'updatedAt' => now()]);
    }

    public function userPayload(User $user): array
    {
        return ['id' => $user->id, 'name' => $user->name, 'email' => $user->email, 'emailVerified' => $user->emailVerified, 'image' => $user->image];
    }
}
