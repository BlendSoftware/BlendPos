#!/usr/bin/env python3
"""
Test client para el AFIP Sidecar
Permite probar el sidecar sin necesidad del backend Go
"""

import sys
import json
import argparse
from typing import Dict, Any

import httpx
from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich import print as rprint

console = Console()


def test_health(base_url: str) -> Dict[str, Any]:
    """Test del endpoint /health"""
    console.print("\n[bold cyan]→ Testing /health endpoint...[/bold cyan]")
    
    try:
        response = httpx.get(f"{base_url}/health", timeout=5.0)
        response.raise_for_status()
        data = response.json()
        
        # Pretty print
        console.print(Panel.fit(
            json.dumps(data, indent=2),
            title="✓ Health Check",
            border_style="green"
        ))
        
        return data
        
    except Exception as e:
        console.print(f"[bold red]✗ Error:[/bold red] {e}")
        sys.exit(1)


def test_facturar(
    base_url: str,
    cuit: str,
    punto_venta: int,
    tipo_cbte: int,
    monto_total: float
) -> Dict[str, Any]:
    """Test del endpoint /facturar"""
    console.print("\n[bold cyan]→ Testing /facturar endpoint...[/bold cyan]")
    
    # Calcular IVA (21%)
    monto_neto = round(monto_total / 1.21, 2)
    monto_iva = round(monto_total - monto_neto, 2)
    
    payload = {
        "cuit_emisor": cuit,
        "punto_de_venta": punto_venta,
        "tipo_comprobante": tipo_cbte,
        "tipo_doc_receptor": 99,  # Consumidor final
        "nro_doc_receptor": "0",
        "nombre_receptor": "CONSUMIDOR FINAL",
        "concepto": 1,  # Productos
        "importe_neto": monto_neto,
        "importe_exento": 0,
        "importe_iva": monto_iva,
        "importe_tributos": 0,
        "importe_total": monto_total,
        "moneda": "PES",
        "cotizacion_moneda": 1.0,
        "items": [
            {
                "codigo": "TEST001",
                "descripcion": "Producto de prueba",
                "cantidad": 1,
                "precio_unitario": monto_neto,
                "importe_total": monto_neto,
                "alicuota_iva": 21.0
            }
        ]
    }
    
    console.print("\n[bold]Request Payload:[/bold]")
    console.print(Panel.fit(
        json.dumps(payload, indent=2),
        border_style="blue"
    ))
    
    try:
        response = httpx.post(
            f"{base_url}/facturar",
            json=payload,
            timeout=30.0
        )
        
        data = response.json()
        
        if response.status_code == 200:
            # Factura exitosa
            if data.get('resultado') == 'A':
                console.print(Panel.fit(
                    json.dumps(data, indent=2),
                    title="✓ Factura Aprobada",
                    border_style="green"
                ))
                
                # Tabla resumen
                table = Table(title="Datos del Comprobante")
                table.add_column("Campo", style="cyan")
                table.add_column("Valor", style="green")
                
                table.add_row("CAE", data.get('cae', '-'))
                table.add_row("Vencimiento CAE", data.get('cae_vencimiento', '-'))
                table.add_row("Número", str(data.get('numero_comprobante', '-')))
                table.add_row("Fecha", data.get('fecha_comprobante', '-'))
                table.add_row("Resultado", data.get('resultado', '-'))
                
                console.print(table)
            else:
                # Factura rechazada
                console.print(Panel.fit(
                    json.dumps(data, indent=2),
                    title="✗ Factura Rechazada",
                    border_style="red"
                ))
                
                if data.get('observaciones'):
                    console.print("\n[bold red]Observaciones AFIP:[/bold red]")
                    for obs in data['observaciones']:
                        console.print(f"  - [{obs['codigo']}] {obs['mensaje']}")
        else:
            # Error HTTP
            console.print(Panel.fit(
                json.dumps(data, indent=2),
                title=f"✗ Error HTTP {response.status_code}",
                border_style="red"
            ))
        
        return data
        
    except Exception as e:
        console.print(f"[bold red]✗ Error:[/bold red] {e}")
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(
        description="Test client para BlendPOS AFIP Sidecar"
    )
    parser.add_argument(
        '--url',
        default='http://localhost:8001',
        help='URL base del sidecar (default: http://localhost:8001)'
    )
    parser.add_argument(
        '--cuit',
        default='20123456789',
        help='CUIT del emisor (default: 20123456789)'
    )
    parser.add_argument(
        '--pv',
        type=int,
        default=1,
        help='Punto de venta (default: 1)'
    )
    parser.add_argument(
        '--tipo',
        type=int,
        default=6,
        help='Tipo de comprobante (1=FactA, 6=FactB, 11=FactC, default: 6)'
    )
    parser.add_argument(
        '--monto',
        type=float,
        default=1210.0,
        help='Monto total con IVA (default: 1210.0)'
    )
    parser.add_argument(
        '--only-health',
        action='store_true',
        help='Solo probar /health'
    )
    
    args = parser.parse_args()
    
    # Header
    console.print("\n[bold magenta]" + "="*60 + "[/bold magenta]")
    console.print("[bold magenta]BlendPOS — AFIP Sidecar Test Client[/bold magenta]")
    console.print("[bold magenta]" + "="*60 + "[/bold magenta]\n")
    
    # Test health
    health_result = test_health(args.url)
    
    if not health_result.get('afip_conectado'):
        console.print("\n[bold yellow]⚠ AFIP no está conectado[/bold yellow]")
        console.print("Verifica los certificados y la configuración en .env")
    
    # Test facturar (si no es only-health)
    if not args.only_health:
        facturar_result = test_facturar(
            args.url,
            args.cuit,
            args.pv,
            args.tipo,
            args.monto
        )
    
    console.print("\n[bold green]✓ Tests completados[/bold green]\n")


if __name__ == "__main__":
    # Verificar dependencias
    try:
        import httpx
        import rich
    except ImportError:
        print("ERROR: Faltan dependencias")
        print("Instalar con: pip install httpx rich")
        sys.exit(1)
    
    main()
