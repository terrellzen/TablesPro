<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

final class WorkspaceMember extends Model
{
    protected $table = 'app.workspace_members';
    public $incrementing = false;
    protected $guarded = [];

    protected function casts(): array
    {
        return ['permissions' => 'array'];
    }
}
