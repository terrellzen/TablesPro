<?php

namespace App\Services\Records;

use App\Exceptions\ApiException;
use DateTimeImmutable;

final class FieldValueValidator
{
    public function validate(mixed $value, string $type): mixed
    {
        if ($value === null) {
            return null;
        }

        return match ($type) {
            'boolean' => is_bool($value) ? $value : $this->invalid($type, 'a boolean'),
            'integer' => is_int($value) && abs($value) <= 9007199254740991 ? $value : $this->invalid($type, 'a safe integer'),
            'decimal', 'currency', 'percentage' => (is_int($value) || is_float($value)) && is_finite((float) $value)
                ? $value
                : $this->invalid($type, 'a finite number'),
            'date' => $this->date($value),
            'timestamp_tz' => $this->timestamp($value),
            'multiple_select' => $this->multiple($value),
            'url' => $this->url($value),
            'email' => $this->text($value, $type, 320, FILTER_VALIDATE_EMAIL),
            'long_text' => $this->text($value, $type, 100000),
            'single_select' => $this->singleSelect($value, $type),
            default => $this->text($value, $type, 1000),
        };
    }

    private function text(mixed $value, string $type, int $max, ?int $filter = null): string
    {
        if (! is_string($value) || mb_strlen($value) > $max || ($filter && $value !== '' && filter_var($value, $filter) === false)) {
            return $this->invalid($type, 'a valid text value');
        }

        return $value;
    }

    private function date(mixed $value): string
    {
        if (! is_string($value)) {
            return $this->invalid('date', 'a valid YYYY-MM-DD date');
        }
        $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value);
        if (! $date || $date->format('Y-m-d') !== $value) {
            return $this->invalid('date', 'a valid YYYY-MM-DD date');
        }

        return $value;
    }

    private function timestamp(mixed $value): string
    {
        if (! is_string($value) || mb_strlen($value) > 64 || strtotime($value) === false) {
            return $this->invalid('timestamp_tz', 'a valid timestamp');
        }

        return $value;
    }

    private function multiple(mixed $value): array
    {
        if (! is_array($value) || count($value) > 100) {
            return $this->invalid('multiple_select', 'an array of at most 100 unique values');
        }
        foreach ($value as $entry) {
            $this->text($entry, 'multiple_select', 1000);
        }
        if (count(array_unique($value, SORT_STRING)) !== count($value)) {
            return $this->invalid('multiple_select', 'an array of at most 100 unique values');
        }

        return $value;
    }

    private function url(mixed $value): string
    {
        $text = $this->text($value, 'url', 2048);
        if ($text !== '' && (! filter_var($text, FILTER_VALIDATE_URL) || ! in_array(parse_url($text, PHP_URL_SCHEME), ['http', 'https'], true))) {
            return $this->invalid('url', 'an HTTP or HTTPS URL');
        }

        return $text;
    }

    private function singleSelect(mixed $value, string $type): ?string
    {
        $text = trim($this->text($value, $type, 1000));

        return $text === '' ? null : $text;
    }

    private function invalid(string $type, string $expected): never
    {
        throw new ApiException(400, 'VALIDATION_ERROR', "{$type} field value must be {$expected}");
    }
}
