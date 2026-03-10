# Script para verificar que los cambios estan listos para deploy
# Ejecutar: .\verify_fix.ps1

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  Verificacion de Arreglo de Email"
Write-Host "  BlendPOS"
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Verificar que el archivo fue modificado
Write-Host "1. Verificando cambios en facturacion_worker.go..." -ForegroundColor Yellow

$workerFile = ".\backend\internal\worker\facturacion_worker.go"

if (Test-Path $workerFile) {
    $content = Get-Content $workerFile -Raw
    
    # Verificar que la condicion bloqueante fue removida
    if ($content -match 'if payload\.ClienteEmail != nil && \*payload\.ClienteEmail != "" \{' -and 
        $content -notmatch 'pdfPath != ""') {
        Write-Host "  [OK] Condicion bloqueante removida" -ForegroundColor Green
        $fix1 = $true
    } else {
        Write-Host "  [X] Condicion bloqueante aun presente" -ForegroundColor Red
        $fix1 = $false
    }
    
    # Verificar mensaje mejorado
    if ($content -match "Puedes solicitar una copia impresa") {
        Write-Host "  [OK] Mensaje alternativo sin PDF implementado" -ForegroundColor Green
        $fix2 = $true
    } else {
        Write-Host "  [X] Mensaje alternativo no encontrado" -ForegroundColor Red
        $fix2 = $false
    }
    
    # Verificar log mejorado
    if ($content -match 'Bool\("with_pdf"') {
        Write-Host "  [OK] Log mejorado con indicador with_pdf" -ForegroundColor Green
        $fix3 = $true
    } else {
        Write-Host "  [X] Log mejorado no encontrado" -ForegroundColor Red
        $fix3 = $false
    }
} else {
    Write-Host "  [X] Archivo no encontrado" -ForegroundColor Red
    $fix1 = $false
    $fix2 = $false
    $fix3 = $false
}

Write-Host ""

# Compilacion rapida
Write-Host "2. Verificando que el codigo compila..." -ForegroundColor Yellow
try {
    Push-Location backend
    $result = go build -o nul ./cmd/server 2>&1
    Pop-Location
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  [OK] Codigo compila sin errores" -ForegroundColor Green
        $compile = $true
    } else {
        Write-Host "  [X] Error de compilacion" -ForegroundColor Red
        Write-Host $result -ForegroundColor Red
        $compile = $false
    }
} catch {
    Pop-Location
    Write-Host "  [X] No se pudo compilar" -ForegroundColor Red
    $compile = $false
}

Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Resumen
if ($fix1 -and $fix2 -and $fix3 -and $compile) {
    Write-Host "[OK] Todo listo para deploy!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Proximos pasos:" -ForegroundColor Cyan
    Write-Host "1. git add backend/internal/worker/facturacion_worker.go" -ForegroundColor White
    Write-Host "2. git commit -m 'fix: send email even if PDF generation fails'" -ForegroundColor White
    Write-Host "3. git push" -ForegroundColor White
    Write-Host ""
    Write-Host "Railway se redespleara automaticamente." -ForegroundColor Gray
} else {
    Write-Host "[!] Hay problemas pendientes" -ForegroundColor Red
    Write-Host ""
    Write-Host "Revisa los errores arriba." -ForegroundColor Yellow
}

Write-Host ""
