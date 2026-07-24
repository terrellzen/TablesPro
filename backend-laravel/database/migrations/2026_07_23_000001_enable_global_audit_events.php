<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement("ALTER TABLE app.audit_events DROP CONSTRAINT IF EXISTS audit_events_workspace_id_fkey");
        DB::statement("ALTER TABLE app.audit_events ALTER COLUMN workspace_id DROP NOT NULL");
        DB::statement("ALTER TABLE app.audit_events ADD CONSTRAINT audit_events_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES app.workspaces(workspace_id) ON DELETE SET NULL");
    }

    public function down(): void
    {
        DB::statement("ALTER TABLE app.audit_events DROP CONSTRAINT IF EXISTS audit_events_workspace_id_fkey");
        DB::statement("DELETE FROM app.audit_events WHERE workspace_id IS NULL");
        DB::statement("ALTER TABLE app.audit_events ALTER COLUMN workspace_id SET NOT NULL");
        DB::statement("ALTER TABLE app.audit_events ADD CONSTRAINT audit_events_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES app.workspaces(workspace_id) ON DELETE CASCADE");
    }
};
