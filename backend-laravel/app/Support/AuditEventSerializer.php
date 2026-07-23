<?php

namespace App\Support;

final class AuditEventSerializer
{
    public static function fromRow(object|array $event): array
    {
        $row = (array) $event;
        $row['diff'] = self::decodeObject($row['diff'] ?? null);
        $row['metadata'] = self::decodeObject($row['metadata'] ?? null);

        return $row;
    }

    private static function decodeObject(mixed $value): array
    {
        if (is_string($value)) {
            $value = json_decode($value, true, 512, JSON_THROW_ON_ERROR);
        } elseif (is_object($value)) {
            $value = (array) $value;
        }

        return is_array($value) ? $value : [];
    }
}
