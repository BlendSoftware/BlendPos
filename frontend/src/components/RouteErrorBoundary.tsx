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

/**
 * Route-level error boundary — isolates crashes to a single page
 * so that other routes (POS, Dashboard, etc.) keep working.
 */
export class RouteErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error('[RouteErrorBoundary] Uncaught error:', error, info.componentStack);
    }

    render() {
        if (this.state.hasError) {
            return (
                <Center h="100%" py="xl">
                    <Stack align="center" gap="md" maw={500} ta="center" p="xl">
                        <AlertTriangle
                            size={48}
                            strokeWidth={1.5}
                            color="var(--mantine-color-red-5)"
                        />
                        <Title order={3}>Algo salió mal</Title>
                        <Text c="dimmed" size="sm">
                            Esta página encontró un error. Las demás secciones siguen funcionando normalmente.
                        </Text>
                        {this.state.error?.message && (
                            <Code block style={{ maxWidth: '100%', fontSize: 12, textAlign: 'left' }}>
                                {this.state.error.message}
                            </Code>
                        )}
                        <Button
                            onClick={() => this.setState({ hasError: false, error: null })}
                            color="blue"
                            mt="md"
                        >
                            Reintentar
                        </Button>
                        <Button
                            variant="subtle"
                            onClick={() => { window.location.href = '/'; }}
                        >
                            Volver al inicio
                        </Button>
                    </Stack>
                </Center>
            );
        }

        return this.props.children;
    }
}
