-- Setup now goes on after the admin account, until the admin finishes it.
-- Servers that already have accounts finished setup before that existed.
INSERT INTO "setting" ("key", "value")
SELECT 'setup', '{"complete": true}'::jsonb
WHERE EXISTS (SELECT 1 FROM "user")
ON CONFLICT ("key") DO NOTHING;
