<?php

namespace App\Services;

use App\Exceptions\ApiException;
use Illuminate\Support\Facades\DB;

final class MemberService
{
    private const LEVELS = ['read', 'edit', 'admin'];

    public function validatePermissions(string $workspaceId, mixed $value, bool $confirmed): array
    {
        if (! is_array($value) || ! array_key_exists('workspace', $value) || ! is_array($value['bases'] ?? null) || ! is_array($value['tables'] ?? null)) $this->invalid();
        if ($value['workspace'] !== null && ! in_array($value['workspace'], self::LEVELS, true)) $this->invalid();
        foreach ($value['bases'] as $id => $level) if (! $this->uuid($id) || ! in_array($level, self::LEVELS, true)) $this->invalid();
        foreach ($value['tables'] as $id => $grant) {
            if (! $this->uuid($id) || ! is_array($grant) || $grant === []) $this->invalid();
            foreach ($grant as $scope => $level) if (! in_array($scope, ['table', 'record'], true) || ! in_array($level, self::LEVELS, true)) $this->invalid();
        }
        $baseCount = DB::table('app.bases')->where('workspace_id', $workspaceId)->whereNull('deleted_at')->whereIn('base_id', array_keys($value['bases']))->count();
        $tableCount = DB::table('app.tables as t')->join('app.bases as b', 'b.base_id', '=', 't.base_id')->where('b.workspace_id', $workspaceId)->whereNull('t.deleted_at')->whereNull('b.deleted_at')->whereIn('t.table_id', array_keys($value['tables']))->count();
        if ($baseCount !== count($value['bases']) || $tableCount !== count($value['tables'])) throw new ApiException(400, 'VALIDATION_ERROR', 'A permission references a base or table outside this workspace');
        if ($this->destructive($value) && ! $confirmed) throw new ApiException(400, 'VALIDATION_ERROR', 'Confirm destructive administrative permissions before saving');

        return $value;
    }

    public function save(string $workspaceId, string $userId, array $permissions, string $actorId): object
    {
        return DB::transaction(function () use ($workspaceId, $userId, $permissions, $actorId): object {
            $this->lock($workspaceId); $this->assertAdminRemains($workspaceId, $userId, $permissions['workspace'] === 'admin');
            DB::statement("INSERT INTO app.workspace_members (workspace_id,user_id,role,permissions,created_by,updated_by) VALUES (?, ?, ?::app.workspace_role, ?::jsonb, ?, ?) ON CONFLICT (workspace_id,user_id) DO UPDATE SET role=EXCLUDED.role,permissions=EXCLUDED.permissions,updated_at=now(),updated_by=EXCLUDED.updated_by", [$workspaceId, $userId, $this->role($permissions), json_encode($permissions, JSON_THROW_ON_ERROR), $actorId, $actorId]);
            return DB::table('app.workspace_members')->where('workspace_id', $workspaceId)->where('user_id', $userId)->first();
        });
    }

    public function remove(string $workspaceId, string $userId): void
    {
        DB::transaction(function () use ($workspaceId, $userId): void {
            $this->lock($workspaceId); $this->assertAdminRemains($workspaceId, $userId, false);
            if (DB::table('app.workspace_members')->where('workspace_id', $workspaceId)->where('user_id', $userId)->delete() === 0) throw ApiException::notFound('Member was not found');
        });
    }

    public function resolveUser(string $value): string
    {
        $key = ltrim($value, '@');
        $id = DB::table('app.user_profiles')->whereNull('disabled_at')->where(fn ($query) => $query->where('user_id', $key)->orWhereRaw('handle = ?::citext', [$key]))->value('user_id');
        if (! $id) throw ApiException::notFound('User was not found');
        return $id;
    }

    public function assertUserCanBeDisabled(string $userId): void
    {
        $workspaces = DB::table('app.workspace_members')->where('user_id', $userId)->pluck('workspace_id');
        foreach ($workspaces as $workspace) $this->lock($workspace);
        foreach ($workspaces as $workspace) $this->assertAdminRemains($workspace, $userId, false);
    }

    private function assertAdminRemains(string $workspaceId, string $target, bool $willBeAdmin): void
    {
        if ($willBeAdmin) return;
        $row = DB::table('app.workspace_members')->where('workspace_id', $workspaceId)->where('user_id', $target)->first();
        if (! $row) return;
        $permissions = $row->permissions ? json_decode($row->permissions, true) : null;
        $isAdmin = $permissions ? ($permissions['workspace'] ?? null) === 'admin' : $row->role === 'admin';
        if (! $isAdmin) return;
        $others = DB::table('app.workspace_members')->where('workspace_id', $workspaceId)->where('user_id', '<>', $target)->get();
        $hasAdmin = $others->contains(function ($member): bool {
            $permissions = $member->permissions ? json_decode($member->permissions, true) : null;
            return $permissions ? ($permissions['workspace'] ?? null) === 'admin' : $member->role === 'admin';
        });
        if (! $hasAdmin) throw ApiException::forbidden('Cannot remove or demote the final Workspace Admin');
    }

    private function destructive(array $permissions): bool
    {
        if (in_array($permissions['workspace'], ['edit', 'admin'], true)) return true;
        if (collect($permissions['bases'])->contains(fn ($level) => in_array($level, ['edit', 'admin'], true))) return true;
        return collect($permissions['tables'])->contains(fn ($grant) => in_array($grant['table'] ?? null, ['edit', 'admin'], true) || ($grant['record'] ?? null) === 'admin');
    }

    private function role(array $permissions): string
    {
        return match ($permissions['workspace']) {
            'admin' => 'admin',
            'edit' => 'editor',
            default => 'viewer',
        };
    }

    private function lock(string $workspaceId): void
    {
        DB::select('SELECT pg_advisory_xact_lock(hashtextextended(?, 0))', [$workspaceId]);
    }

    private function uuid(string $value): bool
    {
        return preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i', $value) === 1;
    }

    private function invalid(): never
    {
        throw new ApiException(400, 'VALIDATION_ERROR', 'permissions must contain valid workspace, base, table, and record access levels');
    }
}
