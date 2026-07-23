<?php

return [
    'paths' => ['api/*', 'sanctum/csrf-cookie', 'health', 'ready'],
    'allowed_methods' => ['*'],
    'allowed_origins' => array_map('trim', explode(',', env('WEB_ORIGIN', 'http://localhost:3000'))),
    'allowed_headers' => ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Request-Id', 'Idempotency-Key'],
    'exposed_headers' => [],
    'max_age' => 86400,
    'supports_credentials' => true,
];
