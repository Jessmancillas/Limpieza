# Permisos COFEPRIS · VUCEM 260211

Aplicación web para **preparar, firmar, enviar y dar seguimiento** al trámite de COFEPRIS
**Permiso Sanitario de Importación de Dispositivos Médicos que cuenten con Registro Sanitario
y/o Importación de Fuentes de Radiación** ante la Ventanilla Única (VUCEM), trámite **260211**.

## Qué hace

1. **Catálogos de tu empresa, capturados una sola vez**: establecimientos (con SCIAN, licencia
   o aviso), productos (dispositivos médicos con registro sanitario y su vigencia), fabricantes,
   proveedores, destinatarios y facturadores.
2. **Documentos listos para VUCEM**: subes PDFs o fotos y la app los convierte a PDF solo-imagen
   en escala de grises a 300 dpi, quita páginas en blanco y elimina formularios/JavaScript, y
   revisa el tamaño contra el límite configurado.
3. **Solicitud con validación previa**: revisa campo por campo lo que exige el Manual WS 260211
   (obligatorios, longitudes, formatos, registro sanitario vigente, anexos) antes de presentar.
4. **Dos formas de presentar**:
   - **Servicio web (WS) de VUCEM**: digitaliza los anexos (eDocument) y envía la solicitud
     firmada. La **e.firma se usa solo en tu navegador**: el `.key` y su contraseña nunca se
     envían al servidor. La contraseña de servicios web de VUCEM se guarda **cifrada**.
   - **Portal VUCEM**: hoja de captura con las mismas secciones del portal (botón *copiar* en
     cada dato), versión imprimible y ZIP con los anexos ya convertidos.
5. **Seguimiento**: folio de 25 dígitos, acuse, requerimientos con fecha límite en días hábiles,
   resolución, vigencias y alertas en el tablero.
6. **Varias empresas (RFC)** con usuarios y roles (administrador, capturista, consulta) y bitácora.

## ERP: arquitectura empresarial

Además del trámite, la app incluye un **sistema centralizado** de compras (proveedores, órdenes de
compra, recepción), almacén, ventas, cobranza y finanzas con **modelos de decisión** (matriz de
autorización, conciliación a tres vías, EOQ/punto de reorden/ABC, scoring de crédito y de
proveedores, cobranza por antigüedad, priorización de pagos) y gobernado con **COBIT 2019**
(objetivos y tablero de KPIs), **ITIL 4** (mesa de servicio, SLA y CAB) e **ISO/IEC 27001:2022**
(declaración de aplicabilidad, riesgos, segregación de funciones y bitácora).
Ver [docs/arquitectura-empresarial.md](docs/arquitectura-empresarial.md).

Los usuarios tienen, además del rol, **áreas funcionales** (Compras, Almacén, Ventas, Cobranza,
Finanzas, Aprobador, Gobierno) que asigna un administrador en **Gobierno → Resumen y segregación**.

## Requisitos

- Node.js 20.9 o superior (probado con 22).
- `poppler-utils` (`pdftoppm`, `pdfinfo`) para convertir anexos. En Debian/Ubuntu:
  `sudo apt-get install poppler-utils`. La imagen Docker ya lo incluye.

## Instalación local

```bash
npm install
cp .env.example .env            # y genera APP_ENCRYPTION_KEY (ver el archivo)
npx prisma migrate deploy       # crea la base SQLite
npm run db:seed                 # catálogos, días inhábiles y definición del trámite
npm run db:demo                 # opcional: empresa y usuario de demostración
npm run dev                     # http://localhost:3000
```

Usuario de demostración (datos ficticios): `demo@ejemplo.mx` / `Demo-Permisos-2026`.

El primer usuario que se registra crea su empresa y queda como administrador. Después el
registro abierto se cierra (salvo `PERMITIR_REGISTRO=true`) y los administradores agregan
usuarios desde **Configuración → Usuarios**.

## Variables de entorno

| Variable | Uso |
| --- | --- |
| `DATABASE_URL` | Base de datos (SQLite: `file:./prisma/dev.db`). |
| `APP_ENCRYPTION_KEY` | 32 bytes en base64 para cifrar la contraseña de servicios web de VUCEM. **Respáldala**: sin ella no se puede descifrar. |
| `STORAGE_DIR` | Carpeta privada de archivos (PDFs, acuses, resoluciones). |
| `APP_URL` | URL pública de la app (la usa el simulador de VUCEM). |
| `PERMITIR_REGISTRO` | `true` para permitir registro abierto de nuevas empresas. |
| `VUCEM_SIMULADOR` | `true` para habilitar el simulador también en producción (no recomendado). |
| `VUCEM_SIMULADOR_PASSWORD` | Contraseña WS que acepta el simulador (por defecto `simulador-vucem`). |

## Conexión con VUCEM

En **Configuración → Conexión VUCEM** eliges el ambiente:

- **Simulador** (por defecto): un VUCEM falso incluido en la app para probar todo el flujo
  (verifica la firma y responde folios y eDocuments de prueba). No envía nada al gobierno.
- **Pruebas / Producción**: necesitas la URL del servicio, el nombre de la operación, el
  namespace y el SOAPAction del WS 260211. **El Manual WS 260211 no publica la URL ni el WSDL**:
  pídelos a la Mesa de Ayuda de VUCEM o descárgalos del portal (Manuales → COFEPRIS → Web Service
  trámites COFEPRIS). La digitalización de documentos usa el servicio público
  `DigitalizarDocumentoService`.

### Puntos por confirmar con VUCEM antes de enviar en producción

El manual disponible (SAT-AGCTI v1.0, 2019) tiene inconsistencias, por lo que estos puntos
están aislados en `src/lib/vucem/` para ajustarlos en un solo lugar:

- La estructura exacta del cuerpo SOAP (se debe validar contra `schema0.xsd`).
- El orden exacto de la **cadena original** (el manual incluye datos del solicitante y su
  domicilio que no aparecen en la tabla de atributos y repite el país de procedencia).
- Las claves internas de los catálogos VUCEM (clasificación, tipo de producto, uso específico,
  régimen, aduana, banco, tipo de documento). Se importan en **Catálogos VUCEM** desde un CSV;
  las claves de ejemplo vienen marcadas como *por confirmar* (⚠).
- Cambios normativos recientes: Acuerdo de simplificación COFEPRIS (DOF 11/08/2025) y
  Decreto de la Ventanilla Única de Trámites de Comercio Exterior (DOF 04/05/2026). Los
  requisitos y límites del trámite están versionados en la base de datos (`TramiteVersion`).

## Seguridad

- La e.firma (`.cer`/`.key`) se procesa solo en el navegador; no se sube ni se guarda.
- La contraseña de servicios web se cifra con AES-256-GCM y nunca se envía al navegador.
- Todo XML guardado en la bitácora de envíos tiene la contraseña redactada.
- Cada consulta está aislada por empresa; los archivos se sirven solo a usuarios de la empresa.
- Contraseñas de usuarios con scrypt; sesiones con token aleatorio (solo se guarda su hash).
- Datos personales: publica tu aviso de privacidad conforme a la LFPDPPP (2025).

## Desarrollo

```bash
npm run typecheck   # TypeScript
npm run lint        # ESLint
npm test            # pruebas unitarias (Vitest)
npm run build && npm run test:e2e   # pruebas de punta a punta (Playwright)
```

Estructura principal:

```
prisma/schema.prisma        modelo de datos (campos del Manual WS 260211)
prisma/datos/               semillas de catálogos y días inhábiles
src/app/(app)/              pantallas de la app (solicitudes, documentos, catálogos, configuración)
src/lib/solicitudes/        validación, hoja de captura, días hábiles
src/lib/vucem/              SOAP, digitalización eDocument, WS 260211, simulador
src/lib/firma/              firma electrónica (node-forge, funciona en el navegador)
src/lib/pdf/                conversión de anexos al formato VUCEM
src/lib/erp/                ERP: modelos de decisión, permisos/segregación y servicios
src/app/(app)/{erp,compras,almacen,ventas,cobranza,finanzas,gobierno}/   pantallas del ERP
docs/arquitectura-empresarial.md   arquitectura, modelos de decisión y mapeo COBIT/ITIL/ISO
```

## Despliegue

`Dockerfile` incluido (Node 22 + poppler). Monta un volumen en `/data` para la base SQLite y los
archivos, y define `APP_ENCRYPTION_KEY` y `APP_URL`. Para varios usuarios simultáneos se
recomienda PostgreSQL (cambia `provider` en `prisma/schema.prisma` y el adaptador en `src/lib/db.ts`).
