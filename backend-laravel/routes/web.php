<?php

use App\Http\Controllers\SystemController;
use Illuminate\Support\Facades\Route;

Route::get('/health', [SystemController::class, 'health']);
Route::get('/ready', [SystemController::class, 'ready']);
