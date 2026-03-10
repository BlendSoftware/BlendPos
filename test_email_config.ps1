# Script para verificar configuración de Email en BlendPOS
# Ejecutar: .\test_email_config.ps1

Write-Host "==================================" -ForegroundColor Cyan
Write-Host "  Verificación Config Email  " -ForegroundColor Cyan
Write-Host "  BlendPOS" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""

# Verificar variables de entorno
Write-Host "1. Verificando Variables de Entorno SMTP..." -ForegroundColor Yellow
Write-Host ""

$smtpVars = @{
    "SMTP_HOST" = $env:SMTP_HOST
    "SMTP_PORT" = $env:SMTP_PORT
    "SMTP_USER" = $env:SMTP_USER
    "SMTP_PASSWORD" = if ($env:SMTP_PASSWORD) { "*".PadRight($env:SMTP_PASSWORD.Length, '*') } else { $null }
    "EMAIL_WORKERS" = $env:EMAIL_WORKERS
}

$allConfigured = $true
foreach ($var in $smtpVars.GetEnumerator()) {
    if ($var.Value) {
        Write-Host "  ✓ $($var.Key): $($var.Value)" -ForegroundColor Green
    } else {
        Write-Host "  ✗ $($var.Key): NO CONFIGURADA" -ForegroundColor Red
        $allConfigured = $false
    }
}

Write-Host ""

# Verificar .env si existe
$envFile = ".\.env"
if (Test-Path $envFile) {
    Write-Host "2. Archivo .env encontrado" -ForegroundColor Green
    Write-Host ""
    Write-Host "   Contenido de variables SMTP:" -ForegroundColor Yellow
    Get-Content $envFile | Select-String -Pattern "SMTP|EMAIL_WORKERS" | ForEach-Object {
        $line = $_.Line
        # Ocultar password
        if ($line -match "SMTP_PASSWORD=(.+)") {
            $line = "SMTP_PASSWORD=***OCULTA***"
        }
        Write-Host "   $line" -ForegroundColor Cyan
    }
} else {
    Write-Host "2. Archivo .env NO encontrado" -ForegroundColor Yellow
    Write-Host "   Crea un archivo .env basado en .env.example" -ForegroundColor Gray
}

Write-Host ""
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""

# Verificar Redis
Write-Host "3. Verificando Redis..." -ForegroundColor Yellow
try {
    $redisUrl = $env:REDIS_URL
    if ($redisUrl) {
        Write-Host "  ✓ REDIS_URL configurada: $redisUrl" -ForegroundColor Green
    } else {
        Write-Host "  ✗ REDIS_URL no configurada" -ForegroundColor Red
    }
    
    # Verificar si Redis está corriendo en Docker
    $redisContainer = docker ps --filter "ancestor=redis" --format "{{.Names}}" 2>$null
    if ($redisContainer) {
        Write-Host "  ✓ Redis corriendo en Docker: $redisContainer" -ForegroundColor Green
    } else {
        Write-Host "  ⚠ Redis no encontrado en Docker local" -ForegroundColor Yellow
        Write-Host "    (Puede estar en Railway u otro servicio remoto)" -ForegroundColor Gray
    }
} catch {
    Write-Host "  ⚠ No se pudo verificar Redis" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""

# Resumen
if ($allConfigured) {
    Write-Host "✅ Configuración SMTP completa" -ForegroundColor Green
    Write-Host ""
    Write-Host "Próximos pasos:" -ForegroundColor Cyan
    Write-Host "1. Inicia el backend: cd backend; go run cmd/server/main.go" -ForegroundColor White
    Write-Host "2. Realiza una venta en el POS" -ForegroundColor White
    Write-Host "3. Ingresa un email en el campo 'Email del cliente'" -ForegroundColor White
    Write-Host "4. Confirma el pago" -ForegroundColor White
    Write-Host "5. Revisa la bandeja de entrada del email" -ForegroundColor White
    Write-Host ""
    Write-Host "Logs a revisar:" -ForegroundColor Cyan
    Write-Host "  [INFO] facturacion_worker: email job enqueued" -ForegroundColor Gray
    Write-Host "  [INFO] email_worker: comprobante sent successfully" -ForegroundColor Gray
} else {
    Write-Host "❌ Configuración incompleta" -ForegroundColor Red
    Write-Host ""
    Write-Host "Para Gmail, necesitas:" -ForegroundColor Yellow
    Write-Host "1. Habilitar autenticación de 2 factores" -ForegroundColor White
    Write-Host "2. Generar contraseña de aplicación:" -ForegroundColor White
    Write-Host "   https://myaccount.google.com/apppasswords" -ForegroundColor Cyan
    Write-Host "3. Usar esa contraseña en SMTP_PASSWORD" -ForegroundColor White
    Write-Host ""
    Write-Host "Configuración recomendada para Gmail:" -ForegroundColor Yellow
    Write-Host "  SMTP_HOST=smtp.gmail.com" -ForegroundColor White
    Write-Host "  SMTP_PORT=465" -ForegroundColor White
    Write-Host "  SMTP_USER=tu-email@gmail.com" -ForegroundColor White
    Write-Host "  SMTP_PASSWORD=xxxx xxxx xxxx xxxx" -ForegroundColor White
    Write-Host "  EMAIL_WORKERS=2" -ForegroundColor White
}

Write-Host ""
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Ver TEST_EMAIL.md para mas detalles" -ForegroundColor Cyan
