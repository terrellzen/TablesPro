<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

final class UserProfile extends Model
{
    protected $table = 'app.user_profiles';
    protected $primaryKey = 'user_id';
    protected $keyType = 'string';
    public $incrementing = false;
    public $timestamps = false;
    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'role' => 'string',
            'disabled_at' => 'datetime',
        ];
    }

    public function isOwner(): bool
    {
        return $this->role === 'owner';
    }

    public function isAdmin(): bool
    {
        return in_array($this->role, ['owner', 'admin'], true);
    }

    public function isCreator(): bool
    {
        return in_array($this->role, ['owner', 'admin', 'creator'], true);
    }

    public function canManageUsers(): bool
    {
        return $this->isAdmin();
    }

    public function canCreateWorkspaces(): bool
    {
        return $this->isCreator();
    }
}
