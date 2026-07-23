<?php

namespace App\Services\Authorization;

use App\Exceptions\ApiException;
use App\Models\User;
use Illuminate\Support\Facades\DB;

final class PermissionService
{
    private const ROLE_GRANTS = [
        'admin' => ['workspace:*', 'member:*', 'base:*', 'table:*', 'field:*', 'view:*', 'record:*', 'audit:read'],
        'editor' => ['workspace:read', 'workspace:update', 'member:read', 'base:*', 'table:*', 'field:*', 'view:*', 'record:*'],
        'viewer' => ['workspace:read', 'member:read', 'base:read', 'table:read', 'field:read', 'view:read', 'record:read', 'record:export'],
        'restricted' => ['workspace:read'],
    ];

    public function workspace(User $user, string $workspaceId, string $permission): array
    {
        $row = DB::table('app.workspace_members as wm')
            ->join('app.workspaces as w', 'w.workspace_id', '=', 'wm.workspace_id')
            ->where('wm.workspace_id', $workspaceId)->where('wm.user_id', $user->getKey())
            ->whereNull('w.deleted_at')->select('wm.role', 'wm.permissions')->first();
        if (! $row) {
            throw ApiException::notFound('Workspace was not found');
        }
        $permissions = $this->permissions($row);
        $this->assertAllowed($this->workspaceRole($permissions), $permission);

        return ['workspaceId' => $workspaceId, 'permissions' => $permissions];
    }

    public function base(User $user, string $baseId, string $permission): array
    {
        $row = DB::table('app.bases as b')->join('app.workspace_members as wm', 'wm.workspace_id', '=', 'b.workspace_id')
            ->where('b.base_id', $baseId)->where('wm.user_id', $user->getKey())->whereNull('b.deleted_at')
            ->select('b.workspace_id', 'wm.role', 'wm.permissions')->first();
        if (! $row) {
            throw ApiException::notFound('Base was not found');
        }
        $permissions = $this->permissions($row);
        $allowed = $this->allowed($this->workspaceRole($permissions), $permission)
            || $this->allowedByLevel($permissions['bases'][$baseId] ?? null, 'base', $permission);
        if (! $allowed && $permission === 'table:read' && $permissions['tables'] !== []) {
            $allowed = DB::table('app.tables')->where('base_id', $baseId)
                ->whereIn('table_id', array_keys($permissions['tables']))->whereNull('deleted_at')->exists();
        }
        if (! $allowed) {
            throw ApiException::forbidden("Permission denied for {$permission}");
        }

        return ['workspaceId' => $row->workspace_id, 'baseId' => $baseId, 'permissions' => $permissions];
    }

    public function table(User $user, string $tableId, string $permission): array
    {
        $row = DB::table('app.tables as t')->join('app.bases as b', 'b.base_id', '=', 't.base_id')
            ->join('app.workspace_members as wm', 'wm.workspace_id', '=', 'b.workspace_id')
            ->where('t.table_id', $tableId)->where('wm.user_id', $user->getKey())
            ->whereNull('t.deleted_at')->whereNull('b.deleted_at')
            ->select('b.workspace_id', 'b.base_id', 'wm.role', 'wm.permissions')->first();
        if (! $row) {
            throw ApiException::notFound('Table was not found');
        }
        $permissions = $this->permissions($row);
        $grant = $permissions['tables'][$tableId] ?? [];
        $allowed = $this->allowed($this->workspaceRole($permissions), $permission)
            || $this->allowedByLevel($permissions['bases'][$row->base_id] ?? null, 'base', $permission)
            || $this->allowedByLevel($grant['table'] ?? null, 'table', $permission)
            || $this->allowedByLevel($grant['record'] ?? null, 'record', $permission);
        if (! $allowed) {
            throw ApiException::forbidden("Permission denied for {$permission}");
        }

        return ['workspaceId' => $row->workspace_id, 'baseId' => $row->base_id, 'permissions' => $permissions];
    }

    private function permissions(object $row): array
    {
        if ($row->permissions === null) {
            return ['workspace' => $row->role === 'admin' ? 'admin' : ($row->role === 'editor' ? 'edit' : 'read'), 'bases' => [], 'tables' => []];
        }

        return is_string($row->permissions) ? json_decode($row->permissions, true, flags: JSON_THROW_ON_ERROR) : (array) $row->permissions;
    }

    private function workspaceRole(array $permissions): string
    {
        return match ($permissions['workspace'] ?? null) {
            'admin' => 'admin', 'edit' => 'editor', 'read' => 'viewer', default => 'restricted',
        };
    }

    private function assertAllowed(string $role, string $permission): void
    {
        if (! $this->allowed($role, $permission)) {
            throw ApiException::forbidden("Permission denied for {$permission}");
        }
    }

    private function allowed(string $role, string $permission): bool
    {
        [$resource] = explode(':', $permission, 2);

        return collect(self::ROLE_GRANTS[$role])->contains(fn (string $grant): bool => $grant === $permission || $grant === "{$resource}:*" || $grant === '*:*');
    }

    private function allowedByLevel(?string $level, string $scope, string $permission): bool
    {
        if ($level === null) {
            return false;
        }
        [$resource, $action] = explode(':', $permission, 2);
        $read = in_array($permission, ['base:read', 'table:read', 'field:read', 'view:read', 'record:read', 'record:export'], true);
        if ($level === 'read') {
            return $read;
        }
        $edit = $read || in_array($permission, ['table:create', 'table:update', 'table:manageSchema', 'field:create', 'field:update', 'field:delete', 'view:create', 'view:update', 'view:delete', 'record:create', 'record:update', 'record:bulkUpdate', 'record:import'], true);
        if ($level === 'edit') {
            return $edit && ! in_array($permission, ['table:delete', 'record:delete'], true);
        }
        if ($scope === 'record') {
            return $resource === 'record' || $read;
        }
        if ($scope === 'table') {
            return $edit || in_array($permission, ['table:delete', 'record:delete'], true);
        }

        return $edit || ($resource === 'base' && in_array($action, ['update', 'delete'], true));
    }
}
