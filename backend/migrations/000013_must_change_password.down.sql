-- 000013_must_change_password.down.sql
ALTER TABLE usuarios DROP COLUMN IF EXISTS must_change_password;
