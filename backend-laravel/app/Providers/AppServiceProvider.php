<?php

namespace App\Providers;

use Illuminate\Support\ServiceProvider;

final class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        // Bindings use Laravel's automatic constructor injection.
    }

    public function boot(): void
    {
        // Application-wide boot hooks are intentionally kept empty.
    }
}
