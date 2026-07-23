<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Laravel\Sanctum\HasApiTokens;

final class User extends Authenticatable
{
    use HasApiTokens;
    use HasUlids;

    protected $table = 'auth.user';
    protected $keyType = 'string';
    public $incrementing = false;
    public $timestamps = false;
    protected $guarded = [];
    protected $hidden = ['password'];

    protected function casts(): array
    {
        return ['emailVerified' => 'boolean', 'createdAt' => 'datetime', 'updatedAt' => 'datetime'];
    }

    public function account(): HasOne
    {
        return $this->hasOne(AuthAccount::class, 'userId')->where('providerId', 'email');
    }

    public function profile(): HasOne
    {
        return $this->hasOne(UserProfile::class, 'user_id');
    }

    public function getAuthPassword(): string
    {
        return (string) $this->account?->password;
    }
}
