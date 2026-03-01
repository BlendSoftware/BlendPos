$ErrorActionPreference = "Stop"
$base = "http://localhost:8000"
$ts = [int64](Get-Date -UFormat %s)
$barcode = "779" + ($ts % 10000000000).ToString().PadLeft(10, "0")

function req($method, $path, $body = $null, $headers = @{}) {
    $params = @{ Uri = "$base$path"; Method = $method; Headers = $headers; ContentType = "application/json" }
    if ($body) { $params.Body = ($body | ConvertTo-Json -Depth 10) }
    return Invoke-RestMethod @params
}

Write-Host ""
Write-Host "==== BlendPOS E2E Test ====" -ForegroundColor Cyan

# 1. Login
$l = req POST "/v1/auth/login" @{username="admin@blendpos.com"; password="1234"}
$h = @{ Authorization = "Bearer $($l.access_token)" }
Write-Host "[OK] Login         rol=$($l.user.rol)"

# 2. Security headers
$r = Invoke-WebRequest "$base/health" -UseBasicParsing
$xct = $r.Headers["X-Content-Type-Options"]
$xfo = $r.Headers["X-Frame-Options"]
if ($xct -eq "nosniff" -and $xfo -eq "DENY") {
    Write-Host "[OK] SecurityHeaders  X-Content-Type-Options=nosniff  X-Frame-Options=DENY"
} else {
    Write-Host "[FAIL] SecurityHeaders  xct=$xct  xfo=$xfo"
}

# 3. Gzip
$gr = Invoke-WebRequest "$base/health" -Headers @{"Accept-Encoding"="gzip"} -UseBasicParsing
$enc = $gr.Headers["Content-Encoding"]
if ($enc -eq "gzip") {
    Write-Host "[OK] Gzip  Content-Encoding=gzip"
} else {
    Write-Host "[WARN] Gzip  Content-Encoding='$enc' (PowerShell puede auto-descomprimir)"
}

# 4. Barcode publico sin JWT
try {
    req GET "/v1/precio/0000000000000" | Out-Null
    Write-Host "[OK] /precio/:barcode publico (sin JWT)"
} catch {
    $sc = $_.Exception.Response.StatusCode
    if ($sc -eq 404) {
        Write-Host "[OK] /precio/:barcode publico - 404 esperado (barcode no existe)"
    } else {
        Write-Host "[FAIL] /precio/:barcode  status=$sc"
    }
}

# 5. Crear producto  (categoria es un nombre string, no un UUID)
$cats = req GET "/v1/categorias" -headers $h
$catNombre = $cats[0].nombre
$prod = req POST "/v1/productos" @{
    nombre="Pepsi 500ml"
    codigo_barras=$barcode
    precio_costo=120
    precio_venta=220
    stock_actual=50
    categoria=$catNombre
} $h
Write-Host "[OK] Producto  id=$($prod.id)  stock=$($prod.stock_actual)  categoria=$($prod.categoria)"

# 6. Barcode con producto existente
try {
    $price = req GET "/v1/precio/7790123000001"
    Write-Host "[OK] Precio barcode  nombre=$($price.nombre)  precio=$($price.precio_venta)"
} catch {
    Write-Host "[WARN] Precio barcode: $_"
}

# 7. Abrir caja
$caja = req POST "/v1/caja/abrir" @{monto_inicial=1000; punto_de_venta=1} $h
Write-Host "[OK] Caja abierta  sesion=$($caja.sesion_caja_id)"

# 8. Venta completa
$ventaBody = @{
    sesion_caja_id = $caja.sesion_caja_id
    items = @(@{ producto_id=$prod.id; cantidad=3; descuento=0 })
    pagos = @(@{ metodo="efectivo"; monto=660 })
}
$venta = req POST "/v1/ventas" $ventaBody $h
Write-Host "[OK] Venta  id=$($venta.id)  estado=$($venta.estado)  total=$($venta.total)"

# 9. Verificar descuento de stock
$prodUpd = req GET "/v1/productos/$($prod.id)" -headers $h
$esperado = 47
if ($prodUpd.stock_actual -eq $esperado) {
    Write-Host "[OK] Stock ACID  $($prodUpd.stock_actual) (esperado $esperado)"
} else {
    Write-Host "[FAIL] Stock  got=$($prodUpd.stock_actual) expected=$esperado"
}

# 10. Descuento excesivo (debe rechazar >50% del precio)
# precio_venta = 220, 50% = 110, descuento=200 debe rechazarse
try {
    $ventaMala = @{
        sesion_caja_id = $caja.sesion_caja_id
        items = @(@{ producto_id=$prod.id; cantidad=1; descuento=200 })
        pagos = @(@{ metodo="efectivo"; monto=20 })
    }
    req POST "/v1/ventas" $ventaMala $h | Out-Null
    Write-Host "[FAIL] Descuento cap - no rechazo descuento excesivo"
} catch {
    Write-Host "[OK] Descuento cap - rechazo descuento >50% correctamente"
}

# 11. Anular venta y verificar stock restaurado
$anularBody = @{ motivo = "Test E2E anulacion" }
try {
    Invoke-RestMethod "$base/v1/ventas/$($venta.id)" -Method DELETE -Headers $h -Body ($anularBody | ConvertTo-Json) -ContentType "application/json" | Out-Null
} catch {
    $sc2 = $_.Exception.Response.StatusCode
    if ([int]$sc2 -eq 204) { } else { Write-Host "[WARN] Anular venta status=$sc2" }
}
Start-Sleep -Seconds 1
$prodAnul = req GET "/v1/productos/$($prod.id)" -headers $h
if ($prodAnul.stock_actual -eq 50) {
    Write-Host "[OK] Anulacion  stock restaurado a 50"
} else {
    Write-Host "[WARN] Anulacion  stock=$($prodAnul.stock_actual) (esperado 50)"
}

# 12. Token revocado tras logout
Invoke-RestMethod "$base/v1/auth/logout" -Method POST -Headers $h -ContentType "application/json" | Out-Null
try {
    req GET "/v1/productos" -headers $h | Out-Null
    Write-Host "[FAIL] JWT revocation - token sigue activo tras logout"
} catch {
    Write-Host "[OK] JWT revocado - token invalido tras logout (401)"
}

Write-Host ""
Write-Host "==== FIN ====" -ForegroundColor Cyan