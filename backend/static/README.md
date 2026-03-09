# static/

Archivos estáticos embebidos en el contenedor Docker.

## Logo de factura

Guardar el logo como `logo.png` en esta carpeta.
- Recomendado: PNG con fondo transparente, mínimo 300x100px
- Se usa automáticamente en las facturas HTML y PDF si no hay logo_path configurado en la base de datos
- Ruta dentro del contenedor: `/app/static/logo.png`
