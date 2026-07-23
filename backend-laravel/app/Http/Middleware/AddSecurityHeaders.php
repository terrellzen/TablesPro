<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

final class AddSecurityHeaders
{
    public function handle(Request $request, Closure $next): Response
    {
        $requestId = $request->header('X-Request-Id', (string) Str::uuid());
        $request->attributes->set('request_id', $requestId);
        $response = $next($request);

        $response->headers->set('X-Request-Id', $requestId);
        $response->headers->set('X-Content-Type-Options', 'nosniff');
        $response->headers->set('X-Frame-Options', 'DENY');
        $response->headers->set('Referrer-Policy', 'strict-origin-when-cross-origin');
        $response->headers->set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
        $response->headers->set('Content-Security-Policy', "default-src 'self'; frame-ancestors 'none'");

        return $response;
    }
}
