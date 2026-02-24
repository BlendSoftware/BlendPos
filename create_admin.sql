-- Create admin user with bcrypt hash for password "1234"
-- The hash is generated with bcrypt cost 12
DELETE FROM usuarios WHERE username = 'admin@blendpos.com';

INSERT INTO usuarios (username, nombre, email, password_hash, rol, activo)
VALUES (
  'admin@blendpos.com',
  'Admin Demo',
  'admin@blendpos.com',
  '$2a$12$iQKQuegOS6I5CKgwERkq6.cuTYgfLKI.gZQe0TBThL8zqipXMyhxS',
  'administrador',
  true
);
