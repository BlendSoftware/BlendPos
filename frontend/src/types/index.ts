// ─────────────────────────────────────────────────────────────────────────────
// BlendPOS — Interfaces de dominio
// Deben coincidir con los DTOs del backend Go (arquitectura.md)
// ─────────────────────────────────────────────────────────────────────────────

export type Rol = 'admin' | 'supervisor' | 'cajero';

export interface IUser {
    id: string;
    nombre: string;
    email: string;
    rol: Rol;
    activo: boolean;
    creadoEn: string; // ISO date
}

// ── Productos ────────────────────────────────────────────────────────────────

export type CategoriaProducto =
    | 'bebidas'
    | 'panaderia'
    | 'lacteos'
    | 'limpieza'
    | 'golosinas'
    | 'otros';

export interface IProducto {
    id: string;
    codigoBarras: string;
    nombre: string;
    descripcion: string;
    categoria: CategoriaProducto;
    precioCosto: number;
    precioVenta: number;
    stock: number;
    stockMinimo: number;
    activo: boolean;
    imagenUrl?: string;
    /** Si este producto es la variante "unitaria" de un padre tipo caja */
    padreId?: string;
    /** Cuántas unidades hijas contiene este producto (solo si es padre) */
    cantidadHija?: number;
    creadoEn: string;
    actualizadoEn: string;
}

// ── Inventario ───────────────────────────────────────────────────────────────

export interface IMovimientoStock {
    id: string;
    productoId: string;
    productoNombre: string;
    tipo: 'entrada' | 'salida' | 'ajuste' | 'desarme';
    cantidad: number;
    stockAnterior: number;
    stockNuevo: number;
    motivo: string;
    usuarioId: string;
    fecha: string;
}

// ── Ventas ───────────────────────────────────────────────────────────────────

export interface IItemVenta {
    productoId: string;
    productoNombre: string;
    codigoBarras: string;
    cantidad: number;
    precioUnitario: number;
    descuento: number; // %
    subtotal: number;
}

export interface IVenta {
    id: string;
    numeroTicket: string;
    items: IItemVenta[];
    subtotal: number;
    descuentoGlobal: number; // %
    total: number;
    metodoPago: 'efectivo' | 'debito' | 'credito' | 'qr' | 'mixto';
    /** Desglose de pagos cuando aplica (ej: mixto). */
    pagos?: Array<{ metodo: 'efectivo' | 'debito' | 'credito' | 'qr'; monto: number }>;
    /** Vuelto calculado (solo sobre efectivo). */
    vuelto?: number;
    cajeroId: string;
    cajeroNombre: string;
    fecha: string;
    anulada: boolean;
}

// ── Cierre de Caja ───────────────────────────────────────────────────────────

export interface IArqueoItem {
    denominacion: number; // ej: 1000, 500, 200...
    cantidad: number;
}

export interface ICierreCaja {
    id: string;
    fecha: string;
    cajeroId: string;
    cajeroNombre: string;
    efectivoContado: number;
    efectivoEsperado: number;
    diferencia: number; // positivo = sobrante, negativo = faltante
    totalTarjeta: number;
    totalQR: number;
    totalVentas: number;
    cantidadVentas: number;
    items: IArqueoItem[];
    cerradoPor?: string; // supervisor/admin
    observaciones?: string;
}

// ── Proveedores ──────────────────────────────────────────────────────────────

export interface IContactoProveedor {
    nombre: string;
    telefono: string;
    email: string;
    cargo?: string;
}

export interface IProveedor {
    id: string;
    razonSocial: string;
    cuit: string;
    direccion: string;
    contactos: IContactoProveedor[];
    activo: boolean;
    creadoEn: string;
}

// ── CSV Import ───────────────────────────────────────────────────────────────

export interface IFilaPrecioCSV {
    codigoBarras: string;
    nombre: string;
    precioActual: number;
    precioNuevo: number;
    diferencia: number;
    valido: boolean;
    error?: string;
}
