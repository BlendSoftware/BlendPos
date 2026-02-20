import { Group, Text, Kbd, Flex } from '@mantine/core';
import styles from './HotkeysFooter.module.css';

interface HotkeyHint {
    key: string;
    label: string;
}

const HOTKEYS: HotkeyHint[] = [
    { key: 'F2', label: 'Buscar' },
    { key: 'F3', label: 'Desc. ítem' },
    { key: 'F5', label: 'Consultar $ ' },
    { key: 'F7', label: 'Historial' },
    { key: 'F8', label: 'Desc. global' },
    { key: 'F10', label: 'Cobrar' },
    { key: 'ESC', label: 'Cancelar' },
];

export function HotkeysFooter() {
    return (
        <footer className={styles.footer}>
            <Flex align="center" justify="center" h="100%" gap="xl" px="lg">
                {HOTKEYS.map((hotkey, index) => (
                    <Group key={hotkey.key} gap="xs">
                        <Kbd className={styles.kbd}>{hotkey.key}</Kbd>
                        <Text size="xs" c="dimmed">
                            {hotkey.label}
                        </Text>
                        {index < HOTKEYS.length - 1 && (
                            <Text size="xs" c="dimmed" ml="sm" opacity={0.3}>
                                |
                            </Text>
                        )}
                    </Group>
                ))}
            </Flex>
        </footer>
    );
}
