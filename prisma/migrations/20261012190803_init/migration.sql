-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Sesion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tokenHash" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "empresaActivaId" TEXT,
    "expiraEn" DATETIME NOT NULL,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Sesion_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Empresa" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "rfc" TEXT NOT NULL,
    "tipoPersona" TEXT NOT NULL DEFAULT 'MORAL',
    "razonSocial" TEXT,
    "nombre" TEXT,
    "apellidoPaterno" TEXT,
    "apellidoMaterno" TEXT,
    "curp" TEXT,
    "actividadProductiva" TEXT,
    "correoElectronico" TEXT NOT NULL,
    "telefono" TEXT,
    "calle" TEXT,
    "numeroExterior" TEXT,
    "numeroInterior" TEXT,
    "codigoPostal" TEXT,
    "colonia" TEXT,
    "localidad" TEXT,
    "municipio" TEXT,
    "entidadFederativa" TEXT,
    "pais" TEXT NOT NULL DEFAULT 'MEX',
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Membresia" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "usuarioId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "rol" TEXT NOT NULL DEFAULT 'CAPTURISTA',
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Membresia_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Membresia_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CredencialVucem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "empresaId" TEXT NOT NULL,
    "usuarioWs" TEXT NOT NULL,
    "passwordCifrado" TEXT NOT NULL,
    "actualizadoEn" DATETIME NOT NULL,
    "actualizadoPorId" TEXT,
    CONSTRAINT "CredencialVucem_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ConfiguracionVucem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "empresaId" TEXT NOT NULL,
    "ambiente" TEXT NOT NULL DEFAULT 'SIMULADOR',
    "urlSolicitud" TEXT,
    "operacionSolicitud" TEXT,
    "namespaceSolicitud" TEXT,
    "soapActionSolicitud" TEXT,
    "urlDigitalizacion" TEXT,
    "correoDigitalizacion" TEXT,
    "actualizadoEn" DATETIME NOT NULL,
    CONSTRAINT "ConfiguracionVucem_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CatalogoVucem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "catalogo" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "padreClave" TEXT,
    "fuente" TEXT NOT NULL DEFAULT 'SEMILLA',
    "porConfirmar" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "DiaInhabil" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fecha" DATETIME NOT NULL,
    "descripcion" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "TramiteVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "claveVucem" TEXT NOT NULL,
    "homoclave" TEXT,
    "nombre" TEXT NOT NULL,
    "plataforma" TEXT NOT NULL,
    "vigenteDesde" DATETIME NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "definicion" TEXT NOT NULL,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Establecimiento" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "empresaId" TEXT NOT NULL,
    "denominacionRazonSocial" TEXT NOT NULL,
    "rfcResponsableSanitario" TEXT NOT NULL,
    "correoElectronico" TEXT NOT NULL,
    "telefono" TEXT NOT NULL,
    "calle" TEXT NOT NULL,
    "numeroExterior" TEXT,
    "codigoPostal" TEXT NOT NULL,
    "entidadFederativa" TEXT NOT NULL,
    "municipio" TEXT NOT NULL,
    "colonia" TEXT,
    "localidad" TEXT,
    "noLicenciaSanitaria" TEXT,
    "tieneAvisoFuncionamiento" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" DATETIME NOT NULL,
    CONSTRAINT "Establecimiento_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EstablecimientoScian" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "establecimientoId" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "descripcion" TEXT,
    CONSTRAINT "EstablecimientoScian_establecimientoId_fkey" FOREIGN KEY ("establecimientoId") REFERENCES "Establecimiento" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Tercero" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "empresaId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "tipoPersona" TEXT NOT NULL,
    "nacionalidad" TEXT NOT NULL DEFAULT 'EXTRANJERO',
    "nombre" TEXT,
    "apellidoPaterno" TEXT,
    "apellidoMaterno" TEXT,
    "denominacionRazonSocial" TEXT,
    "rfc" TEXT,
    "curp" TEXT,
    "correoElectronico" TEXT,
    "pais" TEXT NOT NULL,
    "entidadFederativa" TEXT,
    "municipio" TEXT,
    "colonia" TEXT,
    "localidad" TEXT,
    "codigoPostal" TEXT,
    "calle" TEXT NOT NULL,
    "numeroExterior" TEXT,
    "numeroInterior" TEXT,
    "lada" TEXT,
    "telefono" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" DATETIME NOT NULL,
    CONSTRAINT "Tercero_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Producto" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "empresaId" TEXT NOT NULL,
    "denominacionEspecifica" TEXT NOT NULL,
    "denominacionDistintiva" TEXT NOT NULL,
    "denominacionComunCientifica" TEXT NOT NULL,
    "idClasificacionProducto" TEXT,
    "idSubClasificacionProducto" TEXT,
    "idTipoProducto" TEXT,
    "especifique" TEXT,
    "idFormaFarmaceutica" TEXT,
    "idEstadoFisico" TEXT,
    "fraccionArancelaria" TEXT NOT NULL,
    "descripcionFraccion" TEXT,
    "umt" TEXT,
    "umc" TEXT,
    "desUMC" TEXT NOT NULL,
    "presentacionTipoEnvase" TEXT NOT NULL,
    "numRegistroSanitario" TEXT,
    "vigenciaRegistroSanitario" DATETIME,
    "cvePaisOrigen" TEXT,
    "idUsoEspecifico" TEXT,
    "fabricanteId" TEXT,
    "notas" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" DATETIME NOT NULL,
    CONSTRAINT "Producto_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Producto_fabricanteId_fkey" FOREIGN KEY ("fabricanteId") REFERENCES "Tercero" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Documento" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "empresaId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "idTipoDocumentoVucem" TEXT,
    "productoId" TEXT,
    "establecimientoId" TEXT,
    "vigenciaHasta" DATETIME,
    "archivoOriginalRuta" TEXT NOT NULL,
    "archivoOriginalNombre" TEXT NOT NULL,
    "archivoOriginalBytes" INTEGER NOT NULL,
    "archivoOriginalMime" TEXT NOT NULL,
    "archivoVucemRuta" TEXT,
    "archivoVucemBytes" INTEGER,
    "sha1Vucem" TEXT,
    "paginas" INTEGER,
    "dpi" INTEGER,
    "estadoConversion" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "reporteConversion" TEXT,
    "estadoEDocument" TEXT NOT NULL DEFAULT 'NO_ENVIADO',
    "numeroOperacionEDoc" TEXT,
    "eDocument" TEXT,
    "numeroTramiteEDoc" TEXT,
    "errorEDocument" TEXT,
    "eDocumentFecha" DATETIME,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorId" TEXT,
    "actualizadoEn" DATETIME NOT NULL,
    CONSTRAINT "Documento_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Documento_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Documento_establecimientoId_fkey" FOREIGN KEY ("establecimientoId") REFERENCES "Establecimiento" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Solicitud" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "numero" INTEGER NOT NULL,
    "empresaId" TEXT NOT NULL,
    "tramiteVersionId" TEXT NOT NULL,
    "establecimientoId" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'BORRADOR',
    "cveRegimen" TEXT,
    "cveAduana" TEXT,
    "cveDeclaracion" BOOLEAN NOT NULL DEFAULT false,
    "informacionConfidencial" BOOLEAN NOT NULL DEFAULT false,
    "rlRfc" TEXT,
    "rlNombre" TEXT,
    "rlApellidoPaterno" TEXT,
    "rlApellidoMaterno" TEXT,
    "pagoOmitido" BOOLEAN NOT NULL DEFAULT false,
    "claveReferencia" TEXT,
    "cadenaDependencia" TEXT,
    "cveBanco" TEXT,
    "llavePago" TEXT,
    "fechaPago" DATETIME,
    "importePago" TEXT,
    "canalPresentacion" TEXT,
    "numeroTemporal" TEXT,
    "folioVucem" TEXT,
    "fechaPresentacion" DATETIME,
    "acuseRuta" TEXT,
    "notas" TEXT,
    "creadoPorId" TEXT,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" DATETIME NOT NULL,
    CONSTRAINT "Solicitud_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Solicitud_tramiteVersionId_fkey" FOREIGN KEY ("tramiteVersionId") REFERENCES "TramiteVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Solicitud_establecimientoId_fkey" FOREIGN KEY ("establecimientoId") REFERENCES "Establecimiento" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PartidaSolicitud" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "solicitudId" TEXT NOT NULL,
    "productoId" TEXT,
    "orden" INTEGER NOT NULL,
    "idClasificacionProducto" TEXT,
    "idSubClasificacionProducto" TEXT,
    "denominacionEspecifica" TEXT NOT NULL,
    "denominacionDistintiva" TEXT NOT NULL,
    "denominacionComunCientifica" TEXT NOT NULL,
    "idTipoProducto" TEXT,
    "especifique" TEXT,
    "idFormaFarmaceutica" TEXT,
    "idEstadoFisico" TEXT,
    "fraccionArancelaria" TEXT NOT NULL,
    "descripcionFraccion" TEXT,
    "cantidadUMT" TEXT NOT NULL,
    "cantidadUMC" TEXT NOT NULL,
    "umt" TEXT,
    "umc" TEXT,
    "desUMC" TEXT NOT NULL,
    "presentacionTipoEnvase" TEXT NOT NULL,
    "numRegistroSanitario" TEXT,
    "fechaCaducidad" DATETIME,
    "cvePaisOrigen" TEXT NOT NULL,
    "cvePaisProcedencia" TEXT NOT NULL,
    "idUsoEspecifico" TEXT,
    "resultado" TEXT,
    CONSTRAINT "PartidaSolicitud_solicitudId_fkey" FOREIGN KEY ("solicitudId") REFERENCES "Solicitud" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PartidaSolicitud_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SolicitudTercero" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "solicitudId" TEXT NOT NULL,
    "terceroId" TEXT NOT NULL,
    "rol" TEXT NOT NULL,
    CONSTRAINT "SolicitudTercero_solicitudId_fkey" FOREIGN KEY ("solicitudId") REFERENCES "Solicitud" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SolicitudTercero_terceroId_fkey" FOREIGN KEY ("terceroId") REFERENCES "Tercero" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SolicitudDocumento" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "solicitudId" TEXT NOT NULL,
    "documentoId" TEXT NOT NULL,
    "requisito" TEXT NOT NULL,
    CONSTRAINT "SolicitudDocumento_solicitudId_fkey" FOREIGN KEY ("solicitudId") REFERENCES "Solicitud" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SolicitudDocumento_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "Documento" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Requerimiento" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "solicitudId" TEXT NOT NULL,
    "fechaNotificacion" DATETIME NOT NULL,
    "plazoDiasHabiles" INTEGER NOT NULL,
    "fechaLimite" DATETIME NOT NULL,
    "descripcion" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "fechaAtencion" DATETIME,
    "notas" TEXT,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Requerimiento_solicitudId_fkey" FOREIGN KEY ("solicitudId") REFERENCES "Solicitud" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Resolucion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "solicitudId" TEXT NOT NULL,
    "sentido" TEXT NOT NULL,
    "numeroPermiso" TEXT,
    "fechaResolucion" DATETIME NOT NULL,
    "vigenciaHasta" DATETIME,
    "restricciones" TEXT,
    "observaciones" TEXT,
    "documentoRuta" TEXT,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Resolucion_solicitudId_fkey" FOREIGN KEY ("solicitudId") REFERENCES "Solicitud" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EnvioVucem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "empresaId" TEXT NOT NULL,
    "solicitudId" TEXT,
    "documentoId" TEXT,
    "tipo" TEXT NOT NULL,
    "ambiente" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "cadenaOriginal" TEXT,
    "requestXml" TEXT NOT NULL,
    "responseXml" TEXT,
    "httpStatus" INTEGER,
    "exito" BOOLEAN NOT NULL DEFAULT false,
    "mensaje" TEXT,
    "resultado" TEXT,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorId" TEXT,
    CONSTRAINT "EnvioVucem_solicitudId_fkey" FOREIGN KEY ("solicitudId") REFERENCES "Solicitud" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "EnvioVucem_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "Documento" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Bitacora" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "empresaId" TEXT,
    "usuarioId" TEXT,
    "accion" TEXT NOT NULL,
    "entidad" TEXT NOT NULL,
    "entidadId" TEXT,
    "detalle" TEXT,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Bitacora_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Sesion_tokenHash_key" ON "Sesion"("tokenHash");

-- CreateIndex
CREATE INDEX "Sesion_usuarioId_idx" ON "Sesion"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "Empresa_rfc_key" ON "Empresa"("rfc");

-- CreateIndex
CREATE UNIQUE INDEX "Membresia_usuarioId_empresaId_key" ON "Membresia"("usuarioId", "empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "CredencialVucem_empresaId_key" ON "CredencialVucem"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "ConfiguracionVucem_empresaId_key" ON "ConfiguracionVucem"("empresaId");

-- CreateIndex
CREATE INDEX "CatalogoVucem_catalogo_idx" ON "CatalogoVucem"("catalogo");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogoVucem_catalogo_clave_key" ON "CatalogoVucem"("catalogo", "clave");

-- CreateIndex
CREATE UNIQUE INDEX "DiaInhabil_fecha_key" ON "DiaInhabil"("fecha");

-- CreateIndex
CREATE UNIQUE INDEX "TramiteVersion_claveVucem_vigenteDesde_key" ON "TramiteVersion"("claveVucem", "vigenteDesde");

-- CreateIndex
CREATE INDEX "Establecimiento_empresaId_idx" ON "Establecimiento"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "EstablecimientoScian_establecimientoId_clave_key" ON "EstablecimientoScian"("establecimientoId", "clave");

-- CreateIndex
CREATE INDEX "Tercero_empresaId_tipo_idx" ON "Tercero"("empresaId", "tipo");

-- CreateIndex
CREATE INDEX "Producto_empresaId_idx" ON "Producto"("empresaId");

-- CreateIndex
CREATE INDEX "Documento_empresaId_tipo_idx" ON "Documento"("empresaId", "tipo");

-- CreateIndex
CREATE INDEX "Solicitud_empresaId_estado_idx" ON "Solicitud"("empresaId", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "Solicitud_empresaId_numero_key" ON "Solicitud"("empresaId", "numero");

-- CreateIndex
CREATE INDEX "PartidaSolicitud_solicitudId_idx" ON "PartidaSolicitud"("solicitudId");

-- CreateIndex
CREATE UNIQUE INDEX "SolicitudTercero_solicitudId_terceroId_rol_key" ON "SolicitudTercero"("solicitudId", "terceroId", "rol");

-- CreateIndex
CREATE UNIQUE INDEX "SolicitudDocumento_solicitudId_documentoId_key" ON "SolicitudDocumento"("solicitudId", "documentoId");

-- CreateIndex
CREATE UNIQUE INDEX "Resolucion_solicitudId_key" ON "Resolucion"("solicitudId");

-- CreateIndex
CREATE INDEX "EnvioVucem_empresaId_creadoEn_idx" ON "EnvioVucem"("empresaId", "creadoEn");

-- CreateIndex
CREATE INDEX "Bitacora_empresaId_creadoEn_idx" ON "Bitacora"("empresaId", "creadoEn");
