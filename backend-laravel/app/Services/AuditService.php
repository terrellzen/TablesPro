<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

final class AuditService
{
    public static function forResponse(object $row): object
    {
        foreach (["diff", "metadata"] as $column) {
            if (isset($row->{$column}) && is_string($row->{$column})) {
                $row->{$column} = json_decode($row->{$column}, true, flags: JSON_THROW_ON_ERROR);
            }
        }

        return $row;
    }

    public function write(
        Request $request,
        User $actor,
        ?string $workspaceId,
        string $action,
        string $entityType,
        string $entityId,
        array $metadata = [],
        array $diff = [],
    ): void {
        DB::table('app.audit_events')->insert([
            'workspace_id' => $workspaceId,
            'actor_user_id' => $actor->getKey(),
            'action' => $action,
            'entity_type' => $entityType,
            'entity_id' => $entityId,
            'request_id' => $request->attributes->get('request_id'),
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'outcome' => 'success',
            'diff' => json_encode($diff, JSON_THROW_ON_ERROR),
            'metadata' => json_encode($metadata, JSON_THROW_ON_ERROR),
        ]);
    }
}
