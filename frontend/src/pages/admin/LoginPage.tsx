import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    Center, Paper, Title, Text, TextInput, PasswordInput,
    Button, Stack, Alert, Box,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { AlertCircle } from 'lucide-react';
import { useAuthStore } from '../../store/useAuthStore';

export function LoginPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const { login } = useAuthStore();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? '/';

    const form = useForm({
        initialValues: { email: '', password: '' },
        validate: {
            email: (v) => (v.trim().length >= 2 ? null : 'Ingrese usuario o email'),
            password: (v) => (v.length >= 4 ? null : 'Mínimo 4 caracteres'),
        },
    });

    const handleSubmit = form.onSubmit(async ({ email, password }) => {
        setError('');
        setLoading(true);
        const ok = await login(email, password);
        setLoading(false);
        if (ok) {
            // Redirigir según rol: admin/supervisor van al panel admin,
            // salvo que ya venían de una ruta admin específica.
            const updatedUser = useAuthStore.getState().user;
            const isAdminRole = updatedUser?.rol === 'admin' || updatedUser?.rol === 'supervisor';
            const isAdminRoute = from.startsWith('/admin');
            if (isAdminRole && !isAdminRoute) {
                navigate('/admin/dashboard', { replace: true });
            } else {
                navigate(from === '/login' ? '/' : from, { replace: true });
            }
        } else {
            setError('Credenciales inválidas o usuario inactivo.');
        }
    });

    return (
        <Center style={{ minHeight: '100vh', background: 'var(--mantine-color-dark-9)' }}>
            <Box w={380}>
                <Stack gap="xs" mb="xl" align="center">
                    <Title order={1} c="blue.4" fw={800} style={{ letterSpacing: '-1px' }}>
                        BlendPOS
                    </Title>
                    <Text c="dimmed" size="sm">Panel de Administración</Text>
                </Stack>

                <Paper p="xl" radius="md" withBorder style={{ background: 'var(--mantine-color-dark-8)' }}>
                    <Title order={3} mb="lg">Iniciar sesión</Title>

                    {error && (
                        <Alert icon={<AlertCircle size={16} />} color="red" mb="md" variant="light">
                            {error}
                        </Alert>
                    )}

                    <form onSubmit={handleSubmit}>
                        <Stack gap="md">
                            <TextInput
                                label="Usuario o Email"
                                placeholder="admin"
                                {...form.getInputProps('email')}
                                data-autofocus
                            />
                            <PasswordInput
                                label="Contraseña"
                                placeholder="••••••••"
                                {...form.getInputProps('password')}
                            />
                            <Button type="submit" fullWidth loading={loading} mt="sm">
                                Ingresar
                            </Button>
                        </Stack>
                    </form>

                    <Text c="dimmed" size="xs" mt="lg" ta="center">
                        Demo: admin / blendpos2026
                    </Text>
                </Paper>
            </Box>
        </Center>
    );
}
