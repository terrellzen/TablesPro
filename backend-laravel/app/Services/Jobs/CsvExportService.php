<?php

namespace App\Services\Jobs;

use App\Services\PostgresArray;
use App\Services\SqlIdentifier;
use Illuminate\Support\Facades\DB;
use RuntimeException;

final class CsvExportService
{
    public function process(string $jobId, array $payload): void
    {
        $tableId = $payload['tableId'] ?? null;
        if (! is_string($tableId) || $tableId === '') {
            throw new RuntimeException('Job payload is missing tableId');
        }
        $directory = config('tablespro.export_directory') ?: storage_path('app/exports');
        if (! is_dir($directory) && ! mkdir($directory, 0750, true) && ! is_dir($directory)) {
            throw new RuntimeException('Could not create export directory');
        }
        $path = rtrim($directory, DIRECTORY_SEPARATOR).DIRECTORY_SEPARATOR.$jobId.'.csv';
        $output = fopen($path, 'wb');
        if ($output === false) {
            throw new RuntimeException('Could not open export output');
        }

        try {
            $fields = DB::table('app.fields')->where('table_id', $tableId)->whereNull('tombstoned_at')
                ->where('hidden', false)->orderBy('position')->orderBy('field_id')
                ->get(['name', 'physical_column_name', 'field_type'])->all();
            $this->line($output, ['record_id', ...array_map(fn ($field) => $field->name, $fields)]);
            $exported = 0;
            $lastId = null;
            do {
                $columns = array_map(fn ($field): string => SqlIdentifier::quote($field->physical_column_name), $fields);
                $bindings = [];
                $keyset = '';
                if ($lastId !== null) {
                    $keyset = 'AND record_id > ?::uuid';
                    $bindings[] = $lastId;
                }
                $select = implode(', ', ['record_id', ...$columns]);
                $rows = DB::select('SELECT '.$select.' FROM '.SqlIdentifier::dataTable($tableId)." WHERE deleted_at IS NULL {$keyset} ORDER BY record_id LIMIT 1000", $bindings);
                foreach ($rows as $row) {
                    $values = [$row->record_id];
                    foreach ($fields as $field) {
                        $value = $row->{$field->physical_column_name};
                        if ($field->field_type === 'multiple_select') {
                            $value = implode(',', PostgresArray::decode($value));
                        }
                        $values[] = $value;
                    }
                    $this->line($output, $values);
                    $lastId = $row->record_id;
                    $exported++;
                }
                DB::table('app.export_jobs')->where('job_id', $jobId)->update(['exported_rows' => $exported]);
            } while ($rows !== []);
        } finally {
            fclose($output);
        }

        DB::table('app.export_jobs')->where('job_id', $jobId)->update([
            'status' => 'succeeded', 'exported_rows' => $exported, 'output_path' => $path,
        ]);
    }

    private function line(mixed $stream, array $values): void
    {
        $safe = array_map(function (mixed $value): string {
            $text = match (true) {
                $value === null => '', is_bool($value) => $value ? 'true' : 'false', default => (string) $value,
            };

            return preg_match('/^[=+\-@\t\r]/', $text) ? "'{$text}" : $text;
        }, $values);
        fputcsv($stream, $safe, ',', '"', '', "\n");
    }
}
