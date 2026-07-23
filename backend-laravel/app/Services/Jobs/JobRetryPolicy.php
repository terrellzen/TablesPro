<?php

namespace App\Services\Jobs;

final class JobRetryPolicy
{
    public function decide(int $attempt, int $maxAttempts): array
    {
        $nextAttempt = $attempt + 1;

        return [
            'retry' => $nextAttempt < $maxAttempts,
            'nextAttempt' => $nextAttempt,
            'delaySeconds' => min(1800, 2 ** $attempt),
        ];
    }
}
