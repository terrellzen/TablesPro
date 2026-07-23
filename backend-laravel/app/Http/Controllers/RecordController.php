<?php

namespace App\Http\Controllers;

use App\Http\Requests\RecordIndexRequest;
use App\Http\Requests\RecordWriteRequest;
use App\Services\AuditService;
use App\Services\Authorization\PermissionService;
use App\Services\Records\RecordService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class RecordController
{
    public function __construct(private readonly PermissionService $permissions, private readonly RecordService $records, private readonly AuditService $audit) {}

    public function index(RecordIndexRequest $request, string $tableId): JsonResponse
    {
        $this->permissions->table($request->user(), $tableId, 'record:read');

        return response()->json($this->records->list($tableId, $request->validated()));
    }

    public function store(RecordWriteRequest $request, string $tableId): JsonResponse
    {
        $scope = $this->permissions->table($request->user(), $tableId, 'record:create');
        $record = $this->records->create($tableId, $request->validated('values'), $request->user()->getKey());
        $this->audit->write($request, $request->user(), $scope['workspaceId'], 'record.create', 'record', $record->record_id, ['tableId' => $tableId, 'fieldIds' => array_keys($request->validated('values'))]);

        return response()->json(['data' => $record], 201);
    }

    public function update(RecordWriteRequest $request, string $tableId, string $recordId): JsonResponse
    {
        $scope = $this->permissions->table($request->user(), $tableId, 'record:update');
        $result = $this->records->update($tableId, $recordId, $request->validated('values'), $request->integer('rowVersion'), $request->user()->getKey());
        $this->audit->write(
            $request,
            $request->user(),
            $scope['workspaceId'],
            'record.update',
            'record',
            $recordId,
            ['tableId' => $tableId, 'fieldIds' => array_keys($request->validated('values'))],
            $result['diff'],
        );

        return response()->json(['data' => $result['record']]);
    }

    public function destroy(Request $request, string $tableId, string $recordId): JsonResponse
    {
        $scope = $this->permissions->table($request->user(), $tableId, 'record:delete');
        $this->records->delete($tableId, $recordId, $request->user()->getKey());
        $this->audit->write($request, $request->user(), $scope['workspaceId'], 'record.delete', 'record', $recordId, ['tableId' => $tableId]);

        return response()->json(null, 204);
    }
}
