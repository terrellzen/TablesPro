<?php

use App\Http\Controllers\AdminController;
use App\Http\Controllers\AuditController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\BaseController;
use App\Http\Controllers\DuplicateController;
use App\Http\Controllers\FieldController;
use App\Http\Controllers\FieldGroupController;
use App\Http\Controllers\FieldOptionController;
use App\Http\Controllers\JobController;
use App\Http\Controllers\MemberController;
use App\Http\Controllers\RecordController;
use App\Http\Controllers\SystemController;
use App\Http\Controllers\TableController;
use App\Http\Controllers\UserController;
use App\Http\Controllers\ViewController;
use App\Http\Controllers\WorkspaceController;
use Illuminate\Support\Facades\Route;

Route::get('/config', [SystemController::class, 'config']);
Route::get('/me', [SystemController::class, 'me']);
Route::post('/auth/sign-in/email', [AuthController::class, 'signIn'])->name('auth.signin');
Route::post('/auth/sign-up/email', [AuthController::class, 'signUp'])->name('auth.signup');
Route::post('/auth/sign-out', [AuthController::class, 'signOut']);

Route::middleware('auth:web')->group(function (): void {
    Route::get('/users', [UserController::class, 'index']);
    Route::post('/users', [UserController::class, 'store']);
    Route::put('/me/profile', [UserController::class, 'profile']);
    Route::post('/me/change-password', [UserController::class, 'changePassword']);
    Route::patch('/users/{userId}/permissions', [UserController::class, 'permissions']);
    Route::delete('/users/{userId}', [UserController::class, 'destroy']);
    Route::post('/users/{userId}/password', [UserController::class, 'resetPassword']);

    Route::get('/workspaces', [WorkspaceController::class, 'index']);
    Route::post('/workspaces', [WorkspaceController::class, 'store']);
    Route::get('/workspaces/{workspaceId}', [WorkspaceController::class, 'show'])->whereUuid('workspaceId');
    Route::patch('/workspaces/{workspaceId}', [WorkspaceController::class, 'update'])->whereUuid('workspaceId');
    Route::delete('/workspaces/{workspaceId}', [WorkspaceController::class, 'destroy'])->whereUuid('workspaceId');
    Route::post('/workspaces/{workspaceId}/duplicate', [DuplicateController::class, 'workspace'])->whereUuid('workspaceId');

    Route::get('/workspaces/{workspaceId}/bases', [BaseController::class, 'index'])->whereUuid('workspaceId');
    Route::post('/workspaces/{workspaceId}/bases', [BaseController::class, 'store'])->whereUuid('workspaceId');
    Route::get('/bases/{baseId}', [BaseController::class, 'show'])->whereUuid('baseId');
    Route::patch('/bases/{baseId}', [BaseController::class, 'update'])->whereUuid('baseId');
    Route::delete('/workspaces/{workspaceId}/bases/{baseId}', [BaseController::class, 'destroy'])->whereUuid(['workspaceId', 'baseId']);
    Route::post('/bases/{baseId}/duplicate', [DuplicateController::class, 'base'])->whereUuid('baseId');

    Route::get('/bases/{baseId}/tables', [TableController::class, 'index'])->whereUuid('baseId');
    Route::post('/bases/{baseId}/tables', [TableController::class, 'store'])->whereUuid('baseId');
    Route::patch('/tables/{tableId}', [TableController::class, 'update'])->whereUuid('tableId');
    Route::delete('/bases/{baseId}/tables/{tableId}', [TableController::class, 'destroy'])->whereUuid(['baseId', 'tableId']);
    Route::post('/tables/{tableId}/duplicate', [DuplicateController::class, 'table'])->whereUuid('tableId');

    Route::get('/tables/{tableId}/fields', [FieldController::class, 'index'])->whereUuid('tableId');
    Route::post('/tables/{tableId}/fields', [FieldController::class, 'store'])->whereUuid('tableId');
    Route::patch('/tables/{tableId}/fields/{fieldId}', [FieldController::class, 'update'])->whereUuid(['tableId', 'fieldId']);
    Route::delete('/tables/{tableId}/fields/{fieldId}', [FieldController::class, 'destroy'])->whereUuid(['tableId', 'fieldId']);
    Route::post('/tables/{tableId}/fields/reorder', [FieldController::class, 'reorder'])->whereUuid('tableId');
    Route::get('/tables/{tableId}/fields/{fieldId}/dropdown-options', [FieldOptionController::class, 'index'])->whereUuid(['tableId', 'fieldId']);
    Route::patch('/tables/{tableId}/fields/{fieldId}/dropdown-colors', [FieldOptionController::class, 'update'])->whereUuid(['tableId', 'fieldId']);

    Route::get('/tables/{tableId}/field-groups', [FieldGroupController::class, 'index'])->whereUuid('tableId');
    Route::post('/tables/{tableId}/field-groups', [FieldGroupController::class, 'store'])->whereUuid('tableId');
    Route::get('/tables/{tableId}/views', [ViewController::class, 'index'])->whereUuid('tableId');
    Route::post('/tables/{tableId}/views', [ViewController::class, 'store'])->whereUuid('tableId');
    Route::delete('/tables/{tableId}/views/{viewId}', [ViewController::class, 'destroy'])->whereUuid(['tableId', 'viewId']);

    Route::get('/tables/{tableId}/records', [RecordController::class, 'index'])->whereUuid('tableId');
    Route::post('/tables/{tableId}/records', [RecordController::class, 'store'])->whereUuid('tableId');
    Route::patch('/tables/{tableId}/records/{recordId}', [RecordController::class, 'update'])->whereUuid(['tableId', 'recordId']);
    Route::delete('/tables/{tableId}/records/{recordId}', [RecordController::class, 'destroy'])->whereUuid(['tableId', 'recordId']);
    Route::post('/tables/{tableId}/import-jobs', [JobController::class, 'import'])->whereUuid('tableId');
    Route::post('/tables/{tableId}/export-jobs', [JobController::class, 'export'])->whereUuid('tableId');

    Route::get('/workspaces/{workspaceId}/permission-resources', [MemberController::class, 'resources'])->whereUuid('workspaceId');
    Route::get('/workspaces/{workspaceId}/members', [MemberController::class, 'index'])->whereUuid('workspaceId');
    Route::post('/workspaces/{workspaceId}/members', [MemberController::class, 'store'])->whereUuid('workspaceId');
    Route::patch('/workspaces/{workspaceId}/members/{userId}', [MemberController::class, 'update'])->whereUuid('workspaceId');
    Route::delete('/workspaces/{workspaceId}/members/{userId}', [MemberController::class, 'destroy'])->whereUuid('workspaceId');
    Route::get('/workspaces/{workspaceId}/audit-events', [AuditController::class, 'index'])->whereUuid('workspaceId');

    Route::get('/admin/stats', [AdminController::class, 'stats']);
    Route::get('/admin/workspaces', [AdminController::class, 'workspaces']);
    Route::get('/admin/workspaces/{workspaceId}/bases', [AdminController::class, 'bases'])->whereUuid('workspaceId');
    Route::get('/admin/workspaces/{workspaceId}/tables', [AdminController::class, 'tables'])->whereUuid('workspaceId');
    Route::get('/admin/audit-events', [AdminController::class, 'audit']);
});
