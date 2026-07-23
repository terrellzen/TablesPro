<?php

namespace Tests\Unit;

use App\Services\Jobs\JobRetryPolicy;
use PHPUnit\Framework\TestCase;

final class JobRetryPolicyTest extends TestCase
{
    public function test_it_uses_bounded_exponential_backoff(): void
    {
        $policy = new JobRetryPolicy;

        $this->assertSame(
            ['retry' => true, 'nextAttempt' => 1, 'delaySeconds' => 1],
            $policy->decide(0, 5),
        );
        $this->assertSame(1800, $policy->decide(20, 30)['delaySeconds']);
        $this->assertFalse($policy->decide(4, 5)['retry']);
    }
}
