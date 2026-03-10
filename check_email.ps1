# Script para verificar configuracion de Email en BlendPOS
# Ejecutar: .\check_email.ps1

Write-Host "=================================="
Write-Host "  Verificacion Config Email"
Write-Host "  BlendPOS"
Write-Host "=================================="
Write-Host ""

# Verificar variables de entorno
Write-Host "1. Variables de Entorno SMTP..."
Write-Host ""

$configured = 0
$total = 5

if ($env:SMTP_HOST) {
    Write-Host "  [OK] SMTP_HOST: $env:SMTP_HOST"
    $configured++
} else {
    Write-Host "  [X] SMTP_HOST: NO CONFIGURADA"
}

if ($env:SMTP_PORT) {
    Write-Host "  [OK] SMTP_PORT: $env:SMTP_PORT"
    $configured++
} else {
    Write-Host "  [X] SMTP_PORT: NO CONFIGURADA"
}

if ($env:SMTP_USER) {
    Write-Host "  [OK] SMTP_USER: $env:SMTP_USER"
    $configured++
} else {
    Write-Host "  [X] SMTP_USER: NO CONFIGURADA"
}

if ($env:SMTP_PASSWORD) {
    Write-Host "  [OK] SMTP_PASSWORD: ********"
    $configured++
} else {
    Write-Host "  [X] SMTP_PASSWORD: NO CONFIGURADA"
}

if ($env:EMAIL_WORKERS) {
    Write-Host "  [OK] EMAIL_WORKERS: $env:EMAIL_WORKERS"
    $configured++
} else {
    Write-Host "  [X] EMAIL_WORKERS: NO CONFIGURADA"
}

Write-Host ""
Write-Host "Configuradas: $configured de $total"
Write-Host ""

# Verificar .env
if (Test-Path ".\.env") {
    Write-Host "2. Archivo .env encontrado"
} else {
    Write-Host "2. Archivo .env NO encontrado"
}

Write-Host ""
Write-Host "=================================="
Write-Host ""

if ($configured -eq $total) {
    Write-Host "[OK] Configuracion completa!"
    Write-Host ""
    Write-Host "Para probar:"
    Write-Host "1. Inicia el backend"
    Write-Host "2. Haz una venta"
    Write-Host "3. Ingresa un email valido"
    Write-Host "4. Confirma el pago"
    Write-Host "5. Revisa la bandeja"
} else {
    Write-Host "[!] Configuracion incompleta"
    Write-Host ""
    Write-Host "Necesitas configurar:"
    Write-Host "  SMTP_HOST=smtp.gmail.com"
    Write-Host "  SMTP_PORT=465"
    Write-Host "  SMTP_USER=tu-email@gmail.com"
    Write-Host "  SMTP_PASSWORD=xxxx xxxx xxxx xxxx"
    Write-Host "  EMAIL_WORKERS=2"
}

Write-Host ""
