import { forwardRef } from 'react';
import type { SaleRecord } from '../../store/useSaleStore';
import { formatARS } from '../../utils/format';
import styles from './PrintableTicket.module.css';

interface PrintableTicketProps {
    record: SaleRecord;
}

const METODO_LABEL: Record<string, string> = {
    efectivo: 'Efectivo',
    debito: 'Débito',
    credito: 'Crédito',
    qr: 'QR / Transferencia',
    mixto: 'Mixto',
    transferencia: 'Transferencia',
};

export const PrintableTicket = forwardRef<HTMLDivElement, PrintableTicketProps>(
    ({ record }, ref) => {
        const total = record.totalConDescuento || record.total;
        const vuelto = record.vuelto ?? 0;
        const fecha = new Date(record.fecha);

        return (
            <div ref={ref} className={styles.ticket}>
                {/* Header */}
                <div className={styles.header}>
                    <h1 className={styles.storeName}>BLEND POS</h1>
                    <p className={styles.storeSubtitle}>Sistema de Punto de Venta</p>
                </div>

                {/* Ticket Info */}
                <div className={styles.section}>
                    <div className={styles.row}>
                        <span className={styles.label}>Ticket #</span>
                        <span className={styles.value}>{record.numeroTicket}</span>
                    </div>
                    <div className={styles.row}>
                        <span className={styles.label}>Fecha:</span>
                        <span className={styles.value}>
                            {fecha.toLocaleDateString('es-AR')} {fecha.toLocaleTimeString('es-AR')}
                        </span>
                    </div>
                    <div className={styles.row}>
                        <span className={styles.label}>Cajero:</span>
                        <span className={styles.value}>{record.cajero}</span>
                    </div>
                </div>

                <div className={styles.divider}></div>

                {/* Items */}
                <div className={styles.section}>
                    <table className={styles.itemsTable}>
                        <thead>
                            <tr>
                                <th align="left">Producto</th>
                                <th align="center">Cant</th>
                                <th align="right">Precio</th>
                                <th align="right">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {record.items.map((item, idx) => (
                                <tr key={idx}>
                                    <td>{item.nombre}</td>
                                    <td align="center">{item.cantidad}</td>
                                    <td align="right">{formatARS(item.precio)}</td>
                                    <td align="right">
                                        {formatARS(item.cantidad * item.precio)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className={styles.divider}></div>

                {/* Totals */}
                <div className={styles.section}>
                    {record.totalConDescuento > 0 && record.total !== record.totalConDescuento && (
                        <>
                            <div className={styles.row}>
                                <span className={styles.label}>Subtotal:</span>
                                <span className={styles.value}>{formatARS(record.total)}</span>
                            </div>
                            <div className={styles.row}>
                                <span className={styles.label}>Descuento:</span>
                                <span className={styles.value}>
                                    -{formatARS(record.total - record.totalConDescuento)}
                                </span>
                            </div>
                        </>
                    )}
                    <div className={styles.row + ' ' + styles.totalRow}>
                        <span className={styles.label}>TOTAL:</span>
                        <span className={styles.value}>{formatARS(total)}</span>
                    </div>
                </div>

                <div className={styles.divider}></div>

                {/* Payment */}
                <div className={styles.section}>
                    <div className={styles.row}>
                        <span className={styles.label}>Método de pago:</span>
                        <span className={styles.value}>
                            {METODO_LABEL[record.metodoPago] ?? record.metodoPago}
                        </span>
                    </div>

                    {record.metodoPago === 'mixto' && record.pagos && (
                        <div className={styles.pagosMixtos}>
                            {record.pagos.map((pago, idx) => (
                                <div key={idx} className={styles.row}>
                                    <span className={styles.label}>
                                        • {METODO_LABEL[pago.metodo] ?? pago.metodo}:
                                    </span>
                                    <span className={styles.value}>{formatARS(pago.monto)}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {record.efectivoRecibido !== undefined && record.efectivoRecibido > 0 && (
                        <>
                            <div className={styles.row}>
                                <span className={styles.label}>Efectivo recibido:</span>
                                <span className={styles.value}>
                                    {formatARS(record.efectivoRecibido)}
                                </span>
                            </div>
                            {vuelto > 0 && (
                                <div className={styles.row}>
                                    <span className={styles.label}>Vuelto:</span>
                                    <span className={styles.value}>{formatARS(vuelto)}</span>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {record.clienteEmail && (
                    <>
                        <div className={styles.divider}></div>
                        <div className={styles.section}>
                            <div className={styles.row}>
                                <span className={styles.label}>Email:</span>
                                <span className={styles.value}>{record.clienteEmail}</span>
                            </div>
                        </div>
                    </>
                )}

                {/* Footer */}
                <div className={styles.footer}>
                    <p>¡Gracias por su compra!</p>
                    <p className={styles.small}>www.blendpos.com</p>
                </div>
            </div>
        );
    }
);

PrintableTicket.displayName = 'PrintableTicket';
