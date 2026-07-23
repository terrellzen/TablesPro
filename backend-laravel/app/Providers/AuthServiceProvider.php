<?php

namespace App\Providers;

use App\Models\Base;
use App\Models\DataTable;
use App\Models\Workspace;
use App\Policies\ResourcePolicy;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\ServiceProvider;

final class AuthServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        Gate::policy(Workspace::class, ResourcePolicy::class);
        Gate::policy(Base::class, ResourcePolicy::class);
        Gate::policy(DataTable::class, ResourcePolicy::class);
    }
}
