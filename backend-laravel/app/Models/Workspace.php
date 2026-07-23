<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

final class Workspace extends Model
{
    use HasUuids;
    use SoftDeletes;

    protected $table = 'app.workspaces';
    protected $primaryKey = 'workspace_id';
    protected $keyType = 'string';
    public $incrementing = false;
    protected $guarded = [];
    const CREATED_AT = 'created_at';
    const UPDATED_AT = 'updated_at';
}
