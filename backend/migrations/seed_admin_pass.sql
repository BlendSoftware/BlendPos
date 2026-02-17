UPDATE usuarios SET password_hash = '$2a$12$czOpzwKZllZGSALbuhPJcOpCiQTnjyNG1TPZwl3sFv6JZJcdMoHH6' WHERE username = 'admin';
SELECT username, LEFT(password_hash, 10) as hash_prefix FROM usuarios;
