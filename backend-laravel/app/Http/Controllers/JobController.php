<?php

namespace App\Http\Controllers;

use App\Services\AuditService;
use App\Services\Authorization\PermissionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final class JobController
{
    public function __construct(private readonly PermissionService $permissions, private readonly AuditService $audit) {}

    public function import(Request $request, string $tableId): JsonResponse
    {
        $input = $request->validate(['originalFilename' => ['sometimes', 'nullable', 'string']]);
        return $this->create($request, $tableId, 'import', 'imports', 'csv_import', 'app.import_jobs', ['originalFilename' => $input['originalFilename'] ?? null]);
    }

    public function export(Request $request, string $tableId): JsonResponse
    {
        $input = $request->validate(['savedViewId' => ['sometimes', 'nullable', 'uuid']]);
        return $this->create($request, $tableId, 'export', 'exports', 'csv_export', 'app.export_jobs', ['savedViewId' => $input['savedViewId'] ?? null]);
    }

    private function create(Request $request, string $tableId, string $type, string $queue, string $jobType, string $detailTable, array $metadata): JsonResponse
    {
        $scope = $this->permissions->table($request->user(), $tableId, "record:{$type}");
        $key = $request->header('Idempotency-Key', (string) Str::uuid());
        $jobId = DB::transaction(function () use ($tableId, $type, $queue, $jobType, $detailTable, $metadata, $key): string {
            $existing = DB::table('app.background_jobs')->where('queue', $queue)->where('idempotency_key', $key)->value('job_id');
            if ($existing) return $existing;
            $id = (string) Str::uuid();
            DB::table('app.background_jobs')->insert(['job_id' => $id, 'queue' => $queue, 'job_type' => $jobType, 'payload' => json_encode(['tableId' => $tableId, ...$metadata], JSON_THROW_ON_ERROR), 'idempotency_key' => $key]);
            DB::table($detailTable)->insert([$type.'_job_id' => (string) Str::uuid(), 'job_id' => $id, 'table_id' => $tableId]);
            return $id;
        });
        $this->audit->write($request, $request->user(), $scope['workspaceId'], "{$type}.create", "{$type}_job", $jobId, ['tableId' => $tableId, ...$metadata]);
        return response()->json(['data' => ['jobId' => $jobId, 'tableId' => $tableId, 'status' => 'queued']], 201);
    }
}
