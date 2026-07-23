<?php

namespace App\Http\Controllers;

use App\Exceptions\ApiException;
use App\Support\AuditEventSerializer;
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
        $count = DB::table('information_schema.tables')->where('table_schema', 'app_data')->count();
        $tables = DB::select("SELECT relname AS table_name, n_live_tup AS count FROM pg_stat_user_tables WHERE schemaname='app_data' ORDER BY n_live_tup DESC LIMIT 20");

        return response()->json(['database' => ['name' => $name, 'sizeBytes' => (int) $size, 'tableCount' => $count, 'tables' => collect($tables)->map(fn ($row) => ['name' => $row->table_name, 'rowCount' => (int) $row->count])]]);
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
        $input = $request->validate(['workspaceId' => ['sometimes', 'uuid'], 'baseId' => ['sometimes', 'uuid'], 'tableId' => ['sometimes', 'uuid'], 'limit' => ['sometimes', 'integer', 'min:1']]);
        $limit = min((int) ($input['limit'] ?? 100), 250);
        $query = DB::table('app.audit_events as ae')->join('app.workspaces as w', 'w.workspace_id', '=', 'ae.workspace_id')
            ->leftJoin('app.user_profiles as up', 'up.user_id', '=', 'ae.actor_user_id')
            ->leftJoin('app.tables as t', DB::raw('t.table_id::text'), '=', DB::raw("ae.metadata->>'tableId'"));
        if (isset($input['workspaceId'])) {
            $query->where('ae.workspace_id', $input['workspaceId']);
        }
        if (isset($input['baseId'])) {
            $query->where('t.base_id', $input['baseId']);
        }
        if (isset($input['tableId'])) {
            $query->whereRaw("ae.metadata->>'tableId' = ?", [$input['tableId']]);
        }
        $rows = $query->orderByDesc('ae.occurred_at')->orderByDesc('ae.event_id')->limit($limit)->get(['ae.*', 'w.name as workspace_name', DB::raw('COALESCE(up.display_name, up.handle::text, ae.actor_user_id) AS actor_name'), 't.name as table_name']);

        return response()->json([
            'data' => $rows->map(fn (object $row): array => AuditEventSerializer::fromRow($row)),
            'page' => ['nextCursor' => null, 'hasMore' => $rows->count() === $limit],
        ]);
    }

    private function admin(Request $request): void
    {
        $profile = DB::table('app.user_profiles')->where('user_id', $request->user()->getKey())->first();
        if (! $profile?->can_manage_users || $profile->disabled_at) {
            throw ApiException::forbidden('Admin access required');
        }
    }
}
