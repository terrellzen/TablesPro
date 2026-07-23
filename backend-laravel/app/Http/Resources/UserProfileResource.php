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
            'can_create_workspaces' => (bool) $this->can_create_workspaces,
            'can_manage_users' => (bool) $this->can_manage_users,
            'disabled_at' => $this->disabled_at,
        ];
    }
}
