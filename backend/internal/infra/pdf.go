package infra

// pdf.go — Internal PDF ticket generation using go-pdf/fpdf (AC-06.3).
// Generates A7-size thermal receipt-style tickets with:
//   - Business name header
//   - Ticket number and timestamp
//   - Item table (product name, quantity, subtotal)
//   - Discount line (if applicable)
//   - Bold total
//   - Payment method breakdown
//
// The output file is saved to storagePath/ticket_{numero}.pdf.

import (
	"fmt"
	"os"
	"path/filepath"

	"blendpos/internal/model"

	"github.com/go-pdf/fpdf"
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
