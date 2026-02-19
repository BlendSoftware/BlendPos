package service

import (
"bytes"
"context"
"encoding/csv"
"fmt"
"io"
"strconv"
"strings"

"blendpos/internal/dto"
"blendpos/internal/model"
"blendpos/internal/repository"

"github.com/google/uuid"
"github.com/shopspring/decimal"
"gorm.io/gorm"
)

type ProveedorService interface {
Crear(ctx context.Context, req dto.CrearProveedorRequest) (*dto.ProveedorResponse, error)
ObtenerPorID(ctx context.Context, id uuid.UUID) (*dto.ProveedorResponse, error)
Listar(ctx context.Context) ([]dto.ProveedorResponse, error)
Actualizar(ctx context.Context, id uuid.UUID, req dto.CrearProveedorRequest) (*dto.ProveedorResponse, error)
Eliminar(ctx context.Context, id uuid.UUID) error
ActualizarPreciosMasivo(ctx context.Context, id uuid.UUID, req dto.ActualizarPreciosMasivoRequest) (*dto.ActualizacionMasivaResponse, error)
ImportarCSV(ctx context.Context, proveedorID uuid.UUID, csvData []byte) (*dto.CSVImportResponse, error)
}

type proveedorService struct {
repo         repository.ProveedorRepository
productoRepo repository.ProductoRepository
}

func NewProveedorService(repo repository.ProveedorRepository, productoRepo repository.ProductoRepository) ProveedorService {
return &proveedorService{repo: repo, productoRepo: productoRepo}
}

//  CRUD 

func (s *proveedorService) Crear(ctx context.Context, req dto.CrearProveedorRequest) (*dto.ProveedorResponse, error) {
p := &model.Proveedor{
RazonSocial:   req.RazonSocial,
CUIT:          req.CUIT,
Telefono:      req.Telefono,
Email:         req.Email,
Direccion:     req.Direccion,
CondicionPago: req.CondicionPago,
Activo:        true,
}
if err := s.repo.Create(ctx, p); err != nil {
if strings.Contains(err.Error(), "unique") || strings.Contains(err.Error(), "duplicate") {
return nil, fmt.Errorf("ya existe un proveedor con el CUIT %s", req.CUIT)
}
return nil, fmt.Errorf("error al crear proveedor: %w", err)
}
return proveedorToResponse(p), nil
}

func (s *proveedorService) ObtenerPorID(ctx context.Context, id uuid.UUID) (*dto.ProveedorResponse, error) {
p, err := s.repo.FindByID(ctx, id)
if err != nil {
return nil, fmt.Errorf("proveedor no encontrado")
}
if !p.Activo {
return nil, fmt.Errorf("proveedor no encontrado")
}
return proveedorToResponse(p), nil
}

func (s *proveedorService) Listar(ctx context.Context) ([]dto.ProveedorResponse, error) {
proveedores, err := s.repo.List(ctx)
if err != nil {
return nil, fmt.Errorf("error al listar proveedores: %w", err)
}
resp := make([]dto.ProveedorResponse, len(proveedores))
for i, p := range proveedores {
resp[i] = *proveedorToResponse(&p)
}
return resp, nil
}

func (s *proveedorService) Actualizar(ctx context.Context, id uuid.UUID, req dto.CrearProveedorRequest) (*dto.ProveedorResponse, error) {
p, err := s.repo.FindByID(ctx, id)
if err != nil || !p.Activo {
return nil, fmt.Errorf("proveedor no encontrado")
}
p.RazonSocial = req.RazonSocial
p.CUIT = req.CUIT
p.Telefono = req.Telefono
p.Email = req.Email
p.Direccion = req.Direccion
p.CondicionPago = req.CondicionPago
if err := s.repo.Update(ctx, p); err != nil {
return nil, fmt.Errorf("error al actualizar proveedor: %w", err)
}
return proveedorToResponse(p), nil
}

func (s *proveedorService) Eliminar(ctx context.Context, id uuid.UUID) error {
p, err := s.repo.FindByID(ctx, id)
if err != nil || !p.Activo {
return fmt.Errorf("proveedor no encontrado")
}
return s.repo.SoftDelete(ctx, id)
}

//  Actualización masiva de precios (AC-07.2, AC-07.3) 

// ActualizarPreciosMasivo actualiza el precio_costo de todos los productos de un proveedor
// por un porcentaje dado. Si req.Preview = true, retorna el cálculo sin aplicar cambios.
// Si req.RecalcularVenta = true y req.MargenDefault > 0, recalcula precio_venta.
// Registra historial inmutable para cada producto afectado (RF-26).
func (s *proveedorService) ActualizarPreciosMasivo(
ctx context.Context,
proveedorID uuid.UUID,
req dto.ActualizarPreciosMasivoRequest,
) (*dto.ActualizacionMasivaResponse, error) {
prov, err := s.repo.FindByID(ctx, proveedorID)
if err != nil || !prov.Activo {
return nil, fmt.Errorf("proveedor no encontrado")
}

productos, err := s.productoRepo.FindByProveedorID(ctx, proveedorID)
if err != nil {
return nil, fmt.Errorf("error al obtener productos del proveedor: %w", err)
}
if len(productos) == 0 {
return &dto.ActualizacionMasivaResponse{
Proveedor:          prov.RazonSocial,
Porcentaje:         req.Porcentaje,
ProductosAfectados: 0,
Preview:            []dto.PrecioPreviewItem{},
}, nil
}

cien := decimal.NewFromInt(100)
multiplier := decimal.NewFromInt(1).Add(req.Porcentaje.Div(cien))

previews := make([]dto.PrecioPreviewItem, 0, len(productos))
for _, prod := range productos {
costoNuevo := prod.PrecioCosto.Mul(multiplier).Round(2)
ventaNueva := prod.PrecioVenta
if req.RecalcularVenta && req.MargenDefault.GreaterThan(decimal.Zero) {
ventaNueva = costoNuevo.Mul(decimal.NewFromInt(1).Add(req.MargenDefault.Div(cien))).Round(2)
}

previews = append(previews, dto.PrecioPreviewItem{
ProductoID:        prod.ID.String(),
Nombre:            prod.Nombre,
PrecioCostoActual: prod.PrecioCosto,
PrecioCostoNuevo:  costoNuevo,
PrecioVentaActual: prod.PrecioVenta,
PrecioVentaNuevo:  ventaNueva,
DiferenciaCosto:   costoNuevo.Sub(prod.PrecioCosto).Round(2),
MargenNuevo:       calcularMargen(costoNuevo, ventaNueva),
})
}

resp := &dto.ActualizacionMasivaResponse{
Proveedor:          prov.RazonSocial,
Porcentaje:         req.Porcentaje,
ProductosAfectados: len(previews),
Preview:            previews,
}

// Modo preview: devolver cálculo sin modificar la BD (AC-07.3)
if req.Preview {
return resp, nil
}

// Aplicar en una única transacción ACID y registrar historial (RF-26)
// runTx handles nil DB gracefully for unit tests (see venta_service.go)
err = runTx(ctx, s.productoRepo.DB(), func(tx *gorm.DB) error {
for i, item := range previews {
prodID, _ := uuid.Parse(item.ProductoID)
margen := calcularMargen(item.PrecioCostoNuevo, item.PrecioVentaNuevo)

if err := s.productoRepo.UpdatePreciosTx(tx, prodID,
item.PrecioCostoNuevo, item.PrecioVentaNuevo, margen); err != nil {
return fmt.Errorf("error al actualizar %s: %w", item.Nombre, err)
}

// Registrar historial (omitir cuando tx es nil en tests)
if tx != nil {
h := &model.HistorialPrecio{
ProductoID:         prodID,
ProveedorID:        &proveedorID,
CostoAntes:         productos[i].PrecioCosto,
CostoDespues:       item.PrecioCostoNuevo,
VentaAntes:         productos[i].PrecioVenta,
VentaDespues:       item.PrecioVentaNuevo,
PorcentajeAplicado: req.Porcentaje,
Motivo:             "actualizacion_masiva",
}
if err := tx.Create(h).Error; err != nil {
return fmt.Errorf("error al registrar historial: %w", err)
}
}
}
return nil
})
if err != nil {
return nil, err
}

// Respuesta final sin preview (ya se aplicó)
resp.Preview = nil
return resp, nil
}

//  Import CSV (AC-07.4, AC-07.5) 

// ImportarCSV procesa un archivo CSV con productos y realiza upsert por codigo_barras.
// Formato: codigo_barras,nombre,precio_costo,precio_venta[,unidades_por_bulto][,categoria]
// Las filas con error se registran individualmente sin abortar el lote.
func (s *proveedorService) ImportarCSV(ctx context.Context, proveedorID uuid.UUID, csvData []byte) (*dto.CSVImportResponse, error) {
prov, err := s.repo.FindByID(ctx, proveedorID)
if err != nil || !prov.Activo {
return nil, fmt.Errorf("proveedor no encontrado")
}

// Validar que no sea un archivo binario (AC-07.5)
if !isValidCSVBytes(csvData) {
return nil, fmt.Errorf("formato de archivo inválido. Se esperaba texto CSV")
}

reader := csv.NewReader(bytes.NewReader(csvData))
reader.TrimLeadingSpace = true
reader.Comment = '#'

header, err := reader.Read()
if err != nil {
return nil, fmt.Errorf("CSV vacío o encabezado inválido")
}
if err := validarEncabezadoCSV(header); err != nil {
return nil, err
}

result := &dto.CSVImportResponse{
DetalleErrores: []dto.CSVErrorRow{},
}
fila := 1 // encabezado = fila 1; datos empiezan en fila 2

for {
fila++
record, err := reader.Read()
if err == io.EOF {
break
}
if err != nil {
result.TotalFilas++
result.Errores++
result.DetalleErrores = append(result.DetalleErrores, dto.CSVErrorRow{
Fila:   fila,
Motivo: fmt.Sprintf("error de lectura: %v", err),
})
continue
}
result.TotalFilas++

fRow, errMsg := parsearFilaCSV(record)
if errMsg != "" {
result.Errores++
result.DetalleErrores = append(result.DetalleErrores, dto.CSVErrorRow{
Fila:   fila,
Motivo: errMsg,
})
continue
}

created, upsertErr := s.upsertProductoDesdeCSV(ctx, fRow, proveedorID)
if upsertErr != nil {
result.Errores++
result.DetalleErrores = append(result.DetalleErrores, dto.CSVErrorRow{
Fila:   fila,
Motivo: upsertErr.Error(),
})
continue
}

result.Procesadas++
if created {
result.Creadas++
} else {
result.Actualizadas++
}
}

return result, nil
}

//  helpers 

// isValidCSVBytes detecta archivos binarios (ZIP/XLSX, OLE2/XLS) y bytes nulos.
func isValidCSVBytes(data []byte) bool {
if len(data) == 0 {
return false
}
// ZIP signature  XLSX/DOCX/ODS
if len(data) >= 4 && data[0] == 0x50 && data[1] == 0x4B {
return false
}
// OLE2 signature  XLS antiguo
if len(data) >= 8 && data[0] == 0xD0 && data[1] == 0xCF {
return false
}
for _, b := range data {
if b == 0 {
return false
}
}
return true
}

// validarEncabezadoCSV verifica que el encabezado contiene las columnas obligatorias.
func validarEncabezadoCSV(header []string) error {
requeridos := []string{"codigo_barras", "nombre", "precio_costo", "precio_venta"}
normalizado := make(map[string]bool, len(header))
for _, h := range header {
normalizado[strings.TrimSpace(strings.ToLower(h))] = true
}
for _, col := range requeridos {
if !normalizado[col] {
return fmt.Errorf("columna requerida '%s' no encontrada en el CSV", col)
}
}
return nil
}

// csvFilaData contiene los datos parseados de una fila CSV.
type csvFilaData struct {
CodigoBarras    string
Nombre          string
PrecioCosto     decimal.Decimal
PrecioVenta     decimal.Decimal
UnidadesPorBulto int
Categoria       string
}

// parsearFilaCSV convierte un record CSV en csvFilaData.
// Orden esperado: codigo_barras, nombre, precio_costo, precio_venta[, unidades_por_bulto][, categoria]
func parsearFilaCSV(record []string) (*csvFilaData, string) {
if len(record) < 4 {
return nil, "fila con menos de 4 columnas (mínimo requerido)"
}
barcode := strings.TrimSpace(record[0])
nombre := strings.TrimSpace(record[1])
costoStr := strings.TrimSpace(record[2])
ventaStr := strings.TrimSpace(record[3])

if barcode == "" {
return nil, "codigo_barras vacío"
}
if nombre == "" {
return nil, "nombre vacío"
}
costo, err := decimal.NewFromString(costoStr)
if err != nil || costo.LessThanOrEqual(decimal.Zero) {
return nil, "precio_costo debe ser un número mayor a 0"
}
venta, err := decimal.NewFromString(ventaStr)
if err != nil || venta.LessThanOrEqual(decimal.Zero) {
return nil, "precio_venta debe ser un número mayor a 0"
}
if venta.LessThan(costo) {
return nil, fmt.Sprintf("precio_venta (%.2f) no puede ser menor al precio_costo (%.2f)",
venta.InexactFloat64(), costo.InexactFloat64())
}

unidades := 1
if len(record) >= 5 && strings.TrimSpace(record[4]) != "" {
if u, err := strconv.Atoi(strings.TrimSpace(record[4])); err == nil && u > 0 {
unidades = u
}
}
categoria := "general"
if len(record) >= 6 && strings.TrimSpace(record[5]) != "" {
categoria = strings.TrimSpace(strings.ToLower(record[5]))
}

return &csvFilaData{
CodigoBarras:    barcode,
Nombre:          nombre,
PrecioCosto:     costo,
PrecioVenta:     venta,
UnidadesPorBulto: unidades,
Categoria:       categoria,
}, ""
}

// upsertProductoDesdeCSV crea o actualiza un producto por código de barras.
// Retorna (true, nil) si fue creado, (false, nil) si fue actualizado.
func (s *proveedorService) upsertProductoDesdeCSV(
ctx context.Context,
row *csvFilaData,
proveedorID uuid.UUID,
) (created bool, err error) {
margen := calcularMargen(row.PrecioCosto, row.PrecioVenta)

existing, findErr := s.productoRepo.FindByBarcode(ctx, row.CodigoBarras)
if findErr != nil {
// Producto no existe  crear
nuevo := &model.Producto{
CodigoBarras: row.CodigoBarras,
Nombre:       row.Nombre,
Categoria:    row.Categoria,
PrecioCosto:  row.PrecioCosto,
PrecioVenta:  row.PrecioVenta,
MargenPct:    margen,
ProveedorID:  &proveedorID,
Activo:       true,
UnidadMedida: "unidad",
}
if err := s.productoRepo.Create(ctx, nuevo); err != nil {
return false, fmt.Errorf("error al crear producto: %w", err)
}
_ = s.repo.CreateHistorialPrecio(ctx, &model.HistorialPrecio{
ProductoID:         nuevo.ID,
ProveedorID:        &proveedorID,
CostoAntes:         decimal.Zero,
CostoDespues:       row.PrecioCosto,
VentaAntes:         decimal.Zero,
VentaDespues:       row.PrecioVenta,
PorcentajeAplicado: decimal.Zero,
Motivo:             "csv_import",
})
return true, nil
}

// Actualizar si hay cambio de precios
costoAntes := existing.PrecioCosto
ventaAntes := existing.PrecioVenta
existing.Nombre = row.Nombre
existing.Categoria = row.Categoria
existing.PrecioCosto = row.PrecioCosto
existing.PrecioVenta = row.PrecioVenta
existing.MargenPct = margen
if existing.ProveedorID == nil {
existing.ProveedorID = &proveedorID
}

if err := s.productoRepo.Update(ctx, existing); err != nil {
return false, fmt.Errorf("error al actualizar producto: %w", err)
}

// Registrar historial solo si hubo cambio de precios
if !costoAntes.Equal(row.PrecioCosto) || !ventaAntes.Equal(row.PrecioVenta) {
var pctCambio decimal.Decimal
if !costoAntes.IsZero() {
pctCambio = row.PrecioCosto.Sub(costoAntes).Div(costoAntes).Mul(decimal.NewFromInt(100)).Round(2)
}
_ = s.repo.CreateHistorialPrecio(ctx, &model.HistorialPrecio{
ProductoID:         existing.ID,
ProveedorID:        &proveedorID,
CostoAntes:         costoAntes,
CostoDespues:       row.PrecioCosto,
VentaAntes:         ventaAntes,
VentaDespues:       row.PrecioVenta,
PorcentajeAplicado: pctCambio,
Motivo:             "csv_import",
})
}

return false, nil
}

// calcularMargen calcula (venta - costo) / costo * 100. Retorna zero si costo = 0.
func calcularMargen(costo, venta decimal.Decimal) decimal.Decimal {
if costo.IsZero() {
return decimal.Zero
}
return venta.Sub(costo).Div(costo).Mul(decimal.NewFromInt(100)).Round(2)
}

// proveedorToResponse convierte model.Proveedor a dto.ProveedorResponse.
func proveedorToResponse(p *model.Proveedor) *dto.ProveedorResponse {
return &dto.ProveedorResponse{
ID:            p.ID.String(),
RazonSocial:   p.RazonSocial,
CUIT:          p.CUIT,
Telefono:      p.Telefono,
Email:         p.Email,
Direccion:     p.Direccion,
CondicionPago: p.CondicionPago,
Activo:        p.Activo,
}
}
