package service

import (
	"context"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"time"

	"blendpos/internal/dto"
	"blendpos/internal/model"
	"blendpos/internal/repository"

	"github.com/go-pdf/fpdf"
	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

var maxDescuento = decimal.NewFromInt(90)

type ListaPreciosService interface {
	Crear(ctx context.Context, req dto.CrearListaPreciosRequest) (*dto.ListaPreciosResponse, error)
	ObtenerPorID(ctx context.Context, id uuid.UUID) (*dto.ListaPreciosDetalleResponse, error)
	Listar(ctx context.Context, filter dto.ListaPreciosFilter) (*dto.ListaPreciosListResponse, error)
	Actualizar(ctx context.Context, id uuid.UUID, req dto.ActualizarListaPreciosRequest) (*dto.ListaPreciosResponse, error)
	Eliminar(ctx context.Context, id uuid.UUID) error
	AsignarProducto(ctx context.Context, listaID uuid.UUID, req dto.AsignarProductoRequest) (*dto.ListaPreciosProductoResponse, error)
	QuitarProducto(ctx context.Context, listaID, productoID uuid.UUID) error
	AplicarMasivo(ctx context.Context, listaID uuid.UUID, req dto.AplicarMasivoRequest) (*dto.ListaPreciosDetalleResponse, error)
	GenerarPDF(ctx context.Context, listaID uuid.UUID, configFiscal *model.ConfiguracionFiscal, storagePath string) (string, error)
}

type listaPreciosService struct {
	repo        repository.ListaPreciosRepository
	productoRepo repository.ProductoRepository
}

func NewListaPreciosService(repo repository.ListaPreciosRepository, productoRepo repository.ProductoRepository) ListaPreciosService {
	return &listaPreciosService{repo: repo, productoRepo: productoRepo}
}

func (s *listaPreciosService) Crear(ctx context.Context, req dto.CrearListaPreciosRequest) (*dto.ListaPreciosResponse, error) {
	lp := &model.ListaPrecios{
		Nombre:  req.Nombre,
		LogoURL: req.LogoURL,
	}
	if err := s.repo.Create(ctx, lp); err != nil {
		return nil, err
	}
	return toListaPreciosResponse(lp, 0), nil
}

func (s *listaPreciosService) ObtenerPorID(ctx context.Context, id uuid.UUID) (*dto.ListaPreciosDetalleResponse, error) {
	lp, err := s.repo.FindByIDWithProductos(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("lista de precios no encontrada")
	}
	return toListaPreciosDetalleResponse(lp), nil
}

func (s *listaPreciosService) Listar(ctx context.Context, filter dto.ListaPreciosFilter) (*dto.ListaPreciosListResponse, error) {
	listas, total, err := s.repo.List(ctx, filter)
	if err != nil {
		return nil, err
	}

	data := make([]dto.ListaPreciosResponse, len(listas))
	for i, lp := range listas {
		data[i] = *toListaPreciosResponse(&lp, len(lp.Productos))
	}

	totalPages := int(math.Ceil(float64(total) / float64(filter.Limit)))
	return &dto.ListaPreciosListResponse{
		Data:       data,
		Total:      total,
		Page:       filter.Page,
		Limit:      filter.Limit,
		TotalPages: totalPages,
	}, nil
}

func (s *listaPreciosService) Actualizar(ctx context.Context, id uuid.UUID, req dto.ActualizarListaPreciosRequest) (*dto.ListaPreciosResponse, error) {
	lp, err := s.repo.FindByID(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("lista de precios no encontrada")
	}
	if req.Nombre != nil {
		lp.Nombre = *req.Nombre
	}
	if req.LogoURL != nil {
		lp.LogoURL = req.LogoURL
	}
	if err := s.repo.Update(ctx, lp); err != nil {
		return nil, err
	}
	return toListaPreciosResponse(lp, 0), nil
}

func (s *listaPreciosService) Eliminar(ctx context.Context, id uuid.UUID) error {
	if _, err := s.repo.FindByID(ctx, id); err != nil {
		return fmt.Errorf("lista de precios no encontrada")
	}
	return s.repo.Delete(ctx, id)
}

func (s *listaPreciosService) AsignarProducto(ctx context.Context, listaID uuid.UUID, req dto.AsignarProductoRequest) (*dto.ListaPreciosProductoResponse, error) {
	if req.DescuentoPorcentaje.LessThan(decimal.Zero) || req.DescuentoPorcentaje.GreaterThan(maxDescuento) {
		return nil, fmt.Errorf("el descuento debe estar entre 0%% y 90%%")
	}

	if _, err := s.repo.FindByID(ctx, listaID); err != nil {
		return nil, fmt.Errorf("lista de precios no encontrada")
	}

	productoID, err := uuid.Parse(req.ProductoID)
	if err != nil {
		return nil, fmt.Errorf("producto_id inválido")
	}

	producto, err := s.productoRepo.FindByID(ctx, productoID)
	if err != nil {
		return nil, fmt.Errorf("producto no encontrado")
	}

	lpp := &model.ListaPreciosProducto{
		ListaPreciosID:      listaID,
		ProductoID:          productoID,
		DescuentoPorcentaje: req.DescuentoPorcentaje.Round(2),
	}

	if err := s.repo.UpsertProducto(ctx, lpp); err != nil {
		return nil, err
	}

	return toProductoItemResponse(lpp, producto), nil
}

func (s *listaPreciosService) QuitarProducto(ctx context.Context, listaID, productoID uuid.UUID) error {
	return s.repo.RemoveProducto(ctx, listaID, productoID)
}

func (s *listaPreciosService) AplicarMasivo(ctx context.Context, listaID uuid.UUID, req dto.AplicarMasivoRequest) (*dto.ListaPreciosDetalleResponse, error) {
	if req.DescuentoPorcentaje.LessThan(decimal.Zero) || req.DescuentoPorcentaje.GreaterThan(maxDescuento) {
		return nil, fmt.Errorf("el descuento debe estar entre 0%% y 90%%")
	}

	if _, err := s.repo.FindByID(ctx, listaID); err != nil {
		return nil, fmt.Errorf("lista de precios no encontrada")
	}

	// Get all active products
	allProds, _, err := s.productoRepo.List(ctx, dto.ProductoFilter{
		Activo: "true",
		Page:   1,
		Limit:  100000,
	})
	if err != nil {
		return nil, fmt.Errorf("error al obtener productos: %w", err)
	}

	prodIDs := make([]uuid.UUID, len(allProds))
	for i, p := range allProds {
		prodIDs[i] = p.ID
	}

	descFloat, _ := req.DescuentoPorcentaje.Float64()

	tx := s.repo.DB().Begin()
	if tx.Error != nil {
		return nil, tx.Error
	}

	if err := s.repo.AplicarMasivoTx(tx, listaID, descFloat, prodIDs); err != nil {
		tx.Rollback()
		return nil, fmt.Errorf("error al aplicar descuento masivo: %w", err)
	}

	if err := tx.Commit().Error; err != nil {
		return nil, err
	}

	return s.ObtenerPorID(ctx, listaID)
}

func (s *listaPreciosService) GenerarPDF(ctx context.Context, listaID uuid.UUID, configFiscal *model.ConfiguracionFiscal, storagePath string) (string, error) {
	lp, err := s.repo.FindByIDWithProductos(ctx, listaID)
	if err != nil {
		return "", fmt.Errorf("lista de precios no encontrada")
	}

	if err := os.MkdirAll(storagePath, 0755); err != nil {
		return "", fmt.Errorf("pdf: create storage dir: %w", err)
	}

	fileName := fmt.Sprintf("lista_precios_%s.pdf", lp.ID.String()[:8])
	filePath := filepath.Join(storagePath, fileName)

	pdf := fpdf.New("P", "mm", "A4", "")
	pdf.SetMargins(15, 15, 15)
	pdf.AddPage()

	tr := pdf.UnicodeTranslatorFromDescriptor("")

	pageW, _ := pdf.GetPageSize()
	contentW := pageW - 30

	// ── Logo (centered, no text) ─────────────────────────────────────────────
	logoPath := findLogo(configFiscal)
	logoTopY := 2.0
	if logoPath != "" {
		logoW := 50.0
		logoX := (pageW - logoW) / 2
		pdf.ImageOptions(logoPath, logoX, logoTopY, logoW, 0, false, fpdf.ImageOptions{ImageType: "PNG"}, 0, "")
		// The logo's aspect ratio is ~4:3, so height ≈ logoW * 0.75
		logoH := logoW * 0.75
		pdf.SetY(logoTopY + logoH + 15)
	}

	pdf.SetFont("Helvetica", "B", 14)
	pdf.CellFormat(contentW, 8, tr("Lista de Precios: "+lp.Nombre), "", 1, "C", false, 0, "")
	pdf.Ln(1)

	// Date
	pdf.SetFont("Helvetica", "", 10)
	now := time.Now()
	pdf.CellFormat(contentW, 5, tr(fmt.Sprintf("Fecha de emisión: %s", now.Format("02/01/2006"))), "", 1, "C", false, 0, "")
	pdf.Ln(6)

	// ── Table header ─────────────────────────────────────────────────────────
	col1 := contentW * 0.40 // Producto
	col2 := contentW * 0.20 // Precio Público
	col3 := contentW * 0.15 // % Desc
	col4 := contentW * 0.25 // Precio Final

	pdf.SetFillColor(45, 55, 72)
	pdf.SetTextColor(255, 255, 255)
	pdf.SetFont("Helvetica", "B", 10)
	pdf.CellFormat(col1, 8, tr("Producto"), "1", 0, "C", true, 0, "")
	pdf.CellFormat(col2, 8, tr("Precio Público"), "1", 0, "C", true, 0, "")
	pdf.CellFormat(col3, 8, tr("% Desc."), "1", 0, "C", true, 0, "")
	pdf.CellFormat(col4, 8, tr("Precio Final"), "1", 1, "C", true, 0, "")

	// ── Table rows ───────────────────────────────────────────────────────────
	pdf.SetTextColor(0, 0, 0)
	pdf.SetFont("Helvetica", "", 9)

	alternate := false
	for _, item := range lp.Productos {
		if item.Producto == nil {
			continue
		}

		precioFinal := calcPrecioFinal(item.Producto.PrecioVenta, item.DescuentoPorcentaje)

		if alternate {
			pdf.SetFillColor(245, 245, 245)
		} else {
			pdf.SetFillColor(255, 255, 255)
		}

		nombre := item.Producto.Nombre
		if len([]rune(nombre)) > 40 {
			nombre = string([]rune(nombre)[:39]) + "…"
		}

		pdf.CellFormat(col1, 7, tr(nombre), "LR", 0, "L", true, 0, "")
		pdf.CellFormat(col2, 7, "$"+item.Producto.PrecioVenta.StringFixed(2), "LR", 0, "R", true, 0, "")
		pdf.CellFormat(col3, 7, item.DescuentoPorcentaje.StringFixed(2)+"%", "LR", 0, "C", true, 0, "")
		pdf.CellFormat(col4, 7, "$"+precioFinal.StringFixed(2), "LR", 1, "R", true, 0, "")

		alternate = !alternate
	}

	// Bottom border of last row
	pdf.CellFormat(contentW, 0, "", "T", 1, "", false, 0, "")

	// ── Footer ───────────────────────────────────────────────────────────────
	pdf.Ln(10)
	pdf.SetFont("Helvetica", "I", 9)
	pdf.SetTextColor(100, 100, 100)
	validez := now.AddDate(0, 0, 30).Format("02/01/2006")
	pdf.CellFormat(contentW, 5, tr(fmt.Sprintf("Lista válida por 30 días a partir de la fecha de emisión: %s", now.Format("02/01/2006"))), "", 1, "C", false, 0, "")
	pdf.CellFormat(contentW, 5, tr(fmt.Sprintf("Vencimiento: %s", validez)), "", 1, "C", false, 0, "")

	pdf.Ln(3)
	pdf.SetFont("Helvetica", "", 8)
	pdf.CellFormat(contentW, 4, tr(fmt.Sprintf("Total de productos: %d", len(lp.Productos))), "", 1, "C", false, 0, "")

	if err := pdf.OutputFileAndClose(filePath); err != nil {
		return "", fmt.Errorf("pdf: write file: %w", err)
	}

	return filePath, nil
}

// ── Helpers ──────────────────────────────────────────────────────────────────

// findLogo returns the path to the logo PNG. Priority:
// 1. ConfiguracionFiscal.LogoPath (if set and exists)
// 2. Bundled logo at static/logo.png (always present)
func findLogo(cfg *model.ConfiguracionFiscal) string {
	if cfg != nil && cfg.LogoPath != nil && *cfg.LogoPath != "" {
		if _, err := os.Stat(*cfg.LogoPath); err == nil {
			return *cfg.LogoPath
		}
	}
	// Bundled fallback — works both in dev (/app/static) and local (./static)
	candidates := []string{"static/logo.png", "/app/static/logo.png"}
	for _, c := range candidates {
		if _, err := os.Stat(c); err == nil {
			return c
		}
	}
	return ""
}

func calcPrecioFinal(precioVenta, descuentoPct decimal.Decimal) decimal.Decimal {
	factor := decimal.NewFromInt(1).Sub(descuentoPct.Div(decimal.NewFromInt(100)))
	return precioVenta.Mul(factor).Round(2)
}

func toListaPreciosResponse(lp *model.ListaPrecios, cantProductos int) *dto.ListaPreciosResponse {
	return &dto.ListaPreciosResponse{
		ID:                lp.ID.String(),
		Nombre:            lp.Nombre,
		LogoURL:           lp.LogoURL,
		CantidadProductos: cantProductos,
		CreatedAt:         lp.CreatedAt.Format(time.RFC3339),
		UpdatedAt:         lp.UpdatedAt.Format(time.RFC3339),
	}
}

func toListaPreciosDetalleResponse(lp *model.ListaPrecios) *dto.ListaPreciosDetalleResponse {
	prods := make([]dto.ListaPreciosProductoResponse, 0, len(lp.Productos))
	for _, item := range lp.Productos {
		if item.Producto == nil {
			continue
		}
		prods = append(prods, *toProductoItemResponse(&item, item.Producto))
	}
	return &dto.ListaPreciosDetalleResponse{
		ID:        lp.ID.String(),
		Nombre:    lp.Nombre,
		LogoURL:   lp.LogoURL,
		Productos: prods,
		CreatedAt: lp.CreatedAt.Format(time.RFC3339),
		UpdatedAt: lp.UpdatedAt.Format(time.RFC3339),
	}
}

func toProductoItemResponse(lpp *model.ListaPreciosProducto, p *model.Producto) *dto.ListaPreciosProductoResponse {
	precioFinal := calcPrecioFinal(p.PrecioVenta, lpp.DescuentoPorcentaje)
	return &dto.ListaPreciosProductoResponse{
		ID:                  lpp.ID.String(),
		ProductoID:          p.ID.String(),
		ProductoNombre:      p.Nombre,
		ProductoBarcode:     p.CodigoBarras,
		PrecioVenta:         p.PrecioVenta,
		DescuentoPorcentaje: lpp.DescuentoPorcentaje,
		PrecioFinal:         precioFinal,
	}
}
