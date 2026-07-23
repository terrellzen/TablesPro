<?php

namespace App\Services;

use InvalidArgumentException;

final class SqlIdentifier
{
    public static function quote(string $identifier): string
    {
        if (! preg_match('/^[a-z_][a-z0-9_]*$/', $identifier)) {
            throw new InvalidArgumentException('Unsafe SQL identifier');
        }

        return '"'.$identifier.'"';
    }

    public static function dataTable(string $uuid): string
    {
        return 'app_data.'.self::quote(self::tableName($uuid));
    }

    public static function tableName(string $uuid): string
    {
        return 'tbl_'.str_replace('-', '_', strtolower($uuid));
    }

    public static function fieldName(string $uuid): string
    {
        return 'fld_'.str_replace('-', '_', strtolower($uuid));
    }
}
