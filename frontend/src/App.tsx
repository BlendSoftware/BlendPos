import { useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Center, Loader } from '@mantine/core';

// Error boundary
import { ErrorBoundary } from './components/ErrorBoundary';
import { RouteErrorBoundary } from './components/RouteErrorBoundary';

// Auth
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { useAuthStore } from './store/useAuthStore';

// Layouts
import { AdminLayout } from './layouts/AdminLayout';

// Páginas públicas / auth — se cargan siempre, son críticas
import { LoginPage } from './pages/admin/LoginPage';
import { ConsultaPreciosPage } from './pages/admin/ConsultaPreciosPage';

// POS Terminal — siempre cargado (ruta principal del cajero)
import { PosTerminal } from './pages/PosTerminal';

// Admin pages — lazy loaded (solo se descargan al navegar)
const DashboardPage = lazy(() => import('./pages/admin/DashboardPage').then(m => ({ default: m.DashboardPage })));
const GestionProductosPage = lazy(() => import('./pages/admin/GestionProductosPage').then(m => ({ default: m.GestionProductosPage })));
const InventarioPage = lazy(() => import('./pages/admin/InventarioPage').then(m => ({ default: m.InventarioPage })));
const ProveedoresPage = lazy(() => import('./pages/admin/ProveedoresPage').then(m => ({ default: m.ProveedoresPage })));
const FacturacionPage = lazy(() => import('./pages/admin/FacturacionPage').then(m => ({ default: m.FacturacionPage })));
const CierreCajaPage = lazy(() => import('./pages/admin/CierreCajaPage').then(m => ({ default: m.CierreCajaPage })));
const UsuariosPage = lazy(() => import('./pages/admin/UsuariosPage').then(m => ({ default: m.UsuariosPage })));
const CategoriasPage = lazy(() => import('./pages/admin/CategoriasPage').then(m => ({ default: m.CategoriasPage })));
const ComprasPage = lazy(() => import('./pages/admin/ComprasPage').then(m => ({ default: m.ComprasPage })));
const NuevaCompraPage = lazy(() => import('./pages/admin/NuevaCompraPage').then(m => ({ default: m.NuevaCompraPage })));
const DetalleCompraPage = lazy(() => import('./pages/admin/DetalleCompraPage').then(m => ({ default: m.DetalleCompraPage })));
const GuiaAfipPage = lazy(() => import('./pages/admin/GuiaAfipPage').then(m => ({ default: m.GuiaAfipPage })));
const ConfiguracionFiscalPage = lazy(() => import('./pages/admin/ConfiguracionFiscalPage').then(m => ({ default: m.ConfiguracionFiscalPage })));

function LoadingSpinner() {
    return <Center h="100vh"><Loader size="xl" /></Center>;
}

function App() {
    // On mount, attempt a silent token refresh so the user stays logged in
    // after a hard page reload without re-entering credentials (P1-003).
    const initAuth = useAuthStore((s) => s.initAuth);
    useEffect(() => { void initAuth(); }, [initAuth]);

    return (
        <ErrorBoundary>
            <BrowserRouter>
                <Routes>
                    {/* ── Rutas públicas ─────────────────────────────────── */}
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/consulta" element={<ConsultaPreciosPage />} />

                    {/* ── Terminal POS (cualquier usuario autenticado) ────── */}
                    <Route
                        path="/"
                        element={
                            <ProtectedRoute>
                                <PosTerminal />
                            </ProtectedRoute>
                        }
                    />

                    {/* ── Panel Admin ───────────────────────────────────────  */}
                    <Route
                        path="/admin"
                        element={
                            <ProtectedRoute roles={['admin', 'supervisor']}>
                                <AdminLayout />
                            </ProtectedRoute>
                        }
                    >
                        <Route index element={<Navigate to="/admin/dashboard" replace />} />
                        <Route path="dashboard" element={
                            <RouteErrorBoundary>
                                <Suspense fallback={<LoadingSpinner />}>
                                    <DashboardPage />
                                </Suspense>
                            </RouteErrorBoundary>
                        } />
                        <Route path="productos" element={
                            <RouteErrorBoundary>
                                <Suspense fallback={<LoadingSpinner />}>
                                    <GestionProductosPage />
                                </Suspense>
                            </RouteErrorBoundary>
                        } />
                        <Route path="inventario" element={
                            <RouteErrorBoundary>
                                <Suspense fallback={<LoadingSpinner />}>
                                    <InventarioPage />
                                </Suspense>
                            </RouteErrorBoundary>
                        } />
                        <Route path="proveedores" element={
                            <RouteErrorBoundary>
                                <Suspense fallback={<LoadingSpinner />}>
                                    <ProveedoresPage />
                                </Suspense>
                            </RouteErrorBoundary>
                        } />
                        <Route path="categorias" element={
                            <RouteErrorBoundary>
                                <Suspense fallback={<LoadingSpinner />}>
                                    <CategoriasPage />
                                </Suspense>
                            </RouteErrorBoundary>
                        } />
                        <Route path="compras" element={
                            <RouteErrorBoundary>
                                <Suspense fallback={<LoadingSpinner />}>
                                    <ComprasPage />
                                </Suspense>
                            </RouteErrorBoundary>
                        } />
                        <Route path="compras/nueva" element={
                            <RouteErrorBoundary>
                                <Suspense fallback={<LoadingSpinner />}>
                                    <NuevaCompraPage />
                                </Suspense>
                            </RouteErrorBoundary>
                        } />
                        <Route path="compras/:id" element={
                            <RouteErrorBoundary>
                                <Suspense fallback={<LoadingSpinner />}>
                                    <DetalleCompraPage />
                                </Suspense>
                            </RouteErrorBoundary>
                        } />
                        <Route path="facturacion" element={
                            <RouteErrorBoundary>
                                <Suspense fallback={<LoadingSpinner />}>
                                    <FacturacionPage />
                                </Suspense>
                            </RouteErrorBoundary>
                        } />
                        <Route path="cierre-caja" element={
                            <RouteErrorBoundary>
                                <Suspense fallback={<LoadingSpinner />}>
                                    <CierreCajaPage />
                                </Suspense>
                            </RouteErrorBoundary>
                        } />
                        <Route path="guia-afip" element={
                            <RouteErrorBoundary>
                                <Suspense fallback={<LoadingSpinner />}>
                                    <GuiaAfipPage />
                                </Suspense>
                            </RouteErrorBoundary>
                        } />
                        <Route path="configuracion-fiscal" element={
                            <RouteErrorBoundary>
                                <Suspense fallback={<LoadingSpinner />}>
                                    <ConfiguracionFiscalPage />
                                </Suspense>
                            </RouteErrorBoundary>
                        } />

                        {/* Solo admin y supervisor */}
                        <Route
                            path="usuarios"
                            element={
                                <ProtectedRoute roles={['admin', 'supervisor']}>
                                    <RouteErrorBoundary>
                                        <Suspense fallback={<LoadingSpinner />}>
                                            <UsuariosPage />
                                        </Suspense>
                                    </RouteErrorBoundary>
                                </ProtectedRoute>
                            }
                        />
                    </Route>

                    {/* Catch-all */}
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </BrowserRouter>
        </ErrorBoundary>
    );
}

export default App;
