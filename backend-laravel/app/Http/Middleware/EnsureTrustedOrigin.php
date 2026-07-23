<?php

namespace App\Http\Middleware;

use App\Exceptions\ApiException;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final class EnsureTrustedOrigin
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! $request->isMethodSafe()) {
            $origin = $request->header('Origin');
            $allowed = array_map(
                fn (string $value): string => rtrim(trim($value), '/'),
                config('tablespro.web_origins'),
            );
            if ($origin !== null && ! in_array(rtrim($origin, '/'), $allowed, true)) {
                throw ApiException::forbidden('Request origin is not trusted');
            }
        }

        return $next($request);
    }
}
