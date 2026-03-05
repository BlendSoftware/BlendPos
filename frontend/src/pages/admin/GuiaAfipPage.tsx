import { Stack, Title, Paper, ScrollArea, Container, Text, Card, Group, Button, Badge, ThemeIcon, Alert, Stepper, Anchor, Accordion, Box, SimpleGrid, Divider, List, Grid } from '@mantine/core';
import { ArrowLeft, BookOpen, AlertTriangle, Key, ShieldCheck, Link, CreditCard, ChevronRight, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function GuiaAfipPage() {
    const navigate = useNavigate();

    return (
        <Container size="xl" py="lg">
            <Group justify="space-between" mb="md">
                <Button variant="subtle" leftSection={<ArrowLeft size={16} />} onClick={() => navigate(-1)}>
                    Volver
                </Button>
                <Badge color="blue" size="lg" radius="sm" variant="light">
                    Guía Oficial ARCA / AFIP
                </Badge>
            </Group>

            <Paper shadow="sm" radius="md" p={{ base: 'md', sm: 'xl' }} withBorder>
                <Stack gap="xl">
                    <Box ta="center" mb="lg">
                        <ThemeIcon size={64} radius="xl" color="blue" variant="light" mb="md">
                            <BookOpen size={32} />
                        </ThemeIcon>
                        <Title order={1} fw={900}>Cómo Obtener Credenciales y Conectar tu POS a ARCA</Title>
                        <Text c="dimmed" mt="xs" size="lg">
                            Todo lo necesario para que tu sistema POS pueda emitir facturas electrónicas automáticamente.
                        </Text>
                    </Box>

                    <Alert icon={<ShieldCheck size={20} />} title="Resumen" color="blue" variant="filled" radius="md">
                        <Text size="sm">
                            El sistema necesita 3 elementos clave para funcionar: un <b>Certificado Digital X.509</b>, un <b>Token+Sign temporal del WSAA</b>, y un <b>Punto de Venta habilitado</b>. A continuación el proceso completo extraído de la documentación oficial.
                        </Text>
                    </Alert>

                    <div>
                        <Title order={3} mb="sm" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
                            <Link size={20} /> Fuentes Oficiales
                        </Title>
                        <Text mb="md">Toda la información de esta guía viene directamente de los portales oficiales de ARCA/AFIP.</Text>
                        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
                            <Card withBorder radius="md" p="md" className="hover-card">
                                <Text fw={700} mb="xs">Portal WS SOAP</Text>
                                <Anchor href="https://www.afip.gob.ar/ws/" target="_blank" size="sm">Ver Documentación</Anchor>
                            </Card>
                            <Card withBorder radius="md" p="md" className="hover-card">
                                <Text fw={700} mb="xs">Arquitectura General</Text>
                                <Anchor href="https://www.afip.gob.ar/ws/documentacion/arquitectura-general.asp" target="_blank" size="sm">Ver Documentación</Anchor>
                            </Card>
                            <Card withBorder radius="md" p="md" className="hover-card">
                                <Text fw={700} mb="xs">Certificados Digitales</Text>
                                <Anchor href="https://www.afip.gob.ar/ws/documentacion/certificados.asp" target="_blank" size="sm">Ver Documentación</Anchor>
                            </Card>
                            <Card withBorder radius="md" p="md" className="hover-card">
                                <Text fw={700} mb="xs">WSAA (Autenticación)</Text>
                                <Anchor href="https://www.afip.gob.ar/ws/documentacion/wsaa.asp" target="_blank" size="sm">Ver Documentación</Anchor>
                            </Card>
                            <Card withBorder radius="md" p="md" className="hover-card">
                                <Text fw={700} mb="xs">WSFEv1 (Facturación)</Text>
                                <Anchor href="https://www.afip.gob.ar/ws/documentacion/ws-factura-electronica.asp" target="_blank" size="sm">Ver Documentación</Anchor>
                            </Card>
                            <Card withBorder radius="md" p="md" className="hover-card">
                                <Text fw={700} mb="xs">Catálogo Web Services</Text>
                                <Anchor href="https://www.afip.gob.ar/ws/documentacion/catalogo.asp" target="_blank" size="sm">Ver Documentación</Anchor>
                            </Card>
                        </SimpleGrid>
                    </div>

                    <Divider />

                    <div>
                        <Title order={3} mb="sm">Arquitectura: ¿Cómo funciona la conexión?</Title>
                        <Text mb="md">El intercambio de información entre tu POS y ARCA se implementa a través de Web Services SOAP sobre HTTPS. No se necesitan VPNs ni canales especiales: todo corre por Internet.</Text>

                        <Card withBorder bg="var(--mantine-color-gray-0)" mb="md">
                            <Text fw={700} mb="xs">El flujo tiene dos capas:</Text>
                            <List spacing="sm" icon={<ThemeIcon color="teal" size={24} radius="xl"><Check size={16} /></ThemeIcon>}>
                                <List.Item>
                                    <b>WSAA (Web Service de Autenticación y Autorización):</b> autentica tu aplicación y entrega un Ticket de Acceso (TA) con validez de 12 horas.
                                </List.Item>
                                <List.Item>
                                    <b>WSFEv1 (Web Service de Factura Electrónica V1):</b> recibe los datos de la venta y devuelve el CAE (Código de Autorización Electrónico).
                                </List.Item>
                            </List>
                        </Card>
                        <Text size="sm" c="dimmed">La autenticación usa criptografía de clave pública con certificados digitales X.509. ARCA actúa como Autoridad Certificante y emite los certificados sin costo.</Text>
                    </div>

                    <Divider />

                    <Title order={2} ta="center" mt="xl">Guía Paso a Paso</Title>

                    <Accordion variant="separated" radius="md" defaultValue="step-1">
                        <Accordion.Item value="step-1">
                            <Accordion.Control>
                                <Group wrap="nowrap">
                                    <ThemeIcon size={32} radius="xl" color="blue"><Text fw={700}>1</Text></ThemeIcon>
                                    <Text fw={700} size="lg">Crear y registrar el Punto de Venta (Web Services)</Text>
                                </Group>
                            </Accordion.Control>
                            <Accordion.Panel>
                                <Text mb="md">Antes de pedir credenciales, necesitás tener un punto de venta específico para Web Services (diferente al manual o de controlador fiscal).</Text>
                                <List type="ordered" withPadding spacing="xs">
                                    <List.Item>Ingresá a ARCA con tu CUIT y Clave Fiscal en: <Anchor href="https://auth.afip.gob.ar/contribuyente_/login.xhtml" target="_blank">AFIP Login</Anchor></List.Item>
                                    <List.Item>Buscá el servicio <b>"Administración de puntos de venta y domicilios"</b>.</List.Item>
                                    <List.Item>En "A/B/M de Puntos de Venta" → Alta de nuevo punto de venta.</List.Item>
                                    <List.Item>En el campo "Sistema de Facturación" elegí la opción <b>"Web Services"</b>.</List.Item>
                                    <List.Item>Asigná un número de PV que no uses para facturación manual (ej: PV 3 o PV 10).</List.Item>
                                </List>
                                <Alert color="orange" title="Atención" mt="md" icon={<AlertTriangle size={16} />}>
                                    Este punto de venta va a ser el que uses en la configuración del POS para emitir facturas.
                                </Alert>
                            </Accordion.Panel>
                        </Accordion.Item>

                        <Accordion.Item value="step-2">
                            <Accordion.Control>
                                <Group wrap="nowrap">
                                    <ThemeIcon size={32} radius="xl" color="blue"><Text fw={700}>2</Text></ThemeIcon>
                                    <Text fw={700} size="lg">Obtener el Certificado Digital (Testing o Producción)</Text>
                                </Group>
                            </Accordion.Control>
                            <Accordion.Panel>
                                <Text mb="md">El certificado digital es la "llave" de tu aplicación para conectarse a ARCA. Hay uno para testing y otro para producción.</Text>

                                <Grid>
                                    <Grid.Col span={{ base: 12, md: 6 }}>
                                        <Card withBorder shadow="sm">
                                            <Title order={4} mb="xs" c="orange">2A. Para Homologación (Testing)</Title>
                                            <Text size="sm" mb="sm">Se usa la aplicación web WSASS (Autoservicio de Acceso a APIs de Homologación).</Text>
                                            <List type="ordered" size="sm" withPadding mb="md">
                                                <List.Item>Ingresá con Clave Fiscal de persona física al Administrador de Relaciones.</List.Item>
                                                <List.Item>Adherite al servicio "WSASS".</List.Item>
                                                <List.Item>Dentro del WSASS generás tu par de claves y descargás el <code>.crt</code> de testing.</List.Item>
                                            </List>
                                        </Card>
                                    </Grid.Col>
                                    <Grid.Col span={{ base: 12, md: 6 }}>
                                        <Card withBorder shadow="sm">
                                            <Title order={4} mb="xs" c="green">2B. Para Producción</Title>
                                            <List type="ordered" size="sm" withPadding>
                                                <List.Item>Ingresá al servicio "Administración de Certificados Digitales" con Clave Fiscal.</List.Item>
                                                <List.Item>Generá un par de claves desde una terminal (Linux/Mac/OpenSSL):
                                                    <Box bg="dark.7" c="gray.3" p="xs" mt="xs" style={{ borderRadius: 4, fontFamily: 'monospace' }}>
                                                        openssl genrsa -out private.key 2048<br />
                                                        openssl req -new -key private.key -subj "/C=AR/O=MiEmpresa/CN=MiApp/serialNumber=CUIT 20XXXXXXXXX0" -out cert.csr
                                                    </Box>
                                                </List.Item>
                                                <List.Item mt="xs">Subí el <code>.csr</code> y descargá el <code>.crt</code> firmado. <b>¡Guardá ambos archivos!</b></List.Item>
                                            </List>
                                        </Card>
                                    </Grid.Col>
                                </Grid>
                            </Accordion.Panel>
                        </Accordion.Item>

                        <Accordion.Item value="step-3">
                            <Accordion.Control>
                                <Group wrap="nowrap">
                                    <ThemeIcon size={32} radius="xl" color="blue"><Text fw={700}>3</Text></ThemeIcon>
                                    <Text fw={700} size="lg">Asociar el Certificado al Servicio WSFEv1</Text>
                                </Group>
                            </Accordion.Control>
                            <Accordion.Panel>
                                <Text mb="md">Tener el certificado no alcanza; hay que decirle a ARCA que ese certificado tiene permiso para facturar.</Text>
                                <List type="ordered" withPadding>
                                    <List.Item>Ingresá al "Administrador de Relaciones de Clave Fiscal" o usando <Anchor href="https://auth.afip.gob.ar/contribuyente_/login.xhtml?action=SYSTEM&system=adminrel" target="_blank">este link directo</Anchor>.</List.Item>
                                    <List.Item>Buscá el servicio <b>"wsfe" o "wsfev1"</b> en el listado de servicios de AFIP.</List.Item>
                                    <List.Item>Asociá tu "Computador Fiscal" (el certificado digital) a ese servicio para el CUIT correspondiente.</List.Item>
                                </List>
                                <Text size="sm" c="dimmed" mt="sm">Nota: Para testing esto se hace desde el mismo portal WSASS.</Text>
                            </Accordion.Panel>
                        </Accordion.Item>

                        <Accordion.Item value="step-4">
                            <Accordion.Control>
                                <Group wrap="nowrap">
                                    <ThemeIcon size={32} radius="xl" color="teal"><Text fw={700}>4</Text></ThemeIcon>
                                    <Text fw={700} size="lg">¡Listo! Comienza a facturar</Text>
                                </Group>
                            </Accordion.Control>
                            <Accordion.Panel>
                                <Text mb="md">Una vez que tenés tus archivos <code>.crt</code> y <code>.key</code>, y el Punto de Venta creado, podés subir todo en la pestaña de <b>Configuración Fiscal</b> de este sistema.</Text>
                                <Button leftSection={<Key size={16} />} color="teal" onClick={() => navigate('/admin/configuracion-fiscal')}>
                                    Ir a Configuración Fiscal ahora
                                </Button>

                                <Divider my="lg" />

                                <Title order={4} mb="xs">Detalles técnicos del flujo</Title>
                                <Box bg="gray.1" p="md" style={{ borderRadius: 8, whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
                                    {`Tu POS                         ARCA
  |                              |
  |-- 1. Login CMS (cert.crt) -->| WSAA
  |<-- Token + Sign -------------|
  |                              |
  |-- 2. FECAESolicitar -------->| WSFEv1
  |   (Token, Sign, datos venta) |
  |<-- CAE + FchVto -------------|
  |                              |
  Imprime el CAE en el ticket`}
                                </Box>
                            </Accordion.Panel>
                        </Accordion.Item>
                    </Accordion>
                </Stack>
            </Paper>
        </Container>
    );
}
