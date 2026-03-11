import {
    Stack, Title, Paper, Container, Text, Card, Group, Button, Badge,
    ThemeIcon, Alert, Accordion, Anchor, Box, SimpleGrid, Divider,
    List, Grid, Code, Tabs, Table,
} from '@mantine/core';
import {
    ArrowLeft, AlertTriangle, Key, ShieldCheck, ExternalLink, Check,
    Terminal, FileBadge, BookOpen, Info, Wrench,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

// ─── Helper badge ─────────────────────────────────────────────────────────────
function Who({ who }: { who: 'programador' | 'cliente' | 'ambos' }) {
    const map = {
        programador: { color: 'blue',   label: 'Lo hace el programador' },
        cliente:     { color: 'violet', label: 'Lo hace el cliente'      },
        ambos:       { color: 'teal',   label: 'Programador + Cliente'   },
    } as const;
    const { color, label } = map[who];
    return <Badge color={color} variant="light" size="sm">{label}</Badge>;
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export function GuiaAfipPage() {
    const navigate = useNavigate();

    return (
        <Container size="xl" py="lg">
            <Group justify="space-between" mb="md" wrap="wrap">
                <Button variant="subtle" leftSection={<ArrowLeft size={16} />} onClick={() => navigate(-1)}>
                    Volver
                </Button>
                <Badge color="blue" size="lg" radius="sm" variant="light" leftSection={<BookOpen size={14} />}>
                    Guía Oficial ARCA / AFIP — Factura Electrónica
                </Badge>
            </Group>

            <Paper shadow="sm" radius="md" p={{ base: 'md', sm: 'xl' }} withBorder>
                <Stack gap="xl">

                    {/* Hero */}
                    <Box ta="center" mb="xs">
                        <ThemeIcon size={64} radius="xl" color="blue" variant="light" mb="md" mx="auto">
                            <FileBadge size={32} />
                        </ThemeIcon>
                        <Title order={1} fw={900}>Cómo conectar BlendPOS a ARCA y emitir facturas electrónicas</Title>
                        <Text c="dimmed" mt="xs" size="lg" maw={700} mx="auto">
                            Guía completa para el programador y el cliente — desde cero hasta la primera factura válida.
                        </Text>
                    </Box>

                    {/* Summary */}
                    <Alert icon={<Info size={18} />} title="¿Qué necesitás para facturar?" color="blue" variant="light" radius="md">
                        <List spacing={4} size="sm">
                            <List.Item icon={<ThemeIcon size={18} radius="xl" color="blue" variant="light"><Check size={12} /></ThemeIcon>}>
                                Un <b>Punto de Venta (PV)</b> creado en ARCA con sistema "Web Services"
                            </List.Item>
                            <List.Item icon={<ThemeIcon size={18} radius="xl" color="blue" variant="light"><Check size={12} /></ThemeIcon>}>
                                Un <b>Certificado Digital X.509</b> firmado por ARCA (<Code>.crt</Code>)
                            </List.Item>
                            <List.Item icon={<ThemeIcon size={18} radius="xl" color="blue" variant="light"><Check size={12} /></ThemeIcon>}>
                                La <b>Clave Privada RSA</b> correspondiente (<Code>.key</Code>)
                            </List.Item>
                            <List.Item icon={<ThemeIcon size={18} radius="xl" color="blue" variant="light"><Check size={12} /></ThemeIcon>}>
                                El certificado asociado al servicio <b>wsfe</b> en ARCA
                            </List.Item>
                        </List>
                    </Alert>

                    {/* Architecture */}
                    <div>
                        <Title order={3} mb="xs">¿Cómo funciona internamente?</Title>
                        <Text size="sm" c="dimmed" mb="sm">
                            BlendPOS usa un microservicio Python (<Code>afip-sidecar</Code>) que se comunica con ARCA usando pyafipws.
                            El backend Go almacena la config en PostgreSQL y coordina el proceso.
                        </Text>
                        <Box bg="dark.8" c="gray.2" p="md" style={{ borderRadius: 8, fontFamily: 'monospace', fontSize: 13, whiteSpace: 'pre' }}>
{`Venta completada en POS
      │
      ▼
Backend Go ─── Redis queue ──────────► FacturacionWorker
                                              │
                               ┌──────────────┘
                               ▼
                   afip-sidecar (Python)
                   ┌─────────────────────┐
                   │  WSAA: cert → Token  │  ← válido 12 h
                   │  WSFEv1: CAE request │  ← factura registrada
                   └─────────────────────┘
                               │
                         CAE devuelto
                               │
                   Comprobante guardado en DB`}
                        </Box>
                    </div>

                    <Divider />

                    {/* Tabbed guide */}
                    <Tabs defaultValue="testing" variant="outline" radius="md">
                        <Tabs.List grow mb="md">
                            <Tabs.Tab value="testing" leftSection={<Wrench size={16} />} color="orange">
                                Testing (Homologación)
                            </Tabs.Tab>
                            <Tabs.Tab value="produccion" leftSection={<ShieldCheck size={16} />} color="green">
                                Producción
                            </Tabs.Tab>
                        </Tabs.List>

                        {/* ── TESTING ── */}
                        <Tabs.Panel value="testing">
                            <Alert color="orange" variant="light" icon={<AlertTriangle size={16} />} mb="lg" radius="md">
                                En Homologación las facturas <b>no tienen validez legal</b>. Sirve para probar que la integración funciona.
                            </Alert>

                            <Accordion variant="separated" radius="md" defaultValue="t1">

                                <Accordion.Item value="t1">
                                    <Accordion.Control>
                                        <Group wrap="nowrap">
                                            <ThemeIcon size={32} radius="xl" color="orange"><Text fw={800}>1</Text></ThemeIcon>
                                            <div>
                                                <Text fw={700}>Crear el Punto de Venta para Web Services</Text>
                                                <Who who="cliente" />
                                            </div>
                                        </Group>
                                    </Accordion.Control>
                                    <Accordion.Panel>
                                        <List type="ordered" withPadding spacing="xs">
                                            <List.Item>
                                                Ingresar a <Anchor href="https://auth.afip.gob.ar" target="_blank" rel="noopener noreferrer">ARCA <ExternalLink size={12} /></Anchor> con CUIT y Clave Fiscal
                                            </List.Item>
                                            <List.Item>Buscar el servicio <b>"Administración de Puntos de Venta y Domicilios"</b></List.Item>
                                            <List.Item>Ir a <b>"A/B/M de Puntos de Venta"</b> → <b>"Alta"</b></List.Item>
                                            <List.Item>
                                                Elegir:
                                                <List withPadding mt="xs" spacing={4} size="sm">
                                                    <List.Item><b>Número de PV:</b> ej. 3. Anotarlo — se usará en Config. Fiscal.</List.Item>
                                                    <List.Item><b>Sistema de Facturación:</b> <Code>RECE - Web Services</Code></List.Item>
                                                    <List.Item><b>Domicilio:</b> domicilio fiscal del contribuyente</List.Item>
                                                </List>
                                            </List.Item>
                                            <List.Item>Confirmar y anotar el número de PV</List.Item>
                                        </List>
                                        <Alert color="blue" variant="light" icon={<Info size={14} />} mt="md">
                                            Este mismo PV sirve para Testing y Producción. No es necesario crear dos distintos.
                                        </Alert>
                                    </Accordion.Panel>
                                </Accordion.Item>

                                <Accordion.Item value="t2">
                                    <Accordion.Control>
                                        <Group wrap="nowrap">
                                            <ThemeIcon size={32} radius="xl" color="orange"><Text fw={800}>2</Text></ThemeIcon>
                                            <div>
                                                <Text fw={700}>Obtener el certificado de testing con WSASS</Text>
                                                <Who who="cliente" />
                                            </div>
                                        </Group>
                                    </Accordion.Control>
                                    <Accordion.Panel>
                                        <Text size="sm" mb="sm">
                                            ARCA provee el portal <b>WSASS</b> para generar certificados de testing sin necesidad de OpenSSL.
                                        </Text>
                                        <List type="ordered" withPadding spacing="xs">
                                            <List.Item>Ir a <b>"Administrador de Relaciones de Clave Fiscal"</b> → agregar servicio <b>"WSASS"</b></List.Item>
                                            <List.Item>Abrir el servicio <b>"WSASS"</b> desde Mis Servicios</List.Item>
                                            <List.Item>Ir a <b>"Nuevo Certificado"</b> → el portal genera el par de claves</List.Item>
                                            <List.Item><b>Descargar el <Code>.key</Code></b> — ¡no se puede recuperar si se pierde!</List.Item>
                                            <List.Item><b>Descargar el <Code>.crt</Code></b> (certificado público)</List.Item>
                                            <List.Item>En el WSASS, asociar el certificado al servicio <b>"wsfe"</b></List.Item>
                                        </List>
                                    </Accordion.Panel>
                                </Accordion.Item>

                                <Accordion.Item value="t3">
                                    <Accordion.Control>
                                        <Group wrap="nowrap">
                                            <ThemeIcon size={32} radius="xl" color="orange"><Text fw={800}>3</Text></ThemeIcon>
                                            <div>
                                                <Text fw={700}>Cargar los certificados en BlendPOS</Text>
                                                <Who who="programador" />
                                            </div>
                                        </Group>
                                    </Accordion.Control>
                                    <Accordion.Panel>
                                        <List type="ordered" withPadding spacing="xs">
                                            <List.Item>Ir a <b>Admin → Configuración Fiscal</b></List.Item>
                                            <List.Item>Completar los campos: CUIT, Razón Social, Condición Fiscal, Punto de Venta</List.Item>
                                            <List.Item>Seleccionar <b>Modo: Homologación</b></List.Item>
                                            <List.Item>Subir el <Code>.crt</Code> y el <Code>.key</Code></List.Item>
                                            <List.Item>Clic en <b>"Guardar Configuración"</b></List.Item>
                                        </List>
                                        <Alert color="teal" variant="light" icon={<Check size={14} />} mt="md">
                                            <b>Esperado:</b> "Configuración actualizada y AFIP notificado correctamente".<br />
                                            Si aparece una advertencia WSAA, verificar que el cert esté asociado al servicio "wsfe" en el WSASS (paso 2.6).
                                        </Alert>
                                        <Button leftSection={<Key size={16} />} color="orange" mt="md" onClick={() => navigate('/admin/configuracion-fiscal')}>
                                            Ir a Configuración Fiscal
                                        </Button>
                                    </Accordion.Panel>
                                </Accordion.Item>

                            </Accordion>
                        </Tabs.Panel>

                        {/* ── PRODUCCIÓN ── */}
                        <Tabs.Panel value="produccion">
                            <Alert color="green" variant="light" icon={<ShieldCheck size={16} />} mb="lg" radius="md">
                                En Producción cada factura queda registrada en ARCA con validez legal. Asegurarse de haber probado en Homologación primero.
                            </Alert>

                            <Accordion variant="separated" radius="md" defaultValue="p1">

                                <Accordion.Item value="p1">
                                    <Accordion.Control>
                                        <Group wrap="nowrap">
                                            <ThemeIcon size={32} radius="xl" color="green"><Text fw={800}>1</Text></ThemeIcon>
                                            <div>
                                                <Text fw={700}>Punto de Venta (ya creado en testing)</Text>
                                                <Who who="cliente" />
                                            </div>
                                        </Group>
                                    </Accordion.Control>
                                    <Accordion.Panel>
                                        <Text>El mismo PV creado para testing funciona en producción. No hay que crear uno nuevo.</Text>
                                        <Alert color="orange" variant="light" icon={<AlertTriangle size={14} />} mt="md">
                                            Verificar que el PV esté en estado "Activo" y no haya sido dado de baja.
                                        </Alert>
                                    </Accordion.Panel>
                                </Accordion.Item>

                                <Accordion.Item value="p2">
                                    <Accordion.Control>
                                        <Group wrap="nowrap">
                                            <ThemeIcon size={32} radius="xl" color="green"><Text fw={800}>2</Text></ThemeIcon>
                                            <div>
                                                <Text fw={700}>Generar la clave privada y el CSR con OpenSSL</Text>
                                                <Who who="programador" />
                                            </div>
                                        </Group>
                                    </Accordion.Control>
                                    <Accordion.Panel>
                                        <Text size="sm" mb="md">
                                            Para producción hay que generar localmente el par de claves y subir el CSR a ARCA.
                                            La clave privada nunca sale del servidor.
                                        </Text>

                                        <Grid>
                                            <Grid.Col span={{ base: 12, md: 6 }}>
                                                <Card withBorder radius="md" p="md">
                                                    <Group mb="xs">
                                                        <Terminal size={18} />
                                                        <Text fw={700} size="sm">Linux / macOS / Git Bash</Text>
                                                    </Group>
                                                    <Box bg="dark.8" c="gray.2" p="sm" style={{ borderRadius: 6, fontFamily: 'monospace', fontSize: 12, whiteSpace: 'pre' }}>
{`openssl genrsa -out afip.key 2048

openssl req -new \\
  -key afip.key \\
  -subj "/C=AR/O=<RAZON_SOCIAL>/CN=BlendPOS/serialNumber=CUIT <CUIT>" \\
  -out afip.csr`}
                                                    </Box>
                                                </Card>
                                            </Grid.Col>
                                            <Grid.Col span={{ base: 12, md: 6 }}>
                                                <Card withBorder radius="md" p="md">
                                                    <Group mb="xs">
                                                        <Terminal size={18} />
                                                        <Text fw={700} size="sm">Windows CMD</Text>
                                                    </Group>
                                                    <Text size="xs" c="dimmed" mb="xs">Primero instalar <Anchor size="xs" href="https://slproweb.com/products/Win32OpenSSL.html" target="_blank" rel="noopener noreferrer">Win64 OpenSSL Light</Anchor></Text>
                                                    <Box bg="dark.8" c="gray.2" p="sm" style={{ borderRadius: 6, fontFamily: 'monospace', fontSize: 12, whiteSpace: 'pre' }}>
{`openssl genrsa -out afip.key 2048

openssl req -new -key afip.key ^
  -subj "/C=AR/O=Empresa/CN=BlendPOS/serialNumber=CUIT 20XXX" ^
  -out afip.csr`}
                                                    </Box>
                                                </Card>
                                            </Grid.Col>
                                        </Grid>

                                        <Alert color="orange" icon={<Key size={14} />} variant="light" mt="md">
                                            <b>¡Importante!</b> El archivo <Code>afip.key</Code> es la clave privada.
                                            Hacé un backup en un lugar seguro (nunca en Git).
                                        </Alert>
                                    </Accordion.Panel>
                                </Accordion.Item>

                                <Accordion.Item value="p3">
                                    <Accordion.Control>
                                        <Group wrap="nowrap">
                                            <ThemeIcon size={32} radius="xl" color="green"><Text fw={800}>3</Text></ThemeIcon>
                                            <div>
                                                <Text fw={700}>Solicitar el certificado firmado en ARCA</Text>
                                                <Who who="cliente" />
                                            </div>
                                        </Group>
                                    </Accordion.Control>
                                    <Accordion.Panel>
                                        <List type="ordered" withPadding spacing="xs">
                                            <List.Item>Ingresar a <Anchor href="https://auth.afip.gob.ar" target="_blank" rel="noopener noreferrer">ARCA <ExternalLink size={12} /></Anchor></List.Item>
                                            <List.Item>Ir a <b>"Administración de Certificados Digitales"</b></List.Item>
                                            <List.Item>Seleccionar <b>"Alta de Certificado"</b></List.Item>
                                            <List.Item>Subir el archivo <Code>afip.csr</Code> generado en el paso anterior</List.Item>
                                            <List.Item>ARCA firma el CSR y devuelve <Code>afip.crt</Code> — <b>descargarlo y guardarlo</b></List.Item>
                                        </List>
                                    </Accordion.Panel>
                                </Accordion.Item>

                                <Accordion.Item value="p4">
                                    <Accordion.Control>
                                        <Group wrap="nowrap">
                                            <ThemeIcon size={32} radius="xl" color="green"><Text fw={800}>4</Text></ThemeIcon>
                                            <div>
                                                <Text fw={700}>Asociar el certificado al servicio WSFEv1</Text>
                                                <Who who="cliente" />
                                            </div>
                                        </Group>
                                    </Accordion.Control>
                                    <Accordion.Panel>
                                        <List type="ordered" withPadding spacing="xs">
                                            <List.Item>Ir a <b>"Administrador de Relaciones de Clave Fiscal"</b> → <b>"Nueva Relación"</b></List.Item>
                                            <List.Item>Servicio: <b>"Facturación Electrónica"</b> → <b>"wsfe"</b></List.Item>
                                            <List.Item>Computador Fiscal: seleccionar el certificado recién creado</List.Item>
                                            <List.Item>Confirmar</List.Item>
                                        </List>
                                        <Alert color="blue" variant="light" icon={<Info size={14} />} mt="md">
                                            Sin este paso el sidecar pasa WSAA pero WSFEv1 rechaza el acceso.
                                        </Alert>
                                    </Accordion.Panel>
                                </Accordion.Item>

                                <Accordion.Item value="p5">
                                    <Accordion.Control>
                                        <Group wrap="nowrap">
                                            <ThemeIcon size={32} radius="xl" color="green"><Text fw={800}>5</Text></ThemeIcon>
                                            <div>
                                                <Text fw={700}>Cargar los certificados de producción en BlendPOS</Text>
                                                <Who who="programador" />
                                            </div>
                                        </Group>
                                    </Accordion.Control>
                                    <Accordion.Panel>
                                        <List type="ordered" withPadding spacing="xs">
                                            <List.Item>Ir a <b>Admin → Configuración Fiscal</b></List.Item>
                                            <List.Item>Cambiar <b>Modo a "Producción"</b></List.Item>
                                            <List.Item>Subir el <Code>.crt</Code> y <Code>.key</Code> de PRODUCCIÓN (distintos a los de testing)</List.Item>
                                            <List.Item>Guardar y confirmar que el mensaje de éxito aparece</List.Item>
                                        </List>
                                        <Alert color="red" variant="light" icon={<AlertTriangle size={14} />} mt="md">
                                            <b>No mezclar</b> los certificados de testing con los de producción.
                                        </Alert>
                                        <Button leftSection={<Key size={16} />} color="green" mt="md" onClick={() => navigate('/admin/configuracion-fiscal')}>
                                            Ir a Configuración Fiscal
                                        </Button>
                                    </Accordion.Panel>
                                </Accordion.Item>

                            </Accordion>
                        </Tabs.Panel>
                    </Tabs>

                    <Divider />

                    {/* Troubleshooting */}
                    <div>
                        <Title order={3} mb="md">Troubleshooting</Title>
                        <Accordion variant="separated" radius="md">

                            <Accordion.Item value="err-wsaa">
                                <Accordion.Control>
                                    <Text fw={600} size="sm" c="red">"Certificados guardados pero WSAA rechazó la autenticación"</Text>
                                </Accordion.Control>
                                <Accordion.Panel>
                                    <Text size="sm" mb="xs">El cert se guardó pero ARCA no lo aceptó. Causas comunes:</Text>
                                    <List size="sm" withPadding>
                                        <List.Item>El certificado no está asociado al servicio <Code>wsfe</Code></List.Item>
                                        <List.Item>El certificado venció (los de testing del WSASS expiran en 90 días)</List.Item>
                                        <List.Item>El CUIT en Config. Fiscal no coincide con el CN del certificado</List.Item>
                                        <List.Item>El Modo (homologacion/produccion) no corresponde al certificado</List.Item>
                                    </List>
                                </Accordion.Panel>
                            </Accordion.Item>

                            <Accordion.Item value="err-rechazada">
                                <Accordion.Control>
                                    <Text fw={600} size="sm" c="red">Factura rechazada — Resultado "R"</Text>
                                </Accordion.Control>
                                <Accordion.Panel>
                                    <Table withTableBorder withColumnBorders>
                                        <Table.Thead>
                                            <Table.Tr>
                                                <Table.Th>Código</Table.Th>
                                                <Table.Th>Causa</Table.Th>
                                                <Table.Th>Solución</Table.Th>
                                            </Table.Tr>
                                        </Table.Thead>
                                        <Table.Tbody>
                                            <Table.Tr>
                                                <Table.Td><Code>10016</Code></Table.Td>
                                                <Table.Td>Total ≠ suma de componentes</Table.Td>
                                                <Table.Td>neto + IVA + exento = total</Table.Td>
                                            </Table.Tr>
                                            <Table.Tr>
                                                <Table.Td><Code>422</Code></Table.Td>
                                                <Table.Td>Tipo cbte no corresponde a condición fiscal</Table.Td>
                                                <Table.Td>Monotributo → Factura C; RI → A o B</Table.Td>
                                            </Table.Tr>
                                            <Table.Tr>
                                                <Table.Td><Code>10094</Code></Table.Td>
                                                <Table.Td>PV inexistente o no habilitado para WS</Table.Td>
                                                <Table.Td>Verificar PV en ARCA con sistema "Web Services"</Table.Td>
                                            </Table.Tr>
                                        </Table.Tbody>
                                    </Table>
                                </Accordion.Panel>
                            </Accordion.Item>

                            <Accordion.Item value="err-sidecar">
                                <Accordion.Control>
                                    <Text fw={600} size="sm" c="red">"sidecar AFIP no disponible" / "Connection refused"</Text>
                                </Accordion.Control>
                                <Accordion.Panel>
                                    <Box bg="dark.8" c="gray.2" p="sm" mt="xs" style={{ borderRadius: 6, fontFamily: 'monospace', fontSize: 12, whiteSpace: 'pre' }}>
{`docker compose ps
docker compose logs afip-sidecar --tail=50
docker compose restart afip-sidecar`}
                                    </Box>
                                </Accordion.Panel>
                            </Accordion.Item>

                        </Accordion>
                    </div>

                    <Divider />

                    {/* Quick links */}
                    <div>
                        <Title order={3} mb="sm">Links oficiales</Title>
                        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="sm">
                            {([
                                { title: 'Portal ARCA / AFIP',    href: 'https://auth.afip.gob.ar',                                                            desc: 'Login con CUIT y Clave Fiscal'       },
                                { title: 'Documentación WS SOAP', href: 'https://www.afip.gob.ar/ws/',                                                          desc: 'Índice general de web services'      },
                                { title: 'WSAA (Auth)',           href: 'https://www.afip.gob.ar/ws/documentacion/wsaa.asp',                                    desc: 'Web Service de Autenticación'        },
                                { title: 'WSFEv1 (Facturación)',  href: 'https://www.afip.gob.ar/ws/documentacion/ws-factura-electronica.asp',                  desc: 'Manual técnico factura electrónica'  },
                                { title: 'Certificados',          href: 'https://www.afip.gob.ar/ws/documentacion/certificados.asp',                            desc: 'Cómo obtener y usar certificados'    },
                                { title: 'OpenSSL Windows',       href: 'https://slproweb.com/products/Win32OpenSSL.html',                                      desc: 'Instalador Win64 OpenSSL Light'      },
                            ] as const).map(({ title, href, desc }) => (
                                <Card key={href} withBorder radius="md" p="sm">
                                    <Text fw={600} size="sm">{title}</Text>
                                    <Text size="xs" c="dimmed" mb="xs">{desc}</Text>
                                    <Anchor href={href} target="_blank" rel="noopener noreferrer" size="xs">
                                        Abrir <ExternalLink size={10} />
                                    </Anchor>
                                </Card>
                            ))}
                        </SimpleGrid>
                    </div>

                </Stack>
            </Paper>
        </Container>
    );
}
