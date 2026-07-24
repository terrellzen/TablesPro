<?php

namespace App\Http\Controllers;

use App\Services\AuditService;
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
        $rows = DB::table('app.audit_events as ae')
            ->join('app.workspaces as w', 'w.workspace_id', '=', 'ae.workspace_id')
            ->leftJoin('app.user_profiles as up', 'up.user_id', '=', 'ae.actor_user_id')
            ->leftJoin('app.tables as t', DB::raw("t.table_id"), '=', DB::raw("COALESCE(NULLIF(ae.metadata->>'tableId', '')::uuid, CASE WHEN ae.entity_type = 'table' THEN ae.entity_id::uuid END)"))
            ->leftJoin('app.bases as b', DB::raw("b.base_id"), '=', DB::raw("COALESCE(t.base_id, CASE WHEN ae.entity_type = 'base' THEN ae.entity_id::uuid END)"))
            ->where('ae.workspace_id', $workspaceId)
            ->orderByDesc('ae.occurred_at')->orderByDesc('ae.event_id')->limit($limit)
            ->get(['ae.*', 'w.name as workspace_name', 'b.base_id', 'b.name as base_name', 't.table_id', 't.name as table_name', DB::raw('COALESCE(up.display_name, up.handle::text, ae.actor_user_id) AS actor_name'), DB::raw('up.handle::text AS actor_handle')])->map(fn (object $row): object => AuditService::forResponse($row));
        return response()->json(['data' => $rows, 'page' => ['nextCursor' => null, 'previousCursor' => null, 'hasMore' => $rows->count() === $limit, 'requestedLimit' => $limit]]);
    }
}
