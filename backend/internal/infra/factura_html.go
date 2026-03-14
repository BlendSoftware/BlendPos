package infra

// factura_html.go — Renders a self-contained HTML page for each fiscal invoice.
//
// The HTML is served directly by the backend (GET /v1/facturacion/html/:id).
// It includes all assets inline (logo, barcode as base64 data URLs) so the
// browser can open it in a new tab and print/save as PDF without any extra
// dependencies.
//
// Template layout follows the AFIP/ARCA Factura A/B/C standard:
//   - 3-column header  (emisor | letra gigante | datos comprobante)
//   - Receptor data (nombre, domicilio, doc, condición IVA)
//   - CONDICIÓN Y FORMA DE PAGO row
//   - Items table with bonificaciones column
//   - Descuentos globales row (if applicable)
//   - Son pesos · Importe total
//   - Comprobante autorizado · CAE · barcode
//   - Legal footer
//
// Supports ORIGINAL and DUPLICADO copies via esCopia parameter.

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"html/template"
	"image/png"
	"os"
	"path/filepath"
	"strings"

	"blendpos/internal/model"

	"github.com/boombuler/barcode"
	"github.com/boombuler/barcode/code128"
	"github.com/shopspring/decimal"
)

// ─── Data model ──────────────────────────────────────────────────────────────

type facturaHTMLItem struct {
	Codigo         string
	Nombre         string
	Cantidad       string
	UnidadMedida   string
	PrecioUnitario string
	BonifPct       string
	BonifImporte   string
	PrecioTotal    string
}

type facturaHTMLData struct {
	// Left header
	LogoDataURL     template.URL // "data:image/...;base64,..." or ""
	RazonSocial     string
	Domicilio       string
	CondicionFiscal string

	// Center header
	TipoLetra  string
	TipoNombre string
	TipoCodigo string // e.g. "11"

	// Right header
	CopiaLabel       string // "ORIGINAL" or "DUPLICADO"
	NumeroFormateado string // "0001-00000016"
	PuntoDeVenta     string // "0001"
	FechaStr         string // "9/3/2026"
	CUIT             string
	IIBB             string
	FechaInicioActiv string

	// Receptor
	ReceptorNombre       string
	ReceptorDomicilio    string
	ReceptorDocLabel     string // "CUIT" | "DNI" | "DOCUMENTO"
	ReceptorDocNumero    string
	ReceptorCondicionIVA string // "CONSUMIDOR FINAL", "RESPONSABLE INSCRIPTO", etc.

	// Condición de pago
	CondicionPago string

	// Items
	Items []facturaHTMLItem

	// Totales
	SubtotalBrutoFormateado     string
	BonificacionTotalFormateado string

	TotalEnLetras   string
	TotalFormateado string // "2.000,00"

	// CAE
	CAE            string
	CAEVencimiento string
	BarcodeDataURL template.URL // "data:image/png;base64,..." or ""
	BarcodeText    string

	// AutoPrint: si es true, incluye un script para abrir el diálogo de impresión automáticamente
	AutoPrint bool
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
    html, body { height: 100%; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #111; background: #e0e4ea; }
    @page { size: A4 portrait; margin: 6mm; }
    @media print {
      body { background: #fff; }
      .no-print { display: none !important; }
      .invoice-wrap { box-shadow: none !important; margin: 0 !important; padding: 0 !important; max-width: 100% !important; width: 100% !important; }
      .invoice { min-height: 0 !important; }
      .items-filler { display: none !important; }
    }
    /* ── Print bar ── */
    .no-print {
      background: #1e3a5f; padding: 10px 20px; display: flex; gap: 10px; justify-content: center; align-items: center;
    }
    .btn-print {
      padding: 7px 24px; background: #2563eb; color: #fff; border: none;
      border-radius: 5px; cursor: pointer; font-size: 13px; font-weight: 600; letter-spacing: 0.2px;
    }
    .btn-print:hover { background: #1d4ed8; }
    /* ── Invoice wrapper ── */
    .invoice-wrap { max-width: 794px; margin: 16px auto; background: #fff; box-shadow: 0 3px 18px rgba(0,0,0,.16); }
    .invoice { border: 1px solid #888; display: flex; flex-direction: column; min-height: 281mm; }

    /* ── HEADER ── */
    .header { display: grid; grid-template-columns: 42% 16% 42%; border-bottom: 1px solid #bbb; min-height: 92px; }
    .hdr-left  { padding: 10px 12px; border-right: 1px solid #bbb; }
    .hdr-left-logo { max-height: 52px; max-width: 120px; object-fit: contain; display: block; margin-bottom: 6px; }
    .hdr-left-name { font-size: 13px; font-weight: 700; line-height: 1.3; color: #111; }
    .hdr-left-addr { font-size: 8.5px; line-height: 1.6; margin-top: 3px; color: #555; }
    .hdr-left-cond { font-size: 8.5px; font-weight: 700; margin-top: 5px; color: #222; }
    .hdr-center {
      border-right: 1px solid #bbb; display: flex; flex-direction: column;
      align-items: center; justify-content: center; padding: 6px; text-align: center;
    }
    .hdr-center-label { font-size: 7.5px; letter-spacing: 0.5px; text-transform: uppercase; color: #666; }
    .hdr-center-letra { font-size: 64px; font-weight: 900; line-height: 1; color: #111; }
    .hdr-center-cod   { font-size: 7.5px; margin-top: 2px; color: #666; }
    .hdr-right { padding: 10px 12px; }
    .hdr-r-row1 { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 2px; }
    .hdr-r-tipo { font-size: 10px; color: #555; }
    .hdr-r-num  { font-size: 12px; font-weight: 700; color: #111; }
    .hdr-r-row2 { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; }
    .hdr-r-fecha { font-size: 9px; color: #444; }
    .hdr-r-copia { font-size: 10px; font-weight: 700; letter-spacing: 0.8px; color: #222; }
    .dtbl { width: 100%; border-collapse: collapse; }
    .dtbl td { padding: 1.5px 0; vertical-align: top; font-size: 8.5px; }
    .dtbl .lbl { white-space: nowrap; padding-right: 6px; min-width: 90px; color: #666; }

    /* ── RECEPTOR ── */
    .receptor { border-bottom: 1px solid #bbb; }
    .rec-row { display: grid; grid-template-columns: 1fr 1fr; border-bottom: 1px solid #e0e0e0; }
    .rec-row:last-child { border-bottom: none; }
    .rec-cell { padding: 4px 10px; display: flex; align-items: baseline; gap: 6px; }
    .rec-cell:first-child { border-right: 1px solid #e0e0e0; }
    .rec-lbl { font-weight: 700; font-size: 7.5px; white-space: nowrap; min-width: 72px; text-transform: uppercase; color: #666; }
    .rec-val  { font-size: 9.5px; color: #111; }

    /* ── CONDICIÓN DE PAGO ── */
    .condicion-row {
      padding: 4px 10px; display: flex; align-items: center; gap: 8px;
      border-bottom: 1px solid #bbb; background: #fafafa;
    }
    .condicion-lbl { font-weight: 700; font-size: 7.5px; white-space: nowrap; text-transform: uppercase; color: #666; }
    .condicion-val { font-size: 9px; color: #111; }

    /* ── ITEMS TABLE ── */
    .items-section { flex: 1; display: flex; flex-direction: column; }
    .items-tbl { width: 100%; border-collapse: collapse; }
    .items-tbl thead tr { background: #f2f4f7; }
    .items-tbl th {
      padding: 5px 8px; font-size: 7.5px; font-weight: 700; text-transform: uppercase;
      border-top: 1px solid #bbb; border-bottom: 1px solid #bbb; letter-spacing: 0.3px; color: #444;
    }
    .items-tbl th + th { border-left: 1px solid #ddd; }
    .items-tbl td { padding: 4px 8px; font-size: 9px; height: 20px; border-bottom: 1px solid #eee; color: #111; }
    .items-tbl td + td { border-left: 1px solid #eee; }
    .items-tbl tbody tr:last-child td { border-bottom: none; }
    .items-filler { flex: 1; min-height: 8px; }
    .tr { text-align: right; }
    .tc { text-align: center; }

    /* ── DESCUENTOS GLOBALES ── */
    .descuento-row {
      display: flex; border-top: 1px solid #e0e0e0; border-bottom: 1px solid #bbb;
      padding: 4px 10px; gap: 24px; align-items: center; background: #fffbf0;
    }
    .desc-cell { display: flex; align-items: baseline; gap: 6px; font-size: 9px; }
    .desc-lbl { font-weight: 700; color: #666; font-size: 7.5px; text-transform: uppercase; }
    .desc-val-red { color: #b00000; font-weight: 600; }

    /* ── TOTALS ── */
    .totals-row { display: flex; border-top: 1px solid #bbb; border-bottom: 1px solid #bbb; }
    .son-pesos {
      flex: 1; display: flex; align-items: center; gap: 6px;
      padding: 5px 10px; border-right: 1px solid #bbb; font-size: 8.5px;
    }
    .son-pesos-lbl { white-space: nowrap; font-weight: 700; color: #666; font-size: 7.5px; text-transform: uppercase; }
    .son-pesos-val { font-style: italic; color: #333; }
    .importe-total {
      min-width: 210px; display: flex; align-items: center; justify-content: space-between;
      padding: 5px 14px; background: #f0f3f8; gap: 12px;
    }
    .imp-lbl { font-weight: 700; font-size: 8.5px; white-space: nowrap; text-transform: uppercase; color: #444; }
    .imp-val { font-weight: 900; font-size: 15px; color: #111; }

    /* ── CAE FOOTER ── */
    .cae-footer { display: grid; grid-template-columns: 50% 50%; border-top: 1px solid #bbb; min-height: 58px; }
    .cae-left { padding: 8px 12px; border-right: 1px solid #bbb; }
    .cae-title { font-weight: 700; font-size: 9.5px; margin-bottom: 4px; color: #222; }
    .cae-data  { font-size: 8.5px; margin-bottom: 2px; color: #333; }
    .cae-right {
      padding: 8px 12px; display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: 4px;
    }
    .barcode-img { max-height: 48px; max-width: 100%; }
    .barcode-text { font-size: 8px; letter-spacing: 0.8px; line-height: 1; text-align: center; color: #444; font-family: 'Courier New', monospace; }

    /* ── LEGAL ── */
    .legal { padding: 5px 12px; border-top: 1px solid #ddd; font-size: 7px; font-style: italic; color: #777; line-height: 1.7; }
  </style>
  {{if .AutoPrint}}
  <script>
    window.addEventListener('load', function() {
      setTimeout(function() { window.print(); }, 500);
    });
  </script>
  {{end}}
</head>
<body>
  <div class="no-print">
    <button class="btn-print" onclick="window.print()">&#128438; Imprimir / Guardar como PDF</button>
  </div>

  <div class="invoice-wrap">
   <div class="invoice">

    <!-- ENCABEZADO -->
    <div class="header">
      <div class="hdr-left">
        {{if .LogoDataURL}}<img class="hdr-left-logo" src="{{.LogoDataURL}}" alt="Logo">{{end}}
        <div class="hdr-left-name">{{.RazonSocial}}</div>
        {{if .Domicilio}}<div class="hdr-left-addr">{{.Domicilio}}</div>{{end}}
        <div class="hdr-left-cond">Condici&#243;n frente al IVA: {{.CondicionFiscal}}</div>
      </div>

      <div class="hdr-center">
        <div class="hdr-center-label">{{.TipoNombre}}</div>
        <div class="hdr-center-letra">{{.TipoLetra}}</div>
        <div class="hdr-center-cod">COD. {{.TipoCodigo}}</div>
      </div>

      <div class="hdr-right">
        <div class="hdr-r-row1">
          <span class="hdr-r-tipo">{{.TipoNombre}}</span>
          <span class="hdr-r-num">N&#186; {{.NumeroFormateado}}</span>
        </div>
        <div class="hdr-r-row2">
          <span class="hdr-r-fecha">Fecha &nbsp;<strong>{{.FechaStr}}</strong></span>
          <span class="hdr-r-copia">{{.CopiaLabel}}</span>
        </div>
        <div class="hdr-r-data">
          <table class="dtbl">
            <tr><td class="lbl">CUIT:</td><td>{{.CUIT}}</td></tr>
            <tr><td class="lbl">Punto de venta:</td><td>{{.PuntoDeVenta}}</td></tr>
            {{if .IIBB}}<tr><td class="lbl">Ing. Brutos:</td><td>{{.IIBB}}</td></tr>{{end}}
            {{if .FechaInicioActiv}}<tr><td class="lbl">Inicio de act.:</td><td>{{.FechaInicioActiv}}</td></tr>{{end}}
          </table>
        </div>
      </div>
    </div>

    <!-- DATOS DEL RECEPTOR -->
    <div class="receptor">
      <div class="rec-row">
        <div class="rec-cell">
          <span class="rec-lbl">Nombre:</span>
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
          <span class="rec-lbl">Domicilio:</span>
          <span class="rec-val">{{if .ReceptorDomicilio}}{{.ReceptorDomicilio}}{{else}}-{{end}}</span>
        </div>
        <div class="rec-cell">
          <span class="rec-lbl">Cond. frente al IVA:</span>
          <span class="rec-val">{{.ReceptorCondicionIVA}}</span>
        </div>
      </div>
    </div>

    <!-- CONDICIÓN Y FORMA DE PAGO -->
    <div class="condicion-row">
      <span class="condicion-lbl">Condici&#243;n y forma de pago:</span>
      <span class="condicion-val">{{.CondicionPago}}</span>
    </div>

    <!-- TABLA DE ÍTEMS -->
    <div class="items-section">
      <table class="items-tbl">
        <thead>
          <tr>
            <th style="text-align:left;width:88px;">C&#243;digo</th>
            <th style="text-align:left;">Producto / Servicio</th>
            <th class="tr" style="width:72px;">Cantidad</th>
            <th class="tc" style="width:62px;">U. Medida</th>
            <th class="tr" style="width:92px;">Precio Unit.</th>
            <th class="tr" style="width:72px;">% Bonif.</th>
            <th class="tr" style="width:88px;">Imp. Bonif.</th>
            <th class="tr" style="width:108px;">Importe</th>
          </tr>
        </thead>
        <tbody>
          {{range .Items}}
          <tr>
            <td>{{.Codigo}}</td>
            <td>{{.Nombre}}</td>
            <td class="tr">{{.Cantidad}}</td>
            <td class="tc">{{.UnidadMedida}}</td>
            <td class="tr">{{.PrecioUnitario}}</td>
            <td class="tr" style="color:{{if ne .BonifPct "-"}}#a00{{else}}#bbb{{end}}">{{.BonifPct}}</td>
            <td class="tr" style="color:{{if ne .BonifImporte "-"}}#a00{{else}}#bbb{{end}}">{{.BonifImporte}}</td>
            <td class="tr">{{.PrecioTotal}}</td>
          </tr>
          {{end}}
        </tbody>
      </table>
      <div class="items-filler"></div>
    </div>

    <!-- SUBTOTAL / BONIFICACION / TOTAL -->
    <div class="descuento-row">
      <div class="desc-cell">
        <span class="desc-lbl">Subtotal:</span>
        <span>{{.SubtotalBrutoFormateado}}</span>
      </div>
      <div class="desc-cell">
        <span class="desc-lbl">Bonificaci&#243;n:</span>
        <span class="desc-val-red">&#8722; {{.BonificacionTotalFormateado}}</span>
      </div>
      <div class="desc-cell">
        <span class="desc-lbl">Total:</span>
        <span>{{.TotalFormateado}}</span>
      </div>
    </div>

    <!-- SON PESOS + IMPORTE TOTAL -->
    <div class="totals-row">
      <div class="son-pesos">
        <span class="son-pesos-lbl">Son pesos:</span>
        <span class="son-pesos-val">{{.TotalEnLetras}}</span>
      </div>
      <div class="importe-total">
        <span class="imp-lbl">Importe total</span>
        <span class="imp-val">$ {{.TotalFormateado}}</span>
      </div>
    </div>

    <!-- COMPROBANTE AUTORIZADO (CAE) -->
    <div class="cae-footer">
      <div class="cae-left">
        <div class="cae-title">Comprobante autorizado</div>
        {{if .CAE}}
        <div class="cae-data">CAE N&#186;: &nbsp;<strong>{{.CAE}}</strong></div>
        {{if .CAEVencimiento}}<div class="cae-data">Fecha de vencimiento del CAE: &nbsp;<strong>{{.CAEVencimiento}}</strong></div>{{end}}
        {{else}}
        <div class="cae-data" style="color:#c00;">Pendiente de autorizaci&#243;n ARCA / AFIP</div>
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
      Comprobante autorizado seg&#250;n Resoluci&#243;n General ARCA (ex AFIP). &nbsp; Verificaci&#243;n: www.afip.gob.ar/genericos/consultaCAE
    </div>

   </div><!-- /invoice -->
  </div><!-- /invoice-wrap -->
</body>
</html>`

// ─── Email-safe template (table layout, inline styles) ───────────────────────
// Gmail and Outlook strip CSS Grid / Flexbox from email bodies.
// This template uses only <table> for layout and inline styles so it renders
// correctly in all major email clients.

const facturaEmailHTMLTmpl = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>{{.TipoNombre}} {{.TipoLetra}} &#8212; {{.NumeroFormateado}}</title>
</head>
<body style="margin:0;padding:16px;background:#e0e4ea;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#111;">

<table width="620" cellpadding="0" cellspacing="0" border="0" align="center" style="background:#ffffff;border:1px solid #888888;border-collapse:collapse;">

  <!-- ═══ ENCABEZADO ═══ -->
  <tr>
    <!-- Columna izquierda: emisor -->
    <td width="261" valign="top" style="padding:10px 12px;border-right:1px solid #bbbbbb;border-bottom:1px solid #bbbbbb;">
      {{if .LogoDataURL}}<img src="{{.LogoDataURL}}" alt="Logo" style="max-height:48px;max-width:110px;display:block;margin-bottom:5px;" width="110">{{end}}
      <div style="font-size:13px;font-weight:700;line-height:1.3;color:#111111;">{{.RazonSocial}}</div>
      {{if .Domicilio}}<div style="font-size:8.5px;color:#555555;margin-top:3px;line-height:1.5;">{{.Domicilio}}</div>{{end}}
      <div style="font-size:8.5px;font-weight:700;margin-top:4px;color:#222222;">Condici&#243;n frente al IVA: {{.CondicionFiscal}}</div>
    </td>
    <!-- Columna central: letra grande -->
    <td width="98" align="center" valign="middle" style="border-right:1px solid #bbbbbb;border-bottom:1px solid #bbbbbb;padding:8px 4px;text-align:center;">
      <div style="font-size:7.5px;color:#666666;text-transform:uppercase;letter-spacing:0.5px;">{{.TipoNombre}}</div>
      <div style="font-size:56px;font-weight:900;line-height:1;color:#111111;">{{.TipoLetra}}</div>
      <div style="font-size:7.5px;color:#666666;margin-top:2px;">COD. {{.TipoCodigo}}</div>
    </td>
    <!-- Columna derecha: datos del comprobante -->
    <td width="261" valign="top" style="padding:10px 12px;border-bottom:1px solid #bbbbbb;">
      <table width="100%" cellpadding="1" cellspacing="0" border="0">
        <tr>
          <td style="font-size:9px;color:#555555;">{{.TipoNombre}}</td>
          <td align="right" style="font-size:12px;font-weight:700;color:#111111;">N&#186; {{.NumeroFormateado}}</td>
        </tr>
        <tr>
          <td style="font-size:9px;color:#444444;">Fecha &nbsp;<strong>{{.FechaStr}}</strong></td>
          <td align="right" style="font-size:10px;font-weight:700;letter-spacing:0.8px;color:#222222;">{{.CopiaLabel}}</td>
        </tr>
        <tr>
          <td colspan="2" style="padding-top:5px;">
            <table cellpadding="1" cellspacing="0" border="0" width="100%">
              <tr>
                <td style="font-size:8px;color:#666666;white-space:nowrap;padding-right:4px;">CUIT:</td>
                <td style="font-size:8px;color:#111111;">{{.CUIT}}</td>
              </tr>
              <tr>
                <td style="font-size:8px;color:#666666;white-space:nowrap;padding-right:4px;">Punto de venta:</td>
                <td style="font-size:8px;color:#111111;">{{.PuntoDeVenta}}</td>
              </tr>
              {{if .IIBB}}<tr>
                <td style="font-size:8px;color:#666666;white-space:nowrap;padding-right:4px;">Ing. Brutos:</td>
                <td style="font-size:8px;color:#111111;">{{.IIBB}}</td>
              </tr>{{end}}
              {{if .FechaInicioActiv}}<tr>
                <td style="font-size:8px;color:#666666;white-space:nowrap;padding-right:4px;">Inicio de act.:</td>
                <td style="font-size:8px;color:#111111;">{{.FechaInicioActiv}}</td>
              </tr>{{end}}
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- ═══ DATOS DEL RECEPTOR ═══ -->
  <tr>
    <td valign="top" style="padding:4px 10px;border-right:1px solid #e0e0e0;border-bottom:1px solid #e0e0e0;">
      <span style="font-weight:700;font-size:7.5px;text-transform:uppercase;color:#666666;margin-right:6px;">Nombre:</span>
      <span style="font-size:9.5px;color:#111111;">{{.ReceptorNombre}}</span>
    </td>
    <td colspan="2" valign="top" style="padding:4px 10px;border-bottom:1px solid #e0e0e0;">
      {{if .ReceptorDocLabel}}
      <span style="font-weight:700;font-size:7.5px;text-transform:uppercase;color:#666666;margin-right:6px;">{{.ReceptorDocLabel}}:</span>
      <span style="font-size:9.5px;color:#111111;">{{.ReceptorDocNumero}}</span>
      {{end}}
    </td>
  </tr>
  <tr>
    <td valign="top" style="padding:4px 10px;border-right:1px solid #e0e0e0;border-bottom:1px solid #bbbbbb;">
      <span style="font-weight:700;font-size:7.5px;text-transform:uppercase;color:#666666;margin-right:6px;">Domicilio:</span>
      <span style="font-size:9.5px;color:#111111;">{{if .ReceptorDomicilio}}{{.ReceptorDomicilio}}{{else}}-{{end}}</span>
    </td>
    <td colspan="2" valign="top" style="padding:4px 10px;border-bottom:1px solid #bbbbbb;">
      <span style="font-weight:700;font-size:7.5px;text-transform:uppercase;color:#666666;margin-right:6px;">Cond. frente al IVA:</span>
      <span style="font-size:9.5px;color:#111111;">{{.ReceptorCondicionIVA}}</span>
    </td>
  </tr>

  <!-- ═══ CONDICIÓN DE PAGO ═══ -->
  <tr style="background:#fafafa;">
    <td colspan="3" style="padding:4px 10px;border-bottom:1px solid #bbbbbb;">
      <span style="font-weight:700;font-size:7.5px;text-transform:uppercase;color:#666666;margin-right:8px;">Condici&#243;n y forma de pago:</span>
      <span style="font-size:9px;color:#111111;">{{.CondicionPago}}</span>
    </td>
  </tr>

  <!-- ═══ TABLA DE ÍTEMS ═══ -->
  <tr>
    <td colspan="3" style="padding:0;">
      <table width="100%" cellpadding="5" cellspacing="0" border="0" style="border-collapse:collapse;">
        <thead>
          <tr style="background:#f2f4f7;">
            <th width="74" align="left" style="font-size:7px;font-weight:700;text-transform:uppercase;color:#444444;border-top:1px solid #bbbbbb;border-bottom:1px solid #bbbbbb;border-right:1px solid #dddddd;padding:5px 6px;">C&#243;digo</th>
            <th align="left" style="font-size:7px;font-weight:700;text-transform:uppercase;color:#444444;border-top:1px solid #bbbbbb;border-bottom:1px solid #bbbbbb;border-right:1px solid #dddddd;padding:5px 6px;">Producto / Servicio</th>
            <th width="56" align="right" style="font-size:7px;font-weight:700;text-transform:uppercase;color:#444444;border-top:1px solid #bbbbbb;border-bottom:1px solid #bbbbbb;border-right:1px solid #dddddd;padding:5px 6px;">Cantidad</th>
            <th width="54" align="center" style="font-size:7px;font-weight:700;text-transform:uppercase;color:#444444;border-top:1px solid #bbbbbb;border-bottom:1px solid #bbbbbb;border-right:1px solid #dddddd;padding:5px 6px;">U. Medida</th>
            <th width="78" align="right" style="font-size:7px;font-weight:700;text-transform:uppercase;color:#444444;border-top:1px solid #bbbbbb;border-bottom:1px solid #bbbbbb;border-right:1px solid #dddddd;padding:5px 6px;">Precio Unit.</th>
            <th width="52" align="right" style="font-size:7px;font-weight:700;text-transform:uppercase;color:#444444;border-top:1px solid #bbbbbb;border-bottom:1px solid #bbbbbb;border-right:1px solid #dddddd;padding:5px 6px;">% Bonif.</th>
            <th width="74" align="right" style="font-size:7px;font-weight:700;text-transform:uppercase;color:#444444;border-top:1px solid #bbbbbb;border-bottom:1px solid #bbbbbb;border-right:1px solid #dddddd;padding:5px 6px;">Imp. Bonif.</th>
            <th width="82" align="right" style="font-size:7px;font-weight:700;text-transform:uppercase;color:#444444;border-top:1px solid #bbbbbb;border-bottom:1px solid #bbbbbb;padding:5px 6px;">Importe</th>
          </tr>
        </thead>
        <tbody>
          {{range .Items}}
          <tr>
            <td style="font-size:8.5px;color:#111111;padding:4px 6px;border-bottom:1px solid #eeeeee;border-right:1px solid #eeeeee;">{{.Codigo}}</td>
            <td style="font-size:8.5px;color:#111111;padding:4px 6px;border-bottom:1px solid #eeeeee;border-right:1px solid #eeeeee;">{{.Nombre}}</td>
            <td align="right" style="font-size:8.5px;color:#111111;padding:4px 6px;border-bottom:1px solid #eeeeee;border-right:1px solid #eeeeee;">{{.Cantidad}}</td>
            <td align="center" style="font-size:8.5px;color:#111111;padding:4px 6px;border-bottom:1px solid #eeeeee;border-right:1px solid #eeeeee;">{{.UnidadMedida}}</td>
            <td align="right" style="font-size:8.5px;color:#111111;padding:4px 6px;border-bottom:1px solid #eeeeee;border-right:1px solid #eeeeee;">{{.PrecioUnitario}}</td>
            <td align="right" style="font-size:8.5px;padding:4px 6px;border-bottom:1px solid #eeeeee;border-right:1px solid #eeeeee;{{if ne .BonifPct "-"}}color:#aa0000;{{else}}color:#bbbbbb;{{end}}">{{.BonifPct}}</td>
            <td align="right" style="font-size:8.5px;padding:4px 6px;border-bottom:1px solid #eeeeee;border-right:1px solid #eeeeee;{{if ne .BonifImporte "-"}}color:#aa0000;{{else}}color:#bbbbbb;{{end}}">{{.BonifImporte}}</td>
            <td align="right" style="font-size:8.5px;color:#111111;padding:4px 6px;border-bottom:1px solid #eeeeee;">{{.PrecioTotal}}</td>
          </tr>
          {{end}}
          <!-- Spacer -->
          <tr><td colspan="8" style="height:32px;"></td></tr>
        </tbody>
      </table>
    </td>
  </tr>

  <!-- ═══ SUBTOTAL / BONIFICACION / TOTAL ═══ -->
  <tr style="background:#fffbf0;">
    <td colspan="3" style="padding:4px 10px;border-top:1px solid #e0e0e0;border-bottom:1px solid #bbbbbb;">
      <span style="font-weight:700;font-size:7.5px;text-transform:uppercase;color:#666666;margin-right:6px;">Subtotal:</span>
      <span style="font-size:9px;color:#111111;margin-right:20px;">{{.SubtotalBrutoFormateado}}</span>
      <span style="font-weight:700;font-size:7.5px;text-transform:uppercase;color:#666666;margin-right:6px;">Bonificaci&#243;n:</span>
      <span style="font-size:9px;color:#bb0000;font-weight:600;margin-right:20px;">&#8722; {{.BonificacionTotalFormateado}}</span>
      <span style="font-weight:700;font-size:7.5px;text-transform:uppercase;color:#666666;margin-right:6px;">Total:</span>
      <span style="font-size:9px;color:#111111;">{{.TotalFormateado}}</span>
    </td>
  </tr>

  <!-- ═══ SON PESOS + IMPORTE TOTAL ═══ -->
  <tr>
    <td colspan="2" valign="middle" style="padding:5px 10px;border-right:1px solid #bbbbbb;border-top:1px solid #bbbbbb;border-bottom:1px solid #bbbbbb;">
      <span style="font-weight:700;font-size:7.5px;text-transform:uppercase;color:#666666;margin-right:6px;">Son pesos:</span>
      <span style="font-size:8.5px;font-style:italic;color:#333333;">{{.TotalEnLetras}}</span>
    </td>
    <td valign="middle" style="padding:5px 14px;background:#f0f3f8;border-top:1px solid #bbbbbb;border-bottom:1px solid #bbbbbb;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="font-weight:700;font-size:8.5px;text-transform:uppercase;color:#444444;">Importe total</td>
          <td align="right" style="font-weight:900;font-size:15px;color:#111111;">$ {{.TotalFormateado}}</td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- ═══ CAE FOOTER ═══ -->
  <tr>
    <td colspan="2" valign="top" style="padding:8px 12px;border-right:1px solid #bbbbbb;border-top:1px solid #bbbbbb;">
      <div style="font-weight:700;font-size:9.5px;margin-bottom:4px;color:#222222;">Comprobante autorizado</div>
      {{if .CAE}}
      <div style="font-size:8.5px;margin-bottom:2px;color:#333333;">CAE N&#186;: &nbsp;<strong>{{.CAE}}</strong></div>
      {{if .CAEVencimiento}}<div style="font-size:8.5px;color:#333333;">Fecha de vencimiento del CAE: &nbsp;<strong>{{.CAEVencimiento}}</strong></div>{{end}}
      {{else}}
      <div style="font-size:8.5px;color:#cc0000;">Pendiente de autorizaci&#243;n ARCA / AFIP</div>
      {{end}}
    </td>
    <td align="center" valign="middle" style="padding:8px 12px;border-top:1px solid #bbbbbb;">
      {{if .BarcodeDataURL}}<img src="{{.BarcodeDataURL}}" alt="C&#243;digo de barras CAE" style="max-height:48px;max-width:200px;" width="200">{{end}}
      {{if .BarcodeText}}<div style="font-size:8px;letter-spacing:0.8px;text-align:center;color:#444444;font-family:'Courier New',Courier,monospace;margin-top:3px;">{{.BarcodeText}}</div>{{end}}
    </td>
  </tr>

  <!-- ═══ PIE LEGAL ═══ -->
  <tr>
    <td colspan="3" style="padding:5px 12px;border-top:1px solid #dddddd;font-size:7px;font-style:italic;color:#777777;line-height:1.7;">
      Esta Administraci&#243;n Federal no se responsabiliza por los datos ingresados en el detalle de la operaci&#243;n.<br>
      Comprobante autorizado seg&#250;n Resoluci&#243;n General ARCA (ex AFIP). &nbsp; Verificaci&#243;n: www.afip.gob.ar/genericos/consultaCAE
    </td>
  </tr>

</table>
</body>
</html>`

// GenerateFacturaEmailHTML renders an email-safe version of the fiscal invoice.
// It uses the same data model as GenerateFacturaHTML but with a table-based layout
// and inline styles, so it renders correctly in Gmail, Outlook, and Apple Mail.
func GenerateFacturaEmailHTML(venta *model.Venta, comp *model.Comprobante, config *model.ConfiguracionFiscal) (string, error) {
	// Re-use GenerateFacturaHTML to produce the full data, then swap template
	// Build data the same way (inline to avoid duplication risk)
	tmpl, err := template.New("factura_email").Parse(facturaEmailHTMLTmpl)
	if err != nil {
		return "", fmt.Errorf("factura_email: parse template: %w", err)
	}

	data, err := buildFacturaData(venta, comp, config, false, false)
	if err != nil {
		return "", err
	}

	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, data); err != nil {
		return "", fmt.Errorf("factura_email: execute template: %w", err)
	}
	return buf.String(), nil
}

// GenerateFacturaHTMLFile generates the browser-ready HTML invoice and saves it
// as an .html file in storageDir. Returns the file path.
func GenerateFacturaHTMLFile(venta *model.Venta, comp *model.Comprobante, config *model.ConfiguracionFiscal, storageDir string) (string, error) {
	html, err := GenerateFacturaHTML(venta, comp, config, false, false)
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(storageDir, 0755); err != nil {
		return "", fmt.Errorf("factura_html_file: mkdir: %w", err)
	}
	filename := fmt.Sprintf("factura_%s_%04d-%08d.html", comp.Tipo, comp.PuntoDeVenta, safeNumero(comp.Numero))
	path := filepath.Join(storageDir, filename)
	if err := os.WriteFile(path, []byte(html), 0644); err != nil {
		return "", fmt.Errorf("factura_html_file: write: %w", err)
	}
	return path, nil
}

func safeNumero(n *int64) int64 {
	if n == nil {
		return 0
	}
	return *n
}

func formatDecimalAFIP(value decimal.Decimal, decimals int32) string {
	negative := value.IsNegative()
	abs := value.Abs().RoundBank(decimals)
	parts := strings.Split(abs.StringFixed(decimals), ".")
	intPart := parts[0]
	fracPart := ""
	if len(parts) > 1 {
		fracPart = parts[1]
	}

	var grouped strings.Builder
	for idx, ch := range intPart {
		if idx > 0 && (len(intPart)-idx)%3 == 0 {
			grouped.WriteRune('.')
		}
		grouped.WriteRune(ch)
	}

	formatted := grouped.String()
	if decimals > 0 {
		formatted += "," + fracPart
	}
	if negative {
		formatted = "-" + formatted
	}
	return formatted
}

func formatCantidadFactura(cantidad int) string {
	return formatDecimalAFIP(decimal.NewFromInt(int64(cantidad)), 2)
}

func formatPercentFactura(value decimal.Decimal) string {
	return formatDecimalAFIP(value, 2) + "%"
}

func normalizeInvoiceUnit(unit string) string {
	clean := strings.TrimSpace(strings.ToLower(unit))
	switch clean {
	case "", "unidad", "unidades", "unit", "units":
		return "Unid"
	case "kg", "kilo", "kilos", "kilogramo", "kilogramos":
		return "Kg"
	case "g", "gramo", "gramos":
		return "Gr"
	case "l", "lt", "lts", "litro", "litros":
		return "Lt"
	case "ml":
		return "Ml"
	case "m", "metro", "metros":
		return "M"
	default:
		if clean == "servicio" || clean == "servicios" {
			return "Serv"
		}
		return strings.ToUpper(clean[:1]) + clean[1:]
	}
}

// ─── Helper: condición IVA del receptor ──────────────────────────────────────

func condicionIVALabel(codigo *int) string {
	if codigo == nil {
		return "Consumidor Final"
	}
	switch *codigo {
	case 1:
		return "Responsable Inscripto"
	case 2:
		return "Responsable No Inscripto"
	case 3:
		return "No Responsable"
	case 4:
		return "Exento"
	case 5:
		return "Consumidor Final"
	case 6:
		return "Monotributista"
	case 7:
		return "No Alcanzado"
	default:
		return "Consumidor Final"
	}
}

// ─── Shared data builder ──────────────────────────────────────────────────────

// buildFacturaData prepares the template data struct shared by both the browser
// HTML template and the email-safe table template.
func buildFacturaData(venta *model.Venta, comp *model.Comprobante, config *model.ConfiguracionFiscal, autoPrint bool, esCopia bool) (*facturaHTMLData, error) {
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

	copiaLabel := "ORIGINAL"
	if esCopia {
		copiaLabel = "DUPLICADO"
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
	receptorCondicionIVA := condicionIVALabel(comp.ReceptorCondicionIVA)

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
	grossSubtotal := decimal.Zero
	for _, item := range venta.Items {
		nombre := "Producto"
		codigo := "-"
		unidadMedida := "Unid"
		if item.Producto != nil {
			nombre = item.Producto.Nombre
			if item.Producto.CodigoBarras != "" {
				codigo = item.Producto.CodigoBarras
			}
			unidadMedida = normalizeInvoiceUnit(item.Producto.UnidadMedida)
		}
		cantidad := decimal.NewFromInt(int64(item.Cantidad))
		lineBase := item.PrecioUnitario.Mul(cantidad)
		grossSubtotal = grossSubtotal.Add(lineBase)
		bonifPct := "-"
		bonifImporte := "-"
		if !item.DescuentoItem.IsZero() {
			bonifImporte = formatMoneyAFIP(item.DescuentoItem)
			if !lineBase.IsZero() {
				bonifPct = formatPercentFactura(item.DescuentoItem.Div(lineBase).Mul(decimal.NewFromInt(100)))
			}
		}
		htmlItems = append(htmlItems, facturaHTMLItem{
			Codigo:         codigo,
			Nombre:         nombre,
			Cantidad:       formatCantidadFactura(item.Cantidad),
			UnidadMedida:   unidadMedida,
			PrecioUnitario: formatMoneyAFIP(item.PrecioUnitario),
			BonifPct:       bonifPct,
			BonifImporte:   bonifImporte,
			PrecioTotal:    formatMoneyAFIP(item.Subtotal),
		})
	}

	if grossSubtotal.IsZero() {
		grossSubtotal = venta.Subtotal.Add(venta.DescuentoTotal)
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

	return &facturaHTMLData{
		LogoDataURL:                 logoDataURL,
		RazonSocial:                 config.RazonSocial,
		Domicilio:                   domicilio,
		CondicionFiscal:             config.CondicionFiscal,
		TipoLetra:                   tipoLetra,
		TipoNombre:                  tipoNombre,
		TipoCodigo:                  fmt.Sprintf("%02d", tipoCodigo),
		CopiaLabel:                  copiaLabel,
		NumeroFormateado:            fmt.Sprintf("%04d-%08d", pvDisplay, numero),
		PuntoDeVenta:                fmt.Sprintf("%04d", pvDisplay),
		FechaStr:                    venta.CreatedAt.Format("2/1/2006"),
		CUIT:                        config.CUITEmsior,
		IIBB:                        iibb,
		FechaInicioActiv:            fechaInicioActiv,
		ReceptorNombre:              receptorNombre,
		ReceptorDomicilio:           receptorDomicilio,
		ReceptorDocLabel:            receptorDocLabel,
		ReceptorDocNumero:           receptorDocNumero,
		ReceptorCondicionIVA:        receptorCondicionIVA,
		CondicionPago:               condPago,
		Items:                       htmlItems,
		SubtotalBrutoFormateado:     formatMoneyAFIP(grossSubtotal),
		BonificacionTotalFormateado: formatMoneyAFIP(venta.DescuentoTotal),
		TotalEnLetras:               amountToWords(venta.Total),
		TotalFormateado:             formatMoneyAFIP(venta.Total),
		CAE:                         cae,
		CAEVencimiento:              caeVencimiento,
		BarcodeDataURL:              barcodeDataURL,
		BarcodeText:                 barcodeText,
		AutoPrint:                   autoPrint,
	}, nil
}

// ─── Generator functions ──────────────────────────────────────────────────────

// GenerateFacturaHTML renders a complete self-contained HTML invoice page.
// The returned string can be served with Content-Type: text/html; charset=utf-8.
// All assets (logo, barcode) are embedded as base64 data URLs.
// If autoPrint is true, the HTML will automatically trigger the print dialog on load.
// If esCopia is true, the header label shows "DUPLICADO" instead of "ORIGINAL".
func GenerateFacturaHTML(venta *model.Venta, comp *model.Comprobante, config *model.ConfiguracionFiscal, autoPrint bool, esCopia bool) (string, error) {
	tmpl, err := template.New("factura").Parse(facturaHTMLTmpl)
	if err != nil {
		return "", fmt.Errorf("factura_html: parse template: %w", err)
	}
	data, err := buildFacturaData(venta, comp, config, autoPrint, esCopia)
	if err != nil {
		return "", err
	}
	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, data); err != nil {
		return "", fmt.Errorf("factura_html: execute template: %w", err)
	}
	return buf.String(), nil
}
