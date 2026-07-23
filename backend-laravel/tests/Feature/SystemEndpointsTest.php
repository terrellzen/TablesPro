<?php

namespace Tests\Feature;

use Tests\TestCase;

final class SystemEndpointsTest extends TestCase
{
    public function test_health_and_config_are_compatible(): void
    {
        $this->getJson('/health')->assertOk()->assertExactJson(['ok' => true]);
        $this->getJson('/api/config')->assertOk()->assertJsonStructure(['auth' => ['signUpEnabled']]);
    }

    public function test_protected_routes_require_authentication(): void
    {
        $this->getJson('/api/workspaces')->assertUnauthorized()->assertJsonPath('code', 'UNAUTHORIZED');
    }
}
