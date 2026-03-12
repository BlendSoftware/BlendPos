package infra

// factura_html.go — Renders a self-contained HTML page for each fiscal invoice.
//
// The HTML is served directly by the backend (GET /v1/facturacion/html/:id).
// It includes all assets inline (logo, barcode as base64 data URLs) so the
// browser can open it in a new tab and print/save as PDF without any extra
// dependencies.
//
// Template layout follows the AFIP Factura C standard:
//   - 3-column header  (emisor | letra gigante | datos comprobante)
//   - Receptor data
//   - CONDICIÓN Y FORMA DE PAGO row
//   - Items table  (dark header, striped body)
//   - Son pesos · Importe total
//   - Comprobante autorizado · CAE · barcode
//   - Legal footer

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"html/template"
	"image/png"
	"os"
	"strings"

	"blendpos/internal/model"

	"github.com/boombuler/barcode"
	"github.com/boombuler/barcode/code128"
)

// ─── Data model ──────────────────────────────────────────────────────────────

type facturaHTMLItem struct {
	Cantidad       int
	Nombre         string
	PrecioUnitario string
	PrecioTotal    string
}

type facturaHTMLData struct {
	// Left header
	LogoDataURL    template.URL // "data:image/...;base64,..." or ""
	RazonSocial    string
	Domicilio      string
	CondicionFiscal string

	// Center header
	TipoLetra  string
	TipoNombre string
	TipoCodigo string // e.g. "11"

	// Right header
	NumeroFormateado string // "0001-00000016"
	FechaStr         string // "9/3/2026"
	CUIT             string
	IIBB             string
	FechaInicioActiv string

	// Receptor
	ReceptorNombre    string
	ReceptorDomicilio string
	ReceptorDocLabel  string // "CUIT" | "DNI" | "DOCUMENTO"
	ReceptorDocNumero string

	// Condición de pago
	CondicionPago string

	// Items
	Items     []facturaHTMLItem
	EmptyRows []struct{}

	// Totals
	TotalEnLetras   string
	TotalFormateado string // "2.000,00"

	// CAE
	CAE            string
	CAEVencimiento string
	BarcodeDataURL template.URL // "data:image/png;base64,..." or ""
	BarcodeText    string

	// AutoPrint: si es true, incluye un script para abrir el diálogo de impresión automáticamente
	AutoPrint      bool
}

// ─── Template (raw string) ────────────────────────────────────────────────────

const facturaHTMLTmpl = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>{{.TipoNombre}} {{.TipoLetra}} {{.NumeroFormateado}}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #000; background: #ddd; }
    @page { size: A4 portrait; margin: 8mm; }
    @media print {
      body { background: #fff; }
      .no-print { display: none !important; }
      .invoice-wrap { box-shadow: none !important; margin: 0 !important; }
    }
    /* Print bar */
    .no-print {
      background: #1a3558; padding: 10px; text-align: center;
    }
    .btn-print {
      padding: 7px 22px; background: #2563eb; color: #fff; border: none;
      border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: bold;
    }
    /* Invoice wrapper */
    .invoice-wrap { max-width: 800px; margin: 14px auto; background: #fff; box-shadow: 0 2px 14px rgba(0,0,0,.25); }
    .invoice { border: 1px solid #000; }

    /* === HEADER === */
    .header { display: grid; grid-template-columns: 42% 16% 42%; border-bottom: 1px solid #000; min-height: 85px; }
    .hdr-left  { padding: 8px 10px; border-right: 1px solid #000; }
    .hdr-left-logo { max-height: 48px; max-width: 110px; object-fit: contain; display: block; margin-bottom: 5px; }
    .hdr-left-name { font-size: 14px; font-weight: bold; line-height: 1.2; }
    .hdr-left-addr { font-size: 8px; line-height: 1.5; margin-top: 2px; color: #222; }
    .hdr-left-cond { font-size: 8.5px; font-weight: bold; margin-top: 5px; }
    .hdr-center {
      border-right: 1px solid #000; display: flex; flex-direction: column;
      align-items: center; justify-content: center; padding: 6px; text-align: center;
    }
    .hdr-center-label { font-size: 8px; letter-spacing: 0.5px; }
    .hdr-center-letra { font-size: 60px; font-weight: bold; line-height: 1; }
    .hdr-center-cod   { font-size: 8px; margin-top: 2px; }
    .hdr-right { padding: 8px 10px; }
    .hdr-r-row1 { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 1px; }
    .hdr-r-tipo { font-size: 10px; }
    .hdr-r-num  { font-size: 12px; font-weight: bold; }
    .hdr-r-row2 { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px; }
    .hdr-r-orig { font-size: 10px; font-weight: bold; }
    .hdr-r-data { font-size: 8.5px; }
    .dtbl { width: 100%; border-collapse: collapse; }
    .dtbl td { padding: 1px 0; vertical-align: top; }
    .dtbl .lbl { white-space: nowrap; padding-right: 4px; min-width: 82px; }

    /* === RECEPTOR === */
    .receptor { border-bottom: 1px solid #000; }
    .rec-row { display: grid; grid-template-columns: 50% 50%; border-bottom: 1px solid #000; }
    .rec-row:last-child { border-bottom: none; }
    .rec-cell { padding: 3px 8px; display: flex; align-items: baseline; gap: 6px; }
    .rec-cell:first-child { border-right: 1px solid #000; }
    .rec-lbl { font-weight: bold; font-size: 8.5px; white-space: nowrap; min-width: 65px; }
    .rec-val  { font-size: 9.5px; }

    /* === CONDICIÓN === */
    .condicion-row {
      padding: 3px 8px; display: flex; align-items: center; gap: 8px;
      border-bottom: 1px solid #000;
    }
    .condicion-lbl { font-weight: bold; font-size: 8.5px; white-space: nowrap; }
    .condicion-val { font-size: 8.5px; }

    /* === ITEMS TABLE === */
    .items-tbl { width: 100%; border-collapse: collapse; }
    .items-tbl thead tr { background: #3d3d3d; color: #fff; }
    .items-tbl th { padding: 4px 8px; font-size: 8.5px; font-weight: bold; border: 1px solid #000; }
    .items-tbl td { padding: 3px 8px; font-size: 9px; border-left: 1px solid #000; border-right: 1px solid #000; height: 18px; }
    .items-tbl tbody tr:last-child td { border-bottom: 1px solid #000; }
    .tr { text-align: right; }
    .tc { text-align: center; }

    /* === TOTALS === */
    .totals-row { display: flex; border-top: 1px solid #000; border-bottom: 1px solid #000; }
    .son-pesos {
      flex: 1; display: flex; align-items: center; gap: 6px;
      padding: 4px 8px; border-right: 1px solid #000; font-size: 8.5px;
    }
    .son-pesos-lbl { white-space: nowrap; }
    .son-pesos-val { font-style: italic; }
    .importe-total {
      min-width: 200px; display: flex; align-items: center; justify-content: space-between;
      padding: 4px 10px; background: #e5e5e5; gap: 10px;
    }
    .imp-lbl { font-weight: bold; font-size: 9.5px; white-space: nowrap; }
    .imp-val { font-weight: bold; font-size: 13px; }

    /* === CAE FOOTER === */
    .cae-footer { display: grid; grid-template-columns: 50% 50%; border-top: 1px solid #000; min-height: 52px; }
    .cae-left { padding: 6px 10px; border-right: 1px solid #000; }
    .cae-title { font-weight: bold; font-size: 9.5px; margin-bottom: 3px; }
    .cae-data  { font-size: 8.5px; margin-bottom: 2px; }
		.cae-right {
			padding: 6px 10px; display: flex; flex-direction: column;
			align-items: center; justify-content: center; gap: 3px;
		}
    .barcode-img { max-height: 48px; max-width: 100%; }
		.barcode-text { font-size: 8px; letter-spacing: 0.8px; line-height: 1; text-align: center; }

    /* === LEGAL === */
    .legal { padding: 4px 10px; border-top: 1px solid #000; font-size: 7px; font-style: italic; color: #444; line-height: 1.5; }
  </style>
  {{if .AutoPrint}}
  <script>
    window.addEventListener('load', function() {
      setTimeout(function() {
        window.print();
      }, 500);
    });
  </script>
  {{end}}
</head>
<body>
  <div class="no-print">
    <button class="btn-print" onclick="window.print()">Imprimir / Guardar como PDF</button>
  </div>

  <div class="invoice-wrap">
   <div class="invoice">

    <!-- ENCABEZADO -->
    <div class="header">
      <div class="hdr-left">
        {{if .LogoDataURL}}<img class="hdr-left-logo" src="{{.LogoDataURL}}" alt="Logo">{{end}}
        <div class="hdr-left-name">{{.RazonSocial}}</div>
        {{if .Domicilio}}<div class="hdr-left-addr">{{.Domicilio}}</div>{{end}}
        <div class="hdr-left-cond">{{.CondicionFiscal}}</div>
      </div>

      <div class="hdr-center">
        <div class="hdr-center-label">{{.TipoNombre}}</div>
        <div class="hdr-center-letra">{{.TipoLetra}}</div>
        <div class="hdr-center-cod">COD. {{.TipoCodigo}}</div>
      </div>

      <div class="hdr-right">
        <div class="hdr-r-row1">
          <span class="hdr-r-tipo">{{.TipoNombre}}</span>
          <span class="hdr-r-num">N&#176; {{.NumeroFormateado}}</span>
        </div>
        <div class="hdr-r-row2">
          <span>Fecha &nbsp;<strong>{{.FechaStr}}</strong></span>
          <span class="hdr-r-orig">ORIGINAL</span>
        </div>
        <div class="hdr-r-data">
          <table class="dtbl">
            <tr><td class="lbl">CUIT:</td><td>{{.CUIT}}</td></tr>
            {{if .IIBB}}<tr><td class="lbl">ING. BRUTOS:</td><td>{{.IIBB}}</td></tr>{{end}}
            {{if .FechaInicioActiv}}<tr><td class="lbl">INICIO ACT.:</td><td>{{.FechaInicioActiv}}</td></tr>{{end}}
          </table>
        </div>
      </div>
    </div>

    <!-- DATOS DEL RECEPTOR -->
    <div class="receptor">
      <div class="rec-row">
        <div class="rec-cell">
          <span class="rec-lbl">NOMBRE:</span>
          <span class="rec-val">{{.ReceptorNombre}}</span>
        </div>
        <div class="rec-cell">
          {{if .ReceptorDocLabel}}
          <span class="rec-lbl">{{.ReceptorDocLabel}}:</span>
          <span class="rec-val">{{.ReceptorDocNumero}}</span>
          {{end}}
        </div>
      </div>
      <div class="rec-row">
        <div class="rec-cell">
          <span class="rec-lbl">DOMICILIO:</span>
          <span class="rec-val">{{.ReceptorDomicilio}}</span>
        </div>
        <div class="rec-cell"></div>
      </div>
    </div>

    <!-- CONDICIÓN Y FORMA DE PAGO -->
    <div class="condicion-row">
      <span class="condicion-lbl">CONDICI&#211;N Y FORMA DE PAGO:</span>
      <span class="condicion-val">{{.CondicionPago}}</span>
    </div>

    <!-- TABLA DE ÍTEMS -->
    <table class="items-tbl">
      <thead>
        <tr>
          <th class="tc" style="width:56px;">Cantidad</th>
          <th style="text-align:left;">Detalle</th>
          <th class="tr" style="width:118px;">Precio Unitario</th>
          <th class="tr" style="width:118px;">Precio total</th>
        </tr>
      </thead>
      <tbody>
        {{range .Items}}
        <tr>
          <td class="tc">{{.Cantidad}}</td>
          <td>{{.Nombre}}</td>
          <td class="tr">{{.PrecioUnitario}}</td>
          <td class="tr">{{.PrecioTotal}}</td>
        </tr>
        {{end}}
        {{range .EmptyRows}}
        <tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>
        {{end}}
      </tbody>
    </table>

    <!-- SON PESOS + IMPORTE TOTAL -->
    <div class="totals-row">
      <div class="son-pesos">
        <span class="son-pesos-lbl">Son pesos:</span>
        <span class="son-pesos-val">{{.TotalEnLetras}}</span>
      </div>
      <div class="importe-total">
        <span class="imp-lbl">Importe total</span>
        <span class="imp-val">{{.TotalFormateado}}</span>
      </div>
    </div>

    <!-- COMPROBANTE AUTORIZADO (CAE) -->
    <div class="cae-footer">
      <div class="cae-left">
        <div class="cae-title">Comprobante autorizado</div>
        {{if .CAE}}
        <div class="cae-data">CAE N&#176;: &nbsp;<strong>{{.CAE}}</strong></div>
        {{if .CAEVencimiento}}<div class="cae-data">Vencimiento: &nbsp;<strong>{{.CAEVencimiento}}</strong></div>{{end}}
        {{else}}
        <div class="cae-data" style="color:#c00;">Pendiente de autorizaci&#243;n AFIP</div>
        {{end}}
      </div>
      <div class="cae-right">
        {{if .BarcodeDataURL}}<img class="barcode-img" src="{{.BarcodeDataURL}}" alt="C&#243;digo de barras CAE">{{end}}
				{{if .BarcodeText}}<div class="barcode-text">{{.BarcodeText}}</div>{{end}}
      </div>
    </div>

    <!-- PIE LEGAL -->
    <div class="legal">
      Esta Administraci&#243;n Federal no se responsabiliza por los datos ingresados en el detalle de la operaci&#243;n.<br>
      Comprobante autorizado seg&#250;n Resoluci&#243;n General AFIP. &nbsp; Para verificar: www.afip.gob.ar/genericos/consultaCAE
    </div>

   </div><!-- /invoice -->
  </div><!-- /invoice-wrap -->
</body>
</html>`

// ─── Generator function ───────────────────────────────────────────────────────

// GenerateFacturaHTML renders a complete self-contained HTML invoice page.
// The returned string can be served with Content-Type: text/html; charset=utf-8.
// All assets (logo, barcode) are embedded as base64 data URLs.
// If autoPrint is true, the HTML will automatically trigger the print dialog on load.
func GenerateFacturaHTML(venta *model.Venta, comp *model.Comprobante, config *model.ConfiguracionFiscal, autoPrint bool) (string, error) {
	tmpl, err := template.New("factura").Parse(facturaHTMLTmpl)
	if err != nil {
		return "", fmt.Errorf("factura_html: parse template: %w", err)
	}

	// ── Tipo comprobante ──────────────────────────────────────────────────
	tipoLetra := "X"
	tipoNombre := "FACTURA"
	tipoCodigo := 0
	switch comp.Tipo {
	case "factura_a":
		tipoLetra, tipoCodigo = "A", 1
	case "factura_b":
		tipoLetra, tipoCodigo = "B", 6
	case "factura_c":
		tipoLetra, tipoCodigo = "C", 11
	}

	var numero int64
	if comp.Numero != nil {
		numero = *comp.Numero
	}
	pvDisplay := comp.PuntoDeVenta
	if pvDisplay == 0 {
		pvDisplay = config.PuntoDeVenta
	}

	// ── Domicilio del emisor ──────────────────────────────────────────────
	var domParts []string
	if config.DomicilioComercial != nil && *config.DomicilioComercial != "" {
		domParts = append(domParts, *config.DomicilioComercial)
	}
	localidad := ""
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
		domParts = append(domParts, localidad)
	}
	domicilio := strings.Join(domParts, " · ")

	// ── Logo inline base64 ────────────────────────────────────────────────
	// Usar logo_path de la config, o caer al logo por defecto en /app/static/logo.png
	logoDataURL := template.URL("")
	logoFile := "/app/static/logo.png"
	if config.LogoPath != nil && *config.LogoPath != "" {
		logoFile = *config.LogoPath
	}
	if imgBytes, readErr := os.ReadFile(logoFile); readErr == nil {
		mime := "image/png"
		ext := strings.ToLower(logoFile)
		if strings.HasSuffix(ext, ".jpg") || strings.HasSuffix(ext, ".jpeg") {
			mime = "image/jpeg"
		} else if strings.HasSuffix(ext, ".svg") {
			mime = "image/svg+xml"
		}
		encoded := base64.StdEncoding.EncodeToString(imgBytes)
		logoDataURL = template.URL("data:" + mime + ";base64," + encoded)
	}


	// ── IIBB & fecha inicio ───────────────────────────────────────────────
	iibb := ""
	if config.IIBB != nil {
		iibb = *config.IIBB
	}
	fechaInicioActiv := ""
	if config.FechaInicioActividades != nil {
		fechaInicioActiv = config.FechaInicioActividades.Format("02/01/06")
	}

	// ── Receptor ─────────────────────────────────────────────────────────
	receptorNombre := "CONSUMIDOR FINAL"
	if comp.ReceptorNombre != nil && *comp.ReceptorNombre != "" {
		receptorNombre = strings.ToUpper(*comp.ReceptorNombre)
	}
	receptorDomicilio := ""
	if comp.ReceptorDomicilio != nil {
		receptorDomicilio = *comp.ReceptorDomicilio
	}
	receptorDocLabel, receptorDocNumero := "", ""
	if comp.ReceptorCUIT != nil && *comp.ReceptorCUIT != "" && *comp.ReceptorCUIT != "0" {
		switch {
		case comp.ReceptorTipoDocumento != nil && *comp.ReceptorTipoDocumento == 80:
			receptorDocLabel = "CUIT"
		case comp.ReceptorTipoDocumento != nil && *comp.ReceptorTipoDocumento == 96:
			receptorDocLabel = "DNI"
		default:
			receptorDocLabel = "DOCUMENTO"
		}
		receptorDocNumero = *comp.ReceptorCUIT
	}

	// ── Condición de pago ─────────────────────────────────────────────────
	condPago := "Contado"
	if len(venta.Pagos) > 0 {
		switch venta.Pagos[0].Metodo {
		case "efectivo":
			condPago = "Contado - Efectivo"
		case "debito":
			condPago = "Contado - Tarjeta de Débito"
		case "credito":
			condPago = "Contado - Tarjeta de Crédito"
		case "transferencia":
			condPago = "Contado - Transferencia Bancaria"
		case "qr":
			condPago = "Contado - QR / Billetera Virtual"
		default:
			condPago = "Contado - " + venta.Pagos[0].Metodo
		}
	}

	// ── Items ─────────────────────────────────────────────────────────────
	htmlItems := make([]facturaHTMLItem, 0, len(venta.Items))
	for _, item := range venta.Items {
		nombre := "Producto"
		if item.Producto != nil {
			nombre = item.Producto.Nombre
		}
		htmlItems = append(htmlItems, facturaHTMLItem{
			Cantidad:       item.Cantidad,
			Nombre:         nombre,
			PrecioUnitario: formatMoneyAFIP(item.PrecioUnitario),
			PrecioTotal:    formatMoneyAFIP(item.Subtotal),
		})
	}
	emptyCount := 10 - len(htmlItems)
	if emptyCount < 0 {
		emptyCount = 0
	}

	// ── CAE ───────────────────────────────────────────────────────────────
	cae := ""
	if comp.CAE != nil {
		cae = *comp.CAE
	}
	caeVencimiento := ""
	if comp.CAEVencimiento != nil {
		caeVencimiento = comp.CAEVencimiento.Format("02/01/2006")
	}

	// ── Barcode inline base64 ─────────────────────────────────────────────
	barcodeDataURL := template.URL("")
	barcodeText := ""
	if cae != "" {
		cuitClean := strings.ReplaceAll(config.CUITEmsior, "-", "")
		if len(cuitClean) == 11 {
			barcodeStr := fmt.Sprintf("%s%02d%04d%s", cuitClean, tipoCodigo, pvDisplay, cae)
			barcodeText = barcodeStr
			if barcodeImg, bcErr := code128.Encode(barcodeStr); bcErr == nil {
				if scaled, scErr := barcode.Scale(barcodeImg, 600, 60); scErr == nil {
					var buf bytes.Buffer
					if pngErr := png.Encode(&buf, scaled); pngErr == nil {
						encoded := base64.StdEncoding.EncodeToString(buf.Bytes())
						barcodeDataURL = template.URL("data:image/png;base64," + encoded)
					}
				}
			}
		}
	}

	data := facturaHTMLData{
		LogoDataURL:      logoDataURL,
		RazonSocial:      config.RazonSocial,
		Domicilio:        domicilio,
		CondicionFiscal:  config.CondicionFiscal,
		TipoLetra:        tipoLetra,
		TipoNombre:       tipoNombre,
		TipoCodigo:       fmt.Sprintf("%02d", tipoCodigo),
		NumeroFormateado: fmt.Sprintf("%04d-%08d", pvDisplay, numero),
		FechaStr:         venta.CreatedAt.Format("2/1/2006"),
		CUIT:             config.CUITEmsior,
		IIBB:             iibb,
		FechaInicioActiv: fechaInicioActiv,
		ReceptorNombre:    receptorNombre,
		ReceptorDomicilio: receptorDomicilio,
		ReceptorDocLabel:  receptorDocLabel,
		ReceptorDocNumero: receptorDocNumero,
		CondicionPago:     condPago,
		Items:             htmlItems,
		EmptyRows:         make([]struct{}, emptyCount),
		TotalEnLetras:     amountToWords(venta.Total) + " con 00/100",
		TotalFormateado:   formatMoneyAFIP(venta.Total),
		CAE:               cae,
		CAEVencimiento:    caeVencimiento,
		BarcodeDataURL:    barcodeDataURL,
		BarcodeText:       barcodeText,
		AutoPrint:         autoPrint,
	}

	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, data); err != nil {
		return "", fmt.Errorf("factura_html: execute template: %w", err)
	}
	return buf.String(), nil
}
