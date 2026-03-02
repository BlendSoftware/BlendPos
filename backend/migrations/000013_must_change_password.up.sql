-- 000013_must_change_password.up.sql
-- SEC-03: Forzar cambio de contraseña en primer login del admin seed.
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;

-- Marcar el admin seed para que deba cambiar su contraseña.
UPDATE usuarios SET must_change_password = TRUE WHERE username = 'admin';
