<?php

use App\Exceptions\ApiException;
use App\Http\Middleware\AddSecurityHeaders;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(web: __DIR__.'/../routes/web.php', api: __DIR__.'/../routes/api.php', health: null)
    ->withCommands()
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->statefulApi();
        $middleware->redirectGuestsTo(fn () => null);
        $middleware->validateCsrfTokens(except: ['api/*']);
        $middleware->api(append: [App\Http\Middleware\EnsureTrustedOrigin::class]);
        $middleware->append(AddSecurityHeaders::class);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(fn (Request $request): bool => true);
        $exceptions->render(function (Throwable $error, Request $request) {
            $requestId = (string) $request->attributes->get('request_id');
            if ($error instanceof ApiException) {
                return response()->json($error->payload($requestId), $error->status);
            }
            if ($error instanceof ValidationException) {
                return response()->json([
                    'code' => 'VALIDATION_ERROR',
                    'message' => $error->validator->errors()->first(),
                    'requestId' => $requestId,
                    'details' => $error->errors(),
                ], 400);
            }
            if ($error instanceof AuthenticationException) {
                return response()->json([
                    'code' => 'UNAUTHORIZED', 'message' => 'Unauthenticated.', 'requestId' => $requestId,
                ], 401);
            }
            if ($error instanceof HttpExceptionInterface) {
                return response()->json([
                    'code' => $error->getStatusCode() === 404 ? 'NOT_FOUND' : 'BAD_REQUEST',
                    'message' => $error->getMessage() ?: 'Request failed',
                    'requestId' => $requestId,
                ], $error->getStatusCode());
            }
            return response()->json([
                'code' => 'INTERNAL_ERROR', 'message' => 'Internal server error', 'requestId' => $requestId,
            ], 500);
        });
    })->create();
