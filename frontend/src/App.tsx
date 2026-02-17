import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'

// Pages (stubs — implemented per phase)
import LoginPage from '@/pages/Login'
import POSPage from '@/pages/POS'
import CierreCajaPage from '@/pages/CierreCaja'
import ProductosPage from '@/pages/Productos'
import InventarioPage from '@/pages/Inventario'
import ProveedoresPage from '@/pages/Proveedores'
import FacturacionPage from '@/pages/Facturacion'
import UsuariosPage from '@/pages/Usuarios'
import ConsultaPreciosPage from '@/pages/ConsultaPrecios'

function PrivateRoute({ children, roles }: { children: React.ReactNode; roles?: string[] }) {
  const { user, isLoading } = useAuth()
  if (isLoading) return <div className="flex items-center justify-center h-screen">Cargando...</div>
  if (!user) return <Navigate to="/login" replace />
  if (roles && !roles.includes(user.rol)) return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/consulta" element={<ConsultaPreciosPage />} />
        <Route path="/" element={<PrivateRoute><POSPage /></PrivateRoute>} />
        <Route path="/cierre" element={<PrivateRoute roles={['supervisor','administrador']}><CierreCajaPage /></PrivateRoute>} />
        <Route path="/productos" element={<PrivateRoute roles={['supervisor','administrador']}><ProductosPage /></PrivateRoute>} />
        <Route path="/inventario" element={<PrivateRoute roles={['supervisor','administrador']}><InventarioPage /></PrivateRoute>} />
        <Route path="/proveedores" element={<PrivateRoute roles={['administrador']}><ProveedoresPage /></PrivateRoute>} />
        <Route path="/facturacion" element={<PrivateRoute roles={['administrador']}><FacturacionPage /></PrivateRoute>} />
        <Route path="/usuarios" element={<PrivateRoute roles={['administrador']}><UsuariosPage /></PrivateRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
