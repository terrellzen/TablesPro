<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        foreach (glob(database_path('schema/*.sql')) as $schema) {
            DB::unprepared(file_get_contents($schema));
        }

        DB::statement(<<<'SQL'
            CREATE TABLE public.laravel_sessions (
                id varchar(255) PRIMARY KEY,
                user_id text,
                ip_address varchar(45),
                user_agent text,
                payload text NOT NULL,
                last_activity integer NOT NULL
            )
        SQL);
        DB::statement('CREATE INDEX laravel_sessions_user_id_index ON public.laravel_sessions (user_id)');
        DB::statement('CREATE INDEX laravel_sessions_last_activity_index ON public.laravel_sessions (last_activity)');
    }

    public function down(): void
    {
        DB::statement('DROP SCHEMA IF EXISTS app_data CASCADE');
        DB::statement('DROP SCHEMA IF EXISTS app CASCADE');
        DB::statement('DROP SCHEMA IF EXISTS auth CASCADE');
        DB::statement('DROP TABLE IF EXISTS public.laravel_sessions');
    }
};
