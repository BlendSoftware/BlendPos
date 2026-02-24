# 🚀 INSTRUCCIONES DE DEPLOYMENT - BlendPOS

## 📋 Pre-requisitos

- Git configurado
- Backend en Go compilado
- Frontend en React listo para build
- PostgreSQL 14+ corriendo
- Acceso a la base de datos con permisos de ALTER TABLE

---

## 🔄 PASO 1: Aplicar cambios en Git

```powershell
# Verificar estado actual
git status

# Agregar todos los archivos modificados
git add .

# Commit con mensaje descriptivo
git commit -m "fix: Implementar 32 correcciones críticas y de UX

- Fix SQLSTATE 22003 (overflow en sesion_caja)
- Fix bug Esc borra carrito en POS
- Apertura de caja auto-asigna punto de venta
- Categorías dinámicas desde backend
- Validación de contraseña con complejidad
- Filtros avanzados en facturación
- Ordenamiento clickeable en tablas
- Separación visual de botón cerrar sesión"

# Push a la rama actual
git push origin master
```

---

## 🗄️ PASO 2: Migrar la base de datos

### Opción A: Usando migrate CLI (Recomendado)

```powershell
# Instalar migrate si no lo tenés (Windows con Chocolatey)
choco install migrate

# O descargar desde: https://github.com/golang-migrate/migrate/releases

# Ejecutar migración
cd backend
migrate -path ./migrations -database "postgresql://usuario:contraseña@localhost:5432/blendpos?sslmode=disable" up

# Verificar que se aplicó correctamente
migrate -path ./migrations -database "postgresql://usuario:contraseña@localhost:5432/blendpos?sslmode=disable" version
```

### Opción B: SQL Directo

```powershell
# Conectar a PostgreSQL
psql -U usuario -d blendpos

# Ejecutar el script manualmente
\i backend/migrations/000004_fix_caja_overflow.up.sql

# Verificar cambios
\d sesion_caja
\d movimientos_caja

# Deberías ver los campos con numeric(15,2)
```

### Verificación de migración exitosa

```sql
-- Conectar a la base de datos
psql -U usuario -d blendpos

-- Verificar tipos de datos
SELECT
    column_name,
    data_type,
    numeric_precision,
    numeric_scale
FROM information_schema.columns
WHERE table_name = 'sesion_caja'
  AND column_name IN ('monto_inicial', 'monto_esperado', 'monto_declarado', 'desvio');

-- Debería mostrar:
-- monto_inicial   | numeric | 15 | 2
-- monto_esperado  | numeric | 15 | 2
-- monto_declarado | numeric | 15 | 2
-- desvio          | numeric | 15 | 2
```

---

## 🏗️ PASO 3: Rebuild del Backend

```powershell
# Ir al directorio del backend
cd backend

# Limpiar build anterior
rm -rf tmp/

# Compilar
go build -o tmp/blendpos ./cmd/server

# Verificar que compila sin errores
go test ./...

# Ejecutar (desarrollo)
./tmp/blendpos

# O con hot reload (si tenés air instalado)
air
```

---

## ⚛️ PASO 4: Rebuild del Frontend

```powershell
# Ir al directorio del frontend
cd frontend

# Limpiar node_modules si hay problemas (opcional)
# rm -rf node_modules
# npm install

# Verificar que no hay errores de TypeScript
npm run type-check

# Build para producción
npm run build

# O en desarrollo
npm run dev
```

---

## 🧪 PASO 5: Testing Post-Deploy

### Test 1: Overflow en Caja (CRÍTICO)
```
1. Abrir sesión de caja
2. Registrar múltiples ventas de montos altos
3. Cerrar caja con arqueo
4. ✅ No debe dar error SQLSTATE 22003
```

### Test 2: Bug Esc en POS (CRÍTICO)
```
1. Escanear varios productos
2. Presionar F2 (buscar)
3. Presionar Esc para cerrar
4. ✅ El carrito NO debe borrarse
```

### Test 3: Punto de Venta Auto-Asignado
```
1. Logout del usuario actual
2. Login con usuario que tiene punto_de_venta asignado
3. Ir al POS y abrir caja
4. ✅ El campo "Punto de Venta" debe estar pre-llenado y deshabilitado
```

### Test 4: Categorías Dinámicas
```
1. Ir a Panel Admin > Categorías
2. Crear una categoría nueva "Bebidas Calientes"
3. Ir a Productos > Nuevo producto
4. Abrir el Select de Categoría
5. ✅ La categoría "Bebidas Calientes" debe aparecer
```

### Test 5: Validación de Contraseña
```
1. Ir a Panel Admin > Usuarios
2. Crear usuario nuevo con contraseña "abc123"
3. ✅ Debe dar error: "Debe contener mayúsculas, minúsculas, números y símbolos"
4. Cambiar a "Abc123!@"
5. ✅ Debe permitir crear el usuario
```

### Test 6: Filtros de Facturación
```
1. Ir a Panel Admin > Facturación
2. Seleccionar "Último mes" en período
3. Seleccionar "Efectivo" en método
4. Seleccionar "Completadas" en estado
5. ✅ Debe filtrar correctamente
6. Clic en cabecera "Total"
7. ✅ Debe ordenar por monto (asc/desc)
```

---

## ⚠️ ROLLBACK (Si algo falla)

### Backend - Revertir migración
```powershell
cd backend
migrate -path ./migrations -database "postgresql://..." down 1
```

### Git - Revertir commit
```powershell
git log --oneline  # Ver el hash del commit anterior
git reset --hard <hash-commit-anterior>
git push origin master --force  # ⚠️ CUIDADO: Esto borra el commit del remoto
```

---

## 📊 MONITORING Post-Deploy

### Logs a vigilar

**Backend:**
```powershell
# Windows
Get-Content -Path logs/server.log -Wait

# Buscar errores específicos
Select-String -Path logs/server.log -Pattern "SQLSTATE|panic|error"
```

**Frontend (Browser Console):**
- Errores de API
- Warnings de React
- Network failures

### Métricas clave

1. **Tiempo de respuesta de APIs**
   - POST /v1/caja/abrir
   - POST /v1/ventas
   - POST /v1/caja/arqueo

2. **Errores en producción**
   - SQLSTATE 22003 debería desaparecer
   - ERR_CONNECTION_REFUSED en CSV (requiere backend corriendo)

---

## 📞 SOPORTE

Si encontrás problemas durante el deployment:

1. **Revisar logs del backend** en `backend/logs/`
2. **Revisar browser console** (F12)
3. **Verificar migración SQL** con los queries de verificación
4. **Revisar que el backend esté corriendo** en `http://localhost:8080`

---

## ✅ CHECKLIST FINAL

- [ ] Git commit y push exitoso
- [ ] Migración SQL aplicada (verificada con query)
- [ ] Backend compilado sin errores
- [ ] Frontend buildeado sin errores TypeScript
- [ ] Test 1: Overflow en caja ✅
- [ ] Test 2: Bug Esc ✅
- [ ] Test 3: PDV auto-asignado ✅
- [ ] Test 4: Categorías dinámicas ✅
- [ ] Test 5: Validación contraseña ✅
- [ ] Test 6: Filtros facturación ✅
- [ ] Logs monitoreados por 1 hora post-deploy
- [ ] Backup de base de datos realizado

---

**¡Deployment completo! 🎉**

Recordá hacer un backup de la base de datos ANTES de aplicar migraciones en producción.
