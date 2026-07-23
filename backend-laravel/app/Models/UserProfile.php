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
            'can_create_workspaces' => 'boolean',
            'can_manage_users' => 'boolean',
            'disabled_at' => 'datetime',
        ];
    }
}
