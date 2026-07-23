<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

final class Base extends Model
{
    use HasUuids;
    use SoftDeletes;

    protected $table = 'app.bases';
    protected $primaryKey = 'base_id';
    protected $keyType = 'string';
    public $incrementing = false;
    protected $guarded = [];
}
