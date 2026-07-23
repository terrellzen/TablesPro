<?php

namespace App\Services;

final class PostgresArray
{
    public static function encode(array $values): string
    {
        $escaped = array_map(function (mixed $value): string {
            $text = str_replace(['\\', '"'], ['\\\\', '\\"'], (string) $value);

            return '"'.$text.'"';
        }, $values);

        return '{'.implode(',', $escaped).'}';
    }

    public static function decode(mixed $value): array
    {
        if (is_array($value)) {
            return $value;
        }
        if (! is_string($value) || $value === '{}') {
            return [];
        }

        return str_getcsv(substr($value, 1, -1), ',', '"', '\\');
    }
}
