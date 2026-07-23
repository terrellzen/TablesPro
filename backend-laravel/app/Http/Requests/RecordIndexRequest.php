<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

final class RecordIndexRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        foreach (['filter', 'sort'] as $key) {
            $value = $this->query($key);
            if (is_string($value) && $value !== '') {
                $decoded = json_decode($value, true);
                if (json_last_error() === JSON_ERROR_NONE) {
                    $this->merge([$key => $decoded]);
                }
            }
        }
        $fields = $this->query('fields');
        if (is_string($fields)) {
            $this->merge(['fields' => array_values(array_filter(array_map('trim', explode(',', $fields))))]);
        }
    }

    public function rules(): array
    {
        return [
            'limit' => ['sometimes', 'integer', 'min:1'], 'cursor' => ['sometimes', 'string'],
            'fields' => ['sometimes', 'array'], 'fields.*' => ['uuid', 'distinct'],
            'filter' => ['sometimes', 'array'], 'sort' => ['sometimes', 'array'],
            'sort.*.fieldId' => ['required', 'uuid'], 'sort.*.direction' => ['required', 'in:asc,desc'],
        ];
    }
}
