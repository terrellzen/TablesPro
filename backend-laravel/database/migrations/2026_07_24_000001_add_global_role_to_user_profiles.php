<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement("CREATE TYPE app.global_role AS ENUM ('owner', 'admin', 'creator', 'member')");

        DB::statement("ALTER TABLE app.user_profiles ADD COLUMN role app.global_role NOT NULL DEFAULT 'member'");

        DB::statement("
            UPDATE app.user_profiles SET role = 'owner'
            WHERE user_id = (SELECT user_id FROM app.user_profiles ORDER BY created_at ASC LIMIT 1)
        ");

        DB::statement("
            UPDATE app.user_profiles SET role = 'admin'
            WHERE can_manage_users = true AND role = 'member'
        ");

        DB::statement("
            UPDATE app.user_profiles SET role = 'creator'
            WHERE can_create_workspaces = true AND role = 'member'
        ");

        DB::statement("ALTER TABLE app.user_profiles DROP COLUMN can_create_workspaces");
        DB::statement("ALTER TABLE app.user_profiles DROP COLUMN can_manage_users");
    }

    public function down(): void
    {
        DB::statement("ALTER TABLE app.user_profiles ADD COLUMN can_create_workspaces boolean NOT NULL DEFAULT false");
        DB::statement("ALTER TABLE app.user_profiles ADD COLUMN can_manage_users boolean NOT NULL DEFAULT false");

        DB::statement("
            UPDATE app.user_profiles SET can_create_workspaces = true
            WHERE role IN ('owner', 'admin', 'creator')
        ");

        DB::statement("
            UPDATE app.user_profiles SET can_manage_users = true
            WHERE role IN ('owner', 'admin')
        ");

        DB::statement("ALTER TABLE app.user_profiles DROP COLUMN role");
        DB::statement("DROP TYPE IF EXISTS app.global_role");
    }
};
