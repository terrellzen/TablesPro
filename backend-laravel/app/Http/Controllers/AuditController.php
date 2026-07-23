<?php

namespace App\Http\Controllers;

use App\Services\Authorization\PermissionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

final class AuditController
{
    public function __construct(private readonly PermissionService $permissions) {}

    public function index(Request $request, string $workspaceId): JsonResponse
    {
        $this->permissions->workspace($request->user(), $workspaceId, 'audit:read');
        $limit = min(max($request->integer('limit', 100), 1), 250);
        $rows = DB::table('app.audit_events')->where('workspace_id', $workspaceId)->orderByDesc('occurred_at')->orderByDesc('event_id')->limit($limit)->get([
            'event_id', 'workspace_id', 'actor_user_id', 'action', 'entity_type', 'entity_id', 'occurred_at', 'request_id', 'job_id', 'outcome', 'diff', 'metadata',
        ]);
        return response()->json(['data' => $rows, 'page' => ['nextCursor' => null, 'previousCursor' => null, 'hasMore' => $rows->count() === $limit, 'requestedLimit' => $limit]]);
    }
}
