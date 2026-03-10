# 🔍 Diagnóstico: Emails No Se Envían en Railway

## Problema Identificado

El envío de emails **depende** de que el PDF se genere exitosamente. Mirando el código en `facturacion_worker.go`:

```go
// Línea 162 y 178
if payload.ClienteEmail != nil && *payload.ClienteEmail != "" && pdfPath != "" {
    w.enqueueEmail(ctx, venta, *payload.ClienteEmail, pdfPath)
}
```

**Si `pdfPath` es vacío (porque la generación falló), el email NUNCA se encola.**

## ¿Por Qué Falla el PDF en Railway?

Railway usa contenedores efímeros sin volúmenes persistentes como Docker Compose. El problema:

1. **PDF_STORAGE_PATH** default: `/tmp/blendpos/pdfs`
2. Railway puede tener restricciones de permisos en `/tmp`
3. Si `os.MkdirAll()` falla al crear el directorio, el PDF no se genera
4. Sin PDF → sin email

## Verificación en Logs

Busca en tus logs de Railway estas líneas:

```
[WARN] facturacion_worker: PDF generation failed
[INFO] facturacion_worker: email job enqueued  // Esta línea NO aparece si el PDF falló
```

## Soluciones

### ✅ Solución 1: Enviar Email Incluso Sin PDF (Recomendado para Railway)

Modificar el código para que encole el email aunque el PDF no se haya generado.

### ✅ Solución 2: Usar Directorio con Permisos Garantizados

En Railway, usar un path dentro del directorio de la aplicación:
```
PDF_STORAGE_PATH=/app/pdfs
```

### ✅ Solución 3: Enviar Email con Link de Descarga

En lugar de adjuntar el PDF, enviar un link para descargarlo desde el backend.

## Instrucciones de Implementación

Voy a implementar la **Solución 1 + 2 combinadas**:
- Cambiar el código para que no bloquee el email si el PDF falla
- Configurar Railway con un path seguro
