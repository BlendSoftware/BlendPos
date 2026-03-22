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
	"context"
	"fmt"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"blendpos/internal/model"

	"github.com/chromedp/cdproto/page"
	"github.com/chromedp/chromedp"
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
	pdf.SetFont("Helvetica", "B", 14)
	pdf.CellFormat(contentW, 7, tr("BlendPOS"), "", 1, "C", false, 0, "")

	pdf.SetFont("Helvetica", "", 10)
	pdf.CellFormat(contentW, 5, tr("Comprobante de Compra"), "", 1, "C", false, 0, "")
	pdf.Ln(2)

	// ── Ticket info ───────────────────────────────────────────────────────────
	pdf.SetFont("Helvetica", "B", 10)
	pdf.CellFormat(contentW, 5, tr(fmt.Sprintf("Ticket N° %d", venta.NumeroTicket)), "", 1, "L", false, 0, "")
	pdf.SetFont("Helvetica", "B", 9)
	pdf.CellFormat(contentW, 4, venta.CreatedAt.Format("02/01/2006  15:04"), "", 1, "L", false, 0, "")
	pdf.Ln(2)

	// ── Separator ────────────────────────────────────────────────────────────
	pdf.Line(4, pdf.GetY(), pageW-4, pdf.GetY())
	pdf.Ln(2)

	// ── Items header ──────────────────────────────────────────────────────────
	col1 := contentW * 0.52 // product name
	col2 := contentW * 0.16 // qty
	col3 := contentW * 0.32 // subtotal

	pdf.SetFont("Helvetica", "B", 9)
	pdf.CellFormat(col1, 5, tr("Producto"), "B", 0, "L", false, 0, "")
	pdf.CellFormat(col2, 5, tr("Cant"), "B", 0, "C", false, 0, "")
	pdf.CellFormat(col3, 5, tr("Subtotal"), "B", 1, "R", false, 0, "")

	// ── Item rows ─────────────────────────────────────────────────────────────
	pdf.SetFont("Helvetica", "", 9)
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
	pdf.SetFont("Helvetica", "", 9)
	if !venta.DescuentoTotal.IsZero() {
		pdf.CellFormat(col1+col2, 5, tr("Descuento:"), "", 0, "L", false, 0, "")
		pdf.CellFormat(col3, 5, "-$"+venta.DescuentoTotal.StringFixed(2), "", 1, "R", false, 0, "")
	}

	pdf.SetFont("Helvetica", "B", 12)
	pdf.CellFormat(col1+col2, 7, tr("TOTAL:"), "", 0, "L", false, 0, "")
	pdf.CellFormat(col3, 7, "$"+venta.Total.StringFixed(2), "", 1, "R", false, 0, "")

	// ── Payment methods ───────────────────────────────────────────────────────
	pdf.Ln(2)
	pdf.SetFont("Helvetica", "", 9)
	for _, pago := range venta.Pagos {
		label := tr("Pago (" + pago.Metodo + "):")
		pdf.CellFormat(col1+col2, 4, label, "", 0, "L", false, 0, "")
		pdf.CellFormat(col3, 4, "$"+pago.Monto.StringFixed(2), "", 1, "R", false, 0, "")
	}

	// ── Footer ────────────────────────────────────────────────────────────────
	pdf.Ln(3)
	pdf.SetFont("Helvetica", "I", 9)
	pdf.CellFormat(contentW, 5, tr("¡Gracias por su compra!"), "", 1, "C", false, 0, "")

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

	html, err := GenerateFacturaHTML(venta, comp, config, false, false)
	if err != nil {
		return "", fmt.Errorf("pdf: generate factura html: %w", err)
	}

	tipoLetra := "X"
	switch comp.Tipo {
	case "factura_a":
		tipoLetra = "A"
	case "factura_b":
		tipoLetra = "B"
	case "factura_c":
		tipoLetra = "C"
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

	tempHTMLFile, err := os.CreateTemp(storagePath, "factura-*.html")
	if err != nil {
		return "", fmt.Errorf("pdf: create temp html: %w", err)
	}
	tempHTMLPath := tempHTMLFile.Name()
	defer os.Remove(tempHTMLPath)
	if _, err := tempHTMLFile.WriteString(html); err != nil {
		tempHTMLFile.Close()
		return "", fmt.Errorf("pdf: write temp html: %w", err)
	}
	if err := tempHTMLFile.Close(); err != nil {
		return "", fmt.Errorf("pdf: close temp html: %w", err)
	}

	pdfBytes, err := renderFacturaHTMLToPDF(tempHTMLPath)
	if err != nil {
		return "", err
	}
	if err := os.WriteFile(filePath, pdfBytes, 0644); err != nil {
		return "", fmt.Errorf("pdf: write file: %w", err)
	}

	return filePath, nil
}

func renderFacturaHTMLToPDF(htmlPath string) ([]byte, error) {
	absPath, err := filepath.Abs(htmlPath)
	if err != nil {
		return nil, fmt.Errorf("pdf: resolve html path: %w", err)
	}

	browserPath, err := findChromeExecutable()
	if err != nil {
		return nil, err
	}

	allocOpts := append(chromedp.DefaultExecAllocatorOptions[:],
		chromedp.ExecPath(browserPath),
		chromedp.NoSandbox,
		chromedp.DisableGPU,
		chromedp.Flag("disable-dev-shm-usage", true),
		chromedp.Flag("allow-file-access-from-files", true),
		chromedp.Flag("hide-scrollbars", true),
	)
	allocCtx, cancelAlloc := chromedp.NewExecAllocator(context.Background(), allocOpts...)
	defer cancelAlloc()

	ctx, cancelCtx := chromedp.NewContext(allocCtx)
	defer cancelCtx()

	ctx, cancelTimeout := context.WithTimeout(ctx, 45*time.Second)
	defer cancelTimeout()

	fileURL := (&url.URL{Scheme: "file", Path: filepath.ToSlash(absPath)}).String()
	var pdfBytes []byte
	err = chromedp.Run(ctx,
		chromedp.Navigate(fileURL),
		chromedp.WaitReady("body", chromedp.ByQuery),
		chromedp.Sleep(800*time.Millisecond),
		chromedp.ActionFunc(func(ctx context.Context) error {
			buf, _, err := page.PrintToPDF().
				WithPrintBackground(true).
				WithPreferCSSPageSize(true).
				WithMarginTop(0).
				WithMarginBottom(0).
				WithMarginLeft(0).
				WithMarginRight(0).
				Do(ctx)
			if err != nil {
				return err
			}
			pdfBytes = buf
			return nil
		}),
	)
	if err != nil {
		return nil, fmt.Errorf("pdf: render html with chrome: %w", err)
	}

	return pdfBytes, nil
}

func findChromeExecutable() (string, error) {
	if envPath := strings.TrimSpace(os.Getenv("CHROME_BIN")); envPath != "" {
		if _, err := os.Stat(envPath); err == nil {
			return envPath, nil
		}
	}
	if envPath := strings.TrimSpace(os.Getenv("GOOGLE_CHROME_BIN")); envPath != "" {
		if _, err := os.Stat(envPath); err == nil {
			return envPath, nil
		}
	}

	candidates := []string{
		"chromium-browser",
		"chromium",
		"google-chrome",
		"chrome",
		"msedge",
	}
	for _, candidate := range candidates {
		if path, err := exec.LookPath(candidate); err == nil {
			return path, nil
		}
	}

	if runtime.GOOS == "windows" {
		windowsCandidates := []string{
			filepath.Join(os.Getenv("ProgramFiles"), "Google", "Chrome", "Application", "chrome.exe"),
			filepath.Join(os.Getenv("ProgramFiles(x86)"), "Google", "Chrome", "Application", "chrome.exe"),
			filepath.Join(os.Getenv("LocalAppData"), "Google", "Chrome", "Application", "chrome.exe"),
			filepath.Join(os.Getenv("ProgramFiles"), "Microsoft", "Edge", "Application", "msedge.exe"),
			filepath.Join(os.Getenv("ProgramFiles(x86)"), "Microsoft", "Edge", "Application", "msedge.exe"),
		}
		for _, candidate := range windowsCandidates {
			if candidate == "" {
				continue
			}
			if _, err := os.Stat(candidate); err == nil {
				return candidate, nil
			}
		}
	}

	linuxCandidates := []string{"/usr/bin/chromium-browser", "/usr/bin/chromium", "/usr/bin/google-chrome", "/snap/bin/chromium"}
	for _, candidate := range linuxCandidates {
		if _, err := os.Stat(candidate); err == nil {
			return candidate, nil
		}
	}

	return "", fmt.Errorf("pdf: no se encontró Chrome/Chromium para renderizar la factura. Configure CHROME_BIN o instale Chromium en el servidor")
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
