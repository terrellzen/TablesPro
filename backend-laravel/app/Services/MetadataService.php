<?php

namespace App\Services;

use App\Exceptions\ApiException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final class MetadataService
{
    public function createWorkspace(string $name, string $actorId): object
    {
        return DB::transaction(function () use ($name, $actorId): object {
            $id = (string) Str::uuid();
            DB::table('app.workspaces')->insert(['workspace_id' => $id, 'name' => $name, 'created_by' => $actorId, 'updated_by' => $actorId]);
            DB::table('app.workspace_members')->insert(['workspace_id' => $id, 'user_id' => $actorId, 'role' => 'admin', 'created_by' => $actorId, 'updated_by' => $actorId]);

            return DB::table('app.workspaces')->where('workspace_id', $id)->select('workspace_id', 'name', 'created_at', 'updated_at', 'row_version')->first();
        });
    }

    public function createBase(string $workspaceId, string $name, string $actorId): object
    {
        $id = (string) Str::uuid();
        DB::table('app.bases')->insert(['base_id' => $id, 'workspace_id' => $workspaceId, 'name' => $name, 'created_by' => $actorId, 'updated_by' => $actorId]);

        return DB::table('app.bases')->where('base_id', $id)->select('base_id', 'workspace_id', 'name', 'created_at', 'updated_at', 'row_version')->first();
    }

    public function rename(string $table, string $idColumn, string $id, string $name, string $actorId): object
    {
        DB::table("app.{$table}")->where($idColumn, $id)->whereNull('deleted_at')->update([
            'name' => $name, 'updated_at' => now(), 'updated_by' => $actorId, 'row_version' => DB::raw('row_version + 1'),
        ]);
        $row = DB::table("app.{$table}")->where($idColumn, $id)->whereNull('deleted_at')->first();
        if (! $row) {
            throw ApiException::notFound(ucfirst(rtrim($table, 's')).' was not found');
        }

        return $row;
    }

    public function softDeleteWorkspace(string $workspaceId, string $actorId): void
    {
        DB::transaction(function () use ($workspaceId, $actorId): void {
            DB::table('app.tables')->whereIn('base_id', DB::table('app.bases')->select('base_id')->where('workspace_id', $workspaceId))->whereNull('deleted_at')->update($this->deleted($actorId));
            DB::table('app.bases')->where('workspace_id', $workspaceId)->whereNull('deleted_at')->update($this->deleted($actorId));
            DB::table('app.workspaces')->where('workspace_id', $workspaceId)->whereNull('deleted_at')->update($this->deleted($actorId));
        });
    }

    public function softDeleteBase(string $baseId, string $actorId): void
    {
        DB::transaction(function () use ($baseId, $actorId): void {
            DB::table('app.tables')->where('base_id', $baseId)->whereNull('deleted_at')->update($this->deleted($actorId));
            DB::table('app.bases')->where('base_id', $baseId)->whereNull('deleted_at')->update($this->deleted($actorId));
        });
    }

    private function deleted(string $actorId): array
    {
        return ['deleted_at' => now(), 'updated_at' => now(), 'updated_by' => $actorId, 'row_version' => DB::raw('row_version + 1')];
    }
}
