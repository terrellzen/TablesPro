<?php

namespace App\Enums;

enum FieldType: string
{
    case ShortText = 'short_text';
    case LongText = 'long_text';
    case Integer = 'integer';
    case Decimal = 'decimal';
    case Currency = 'currency';
    case Percentage = 'percentage';
    case Boolean = 'boolean';
    case Date = 'date';
    case TimestampTz = 'timestamp_tz';
    case SingleSelect = 'single_select';
    case MultipleSelect = 'multiple_select';
    case Email = 'email';
    case Url = 'url';
    case Phone = 'phone';
    case UserReference = 'user_reference';

    public function sqlType(): string
    {
        return match ($this) {
            self::Integer => 'bigint',
            self::Decimal, self::Currency, self::Percentage => 'numeric',
            self::Boolean => 'boolean',
            self::Date => 'date',
            self::TimestampTz => 'timestamptz',
            self::MultipleSelect => 'text[]',
            default => 'text',
        };
    }
}
