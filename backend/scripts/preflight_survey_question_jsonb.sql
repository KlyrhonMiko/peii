\set ON_ERROR_STOP on

-- Run this only before applying b43d56b55144 to a database with text options/config.
-- It is read-only and rolls back even the transaction-local session settings.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';

DO $$
BEGIN
    IF current_setting('server_version_num')::integer < 160000 THEN
        RAISE EXCEPTION
            'This preflight requires PostgreSQL 16+ for pg_input_is_valid (server version: %)',
            current_setting('server_version');
    END IF;
END;
$$;

SELECT id, options, config
FROM survey_questions
WHERE (options IS NOT NULL AND NOT pg_input_is_valid(options, 'jsonb'))
   OR (config IS NOT NULL AND NOT pg_input_is_valid(config, 'jsonb'))
ORDER BY id;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM survey_questions
        WHERE (options IS NOT NULL AND NOT pg_input_is_valid(options, 'jsonb'))
           OR (config IS NOT NULL AND NOT pg_input_is_valid(config, 'jsonb'))
    ) THEN
        RAISE EXCEPTION
            'Malformed survey_questions.options or config blocks b43d56b55144; repair data before migration.';
    END IF;
END;
$$;

ROLLBACK;
