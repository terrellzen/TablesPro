<?php

namespace App\Exceptions;

use RuntimeException;

final class ApiException extends RuntimeException
{
    public function __construct(
        public readonly int $status,
        public readonly string $errorCode,
        string $message,
        public readonly mixed $details = null,
    ) {
        parent::__construct($message);
    }

    public function payload(string $requestId): array
    {
        return array_filter([
            'code' => $this->errorCode,
            'message' => $this->getMessage(),
            'requestId' => $requestId,
            'details' => $this->details,
        ], fn (mixed $value): bool => $value !== null);
    }

    public static function forbidden(string $message): self
    {
        return new self(403, 'FORBIDDEN', $message);
    }

    public static function notFound(string $message): self
    {
        return new self(404, 'NOT_FOUND', $message);
    }

    public static function conflict(string $message, mixed $details = null): self
    {
        return new self(409, 'CONFLICT', $message, $details);
    }
}
