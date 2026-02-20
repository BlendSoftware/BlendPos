import { Component, type ReactNode, type ErrorInfo } from 'react';
import { Center, Stack, Title, Text, Button, Code } from '@mantine/core';
import { AlertTriangle } from 'lucide-react';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error('[ErrorBoundary] Uncaught error:', error, info.componentStack);
    }

    render() {
        if (this.state.hasError) {
            return (
                <Center
                    h="100vh"
                    style={{ background: 'var(--mantine-color-dark-9)', flexDirection: 'column' }}
                >
                    <Stack align="center" gap="md" maw={500} ta="center" p="xl">
                        <AlertTriangle
                            size={64}
                            strokeWidth={1.5}
                            color="var(--mantine-color-red-5)"
                        />
                        <Title order={2} c="white">Algo salió mal</Title>
                        <Text c="dimmed" size="sm">
                            La aplicación encontró un error inesperado. Podés intentar recargar la página o contactar soporte si el problema persiste.
                        </Text>
                        {this.state.error?.message && (
                            <Code block style={{ maxWidth: '100%', fontSize: 12, textAlign: 'left' }}>
                                {this.state.error.message}
                            </Code>
                        )}
                        <Button
                            onClick={() => window.location.reload()}
                            color="blue"
                            mt="md"
                            size="md"
                        >
                            Recargar la página
                        </Button>
                    </Stack>
                </Center>
            );
        }

        return this.props.children;
    }
}
