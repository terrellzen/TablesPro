<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

final class SavedView extends Model
{
    use HasUuids;

    protected $table = 'app.saved_views';
    protected $primaryKey = 'saved_view_id';
    protected $keyType = 'string';
    public $incrementing = false;
    protected $guarded = [];

    protected function casts(): array
    {
        return ['is_shared' => 'boolean', 'field_widths' => 'array'];
    }
}
