import { useEffect, useState } from 'react';
import { Group, Text, Badge, Flex, Tooltip, ActionIcon } from '@mantine/core';
import { Wifi, WifiOff, User, Printer, PanelLeftOpen, Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { notifications } from '@mantine/notifications';
import { useAuthStore } from '../../store/useAuthStore';
import { thermalPrinter } from '../../services/ThermalPrinterService';
import { useSyncStatus } from '../../hooks/useSyncStatus';
import { usePrinterStore } from '../../store/usePrinterStore';
import { PrinterSettingsModal } from './PrinterSettingsModal';
import styles from './PosHeader.module.css';

const ROL_COLOR: Record<string, string> = {
    admin: 'red',
    supervisor: 'yellow',
    cajero: 'teal',
};

export function PosHeader() {
    const [time, setTime] = useState(new Date());
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [printerConnected, setPrinterConnected] = useState(thermalPrinter.isConnected);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const { pending: syncPending, error: syncError } = useSyncStatus();

    const { user, hasRole } = useAuthStore();
    const { config: printerConfig } = usePrinterStore();
    const navigate = useNavigate();

    useEffect(() => {
        const interval = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        // Auto-reconexión a puertos ya autorizados (no requiere click)
        thermalPrinter.autoConnectIfPossible(printerConfig.baudRate)
            .then((ok) => setPrinterConnected(ok))
            .catch(() => setPrinterConnected(false));
    }, []);

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
        } else {
            const ok = await thermalPrinter.connect(printerConfig.baudRate);
            setPrinterConnected(ok);
            if (ok) {
                notifications.show({
                    title: 'Impresora conectada',
                    message: 'Lista para imprimir tickets ESC/POS.',
                    color: 'teal',
                    icon: <Printer size={14} />,
                });
            } else {
                notifications.show({
                    title: 'No se pudo conectar',
                    message: 'El navegador no soporta Web Serial o el usuario canceló. Los tickets se mostrarán en consola.',
                    color: 'orange',
                    icon: <Printer size={14} />,
                    autoClose: 5000,
                });
            }
        }
    };

    const formattedTime = time.toLocaleTimeString('es-AR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    });

    const formattedDate = time.toLocaleDateString('es-AR', {
        weekday: 'short',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    });

    return (
        <header className={styles.header}>
            <PrinterSettingsModal opened={settingsOpen} onClose={() => setSettingsOpen(false)} />
            <Flex align="center" justify="space-between" h="100%" px="lg">
                <Group gap="sm">
                    <Text fw={800} size="xl" c="white" ff="monospace">
                        BLEND
                    </Text>
                    <Text fw={300} size="xl" c="dimmed">
                        POS
                    </Text>
                </Group>

                <Group gap="xs">
                    <User size={18} color="#909296" />
                    <Text size="sm" c="dimmed">Cajero:</Text>
                    <Text size="sm" fw={600} c="white">
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
                    <Text size="sm" c="dimmed" ml="md">Terminal #01</Text>
                </Group>

                <Group gap="md">
                    {/* Printer connect button */}
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

                    {/* Printer settings button */}
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

                    {/* Admin panel link (only for admin/supervisor) */}
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

                    {(syncPending > 0 || syncError > 0) && (
                        <Badge
                            color={syncError > 0 ? 'red' : 'yellow'}
                            size="lg"
                            variant="light"
                        >
                            <Group gap={6}>
                                <span>Sync</span>
                                <span>{syncPending}</span>
                                {syncError > 0 && <span>/ {syncError} err</span>}
                            </Group>
                        </Badge>
                    )}

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
                    <div className={styles.clock}>
                        <Text size="lg" fw={700} c="white" ff="monospace">
                            {formattedTime}
                        </Text>
                        <Text size="xs" c="dimmed" ta="right">
                            {formattedDate}
                        </Text>
                    </div>
                </Group>
            </Flex>
        </header>
    );
}
