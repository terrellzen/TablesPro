<?php

namespace Tests\Unit;

use App\Support\AuditEventSerializer;
use PHPUnit\Framework\TestCase;

final class AuditEventSerializerTest extends TestCase
{
    public function test_it_decodes_postgres_json_columns(): void
    {
        $event = (object) [
            'event_id' => 'event-1',
            'diff' => '{"Status":{"before":"Open","after":"Closed"}}',
            'metadata' => '{"tableId":"table-1"}',
        ];

        $this->assertSame([
            'event_id' => 'event-1',
            'diff' => ['Status' => ['before' => 'Open', 'after' => 'Closed']],
            'metadata' => ['tableId' => 'table-1'],
        ], AuditEventSerializer::fromRow($event));
    }

    public function test_it_preserves_already_decoded_columns(): void
    {
        $event = [
            'diff' => ['Enabled' => ['before' => false, 'after' => true]],
            'metadata' => [],
        ];

        $this->assertSame($event, AuditEventSerializer::fromRow($event));
    }
}
