<?php

return [
    'web_origins' => array_map('trim', explode(',', env('WEB_ORIGIN', 'http://localhost:3000'))),
    'export_directory' => env('EXPORT_DIRECTORY'),
    'worker_id' => env('WORKER_ID'),
];
