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

// amountToWords converts a decimal amount to Spanish words (simplified, for Argentine invoices).
func amountToWords(amount decimal.Decimal) string {
	units := []string{"", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve",
		"diez", "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete", "dieciocho", "diecinueve",
		"veinte", "veintiuno", "veintidós", "veintitrés", "veinticuatro", "veinticinco", "veintiséis", "veintisiete", "veintiocho", "veintinueve"}
	tens := []string{"", "", "veinte", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"}
	hundreds := []string{"", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos", "seiscientos", "setecientos", "ochocientos", "novecientos"}

	intPart := amount.Floor().IntPart()
	centsPart := amount.Sub(decimal.NewFromInt(intPart)).Mul(decimal.NewFromInt(100)).Round(0).IntPart()

	var intWords string
	if intPart == 0 {
		intWords = "cero"
	} else if intPart == 100 {
		intWords = "cien"
	} else if intPart < 30 {
		intWords = units[intPart]
	} else if intPart < 100 {
		t := intPart / 10
		u := intPart % 10
		if u == 0 {
			intWords = tens[t]
		} else {
			intWords = tens[t] + " y " + units[u]
		}
	} else if intPart < 1000 {
		h := intPart / 100
		rest := intPart % 100
		if rest == 0 {
			intWords = hundreds[h]
		} else if rest < 30 {
			intWords = hundreds[h] + " " + units[rest]
		} else {
			t := rest / 10
			u := rest % 10
			if u == 0 {
				intWords = hundreds[h] + " " + tens[t]
			} else {
				intWords = hundreds[h] + " " + tens[t] + " y " + units[u]
			}
		}
	} else if intPart < 1000000 {
		thousands := intPart / 1000
		rest := intPart % 1000
		var tStr string
		if thousands == 1 {
			tStr = "mil"
		} else if thousands < 30 {
			tStr = units[thousands] + " mil"
		} else {
			tStr = fmt.Sprintf("%d mil", thousands)
		}
		if rest == 0 {
			intWords = tStr
		} else if rest < 100 {
			if rest < 30 {
				intWords = tStr + " " + units[rest]
			} else {
				intWords = tStr + " " + fmt.Sprintf("%d", rest)
			}
		} else {
			intWords = tStr + " " + fmt.Sprintf("%d", rest)
		}
	} else {
		intWords = fmt.Sprintf("%d", intPart)
	}

	return fmt.Sprintf("%s con %02d/100", strings.ToUpper(intWords[:1])+intWords[1:], centsPart)
}

// GenerateFacturaFiscalPDF generates an AFIP-compliant professional invoice PDF (A4 format).
// Includes CAE, barcode, full fiscal data, and tax breakdown according to AFIP regulations.
// Generates facturas tipo A, B, or C depending on the fiscal condition and client type.
func GenerateFacturaFiscalPDF(
	venta *model.Venta,
	comp *model.Comprobante,
	config *model.ConfiguracionFiscal,
	storagePath string,
) (string, error) {
	if err := os.MkdirAll(storagePath, 0755); err != nil {
		return "", fmt.Errorf("pdf: create storage dir: %w", err)
	}

	// Determine tipo letra (A, B, C)
	tipoLetra := "X"
	tipoNombre := "FACTURA"
	switch comp.Tipo {
	case "factura_a":
		tipoLetra = "A"
		tipoNombre = "FACTURA"
	case "factura_b":
		tipoLetra = "B"
		tipoNombre = "FACTURA"
	case "factura_c":
		tipoLetra = "C"
		tipoNombre = "FACTURA"
	}

	var numeroComprobante int64
	if comp.Numero != nil {
		numeroComprobante = *comp.Numero
	}
	pvDisplay := comp.PuntoDeVenta
	if pvDisplay == 0 {
		pvDisplay = config.PuntoDeVenta
	}

	fileName := fmt.Sprintf("factura_%s_%04d_%08d.pdf", tipoLetra, pvDisplay, numeroComprobante)
	filePath := filepath.Join(storagePath, fileName)

	pdf := fpdf.New("P", "mm", "A4", "")
	pdf.SetMargins(10, 10, 10)
	pdf.AddPage()
	tr := pdf.UnicodeTranslatorFromDescriptor("")

	pageW, pageH := pdf.GetPageSize()
	marginL := 10.0
	marginR := 10.0
	contentW := pageW - marginL - marginR
	_ = pageH

	// ═══════════════════════════════════════════════════════════════════════
	// OUTER BORDER (entire invoice)
	// ═══════════════════════════════════════════════════════════════════════
	pdf.SetDrawColor(0, 0, 0)
	pdf.SetLineWidth(0.5)
	pdf.Rect(marginL, 10, contentW, 267, "D")

	// ═══════════════════════════════════════════════════════════════════════
	// HEADER: two columns split by center box
	// Left 42% = emisor | Center 16% = tipo | Right 42% = datos comprobante
	// ═══════════════════════════════════════════════════════════════════════
	headerH := 42.0
	leftW := contentW * 0.42
	centerW := contentW * 0.16
	rightW := contentW * 0.42
	startY := 10.0

	// Left border
	pdf.SetLineWidth(0.3)
	pdf.Line(marginL+leftW, startY, marginL+leftW, startY+headerH)
	// Right border of center box
	pdf.Line(marginL+leftW+centerW, startY, marginL+leftW+centerW, startY+headerH)
	// Bottom of header
	pdf.Line(marginL, startY+headerH, marginL+contentW, startY+headerH)

	// ── LEFT: Logo area + Emisor ──────────────────────────────────────────
	xL := marginL + 3
	logoRendered := false
	logoFilePDF := "/app/static/logo.png"
	if config.LogoPath != nil && *config.LogoPath != "" {
		logoFilePDF = *config.LogoPath
	}
	if _, statErr := os.Stat(logoFilePDF); statErr == nil {
		// Logo height proportional, max 18mm, positioned top-left of left column
		pdf.Image(logoFilePDF, xL, startY+2, leftW*0.45, 0, false, "", 0, "")
		logoRendered = true
	}
	textStartY := startY + 3
	if logoRendered {
		textStartY = startY + 22 // below logo
	}
	pdf.SetXY(xL, textStartY)
	pdf.SetFont("Helvetica", "B", 14)
	pdf.CellFormat(leftW-4, 7, tr(config.RazonSocial), "", 1, "L", false, 0, "")

	pdf.SetXY(xL, pdf.GetY())
	pdf.SetFont("Helvetica", "", 8)
	if config.DomicilioComercial != nil && *config.DomicilioComercial != "" {
		pdf.CellFormat(leftW-4, 4.5, tr(*config.DomicilioComercial), "", 1, "L", false, 0, "")
	}
	var localidad string
	if config.DomicilioCiudad != nil && *config.DomicilioCiudad != "" {
		localidad = *config.DomicilioCiudad
	}
	if config.DomicilioProvincia != nil && *config.DomicilioProvincia != "" {
		if localidad != "" {
			localidad += " - " + *config.DomicilioProvincia
		} else {
			localidad = *config.DomicilioProvincia
		}
	}
	if config.DomicilioCodigoPostal != nil && *config.DomicilioCodigoPostal != "" {
		if localidad != "" {
			localidad += " (" + *config.DomicilioCodigoPostal + ")"
		}
	}
	if localidad != "" {
		pdf.SetXY(xL, pdf.GetY())
		pdf.CellFormat(leftW-4, 4.5, tr(localidad), "", 1, "L", false, 0, "")
	}

	condFiscal := config.CondicionFiscal
	pdf.SetXY(xL, pdf.GetY()+1)
	pdf.SetFont("Helvetica", "B", 8)
	pdf.CellFormat(leftW-4, 4.5, tr(condFiscal), "", 1, "L", false, 0, "")

	// ── CENTER: Large tipo letter ─────────────────────────────────────────
	boxX := marginL + leftW
	pdf.SetXY(boxX, startY+1)
	pdf.SetFont("Helvetica", "B", 7)
	pdf.CellFormat(centerW, 4, tr(tipoNombre), "", 1, "C", false, 0, "")
	pdf.SetXY(boxX, startY+5)
	pdf.SetFont("Helvetica", "B", 48)
	pdf.CellFormat(centerW, 22, tipoLetra, "", 1, "C", false, 0, "")
	pdf.SetXY(boxX, startY+27)
	pdf.SetFont("Helvetica", "", 7)
	pdf.CellFormat(centerW, 4, tr(fmt.Sprintf("COD. %02d", tipoComprobanteCode(comp.Tipo))), "", 1, "C", false, 0, "")

	// ── RIGHT: Comprobante fiscal data ────────────────────────────────────
	xR := marginL + leftW + centerW + 3
	pdf.SetXY(xR, startY+3)
	// Line 1: "FACTURA" (label) left + N° right — matches standard AFIP layout
	pdf.SetFont("Helvetica", "", 9)
	pdf.CellFormat(20, 6, tr(tipoNombre), "", 0, "L", false, 0, "")
	pdf.SetFont("Helvetica", "B", 10)
	numeroFormatted := fmt.Sprintf("N° %04d-%08d", pvDisplay, numeroComprobante)
	pdf.CellFormat(rightW-24, 6, tr(numeroFormatted), "", 1, "R", false, 0, "")

	// Line 2: "Fecha DD/MM/YYYY" left + "ORIGINAL" right
	pdf.SetXY(xR, pdf.GetY())
	pdf.SetFont("Helvetica", "", 9)
	pdf.CellFormat(14, 5, tr("Fecha"), "", 0, "L", false, 0, "")
	dateStr := venta.CreatedAt.Format("2/1/2006")
	dateValW := rightW - 4 - 14 - 22
	pdf.CellFormat(dateValW, 5, tr(dateStr), "", 0, "L", false, 0, "")
	pdf.SetFont("Helvetica", "B", 9)
	pdf.CellFormat(22, 5, tr("ORIGINAL"), "", 1, "R", false, 0, "")

	// Fiscal metadata on right column
	pdf.SetXY(xR, pdf.GetY()+1)
	pdf.SetFont("Helvetica", "", 7.5)
	rowH := 4.5

	pdf.CellFormat(26, rowH, tr("CUIT:"), "", 0, "L", false, 0, "")
	pdf.CellFormat(rightW-28, rowH, tr(config.CUITEmsior), "", 1, "L", false, 0, "")

	if config.IIBB != nil && *config.IIBB != "" {
		pdf.SetXY(xR, pdf.GetY())
		pdf.CellFormat(26, rowH, tr("ING. BRUTOS:"), "", 0, "L", false, 0, "")
		pdf.CellFormat(rightW-28, rowH, tr(*config.IIBB), "", 1, "L", false, 0, "")
	}

	if config.FechaInicioActividades != nil {
		pdf.SetXY(xR, pdf.GetY())
		pdf.CellFormat(26, rowH, tr("INICIO ACT.:"), "", 0, "L", false, 0, "")
		pdf.CellFormat(rightW-28, rowH, tr(config.FechaInicioActividades.Format("02/01/06")), "", 1, "L", false, 0, "")
	}

	// ═══════════════════════════════════════════════════════════════════════
	// RECEPTOR SECTION
	// ═══════════════════════════════════════════════════════════════════════
	recY := startY + headerH
	recH := 22.0
	pdf.Line(marginL, recY+recH, marginL+contentW, recY+recH)

	// NOMBRE row
	pdf.SetXY(marginL+3, recY+2)
	pdf.SetFont("Helvetica", "B", 8)
	pdf.CellFormat(20, 5, tr("NOMBRE:"), "", 0, "L", false, 0, "")
	pdf.SetFont("Helvetica", "", 9)
	receptorNombre := "CONSUMIDOR FINAL"
	if comp.ReceptorNombre != nil && *comp.ReceptorNombre != "" {
		receptorNombre = strings.ToUpper(*comp.ReceptorNombre)
	}
	// Right of nombre: put receptor condition
	halfW := contentW/2 - 23
	pdf.CellFormat(halfW, 5, tr(receptorNombre), "", 0, "L", false, 0, "")

	// Vertical divider in receptor section
	midX := marginL + contentW/2
	pdf.Line(midX, recY, midX, recY+recH)

	// Right side: show receptor CUIT/DNI if available  
	xRecR := midX + 3
	pdf.SetXY(xRecR, recY+2)
	pdf.SetFont("Helvetica", "", 8)

	// DOMICILIO row
	pdf.SetXY(marginL+3, recY+8)
	pdf.SetFont("Helvetica", "B", 8)
	pdf.CellFormat(20, 5, tr("DOMICILIO:"), "", 0, "L", false, 0, "")
	pdf.SetFont("Helvetica", "", 8)
	domReceptor := ""
	if comp.ReceptorDomicilio != nil && *comp.ReceptorDomicilio != "" {
		domReceptor = *comp.ReceptorDomicilio
	}
	pdf.CellFormat(halfW, 5, tr(domReceptor), "", 0, "L", false, 0, "")

	// DOCUMENTO (right side)
	pdf.SetXY(xRecR, recY+8)
	pdf.SetFont("Helvetica", "B", 8)
	docTipoLabel := "DOCUMENTO:"
	docNum := ""
	if comp.ReceptorCUIT != nil && *comp.ReceptorCUIT != "" && *comp.ReceptorCUIT != "0" {
		if comp.ReceptorTipoDocumento != nil && *comp.ReceptorTipoDocumento == 80 {
			docTipoLabel = "CUIT:"
		} else if comp.ReceptorTipoDocumento != nil && *comp.ReceptorTipoDocumento == 96 {
			docTipoLabel = "DNI:"
		}
		docNum = *comp.ReceptorCUIT
	}
	pdf.CellFormat(22, 5, tr(docTipoLabel), "", 0, "L", false, 0, "")
	pdf.SetFont("Helvetica", "", 8)
	pdf.CellFormat(rightW-25, 5, tr(docNum), "", 1, "L", false, 0, "")

	// CONDICIÓN DE PAGO row — label cell widened to 58mm to avoid text overflow
	condPagoY := recY + recH - 7
	pdf.Line(marginL, condPagoY, marginL+contentW, condPagoY)
	pdf.SetXY(marginL+3, condPagoY+1.5)
	pdf.SetFont("Helvetica", "B", 7.5)
	pdf.CellFormat(58, 4, tr("CONDICIÓN Y FORMA DE PAGO:"), "", 0, "L", false, 0, "")
	pdf.SetFont("Helvetica", "", 7.5)
	condPago := "Contado"
	if len(venta.Pagos) > 0 {
		metodo := venta.Pagos[0].Metodo
		switch metodo {
		case "efectivo":
			metodo = "Efectivo"
		case "debito":
			metodo = "Tarjeta de Débito"
		case "credito":
			metodo = "Tarjeta de Crédito"
		case "transferencia":
			metodo = "Transferencia"
		case "qr":
			metodo = "QR / Billetera Virtual"
		}
		condPago = "Contado - " + metodo
	}
	pdf.CellFormat(contentW-44, 4, tr(condPago), "", 1, "L", false, 0, "")

	// ═══════════════════════════════════════════════════════════════════════
	// ITEMS TABLE
	// ═══════════════════════════════════════════════════════════════════════
	tableY := recY + recH
	pdf.SetXY(marginL, tableY)

	colCant := 14.0
	colDetalle := contentW - colCant - 38 - 38
	colPU := 38.0
	colPT := 38.0

	// Table header
	pdf.SetFillColor(50, 50, 50)
	pdf.SetTextColor(255, 255, 255)
	pdf.SetFont("Helvetica", "B", 8)
	hRowH := 6.0
	pdf.CellFormat(colCant, hRowH, tr("Cantidad"), "1", 0, "C", true, 0, "")
	pdf.CellFormat(colDetalle, hRowH, tr("Detalle"), "1", 0, "L", true, 0, "")
	pdf.CellFormat(colPU, hRowH, tr("Precio Unitario"), "1", 0, "R", true, 0, "")
	pdf.CellFormat(colPT, hRowH, tr("Precio total"), "1", 1, "R", true, 0, "")

	pdf.SetTextColor(0, 0, 0)
	pdf.SetFillColor(255, 255, 255)
	pdf.SetFont("Helvetica", "", 8.5)

	rowH2 := 6.0
	for _, item := range venta.Items {
		nombre := "Producto"
		if item.Producto != nil {
			nombre = item.Producto.Nombre
		}
		pdf.CellFormat(colCant, rowH2, fmt.Sprintf("%d", item.Cantidad), "LR", 0, "C", false, 0, "")
		pdf.CellFormat(colDetalle, rowH2, tr(nombre), "LR", 0, "L", false, 0, "")
		pdf.CellFormat(colPU, rowH2, tr(formatMoneyAFIP(item.PrecioUnitario)), "LR", 0, "R", false, 0, "")
		pdf.CellFormat(colPT, rowH2, tr(formatMoneyAFIP(item.Subtotal)), "LR", 1, "R", false, 0, "")
	}
	// Fill remaining rows to fixed table height (at least 10 empty rows for look)
	emptyRows := 10 - len(venta.Items)
	if emptyRows < 0 {
		emptyRows = 0
	}
	pdf.SetFont("Helvetica", "", 8.5)
	for i := 0; i < emptyRows; i++ {
		pdf.CellFormat(colCant, rowH2, "", "LR", 0, "C", false, 0, "")
		pdf.CellFormat(colDetalle, rowH2, "", "LR", 0, "L", false, 0, "")
		pdf.CellFormat(colPU, rowH2, "", "LR", 0, "R", false, 0, "")
		pdf.CellFormat(colPT, rowH2, "", "LR", 1, "R", false, 0, "")
	}
	// Close table bottom
	pdf.CellFormat(contentW, 0, "", "T", 1, "", false, 0, "")

	// ═══════════════════════════════════════════════════════════════════════
	// SON PESOS + IMPORTE TOTAL row
	// ═══════════════════════════════════════════════════════════════════════
	isRI := strings.Contains(config.CondicionFiscal, "Responsable Inscripto")
	neto := decimal.Zero
	iva := decimal.Zero
	if isRI && tipoLetra == "A" {
		neto = venta.Total.Div(decimal.NewFromFloat(1.21))
		iva = venta.Total.Sub(neto)
	} else if tipoLetra == "B" {
		neto = venta.Total.Div(decimal.NewFromFloat(1.21))
		iva = venta.Total.Sub(neto)
	} else {
		neto = venta.Total
	}

	// IVA subtotal rows (only when applicable)
	if !iva.IsZero() {
		pdf.SetFont("Helvetica", "", 8)
		pdf.SetXY(marginL, pdf.GetY())
		pdf.CellFormat(contentW-colPT, 5, tr("Subtotal gravado:"), "LRB", 0, "R", false, 0, "")
		pdf.CellFormat(colPT, 5, tr(formatMoneyAFIP(neto)), "LRB", 1, "R", false, 0, "")
		pdf.SetXY(marginL, pdf.GetY())
		pdf.CellFormat(contentW-colPT, 5, tr("IVA 21%:"), "LRB", 0, "R", false, 0, "")
		pdf.CellFormat(colPT, 5, tr(formatMoneyAFIP(iva)), "LRB", 1, "R", false, 0, "")
	}

	// Son pesos row + Importe total
	sonPesosW := contentW - 76.0
	totalW := 76.0
	sonPesosH := 7.0
	currentY := pdf.GetY()

	pdf.SetXY(marginL, currentY)
	pdf.SetFont("Helvetica", "", 7.5)
	pdf.CellFormat(18, sonPesosH, tr("Son pesos:"), "1", 0, "L", false, 0, "")
	pdf.SetFont("Helvetica", "I", 7.5)
	inWords := amountToWords(venta.Total)
	pdf.CellFormat(sonPesosW-18, sonPesosH, tr(inWords), "1", 0, "L", false, 0, "")

	pdf.SetFillColor(240, 240, 240)
	pdf.SetFont("Helvetica", "B", 10)
	pdf.CellFormat(totalW*0.55, sonPesosH, tr("Importe total"), "1", 0, "R", true, 0, "")
	pdf.SetFont("Helvetica", "B", 11)
	pdf.CellFormat(totalW*0.45, sonPesosH, tr(formatMoneyAFIP(venta.Total)), "1", 1, "R", true, 0, "")
	pdf.SetFillColor(255, 255, 255)

	// ═══════════════════════════════════════════════════════════════════════
	// CAE + BARCODE FOOTER
	// ═══════════════════════════════════════════════════════════════════════
	caeY := pdf.GetY()
	pdf.Line(marginL, caeY, marginL+contentW, caeY)          // top border (horizontal)
	pdf.Line(marginL, caeY+28, marginL+contentW, caeY+28)    // bottom border
	pdf.Line(marginL+contentW*0.5, caeY, marginL+contentW*0.5, caeY+28) // vertical divider

	// Left: CAE text
	pdf.SetXY(marginL+3, caeY+2)
	pdf.SetFont("Helvetica", "B", 8.5)
	pdf.CellFormat(contentW*0.5-6, 5, tr("Comprobante autorizado"), "", 1, "L", false, 0, "")

	if comp.CAE != nil && *comp.CAE != "" {
		pdf.SetXY(marginL+3, pdf.GetY())
		pdf.SetFont("Helvetica", "", 8)
		pdf.CellFormat(contentW*0.5-6, 4.5, tr("CAE N°:  "+*comp.CAE), "", 1, "L", false, 0, "")
		if comp.CAEVencimiento != nil {
			pdf.SetXY(marginL+3, pdf.GetY())
			pdf.CellFormat(contentW*0.5-6, 4.5, tr("Vencimiento:  "+comp.CAEVencimiento.Format("02/01/2006")), "", 1, "L", false, 0, "")
		}

		// Right: barcode
		cuitClean := strings.ReplaceAll(config.CUITEmsior, "-", "")
		if len(cuitClean) == 11 {
			barcodeData := fmt.Sprintf("%s%02d%04d%s", cuitClean, tipoComprobanteCode(comp.Tipo), pvDisplay, *comp.CAE)
			barcodeImg, err := code128.Encode(barcodeData)
			if err == nil {
				scaledBarcode, err := barcode.Scale(barcodeImg, 560, 56)
				if err == nil {
					tmpBarcode := filepath.Join(storagePath, ".tmp_bc_"+comp.ID.String()+".png")
					f, err := os.Create(tmpBarcode)
					if err == nil {
						defer os.Remove(tmpBarcode)
						if encErr := png.Encode(f, scaledBarcode); encErr == nil {
							f.Close()
							barcodeX := marginL + contentW*0.5 + 3
							barcodeY := caeY + 3
							pdf.Image(tmpBarcode, barcodeX, barcodeY, contentW*0.5-6, 0, false, "", 0, "")
							pdf.SetXY(barcodeX, caeY+21)
							pdf.SetFont("Helvetica", "", 6.5)
							pdf.CellFormat(contentW*0.5-6, 3.5, tr(barcodeData), "", 0, "C", false, 0, "")
						} else {
							f.Close()
						}
					}
				}
			}
		}
	}

	pdf.SetXY(marginL, pdf.GetY())

	// ═══════════════════════════════════════════════════════════════════════
	// LEGAL FOOTER
	// ═══════════════════════════════════════════════════════════════════════
	pdf.SetXY(marginL+3, caeY+30)
	pdf.SetFont("Helvetica", "I", 6.5)
	legal := "Esta Administración Federal no se responsabiliza por los datos ingresados en el detalle de la operación.\n"
	legal += "Comprobante autorizado según Resolución General AFIP.    Para verificar: www.afip.gob.ar/genericos/consultaCAE"
	pdf.MultiCell(contentW-6, 3.5, tr(legal), "", "L", false)

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

// formatMoneyAFIP formats a decimal for AFIP invoices without currency symbol: 1.234,56
// Per AFIP standard, the $ sign is omitted from item rows and totals in the body.
func formatMoneyAFIP(amount decimal.Decimal) string {
	s := formatMoney(amount)
	if len(s) > 0 && s[0] == '$' {
		return s[1:]
	}
	return s
}

// formatMoney formats a decimal as Argentine peso string: $1.234,56
func formatMoney(amount decimal.Decimal) string {
	intVal := amount.IntPart()
	cents := amount.Sub(decimal.NewFromInt(intVal)).Mul(decimal.NewFromInt(100)).Abs().IntPart()
	s := fmt.Sprintf("%d", intVal)
	n := len(s)
	var b strings.Builder
	for i, c := range s {
		if i > 0 && (n-i)%3 == 0 {
			b.WriteRune('.')
		}
		b.WriteRune(c)
	}
	return fmt.Sprintf("$%s,%02d", b.String(), cents)
}
