<?php

namespace Tests\Unit;

use App\Services\Authorization\PermissionService;
use PHPUnit\Framework\TestCase;
use ReflectionMethod;

final class PermissionServiceTest extends TestCase
{
    public function test_table_edit_can_create_columns_and_delete_table_content(): void
    {
        $this->assertTrue($this->allowed("edit", "table", "field:create"));
        $this->assertTrue($this->allowed("edit", "table", "table:delete"));
        $this->assertTrue($this->allowed("edit", "table", "record:delete"));
        $this->assertTrue($this->allowed("edit", "base", "base:delete"));
    }

    public function test_record_edit_does_not_change_table_structure(): void
    {
        $this->assertTrue($this->allowed("edit", "record", "record:delete"));
        $this->assertFalse($this->allowed("edit", "record", "field:create"));
    }

    private function allowed(string $level, string $scope, string $permission): bool
    {
        $method = new ReflectionMethod(PermissionService::class, "allowedByLevel");

        return $method->invoke(new PermissionService, $level, $scope, $permission);
    }
}
