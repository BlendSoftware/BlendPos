import { useEffect, useState, memo } from 'react';
import { Group, Text, Badge, Flex, Tooltip, ActionIcon, Modal, Button, useMantineColorScheme } from '@mantine/core';
import { Wifi, WifiOff, User, Printer, PanelLeftOpen, Settings, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { notifications } from '@mantine/notifications';
import { useAuthStore } from '../../store/useAuthStore';
import { thermalPrinter } from '../../services/ThermalPrinterService';
import { useSyncStatus } from '../../hooks/useSyncStatus';
import { usePrinterStore } from '../../store/usePrinterStore';
import { useCajaStore } from '../../store/useCajaStore';
import { PrinterSettingsModal } from './PrinterSettingsModal';
import { ThemeToggle } from '../ThemeToggle';
import styles from './PosHeader.module.css';

const Clock = memo(function Clock() {
    const [time, setTime] = useState(new Date());
    const { colorScheme } = useMantineColorScheme();
    const isDark = colorScheme === 'dark';

    useEffect(() => {
        const interval = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(interval);
    }, []);

    const formattedTime = time.toLocaleTimeString('es-AR', {
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    });
    const formattedDate = time.toLocaleDateString('es-AR', {
        weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric',
    });

    return (
        <div className={styles.clock}>
            <Text size="lg" fw={700} c={isDark ? 'white' : 'dark.7'} ff="monospace">
                {formattedTime}
            </Text>
            <Text size="xs" c="dimmed" ta="right">
                {formattedDate}
            </Text>
        </div>
    );
});

const ROL_COLOR: Record<string, string> = {
    admin: 'red',
    supervisor: 'yellow',
    cajero: 'teal',
};

export function PosHeader() {
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [printerConnected, setPrinterConnected] = useState(thermalPrinter.isConnected);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
    const { pending: syncPending, syncState } = useSyncStatus();

    const { user, hasRole, logout } = useAuthStore();
    const { config: printerConfig } = usePrinterStore();
    const { limpiar: limpiarCaja } = useCajaStore();
    const navigate = useNavigate();
    const { colorScheme } = useMantineColorScheme();
    const isDark = colorScheme === 'dark';

    useEffect(() => {
        thermalPrinter.autoConnectIfPossible(printerConfig.baudRate)
            .then((ok) => setPrinterConnected(ok))
            .catch(() => setPrinterConnected(false));
    }, [printerConfig.baudRate]);

    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    const handlePrinterToggle = async () => {
        if (printerConnected) {
            await thermalPrinter.disconnect();
            setPrinterConnected(false);
            notifications.show({
                title: 'Impresora desconectada',
                message: 'Se cerró la conexión con la impresora térmica.',
                color: 'gray',
                icon: <Printer size={14} />,
            });
            return;
        }

        const ok = await thermalPrinter.connect(printerConfig.baudRate);
        setPrinterConnected(ok);

        if (ok) {
            notifications.show({
                title: 'Impresora conectada',
                message: 'Lista para imprimir tickets ESC/POS.',
                color: 'teal',
                icon: <Printer size={14} />,
            });
            return;
        }

        notifications.show({
            title: 'No se pudo conectar',
            message: 'El navegador no soporta Web Serial o el usuario canceló. Los tickets se mostrarán en consola.',
            color: 'orange',
            icon: <Printer size={14} />,
            autoClose: 5000,
        });
    };

    return (
        <header className={styles.header}>
            <PrinterSettingsModal opened={settingsOpen} onClose={() => setSettingsOpen(false)} />

            <Modal
                opened={logoutConfirmOpen}
                onClose={() => setLogoutConfirmOpen(false)}
                title="¿Cerrar sesión?"
                centered
                size="sm"
            >
                <Text size="sm" c="dimmed" mb="lg">
                    ¿Estás seguro que querés cerrar sesión?
                </Text>
                <Group justify="flex-end" gap="sm">
                    <Button variant="default" autoFocus onClick={() => setLogoutConfirmOpen(false)}>
                        Cancelar
                    </Button>
                    <Button
                        color="red"
                        onClick={async () => {
                            setLogoutConfirmOpen(false);
                            limpiarCaja();
                            await logout();
                            navigate('/login');
                        }}
                    >
                        Sí, cerrar sesión
                    </Button>
                </Group>
            </Modal>

            <Flex align="center" justify="space-between" h="100%" px="lg">
                <Text className={styles.brand}>blendPOS</Text>

                <Group gap="xs">
                    <User size={18} color="#909296" />
                    <Text size="sm" c="dimmed">Cajero:</Text>
                    <Text size="sm" fw={600} c={isDark ? 'white' : 'dark.7'}>
                        {user?.nombre ?? 'Cargándose…'}
                    </Text>
                    {user?.rol && (
                        <Badge
                            color={ROL_COLOR[user.rol] ?? 'gray'}
                            size="xs"
                            variant="light"
                        >
                            {user.rol}
                        </Badge>
                    )}
                    <Text size="sm" c="dimmed" ml="md">
                        Terminal #{user?.puntoDeVenta != null
                            ? String(user.puntoDeVenta).padStart(2, '0')
                            : 'POS'}
                    </Text>
                </Group>

                <Group gap="md">
                    <Tooltip
                        label={printerConnected ? 'Desconectar impresora' : 'Conectar impresora térmica'}
                        withArrow
                    >
                        <ActionIcon
                            variant={printerConnected ? 'filled' : 'subtle'}
                            color={printerConnected ? 'teal' : 'gray'}
                            size="md"
                            onClick={handlePrinterToggle}
                        >
                            <Printer size={16} />
                        </ActionIcon>
                    </Tooltip>

                    <Tooltip label="Configuración de impresora" withArrow>
                        <ActionIcon
                            variant="subtle"
                            color="gray"
                            size="md"
                            onClick={() => setSettingsOpen(true)}
                        >
                            <Settings size={16} />
                        </ActionIcon>
                    </Tooltip>

                    {hasRole(['admin', 'supervisor']) && (
                        <Tooltip label="Panel Admin" withArrow>
                            <ActionIcon
                                variant="subtle"
                                color="blue"
                                size="md"
                                onClick={() => navigate('/admin/dashboard')}
                            >
                                <PanelLeftOpen size={16} />
                            </ActionIcon>
                        </Tooltip>
                    )}

                    <ThemeToggle size="md" />

                    <div style={{ width: 1, height: 24, background: 'var(--mantine-color-default-border)', margin: '0 8px' }} />
                    <Tooltip label="Cerrar sesión" withArrow>
                        <ActionIcon
                            variant="light"
                            color="red"
                            size="md"
                            onClick={() => setLogoutConfirmOpen(true)}
                        >
                            <LogOut size={16} />
                        </ActionIcon>
                    </Tooltip>

                    {syncPending > 0 ? (
                        <Tooltip
                            label={
                                syncState === 'syncing'
                                    ? 'Sincronizando con el servidor…'
                                    : `${syncPending} venta${syncPending !== 1 ? 's' : ''} pendiente${syncPending !== 1 ? 's' : ''} de sincronizar`
                            }
                            withArrow
                        >
                            <Badge color="yellow" size="lg" variant="light">
                                <Group gap={6}>
                                    <span>{syncState === 'syncing' ? '⟳ Sync' : 'Sync'}</span>
                                    <span>{syncPending}</span>
                                </Group>
                            </Badge>
                        </Tooltip>
                    ) : null}

                    <Badge
                        color={isOnline ? 'green' : 'red'}
                        size="lg"
                        variant="light"
                    >
                        <Group gap={4}>
                            {isOnline ? <Wifi size={12} /> : <WifiOff size={12} />}
                            <span>{isOnline ? 'Conectado' : 'Sin conexión'}</span>
                        </Group>
                    </Badge>
                    <Clock />
                </Group>
            </Flex>
        </header>
    );
}
