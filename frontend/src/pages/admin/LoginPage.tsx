import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    Center, Paper, Title, Text, TextInput, PasswordInput,
    Button, Stack, Alert, Box,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { AlertCircle, ShieldAlert } from 'lucide-react';
import { useAuthStore } from '../../store/useAuthStore';
import { changePasswordApi } from '../../services/api/auth';

export function LoginPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const { login, isAuthenticated, user, mustChangePassword, clearMustChangePassword } = useAuthStore();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Route guard: redirect if already authenticated AND password change is not required
    useEffect(() => {
        if (isAuthenticated && !mustChangePassword) {
            const isAdminRole = user?.rol === 'admin' || user?.rol === 'supervisor';
            navigate(isAdminRole ? '/admin/dashboard' : '/', { replace: true });
        }
    }, [isAuthenticated, user, mustChangePassword, navigate]);

    const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? '/';

    const form = useForm<{ email: string; password: string }>({
        initialValues: { email: '', password: '' },
        validate: {
            email: (v) => (v.trim().length >= 2 ? null : 'Ingrese usuario o email'),
            password: (v) => (v.length >= 4 ? null : 'Mínimo 4 caracteres'),
        },
    });

    const pwForm = useForm<{ newPassword: string; confirmPassword: string }>({
        initialValues: { newPassword: '', confirmPassword: '' },
        validate: {
            newPassword: (v) => (v.length >= 8 ? null : 'Mínimo 8 caracteres'),
            confirmPassword: (v, values) =>
                v === values.newPassword ? null : 'Las contraseñas no coinciden',
        },
    });

    const handleSubmit = form.onSubmit(async ({ email, password }) => {
        setError('');
        setLoading(true);
        const ok = await login(email, password);
        setLoading(false);
        if (ok) {
            // If must_change_password is set, the useEffect won't redirect —
            // we stay on this page and show the password change form.
            const needsChange = useAuthStore.getState().mustChangePassword;
            if (!needsChange) {
                const updatedUser = useAuthStore.getState().user;
                const isAdminRole = updatedUser?.rol === 'admin' || updatedUser?.rol === 'supervisor';
                const isAdminRoute = from.startsWith('/admin');
                if (isAdminRole && !isAdminRoute) {
                    navigate('/admin/dashboard', { replace: true });
                } else {
                    navigate(from === '/login' ? '/' : from, { replace: true });
                }
            }
        } else {
            setError('Credenciales inválidas o usuario inactivo.');
        }
    });

    const handleChangePassword = pwForm.onSubmit(async ({ newPassword }) => {
        setError('');
        setLoading(true);
        try {
            await changePasswordApi(newPassword);
            clearMustChangePassword();
            // Now redirect normally
            const updatedUser = useAuthStore.getState().user;
            const isAdminRole = updatedUser?.rol === 'admin' || updatedUser?.rol === 'supervisor';
            navigate(isAdminRole ? '/admin/dashboard' : '/', { replace: true });
        } catch {
            setError('Error al cambiar la contraseña. Intente nuevamente.');
        } finally {
            setLoading(false);
        }
    });

    // ── SEC-03: Forced password change form ──────────────────────────────────
    if (isAuthenticated && mustChangePassword) {
        return (
            <Center style={{ minHeight: '100vh', background: 'var(--mantine-color-body)' }}>
                <Box w={380}>
                    <Stack gap="xs" mb="xl" align="center">
                        <Title order={1} c="blue.4" fw={800} style={{ letterSpacing: '-1px' }}>
                            BlendPOS
                        </Title>
                        <Text c="dimmed" size="sm">Cambio de contraseña obligatorio</Text>
                    </Stack>

                    <Paper p="xl" radius="md" withBorder>
                        <Alert icon={<ShieldAlert size={16} />} color="orange" mb="md" variant="light">
                            Por seguridad, debe cambiar su contraseña antes de continuar.
                        </Alert>

                        {error && (
                            <Alert icon={<AlertCircle size={16} />} color="red" mb="md" variant="light">
                                {error}
                            </Alert>
                        )}

                        <form onSubmit={handleChangePassword}>
                            <Stack gap="md">
                                <PasswordInput
                                    label="Nueva contraseña"
                                    placeholder="Mínimo 8 caracteres"
                                    {...pwForm.getInputProps('newPassword')}
                                    data-autofocus
                                />
                                <PasswordInput
                                    label="Confirmar contraseña"
                                    placeholder="Repetir contraseña"
                                    {...pwForm.getInputProps('confirmPassword')}
                                />
                                <Button type="submit" fullWidth loading={loading} mt="sm" color="orange">
                                    Cambiar contraseña
                                </Button>
                            </Stack>
                        </form>
                    </Paper>
                </Box>
            </Center>
        );
    }

    // ── Normal login form ────────────────────────────────────────────────────
    return (
        <Center style={{ minHeight: '100vh', background: 'var(--mantine-color-body)' }}>
            <Box w={380}>
                <Stack gap="xs" mb="xl" align="center">
                    <Title order={1} c="blue.4" fw={800} style={{ letterSpacing: '-1px' }}>
                        BlendPOS
                    </Title>
                    <Text c="dimmed" size="sm">Panel de Administración</Text>
                </Stack>

                <Paper p="xl" radius="md" withBorder>
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


                </Paper>
            </Box>
        </Center>
    );
}
