-- 000002_historial_precios.down.sql
DROP INDEX IF EXISTS idx_historial_precio_created_at;
DROP INDEX IF EXISTS idx_historial_precio_proveedor;
DROP INDEX IF EXISTS idx_historial_precio_producto;
DROP TABLE IF EXISTS historial_precios;
