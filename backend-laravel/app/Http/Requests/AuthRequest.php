<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

final class AuthRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'email' => ['required', 'email:rfc', 'max:320'],
            'password' => ['required', 'string', 'min:8', 'max:255'],
            'name' => [$this->routeIs('auth.signup') ? 'required' : 'sometimes', 'string', 'max:255'],
        ];
    }
}
