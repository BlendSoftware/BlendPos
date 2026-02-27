package service

import (
	"context"
	"errors"
	"fmt"

	"blendpos/internal/dto"
	"blendpos/internal/model"
	"blendpos/internal/repository"
	"blendpos/internal/worker"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

type VentaService interface {
	RegistrarVenta(ctx context.Context, usuarioID uuid.UUID, req dto.RegistrarVentaRequest) (*dto.VentaResponse, error)
	AnularVenta(ctx context.Context, id uuid.UUID, motivo string) error
	SyncBatch(ctx context.Context, usuarioID uuid.UUID, req dto.SyncBatchRequest) ([]dto.VentaResponse, error)
	ListVentas(ctx context.Context, filter dto.VentaFilter) (*dto.VentaListResponse, error)
}

type ventaService struct {
	repo         repository.VentaRepository
	inventario   InventarioService
	caja         CajaService
	cajaRepo     repository.CajaRepository
	productoRepo repository.ProductoRepository
	dispatcher   *worker.Dispatcher
}

func NewVentaService(
	repo repository.VentaRepository,
	inventario InventarioService,
	caja CajaService,
	cajaRepo repository.CajaRepository,
	productoRepo repository.ProductoRepository,
	dispatcher *worker.Dispatcher,
) VentaService {
	return &ventaService{
		repo:         repo,
		inventario:   inventario,
		caja:         caja,
		cajaRepo:     cajaRepo,
		productoRepo: productoRepo,
		dispatcher:   dispatcher,
	}
}

// runTx executes fn inside a GORM transaction when db is available,
// or calls fn(nil) directly when db is nil (unit test mode).
func runTx(ctx context.Context, db *gorm.DB, fn func(tx *gorm.DB) error) error {
	if db == nil {
		return fn(nil)
	}
	return db.WithContext(ctx).Transaction(fn)
}

// ── RegistrarVenta ────────────────────────────────────────────────────────────
// Full ACID transaction per arquitectura.md §7.1:
//   1. Validate sesion de caja is open
//   2. For each item: fetch product price, calc subtotal, check stock
//   3. Validate total pagos >= total venta
//   4. BEGIN TX: nextval ticket, create venta+items+pagos, descontar stock, crear movimientos de caja
//   5. COMMIT
//   6. (async) dispatch facturacion job if needed

func (s *ventaService) RegistrarVenta(ctx context.Context, usuarioID uuid.UUID, req dto.RegistrarVentaRequest) (*dto.VentaResponse, error) {
	sesionID, err := uuid.Parse(req.SesionCajaID)
	if err != nil {
		return nil, fmt.Errorf("sesion_caja_id inválido: %w", err)
	}

	// 1. Validate open session
	if err := s.caja.FindSesionAbierta(ctx, sesionID); err != nil {
		return nil, err
	}

	// 2. Deduplicate offline sale
	if req.OfflineID != nil {
		if existing, err := s.repo.FindByOfflineID(ctx, *req.OfflineID); err == nil {
			return ventaToResponse(existing), nil
		}
	}

	// 3. Resolve products and calculate totals (pre-flight, outside TX)
	type resolvedItem struct {
		productoID uuid.UUID
		nombre     string
		precio     decimal.Decimal
		cantidad   int
		descuento  decimal.Decimal
		subtotal   decimal.Decimal
	}

	var resolved []resolvedItem
	subtotal := decimal.Zero
	descuentoTotal := decimal.Zero
	conflictoStock := false

	for _, item := range req.Items {
		pid, err := uuid.Parse(item.ProductoID)
		if err != nil {
			return nil, fmt.Errorf("producto_id inválido: %w", err)
		}
		p, err := s.productoRepo.FindByID(ctx, pid)
		if err != nil {
			return nil, fmt.Errorf("producto %s no encontrado", item.ProductoID)
		}
		if !p.Activo {
			return nil, fmt.Errorf("producto %s está inactivo y no puede venderse", p.Nombre)
		}
		if p.StockActual < item.Cantidad {
			conflictoStock = true
		}
		lineSubtotal := p.PrecioVenta.Mul(decimal.NewFromInt(int64(item.Cantidad))).Sub(item.Descuento)
		subtotal = subtotal.Add(lineSubtotal)
		descuentoTotal = descuentoTotal.Add(item.Descuento)
		resolved = append(resolved, resolvedItem{
			productoID: pid,
			nombre:     p.Nombre,
			precio:     p.PrecioVenta,
			cantidad:   item.Cantidad,
			descuento:  item.Descuento,
			subtotal:   lineSubtotal,
		})
	}

	total := subtotal

	// 4. Validate payment sufficiency
	totalPagos := decimal.Zero
	for _, pago := range req.Pagos {
		totalPagos = totalPagos.Add(pago.Monto)
	}
	if totalPagos.LessThan(total) {
		return nil, errors.New("El monto total de pagos es insuficiente")
	}
	vuelto := totalPagos.Sub(total)

	// 5. ACID transaction
	var venta model.Venta
	txErr := runTx(ctx, s.repo.DB(), func(tx *gorm.DB) error {
		ticketNum, err := s.repo.NextTicketNumber(ctx, tx)
		if err != nil {
			return err
		}

		// Build venta model
		venta = model.Venta{
			NumeroTicket:   ticketNum,
			SesionCajaID:   sesionID,
			UsuarioID:      usuarioID,
			Subtotal:       subtotal,
			DescuentoTotal: descuentoTotal,
			Total:          total,
			Estado:         "completada",
			OfflineID:      req.OfflineID,
			ConflictoStock: conflictoStock,
		}

		// Build items
		for _, r := range resolved {
			venta.Items = append(venta.Items, model.VentaItem{
				ProductoID:     r.productoID,
				Cantidad:       r.cantidad,
				PrecioUnitario: r.precio,
				DescuentoItem:  r.descuento,
				Subtotal:       r.subtotal,
			})
		}

		// Build pagos
		for _, pago := range req.Pagos {
			venta.Pagos = append(venta.Pagos, model.VentaPago{
				Metodo: pago.Metodo,
				Monto:  pago.Monto,
			})
		}

		if err := s.repo.Create(ctx, tx, &venta); err != nil {
			return err
		}

		// Descontar stock — uses DescontarStockTx (handles auto-desarme from Fase 3)
		for _, r := range resolved {
			// Fetch current stock INSIDE tx for movement record
			prodBefore, err := s.productoRepo.FindByIDTx(tx, r.productoID)
			stockAntes := 0
			if err == nil && prodBefore != nil {
				stockAntes = prodBefore.StockActual
			}

			if err := s.inventario.DescontarStockTx(ctx, r.productoID, r.cantidad, tx); err != nil {
				return fmt.Errorf("error descontando stock de %s: %w", r.nombre, err)
			}

			// Record movimiento de stock
			ventaRef := venta.ID
			mov := &model.MovimientoStock{
				ProductoID:    r.productoID,
				Tipo:          "venta",
				Cantidad:      -r.cantidad,
				StockAnterior: stockAntes,
				StockNuevo:    stockAntes - r.cantidad,
				Motivo:        fmt.Sprintf("Venta #%d", ticketNum),
				ReferenciaID:  &ventaRef,
			}
			if err := s.inventario.RegistrarMovimientoTx(tx, mov); err != nil {
				return err
			}
		}

		// Create movimientos de caja (one per payment method)
		for _, pago := range req.Pagos {
			metodo := pago.Metodo
			mov := model.MovimientoCaja{
				SesionCajaID: sesionID,
				Tipo:         "venta",
				MetodoPago:   &metodo,
				Monto:        pago.Monto,
				Descripcion:  fmt.Sprintf("Venta #%d", ticketNum),
				ReferenciaID: &venta.ID,
			}
			if err := s.cajaRepo.CreateMovimientoTx(tx, &mov); err != nil {
				return err
			}
		}

		return nil
	})
	if txErr != nil {
		return nil, txErr
	}

	// 6. Async facturacion job (best-effort — fire & forget)
	if s.dispatcher != nil {
		payload := map[string]interface{}{
			"venta_id": venta.ID.String(),
		}
		if req.ClienteEmail != nil && *req.ClienteEmail != "" {
			payload["cliente_email"] = *req.ClienteEmail
		}
		_ = s.dispatcher.EnqueueFacturacion(ctx, payload)
	}

	// Build response
	resp := ventaToResponse(&venta)
	resp.Vuelto = vuelto
	// Enrich items with product names from resolved slice
	for i, r := range resolved {
		resp.Items[i].Producto = r.nombre
	}
	return resp, nil
}

// ── AnularVenta ───────────────────────────────────────────────────────────────

func (s *ventaService) AnularVenta(ctx context.Context, id uuid.UUID, motivo string) error {
	venta, err := s.repo.FindByID(ctx, id)
	if err != nil {
		return errors.New("venta no encontrada")
	}
	if venta.Estado == "anulada" {
		return errors.New("la venta ya está anulada")
	}

	txErr := runTx(ctx, s.repo.DB(), func(tx *gorm.DB) error {
		// Restore stock for each item and record movimiento
		for _, item := range venta.Items {
			prodBefore, _ := s.productoRepo.FindByID(ctx, item.ProductoID)
			stockAntes := 0
			if prodBefore != nil {
				stockAntes = prodBefore.StockActual
			}

			if err := s.productoRepo.UpdateStockTx(tx, item.ProductoID, item.Cantidad); err != nil {
				return err
			}

			ventaRef := venta.ID
			movStock := &model.MovimientoStock{
				ProductoID:    item.ProductoID,
				Tipo:          "restore_anulacion",
				Cantidad:      item.Cantidad,
				StockAnterior: stockAntes,
				StockNuevo:    stockAntes + item.Cantidad,
				Motivo:        fmt.Sprintf("Anulación venta #%d — %s", venta.NumeroTicket, motivo),
				ReferenciaID:  &ventaRef,
			}
			if err := s.inventario.RegistrarMovimientoTx(tx, movStock); err != nil {
				return err
			}
		}

		// Create inverse movimientos de caja
		for _, pago := range venta.Pagos {
			metodo := pago.Metodo
			monto := pago.Monto.Neg()
			mov := model.MovimientoCaja{
				SesionCajaID: venta.SesionCajaID,
				Tipo:         "anulacion",
				MetodoPago:   &metodo,
				Monto:        monto,
				Descripcion:  fmt.Sprintf("Anulación venta #%d — %s", venta.NumeroTicket, motivo),
				ReferenciaID: &venta.ID,
			}
			if err := s.cajaRepo.CreateMovimientoTx(tx, &mov); err != nil {
				return err
			}
		}

		return s.repo.UpdateEstadoTx(tx, id, "anulada")
	})
	return txErr
}

// ── SyncBatch ─────────────────────────────────────────────────────────────────
// Processes a batch of offline sales. Idempotent: uses offline_id deduplication.
//
// Auto-compensation rules (Fase 8):
//   - Stock deficit ≤ conflictoStockThreshold units: auto-compensate (accept sale,
//     allow stock to go negative, flag for supervisor review).
//   - Stock deficit > conflictoStockThreshold units: reject the sale entirely.
//   - If more than maxConflictRatio of the batch would be conflicts, reject the
//     remainder to prevent runaway negative inventory.

const (
	conflictoStockThreshold = 3   // max auto-compensable deficit per item
	maxConflictRatio        = 0.5 // max fraction of batch allowed to have conflicts
)

func (s *ventaService) SyncBatch(ctx context.Context, usuarioID uuid.UUID, req dto.SyncBatchRequest) ([]dto.VentaResponse, error) {
	results := make([]dto.VentaResponse, 0, len(req.Ventas))
	conflictCount := 0
	maxConflicts := int(float64(len(req.Ventas)) * maxConflictRatio)
	if maxConflicts < 1 {
		maxConflicts = 1
	}

	for _, ventaReq := range req.Ventas {
		// Pre-flight stock check to classify the conflict before touching the DB.
		exceeded, err := s.checkStockExceedsThreshold(ctx, ventaReq)
		if err != nil {
			results = append(results, dto.VentaResponse{ConflictoStock: true, Estado: "error"})
			continue
		}

		if exceeded {
			// Deficit > threshold — reject sale, do not decrement stock.
			conflictCount++
			results = append(results, dto.VentaResponse{ConflictoStock: true, Estado: "rechazada"})
			continue
		}

		// Check if we've already hit the max conflict quota (even for auto-compensable)
		if conflictCount >= maxConflicts {
			results = append(results, dto.VentaResponse{ConflictoStock: true, Estado: "rechazada"})
			continue
		}

		resp, regErr := s.RegistrarVenta(ctx, usuarioID, ventaReq)
		if regErr != nil {
			results = append(results, dto.VentaResponse{ConflictoStock: true, Estado: "error"})
			continue
		}
		if resp.ConflictoStock {
			conflictCount++
		}
		results = append(results, *resp)
	}
	return results, nil
}

// checkStockExceedsThreshold returns true when ANY item in the sale has a deficit
// strictly greater than conflictoStockThreshold, meaning the sale must be rejected.
func (s *ventaService) checkStockExceedsThreshold(ctx context.Context, req dto.RegistrarVentaRequest) (bool, error) {
	for _, item := range req.Items {
		pid, err := uuid.Parse(item.ProductoID)
		if err != nil {
			continue
		}
		p, err := s.productoRepo.FindByID(ctx, pid)
		if err != nil {
			return false, err
		}
		deficit := item.Cantidad - p.StockActual
		if deficit > conflictoStockThreshold {
			return true, nil
		}
	}
	return false, nil
}

// ListVentas returns a paginated list of sales, filtered by date and estado.
// Default filter: today's completed sales.
func (s *ventaService) ListVentas(ctx context.Context, filter dto.VentaFilter) (*dto.VentaListResponse, error) {
	if filter.Page < 1 {
		filter.Page = 1
	}
	if filter.Limit < 1 {
		filter.Limit = 50
	}
	if filter.Estado == "" {
		filter.Estado = "completada"
	}
	ventas, total, err := s.repo.List(ctx, filter)
	if err != nil {
		return nil, err
	}
	items := make([]dto.VentaListItem, 0, len(ventas))
	for _, v := range ventas {
		items = append(items, *ventaToListItem(&v))
	}
	return &dto.VentaListResponse{
		Data:  items,
		Total: total,
		Page:  filter.Page,
		Limit: filter.Limit,
	}, nil
}

func ventaToListItem(v *model.Venta) *dto.VentaListItem {
	items := make([]dto.ItemVentaResponse, 0, len(v.Items))
	for _, item := range v.Items {
		nombre := ""
		if item.Producto != nil {
			nombre = item.Producto.Nombre
		}
		items = append(items, dto.ItemVentaResponse{
			Producto:       nombre,
			Cantidad:       item.Cantidad,
			PrecioUnitario: item.PrecioUnitario,
			Subtotal:       item.Subtotal,
		})
	}
	pagos := make([]dto.PagoRequest, 0, len(v.Pagos))
	for _, p := range v.Pagos {
		pagos = append(pagos, dto.PagoRequest{Metodo: p.Metodo, Monto: p.Monto})
	}
	cajeroNombre := ""
	if v.Usuario != nil {
		cajeroNombre = v.Usuario.Nombre
	}
	return &dto.VentaListItem{
		ID:             v.ID.String(),
		NumeroTicket:   v.NumeroTicket,
		SesionCajaID:   v.SesionCajaID.String(),
		UsuarioID:      v.UsuarioID.String(),
		CajeroNombre:   cajeroNombre,
		Total:          v.Total,
		DescuentoTotal: v.DescuentoTotal,
		Subtotal:       v.Subtotal,
		Estado:         v.Estado,
		Items:          items,
		Pagos:          pagos,
		CreatedAt:      v.CreatedAt.Format("2006-01-02T15:04:05Z"),
	}
}

func ventaToResponse(v *model.Venta) *dto.VentaResponse {
	items := make([]dto.ItemVentaResponse, 0, len(v.Items))
	for _, item := range v.Items {
		nombre := ""
		if item.Producto != nil {
			nombre = item.Producto.Nombre
		}
		items = append(items, dto.ItemVentaResponse{
			Producto:       nombre,
			Cantidad:       item.Cantidad,
			PrecioUnitario: item.PrecioUnitario,
			Subtotal:       item.Subtotal,
		})
	}
	pagos := make([]dto.PagoRequest, 0, len(v.Pagos))
	for _, p := range v.Pagos {
		pagos = append(pagos, dto.PagoRequest{Metodo: p.Metodo, Monto: p.Monto})
	}
	return &dto.VentaResponse{
		ID:             v.ID.String(),
		NumeroTicket:   v.NumeroTicket,
		Items:          items,
		Subtotal:       v.Subtotal,
		DescuentoTotal: v.DescuentoTotal,
		Total:          v.Total,
		Pagos:          pagos,
		Estado:         v.Estado,
		ConflictoStock: v.ConflictoStock,
		CreatedAt:      v.CreatedAt.Format("2006-01-02T15:04:05Z"),
	}
}
