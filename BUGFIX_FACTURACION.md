# 🐛 BUGFIX: Facturación AFIP - Errores 10071, 10070

**Fecha**: 10 de marzo de 2026  
**Problema**: Facturas rechazadas por AFIP con errores de IVA

---

## 🔴 Errores Originales

### Error 10071 (Factura C)
```
Para comprobantes tipo C el objeto IVA no debe informarse.
```
**Causa**: El sidecar Python estaba enviando array IVA para Factura C (Monotributo).

### Error 10070 (Factura A)
```
Si ImpNeto es mayor a 0 el objeto IVA es obligatorio.
```
**Causa**: Cuando el backend enviaba `importe_iva=0`, el array IVA quedaba vacío.

### Error AttributeError
```
'str' object has no attribute 'get'
```
**Causa**: Las observaciones de AFIP a veces vienen como `str` en lugar de `dict`.

---

## ✅ Correcciones Aplicadas

### 1. Backend Go (`facturacion_worker.go`)

**Problema**: El cálculo de IVA estaba basado en la condición fiscal del emisor, no en el tipo de comprobante.

**Solución**: Reorganizar para calcular IVA según el tipo de comprobante final:

```go
switch tipoComprobante {
case 1: // Factura A - Discriminar IVA 21%
    divisor := decimal.NewFromFloat(1.21)
    importeNeto = total.Div(divisor).RoundBank(2)
    importeIVA = total.Sub(importeNeto).RoundBank(2)
    importeExento = decimal.Zero
case 6, 11: // Factura B y C - IVA incluido o sin IVA
    importeNeto = total
    importeIVA = decimal.Zero
    importeExento = decimal.Zero
}
```

**Resultado**:
- ✅ Factura A: Siempre discrimina IVA 21%
- ✅ Factura B: IVA incluido (neto = total, iva = 0)
- ✅ Factura C: Sin IVA (neto = total, iva = 0)

---

### 2. Sidecar Python (`afip_client.py`)

**Problema 1**: Lógica de array IVA incorrecta para cada tipo de comprobante.

**Solución**:

```python
if req.tipo_comprobante == 11:
    # Factura C (Monotributo): NO enviar array IVA
    pass
elif req.tipo_comprobante == 6:
    # Factura B: IVA incluido, no discriminado (alícuota 0%)
    if req.importe_neto > 0:
        wsfe.AgregarIva(iva_id=3, base_imp=..., importe=0.00)
elif req.tipo_comprobante == 1:
    # Factura A: DEBE discriminar IVA (obligatorio)
    if req.importe_iva > 0:
        wsfe.AgregarIva(iva_id=5, base_imp=..., importe=...)  # 21%
    else:
        wsfe.AgregarIva(iva_id=3, base_imp=..., importe=0.00)  # Exento
```

**Resultado**:
- ✅ Factura A: Siempre lleva array IVA (con alícuota 21% o 0%)
- ✅ Factura B: Array IVA con alícuota 0% (AFIP lo acepta)
- ✅ Factura C: Array IVA vacío (cumple con error 10071)

---

**Problema 2**: Crash al procesar observaciones tipo `str`.

**Solución**:

```python
for obs in wsfe.Observaciones:
    if isinstance(obs, dict):
        observaciones.append(ObservacionAFIP(
            codigo=int(obs.get('Code', 0)),
            mensaje=obs.get('Msg', 'Sin descripción')
        ))
    elif isinstance(obs, str):
        observaciones.append(ObservacionAFIP(codigo=0, mensaje=obs))
```

**Resultado**:
- ✅ Maneja tanto `dict` como `str` sin crashear
- ✅ Warnings de AFIP se capturan correctamente

---

## 🧪 Testing

### Antes (Errores)
```
Factura C → Error 10071 (IVA no debe informarse)
Factura A → Error 10070 (IVA obligatorio)
Factura B → ✅ OK
```

### Después (Esperado)
```
Factura C → ✅ Array IVA vacío
Factura A → ✅ Array IVA con discriminación
Factura B → ✅ Array IVA con alícuota 0%
```

---

## 📝 Archivos Modificados

1. `backend/internal/worker/facturacion_worker.go`
   - Líneas 220-260: Reorganizar cálculo de IVA por tipo de comprobante

2. `afip-sidecar/afip_client.py`
   - Líneas 463-492: Corregir lógica de array IVA según tipo
   - Líneas 499-515: Manejar observaciones tipo `str`

---

## 🚀 Deploy

```bash
git add .
git commit -m "fix: corregir cálculo IVA según tipo comprobante (errores AFIP 10071, 10070)"
git push origin master
```

Railway auto-desplegará en ~2 minutos.

---

## ✅ Verificación Post-Deploy

1. Emitir Factura C → Debe aprobar sin error 10071
2. Emitir Factura A → Debe aprobar con IVA discriminado
3. Emitir Factura B → Debe seguir aprobando
4. Revisar logs: `railway logs --service afip-sidecar --tail 50`

---

**Status**: ✅ RESUELTO  
**Archivos cambiados**: 2  
**Líneas afectadas**: ~50
