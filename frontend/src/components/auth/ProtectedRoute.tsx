import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuthStore } from '../../store/useAuthStore';
import type { Rol } from '../../types';

interface ProtectedRouteProps {
    children: ReactNode;
    /** Si se especifica, solo esos roles pueden acceder. Vacío = cualquier usuario autenticado. */
    roles?: Rol[];
}

export function ProtectedRoute({ children, roles = [] }: ProtectedRouteProps) {
    const { isAuthenticated, hasRole } = useAuthStore();
    const location = useLocation();

    if (!isAuthenticated) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    if (roles.length > 0 && !hasRole(roles)) {
        return <Navigate to="/" replace />;
    }

    return <>{children}</>;
}
