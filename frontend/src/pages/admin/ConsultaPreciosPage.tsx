import { useState, useRef, useEffect } from 'react';
import { TextInput, Text, Paper, Stack, Center, Title, Badge, Box, Loader } from '@mantine/core';
import { ScanLine } from 'lucide-react';
import { getPrecioPorBarcode, type ConsultaPreciosResponse } from '../../services/api/products';

export function ConsultaPreciosPage() {
    const [query, setQuery] = useState('');
    const [resultado, setResultado] = useState<ConsultaPreciosResponse | null | 'not_found'>(null);
    const [loading, setLoading] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    // Autofocus persistente
    useEffect(() => {
        inputRef.current?.focus();
    }, [resultado]);

    const buscar = async (valor: string) => {
        const val = valor.trim();
        if (!val) { setResultado(null); return; }

        setLoading(true);
        try {
            const found = await getPrecioPorBarcode(val);
            setResultado(found);
        } catch {
            setResultado('not_found');
        } finally {
            setLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            buscar(e.currentTarget.value);
        }
        if (e.key === 'Escape') {
            setQuery('');
            setResultado(null);
        }
    };

    const precio = resultado && resultado !== 'not_found'
        ? new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(resultado.precio_venta)
        : null;

    return (
        <Box style={{ minHeight: '100vh', background: 'var(--mantine-color-body)', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '10vh' }}>
            <Stack align="center" gap="xl" w="100%" maw={560} px="md">
                <div style={{ textAlign: 'center' }}>
                    <Title order={1} fw={900} c="blue.4" style={{ fontSize: '2.5rem', letterSpacing: '-2px' }}>
                        BlendPOS
                    </Title>
                    <Text c="dimmed" size="sm" mt={4}>Consulta de precios</Text>
                </div>

                <TextInput
                    ref={inputRef}
                    size="xl"
                    radius="md"
                    placeholder="Escanear o escribir producto..."
                    leftSection={<ScanLine size={24} />}
                    value={query}
                    onChange={(e) => {
                        setQuery(e.currentTarget.value);
                        if (resultado) setResultado(null);
                    }}
                    onKeyDown={handleKeyDown}
                    style={{ width: '100%' }}
                    styles={{ input: { fontSize: '1.25rem', height: 60 } }}
                    autoComplete="off"
                    data-autofocus
                />

                <Text size="xs" c="dimmed">
                    Presioná <kbd>Enter</kbd> para buscar · <kbd>Esc</kbd> para limpiar
                </Text>

                {/* Loading */}
                {loading && (
                    <Center py="xl">
                        <Loader size="md" />
                    </Center>
                )}

                {/* Resultado */}
                {!loading && resultado === 'not_found' && (
                    <Paper p="xl" radius="md" withBorder w="100%" style={{ textAlign: 'center' }}>
                        <Text size="xl" c="red.4" fw={700}>Producto no encontrado</Text>
                        <Text size="sm" c="dimmed" mt="xs">Verificá el código o el nombre ingresado.</Text>
                    </Paper>
                )}

                {!loading && resultado && resultado !== 'not_found' && (
                    <Paper p="xl" radius="md" withBorder w="100%" style={{  }}>
                        <Stack gap="sm" align="center">
                            {/* Imagen placeholder */}
                            <Center
                                w={100} h={100}
                                style={{ borderRadius: 12, background: 'var(--mantine-color-default-hover)', fontSize: '2.5rem' }}
                            >
                                🛒
                            </Center>

                            {resultado.categoria && (
                                <Badge variant="outline" size="sm">{resultado.categoria}</Badge>
                            )}

                            <Text size="xl" fw={700} ta="center" mt="xs">
                                {resultado.nombre}
                            </Text>

                            {resultado.promocion && (
                                <Badge color="yellow" size="sm">{resultado.promocion}</Badge>
                            )}

                            <Text
                                style={{
                                    fontSize: '3rem',
                                    fontWeight: 900,
                                    color: 'var(--mantine-color-teal-4)',
                                    letterSpacing: '-2px',
                                    lineHeight: 1,
                                    marginTop: '0.5rem',
                                }}
                            >
                                {precio}
                            </Text>

                            <Text size="sm" c="dimmed">
                                Stock: {resultado.stock_disponible} ud.
                            </Text>
                        </Stack>
                    </Paper>
                )}
            </Stack>
        </Box>
    );
}
