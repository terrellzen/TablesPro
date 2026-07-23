<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

final class AuthAccount extends Model
{
    protected $table = 'auth.account';
    protected $keyType = 'string';
    public $incrementing = false;
    public $timestamps = false;
    protected $guarded = [];
    protected $hidden = ['password'];
}
