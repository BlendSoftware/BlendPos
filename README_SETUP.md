# 🚀 BlendPOS - Guía de Configuración Inicial

Esta guía te permitirá levantar el proyecto BlendPOS desde cero, con la base de datos completamente configurada y el usuario admin listo para usar.

## 📋 Prerequisitos

Antes de comenzar, asegúrate de tener instalado:

- **Docker Desktop** (Windows/Mac) o **Docker + Docker Compose** (Linux)
- **Git** para clonar el repositorio
- **PowerShell** (Windows) o **Bash** (Linux/Mac)

### Herramientas Opcionales (Recomendadas)

- **golang-migrate** - Para ejecutar migraciones manualmente (opcional, se puede usar con Docker)

```powershell
# Windows (PowerShell)
go install -tags 'postgres' github.com/golang-migrate/migrate/v4/cmd/migrate@latest
```

```bash
# Linux/Mac
go install -tags 'postgres' github.com/golang-migrate/migrate/v4/cmd/migrate@latest
```

---

## 🏁 Inicio Rápido (Quick Start)

### 1. Clonar el Repositorio

```bash
git clone <repository-url> BlendPos
cd BlendPos
```

### 2. Iniciar los Contenedores

```bash
docker-compose up -d
```

Esto iniciará:
- **PostgreSQL** - Base de datos (puerto 5432)
- **Redis** - Cache (puerto 6379)
- **Backend** - API Go (puerto 8000)
- **Frontend** - React + Vite (puerto 5173)
- **AFIP Sidecar** - Servicio de facturación (puerto 8001)

### 3. Verificar que los Contenedores Están Corriendo

```bash
docker ps
```

Deberías ver 5 contenedores activos: `postgres`, `redis`, `backend`, `frontend`, `afip-sidecar`

---

## 🗄️ Configuración de Base de Datos

### Opción A: Ejecutar Migraciones con golang-migrate (Recomendado)

Si instalaste `golang-migrate` en los prerequisitos:

```powershell
# Windows (PowerShell)
C:\Users\<TU_USUARIO>\go\bin\migrate.exe -path ./backend/migrations -database "postgresql://blendpos:blendpos@localhost:5432/blendpos?sslmode=disable" up
```

```bash
# Linux/Mac
migrate -path ./backend/migrations -database "postgresql://blendpos:blendpos@localhost:5432/blendpos?sslmode=disable" up
```

### Opción B: Ejecutar Migraciones con Docker

Si no tienes golang-migrate instalado:

```bash
# Windows (PowerShell) / Linux / Mac
docker exec blendpos-postgres-1 psql -U blendpos -d blendpos -f /docker-entrypoint-initdb.d/000001_create_tables.up.sql
docker exec blendpos-postgres-1 psql -U blendpos -d blendpos -f /docker-entrypoint-initdb.d/000002_historial_precios.up.sql
docker exec blendpos-postgres-1 psql -U blendpos -d blendpos -f /docker-entrypoint-initdb.d/000003_comprobante_retry.up.sql
docker exec blendpos-postgres-1 psql -U blendpos -d blendpos -f /docker-entrypoint-initdb.d/000004_fix_caja_overflow.up.sql
docker exec blendpos-postgres-1 psql -U blendpos -d blendpos -f /docker-entrypoint-initdb.d/000005_missing_tables.up.sql
```

**Nota:** Para que esto funcione, necesitas montar el directorio de migraciones en el contenedor. Agrega a `docker-compose.yml` en el servicio `postgres`:

```yaml
volumes:
  - pg_data:/var/lib/postgresql/data
  - ./backend/migrations:/docker-entrypoint-initdb.d  # ← Agregar esta línea
```

### Verificar Migraciones Aplicadas

```bash
docker exec blendpos-postgres-1 psql -U blendpos -d blendpos -c "\dt"
```

Deberías ver las siguientes tablas:
- `categorias`
- `comprobantes`
- `contacto_proveedors`
- `historial_precios`
- `movimiento_cajas`
- `movimientos_stock`
- `producto_hijos`
- `productos`
- `proveedores`
- `sesion_cajas`
- `usuarios`
- `venta_items`
- `venta_pagos`
- `ventas`
- `schema_migrations` (control de versiones)

---

## 👤 Crear Usuario Administrador

### Método 1: Script SQL Directo (Más Rápido)

```bash
# Copiar el script al contenedor
docker cp create_admin.sql blendpos-postgres-1:/tmp/create_admin.sql

# Ejecutar el script
docker exec blendpos-postgres-1 psql -U blendpos -d blendpos -f /tmp/create_admin.sql
```

### Método 2: Comando Directo

```bash
docker exec blendpos-postgres-1 psql -U blendpos -d blendpos -c "
INSERT INTO usuarios (username, nombre, email, password_hash, rol, activo)
VALUES (
  'admin@blendpos.com',
  'Admin Demo',
  'admin@blendpos.com',
  '\$2a\$12\$iQKQuegOS6I5CKgwERkq6.cuTYgfLKI.gZQe0TBThL8zqipXMyhxS',
  'administrador',
  true
)
ON CONFLICT (username) DO UPDATE
SET password_hash = EXCLUDED.password_hash,
    nombre = EXCLUDED.nombre,
    email = EXCLUDED.email,
    rol = EXCLUDED.rol,
    activo = true;
"
```

### Verificar Usuario Creado

```bash
docker exec blendpos-postgres-1 psql -U blendpos -d blendpos -c "SELECT username, email, rol, activo FROM usuarios WHERE username = 'admin@blendpos.com';"
```

**Credenciales del Admin:**
- **Usuario:** `admin@blendpos.com`
- **Contraseña:** `1234`

---

## 🖥️ Acceder al Sistema

### Frontend (Interfaz de Usuario)

Abre tu navegador y ve a:

```
http://localhost:5173
```

**Iniciar Sesión:**
- Usuario: `admin@blendpos.com`
- Contraseña: `1234`

### Backend API (Swagger Docs)

```
http://localhost:8000/docs
```

---

## 🧪 Verificación del Sistema

### 1. Verificar Backend

```bash
curl http://localhost:8000/health
```

Respuesta esperada: `{"status":"ok"}`

### 2. Verificar PostgreSQL

```bash
docker exec blendpos-postgres-1 psql -U blendpos -d blendpos -c "SELECT version();"
```

### 3. Verificar Redis

```bash
docker exec blendpos-redis-1 redis-cli ping
```

Respuesta esperada: `PONG`

### 4. Ver Logs de Backend

```bash
docker logs blendpos-backend-1 -f
```

### 5. Ver Logs de Frontend

```bash
docker logs blendpos-frontend-1 -f
```

---

## 📊 Datos de Prueba (Seed)

### Categorías Pre-cargadas

El sistema viene con 6 categorías básicas:
- almacen
- bebidas
- lacteos
- panaderia
- limpieza
- otros

### Usuario Admin Pre-cargado

Como se mencionó anteriormente:
- **Username:** `admin@blendpos.com`
- **Password:** `1234`
- **Rol:** Administrador

---

## 🛠️ Comandos Útiles

### Reiniciar Todos los Servicios

```bash
docker-compose restart
```

### Reiniciar Solo el Backend

```bash
docker restart blendpos-backend-1
```

### Reiniciar Solo el Frontend

```bash
docker restart blendpos-frontend-1
```

### Ver Logs en Tiempo Real

```bash
# Todos los servicios
docker-compose logs -f

# Solo backend
docker logs blendpos-backend-1 -f

# Solo frontend
docker logs blendpos-frontend-1 -f
```

### Detener Todos los Servicios

```bash
docker-compose down
```

### Borrar TODO (incluyendo base de datos) y Empezar de Cero

```bash
# ⚠️ CUIDADO: Esto borra TODOS los datos
docker-compose down -v
docker-compose up -d
# Luego volver a ejecutar migraciones y crear admin
```

### Acceder a PostgreSQL (psql)

```bash
docker exec -it blendpos-postgres-1 psql -U blendpos -d blendpos
```

Comandos útiles en psql:
- `\dt` - Listar tablas
- `\d nombre_tabla` - Ver estructura de una tabla
- `\q` - Salir

---

## 🔧 Solución de Problemas (Troubleshooting)

### El Backend no Inicia

**Síntoma:** El contenedor `backend` se reinicia continuamente.

**Solución:**
1. Verificar logs: `docker logs blendpos-backend-1`
2. Verificar que PostgreSQL esté corriendo: `docker ps | grep postgres`
3. Verificar conexión a BD:
   ```bash
   docker exec blendpos-backend-1 sh -c "nc -zv postgres 5432"
   ```

### Frontend Muestra Pantalla Blanca

**Síntoma:** La página `localhost:5173` no carga o está en blanco.

**Solución:**
1. Verificar logs: `docker logs blendpos-frontend-1 -f`
2. Esperar a que Vite compile (puede tardar 30-60 segundos la primera vez)
3. Hacer hard refresh en el navegador: `Ctrl + Shift + R` (Windows) o `Cmd + Shift + R` (Mac)

### Error 401 al Hacer Login

**Síntoma:** Usuario y contraseña correctos pero login falla.

**Solución:**
1. Verificar que el hash de la contraseña sea correcto:
   ```bash
   docker exec blendpos-postgres-1 psql -U blendpos -d blendpos -c "SELECT username, password_hash FROM usuarios WHERE username = 'admin@blendpos.com';"
   ```
2. El hash debe ser: `$2a$12$iQKQuegOS6I5CKgwERkq6.cuTYgfLKI.gZQe0TBThL8zqipXMyhxS`
3. Si no coincide, volver a ejecutar el script de creación de admin

### Base de Datos No Tiene Tablas

**Síntoma:** Al ejecutar `\dt` en psql no aparecen tablas.

**Solución:**
1. Ejecutar migraciones manualmente (ver sección "Configuración de Base de Datos")
2. Verificar que el archivo `schema_migrations` exista:
   ```bash
   docker exec blendpos-postgres-1 psql -U blendpos -d blendpos -c "SELECT * FROM schema_migrations;"
   ```

### Puerto Ocupado (Address Already in Use)

**Síntoma:** Error al iniciar Docker Compose sobre puertos 5432, 8000 o 5173.

**Solución:**

**Windows (PowerShell):**
```powershell
# Ver qué proceso usa el puerto 5432
netstat -ano | findstr :5432
# Matar el proceso (reemplazar PID con el número que aparece)
taskkill /PID <PID> /F
```

**Linux/Mac:**
```bash
# Ver qué proceso usa el puerto 5432
sudo lsof -i :5432
# Matar el proceso
sudo kill -9 <PID>
```

O cambiar los puertos en `docker-compose.yml`.

---

## 📚 Estructura del Proyecto

```
BlendPos/
├── backend/
│   ├── cmd/
│   │   ├── server/      # Punto de entrada principal
│   │   ├── seeduser/    # Utilidad para crear usuarios
│   │   └── genhash/     # Utilidad para generar bcrypt hashes
│   ├── internal/
│   │   ├── handler/     # Controladores HTTP
│   │   ├── service/     # Lógica de negocio
│   │   ├── repository/  # Acceso a datos
│   │   ├── model/       # Modelos de GORM
│   │   └── infra/       # Infraestructura (DB, Redis)
│   ├── migrations/      # Migraciones SQL
│   └── Dockerfile.dev   # Dockerfile para desarrollo
├── frontend/
│   ├── src/
│   │   ├── pages/       # Páginas de la aplicación
│   │   ├── components/  # Componentes reutilizables
│   │   ├── services/    # Cliente API
│   │   └── stores/      # Estado global (Zustand)
│   └── Dockerfile
├── afip-sidecar/        # Servicio de facturación AFIP
├── docker-compose.yml   # Orquestación de servicios
└── README_SETUP.md      # Este archivo
```

---

## 🔐 Seguridad - Cambio de Contraseñas

### ⚠️ IMPORTANTE: Cambiar Contraseñas en Producción

Antes de desplegar en producción, **DEBES** cambiar:

1. **Contraseña de PostgreSQL** en `docker-compose.yml`:
   ```yaml
   POSTGRES_PASSWORD: blendpos  # ← CAMBIAR
   ```

2. **JWT Secret** en `docker-compose.yml`:
   ```yaml
   JWT_SECRET: dev_secret_change_in_production  # ← CAMBIAR
   ```

3. **Contraseña del Usuario Admin** (después del primer login)

### Generar Nueva Contraseña para Admin

```bash
# Generar nuevo hash (cambiar "nueva_contraseña" por la que quieras)
docker exec blendpos-backend-1 sh -c "cd /app && go run cmd/genhash/main.go"

# Actualizar en la base de datos
docker exec blendpos-postgres-1 psql -U blendpos -d blendpos -c "UPDATE usuarios SET password_hash = 'HASH_GENERADO' WHERE username = 'admin@blendpos.com';"
```

---

## 📖 Próximos Pasos

Una vez que tengas el sistema funcionando:

1. **Crear Productos:** Ve a `Gestión de Productos` en el menú admin
2. **Crear Categorías:** Ve a `Categorías` para organizar tus productos
3. **Crear Usuarios:** Crea cajeros y supervisores en `Usuarios`
4. **Configurar Proveedores:** Administra tus proveedores en `Proveedores`
5. **Abrir Caja:** Antes de vender, abre una sesión de caja en el POS
6. **Realizar Ventas:** Ve a `Terminal POS` para procesar ventas

---

## 📞 Soporte

Si encuentras problemas no cubiertos en esta guía:

1. Revisa los logs: `docker logs <nombre-contenedor> -f`
2. Verifica que todos los servicios estén corriendo: `docker ps`
3. Consulta la documentación técnica en `/backend/docs/` o `/frontend/docs/`
4. Revisa el archivo `CORRECCIONES_IMPLEMENTADAS.md` para cambios recientes

---

## 📝 Notas Adicionales

### Arquitectura de Base de Datos

- **GORM está DESACTIVADO para AutoMigrate** - El esquema se maneja exclusivamente con migraciones SQL
- Los cambios de esquema deben hacerse creando nuevas migraciones en `backend/migrations/`
- Nunca modificar directamente las tablas sin crear una migración

### Migraciones

Están numeradas secuencialmente:
- `000001` - Creación inicial de tablas principales
- `000002` - Tabla de historial de precios
- `000003` - Retry para comprobantes AFIP
- `000004` - Fix de overflow en campos decimal de caja (12,2 → 15,2)
- `000005` - Tablas faltantes (categorías, contactos, movimientos stock)

### Variables de Entorno

Configuradas en `docker-compose.yml`:
- `DATABASE_URL` - Conexión a PostgreSQL
- `REDIS_URL` - Conexión a Redis
- `JWT_SECRET` - Secreto para tokens JWT
- `AFIP_SIDECAR_URL` - URL del servicio de facturación
- `AFIP_CUIT_EMISOR` - CUIT del emisor de comprobantes

---

**¡Listo! 🎉 BlendPOS está configurado y funcionando.**

Usuario Admin: `admin@blendpos.com` | Contraseña: `1234`

Accede en: http://localhost:5173
