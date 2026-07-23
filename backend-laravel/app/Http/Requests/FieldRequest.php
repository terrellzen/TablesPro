<?php

namespace App\Http\Requests;

use App\Enums\FieldType;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class FieldRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        if (is_string($this->input('name'))) {
            $this->merge(['name' => trim($this->input('name'))]);
        }
    }

    public function rules(): array
    {
        return ['name' => ['required', 'string', 'max:255'], 'fieldType' => ['required', Rule::enum(FieldType::class)]];
    }
}
