<?php

namespace App\Console\Commands;

use App\Services\Jobs\DatabaseJobWorker;
use Illuminate\Console\Command;
use Illuminate\Support\Str;

final class WorkDatabaseJobs extends Command
{
    protected $signature = 'tablespro:work {--once : Process at most one available job}';
    protected $description = 'Process TablesPro import and export jobs';

    public function handle(DatabaseJobWorker $worker): int
    {
        $id = config('tablespro.worker_id') ?: 'laravel-worker-'.Str::uuid();
        do {
            $worked = $worker->runOne($id);
            if (! $worked && ! $this->option('once')) {
                usleep(1_000_000);
            }
        } while (! $this->option('once'));

        return self::SUCCESS;
    }
}
