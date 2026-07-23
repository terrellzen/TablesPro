<?php

namespace App\Http\Controllers;

use App\Http\Requests\AuthRequest;
use App\Services\Auth\AuthenticationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class AuthController
{
    public function __construct(private readonly AuthenticationService $auth) {}

    public function signIn(AuthRequest $request): JsonResponse
    {
        return response()->json($this->auth->signIn($request, (string) $request->string('email'), (string) $request->string('password')));
    }

    public function signUp(AuthRequest $request): JsonResponse
    {
        return response()->json($this->auth->signUp($request, (string) $request->string('name'), (string) $request->string('email'), (string) $request->string('password')));
    }

    public function signOut(Request $request): JsonResponse
    {
        $this->auth->signOut($request);

        return response()->json(['success' => true]);
    }
}
