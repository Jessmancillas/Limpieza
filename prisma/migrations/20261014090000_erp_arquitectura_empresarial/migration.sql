-- ERP: arquitectura empresarial (compras, almacén, ventas, cobranza, finanzas y gobierno COBIT/ITIL/ISO 27001).
-- AlterTable
ALTER TABLE "Membresia" ADD COLUMN "areas" TEXT;

-- CreateTable
CREATE TABLE "ConfiguracionErp" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "empresaId" TEXT NOT NULL,
    "montoAutoAprobacion" INTEGER NOT NULL DEFAULT 500000,
    "montoAprobacionNivel1" INTEGER NOT NULL DEFAULT 5000000,
    "toleranciaPrecioBp" INTEGER NOT NULL DEFAULT 200,
    "toleranciaCantidadBp" INTEGER NOT NULL DEFAULT 0,
    "diasGraciaCredito" INTEGER NOT NULL DEFAULT 15,
    "puntajeCreditoMinimo" INTEGER NOT NULL DEFAULT 60,
    "puntajeCreditoRevision" INTEGER NOT NULL DEFAULT 40,
    "factorServicioZ" INTEGER NOT NULL DEFAULT 165,
    "segregacionEstricta" BOOLEAN NOT NULL DEFAULT true,
    "tasaIvaBp" INTEGER NOT NULL DEFAULT 1600,
    "actualizadoEn" DATETIME NOT NULL,
    CONSTRAINT "ConfiguracionErp_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Almacen" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "empresaId" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "ubicacion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Almacen_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Articulo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "empresaId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "categoria" TEXT,
    "unidad" TEXT NOT NULL DEFAULT 'PZA',
    "precioVenta" INTEGER NOT NULL DEFAULT 0,
    "ultimoCosto" INTEGER NOT NULL DEFAULT 0,
    "tasaIvaBp" INTEGER NOT NULL DEFAULT 1600,
    "stockMinimo" REAL NOT NULL DEFAULT 0,
    "stockMaximo" REAL NOT NULL DEFAULT 0,
    "demandaAnual" REAL NOT NULL DEFAULT 0,
    "costoOrdenar" INTEGER NOT NULL DEFAULT 50000,
    "costoMantenerBp" INTEGER NOT NULL DEFAULT 2500,
    "tiempoEntregaDias" INTEGER NOT NULL DEFAULT 7,
    "desviacionDemandaDiaria" REAL NOT NULL DEFAULT 0,
    "proveedorPreferenteId" TEXT,
    "productoId" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" DATETIME NOT NULL,
    CONSTRAINT "Articulo_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Articulo_proveedorPreferenteId_fkey" FOREIGN KEY ("proveedorPreferenteId") REFERENCES "Proveedor" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Existencia" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "articuloId" TEXT NOT NULL,
    "almacenId" TEXT NOT NULL,
    "cantidad" REAL NOT NULL DEFAULT 0,
    "costoPromedio" INTEGER NOT NULL DEFAULT 0,
    "actualizadoEn" DATETIME NOT NULL,
    CONSTRAINT "Existencia_articuloId_fkey" FOREIGN KEY ("articuloId") REFERENCES "Articulo" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Existencia_almacenId_fkey" FOREIGN KEY ("almacenId") REFERENCES "Almacen" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MovimientoInventario" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "empresaId" TEXT NOT NULL,
    "articuloId" TEXT NOT NULL,
    "almacenId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "cantidad" REAL NOT NULL,
    "costoUnitario" INTEGER NOT NULL,
    "saldoCantidad" REAL NOT NULL,
    "saldoCostoPromedio" INTEGER NOT NULL,
    "referenciaTipo" TEXT,
    "referenciaId" TEXT,
    "motivo" TEXT,
    "creadoPorId" TEXT,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MovimientoInventario_articuloId_fkey" FOREIGN KEY ("articuloId") REFERENCES "Articulo" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MovimientoInventario_almacenId_fkey" FOREIGN KEY ("almacenId") REFERENCES "Almacen" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Proveedor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "empresaId" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "rfc" TEXT,
    "razonSocial" TEXT NOT NULL,
    "contacto" TEXT,
    "correoElectronico" TEXT,
    "telefono" TEXT,
    "diasCredito" INTEGER NOT NULL DEFAULT 30,
    "criticidad" TEXT NOT NULL DEFAULT 'NORMAL',
    "terceroId" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'ACTIVO',
    "notas" TEXT,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" DATETIME NOT NULL,
    CONSTRAINT "Proveedor_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OrdenCompra" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "empresaId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "proveedorId" TEXT NOT NULL,
    "almacenId" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'BORRADOR',
    "fechaEntrega" DATETIME,
    "subtotal" INTEGER NOT NULL DEFAULT 0,
    "iva" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "nivelAprobacion" INTEGER NOT NULL DEFAULT 0,
    "creadoPorId" TEXT,
    "enviadaEn" DATETIME,
    "aprobadoPorId" TEXT,
    "aprobadoEn" DATETIME,
    "motivoRechazo" TEXT,
    "notas" TEXT,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" DATETIME NOT NULL,
    CONSTRAINT "OrdenCompra_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OrdenCompra_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "Proveedor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OrdenCompra_almacenId_fkey" FOREIGN KEY ("almacenId") REFERENCES "Almacen" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PartidaOrdenCompra" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ordenCompraId" TEXT NOT NULL,
    "articuloId" TEXT NOT NULL,
    "cantidad" REAL NOT NULL,
    "cantidadRecibida" REAL NOT NULL DEFAULT 0,
    "costoUnitario" INTEGER NOT NULL,
    "tasaIvaBp" INTEGER NOT NULL DEFAULT 1600,
    CONSTRAINT "PartidaOrdenCompra_ordenCompraId_fkey" FOREIGN KEY ("ordenCompraId") REFERENCES "OrdenCompra" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PartidaOrdenCompra_articuloId_fkey" FOREIGN KEY ("articuloId") REFERENCES "Articulo" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Recepcion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "empresaId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "ordenCompraId" TEXT NOT NULL,
    "almacenId" TEXT NOT NULL,
    "fecha" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "folioFactura" TEXT,
    "importeFactura" INTEGER,
    "conciliacion" TEXT NOT NULL DEFAULT 'SIN_FACTURA',
    "aTiempo" BOOLEAN NOT NULL DEFAULT true,
    "recibidoPorId" TEXT,
    "notas" TEXT,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Recepcion_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Recepcion_ordenCompraId_fkey" FOREIGN KEY ("ordenCompraId") REFERENCES "OrdenCompra" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Recepcion_almacenId_fkey" FOREIGN KEY ("almacenId") REFERENCES "Almacen" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PartidaRecepcion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "recepcionId" TEXT NOT NULL,
    "partidaOrdenId" TEXT NOT NULL,
    "cantidadRecibida" REAL NOT NULL,
    "cantidadRechazada" REAL NOT NULL DEFAULT 0,
    "motivoRechazo" TEXT,
    CONSTRAINT "PartidaRecepcion_recepcionId_fkey" FOREIGN KEY ("recepcionId") REFERENCES "Recepcion" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PartidaRecepcion_partidaOrdenId_fkey" FOREIGN KEY ("partidaOrdenId") REFERENCES "PartidaOrdenCompra" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CuentaPorPagar" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "empresaId" TEXT NOT NULL,
    "proveedorId" TEXT NOT NULL,
    "recepcionId" TEXT,
    "folio" TEXT NOT NULL,
    "fechaEmision" DATETIME NOT NULL,
    "fechaVencimiento" DATETIME NOT NULL,
    "total" INTEGER NOT NULL,
    "saldo" INTEGER NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "liberadaPorId" TEXT,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CuentaPorPagar_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CuentaPorPagar_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "Proveedor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CuentaPorPagar_recepcionId_fkey" FOREIGN KEY ("recepcionId") REFERENCES "Recepcion" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PagoProveedor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cuentaPorPagarId" TEXT NOT NULL,
    "fecha" DATETIME NOT NULL,
    "monto" INTEGER NOT NULL,
    "metodo" TEXT NOT NULL,
    "referencia" TEXT,
    "registradoPorId" TEXT,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PagoProveedor_cuentaPorPagarId_fkey" FOREIGN KEY ("cuentaPorPagarId") REFERENCES "CuentaPorPagar" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Cliente" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "empresaId" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "rfc" TEXT,
    "razonSocial" TEXT NOT NULL,
    "contacto" TEXT,
    "correoElectronico" TEXT,
    "telefono" TEXT,
    "diasCredito" INTEGER NOT NULL DEFAULT 0,
    "limiteCredito" INTEGER NOT NULL DEFAULT 0,
    "estado" TEXT NOT NULL DEFAULT 'ACTIVO',
    "notas" TEXT,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" DATETIME NOT NULL,
    CONSTRAINT "Cliente_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PedidoVenta" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "empresaId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "clienteId" TEXT NOT NULL,
    "almacenId" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'BORRADOR',
    "condicionPago" TEXT NOT NULL DEFAULT 'CONTADO',
    "subtotal" INTEGER NOT NULL DEFAULT 0,
    "iva" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "costoVenta" INTEGER NOT NULL DEFAULT 0,
    "evaluacionCredito" TEXT,
    "autorizadoPorId" TEXT,
    "creadoPorId" TEXT,
    "entregadoEn" DATETIME,
    "notas" TEXT,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" DATETIME NOT NULL,
    CONSTRAINT "PedidoVenta_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PedidoVenta_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PedidoVenta_almacenId_fkey" FOREIGN KEY ("almacenId") REFERENCES "Almacen" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PartidaVenta" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pedidoId" TEXT NOT NULL,
    "articuloId" TEXT NOT NULL,
    "cantidad" REAL NOT NULL,
    "precioUnitario" INTEGER NOT NULL,
    "descuentoBp" INTEGER NOT NULL DEFAULT 0,
    "tasaIvaBp" INTEGER NOT NULL DEFAULT 1600,
    "costoUnitario" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "PartidaVenta_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "PedidoVenta" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PartidaVenta_articuloId_fkey" FOREIGN KEY ("articuloId") REFERENCES "Articulo" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CuentaPorCobrar" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "empresaId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "pedidoId" TEXT,
    "folio" TEXT NOT NULL,
    "fechaEmision" DATETIME NOT NULL,
    "fechaVencimiento" DATETIME NOT NULL,
    "total" INTEGER NOT NULL,
    "saldo" INTEGER NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CuentaPorCobrar_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CuentaPorCobrar_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CuentaPorCobrar_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "PedidoVenta" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Cobro" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cuentaPorCobrarId" TEXT NOT NULL,
    "fecha" DATETIME NOT NULL,
    "monto" INTEGER NOT NULL,
    "metodo" TEXT NOT NULL,
    "referencia" TEXT,
    "registradoPorId" TEXT,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Cobro_cuentaPorCobrarId_fkey" FOREIGN KEY ("cuentaPorCobrarId") REFERENCES "CuentaPorCobrar" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GestionCobranza" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cuentaPorCobrarId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "nota" TEXT NOT NULL,
    "fechaPromesa" DATETIME,
    "registradoPorId" TEXT,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GestionCobranza_cuentaPorCobrarId_fkey" FOREIGN KEY ("cuentaPorCobrarId") REFERENCES "CuentaPorCobrar" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MovimientoTesoreria" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "empresaId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "monto" INTEGER NOT NULL,
    "fecha" DATETIME NOT NULL,
    "concepto" TEXT NOT NULL,
    "referenciaTipo" TEXT,
    "referenciaId" TEXT,
    "registradoPorId" TEXT,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MovimientoTesoreria_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ControlGobierno" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "empresaId" TEXT NOT NULL,
    "marco" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "dominio" TEXT NOT NULL,
    "procesoErp" TEXT,
    "aplicable" BOOLEAN NOT NULL DEFAULT true,
    "justificacion" TEXT,
    "nivelActual" INTEGER NOT NULL DEFAULT 0,
    "nivelObjetivo" INTEGER NOT NULL DEFAULT 3,
    "responsable" TEXT,
    "evidencia" TEXT,
    "revisadoEn" DATETIME,
    "actualizadoEn" DATETIME NOT NULL,
    CONSTRAINT "ControlGobierno_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RiesgoSeguridad" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "empresaId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "activo" TEXT NOT NULL,
    "amenaza" TEXT NOT NULL,
    "vulnerabilidad" TEXT NOT NULL,
    "probabilidad" INTEGER NOT NULL,
    "impacto" INTEGER NOT NULL,
    "tratamiento" TEXT NOT NULL DEFAULT 'MITIGAR',
    "controles" TEXT,
    "responsable" TEXT,
    "probabilidadResidual" INTEGER,
    "impactoResidual" INTEGER,
    "estado" TEXT NOT NULL DEFAULT 'ABIERTO',
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" DATETIME NOT NULL,
    CONSTRAINT "RiesgoSeguridad_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TicketServicio" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "empresaId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "servicio" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "impacto" INTEGER NOT NULL,
    "urgencia" INTEGER NOT NULL,
    "prioridad" INTEGER NOT NULL,
    "tipoCambio" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'NUEVO',
    "venceEn" DATETIME NOT NULL,
    "resueltoEn" DATETIME,
    "solucion" TEXT,
    "reportadoPorId" TEXT,
    "aprobadoPorId" TEXT,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" DATETIME NOT NULL,
    CONSTRAINT "TicketServicio_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ConfiguracionErp_empresaId_key" ON "ConfiguracionErp"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "Almacen_empresaId_clave_key" ON "Almacen"("empresaId", "clave");

-- CreateIndex
CREATE INDEX "Articulo_empresaId_idx" ON "Articulo"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "Articulo_empresaId_sku_key" ON "Articulo"("empresaId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "Existencia_articuloId_almacenId_key" ON "Existencia"("articuloId", "almacenId");

-- CreateIndex
CREATE INDEX "MovimientoInventario_empresaId_creadoEn_idx" ON "MovimientoInventario"("empresaId", "creadoEn");

-- CreateIndex
CREATE INDEX "MovimientoInventario_articuloId_creadoEn_idx" ON "MovimientoInventario"("articuloId", "creadoEn");

-- CreateIndex
CREATE UNIQUE INDEX "Proveedor_empresaId_clave_key" ON "Proveedor"("empresaId", "clave");

-- CreateIndex
CREATE INDEX "OrdenCompra_empresaId_estado_idx" ON "OrdenCompra"("empresaId", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "OrdenCompra_empresaId_numero_key" ON "OrdenCompra"("empresaId", "numero");

-- CreateIndex
CREATE INDEX "PartidaOrdenCompra_ordenCompraId_idx" ON "PartidaOrdenCompra"("ordenCompraId");

-- CreateIndex
CREATE UNIQUE INDEX "Recepcion_empresaId_numero_key" ON "Recepcion"("empresaId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "CuentaPorPagar_recepcionId_key" ON "CuentaPorPagar"("recepcionId");

-- CreateIndex
CREATE INDEX "CuentaPorPagar_empresaId_estado_idx" ON "CuentaPorPagar"("empresaId", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "Cliente_empresaId_clave_key" ON "Cliente"("empresaId", "clave");

-- CreateIndex
CREATE INDEX "PedidoVenta_empresaId_estado_idx" ON "PedidoVenta"("empresaId", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "PedidoVenta_empresaId_numero_key" ON "PedidoVenta"("empresaId", "numero");

-- CreateIndex
CREATE INDEX "PartidaVenta_pedidoId_idx" ON "PartidaVenta"("pedidoId");

-- CreateIndex
CREATE UNIQUE INDEX "CuentaPorCobrar_pedidoId_key" ON "CuentaPorCobrar"("pedidoId");

-- CreateIndex
CREATE INDEX "CuentaPorCobrar_empresaId_estado_idx" ON "CuentaPorCobrar"("empresaId", "estado");

-- CreateIndex
CREATE INDEX "MovimientoTesoreria_empresaId_fecha_idx" ON "MovimientoTesoreria"("empresaId", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "ControlGobierno_empresaId_marco_clave_key" ON "ControlGobierno"("empresaId", "marco", "clave");

-- CreateIndex
CREATE UNIQUE INDEX "RiesgoSeguridad_empresaId_numero_key" ON "RiesgoSeguridad"("empresaId", "numero");

-- CreateIndex
CREATE INDEX "TicketServicio_empresaId_estado_idx" ON "TicketServicio"("empresaId", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "TicketServicio_empresaId_numero_key" ON "TicketServicio"("empresaId", "numero");

