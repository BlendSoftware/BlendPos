import { ActionIcon, Tooltip, useMantineColorScheme } from '@mantine/core';
import { Sun, Moon } from 'lucide-react';

interface ThemeToggleProps {
    size?: string | number;
}

/**
 * Toggle entre modo oscuro y modo claro.
 * Persiste la preferencia en localStorage vía Mantine.
 */
export function ThemeToggle({ size = 'md' }: ThemeToggleProps) {
    const { colorScheme, toggleColorScheme } = useMantineColorScheme();
    const isDark = colorScheme === 'dark';

    return (
        <Tooltip
            label={isDark ? 'Modo claro' : 'Modo oscuro'}
            withArrow
            position="bottom"
        >
            <ActionIcon
                onClick={toggleColorScheme}
                variant="subtle"
                color={isDark ? 'yellow' : 'blue'}
                size={size}
                aria-label={isDark ? 'Activar modo claro' : 'Activar modo oscuro'}
            >
                {isDark ? <Sun size={16} /> : <Moon size={16} />}
            </ActionIcon>
        </Tooltip>
    );
}
