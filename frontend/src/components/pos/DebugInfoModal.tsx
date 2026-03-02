import { useState } from 'react';
import { Modal, Stack, Text, Group, Button, Code, Alert, Divider } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { RefreshCw, Trash, AlertCircle, Info } from 'lucide-react';
import { useSaleStore } from '../../store/useSaleStore';

interface DebugInfoModalProps {
    opened: boolean;
    onClose: () => void;
}

export function DebugInfoModal({ opened, onClose }: DebugInfoModalProps) {
    const [syncing, setSyncing] = useState(false);
    const ticketCounter = useSaleStore((s) => s.ticketCounter);
    const syncTicketCounter = useSaleStore((s) => s.syncTicketCounter);
    const historial = useSaleStore((s) => s.historial);

    const handleSync = async () => {
        setSyncing(true);
        try {
            await syncTicketCounter();
            notifications.show({
                title: 'Sincronización completa',
                message: 'Contador de tickets actualizado',
                color: 'green',
                autoClose: 3000,
            });
        } catch (error) {
            notifications.show({
                title: 'Error de sincronización',
                message: String(error),
                color: 'red',
                autoClose: 5000,
            });
        } finally {
            setSyncing(false);
        }
    };

    const handleResetLocalStorage = () => {
        if (confirm('¿Seguro que quieres resetear el localStorage? Esto borrará el historial local.')) {
            localStorage.removeItem('blendpos-sale');
            notifications.show({
                title: 'LocalStorage limpiado',
                message: 'Recarga la página para aplicar los cambios',
                color: 'orange',
                autoClose: 5000,
            });
        }
    };

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title="🔧 Información de Debug"
            size="md"
            centered
        >
            <Stack gap="md">
                <Alert icon={<Info size={16} />} color="blue" variant="light">
                    <Text size="xs">
                        Esta ventana muestra información técnica del sistema. Abre la consola del navegador
                        (F12 → Console) para ver logs detallados.
                    </Text>
                </Alert>

                <Divider label="Contador de Tickets" />
                
                <Group justify="space-between">
                    <Text size="sm" fw={500}>Contador actual:</Text>
                    <Code>{ticketCounter.toString().padStart(6, '0')}</Code>
                </Group>

                <Group justify="space-between">
                    <Text size="sm" fw={500}>Próximo ticket:</Text>
                    <Code>{(ticketCounter + 1).toString().padStart(6, '0')}</Code>
                </Group>

                <Group justify="space-between">
                    <Text size="sm" fw={500}>Ventas en historial:</Text>
                    <Code>{historial.length}</Code>
                </Group>

                <Button
                    leftSection={<RefreshCw size={16} />}
                    onClick={handleSync}
                    loading={syncing}
                    variant="light"
                    color="blue"
                    fullWidth
                >
                    Sincronizar con Backend
                </Button>

                <Divider label="Solución de Problemas" />

                <Alert icon={<AlertCircle size={16} />} color="orange" variant="light">
                    <Text size="xs" mb="sm">
                        <strong>Si el contador está desincronizado:</strong>
                    </Text>
                    <Text size="xs" component="ol" style={{ paddingLeft: '1.2rem', margin: 0 }}>
                        <li>Presiona "Sincronizar con Backend" arriba</li>
                        <li>Verifica la consola del navegador (F12) para ver los logs</li>
                        <li>Si persiste, limpia el localStorage y recarga</li>
                    </Text>
                </Alert>

                <Button
                    leftSection={<Trash size={16} />}
                    onClick={handleResetLocalStorage}
                    variant="outline"
                    color="red"
                    fullWidth
                >
                    Limpiar LocalStorage (Requiere Recarga)
                </Button>

                <Divider label="Email" />

                <Alert icon={<Info size={16} />} color="blue" variant="light">
                    <Text size="xs">
                        <strong>Para que funcione el envío de emails:</strong>
                    </Text>
                    <Text size="xs" component="ol" style={{ paddingLeft: '1.2rem', margin: '8px 0 0 0' }}>
                        <li>El servidor backend debe tener configuradas las variables de entorno SMTP</li>
                        <li>Variables requeridas: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD</li>
                        <li>El worker de emails debe estar activo (EMAIL_WORKERS &gt; 0)</li>
                        <li>Consulta con el administrador del sistema para verificar la configuración</li>
                    </Text>
                </Alert>

                <Divider label="Impresión" />

                <Alert icon={<Info size={16} />} color="cyan" variant="light">
                    <Text size="xs">
                        <strong>Para imprimir correctamente:</strong>
                    </Text>
                    <Text size="xs" component="ol" style={{ paddingLeft: '1.2rem', margin: '8px 0 0 0' }}>
                        <li>Asegúrate de permitir ventanas emergentes (popups) en tu navegador</li>
                        <li>El botón "Imprimir" abrirá el diálogo nativo del navegador</li>
                        <li>Selecciona tu impresora y ajusta las opciones según necesites</li>
                        <li>Si no se abre el diálogo, verifica que los popups no estén bloqueados</li>
                    </Text>
                </Alert>

                <Button
                    variant="subtle"
                    color="gray"
                    onClick={onClose}
                    fullWidth
                >
                    Cerrar
                </Button>
            </Stack>
        </Modal>
    );
}
