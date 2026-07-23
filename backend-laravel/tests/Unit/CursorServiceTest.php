<?php

namespace Tests\Unit;

use App\Exceptions\ApiException;
use App\Services\Records\CursorService;
use PHPUnit\Framework\TestCase;

final class CursorServiceTest extends TestCase
{
    public function test_cursor_round_trip_and_tampering_detection(): void
    {
        $service = new CursorService('a-secret-key-with-more-than-thirty-two-characters');
        $payload = ['tableId' => 'table', 'recordId' => 'record', 'sort' => []];
        $cursor = $service->encode($payload);
        $this->assertSame($payload, $service->decode($cursor));

        $this->expectException(ApiException::class);
        $service->decode($cursor.'x');
    }
}
