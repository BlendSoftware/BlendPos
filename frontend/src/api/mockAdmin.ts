// ─────────────────────────────────────────────────────────────────────────────
// Mock data — Fase 8 (reemplazar por llamadas reales al backend Go)
// ─────────────────────────────────────────────────────────────────────────────

import type {
    IUser, IProducto, IVenta, IProveedor, ICierreCaja, IMovimientoStock,
} from '../types';

// ── Usuarios ──────────────────────────────────────────────────────────────────

export const MOCK_USERS: IUser[] = [
    { id: 'u1', nombre: 'Carlos Administrador', email: 'admin@blendpos.com', rol: 'admin',       activo: true,  creadoEn: '2025-01-10T10:00:00Z' },
    { id: 'u2', nombre: 'María Supervisora',    email: 'super@blendpos.com', rol: 'supervisor',  activo: true,  creadoEn: '2025-02-01T10:00:00Z' },
    { id: 'u3', nombre: 'Juan Cajero',          email: 'caja@blendpos.com',  rol: 'cajero',      activo: true,  creadoEn: '2025-03-15T10:00:00Z' },
    { id: 'u4', nombre: 'Ana Cajera',           email: 'ana@blendpos.com',   rol: 'cajero',      activo: false, creadoEn: '2025-04-01T10:00:00Z' },
];

// ── Productos ─────────────────────────────────────────────────────────────────

export const MOCK_PRODUCTOS: IProducto[] = [
    { id: 'p1',  codigoBarras: '7790895000107', nombre: 'Coca Cola 500ml',         descripcion: 'Gaseosa cola botella 500ml',   categoria: 'bebidas',   precioCosto: 800,  precioVenta: 1200, stock: 48,  stockMinimo: 12, activo: true,  creadoEn: '2025-01-01T00:00:00Z', actualizadoEn: '2025-06-01T00:00:00Z' },
    { id: 'p2',  codigoBarras: '7790895000206', nombre: 'Sprite 500ml',            descripcion: 'Gaseosa lima limón 500ml',     categoria: 'bebidas',   precioCosto: 750,  precioVenta: 1100, stock: 36,  stockMinimo: 12, activo: true,  creadoEn: '2025-01-01T00:00:00Z', actualizadoEn: '2025-06-01T00:00:00Z' },
    { id: 'p3',  codigoBarras: '7791234500031', nombre: 'Alfajor Milka',           descripcion: 'Alfajor triple chocolate',     categoria: 'golosinas', precioCosto: 350,  precioVenta: 600,  stock: 5,   stockMinimo: 20, activo: true,  padreId: 'p4', creadoEn: '2025-01-01T00:00:00Z', actualizadoEn: '2025-06-01T00:00:00Z' },
    { id: 'p4',  codigoBarras: '7791234500048', nombre: 'Caja Alfajor Milka x20',  descripcion: 'Caja 20 alfajores Milka',      categoria: 'golosinas', precioCosto: 6000, precioVenta: 9500, stock: 3,   stockMinimo: 5,  activo: true,  cantidadHija: 20, creadoEn: '2025-01-01T00:00:00Z', actualizadoEn: '2025-06-01T00:00:00Z' },
    { id: 'p5',  codigoBarras: '7790040510016', nombre: 'Leche La Serenísima 1L',  descripcion: 'Leche entera larga vida 1L',   categoria: 'lacteos',   precioCosto: 900,  precioVenta: 1400, stock: 24,  stockMinimo: 10, activo: true,  creadoEn: '2025-01-01T00:00:00Z', actualizadoEn: '2025-06-01T00:00:00Z' },
    { id: 'p6',  codigoBarras: '7790040510023', nombre: 'Yogur Activia Natural',   descripcion: 'Yogur natural sin azúcar 190g', categoria: 'lacteos',  precioCosto: 500,  precioVenta: 850,  stock: 18,  stockMinimo: 8,  activo: true,  creadoEn: '2025-01-01T00:00:00Z', actualizadoEn: '2025-06-01T00:00:00Z' },
    { id: 'p7',  codigoBarras: '7791813410015', nombre: 'Detergente Magistral 750ml', descripcion: 'Detergente limón 750ml',   categoria: 'limpieza',  precioCosto: 650,  precioVenta: 1050, stock: 15,  stockMinimo: 6,  activo: true,  creadoEn: '2025-01-01T00:00:00Z', actualizadoEn: '2025-06-01T00:00:00Z' },
    { id: 'p8',  codigoBarras: '7792222100012', nombre: 'Pan Lactal Bimbo',        descripcion: 'Pan de miga 320g',            categoria: 'panaderia', precioCosto: 700,  precioVenta: 1150, stock: 10,  stockMinimo: 5,  activo: true,  creadoEn: '2025-01-01T00:00:00Z', actualizadoEn: '2025-06-01T00:00:00Z' },
    { id: 'p9',  codigoBarras: '7790164000019', nombre: 'Aceite Cocinero 900ml',   descripcion: 'Aceite de girasol 900ml',     categoria: 'otros',     precioCosto: 1200, precioVenta: 1900, stock: 0,   stockMinimo: 5,  activo: true,  creadoEn: '2025-01-01T00:00:00Z', actualizadoEn: '2025-06-01T00:00:00Z' },
    { id: 'p10', codigoBarras: '7793444000101', nombre: 'Jabón Dove Original',     descripcion: 'Jabón en barra 90g',          categoria: 'limpieza',  precioCosto: 400,  precioVenta: 700,  stock: 30,  stockMinimo: 10, activo: false, creadoEn: '2025-01-01T00:00:00Z', actualizadoEn: '2025-06-01T00:00:00Z' },
];

// ── Ventas ────────────────────────────────────────────────────────────────────

export const MOCK_VENTAS: IVenta[] = [
    {
        id: 'v1', numeroTicket: '00001', cajeroId: 'u3', cajeroNombre: 'Juan Cajero',
        fecha: '2026-02-18T09:15:00Z', metodoPago: 'efectivo', anulada: false,
        subtotal: 3900, descuentoGlobal: 0, total: 3900,
        items: [
            { productoId: 'p1', productoNombre: 'Coca Cola 500ml', codigoBarras: '7790895000107', cantidad: 2, precioUnitario: 1200, descuento: 0, subtotal: 2400 },
            { productoId: 'p5', productoNombre: 'Leche La Serenísima 1L', codigoBarras: '7790040510016', cantidad: 1, precioUnitario: 1400, descuento: 0, subtotal: 1400 },
            { productoId: 'p6', productoNombre: 'Yogur Activia Natural', codigoBarras: '7790040510023', cantidad: 1, precioUnitario: 850, descuento: 10, subtotal: 765 },
        ],
    },
    {
        id: 'v2', numeroTicket: '00002', cajeroId: 'u3', cajeroNombre: 'Juan Cajero',
        fecha: '2026-02-18T10:30:00Z', metodoPago: 'debito', anulada: false,
        subtotal: 2300, descuentoGlobal: 0, total: 2300,
        items: [
            { productoId: 'p3', productoNombre: 'Alfajor Milka', codigoBarras: '7791234500031', cantidad: 3, precioUnitario: 600, descuento: 0, subtotal: 1800 },
            { productoId: 'p8', productoNombre: 'Pan Lactal Bimbo', codigoBarras: '7792222100012', cantidad: 1, precioUnitario: 1150, descuento: 0, subtotal: 1150 },
        ],
    },
    {
        id: 'v3', numeroTicket: '00003', cajeroId: 'u2', cajeroNombre: 'María Supervisora',
        fecha: '2026-02-18T11:45:00Z', metodoPago: 'qr', anulada: false,
        subtotal: 5750, descuentoGlobal: 5, total: 5462,
        items: [
            { productoId: 'p4', productoNombre: 'Caja Alfajor Milka x20', codigoBarras: '7791234500048', cantidad: 1, precioUnitario: 9500, descuento: 0, subtotal: 9500 },
        ],
    },
    {
        id: 'v4', numeroTicket: '00004', cajeroId: 'u3', cajeroNombre: 'Juan Cajero',
        fecha: '2026-02-17T15:00:00Z', metodoPago: 'efectivo', anulada: true,
        subtotal: 1200, descuentoGlobal: 0, total: 1200,
        items: [
            { productoId: 'p1', productoNombre: 'Coca Cola 500ml', codigoBarras: '7790895000107', cantidad: 1, precioUnitario: 1200, descuento: 0, subtotal: 1200 },
        ],
    },
    {
        id: 'v5', numeroTicket: '00005', cajeroId: 'u3', cajeroNombre: 'Juan Cajero',
        fecha: '2026-02-17T16:20:00Z', metodoPago: 'credito', anulada: false,
        subtotal: 3800, descuentoGlobal: 0, total: 3800,
        items: [
            { productoId: 'p7', productoNombre: 'Detergente Magistral 750ml', codigoBarras: '7791813410015', cantidad: 2, precioUnitario: 1050, descuento: 0, subtotal: 2100 },
            { productoId: 'p9', productoNombre: 'Aceite Cocinero 900ml', codigoBarras: '7790164000019', cantidad: 1, precioUnitario: 1900, descuento: 0, subtotal: 1900 },
        ],
    },
];

// ── Proveedores ────────────────────────────────────────────────────────────────

export const MOCK_PROVEEDORES: IProveedor[] = [
    {
        id: 'prov1', razonSocial: 'Distribuidora Norte S.A.', cuit: '30-71234567-8',
        direccion: 'Av. Corrientes 1234, CABA', activo: true, creadoEn: '2024-11-01T00:00:00Z',
        contactos: [
            { nombre: 'Roberto Gómez', telefono: '11-4567-8901', email: 'roberto@distnorte.com', cargo: 'Vendedor' },
            { nombre: 'Laura Martínez', telefono: '11-4567-8902', email: 'laura@distnorte.com', cargo: 'Administración' },
        ],
    },
    {
        id: 'prov2', razonSocial: 'Nestlé Argentina S.A.', cuit: '30-50012345-6',
        direccion: 'Ruta 9 Km 120, Pilar', activo: true, creadoEn: '2024-09-15T00:00:00Z',
        contactos: [
            { nombre: 'Federico Torres', telefono: '0800-333-6321', email: 'ftorres@nestle.com.ar', cargo: 'Ejecutivo de Cuenta' },
        ],
    },
    {
        id: 'prov3', razonSocial: 'Quilmes Distribución', cuit: '30-69876543-2',
        direccion: 'Calle del Parque 500, Quilmes', activo: false, creadoEn: '2024-06-01T00:00:00Z',
        contactos: [],
    },
];

// ── Cierre de Caja ────────────────────────────────────────────────────────────

export const MOCK_CIERRES: ICierreCaja[] = [
    {
        id: 'cc1', fecha: '2026-02-17T23:59:00Z', cajeroId: 'u3', cajeroNombre: 'Juan Cajero',
        efectivoContado: 15500, efectivoEsperado: 15000, diferencia: 500,
        totalTarjeta: 8200, totalQR: 3800, totalVentas: 27000, cantidadVentas: 12,
        items: [
            { denominacion: 10000, cantidad: 1 },
            { denominacion: 1000,  cantidad: 5 },
            { denominacion: 500,   cantidad: 1 },
        ],
        cerradoPor: 'María Supervisora', observaciones: '',
    },
];

// ── Movimientos de stock ───────────────────────────────────────────────────────

export const MOCK_MOVIMIENTOS: IMovimientoStock[] = [
    { id: 'm1', productoId: 'p3', productoNombre: 'Alfajor Milka', tipo: 'salida',  cantidad: 3,  stockAnterior: 8,  stockNuevo: 5,   motivo: 'Venta #00002', usuarioId: 'u3', fecha: '2026-02-18T10:30:00Z' },
    { id: 'm2', productoId: 'p4', productoNombre: 'Caja Alfajor x20', tipo: 'desarme', cantidad: 20, stockAnterior: 1, stockNuevo: 0, motivo: 'Desarme manual',  usuarioId: 'u2', fecha: '2026-02-18T11:00:00Z' },
    { id: 'm3', productoId: 'p3', productoNombre: 'Alfajor Milka', tipo: 'entrada', cantidad: 20, stockAnterior: 5,  stockNuevo: 25,  motivo: 'Desarme caja x20', usuarioId: 'u2', fecha: '2026-02-18T11:00:00Z' },
    { id: 'm4', productoId: 'p9', productoNombre: 'Aceite Cocinero 900ml', tipo: 'salida', cantidad: 2, stockAnterior: 2, stockNuevo: 0, motivo: 'Venta #00005', usuarioId: 'u3', fecha: '2026-02-17T16:20:00Z' },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

export function formatARS(value: number): string {
    return new Intl.NumberFormat('es-AR', {
        style: 'currency', currency: 'ARS', minimumFractionDigits: 2,
    }).format(value);
}
