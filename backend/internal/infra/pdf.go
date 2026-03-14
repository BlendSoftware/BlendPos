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

	data, err := buildFacturaData(venta, comp, config, false, false)
	if err != nil {
		return "", fmt.Errorf("pdf: build factura data: %w", err)
	}

	tipoLetra := data.TipoLetra
	switch comp.Tipo {
	case "factura_a":
	case "factura_b":
	case "factura_c":
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
	pdf.SetMargins(8, 8, 8)
	pdf.AddPage()
	tr := pdf.UnicodeTranslatorFromDescriptor("")

	pageW, _ := pdf.GetPageSize()
	marginL := 8.0
	marginR := 8.0
	contentW := pageW - marginL - marginR
	pageTop := 10.0
	pageBottom := 282.0

	pdf.SetDrawColor(0, 0, 0)
	pdf.SetLineWidth(0.35)
	pdf.Rect(marginL, pageTop, contentW, pageBottom-pageTop, "D")

	headerH := 36.0
	leftW := contentW * 0.42
	centerW := contentW * 0.16
	rightW := contentW * 0.42
	startY := pageTop

	pdf.SetLineWidth(0.3)
	pdf.Line(marginL, startY+headerH, marginL+contentW, startY+headerH)
	pdf.Line(marginL+leftW, startY, marginL+leftW, startY+headerH)
	pdf.Line(marginL+leftW+centerW, startY, marginL+leftW+centerW, startY+headerH)

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
		textStartY = startY + 18
	}
	pdf.SetXY(xL, textStartY)
	pdf.SetFont("Helvetica", "B", 12)
	pdf.CellFormat(leftW-6, 5.5, tr(data.RazonSocial), "", 1, "L", false, 0, "")

	pdf.SetFont("Helvetica", "", 7.4)
	if data.Domicilio != "" {
		pdf.SetXY(xL, pdf.GetY()+0.5)
		pdf.MultiCell(leftW-6, 3.6, tr(data.Domicilio), "", "L", false)
	}
	pdf.SetXY(xL, pdf.GetY()+0.8)
	pdf.SetFont("Helvetica", "B", 7.2)
	pdf.MultiCell(leftW-6, 3.6, tr("Condición frente al IVA: "+data.CondicionFiscal), "", "L", false)

	boxX := marginL + leftW
	pdf.SetXY(boxX, startY+1.5)
	pdf.SetFont("Helvetica", "B", 7)
	pdf.CellFormat(centerW, 4, tr(data.TipoNombre), "", 1, "C", false, 0, "")
	pdf.SetXY(boxX, startY+5.5)
	pdf.SetFont("Helvetica", "B", 42)
	pdf.CellFormat(centerW, 18, tr(data.TipoLetra), "", 1, "C", false, 0, "")
	pdf.SetXY(boxX, startY+24.5)
	pdf.SetFont("Helvetica", "", 7)
	pdf.CellFormat(centerW, 4, tr("COD. "+data.TipoCodigo), "", 1, "C", false, 0, "")

	xR := marginL + leftW + centerW + 3
	pdf.SetXY(xR, startY+2.5)
	pdf.SetFont("Helvetica", "", 9)
	pdf.CellFormat(22, 5, tr(data.TipoNombre), "", 0, "L", false, 0, "")
	pdf.SetFont("Helvetica", "B", 10)
	pdf.CellFormat(rightW-28, 5, tr("N° "+data.NumeroFormateado), "", 1, "R", false, 0, "")

	pdf.SetXY(xR, pdf.GetY()+0.2)
	pdf.SetFont("Helvetica", "", 9)
	pdf.CellFormat(14, 4.2, tr("Fecha"), "", 0, "L", false, 0, "")
	dateValW := rightW - 6 - 14 - 24
	pdf.CellFormat(dateValW, 4.2, tr(data.FechaStr), "", 0, "L", false, 0, "")
	pdf.SetFont("Helvetica", "B", 9)
	pdf.CellFormat(24, 4.2, tr(data.CopiaLabel), "", 1, "R", false, 0, "")

	pdf.SetXY(xR, pdf.GetY()+0.8)
	pdf.SetFont("Helvetica", "", 7.2)
	rowH := 3.7
	metaRows := [][2]string{{"CUIT:", data.CUIT}, {"Punto de venta:", data.PuntoDeVenta}}
	if data.IIBB != "" {
		metaRows = append(metaRows, [2]string{"Ing. Brutos:", data.IIBB})
	}
	if data.FechaInicioActiv != "" {
		metaRows = append(metaRows, [2]string{"Inicio de act.:", data.FechaInicioActiv})
	}
	for _, row := range metaRows {
		pdf.SetXY(xR, pdf.GetY())
		pdf.CellFormat(28, rowH, tr(row[0]), "", 0, "L", false, 0, "")
		pdf.CellFormat(rightW-31, rowH, tr(row[1]), "", 1, "L", false, 0, "")
	}

	recY := startY + headerH
	recH := 20.0
	pdf.Line(marginL, recY+recH, marginL+contentW, recY+recH)
	midX := marginL + contentW/2
	pdf.Line(midX, recY, midX, recY+recH)

	pdf.SetXY(marginL+3, recY+2)
	pdf.SetFont("Helvetica", "B", 8)
	pdf.CellFormat(20, 5, tr("NOMBRE:"), "", 0, "L", false, 0, "")
	pdf.SetFont("Helvetica", "", 9)
	halfW := contentW/2 - 23
	pdf.CellFormat(halfW, 5, tr(data.ReceptorNombre), "", 0, "L", false, 0, "")

	xRecR := midX + 3
	pdf.SetXY(xRecR, recY+2)
	pdf.SetFont("Helvetica", "B", 8)
	docLabel := data.ReceptorDocLabel
	if docLabel == "" {
		docLabel = "DOCUMENTO"
	}
	docNumero := data.ReceptorDocNumero
	if docNumero == "" {
		docNumero = "-"
	}
	pdf.CellFormat(22, 5, tr(docLabel+":"), "", 0, "L", false, 0, "")
	pdf.SetFont("Helvetica", "", 8)
	pdf.CellFormat(rightW-26, 5, tr(docNumero), "", 1, "L", false, 0, "")

	pdf.SetXY(marginL+3, recY+8)
	pdf.SetFont("Helvetica", "B", 8)
	pdf.CellFormat(20, 5, tr("DOMICILIO:"), "", 0, "L", false, 0, "")
	pdf.SetFont("Helvetica", "", 8)
	domReceptor := data.ReceptorDomicilio
	if domReceptor == "" {
		domReceptor = "-"
	}
	pdf.CellFormat(halfW, 5, tr(domReceptor), "", 0, "L", false, 0, "")

	pdf.SetXY(xRecR, recY+8)
	pdf.SetFont("Helvetica", "B", 8)
	pdf.CellFormat(34, 5, tr("COND. FRENTE AL IVA:"), "", 0, "L", false, 0, "")
	pdf.SetFont("Helvetica", "", 8)
	pdf.CellFormat(rightW-38, 5, tr(data.ReceptorCondicionIVA), "", 1, "L", false, 0, "")

	condPagoY := recY + recH - 7
	pdf.Line(marginL, condPagoY, marginL+contentW, condPagoY)
	pdf.SetXY(marginL+3, condPagoY+1.5)
	pdf.SetFont("Helvetica", "B", 7.5)
	pdf.CellFormat(58, 4, tr("CONDICIÓN Y FORMA DE PAGO:"), "", 0, "L", false, 0, "")
	pdf.SetFont("Helvetica", "", 7.5)
	pdf.CellFormat(contentW-61, 4, tr(data.CondicionPago), "", 1, "L", false, 0, "")

	tableY := recY + recH
	pdf.SetXY(marginL, tableY)
	colCode := 22.0
	colDetail := 54.0
	colQty := 18.0
	colUnit := 16.0
	colPU := 23.0
	colPct := 16.0
	colBonif := 20.0
	colImporte := contentW - colCode - colDetail - colQty - colUnit - colPU - colPct - colBonif
	hRowH := 6.0
	itemRowH := 5.8
	tableBottomY := 232.0

	pdf.SetFillColor(242, 244, 247)
	pdf.SetTextColor(0, 0, 0)
	pdf.SetFont("Helvetica", "B", 6.4)
	pdf.SetTextColor(68, 68, 68)
	for _, header := range []struct {
		w     float64
		label string
		align string
	}{{colCode, "CÓDIGO", "L"}, {colDetail, "PRODUCTO / SERVICIO", "L"}, {colQty, "CANTIDAD", "R"}, {colUnit, "U. MEDIDA", "C"}, {colPU, "PRECIO UNIT.", "R"}, {colPct, "% BONIF.", "R"}, {colBonif, "IMP. BONIF.", "R"}, {colImporte, "IMPORTE", "R"}} {
		pdf.CellFormat(header.w, hRowH, tr(header.label), "1", 0, header.align, true, 0, "")
	}
	pdf.Ln(-1)

	pdf.SetTextColor(17, 17, 17)
	pdf.SetFont("Helvetica", "", 7.2)
	availableRows := int((tableBottomY - (tableY + hRowH)) / itemRowH)
	if availableRows < len(data.Items) {
		availableRows = len(data.Items)
	}
	if availableRows < 18 {
		availableRows = 18
	}
	for idx := 0; idx < availableRows; idx++ {
		item := facturaHTMLItem{Codigo: "", Nombre: "", Cantidad: "", UnidadMedida: "", PrecioUnitario: "", BonifPct: "", BonifImporte: "", PrecioTotal: ""}
		if idx < len(data.Items) {
			item = data.Items[idx]
		}
		pdf.SetX(marginL)
		pdf.CellFormat(colCode, itemRowH, tr(item.Codigo), "LR", 0, "L", false, 0, "")
		pdf.CellFormat(colDetail, itemRowH, tr(item.Nombre), "LR", 0, "L", false, 0, "")
		pdf.CellFormat(colQty, itemRowH, tr(item.Cantidad), "LR", 0, "R", false, 0, "")
		pdf.CellFormat(colUnit, itemRowH, tr(item.UnidadMedida), "LR", 0, "C", false, 0, "")
		pdf.CellFormat(colPU, itemRowH, tr(item.PrecioUnitario), "LR", 0, "R", false, 0, "")
		pdf.CellFormat(colPct, itemRowH, tr(item.BonifPct), "LR", 0, "R", false, 0, "")
		pdf.CellFormat(colBonif, itemRowH, tr(item.BonifImporte), "LR", 0, "R", false, 0, "")
		pdf.CellFormat(colImporte, itemRowH, tr(item.PrecioTotal), "LR", 1, "R", false, 0, "")
	}
	pdf.SetX(marginL)
	pdf.CellFormat(contentW, 0, "", "T", 1, "", false, 0, "")

	summaryY := pdf.GetY()
	summaryH := 6.5
	summaryW := contentW / 3
	pdf.SetFillColor(255, 251, 240)
	pdf.SetFont("Helvetica", "B", 7.2)
	pdf.SetTextColor(102, 102, 102)
	pdf.SetXY(marginL, summaryY)
	pdf.CellFormat(summaryW, summaryH, tr("Subtotal: "+data.SubtotalBrutoFormateado), "1", 0, "L", true, 0, "")
	pdf.CellFormat(summaryW, summaryH, tr("Bonificación: - "+data.BonificacionTotalFormateado), "1", 0, "L", true, 0, "")
	pdf.CellFormat(contentW-summaryW-summaryW, summaryH, tr("Total: "+data.TotalFormateado), "1", 1, "L", true, 0, "")

	sonPesosW := contentW - 78.0
	totalW := 78.0
	sonPesosH := 8.0
	pdf.SetXY(marginL, pdf.GetY())
	pdf.SetTextColor(0, 0, 0)
	pdf.SetFont("Helvetica", "B", 7.4)
	pdf.CellFormat(20, sonPesosH, tr("SON PESOS:"), "1", 0, "L", false, 0, "")
	pdf.SetFont("Helvetica", "I", 7.2)
	pdf.CellFormat(sonPesosW-20, sonPesosH, tr(data.TotalEnLetras), "1", 0, "L", false, 0, "")
	pdf.SetFillColor(240, 243, 248)
	pdf.SetFont("Helvetica", "B", 9)
	pdf.CellFormat(totalW*0.52, sonPesosH, tr("IMPORTE TOTAL"), "1", 0, "R", true, 0, "")
	pdf.SetFont("Helvetica", "B", 12)
	pdf.CellFormat(totalW*0.48, sonPesosH, tr("$ "+data.TotalFormateado), "1", 1, "R", true, 0, "")

	caeY := pdf.GetY()
	footerH := 28.0
	pdf.Line(marginL, caeY, marginL+contentW, caeY)
	pdf.Line(marginL, caeY+footerH, marginL+contentW, caeY+footerH)
	pdf.Line(marginL+contentW*0.48, caeY, marginL+contentW*0.48, caeY+footerH)

	pdf.SetXY(marginL+3, caeY+2)
	pdf.SetFont("Helvetica", "B", 8.5)
	pdf.CellFormat(contentW*0.48-6, 5, tr("Comprobante autorizado"), "", 1, "L", false, 0, "")
	pdf.SetFont("Helvetica", "", 7.6)
	if data.CAE != "" {
		pdf.SetX(marginL + 3)
		pdf.CellFormat(contentW*0.48-6, 4.2, tr("CAE N°: "+data.CAE), "", 1, "L", false, 0, "")
		if data.CAEVencimiento != "" {
			pdf.SetX(marginL + 3)
			pdf.CellFormat(contentW*0.48-6, 4.2, tr("Fecha de vencimiento del CAE: "+data.CAEVencimiento), "", 1, "L", false, 0, "")
		}
	} else {
		pdf.SetX(marginL + 3)
		pdf.SetTextColor(180, 0, 0)
		pdf.CellFormat(contentW*0.48-6, 4.2, tr("Pendiente de autorización ARCA / AFIP"), "", 1, "L", false, 0, "")
		pdf.SetTextColor(0, 0, 0)
	}

	if data.BarcodeText != "" {
		barcodeImg, bcErr := code128.Encode(data.BarcodeText)
		if bcErr == nil {
			scaledBarcode, scErr := barcode.Scale(barcodeImg, 760, 70)
			if scErr == nil {
				tmpBarcode := filepath.Join(storagePath, ".tmp_bc_"+comp.ID.String()+".png")
				f, fileErr := os.Create(tmpBarcode)
				if fileErr == nil {
					defer os.Remove(tmpBarcode)
					if encErr := png.Encode(f, scaledBarcode); encErr == nil {
						f.Close()
						barcodeX := marginL + contentW*0.48 + 4
						barcodeY := caeY + 4
						barcodeW := contentW*0.52 - 8
						pdf.Image(tmpBarcode, barcodeX, barcodeY, barcodeW, 0, false, "", 0, "")
						pdf.SetXY(barcodeX, caeY+20.5)
						pdf.SetFont("Helvetica", "", 6.4)
						pdf.CellFormat(barcodeW, 3.5, tr(data.BarcodeText), "", 0, "C", false, 0, "")
					} else {
						f.Close()
					}
				}
			}
		}
	}

	legalY := caeY + footerH + 2
	pdf.SetXY(marginL+3, legalY)
	pdf.SetFont("Helvetica", "I", 6.2)
	pdf.SetTextColor(100, 100, 100)
	legal := "Esta Administración Federal no se responsabiliza por los datos ingresados en el detalle de la operación.\n"
	legal += "Comprobante autorizado según Resolución General ARCA (ex AFIP). Verificación: www.afip.gob.ar/genericos/consultaCAE"
	pdf.MultiCell(contentW-6, 3.2, tr(legal), "", "L", false)

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
