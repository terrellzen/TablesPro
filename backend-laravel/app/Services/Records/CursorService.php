<?php

namespace App\Services\Records;

use App\Exceptions\ApiException;
use JsonException;

final class CursorService
{
    public function __construct(private readonly ?string $secret = null) {}

    public function encode(array $payload): string
    {
        $body = rtrim(strtr(base64_encode(json_encode($payload, JSON_THROW_ON_ERROR)), '+/', '-_'), '=');
        $signature = rtrim(strtr(base64_encode(hash_hmac('sha256', $body, $this->key(), true)), '+/', '-_'), '=');

        return "{$body}.{$signature}";
    }

    public function decode(string $cursor): array
    {
        $parts = explode('.', $cursor);
        if (count($parts) !== 2 || ! hash_equals(hash_hmac('sha256', $parts[0], $this->key(), true), $this->decode64($parts[1]))) {
            throw new ApiException(400, 'VALIDATION_ERROR', 'Invalid cursor');
        }
        try {
            $payload = json_decode($this->decode64($parts[0]), true, flags: JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            throw new ApiException(400, 'VALIDATION_ERROR', 'Invalid cursor payload');
        }
        if (! isset($payload['tableId'], $payload['recordId'], $payload['sort']) || ! is_array($payload['sort'])) {
            throw new ApiException(400, 'VALIDATION_ERROR', 'Invalid cursor payload');
        }

        return $payload;
    }

    private function key(): string
    {
        $key = $this->secret ?? (string) config('app.key');

        return str_starts_with($key, 'base64:') ? base64_decode(substr($key, 7), true) : $key;
    }

    private function decode64(string $value): string
    {
        return (string) base64_decode(strtr($value, '-_', '+/'), true);
    }
}
