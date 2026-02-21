$ErrorActionPreference = "Stop"
$BASE = "http://localhost:8000"

# 1. LOGIN
$loginBody = '{"username":"admin","password":"blendpos2026"}'
$r = Invoke-RestMethod -Method POST -Uri "$BASE/v1/auth/login" -ContentType "application/json" -Body $loginBody
$TOKEN = $r.access_token
$h = @{ Authorization = "Bearer $TOKEN"; "Content-Type" = "application/json" }
Write-Host "LOGIN OK: rol=$($r.user.rol) id=$($r.user.id)"

# 2. GET or CREATE product
try {
    $prods = Invoke-RestMethod -Uri "$BASE/v1/productos" -Headers $h
    $p0 = $prods.data | Where-Object { $_.activo -eq $true } | Select-Object -First 1
    if (-not $p0) { throw "no active product" }
    $PROD_ID = $p0.id
    Write-Host "PROD existing: $PROD_ID ($($p0.nombre))"
} catch {
    $prodObj = [ordered]@{
        nombre        = "Coca Cola 500ml"
        codigo_barras = "77900100"
        categoria     = "bebidas"
        precio_costo  = 150
        precio_venta  = 250
        stock_actual  = 100
    }
    $prodJson = $prodObj | ConvertTo-Json -Compress
    $np = Invoke-RestMethod -Method POST -Uri "$BASE/v1/productos" -Headers $h -Body $prodJson
    $PROD_ID = $np.id
    Write-Host "PROD created: $PROD_ID"
}

# 3. GET or OPEN caja
try {
    $cajaActiva = Invoke-RestMethod -Uri "$BASE/v1/caja/activa" -Headers $h
    $CAJA_ID = $cajaActiva.sesion_caja_id
    Write-Host "CAJA activa: $CAJA_ID"
} catch {
    $cajaObj = [ordered]@{ punto_de_venta = 1; monto_inicial = 1000 }
    $cajaJson = $cajaObj | ConvertTo-Json -Compress
    $nc = Invoke-RestMethod -Method POST -Uri "$BASE/v1/caja/abrir" -Headers $h -Body $cajaJson
    $CAJA_ID = $nc.sesion_caja_id
    Write-Host "CAJA opened: $CAJA_ID"
}

Write-Host ""
Write-Host "--- Registrando venta ---"
Write-Host "CAJA_ID = $CAJA_ID"
Write-Host "PROD_ID = $PROD_ID"

# 4. POST /v1/ventas using object -> ConvertTo-Json
$ventaObj = [ordered]@{
    sesion_caja_id = $CAJA_ID
    items          = @(
        [ordered]@{ producto_id = $PROD_ID; cantidad = 1; descuento = 0 }
    )
    pagos          = @(
        [ordered]@{ metodo = "efectivo"; monto = 250 }
    )
}
$ventaJson = $ventaObj | ConvertTo-Json -Depth 5 -Compress
Write-Host "BODY: $ventaJson"

try {
    $v = Invoke-RestMethod -Method POST -Uri "$BASE/v1/ventas" -Headers $h -Body $ventaJson -ContentType "application/json"
    $VENTA_ID = $v.id
    Write-Host "OK VENTA: id=$VENTA_ID ticket=$($v.numero_ticket) total=$($v.total)"
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    $body = $_.ErrorDetails.Message
    Write-Host "ERROR venta $statusCode : $body"
    Write-Host "--- Backend logs ---"
    docker compose logs --tail=30 backend
    exit 1
}

# 5. Wait and poll for facturacion (AFIP processes asynchronously)
Write-Host ""
Write-Host "--- Esperando facturacion (20s) ---"
Start-Sleep 20

try {
    $f = Invoke-RestMethod -Uri "$BASE/v1/facturacion/$VENTA_ID" -Headers $h
    Write-Host "OK FACTURA:"
    $f | ConvertTo-Json -Depth 6 | Write-Host
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    $body = $_.ErrorDetails.Message
    Write-Host "WARN facturacion $statusCode : $body"
    Write-Host "(Puede estar en cola o requiere AFIP HOMO activo)"
}

Write-Host ""
Write-Host "--- Backend logs (tail 40) ---"
docker compose logs --tail=40 backend
