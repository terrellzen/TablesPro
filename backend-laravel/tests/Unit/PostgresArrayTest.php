<?php

namespace Tests\Unit;

use App\Services\PostgresArray;
use PHPUnit\Framework\TestCase;

final class PostgresArrayTest extends TestCase
{
    public function test_it_round_trips_text_array_values(): void
    {
        $values = ['alpha', 'value, with comma', 'quoted "value"'];

        $this->assertSame($values, PostgresArray::decode(PostgresArray::encode($values)));
    }
}
