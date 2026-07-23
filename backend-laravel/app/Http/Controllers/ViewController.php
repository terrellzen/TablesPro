<?php

namespace App\Http\Controllers;

use App\Exceptions\ApiException;
use App\Services\AuditService;
use App\Services\Authorization\PermissionService;
use App\Services\PostgresArray;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final class ViewController
{
    public function __construct(private readonly PermissionService $permissions, private readonly AuditService $audit) {}

    public function index(Request $request, string $tableId): JsonResponse
    {
        $this->permissions->table($request->user(), $tableId, 'view:read');
        $views = DB::table('app.saved_views')->where('table_id', $tableId)->where(fn ($query) => $query->where('is_shared', true)->orWhere('owner_user_id', $request->user()->getKey()))
            ->orderByDesc('updated_at')->orderByDesc('saved_view_id')->get();
        $ids = $views->pluck('saved_view_id');
        $filters = $ids->isEmpty() ? collect() : DB::table('app.saved_view_filters')->whereIn('saved_view_id', $ids)->get()->groupBy('saved_view_id');
        $sorts = $ids->isEmpty() ? collect() : DB::table('app.saved_view_sorts')->whereIn('saved_view_id', $ids)->orderBy('position')->get()->groupBy('saved_view_id');
        $data = $views->map(function (object $view) use ($filters, $sorts): array {
            $row = (array) $view;
            foreach (['visible_field_ids', 'field_order', 'frozen_field_ids', 'collapsed_field_group_ids'] as $column) {
                $row[$column] = PostgresArray::decode($row[$column]);
            }
            $row['field_widths'] = is_string($row['field_widths']) ? json_decode($row['field_widths'], true) : $row['field_widths'];
            $row['filters'] = collect($filters->get($view->saved_view_id, []))->map(fn ($item) => json_decode($item->filter_ast, true))->values();
            $row['sorts'] = collect($sorts->get($view->saved_view_id, []))->map(fn ($item) => ['field_id' => $item->field_id, 'direction' => $item->direction])->values();
            return $row;
        });

        return response()->json(['data' => $data]);
    }

    public function store(Request $request, string $tableId): JsonResponse
    {
        $input = $request->validate([
            'name' => ['required', 'string', 'max:255'], 'isShared' => ['sometimes', 'boolean'], 'search' => ['nullable', 'string'],
            'visibleFieldIds' => ['sometimes', 'array'], 'visibleFieldIds.*' => ['uuid'], 'fieldOrder' => ['sometimes', 'array'], 'fieldOrder.*' => ['uuid'],
            'fieldWidths' => ['sometimes', 'array'], 'frozenFieldIds' => ['sometimes', 'array'], 'frozenFieldIds.*' => ['uuid'],
            'collapsedFieldGroupIds' => ['sometimes', 'array'], 'collapsedFieldGroupIds.*' => ['uuid'], 'density' => ['sometimes', 'in:compact,comfortable,spacious'],
            'filters' => ['sometimes', 'array'], 'sorts' => ['sometimes', 'array'], 'sorts.*.fieldId' => ['required', 'uuid'], 'sorts.*.direction' => ['required', 'in:asc,desc'],
        ]);
        $scope = $this->permissions->table($request->user(), $tableId, 'view:create');
        $id = (string) Str::uuid();
        DB::transaction(function () use ($input, $request, $tableId, $id): void {
            DB::insert('INSERT INTO app.saved_views (saved_view_id, table_id, owner_user_id, name, is_shared, search, visible_field_ids, field_order, field_widths, frozen_field_ids, collapsed_field_group_ids, density) VALUES (?, ?, ?, ?, ?, ?, ?::uuid[], ?::uuid[], ?::jsonb, ?::uuid[], ?::uuid[], ?)', [
                $id, $tableId, $request->user()->getKey(), trim($input['name']), $input['isShared'] ?? false, $input['search'] ?? null,
                $this->pgArray($input['visibleFieldIds'] ?? []), $this->pgArray($input['fieldOrder'] ?? []), json_encode($input['fieldWidths'] ?? new \stdClass, JSON_THROW_ON_ERROR),
                $this->pgArray($input['frozenFieldIds'] ?? []), $this->pgArray($input['collapsedFieldGroupIds'] ?? []), $input['density'] ?? 'comfortable',
            ]);
            foreach ($input['filters'] ?? [] as $filter) DB::table('app.saved_view_filters')->insert(['saved_view_filter_id' => (string) Str::uuid(), 'saved_view_id' => $id, 'filter_ast' => json_encode($filter, JSON_THROW_ON_ERROR)]);
            foreach ($input['sorts'] ?? [] as $position => $sort) DB::table('app.saved_view_sorts')->insert(['saved_view_sort_id' => (string) Str::uuid(), 'saved_view_id' => $id, 'field_id' => $sort['fieldId'], 'direction' => $sort['direction'], 'position' => $position]);
        });
        $view = DB::table('app.saved_views')->where('saved_view_id', $id)->first();
        $this->audit->write($request, $request->user(), $scope['workspaceId'], 'view.create', 'saved_view', $id, ['tableId' => $tableId, 'name' => $view->name, 'isShared' => $view->is_shared]);

        $output = (array) $view;
        foreach (['visible_field_ids', 'field_order', 'frozen_field_ids', 'collapsed_field_group_ids'] as $column) {
            $output[$column] = PostgresArray::decode($output[$column]);
        }
        $output['field_widths'] = is_string($output['field_widths']) ? json_decode($output['field_widths'], true) : $output['field_widths'];

        return response()->json(['data' => [...$output, 'filters' => $input['filters'] ?? [], 'sorts' => $input['sorts'] ?? []]], 201);
    }

    public function destroy(Request $request, string $tableId, string $viewId): JsonResponse
    {
        $scope = $this->permissions->table($request->user(), $tableId, 'view:delete');
        $view = DB::table('app.saved_views')->where('saved_view_id', $viewId)->where('table_id', $tableId)->first();
        if (! $view) throw ApiException::notFound('View not found');
        DB::table('app.saved_views')->where('saved_view_id', $viewId)->delete();
        $this->audit->write($request, $request->user(), $scope['workspaceId'], 'view.delete', 'saved_view', $viewId, ['tableId' => $tableId, 'name' => $view->name]);

        return response()->json(null, 204);
    }

    private function pgArray(array $values): string
    {
        return PostgresArray::encode($values);
    }
}
