-- Verificar ventas duplicadas en la base de datos
-- Ejecuta este script conectándote a tu base de datos PostgreSQL

-- 1. Ventas con offline_id duplicado (no deberían existir por el constraint)
SELECT offline_id, COUNT(*) as count, 
       array_agg(id) as venta_ids,
       array_agg(numero_ticket) as tickets
FROM ventas
WHERE offline_id IS NOT NULL
GROUP BY offline_id
HAVING COUNT(*) > 1;

-- 2. Ventas de hoy con detalles (para ver si hay duplicados evidentes)
SELECT 
    id,
    numero_ticket,
    usuario_id,
    total,
    estado,
    offline_id,
    created_at
FROM ventas
WHERE DATE(created_at) = CURRENT_DATE
ORDER BY numero_ticket DESC;

-- 3. Contar ventas totales de hoy
SELECT 
    COUNT(*) as total_ventas_hoy,
    COUNT(DISTINCT numero_ticket) as tickets_unicos,
    COUNT(DISTINCT offline_id) as offline_ids_unicos
FROM ventas
WHERE DATE(created_at) = CURRENT_DATE;

-- 4. Si encuentras duplicados, puedes eliminar los duplicados con:
-- DELETE FROM ventas WHERE id IN ('id-duplicado-1', 'id-duplicado-2');
