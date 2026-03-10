# Script de Diagnóstico Email - BlendPOS
# Verifica estado de email en Railway

Write-Host "`n🔍 DIAGNÓSTICO DE EMAIL - BlendPOS" -ForegroundColor Cyan
Write-Host "================================`n" -ForegroundColor Cyan

# Variables
$RAILWAY_URL = "https://blendpos-production.up.railway.app"  # Ajusta según tu URL
$VENTA_ID = ""  # Dejar vacío, se pedirá si es necesario

Write-Host "📊 Paso 1: Verificar Health Check" -ForegroundColor Yellow
Write-Host "Comprobando configuración SMTP...`n"

try {
    $health = Invoke-RestMethod -Uri "$RAILWAY_URL/health" -Method Get
    
    if ($health.smtp -eq $true) {
        Write-Host "✅ SMTP está CONFIGURADO en el backend" -ForegroundColor Green
    } else {
        Write-Host "❌ SMTP NO está configurado" -ForegroundColor Red
        Write-Host "   Verifica las variables SMTP_* en Railway" -ForegroundColor Red
        Exit 1
    }
    
    Write-Host "   Host: $($health.smtp_host)" -ForegroundColor Gray
    Write-Host "   Puerto: $($health.smtp_port)" -ForegroundColor Gray
    
} catch {
    Write-Host "❌ Error al conectar con $RAILWAY_URL/health" -ForegroundColor Red
    Write-Host "   Verifica que el backend esté corriendo" -ForegroundColor Red
    Exit 1
}

Write-Host "`n📧 Paso 2: Verificar Puerto SMTP" -ForegroundColor Yellow

if ($health.smtp_port -eq 465) {
    Write-Host "⚠️  ADVERTENCIA: Usando puerto 465" -ForegroundColor Yellow
    Write-Host "   Railway puede bloquear este puerto" -ForegroundColor Yellow
    Write-Host "   Solución:" -ForegroundColor Cyan
    Write-Host "   1. Ve a Railway → Variables" -ForegroundColor White
    Write-Host "   2. Cambia SMTP_PORT de 465 a 587" -ForegroundColor White
    Write-Host "   3. Guarda y espera el redeploy`n" -ForegroundColor White
} elseif ($health.smtp_port -eq 587) {
    Write-Host "✅ Puerto 587 (STARTTLS) - Recomendado para Railway" -ForegroundColor Green
} else {
    Write-Host "⚠️  Puerto inusual: $($health.smtp_port)" -ForegroundColor Yellow
}

Write-Host "`n🔐 Paso 3: Verificar Credenciales Gmail" -ForegroundColor Yellow
Write-Host "Asegúrate de usar una contraseña de aplicación de Gmail:`n"
Write-Host "1. Ve a: https://myaccount.google.com/apppasswords" -ForegroundColor White
Write-Host "2. Genera una nueva contraseña para 'Correo'" -ForegroundColor White
Write-Host "3. Copia la contraseña (sin espacios)" -ForegroundColor White
Write-Host "4. Actualiza SMTP_PASSWORD en Railway`n" -ForegroundColor White

Write-Host "📋 Resumen de Configuración Actual:" -ForegroundColor Cyan
Write-Host "-----------------------------------" -ForegroundColor Gray
Write-Host "SMTP_HOST:     smtp.gmail.com" -ForegroundColor White
Write-Host "SMTP_PORT:     $($health.smtp_port)" -ForegroundColor White
Write-Host "SMTP_USER:     blendsoftware1@gmail.com" -ForegroundColor White
Write-Host "EMAIL_WORKERS: 2" -ForegroundColor White
Write-Host ""

Write-Host "🧪 Paso 4: Ver Logs de Railway" -ForegroundColor Yellow
Write-Host "Busca estos patrones en Railway → Logs:`n" -ForegroundColor White

Write-Host "✅ Email encolado correctamente:" -ForegroundColor Green
Write-Host '   "facturacion_worker: email job enqueued"' -ForegroundColor Gray

Write-Host "`n✅ Email enviado exitosamente:" -ForegroundColor Green
Write-Host '   "email_worker: comprobante sent successfully"' -ForegroundColor Gray

Write-Host "`n❌ Error de autenticación:" -ForegroundColor Red
Write-Host '   "mailer: auth: 535"' -ForegroundColor Gray
Write-Host '   → Regenera la contraseña de aplicación' -ForegroundColor Yellow

Write-Host "`n❌ Error de conexión:" -ForegroundColor Red
Write-Host '   "mailer: dial: connection refused"' -ForegroundColor Gray
Write-Host '   → Cambia a puerto 587' -ForegroundColor Yellow

Write-Host "`n❌ Timeout:" -ForegroundColor Red
Write-Host '   "mailer: dial: i/o timeout"' -ForegroundColor Gray
Write-Host '   → Puerto bloqueado, usa 587' -ForegroundColor Yellow

Write-Host "`n🚀 SOLUCIÓN MÁS PROBABLE" -ForegroundColor Cyan
Write-Host "========================" -ForegroundColor Cyan
Write-Host "Railway suele bloquear el puerto 465.`n" -ForegroundColor White

Write-Host "Cambia en Railway:" -ForegroundColor Yellow
Write-Host "  SMTP_PORT = 587  (en vez de 465)`n" -ForegroundColor White

Write-Host "El código ya soporta ambos puertos automáticamente." -ForegroundColor Green
Write-Host "Después del cambio, el email se enviará correctamente.`n" -ForegroundColor Green

Write-Host "📞 Soporte Adicional" -ForegroundColor Cyan
Write-Host "-------------------" -ForegroundColor Gray
Write-Host "Si después del cambio sigue sin funcionar:" -ForegroundColor White
Write-Host "1. Verifica que Gmail no haya bloqueado la cuenta" -ForegroundColor White
Write-Host "2. Revisa que la contraseña de aplicación sea nueva" -ForegroundColor White
Write-Host "3. Comprueba los logs de Railway en tiempo real`n" -ForegroundColor White

Write-Host "✨ Presiona cualquier tecla para salir..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
