<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

final class Field extends Model
{
    use HasUuids;

    protected $table = 'app.fields';
    protected $primaryKey = 'field_id';
    protected $keyType = 'string';
    public $incrementing = false;
    protected $guarded = [];

    protected function casts(): array
    {
        return ['options' => 'array', 'pinned' => 'boolean', 'hidden' => 'boolean', 'indexed' => 'boolean'];
    }
}
