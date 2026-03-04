package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"blendpos/internal/dto"
	"blendpos/internal/model"
	"blendpos/internal/repository"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

// CompraService handles purchase order business logic.
type CompraService interface {
	Crear(ctx context.Context, req dto.CrearCompraRequest) (*dto.CompraResponse, error)
	Listar(ctx context.Context, filter dto.CompraFilter) (*dto.CompraListResponse, error)
	ObtenerPorID(ctx context.Context, id string) (*dto.CompraResponse, error)
	ActualizarEstado(ctx context.Context, id string, req dto.ActualizarCompraRequest) (*dto.CompraResponse, error)
	Eliminar(ctx context.Context, id string) error
}

type compraService struct {
	repo repository.CompraRepository
}

func NewCompraService(repo repository.CompraRepository) CompraService {
	return &compraService{repo: repo}
}

// ── Helpers ──────────────────────────────────────────────────────────────────

func compraToResponse(c *model.Compra) dto.CompraResponse {
	items := make([]dto.CompraItemResponse, 0, len(c.Items))
	for _, item := range c.Items {
		ir := dto.CompraItemResponse{
			ID:             item.ID.String(),
			NombreProducto: item.NombreProducto,
			Precio:         item.Precio,
			DescuentoPct:   item.DescuentoPct,
			ImpuestoPct:    item.ImpuestoPct,
			Cantidad:       item.Cantidad,
			Observaciones:  item.Observaciones,
			Total:          item.Total,
		}
		if item.ProductoID != nil {
			s := item.ProductoID.String()
			ir.ProductoID = &s
		}
		items = append(items, ir)
	}

	pagos := make([]dto.PagoCompraResponse, 0, len(c.Pagos))
	for _, p := range c.Pagos {
		pagos = append(pagos, dto.PagoCompraResponse{
			ID:         p.ID.String(),
			Metodo:     p.Metodo,
			Monto:      p.Monto.InexactFloat64(),
			Referencia: p.Referencia,
			CreatedAt:  p.CreatedAt.Format(time.RFC3339),
		})
	}

	nombreProveedor := ""
	if c.Proveedor != nil {
		nombreProveedor = c.Proveedor.RazonSocial
	}

	return dto.CompraResponse{
		ID:               c.ID.String(),
		Numero:           c.Numero,
		ProveedorID:      c.ProveedorID.String(),
		NombreProveedor:  nombreProveedor,
		FechaCompra:      c.FechaCompra.Format(time.RFC3339),
		FechaVencimiento: c.FechaVencimiento.Format(time.RFC3339),
		Moneda:           c.Moneda,
		Deposito:         c.Deposito,
		Notas:            c.Notas,
		Subtotal:         c.Subtotal,
		DescuentoTotal:   c.DescuentoTotal,
		Total:            c.Total,
		Estado:           c.Estado,
		Items:            items,
		Pagos:            pagos,
		CreatedAt:        c.CreatedAt.Format(time.RFC3339),
	}
}

// ── Service methods ──────────────────────────────────────────────────────────

func (s *compraService) Crear(ctx context.Context, req dto.CrearCompraRequest) (*dto.CompraResponse, error) {
	proveedorID, err := uuid.Parse(req.ProveedorID)
	if err != nil {
		return nil, fmt.Errorf("proveedor_id inválido: %w", err)
	}

	fechaCompra, err := time.Parse("2006-01-02", req.FechaCompra)
	if err != nil {
		// Try RFC3339 too
		fechaCompra, err = time.Parse(time.RFC3339, req.FechaCompra)
		if err != nil {
			return nil, fmt.Errorf("fecha_compra inválida: %w", err)
		}
	}

	fechaVenc, err := time.Parse("2006-01-02", req.FechaVencimiento)
	if err != nil {
		fechaVenc, err = time.Parse(time.RFC3339, req.FechaVencimiento)
		if err != nil {
			return nil, fmt.Errorf("fecha_vencimiento inválida: %w", err)
		}
	}

	moneda := req.Moneda
	if moneda == "" {
		moneda = "ARS"
	}
	deposito := req.Deposito
	if deposito == "" {
		deposito = "Principal"
	}

	// Build items and calculate totals
	items := make([]model.CompraItem, 0, len(req.Items))
	subtotal := decimal.Zero
	descuentoTotal := decimal.Zero

	for _, ir := range req.Items {
		if ir.Cantidad < 1 {
			return nil, errors.New("la cantidad de cada ítem debe ser al menos 1")
		}

		precio := ir.Precio
		descPct := ir.DescuentoPct
		impPct := ir.ImpuestoPct
		cantidad := decimal.NewFromInt(int64(ir.Cantidad))

		// item line: precio * cantidad
		lineBase := precio.Mul(cantidad)
		// Apply discount
		descMonto := lineBase.Mul(descPct).Div(decimal.NewFromInt(100))
		// Apply tax on discounted base
		lineConDesc := lineBase.Sub(descMonto)
		impMonto := lineConDesc.Mul(impPct).Div(decimal.NewFromInt(100))
		lineTotal := lineConDesc.Add(impMonto)

		subtotal = subtotal.Add(lineBase)
		descuentoTotal = descuentoTotal.Add(descMonto)

		item := model.CompraItem{
			NombreProducto: ir.NombreProducto,
			Precio:         precio,
			DescuentoPct:   descPct,
			ImpuestoPct:    impPct,
			Cantidad:       ir.Cantidad,
			Observaciones:  ir.Observaciones,
			Total:          lineTotal,
		}
		if ir.ProductoID != nil && *ir.ProductoID != "" {
			pid, err := uuid.Parse(*ir.ProductoID)
			if err == nil {
				item.ProductoID = &pid
			}
		}
		items = append(items, item)
	}

	total := subtotal.Sub(descuentoTotal)

	compra := &model.Compra{
		Numero:           req.Numero,
		ProveedorID:      proveedorID,
		FechaCompra:      fechaCompra,
		FechaVencimiento: fechaVenc,
		Moneda:           moneda,
		Deposito:         deposito,
		Notas:            req.Notas,
		Subtotal:         subtotal,
		DescuentoTotal:   descuentoTotal,
		Total:            total,
		Estado:           "pendiente",
		Items:            items,
	}

	// Build pagos and determine auto-estado
	pagosTotal := decimal.Zero
	pagos := make([]model.CompraPago, 0, len(req.Pagos))
	for _, pr := range req.Pagos {
		monto := decimal.NewFromFloat(pr.Monto)
		pagos = append(pagos, model.CompraPago{
			Metodo:     pr.Metodo,
			Monto:      monto,
			Referencia: pr.Referencia,
		})
		pagosTotal = pagosTotal.Add(monto)
	}
	if len(pagos) > 0 && pagosTotal.GreaterThanOrEqual(total) {
		compra.Estado = "pagada"
	}
	compra.Pagos = pagos

	if err := s.repo.Create(ctx, compra); err != nil {
		return nil, err
	}

	// Reload with associations
	full, err := s.repo.FindByID(ctx, compra.ID)
	if err != nil {
		resp := compraToResponse(compra)
		return &resp, nil
	}

	resp := compraToResponse(full)
	return &resp, nil
}

func (s *compraService) Listar(ctx context.Context, filter dto.CompraFilter) (*dto.CompraListResponse, error) {
	if filter.Page < 1 {
		filter.Page = 1
	}
	if filter.Limit < 1 {
		filter.Limit = 20
	}

	var proveedorID *uuid.UUID
	if filter.ProveedorID != "" {
		pid, err := uuid.Parse(filter.ProveedorID)
		if err == nil {
			proveedorID = &pid
		}
	}

	compras, total, err := s.repo.List(ctx, proveedorID, filter.Estado, filter.Page, filter.Limit)
	if err != nil {
		return nil, err
	}

	data := make([]dto.CompraResponse, 0, len(compras))
	for i := range compras {
		data = append(data, compraToResponse(&compras[i]))
	}

	return &dto.CompraListResponse{
		Data:  data,
		Total: total,
		Page:  filter.Page,
		Limit: filter.Limit,
	}, nil
}

func (s *compraService) ObtenerPorID(ctx context.Context, id string) (*dto.CompraResponse, error) {
	compraID, err := uuid.Parse(id)
	if err != nil {
		return nil, fmt.Errorf("id inválido: %w", err)
	}
	compra, err := s.repo.FindByID(ctx, compraID)
	if err != nil {
		return nil, errors.New("compra no encontrada")
	}
	resp := compraToResponse(compra)
	return &resp, nil
}

func (s *compraService) ActualizarEstado(ctx context.Context, id string, req dto.ActualizarCompraRequest) (*dto.CompraResponse, error) {
	compraID, err := uuid.Parse(id)
	if err != nil {
		return nil, fmt.Errorf("id inválido: %w", err)
	}
	if err := s.repo.UpdateEstado(ctx, compraID, req.Estado); err != nil {
		return nil, err
	}
	return s.ObtenerPorID(ctx, id)
}

func (s *compraService) Eliminar(ctx context.Context, id string) error {
	compraID, err := uuid.Parse(id)
	if err != nil {
		return fmt.Errorf("id inválido: %w", err)
	}
	if _, err := s.repo.FindByID(ctx, compraID); err != nil {
		return errors.New("compra no encontrada")
	}
	return s.repo.Delete(ctx, compraID)
}
