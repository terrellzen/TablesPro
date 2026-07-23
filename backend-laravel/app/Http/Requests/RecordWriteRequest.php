<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

final class RecordWriteRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'values' => ['required', 'array'],
            'rowVersion' => [$this->isMethod('PATCH') ? 'required' : 'sometimes', 'integer', 'min:1'],
        ];
    }
}
