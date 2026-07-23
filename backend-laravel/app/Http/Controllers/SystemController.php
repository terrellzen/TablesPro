<?php

namespace App\Http\Controllers;

use App\Services\Auth\AuthenticationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

final class SystemController
{
    public function health(): JsonResponse
    {
        return response()->json(['ok' => true]);
    }

    public function ready(): JsonResponse
    {
        $count = DB::table('migrations')->count();

        return response()->json(['ok' => true, 'database' => ['connected' => true, 'migrationsApplied' => $count]]);
    }

    public function config(): JsonResponse
    {
        return response()->json(['auth' => ['signUpEnabled' => config('app.signup_enabled')]]);
    }

    public function me(Request $request, AuthenticationService $auth): JsonResponse
    {
        $user = $request->user();
        $profile = $user ? DB::table('app.user_profiles')->where('user_id', $user->getKey())->first() : null;

        return response()->json(array_filter([
            'authenticated' => $user !== null,
            'user' => $user ? $auth->userPayload($user) : null,
            'session' => $user ? ['id' => $request->session()->getId()] : null,
            'profile' => $profile,
        ], fn (mixed $value, string $key): bool => $key === 'authenticated' || $value !== null, ARRAY_FILTER_USE_BOTH));
    }
}
