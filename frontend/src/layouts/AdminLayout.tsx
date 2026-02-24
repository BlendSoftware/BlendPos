import { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
    Group, Text, Badge, Avatar, Menu, Burger,
    Tooltip, Divider,
} from '@mantine/core';
import {
    Package, Boxes, Truck, FileText,
    Users, Calculator, LogOut, ChevronRight, Home,
    BarChart2, Tag,
} from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import styles from './AdminLayout.module.css';

// ── Nav items ────────────────────────────────────────────────────────────────

interface NavItem {
    label: string;
    path: string;
    icon: React.ReactNode;
    roles?: string[];
}

const NAV_ITEMS: NavItem[] = [
    { label: 'Dashboard',       path: '/admin/dashboard',    icon: <BarChart2 size={18} /> },
    { label: 'Productos',       path: '/admin/productos',    icon: <Package size={18} /> },
    { label: 'Categorías',      path: '/admin/categorias',   icon: <Tag size={18} /> },
    { label: 'Inventario',      path: '/admin/inventario',   icon: <Boxes size={18} /> },
    { label: 'Proveedores',     path: '/admin/proveedores',  icon: <Truck size={18} /> },
    { label: 'Facturación',     path: '/admin/facturacion',  icon: <FileText size={18} /> },
    { label: 'Cierre de Caja',  path: '/admin/cierre-caja', icon: <Calculator size={18} /> },
    { label: 'Usuarios',        path: '/admin/usuarios',     icon: <Users size={18} />, roles: ['admin', 'supervisor'] },
];

// ── Rol colors ────────────────────────────────────────────────────────────────

const ROL_COLOR: Record<string, string> = {
    admin: 'red', supervisor: 'yellow', cajero: 'teal',
};

// ── Component ─────────────────────────────────────────────────────────────────

export function AdminLayout() {
    const [opened, setOpened] = useState(false);
    const { user, logout } = useAuthStore();
    const navigate = useNavigate();
    const location = useLocation();

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    return (
        <div className={styles.shell}>
            <div
                className={`${styles.overlay} ${opened ? styles.overlayOpen : ''}`}
                onClick={() => setOpened(false)}
                aria-hidden
            />

            <aside className={`${styles.sidebar} ${opened ? styles.sidebarOpen : ''}`}>
                <div className={styles.navHeader}>
                    <Text className={styles.brand}>BlendPOS</Text>
                    <Text className={styles.brandSub}>Sistema de Gestión</Text>
                </div>

                <Divider my="xs" color="dark.6" />
                <div className={styles.navSectionLabel}>Navegación</div>

                {NAV_ITEMS
                    .filter((item) => !item.roles || item.roles.includes(user?.rol ?? ''))
                    .map((item) => {
                        const isActive = location.pathname === item.path ||
                            (item.path !== '/' && location.pathname.startsWith(item.path));
                        return (
                            <button
                                key={item.path}
                                className={`${styles.navLink} ${isActive ? styles.navLinkActive : ''}`}
                                onClick={() => { navigate(item.path); setOpened(false); }}
                            >
                                {item.icon}
                                {item.label}
                            </button>
                        );
                    })
                }

                <div style={{ flex: 1 }} />
                <div className={styles.navSection}>
                    <Tooltip label="Ir al Terminal POS" position="right" withArrow>
                        <button
                            className={styles.navLink}
                            onClick={() => navigate('/')}
                        >
                            <Home size={18} />
                            Volver al POS
                        </button>
                    </Tooltip>                    <Divider my="md" color="dark.6" />                    <button className={styles.navLinkDanger} onClick={handleLogout}>
                        <LogOut size={18} />
                        Cerrar sesión
                    </button>
                </div>
            </aside>

            <section className={styles.main}>
                <header className={styles.header}>
                    <Group gap="sm">
                        <Burger
                            opened={opened}
                            onClick={() => setOpened((o) => !o)}
                            hiddenFrom="sm"
                            size="sm"
                        />
                        <Text fw={700} size="sm" c="dimmed">
                            BlendPOS — Panel de Administración
                        </Text>
                    </Group>

                    <div className={styles.userMenu}>
                        <Badge
                            className={styles.rolBadge}
                            color={ROL_COLOR[user?.rol ?? 'cajero']}
                            variant="light"
                            size="sm"
                        >
                            {user?.rol}
                        </Badge>

                        <Menu shadow="md" width={200} position="bottom-end">
                            <Menu.Target>
                                <Group gap="xs" style={{ cursor: 'pointer' }}>
                                    <Avatar size="sm" radius="xl" color="blue">
                                        {user?.nombre.charAt(0).toUpperCase()}
                                    </Avatar>
                                    <Text size="sm" fw={500} visibleFrom="sm">
                                        {user?.nombre.split(' ')[0]}
                                    </Text>
                                    <ChevronRight size={14} />
                                </Group>
                            </Menu.Target>
                            <Menu.Dropdown>
                                <Menu.Label>{user?.email}</Menu.Label>
                                <Menu.Divider />
                                <Menu.Item
                                    color="red"
                                    leftSection={<LogOut size={14} />}
                                    onClick={handleLogout}
                                >
                                    Cerrar sesión
                                </Menu.Item>
                            </Menu.Dropdown>
                        </Menu>
                    </div>
                </header>

                <main className={styles.content}>
                    <Outlet />
                </main>
            </section>
        </div>
    );
}
