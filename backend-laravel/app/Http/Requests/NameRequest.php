<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

final class NameRequest extends FormRequest
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
        return ['name' => ['required', 'string', 'max:255']];
    }
}
