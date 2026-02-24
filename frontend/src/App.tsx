import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

// Error boundary
import { ErrorBoundary } from './components/ErrorBoundary';

// Auth
import { ProtectedRoute } from './components/auth/ProtectedRoute';

// Layouts
import { AdminLayout } from './layouts/AdminLayout';

// Páginas públicas / auth
import { LoginPage } from './pages/admin/LoginPage';
import { ConsultaPreciosPage } from './pages/admin/ConsultaPreciosPage';

// POS Terminal (ya existente)
import { PosTerminal } from './pages/PosTerminal';

// Admin pages
import { DashboardPage }        from './pages/admin/DashboardPage';
import { GestionProductosPage } from './pages/admin/GestionProductosPage';
import { InventarioPage }        from './pages/admin/InventarioPage';
import { ProveedoresPage }       from './pages/admin/ProveedoresPage';
import { FacturacionPage }       from './pages/admin/FacturacionPage';
import { CierreCajaPage }        from './pages/admin/CierreCajaPage';
import { UsuariosPage }          from './pages/admin/UsuariosPage';
import { CategoriasPage }        from './pages/admin/CategoriasPage';

function App() {
    return (
        <ErrorBoundary>
            <BrowserRouter>
                <Routes>
                    {/* ── Rutas públicas ─────────────────────────────────── */}
                    <Route path="/login"    element={<LoginPage />} />
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
                        <Route path="dashboard"   element={<DashboardPage />} />
                        <Route path="productos"   element={<GestionProductosPage />} />
                        <Route path="inventario"  element={<InventarioPage />} />
                        <Route path="proveedores" element={<ProveedoresPage />} />
                        <Route path="categorias"  element={<CategoriasPage />} />
                        <Route path="facturacion" element={<FacturacionPage />} />
                        <Route path="cierre-caja" element={<CierreCajaPage />} />

                        {/* Solo admin y supervisor */}
                        <Route
                            path="usuarios"
                            element={
                                <ProtectedRoute roles={['admin', 'supervisor']}>
                                    <UsuariosPage />
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
