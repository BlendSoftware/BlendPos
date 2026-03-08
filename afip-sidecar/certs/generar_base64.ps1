# Script para generar certificados AFIP en Base64 para Railway
# Ejecutar desde: C:\Users\juani\Desktop\BlendPos\afip-sidecar\certs\

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  GENERAR CERTIFICADOS AFIP BASE64" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Verificar que los archivos existen
if (-Not (Test-Path "afip.crt")) {
    Write-Host "❌ ERROR: No se encuentra afip.crt en esta carpeta" -ForegroundColor Red
    Write-Host "   Ubicación actual: $(Get-Location)" -ForegroundColor Yellow
    exit 1
}

if (-Not (Test-Path "afip.key")) {
    Write-Host "❌ ERROR: No se encuentra afip.key en esta carpeta" -ForegroundColor Red
    Write-Host "   Ubicación actual: $(Get-Location)" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ Archivos encontrados:" -ForegroundColor Green
Write-Host "   - afip.crt" -ForegroundColor White
Write-Host "   - afip.key" -ForegroundColor White
Write-Host ""

# Generar base64 del certificado
Write-Host "🔐 Generando base64 de afip.crt..." -ForegroundColor Yellow
$certBytes = [IO.File]::ReadAllBytes("$PWD\afip.crt")
$certBase64 = [Convert]::ToBase64String($certBytes)
$certBase64 | Out-File -FilePath "cert_base64.txt" -Encoding ascii -NoNewline

Write-Host "✅ Guardado en: cert_base64.txt" -ForegroundColor Green
Write-Host "   Tamaño: $($certBase64.Length) caracteres" -ForegroundColor Gray
Write-Host ""

# Generar base64 de la clave privada
Write-Host "🔐 Generando base64 de afip.key..." -ForegroundColor Yellow
$keyBytes = [IO.File]::ReadAllBytes("$PWD\afip.key")
$keyBase64 = [Convert]::ToBase64String($keyBytes)
$keyBase64 | Out-File -FilePath "key_base64.txt" -Encoding ascii -NoNewline

Write-Host "✅ Guardado en: key_base64.txt" -ForegroundColor Green
Write-Host "   Tamaño: $($keyBase64.Length) caracteres" -ForegroundColor Gray
Write-Host ""

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  📋 PRÓXIMOS PASOS" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Abre Railway → Tu Proyecto → Servicio 'afip-sidecar' → Variables" -ForegroundColor White
Write-Host ""
Write-Host "2. Agrega estas 2 nuevas variables:" -ForegroundColor White
Write-Host ""
Write-Host "   Variable: AFIP_CERT_B64" -ForegroundColor Yellow
Write-Host "   Valor: [copia todo el contenido de cert_base64.txt]" -ForegroundColor Gray
Write-Host "   Tipo: ✅ Secret" -ForegroundColor Green
Write-Host ""
Write-Host "   Variable: AFIP_KEY_B64" -ForegroundColor Yellow
Write-Host "   Valor: [copia todo el contenido de key_base64.txt]" -ForegroundColor Gray
Write-Host "   Tipo: ✅ Secret" -ForegroundColor Green
Write-Host ""
Write-Host "3. Railway reiniciará automáticamente el servicio" -ForegroundColor White
Write-Host ""
Write-Host "4. Verifica los logs del afip-sidecar:" -ForegroundColor White
Write-Host "   Debes ver: '✅ Certificados AFIP listos en /certs/'" -ForegroundColor Gray
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Opción de copiar al portapapeles
Write-Host "¿Quieres copiar AFIP_CERT_B64 al portapapeles ahora? (s/n): " -NoNewline -ForegroundColor Yellow
$respuesta = Read-Host

if ($respuesta -eq "s" -or $respuesta -eq "S") {
    $certBase64 | Set-Clipboard
    Write-Host "✅ AFIP_CERT_B64 copiado al portapapeles" -ForegroundColor Green
    Write-Host "   Pégalo en Railway como variable 'AFIP_CERT_B64'" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Presiona ENTER cuando hayas pegado el certificado..." -ForegroundColor Yellow
    Read-Host
    
    Write-Host "¿Copiar AFIP_KEY_B64 al portapapeles ahora? (s/n): " -NoNewline -ForegroundColor Yellow
    $respuesta2 = Read-Host
    
    if ($respuesta2 -eq "s" -or $respuesta2 -eq "S") {
        $keyBase64 | Set-Clipboard
        Write-Host "✅ AFIP_KEY_B64 copiado al portapapeles" -ForegroundColor Green
        Write-Host "   Pégalo en Railway como variable 'AFIP_KEY_B64'" -ForegroundColor Gray
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "✅ PROCESO COMPLETADO" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Archivos generados:" -ForegroundColor White
Write-Host "  - cert_base64.txt  (para AFIP_CERT_B64)" -ForegroundColor Gray
Write-Host "  - key_base64.txt   (para AFIP_KEY_B64)" -ForegroundColor Gray
Write-Host ""
Write-Host "⚠️  IMPORTANTE: Borra estos archivos después de configurar Railway" -ForegroundColor Yellow
Write-Host ""
