<?php

namespace Tests\Unit;

use App\Exceptions\ApiException;
use App\Services\Records\FieldValueValidator;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class FieldValueValidatorTest extends TestCase
{
    #[DataProvider('validValues')]
    public function test_it_accepts_and_normalizes_values(mixed $input, string $type, mixed $expected): void
    {
        $this->assertSame($expected, (new FieldValueValidator)->validate($input, $type));
    }

    public static function validValues(): array
    {
        return [
            [true, 'boolean', true], [42, 'integer', 42], [42.25, 'decimal', 42.25],
            [19.99, 'currency', 19.99],
            ['2026-07-22', 'date', '2026-07-22'], ['https://example.com/path', 'url', 'https://example.com/path'],
            ['person@example.com', 'email', 'person@example.com'], ['  In progress  ', 'single_select', 'In progress'],
        ];
    }

    #[DataProvider('invalidValues')]
    public function test_it_rejects_invalid_values(mixed $input, string $type): void
    {
        $this->expectException(ApiException::class);
        (new FieldValueValidator)->validate($input, $type);
    }

    public static function invalidValues(): array
    {
        return [['true', 'boolean'], [1.5, 'integer'], ['2026-02-30', 'date'], ['javascript:alert(1)', 'url'], ['invalid', 'email']];
    }
}
