package infra

// pdf.go — PDF generation for receipts and fiscal invoices (AC-06.3).
// 
// GenerateTicketPDF: A7-size thermal receipt-style tickets with:
//   - Business name header
//   - Ticket number and timestamp
//   - Item table (product name, quantity, subtotal)
//   - Discount line (if applicable)
//   - Bold total
//   - Payment method breakdown
//
// GenerateFacturaFiscalPDF: A4 AFIP-compliant invoice with:
//   - Fiscal header (tipo comprobante, datos emisor, CUIT)
//   - Receptor info (CUIT/DNI, nombre)
//   - Item details
//   - Tax breakdown (neto, IVA, exento)
//   - CAE and expiration date
//   - CAE barcode
//   - Legal legends

import (
	"fmt"
	"image/png"
	"os"
	"path/filepath"
	"strings"

	"blendpos/internal/model"

	"github.com/boombuler/barcode"
	"github.com/boombuler/barcode/code128"
	"github.com/go-pdf/fpdf"
	"github.com/shopspring/decimal"
)

// GenerateTicketPDF generates an internal PDF receipt for a completed Venta.
// storagePath is the directory where the PDF will be written (created if needed).
// Returns the absolute path to the generated file.
func GenerateTicketPDF(venta *model.Venta, storagePath string) (string, error) {
	if err := os.MkdirAll(storagePath, 0755); err != nil {
		return "", fmt.Errorf("pdf: create storage dir: %w", err)
	}

	fileName := fmt.Sprintf("ticket_%d.pdf", venta.NumeroTicket)
	filePath := filepath.Join(storagePath, fileName)

	// A7 ≈ 74mm × 105mm — close to thermal receipt paper (custom size, "A7" is not in fpdf's named list)
	pdf := fpdf.NewCustom(&fpdf.InitType{
		OrientationStr: "P",
		UnitStr:        "mm",
		Size:           fpdf.SizeType{Wd: 74, Ht: 105},
	})
	pdf.SetMargins(4, 4, 4)
	pdf.AddPage()

	// UTF-8 → CP1252 translator for proper Spanish characters (ñ, á, é, í, ó, ú, etc.)
	tr := pdf.UnicodeTranslatorFromDescriptor("")

	pageW, _ := pdf.GetPageSize()
	contentW := pageW - 8 // total margins = 8mm

	// ── Header ───────────────────────────────────────────────────────────────
	pdf.SetFont("Helvetica", "B", 13)
	pdf.CellFormat(contentW, 7, tr("BlendPOS"), "", 1, "C", false, 0, "")

	pdf.SetFont("Helvetica", "", 8)
	pdf.CellFormat(contentW, 5, tr("Comprobante de Compra"), "", 1, "C", false, 0, "")
	pdf.Ln(2)

	// ── Ticket info ───────────────────────────────────────────────────────────
	pdf.SetFont("Helvetica", "B", 8)
	pdf.CellFormat(contentW, 5, tr(fmt.Sprintf("Ticket N° %d", venta.NumeroTicket)), "", 1, "L", false, 0, "")
	pdf.SetFont("Helvetica", "", 7)
	pdf.CellFormat(contentW, 4, venta.CreatedAt.Format("02/01/2006  15:04"), "", 1, "L", false, 0, "")
	pdf.Ln(2)

	// ── Separator ────────────────────────────────────────────────────────────
	pdf.Line(4, pdf.GetY(), pageW-4, pdf.GetY())
	pdf.Ln(2)

	// ── Items header ──────────────────────────────────────────────────────────
	col1 := contentW * 0.52 // product name
	col2 := contentW * 0.16 // qty
	col3 := contentW * 0.32 // subtotal

	pdf.SetFont("Helvetica", "B", 7)
	pdf.CellFormat(col1, 5, tr("Producto"), "B", 0, "L", false, 0, "")
	pdf.CellFormat(col2, 5, tr("Cant"), "B", 0, "C", false, 0, "")
	pdf.CellFormat(col3, 5, tr("Subtotal"), "B", 1, "R", false, 0, "")

	// ── Item rows ─────────────────────────────────────────────────────────────
	pdf.SetFont("Helvetica", "", 7)
	for _, item := range venta.Items {
		nombre := ""
		if item.Producto != nil {
			nombre = item.Producto.Nombre
		}
		// Truncate long names
		if len([]rune(nombre)) > 22 {
			nombre = string([]rune(nombre)[:21]) + "…"
		}
		pdf.CellFormat(col1, 5, tr(nombre), "", 0, "L", false, 0, "")
		pdf.CellFormat(col2, 5, fmt.Sprintf("x%d", item.Cantidad), "", 0, "C", false, 0, "")
		pdf.CellFormat(col3, 5, "$"+item.Subtotal.StringFixed(2), "", 1, "R", false, 0, "")
	}

	pdf.Ln(2)
	pdf.Line(4, pdf.GetY(), pageW-4, pdf.GetY())
	pdf.Ln(2)

	// ── Totals ────────────────────────────────────────────────────────────────
	pdf.SetFont("Helvetica", "", 7)
	if !venta.DescuentoTotal.IsZero() {
		pdf.CellFormat(col1+col2, 5, tr("Descuento:"), "", 0, "L", false, 0, "")
		pdf.CellFormat(col3, 5, "-$"+venta.DescuentoTotal.StringFixed(2), "", 1, "R", false, 0, "")
	}

	pdf.SetFont("Helvetica", "B", 9)
	pdf.CellFormat(col1+col2, 6, tr("TOTAL:"), "", 0, "L", false, 0, "")
	pdf.CellFormat(col3, 6, "$"+venta.Total.StringFixed(2), "", 1, "R", false, 0, "")

	// ── Payment methods ───────────────────────────────────────────────────────
	pdf.Ln(2)
	pdf.SetFont("Helvetica", "", 7)
	for _, pago := range venta.Pagos {
		label := tr("Pago (" + pago.Metodo + "):")
		pdf.CellFormat(col1+col2, 4, label, "", 0, "L", false, 0, "")
		pdf.CellFormat(col3, 4, "$"+pago.Monto.StringFixed(2), "", 1, "R", false, 0, "")
	}

	// ── Footer ────────────────────────────────────────────────────────────────
	pdf.Ln(3)
	pdf.SetFont("Helvetica", "I", 7)
	pdf.CellFormat(contentW, 4, tr("¡Gracias por su compra!"), "", 1, "C", false, 0, "")

	if err := pdf.OutputFileAndClose(filePath); err != nil {
		return "", fmt.Errorf("pdf: write file: %w", err)
	}

	return filePath, nil
}

// GenerateFacturaFiscalPDF generates an AFIP-compliant invoice PDF (A4 format).
// Includes CAE, barcode, full fiscal data, and tax breakdown.
// venta: sale record with items
// comp: comprobante with CAE, tipo, número
// config: fiscal configuration (CUIT, razón social, condición fiscal, punto de venta)
// storagePath: output directory
func GenerateFacturaFiscalPDF(
	venta *model.Venta,
	comp *model.Comprobante,
	cuitEmisor string,
	razonSocial string,
	condicionFiscal string,
	puntoDeVenta int,
	storagePath string,
) (string, error) {
	if err := os.MkdirAll(storagePath, 0755); err != nil {
		return "", fmt.Errorf("pdf: create storage dir: %w", err)
	}

	// Determine tipo letra (A, B, C)
	tipoLetra := "X"
	switch comp.Tipo {
	case "factura_a":
		tipoLetra = "A"
	case "factura_b":
		tipoLetra = "B"
	case "factura_c":
		tipoLetra = "C"
	}

	fileName := fmt.Sprintf("factura_%s_%04d_%08d.pdf", tipoLetra, comp.PuntoDeVenta, comp.Numero)
	filePath := filepath.Join(storagePath, fileName)

	// A4 210mm × 297mm
	pdf := fpdf.New("P", "mm", "A4", "")
	pdf.SetMargins(10, 10, 10)
	pdf.AddPage()

	tr := pdf.UnicodeTranslatorFromDescriptor("")
	pageW, _ := pdf.GetPageSize()
	contentW := pageW - 20

	// ═══════════════════════════════════════════════════════════════════════
	// HEADER: Emisor + Tipo Comprobante
	// ═══════════════════════════════════════════════════════════════════════
	leftW := contentW * 0.40
	centerW := contentW * 0.20
	rightW := contentW * 0.40

	startY := pdf.GetY()

	// Left: Emisor info
	pdf.SetFont("Helvetica", "B", 14)
	pdf.CellFormat(leftW, 7, tr(razonSocial), "", 1, "L", false, 0, "")
	pdf.SetFont("Helvetica", "", 9)
	pdf.CellFormat(leftW, 5, tr("CUIT: "+cuitEmisor), "", 1, "L", false, 0, "")
	pdf.CellFormat(leftW, 5, tr("Cond. IVA: "+condicionFiscal), "", 1, "L", false, 0, "")
	// TODO: Agregar domicilio comercial cuando esté en ConfiguracionFiscal
	pdf.CellFormat(leftW, 5, tr("Punto de Venta: "+fmt.Sprintf("%04d", puntoDeVenta)), "", 1, "L", false, 0, "")

	// Center: Tipo Comprobante (big letter in box)
	pdf.SetXY(10+leftW, startY)
	pdf.SetFont("Helvetica", "B", 48)
	pdf.SetDrawColor(0, 0, 0)
	pdf.SetLineWidth(1.5)
	pdf.Rect(10+leftW, startY, centerW, 30, "D")
	pdf.SetXY(10+leftW, startY+8)
	pdf.CellFormat(centerW, 15, tipoLetra, "", 1, "C", false, 0, "")
	pdf.SetFont("Helvetica", "", 8)
	pdf.SetXY(10+leftW, startY+23)
	pdf.CellFormat(centerW, 4, tr("Cod. "+fmt.Sprintf("%02d", tipoComprobanteCode(comp.Tipo))), "", 1, "C", false, 0, "")

	// Right: Comprobante number
	pdf.SetXY(10+leftW+centerW, startY)
	pdf.SetFont("Helvetica", "B", 12)
	pdf.CellFormat(rightW, 7, tr(strings.ToUpper(strings.ReplaceAll(comp.Tipo, "_", " "))), "", 1, "R", false, 0, "")
	pdf.SetXY(10+leftW+centerW, startY+7)
	pdf.SetFont("Helvetica", "", 9)
	pdf.CellFormat(rightW, 5, tr(fmt.Sprintf("Punto Venta: %04d", comp.PuntoDeVenta)), "", 1, "R", false, 0, "")
	pdf.SetXY(10+leftW+centerW, startY+12)
	pdf.CellFormat(rightW, 5, tr(fmt.Sprintf("Nro: %08d", comp.Numero)), "", 1, "R", false, 0, "")
	pdf.SetXY(10+leftW+centerW, startY+17)
	pdf.CellFormat(rightW, 5, tr("Fecha: "+venta.CreatedAt.Format("02/01/2006")), "", 1, "R", false, 0, "")

	pdf.SetY(startY + 32)
	pdf.Line(10, pdf.GetY(), pageW-10, pdf.GetY())
	pdf.Ln(3)

	// ═══════════════════════════════════════════════════════════════════════
	// RECEPTOR
	// ═══════════════════════════════════════════════════════════════════════
	pdf.SetFont("Helvetica", "B", 10)
	pdf.CellFormat(contentW, 6, tr("Datos del Receptor"), "B", 1, "L", false, 0, "")
	pdf.SetFont("Helvetica", "", 9)
	
	receptorCUIT := ""
	if comp.ReceptorCUIT != nil && *comp.ReceptorCUIT != "" {
		receptorCUIT = *comp.ReceptorCUIT
	} else {
		receptorCUIT = "Consumidor Final"
	}
	pdf.CellFormat(contentW, 5, tr("CUIT/DNI: "+receptorCUIT), "", 1, "L", false, 0, "")
	// TODO: Agregar nombre y domicilio del receptor cuando estén disponibles
	pdf.Ln(2)

	// ═══════════════════════════════════════════════════════════════════════
	// ITEMS
	// ═══════════════════════════════════════════════════════════════════════
	pdf.SetFont("Helvetica", "B", 9)
	colProd := contentW * 0.40
	colCant := contentW * 0.10
	colPrecio := contentW * 0.20
	colSubtotal := contentW * 0.20
	colIVA := contentW * 0.10

	pdf.CellFormat(colProd, 5, tr("Producto"), "B", 0, "L", false, 0, "")
	pdf.CellFormat(colCant, 5, tr("Cant."), "B", 0, "C", false, 0, "")
	pdf.CellFormat(colPrecio, 5, tr("Precio Unit."), "B", 0, "R", false, 0, "")
	pdf.CellFormat(colSubtotal, 5, tr("Subtotal"), "B", 0, "R", false, 0, "")
	pdf.CellFormat(colIVA, 5, tr("IVA"), "B", 1, "R", false, 0, "")

	pdf.SetFont("Helvetica", "", 8)
	for _, item := range venta.Items {
		nombre := ""
		if item.Producto != nil {
			nombre = item.Producto.Nombre
		}
		if len([]rune(nombre)) > 35 {
			nombre = string([]rune(nombre)[:34]) + "…"
		}

		// Calculate IVA per item if applicable
		ivaItem := "—"
		if condicionFiscal == "Responsable Inscripto" && tipoLetra != "C" {
			ivaAmount := item.Subtotal.Mul(decimal.NewFromFloat(0.21))
			ivaItem = "$" + ivaAmount.StringFixed(2)
		}

		pdf.CellFormat(colProd, 5, tr(nombre), "", 0, "L", false, 0, "")
		pdf.CellFormat(colCant, 5, fmt.Sprintf("%d", item.Cantidad), "", 0, "C", false, 0, "")
		pdf.CellFormat(colPrecio, 5, "$"+item.PrecioUnitario.StringFixed(2), "", 0, "R", false, 0, "")
		pdf.CellFormat(colSubtotal, 5, "$"+item.Subtotal.StringFixed(2), "", 0, "R", false, 0, "")
		pdf.CellFormat(colIVA, 5, ivaItem, "", 1, "R", false, 0, "")
	}

	pdf.Ln(3)
	pdf.Line(10, pdf.GetY(), pageW-10, pdf.GetY())
	pdf.Ln(2)

	// ═══════════════════════════════════════════════════════════════════════
	// TOTALS
	// ═══════════════════════════════════════════════════════════════════════
	totalsX := pageW - 10 - 70
	pdf.SetX(totalsX)
	pdf.SetFont("Helvetica", "", 9)

	if !venta.DescuentoTotal.IsZero() {
		pdf.SetX(totalsX)
		pdf.CellFormat(40, 5, tr("Descuento:"), "", 0, "L", false, 0, "")
		pdf.CellFormat(30, 5, "-$"+venta.DescuentoTotal.StringFixed(2), "", 1, "R", false, 0, "")
	}

	// Calculate neto, IVA, exento based on tipo
	neto := decimal.Zero
	iva := decimal.Zero
	exento := decimal.Zero

	if condicionFiscal == "Responsable Inscripto" && tipoLetra == "A" {
		// RI → Factura A: discriminates IVA
		neto = venta.Total.Div(decimal.NewFromFloat(1.21))
		iva = venta.Total.Sub(neto)
	} else if tipoLetra == "B" {
		// Factura B: IVA included but not discriminated
		neto = venta.Total.Div(decimal.NewFromFloat(1.21))
		iva = venta.Total.Sub(neto)
	} else {
		// Factura C / Monotributo: exento
		exento = venta.Total
	}

	if !neto.IsZero() {
		pdf.SetX(totalsX)
		pdf.CellFormat(40, 5, tr("Subtotal (Neto):"), "", 0, "L", false, 0, "")
		pdf.CellFormat(30, 5, "$"+neto.StringFixed(2), "", 1, "R", false, 0, "")
	}

	if !iva.IsZero() {
		pdf.SetX(totalsX)
		pdf.CellFormat(40, 5, tr("IVA (21%):"), "", 0, "L", false, 0, "")
		pdf.CellFormat(30, 5, "$"+iva.StringFixed(2), "", 1, "R", false, 0, "")
	}

	if !exento.IsZero() {
		pdf.SetX(totalsX)
		pdf.CellFormat(40, 5, tr("Exento:"), "", 0, "L", false, 0, "")
		pdf.CellFormat(30, 5, "$"+exento.StringFixed(2), "", 1, "R", false, 0, "")
	}

	pdf.SetX(totalsX)
	pdf.SetFont("Helvetica", "B", 11)
	pdf.CellFormat(40, 6, tr("TOTAL:"), "T", 0, "L", false, 0, "")
	pdf.CellFormat(30, 6, "$"+venta.Total.StringFixed(2), "T", 1, "R", false, 0, "")

	pdf.Ln(5)

	// ═══════════════════════════════════════════════════════════════════════
	// CAE + BARCODE
	// ═══════════════════════════════════════════════════════════════════════
	if comp.CAE != nil && *comp.CAE != "" {
		pdf.SetFont("Helvetica", "B", 10)
		pdf.CellFormat(contentW, 6, tr("Datos Fiscales AFIP"), "B", 1, "L", false, 0, "")
		pdf.SetFont("Helvetica", "", 9)
		pdf.CellFormat(contentW, 5, tr("CAE: "+*comp.CAE), "", 1, "L", false, 0, "")
		
		if comp.CAEVencimiento != nil {
			pdf.CellFormat(contentW, 5, tr("Vencimiento CAE: "+comp.CAEVencimiento.Format("02/01/2006")), "", 1, "L", false, 0, "")
		}

		// Generate CAE barcode (Code128)
		// Format: CUIT (11 digits) + Tipo Comp (2 digits) + Punto Venta (4 digits) + CAE (14 digits) = 31 digits
		barcodeData := fmt.Sprintf("%s%02d%04d%s",
			strings.ReplaceAll(cuitEmisor, "-", ""),
			tipoComprobanteCode(comp.Tipo),
			comp.PuntoDeVenta,
			*comp.CAE,
		)

		barcodeImg, err := code128.Encode(barcodeData)
		if err == nil {
			// Scale barcode to appropriate width
			scaledBarcode, err := barcode.Scale(barcodeImg, 400, 80)
			if err == nil {
				// Save barcode to temp file
				tmpBarcode := filepath.Join(storagePath, ".tmp_barcode_"+comp.ID.String()+".png")
				f, err := os.Create(tmpBarcode)
				if err == nil {
					defer os.Remove(tmpBarcode)
					if err := png.Encode(f, scaledBarcode); err == nil {
						f.Close()
						pdf.Ln(2)
						pdf.Image(tmpBarcode, 10, pdf.GetY(), 100, 0, false, "", 0, "")
						pdf.Ln(20)
					} else {
						f.Close()
					}
				}
			}
		}
	}

	// ═══════════════════════════════════════════════════════════════════════
	// LEGAL FOOTER
	// ═══════════════════════════════════════════════════════════════════════
	pdf.Ln(5)
	pdf.SetFont("Helvetica", "I", 7)
	pdf.MultiCell(contentW, 3, tr("Este comprobante es válido como factura electrónica según Resolución General AFIP.\nConserve este documento para futuras consultas y reclamos."), "", "L", false)

	if err := pdf.OutputFileAndClose(filePath); err != nil {
		return "", fmt.Errorf("pdf: write file: %w", err)
	}

	return filePath, nil
}

// tipoComprobanteCode returns the AFIP numeric code for comprobante type.
func tipoComprobanteCode(tipo string) int {
	switch tipo {
	case "factura_a":
		return 1
	case "factura_b":
		return 6
	case "factura_c":
		return 11
	default:
		return 0
	}
}

