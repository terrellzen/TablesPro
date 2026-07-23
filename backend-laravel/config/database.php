<?php

return [
    'default' => env('DB_CONNECTION', 'pgsql'),
    'connections' => [
        'pgsql' => [
            'driver' => 'pgsql',
            'url' => env('DATABASE_URL'),
            'host' => env('DB_HOST', '127.0.0.1'),
            'port' => env('DB_PORT', '5432'),
            'database' => env('DB_DATABASE', 'tablespro'),
            'username' => env('DB_USERNAME', 'tablespro'),
            'password' => env('DB_PASSWORD', ''),
            'charset' => 'utf8',
            'prefix' => '',
            'search_path' => 'public,app,auth,app_data',
            'sslmode' => env('DB_SSLMODE', 'prefer'),
        ],
    ],
    'migrations' => ['table' => 'migrations'],
];
