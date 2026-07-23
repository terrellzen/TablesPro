<?php

namespace App\Services\Jobs;

use Illuminate\Support\Facades\DB;
use RuntimeException;
use Throwable;

final class DatabaseJobWorker
{
    public function __construct(
        private readonly CsvExportService $exports,
        private readonly JobRetryPolicy $retryPolicy,
    ) {}

    public function runOne(string $workerId): bool
    {
        $job = DB::selectOne(<<<'SQL'
            UPDATE app.background_jobs
            SET status='running', locked_at=now(), locked_by=?,
                visibility_timeout_at=now() + interval '5 minutes', updated_at=now()
            WHERE job_id = (
                SELECT job_id FROM app.background_jobs
                WHERE status='queued' AND run_at <= now()
                ORDER BY run_at, created_at FOR UPDATE SKIP LOCKED LIMIT 1
            )
            RETURNING job_id, job_type, payload, attempt, max_attempts
        SQL, [$workerId]);
        if (! $job) {
            return false;
        }

        try {
            $payload = is_string($job->payload) ? json_decode($job->payload, true, flags: JSON_THROW_ON_ERROR) : (array) $job->payload;
            switch ($job->job_type) {
                case 'csv_export':
                    $this->exports->process($job->job_id, $payload);
                    break;
                case 'csv_import':
                    throw new RuntimeException('CSV import worker is not implemented yet');
                default:
                    throw new RuntimeException("Unknown job type: {$job->job_type}");
            }
            DB::table('app.background_jobs')->where('job_id', $job->job_id)->update([
                'status' => 'succeeded', 'locked_at' => null, 'locked_by' => null,
                'visibility_timeout_at' => null, 'updated_at' => now(),
            ]);
        } catch (Throwable $error) {
            $this->failed($job, $error);
        }

        return true;
    }

    private function failed(object $job, Throwable $error): void
    {
        $decision = $this->retryPolicy->decide((int) $job->attempt, (int) $job->max_attempts);
        $attempt = $decision['nextAttempt'];
        $retry = $decision['retry'];
        DB::table('app.background_jobs')->where('job_id', $job->job_id)->update([
            'status' => $retry ? 'queued' : 'dead_lettered',
            'attempt' => $attempt,
            'run_at' => $retry ? now()->addSeconds($decision['delaySeconds']) : DB::raw('run_at'),
            'locked_at' => null, 'locked_by' => null, 'visibility_timeout_at' => null,
            'last_error' => $error->getMessage(), 'updated_at' => now(),
        ]);
        foreach (['app.export_jobs', 'app.import_jobs'] as $table) {
            DB::table($table)->where('job_id', $job->job_id)->update(['status' => $retry ? 'queued' : 'failed']);
        }
    }
}
