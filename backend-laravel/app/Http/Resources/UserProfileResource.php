<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

final class UserProfileResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'user_id' => $this->user_id,
            'handle' => $this->handle,
            'display_name' => $this->display_name,
            'role' => $this->role,
            'disabled_at' => $this->disabled_at,
        ];
    }
}
