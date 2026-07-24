<?php

namespace App\Http\Controllers;

use App\Exceptions\ApiException;
use App\Services\AuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

final class AdminController
{
    public function stats(Request $request): JsonResponse
    {
        $this->admin($request);
        $name = DB::selectOne('SELECT current_database() AS name')->name;
        $size = DB::selectOne('SELECT pg_database_size(current_database())::text AS size_bytes')->size_bytes;
        $count = DB::table('app.tables as t')->join('app.bases as b', 'b.base_id', '=', 't.base_id')->join('app.workspaces as w', 'w.workspace_id', '=', 'b.workspace_id')->whereNull('w.deleted_at')->count();
        $tables = DB::select("SELECT stats.relname AS physical_name, tables.name AS table_name, bases.name AS base_name, workspaces.name AS workspace_name, stats.n_live_tup AS count FROM pg_stat_user_tables stats LEFT JOIN app.tables tables ON tables.physical_table_name::text = stats.relname LEFT JOIN app.bases bases ON bases.base_id = tables.base_id LEFT JOIN app.workspaces workspaces ON workspaces.workspace_id = bases.workspace_id WHERE stats.schemaname='app_data' AND workspaces.deleted_at IS NULL ORDER BY stats.n_live_tup DESC");
        return response()->json(['database' => ['name' => $name, 'sizeBytes' => (int) $size, 'tableCount' => $count, 'tables' => collect($tables)->map(fn ($row) => ['physicalName' => $row->physical_name, 'tableName' => $row->table_name ?? $row->physical_name, 'baseName' => $row->base_name, 'workspaceName' => $row->workspace_name, 'rowCount' => (int) $row->count])]]);
    }

    public function workspaces(Request $request): JsonResponse
    {
        $this->admin($request);
        $rows = DB::select('SELECT w.workspace_id, w.name, w.created_at, (SELECT count(*) FROM app.workspace_members m WHERE m.workspace_id=w.workspace_id)::int AS member_count FROM app.workspaces w WHERE w.deleted_at IS NULL ORDER BY w.name');

        return response()->json(['data' => $rows]);
    }

    public function bases(Request $request, string $workspaceId): JsonResponse
    {
        $this->admin($request);

        return response()->json(['data' => DB::table('app.bases')->where('workspace_id', $workspaceId)->whereNull('deleted_at')->orderBy('name')->get(['base_id', 'name'])]);
    }

    public function tables(Request $request, string $workspaceId): JsonResponse
    {
        $this->admin($request);
        $query = DB::table('app.tables as t')->join('app.bases as b', 'b.base_id', '=', 't.base_id')->where('b.workspace_id', $workspaceId)->whereNull('t.deleted_at')->whereNull('b.deleted_at');
        if ($request->filled('baseId')) {
            $query->where('t.base_id', $request->validate(['baseId' => ['uuid']])['baseId']);
        }

        return response()->json(['data' => $query->orderBy('t.name')->get(['t.table_id', 't.name'])]);
    }

    public function audit(Request $request): JsonResponse
    {
        $this->admin($request);
        $input = $request->validate(['scope' => ['sometimes', 'in:company,workspace'], 'workspaceId' => ['sometimes', 'uuid'], 'baseId' => ['sometimes', 'uuid'], 'tableId' => ['sometimes', 'uuid'], 'actorUserId' => ['sometimes', 'string'], 'limit' => ['sometimes', 'integer', 'min:1'], 'cursor' => ['sometimes', 'string']]);
        $limit = min((int) ($input['limit'] ?? 100), 250);
        $query = DB::table('app.audit_events as ae')->leftJoin('app.workspaces as w', 'w.workspace_id', '=', 'ae.workspace_id')
            ->leftJoin('app.user_profiles as up', 'up.user_id', '=', 'ae.actor_user_id')
            ->leftJoin('app.tables as t', DB::raw("t.table_id"), '=', DB::raw("COALESCE(NULLIF(ae.metadata->>'tableId', '')::uuid, CASE WHEN ae.entity_type = 'table' THEN ae.entity_id::uuid END)"))
            ->leftJoin('app.bases as b', DB::raw("b.base_id"), '=', DB::raw("COALESCE(t.base_id, CASE WHEN ae.entity_type = 'base' THEN ae.entity_id::uuid END)"));
        if (($input['scope'] ?? null) === 'company') $query->whereNull('ae.workspace_id');
        if (($input['scope'] ?? null) === 'workspace') $query->whereNotNull('ae.workspace_id');
        if (isset($input['workspaceId'])) $query->where('ae.workspace_id', $input['workspaceId']);
        if (isset($input['baseId'])) $query->where('t.base_id', $input['baseId']);
        if (isset($input['tableId'])) $query->whereRaw("ae.metadata->>'tableId' = ?", [$input['tableId']]);
        if (isset($input['actorUserId'])) $query->where('ae.actor_user_id', $input['actorUserId']);
        if (isset($input['cursor'])) {
            $cursor = json_decode(base64_decode($input['cursor']), true);
            $query->whereRaw('(ae.occurred_at, ae.event_id) < (?::timestamptz, ?::uuid)', [$cursor['t'], $cursor['e']]);
        }
        $rows = $query->orderByDesc('ae.occurred_at')->orderByDesc('ae.event_id')->limit($limit + 1)->get(['ae.*', DB::raw("COALESCE(w.name, ae.metadata->>'workspaceName') AS workspace_name"), 'b.base_id', 'b.name as base_name', 't.table_id', 't.name as table_name', DB::raw('COALESCE(up.display_name, up.handle::text, ae.actor_user_id) AS actor_name'), DB::raw('up.handle::text AS actor_handle')])->map(fn (object $row): object => AuditService::forResponse($row));
        $hasMore = $rows->count() > $limit;
        $rows = $rows->take($limit);
        $nextCursor = $hasMore && $rows->isNotEmpty() ? base64_encode(json_encode(['t' => $rows->last()->occurred_at, 'e' => $rows->last()->event_id])) : null;
        return response()->json(['data' => $rows, 'page' => ['nextCursor' => $nextCursor, 'hasMore' => $hasMore]]);
    }

    private function admin(Request $request): void
    {
        $profile = DB::table('app.user_profiles')->where('user_id', $request->user()->getKey())->first();
        if (! in_array($profile?->role, ['owner', 'admin'], true) || $profile->disabled_at) {
            throw ApiException::forbidden('Admin access required');
        }
    }
}
