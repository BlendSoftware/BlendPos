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
		tipoNombre = "FACTURA A"
	case "factura_b":
		tipoLetra = "B"
		tipoNombre = "FACTURA B"
	case "factura_c":
		tipoLetra = "C"
		tipoNombre = "FACTURA C"
	}

	// Dereference Numero pointer safely
	var numeroComprobante int64
	if comp.Numero != nil {
		numeroComprobante = *comp.Numero
	}

	// Use fiscal config PuntoDeVenta
	pvDisplay := comp.PuntoDeVenta
	if pvDisplay == 0 {
		pvDisplay = config.PuntoDeVenta
	}

	fileName := fmt.Sprintf("factura_%s_%04d_%08d.pdf", tipoLetra, pvDisplay, numeroComprobante)
	filePath := filepath.Join(storagePath, fileName)

	// ═══════════════════════════════════════════════════════════════════════
	// SETUP PDF (A4)
	// ═══════════════════════════════════════════════════════════════════════
	pdf := fpdf.New("P", "mm", "A4", "")
	pdf.SetMargins(12, 12, 12)
	pdf.AddPage()

	tr := pdf.UnicodeTranslatorFromDescriptor("")
	pageW, _ := pdf.GetPageSize()
	contentW := pageW - 24 // both margins

	// ═══════════════════════════════════════════════════════════════════════
	// HEADER SECTION: Emisor + Tipo Comprobante Box + Número
	// ═══════════════════════════════════════════════════════════════════════
	leftColW := contentW * 0.42
	centerBoxW := contentW * 0.16
	rightColW := contentW * 0.42

	startY := pdf.GetY()

	// ─── LEFT: Emisor Data ───────────────────────────────────────────────
	pdf.SetFont("Helvetica", "B", 12)
	pdf.CellFormat(leftColW, 6, tr(config.RazonSocial), "", 1, "L", false, 0, "")
	
	pdf.SetFont("Helvetica", "", 9)
	// Domicilio
	if config.DomicilioComercial != nil && *config.DomicilioComercial != "" {
		pdf.CellFormat(leftColW, 4, tr(*config.DomicilioComercial), "", 1, "L", false, 0, "")
	}
	// Ciudad, Provincia, CP
	var localidad string
	if config.DomicilioCiudad != nil && *config.DomicilioCiudad != "" {
		localidad = *config.DomicilioCiudad
	}
	if config.DomicilioProvincia != nil && *config.DomicilioProvincia != "" {
		if localidad != "" {
			localidad += ", " + *config.DomicilioProvincia
		} else {
			localidad = *config.DomicilioProvincia
		}
	}
	if config.DomicilioCodigoPostal != nil && *config.DomicilioCodigoPostal != "" {
		if localidad != "" {
			localidad += " (" + *config.DomicilioCodigoPostal + ")"
		} else {
			localidad = "CP " + *config.DomicilioCodigoPostal
		}
	}
	if localidad != "" {
		pdf.CellFormat(leftColW, 4, tr(localidad), "", 1, "L", false, 0, "")
	}

	pdf.SetFont("Helvetica", "B", 8)
	pdf.CellFormat(leftColW, 4, tr("CUIT: "+config.CUITEmsior), "", 1, "L", false, 0, "")
	pdf.SetFont("Helvetica", "", 8)
	pdf.CellFormat(leftColW, 4, tr(config.CondicionFiscal), "", 1, "L", false, 0, "")
	
	// Fecha inicio actividades
	if config.FechaInicioActividades != nil {
		pdf.CellFormat(leftColW, 4, tr("Inicio Act: "+config.FechaInicioActividades.Format("02/01/2006")), "", 1, "L", false, 0, "")
	}
	
	// IIBB
	if config.IIBB != nil && *config.IIBB != "" {
		pdf.CellFormat(leftColW, 4, tr("IIBB: "+*config.IIBB), "", 1, "L", false, 0, "")
	}

	// ─── CENTER: Tipo Comprobante Box (large letter) ─────────────────────
	boxX := 12 + leftColW
	boxY := startY
	boxH := 35.0

	pdf.SetXY(boxX, boxY)
	pdf.SetDrawColor(0, 0, 0)
	pdf.SetLineWidth(1.2)
	pdf.Rect(boxX, boxY, centerBoxW, boxH, "D")
	
	// Big letter in center
	pdf.SetXY(boxX, boxY+10)
	pdf.SetFont("Helvetica", "B", 52)
	pdf.CellFormat(centerBoxW, 18, tipoLetra, "", 1, "C", false, 0, "")
	
	// Código below
	pdf.SetXY(boxX, boxY+28)
	pdf.SetFont("Helvetica", "", 7)
	pdf.CellFormat(centerBoxW, 3, tr("COD. "+fmt.Sprintf("%02d", tipoComprobanteCode(comp.Tipo))), "", 1, "C", false, 0, "")

	// ─── RIGHT: Comprobante Info ─────────────────────────────────────────
	rightX := boxX + centerBoxW
	pdf.SetXY(rightX, startY)
	pdf.SetFont("Helvetica", "B", 11)
	pdf.CellFormat(rightColW, 6, tr(tipoNombre), "", 1, "L", false, 0, "")
	
	pdf.SetXY(rightX, startY+6)
	pdf.SetFont("Helvetica", "", 9)
	// Número de 12 dígitos: 4 PV + 8 número
	numeroFormatted := fmt.Sprintf("%04d-%08d", pvDisplay, numeroComprobante)
	pdf.CellFormat(rightColW, 5, tr("N°: "+numeroFormatted), "", 1, "L", false, 0, "")
	
	pdf.SetXY(rightX, startY+11)
	pdf.CellFormat(rightColW, 5, tr("Fecha: "+venta.CreatedAt.Format("02/01/2006")), "", 1, "L", false, 0, "")
	
	// Original / Duplicado
	pdf.SetXY(rightX, startY+16)
	pdf.SetFont("Helvetica", "B", 8)
	pdf.CellFormat(rightColW, 4, tr("ORIGINAL"), "", 1, "L", false, 0, "")

	pdf.SetY(startY + boxH + 3)
	pdf.Line(12, pdf.GetY(), pageW-12, pdf.GetY())
	pdf.Ln(4)

	// ═══════════════════════════════════════════════════════════════════════
	// RECEPTOR SECTION
	// ═══════════════════════════════════════════════════════════════════════
	pdf.SetFont("Helvetica", "B", 9)
	pdf.CellFormat(30, 5, tr("CLIENTE:"), "B", 0, "L", false, 0, "")
	pdf.SetFont("Helvetica", "", 9)
	
	receptorNombre := "CONSUMIDOR FINAL"
	if comp.ReceptorNombre != nil && *comp.ReceptorNombre != "" {
		receptorNombre = *comp.ReceptorNombre
	}
	pdf.CellFormat(contentW-30, 5, tr(receptorNombre), "B", 1, "L", false, 0, "")
	
	// Documento y domicilio en segunda línea
	pdf.SetFont("Helvetica", "", 8)
	docInfo := ""
	if comp.ReceptorCUIT != nil && *comp.ReceptorCUIT != "" && *comp.ReceptorCUIT != "0" {
		docTipo := "CUIT"
		if comp.ReceptorTipoDocumento != nil {
			switch *comp.ReceptorTipoDocumento {
			case 96:
				docTipo = "DNI"
			case 99:
				docTipo = "CONSUMIDOR FINAL"
			}
		}
		if docTipo != "CONSUMIDOR FINAL" {
			docInfo = docTipo + ": " + *comp.ReceptorCUIT
		}
	}
	
	domInfo := ""
	if comp.ReceptorDomicilio != nil && *comp.ReceptorDomicilio != "" {
		domInfo = *comp.ReceptorDomicilio
	}
	
	if docInfo != "" && domInfo != "" {
		pdf.CellFormat(contentW, 4, tr(docInfo+"  |  "+domInfo), "", 1, "L", false, 0, "")
	} else if docInfo != "" {
		pdf.CellFormat(contentW, 4, tr(docInfo), "", 1, "L", false, 0, "")
	} else if domInfo != "" {
		pdf.CellFormat(contentW, 4, tr(domInfo), "", 1, "L", false, 0, "")
	}
	
	// Condición de pago
	pdf.SetFont("Helvetica", "", 8)
	condPago := "Contado"
	if len(venta.Pagos) > 0 {
		condPago = "Contado - " + strings.Title(venta.Pagos[0].Metodo)
	}
	pdf.CellFormat(contentW, 4, tr("CONDICIÓN Y FORMA DE PAGO: "+condPago), "", 1, "L", false, 0, "")
	
	pdf.Ln(3)

	// ═══════════════════════════════════════════════════════════════════════
	// ITEMS TABLE
	// ═══════════════════════════════════════════════════════════════════════
	pdf.SetFillColor(240, 240, 240)
	pdf.SetFont("Helvetica", "B", 8)
	
	colCant := contentW * 0.08
	colDetalle := contentW * 0.50
	colPrecio := contentW * 0.18
	colSubtotal := contentW * 0.24
	
	pdf.CellFormat(colCant, 5, tr("Cant"), "1", 0, "C", true, 0, "")
	pdf.CellFormat(colDetalle, 5, tr("Detalle"), "1", 0, "L", true, 0, "")
	pdf.CellFormat(colPrecio, 5, tr("Precio Unit."), "1", 0, "R", true, 0, "")
	pdf.CellFormat(colSubtotal, 5, tr("Precio Total"), "1", 1, "R", true, 0, "")

	pdf.SetFont("Helvetica", "", 8)
	pdf.SetFillColor(255, 255, 255)
	
	for _, item := range venta.Items {
		nombre := "Producto"
		if item.Producto != nil {
			nombre = item.Producto.Nombre
		}

		pdf.CellFormat(colCant, 5, fmt.Sprintf("%d", item.Cantidad), "LR", 0, "C", false, 0, "")
		pdf.CellFormat(colDetalle, 5, tr(nombre), "LR", 0, "L", false, 0, "")
		pdf.CellFormat(colPrecio, 5, "$"+item.PrecioUnitario.StringFixed(2), "LR", 0, "R", false, 0, "")
		pdf.CellFormat(colSubtotal, 5, "$"+item.Subtotal.StringFixed(2), "LR", 1, "R", false, 0, "")
	}
	
	// Bottom border for table
	pdf.CellFormat(contentW, 0, "", "T", 1, "", false, 0, "")
	
	pdf.Ln(2)

	// ═══════════════════════════════════════════════════════════════════════
	// TOTALS SECTION
	// ═══════════════════════════════════════════════════════════════════════
	totalsX := pageW - 12 - 70
	
	// Calculate amounts based on invoice type
	neto := decimal.Zero
	iva := decimal.Zero
	
	isRI := strings.Contains(config.CondicionFiscal, "Responsable Inscripto")
	
	if isRI && tipoLetra == "A" {
		// Factura A: discriminate IVA
		neto = venta.Total.Div(decimal.NewFromFloat(1.21))
		iva = venta.Total.Sub(neto)
	} else if tipoLetra == "B" {
		// Factura B: IVA included
		neto = venta.Total.Div(decimal.NewFromFloat(1.21))
		iva = venta.Total.Sub(neto)
	} else {
		// Factura C: no IVA
		neto = venta.Total
	}

	pdf.SetFont("Helvetica", "", 9)
	
	if !venta.DescuentoTotal.IsZero() {
		pdf.SetX(totalsX)
		pdf.CellFormat(40, 5, tr("Descuento:"), "", 0, "L", false, 0, "")
		pdf.CellFormat(30, 5, "-$"+venta.DescuentoTotal.StringFixed(2), "", 1, "R", false, 0, "")
	}

		// Show subtotal/neto
	if !iva.IsZero() {
		pdf.SetX(totalsX)
		pdf.CellFormat(40, 5, tr("Subtotal (Neto):"), "", 0, "L", false, 0, "")
		pdf.CellFormat(30, 5, "$"+neto.StringFixed(2), "", 1, "R", false, 0, "")
		
		pdf.SetX(totalsX)
		pdf.CellFormat(40, 5, tr("IVA (21%):"), "", 0, "L", false, 0, "")
		pdf.CellFormat(30, 5, "$"+iva.StringFixed(2), "", 1, "R", false, 0, "")
	}

	pdf.SetX(totalsX)
	pdf.SetFont("Helvetica", "B", 11)
	pdf.CellFormat(40, 7, tr("Importe total"), "T", 0, "L", false, 0, "")
	pdf.CellFormat(30, 7, "$"+venta.Total.StringFixed(2), "T", 1, "R", false, 0, "")

	pdf.Ln(5)

	// ═══════════════════════════════════════════════════════════════════════
	// CAE + BARCODE SECTION
	// ═══════════════════════════════════════════════════════════════════════
	if comp.CAE != nil && *comp.CAE != "" {
		pdf.SetDrawColor(0, 0, 0)
		pdf.SetLineWidth(0.5)
		pdf.Rect(12, pdf.GetY(), contentW, 30, "D")
		
		caeBoxY := pdf.GetY()
		pdf.SetXY(14, caeBoxY+2)
		
		pdf.SetFont("Helvetica", "B", 9)
		pdf.CellFormat(40, 5, tr("Comprobante autorizado"), "", 1, "L", false, 0, "")
		
		pdf.SetX(14)
		pdf.SetFont("Helvetica", "", 8)
		pdf.CellFormat(100, 4, tr("CAE N°: "+*comp.CAE), "", 1, "L", false, 0, "")
		
		if comp.CAEVencimiento != nil {
			pdf.SetX(14)
			pdf.CellFormat(100, 4, tr("Vencimiento CAE: "+comp.CAEVencimiento.Format("02/01/2006")), "", 1, "L", false, 0, "")
		}

		// Generate and insert barcode
		cuitClean := strings.ReplaceAll(config.CUITEmsior, "-", "")
		if len(cuitClean) == 11 {
			barcodeData := fmt.Sprintf("%s%02d%04d%s",
				cuitClean,
				tipoComprobanteCode(comp.Tipo),
				pvDisplay,
				*comp.CAE,
			)

			barcodeImg, err := code128.Encode(barcodeData)
			if err == nil {
				scaledBarcode, err := barcode.Scale(barcodeImg, 500, 60)
				if err == nil {
					tmpBarcode := filepath.Join(storagePath, ".tmp_barcode_"+comp.ID.String()+".png")
					f, err := os.Create(tmpBarcode)
					if err == nil {
						defer os.Remove(tmpBarcode)
						if err := png.Encode(f, scaledBarcode); err == nil {
							f.Close()
							barcodeX := pageW - 12 - 80
							barcodeY := caeBoxY + 5
							pdf.Image(tmpBarcode, barcodeX, barcodeY, 75, 0, false, "", 0, "")
						} else {
							f.Close()
						}
					}
				}
			}
		}
		
		pdf.SetY(caeBoxY + 32)
	}

	// ═══════════════════════════════════════════════════════════════════════
	// LEGAL FOOTER
	// ═══════════════════════════════════════════════════════════════════════
	pdf.Ln(5)
	pdf.SetFont("Helvetica", "I", 7)
	legalText := "Esta Administración Federal no se responsabiliza por los datos ingresados en el detalle de la operación.\n"
	legalText += "Comprobante autorizado según Resolución General AFIP.\n"
	legalText += "Para verificar el comprobante ingresar a www.afip.gob.ar/genericos/consultaCAE"
	pdf.MultiCell(contentW, 3, tr(legalText), "", "L", false)

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

