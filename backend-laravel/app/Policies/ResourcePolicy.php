<?php

namespace App\Policies;

use App\Models\Base;
use App\Models\DataTable;
use App\Models\User;
use App\Models\Workspace;
use App\Services\Authorization\PermissionService;

final class ResourcePolicy
{
    public function __construct(private readonly PermissionService $permissions) {}

    public function perform(User $user, Workspace|Base|DataTable $model, string $permission): bool
    {
        match (true) {
            $model instanceof Workspace => $this->permissions->workspace($user, $model->getKey(), $permission),
            $model instanceof Base => $this->permissions->base($user, $model->getKey(), $permission),
            default => $this->permissions->table($user, $model->getKey(), $permission),
        };

        return true;
    }
}
