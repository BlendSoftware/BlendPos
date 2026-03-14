import { useState, useMemo, useEffect, useCallback, Fragment } from 'react';
import {
    Stack, Title, Text, Group, Table, Paper, Badge, ActionIcon,
    Tooltip, TextInput, Modal, Button, Select, Alert, UnstyledButton,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { Printer, Download, FileText, ChevronDown, ChevronUp, Search, Ban, AlertTriangle, RefreshCw, ChevronsUpDown } from 'lucide-react';
import { notifications } from '@mantine/notifications';
import { useAuthStore } from '../../store/useAuthStore';
import { usePrinterStore } from '../../store/usePrinterStore';
import { type MetodoPago } from '../../store/useSaleStore';
import { anularVenta, listarVentas, type VentaListItem } from '../../services/api/ventas';
import { getComprobante, abrirFacturaHTML, descargarPDF } from '../../services/api/facturacion';
import { formatARS } from '../../utils/format';
import type { IVenta } from '../../types';

const METODO_COLOR: Record<string, string> = {
    efectivo: 'teal', debito: 'blue', credito: 'violet', transferencia: 'cyan', qr: 'orange',
};

const METODO_LABEL: Record<string, string> = {
    efectivo: 'Efectivo', debito: 'Débito', credito: 'Crédito',
    transferencia: 'Transferencia', qr: 'QR',
};

type Periodo = 'hoy' | 'ayer' | 'semana' | 'mes' | 'personalizado' | 'todas';

function matchesPeriodo(fecha: string, periodo: Periodo): boolean {
    const d = new Date(fecha);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 86400000);
    const weekAgo = new Date(today.getTime() - 7 * 86400000);
    const monthAgo = new Date(today.getTime() - 30 * 86400000);
    if (periodo === 'hoy') return d >= today;
    if (periodo === 'ayer') return d >= yesterday && d < today;
    if (periodo === 'semana') return d >= weekAgo;
    if (periodo === 'mes') return d >= monthAgo;
    return true;
}

export function FacturacionPage() {
    const { hasRole } = useAuthStore();
    const { config: printerConfig } = usePrinterStore();
    const [apiVentas, setApiVentas] = useState<VentaListItem[]>([]);
    const [loadingVentas, setLoadingVentas] = useState(false);
    const [desde, setDesde] = useState<Date | null>(null);
    const [hasta, setHasta] = useState<Date | null>(null);
    const [periodo, setPeriodo] = useState<string>('todas');
    const ordenarPor = 'fecha';
    const orden = 'desc';

    const toDateStr = (d: Date | null): string | undefined => {
        if (!d) return undefined;
        // Mantine v8 DateInput passes:
        //   - a string 'YYYY-MM-DD' when the user types in the field
        //   - a native Date at UTC midnight when the user clicks the calendar
        if (typeof (d as unknown) === 'string') return (d as unknown as string).slice(0, 10);
        // UTC midnight Date → must use UTC getters to avoid -3h offset shifting the day back
        const y = (d as Date).getUTCFullYear();
        const m = String((d as Date).getUTCMonth() + 1).padStart(2, '0');
        const day = String((d as Date).getUTCDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    };

    const cargarVentas = useCallback(async () => {
        setLoadingVentas(true);
        try {
            // Para períodos fijos (hoy/ayer/semana/mes) calculamos las fechas server-side
            // para no depender del límite de 200 ventas del cliente.
            let efectivoDesde = toDateStr(desde);
            let efectivoHasta = toDateStr(hasta);

            if (periodo !== 'personalizado' && periodo !== 'todas') {
                const now = new Date();
                const pad = (n: number) => String(n).padStart(2, '0');
                const localStr = (d: Date) =>
                    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
                const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                if (periodo === 'hoy') {
                    efectivoDesde = localStr(today);
                } else if (periodo === 'ayer') {
                    const ayer = new Date(today.getTime() - 86400000);
                    efectivoDesde = localStr(ayer);
                    efectivoHasta = localStr(ayer);
                } else if (periodo === 'semana') {
                    efectivoDesde = localStr(new Date(today.getTime() - 7 * 86400000));
                } else if (periodo === 'mes') {
                    efectivoDesde = localStr(new Date(today.getTime() - 30 * 86400000));
                }
            }

            const resp = await listarVentas({
                estado: 'all',
                limit: 1000,
                desde: efectivoDesde,
                hasta: efectivoHasta,
                ordenar_por: ordenarPor,
                orden: orden,
            });
            setApiVentas(resp.data);
        } catch { /* silent */ } finally {
            setLoadingVentas(false);
        }
    }, [desde, hasta, periodo, ordenarPor, orden]);

    useEffect(() => { cargarVentas(); }, [cargarVentas]);

    // Map API ventas → IVenta[] for display (single source of truth: backend)
    const ventas: IVenta[] = useMemo(() => {
        return apiVentas.map((v) => ({
            id: v.id,
            numeroTicket: String(v.numero_ticket).padStart(6, '0'),
            items: v.items.map((item) => ({
                productoId: '',
                productoNombre: item.producto,
                codigoBarras: '',
                cantidad: item.cantidad,
                precioUnitario: item.precio_unitario,
                descuento: 0,
                subtotal: item.subtotal,
            })),
            subtotal: v.subtotal,
            descuentoGlobal: v.descuento_total,
            total: v.total,
            metodoPago: (v.pagos[0]?.metodo ?? 'efectivo') as MetodoPago,
            pagos: v.pagos.map((p) => ({ metodo: p.metodo, monto: p.monto })),
            vuelto: 0,
            cajeroId: v.usuario_id,
            cajeroNombre: v.cajero_nombre || '',
            fecha: v.created_at,
            anulada: v.estado === 'anulada',
        })) as unknown as IVenta[];
    }, [apiVentas]);

    const [busqueda, setBusqueda] = useState('');
    // periodo is declared above (before cargarVentas) — keeping this comment for clarity
    const [filtroMetodo, setFiltroMetodo] = useState<string | null>(null);
    const [filtroEstado, setFiltroEstado] = useState<string | null>(null);
    const [sortBy, setSortBy] = useState<string>('fecha');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [anularTarget, setAnularTarget] = useState<IVenta | null>(null);
    const [anuladas, setAnuladas] = useState<Set<string>>(new Set());

    const filtered = useMemo(() => {
        const q = busqueda.toLowerCase();
        const result = ventas
            .map((v) => ({ ...v, anulada: v.anulada || anuladas.has(v.id) }))
            .filter(
                (v) => {
                    const matchPeriodo = periodo === 'personalizado'
                        ? (!desde || v.fecha.slice(0, 10) >= toDateStr(desde)!) && (!hasta || v.fecha.slice(0, 10) <= toDateStr(hasta)!)
                        : matchesPeriodo(v.fecha, periodo as Periodo);
                    const matchBusqueda = !q ||
                        v.numeroTicket.includes(q) ||
                        v.cajeroNombre.toLowerCase().includes(q) ||
                        v.id.toLowerCase().includes(q);
                    const matchMetodo = !filtroMetodo || v.metodoPago === filtroMetodo || v.pagos?.some((p) => p.metodo === filtroMetodo);
                    const matchEstado = !filtroEstado || (filtroEstado === 'anulada' ? v.anulada : !v.anulada);
                    return matchPeriodo && matchBusqueda && matchMetodo && matchEstado;
                }
            );

        // Ordenamiento
        result.sort((a, b) => {
            let valA: string | number;
            let valB: string | number;
            switch (sortBy) {
                case 'ticket': valA = a.numeroTicket; valB = b.numeroTicket; break;
                case 'fecha': valA = new Date(a.fecha).getTime(); valB = new Date(b.fecha).getTime(); break;
                case 'cajero': valA = a.cajeroNombre.toLowerCase(); valB = b.cajeroNombre.toLowerCase(); break;
                case 'metodo': valA = a.metodoPago; valB = b.metodoPago; break;
                case 'total': valA = a.total; valB = b.total; break;
                default: valA = a.id; valB = b.id;
            }
            if (valA < valB) return sortDir === 'asc' ? -1 : 1;
            if (valA > valB) return sortDir === 'asc' ? 1 : -1;
            return 0;
        });

        return result;
    }, [ventas, anuladas, busqueda, periodo, filtroMetodo, filtroEstado, desde, hasta, sortBy, sortDir]);

    const buildTicketHTML = (v: IVenta): string => {
        const storeName = printerConfig.storeName || 'BLEND POS';
        const storeSub  = printerConfig.storeSubtitle || '';
        const storeAddr = printerConfig.storeAddress || '';
        const storePhone = printerConfig.storePhone || '';
        const storeFooter = printerConfig.storeFooter || '¡Gracias por su compra!';
        return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Ticket #${v.numeroTicket}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Courier New', monospace; background: white; display: flex; justify-content: center; padding: 10mm; }
        .ticket { width: 76mm; max-width: 76mm; background: white; padding: 5mm; }
        .header { text-align: center; margin-bottom: 12px; }
        .store-name { font-size: 20px; font-weight: bold; margin-bottom: 3px; }
        .store-sub { font-size: 10px; color: #555; margin-bottom: 2px; }
        .store-addr { font-size: 9px; color: #555; margin-bottom: 1px; }
        .divider { border-top: 1px dashed #555; margin: 8px 0; }
        .divider-solid { border-top: 2px solid #000; margin: 8px 0; }
        .section { margin: 6px 0; }
        .row { display: flex; justify-content: space-between; margin: 3px 0; font-size: 11px; }
        .label { color: #444; }
        .value { font-weight: bold; text-align: right; }
        .items-table { width: 100%; border-collapse: collapse; margin: 4px 0; }
        .items-table thead th { font-size: 10px; font-weight: bold; border-bottom: 1px solid #000; padding: 3px 2px; text-align: left; }
        .items-table thead th:not(:first-child) { text-align: right; }
        .items-table tbody td { font-size: 10px; padding: 3px 2px; }
        .items-table tbody td:not(:first-child) { text-align: right; }
        .items-table .name-col { max-width: 36mm; word-break: break-word; }
        .total-row { font-size: 15px; font-weight: bold; margin-top: 6px; padding-top: 6px; border-top: 2px solid #000; }
        .footer { text-align: center; margin-top: 14px; padding-top: 10px; border-top: 1px dashed #555; }
        .footer p { font-size: 11px; margin: 3px 0; }
        .no-print { text-align: center; margin-bottom: 14px; }
        .btn-print { padding: 9px 22px; background: #2563eb; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; font-family: sans-serif; }
        @media print { body { padding: 0; } .no-print { display: none !important; } @page { size: 80mm auto; margin: 5mm; } }
    </style>
</head>
<body>
<div class="ticket">
    <div class="no-print"><button class="btn-print" onclick="window.print()">Imprimir</button></div>
    <div class="header">
        <div class="store-name">${storeName}</div>
        ${storeSub ? `<div class="store-sub">${storeSub}</div>` : ''}
        ${storeAddr ? `<div class="store-addr">${storeAddr}</div>` : ''}
        ${storePhone ? `<div class="store-addr">${storePhone}</div>` : ''}
    </div>
    <div class="divider-solid"></div>
    <div class="section">
        <div class="row"><span class="label">Ticket N°</span><span class="value">#${v.numeroTicket}</span></div>
        <div class="row"><span class="label">Fecha</span><span class="value">${new Date(v.fecha).toLocaleDateString('es-AR')} ${new Date(v.fecha).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</span></div>
        <div class="row"><span class="label">Cajero</span><span class="value">${v.cajeroNombre}</span></div>
    </div>
    <div class="divider"></div>
    <div class="section">
        <table class="items-table">
            <thead><tr><th class="name-col">Producto</th><th>Cant</th><th>P.Unit</th><th>Total</th></tr></thead>
            <tbody>${v.items.map(item => `
                <tr>
                    <td class="name-col">${item.productoNombre}</td>
                    <td>${item.cantidad}</td>
                    <td>${formatARS(item.precioUnitario)}</td>
                    <td>${formatARS(item.subtotal)}</td>
                </tr>`).join('')}
            </tbody>
        </table>
    </div>
    <div class="divider"></div>
    <div class="section">
        ${v.descuentoGlobal > 0 ? `
        <div class="row"><span class="label">Subtotal</span><span class="value">${formatARS(v.subtotal)}</span></div>
        <div class="row"><span class="label">Descuento</span><span class="value">-${formatARS(v.descuentoGlobal)}</span></div>
        ` : ''}
        <div class="row total-row"><span class="label">TOTAL</span><span class="value">${formatARS(v.total)}</span></div>
    </div>
    <div class="divider"></div>
    <div class="section">
        <div class="row"><span class="label">Método de pago</span><span class="value">${METODO_LABEL[v.metodoPago] ?? v.metodoPago}</span></div>
    </div>
    ${v.anulada ? `<div class="divider"></div><div class="section" style="text-align:center;color:red;font-weight:bold;">*** ANULADA ***</div>` : ''}
    <div class="footer">
        <p>${storeFooter}</p>
    </div>
</div>
</body>
</html>`;
    };

    const handleReprint = async (v: IVenta) => {
        try {
            const printWindow = window.open('', '_blank', 'width=800,height=700');
            if (!printWindow) {
                throw new Error('El navegador bloqueó la ventana emergente. Permití las ventanas emergentes para este sitio.');
            }
            printWindow.document.open();
            printWindow.document.write(buildTicketHTML(v));
            printWindow.document.close();
            printWindow.onload = () => {
                printWindow.focus();
                printWindow.print();
                setTimeout(() => printWindow.close(), 100);
            };
            notifications.show({
                title: 'Reimpresión iniciada',
                message: `Ticket #${v.numeroTicket}`,
                color: 'blue',
                icon: <Printer size={14} />,
            });
        } catch (e: unknown) {
            notifications.show({
                title: 'No se pudo reimprimir',
                message: e instanceof Error ? e.message : 'Error desconocido.',
                color: 'red',
                icon: <Printer size={14} />,
            });
        }
    };

    const handleDownloadPDF = async (v: IVenta) => {
        try {
            const comp = await getComprobante(v.id).catch(() => null);
            if (!comp) {
                throw new Error('Comprobante no disponible para esta venta.');
            }
            const tipoLetra = comp.tipo === 'factura_a' ? 'A' : comp.tipo === 'factura_b' ? 'B' : comp.tipo === 'factura_c' ? 'C' : '';
            const numeroFormateado = `${String(comp.punto_de_venta).padStart(4, '0')}-${String(comp.numero ?? 0).padStart(8, '0')}`;
            const nombreArchivo = tipoLetra
                ? `FACTURA ${tipoLetra} ${numeroFormateado}.pdf`
                : `comprobante_${numeroFormateado}.pdf`;
            await descargarPDF(comp.id, nombreArchivo);
        } catch (e: unknown) {
            notifications.show({
                title: 'No se pudo descargar el PDF',
                message: e instanceof Error ? e.message : 'Error desconocido.',
                color: 'red',
                icon: <Download size={14} />,
            });
        }
    };

    const handleVerFactura = async (v: IVenta) => {
        try {
            const comp = await getComprobante(v.id);
            await abrirFacturaHTML(comp.id, false, false);
        } catch (e: unknown) {
            notifications.show({
                title: 'No se pudo abrir la factura',
                message: e instanceof Error ? e.message : 'Comprobante no disponible para esta venta.',
                color: 'red',
                icon: <FileText size={14} />,
            });
        }
    };

    const handleImprimirFactura = async (v: IVenta) => {
        try {
            const comp = await getComprobante(v.id);
            await abrirFacturaHTML(comp.id, true, false);
        } catch (e: unknown) {
            notifications.show({
                title: 'No se pudo imprimir',
                message: e instanceof Error ? e.message : 'Comprobante no disponible para esta venta.',
                color: 'red',
                icon: <Printer size={14} />,
            });
        }
    };

    const handleAnular = async () => {
        if (!anularTarget) return;
        try {
            await anularVenta(anularTarget.id, 'Anulación manual desde admin');
            // Only update local state after backend confirms success (B-02)
            setAnuladas((prev) => new Set([...prev, anularTarget.id]));
            notifications.show({
                title: 'Venta anulada',
                message: `Ticket #${anularTarget.numeroTicket}`,
                color: 'red',
                icon: <Ban size={14} />,
            });
            // Refresh from backend to get updated estado
            cargarVentas();
        } catch {
            notifications.show({
                title: 'Error al anular',
                message: 'No se pudo anular la venta. Verifique la conexión con el servidor.',
                color: 'orange',
                icon: <AlertTriangle size={14} />,
            });
        }
        setAnularTarget(null);
    };

    const canAnular = hasRole(['admin', 'supervisor']);

    const toggleSort = (col: string) => {
        if (sortBy === col) {
            setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(col);
            setSortDir('asc');
        }
    };

    const SortIcon = ({ col }: { col: string }) => {
        if (sortBy !== col) return <ChevronsUpDown size={12} style={{ opacity: 0.4 }} />;
        return sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />;
    };

    return (
        <Stack gap="xl">
            <Group justify="space-between">
                <div>
                    <Title order={2} fw={800}>Historial de Facturación</Title>
                    <Text c="dimmed" size="sm">{ventas.length} tickets registrados</Text>
                </div>
            </Group>

            <Group wrap="wrap" gap="sm">
                <TextInput
                    placeholder="Buscar por número de ticket o cajero..."
                    leftSection={<Search size={14} />}
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.currentTarget.value)}
                    style={{ flex: 1, minWidth: 240 }}
                />
                <Select
                    placeholder="Período"
                    value={periodo}
                    onChange={(v) => {
                        const next = v ?? 'todas';
                        setPeriodo(next);
                        if (next !== 'personalizado') {
                            setDesde(null);
                            setHasta(null);
                        }
                    }}
                    data={[
                        { value: 'hoy', label: 'Hoy' },
                        { value: 'ayer', label: 'Ayer' },
                        { value: 'semana', label: 'Última semana' },
                        { value: 'mes', label: 'Último mes' },
                        { value: 'personalizado', label: 'Rango personalizado' },
                        { value: 'todas', label: 'Todas' },
                    ]}
                    style={{ width: 170 }}
                    clearable
                />
                {periodo === 'personalizado' && (
                    <>
                        <DateInput
                            placeholder="Desde"
                            value={desde}
                            onChange={(v) => setDesde(v as Date | null)}
                            clearable
                            style={{ width: 140 }}
                        />
                        <DateInput
                            placeholder="Hasta"
                            value={hasta}
                            onChange={(v) => setHasta(v as Date | null)}
                            clearable
                            style={{ width: 140 }}
                        />
                    </>
                )}
                <Select
                    placeholder="Método"
                    value={filtroMetodo}
                    onChange={setFiltroMetodo}
                    data={[
                        { value: 'efectivo', label: 'Efectivo' },
                        { value: 'debito', label: 'Débito' },
                        { value: 'credito', label: 'Crédito' },
                        { value: 'qr', label: 'QR' },
                        { value: 'transferencia', label: 'Transferencia' },
                    ]}
                    style={{ width: 140 }}
                    clearable
                />
                <Select
                    placeholder="Estado"
                    value={filtroEstado}
                    onChange={setFiltroEstado}
                    data={[
                        { value: 'completada', label: 'Completadas' },
                        { value: 'anulada', label: 'Anuladas' },
                    ]}
                    style={{ width: 140 }}
                    clearable
                />
                <Tooltip label="Actualizar" withArrow>
                    <ActionIcon variant="light" loading={loadingVentas} onClick={cargarVentas}>
                        <RefreshCw size={15} />
                    </ActionIcon>
                </Tooltip>
            </Group>

            <Paper radius="md" withBorder style={{ overflow: 'hidden' }}>
                <Table highlightOnHover verticalSpacing="sm">
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th style={{ width: 30 }} />
                            <Table.Th>
                                <UnstyledButton onClick={() => toggleSort('ticket')} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'inherit', fontWeight: 'inherit' }}>
                                    Ticket <SortIcon col="ticket" />
                                </UnstyledButton>
                            </Table.Th>
                            <Table.Th>
                                <UnstyledButton onClick={() => toggleSort('fecha')} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'inherit', fontWeight: 'inherit' }}>
                                    Fecha <SortIcon col="fecha" />
                                </UnstyledButton>
                            </Table.Th>
                            <Table.Th>
                                <UnstyledButton onClick={() => toggleSort('cajero')} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'inherit', fontWeight: 'inherit' }}>
                                    Cajero <SortIcon col="cajero" />
                                </UnstyledButton>
                            </Table.Th>
                            <Table.Th>
                                <UnstyledButton onClick={() => toggleSort('metodo')} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'inherit', fontWeight: 'inherit' }}>
                                    Método <SortIcon col="metodo" />
                                </UnstyledButton>
                            </Table.Th>
                            <Table.Th>
                                <UnstyledButton onClick={() => toggleSort('total')} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'inherit', fontWeight: 'inherit' }}>
                                    Total <SortIcon col="total" />
                                </UnstyledButton>
                            </Table.Th>
                            <Table.Th>Estado</Table.Th>
                            <Table.Th>Acciones</Table.Th>
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {filtered.map((v) => (
                            <Fragment key={v.id}>
                                <Table.Tr
                                    key={v.id}
                                    style={{ cursor: 'pointer', opacity: v.anulada ? 0.5 : 1 }}
                                    onClick={() => setExpandedId(expandedId === v.id ? null : v.id)}
                                >
                                    <Table.Td>
                                        {expandedId === v.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                    </Table.Td>
                                    <Table.Td>
                                        <Text size="sm" fw={600} ff="monospace">#{v.numeroTicket}</Text>
                                    </Table.Td>
                                    <Table.Td>
                                        <Text size="xs">
                                            {new Date(v.fecha).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}
                                        </Text>
                                    </Table.Td>
                                    <Table.Td><Text size="sm">{v.cajeroNombre}</Text></Table.Td>
                                    <Table.Td>
                                        <Badge color={METODO_COLOR[v.metodoPago] ?? 'gray'} size="sm" variant="light">
                                            {METODO_LABEL[v.metodoPago] ?? v.metodoPago}
                                        </Badge>
                                    </Table.Td>
                                    <Table.Td>
                                        <Text size="sm" fw={700}>{formatARS(v.total)}</Text>
                                    </Table.Td>
                                    <Table.Td>
                                        {v.anulada
                                            ? <Badge color="red" size="sm" variant="light">Anulada</Badge>
                                            : <Badge color="teal" size="sm" variant="light">Válida</Badge>
                                        }
                                    </Table.Td>
                                    <Table.Td>
                                        <Group gap={4} onClick={(e) => e.stopPropagation()}>
                                            <Tooltip label="Reimprimir ticket" withArrow>
                                                <ActionIcon variant="subtle" color="blue" onClick={() => handleReprint(v)} disabled={v.anulada}>
                                                    <Printer size={15} />
                                                </ActionIcon>
                                            </Tooltip>
                                            <Tooltip label="Ver factura" withArrow>
                                                <ActionIcon variant="subtle" color="teal" onClick={() => handleVerFactura(v)}>
                                                    <FileText size={15} />
                                                </ActionIcon>
                                            </Tooltip>
                                            <Tooltip label="Imprimir factura" withArrow>
                                                <ActionIcon variant="subtle" color="violet" onClick={() => handleImprimirFactura(v)} disabled={v.anulada}>
                                                    <Printer size={15} />
                                                </ActionIcon>
                                            </Tooltip>
                                            <Tooltip label="Descargar PDF" withArrow>
                                                <ActionIcon variant="subtle" color="gray" onClick={() => handleDownloadPDF(v)}>
                                                    <Download size={15} />
                                                </ActionIcon>
                                            </Tooltip>
                                            {canAnular && !v.anulada && (
                                                <Tooltip label="Anular venta" withArrow>
                                                    <ActionIcon variant="subtle" color="red" onClick={() => setAnularTarget(v)}>
                                                        <Ban size={15} />
                                                    </ActionIcon>
                                                </Tooltip>
                                            )}
                                        </Group>
                                    </Table.Td>
                                </Table.Tr>

                                {expandedId === v.id && (
                                    <Table.Tr key={`${v.id}-detail`}>
                                        <Table.Td colSpan={8} style={{ background: 'var(--mantine-color-default-hover)', padding: '12px 24px' }}>
                                            <Text size="xs" fw={600} mb="xs" c="dimmed">DETALLE DE ITEMS</Text>
                                            <Table verticalSpacing="xs">
                                                <Table.Thead>
                                                    <Table.Tr>
                                                        <Table.Th><Text size="xs">Producto</Text></Table.Th>
                                                        <Table.Th><Text size="xs">Cant.</Text></Table.Th>
                                                        <Table.Th><Text size="xs">Precio unit.</Text></Table.Th>
                                                        <Table.Th><Text size="xs">Dto.</Text></Table.Th>
                                                        <Table.Th><Text size="xs">Subtotal</Text></Table.Th>
                                                    </Table.Tr>
                                                </Table.Thead>
                                                <Table.Tbody>
                                                    {v.items.map((item, i) => (
                                                        <Table.Tr key={i}>
                                                            <Table.Td><Text size="xs">{item.productoNombre}</Text></Table.Td>
                                                            <Table.Td><Text size="xs">{item.cantidad}</Text></Table.Td>
                                                            <Table.Td><Text size="xs">{formatARS(item.precioUnitario)}</Text></Table.Td>
                                                            <Table.Td><Text size="xs" c={item.descuento > 0 ? 'yellow' : 'dimmed'}>{item.descuento}%</Text></Table.Td>
                                                            <Table.Td><Text size="xs" fw={600}>{formatARS(item.subtotal)}</Text></Table.Td>
                                                        </Table.Tr>
                                                    ))}
                                                </Table.Tbody>
                                            </Table>
                                        </Table.Td>
                                    </Table.Tr>
                                )}
                            </Fragment>
                        ))}
                    </Table.Tbody>
                </Table>
            </Paper>

            {/* Anular Modal */}
            <Modal
                opened={!!anularTarget}
                onClose={() => setAnularTarget(null)}
                title={<Text fw={700} c="red">Confirmar Anulación</Text>}
                size="sm"
                centered
            >
                {anularTarget && (
                    <Stack gap="md">
                        <Alert color="red" variant="light" icon={<AlertTriangle size={16} />}>
                            Estás por anular el ticket <strong>#{anularTarget.numeroTicket}</strong> por{' '}
                            <strong>{formatARS(anularTarget.total)}</strong>.
                            Esta acción no se puede deshacer.
                        </Alert>
                        <Group justify="flex-end">
                            <Button variant="subtle" onClick={() => setAnularTarget(null)}>Cancelar</Button>
                            <Button color="red" leftSection={<Ban size={14} />} onClick={handleAnular}>
                                Anular venta
                            </Button>
                        </Group>
                    </Stack>
                )}
            </Modal>
        </Stack>
    );
}
