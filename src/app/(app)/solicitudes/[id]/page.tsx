import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { Aviso, clasesBoton, Datos, EncabezadoPagina, EnlaceBoton, Insignia, Tarjeta } from "@/components/ui";
import { obtenerContexto } from "@/lib/auth/contexto";
import { obtenerOpcionesCatalogo } from "@/lib/catalogos";
import { db } from "@/lib/db";
import { fechaAInput } from "@/lib/formularios";
import { cargarSolicitudCompleta, ESTADOS_NO_EDITABLES } from "@/lib/solicitudes/consultas";
import { obtenerDiasInhabiles } from "@/lib/solicitudes/dias-inhabiles-bd";
import { ESTADOS_EN_SEGUIMIENTO, etiquetaEstado, tonoEstado } from "@/lib/solicitudes/presentacion";
import { SECCION, validarSolicitud, type ResultadoValidacion } from "@/lib/solicitudes/validacion";
import { leerDefinicion, type DefinicionTramite } from "@/lib/tramite/definicion";
import { nombreEmpresa } from "@/lib/validacion/empresa";
import { estadoRegistroSanitario } from "@/lib/validacion/producto";
import { nombreTercero } from "@/lib/validacion/tercero";

import {
  cancelarSolicitud,
  duplicarSolicitud,
  guardarDatosGenerales,
  guardarManifiestos,
  guardarPago,
  guardarRepresentante,
  ligarSugeridos,
  marcarLista,
} from "../acciones";
import { agregarPartida, guardarPartida, quitarPartida, recopiarPartida } from "../acciones-partidas";
import { BotonAccion } from "../_componentes/boton-accion";
import { FormDatosGenerales } from "./_componentes/form-datos-generales";
import { FormManifiestos, FormPago, FormRepresentante } from "./_componentes/formularios-varios";
import { PanelValidacion } from "./_componentes/panel-validacion";
import { SeccionDocumentos } from "./_componentes/seccion-documentos";
import { SeccionMercancias, type PartidaVista, type ProductoOpcion } from "./_componentes/seccion-mercancias";
import { SeccionSeguimiento } from "./_componentes/seccion-seguimiento";
import { SeccionTerceros } from "./_componentes/seccion-terceros";

function parametro(v: string | string[] | undefined): string | undefined {
  const x = Array.isArray(v) ? v[0] : v;
  return x?.trim() || undefined;
}

/** Sección con ancla para los enlaces del panel de validación. */
function Seccion({
  id,
  titulo,
  descripcion,
  acciones,
  problemas,
  children,
}: {
  id: string;
  titulo: string;
  descripcion?: ReactNode;
  acciones?: ReactNode;
  problemas?: { errores: number; avisos: number };
  children: ReactNode;
}) {
  return (
    <div id={id} className="scroll-mt-4">
      <Tarjeta
        titulo={
          <span className="inline-flex flex-wrap items-center gap-2">
            {titulo}
            {problemas && problemas.errores > 0 && <Insignia tono="peligro">{problemas.errores} por corregir</Insignia>}
            {problemas && problemas.errores === 0 && problemas.avisos > 0 && <Insignia tono="aviso">{problemas.avisos} aviso(s)</Insignia>}
            {problemas && problemas.errores === 0 && problemas.avisos === 0 && <Insignia tono="exito">Completo</Insignia>}
          </span>
        }
        descripcion={descripcion}
        acciones={acciones}
      >
        {children}
      </Tarjeta>
    </div>
  );
}

function contar(r: ResultadoValidacion, ...secciones: string[]) {
  return {
    errores: r.errores.filter((p) => secciones.includes(p.seccion)).length,
    avisos: r.avisos.filter((p) => secciones.includes(p.seccion)).length,
  };
}

export default async function DetalleSolicitud({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, sp, ctx] = await Promise.all([params, searchParams, obtenerContexto()]);
  const empresaId = ctx.empresa.id;
  const sol = await cargarSolicitudCompleta(empresaId, id);
  if (!sol) notFound();

  const puedeEditar = ctx.rol !== "CONSULTA";
  const editable = puedeEditar && !ESTADOS_NO_EDITABLES.has(sol.estado);
  // También se muestra el seguimiento de una solicitud presentada que después se canceló.
  const enSeguimiento = ESTADOS_EN_SEGUIMIENTO.has(sol.estado) || !!sol.folioVucem;
  const hoy = new Date();
  const portal = validarSolicitud(sol, { canal: "PORTAL", hoy });
  const ws = validarSolicitud(sol, { canal: "WS", hoy });
  let definicion: DefinicionTramite | null = null;
  try {
    definicion = leerDefinicion(sol.tramiteVersion.definicion);
  } catch {
    definicion = null;
  }

  const [
    regimen,
    aduana,
    pais,
    usoEspecifico,
    banco,
    clasificacion,
    subclasificacion,
    tipoProducto,
    formaFarmaceutica,
    estadoFisico,
    unidadMedida,
    establecimientos,
    productos,
    terceros,
    documentos,
    inhabiles,
  ] = await Promise.all([
    obtenerOpcionesCatalogo("CAT_REGIMEN"),
    obtenerOpcionesCatalogo("CAT_ADUANA"),
    obtenerOpcionesCatalogo("CAT_PAIS"),
    obtenerOpcionesCatalogo("CAT_USO_ESPECIFICO"),
    obtenerOpcionesCatalogo("CAT_BANCO"),
    obtenerOpcionesCatalogo("CAT_CLASIF_PRODUCTO"),
    obtenerOpcionesCatalogo("CAT_SUBCLASIF_PRODUCTO"),
    obtenerOpcionesCatalogo("CAT_TIPO_PRODUCTO"),
    obtenerOpcionesCatalogo("CAT_FORMA_FARMACEUTICA"),
    obtenerOpcionesCatalogo("CAT_ESTADO_FISICO"),
    obtenerOpcionesCatalogo("CAT_UNIDAD_MEDIDA"),
    editable
      ? db.establecimiento.findMany({
          where: { empresaId, OR: [{ activo: true }, ...(sol.establecimientoId ? [{ id: sol.establecimientoId }] : [])] },
          select: { id: true, denominacionRazonSocial: true, activo: true },
          orderBy: { denominacionRazonSocial: "asc" },
        })
      : [],
    editable
      ? db.producto.findMany({
          where: { empresaId, activo: true },
          orderBy: { denominacionEspecifica: "asc" },
          select: {
            id: true,
            denominacionEspecifica: true,
            denominacionDistintiva: true,
            fraccionArancelaria: true,
            numRegistroSanitario: true,
            vigenciaRegistroSanitario: true,
            cvePaisOrigen: true,
            idUsoEspecifico: true,
            desUMC: true,
          },
        })
      : [],
    editable
      ? db.tercero.findMany({
          where: { empresaId, activo: true },
          select: {
            id: true,
            tipo: true,
            tipoPersona: true,
            nombre: true,
            apellidoPaterno: true,
            apellidoMaterno: true,
            denominacionRazonSocial: true,
            rfc: true,
            pais: true,
          },
        })
      : [],
    editable
      ? db.documento.findMany({
          where: { empresaId },
          orderBy: { creadoEn: "desc" },
          take: 500,
          select: {
            id: true,
            tipo: true,
            nombre: true,
            productoId: true,
            establecimientoId: true,
            estadoConversion: true,
            vigenciaHasta: true,
            producto: { select: { denominacionEspecifica: true } },
          },
        })
      : [],
    enSeguimiento ? obtenerDiasInhabiles() : Promise.resolve([] as Date[]),
  ]);

  const est = sol.establecimiento;
  const opcionesEstablecimiento = editable
    ? establecimientos.map((e) => ({ id: e.id, nombre: e.denominacionRazonSocial, activo: e.activo }))
    : est
      ? [{ id: est.id, nombre: est.denominacionRazonSocial, activo: est.activo }]
      : [];

  const productosOpcion: ProductoOpcion[] = productos.map((p) => {
    const r = estadoRegistroSanitario(p, hoy);
    const alerta =
      r.estado === "VENCIDO"
        ? "registro sanitario vencido"
        : r.estado === "POR_VENCER"
          ? `registro vence en ${r.dias} día(s)`
          : r.estado === "SIN_REGISTRO"
            ? "sin registro sanitario"
            : null;
    return {
      id: p.id,
      nombre: p.denominacionEspecifica,
      marca: p.denominacionDistintiva,
      fraccion: p.fraccionArancelaria,
      registro: p.numRegistroSanitario,
      cvePaisOrigen: p.cvePaisOrigen,
      idUsoEspecifico: p.idUsoEspecifico,
      desUMC: p.desUMC,
      alerta,
    };
  });

  const partidas: PartidaVista[] = sol.partidas.map((p) => ({
    id: p.id,
    productoId: p.productoId,
    resultado: p.resultado,
    valores: {
      idClasificacionProducto: p.idClasificacionProducto,
      idSubClasificacionProducto: p.idSubClasificacionProducto,
      denominacionEspecifica: p.denominacionEspecifica,
      denominacionDistintiva: p.denominacionDistintiva,
      denominacionComunCientifica: p.denominacionComunCientifica,
      idTipoProducto: p.idTipoProducto,
      especifique: p.especifique,
      idFormaFarmaceutica: p.idFormaFarmaceutica,
      idEstadoFisico: p.idEstadoFisico,
      fraccionArancelaria: p.fraccionArancelaria,
      descripcionFraccion: p.descripcionFraccion,
      cantidadUMT: p.cantidadUMT,
      cantidadUMC: p.cantidadUMC,
      umt: p.umt,
      umc: p.umc,
      desUMC: p.desUMC,
      presentacionTipoEnvase: p.presentacionTipoEnvase,
      numRegistroSanitario: p.numRegistroSanitario,
      fechaCaducidad: fechaAInput(p.fechaCaducidad),
      cvePaisOrigen: p.cvePaisOrigen,
      cvePaisProcedencia: p.cvePaisProcedencia,
      idUsoEspecifico: p.idUsoEspecifico,
    },
    accionGuardar: guardarPartida.bind(null, sol.id, p.id),
    accionQuitar: quitarPartida.bind(null, sol.id, p.id),
    accionRecopiar: p.productoId ? recopiarPartida.bind(null, sol.id, p.id) : null,
  }));

  const tercerosCandidatos = terceros
    .map((t) => ({ id: t.id, tipo: t.tipo, nombre: nombreTercero(t), detalle: [t.rfc, t.pais].filter(Boolean).join(" · ") }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  const nuevoTerceroId = parametro(sp.nuevoTerceroId);
  // Al regresar de "Subir nuevo" (?requisito=) se preselecciona el documento más reciente de ese requisito.
  const requisitoSubido = definicion?.requisitos.find((r) => r.clave === parametro(sp.requisito));
  const ligadosIds = new Set(sol.documentos.map((d) => d.documentoId));
  const documentoSubido = requisitoSubido
    ? documentos.find((d) => (requisitoSubido.tipos as readonly string[]).includes(d.tipo) && !ligadosIds.has(d.id))
    : undefined;
  const sugeridos = parametro(sp.sugeridos)?.split("-").map(Number);
  const borradorOLista = sol.estado === "BORRADOR" || sol.estado === "LISTA";
  const cancelable = sol.estado !== "CANCELADA" && !sol.estado.startsWith("RESUELTA_");
  const empresa = sol.empresa;

  const secciones: Array<{ id: string; titulo: string; c: { errores: number; avisos: number } }> = [
    { id: "datos-generales", titulo: "Datos generales", c: contar(portal, SECCION.ESTABLECIMIENTO, SECCION.REGIMEN_ADUANA) },
    { id: "mercancias", titulo: "Mercancías", c: contar(portal, SECCION.MERCANCIAS) },
    { id: "manifiestos", titulo: "Manifiestos y declaraciones", c: contar(portal, SECCION.MANIFIESTOS) },
    { id: "representante", titulo: "Representante legal", c: contar(portal, SECCION.REPRESENTANTE) },
    { id: "terceros", titulo: "Terceros relacionados", c: contar(portal, SECCION.TERCEROS) },
    { id: "pago", titulo: "Pago de derechos", c: contar(portal, SECCION.PAGO) },
    { id: "documentos", titulo: "Requisitos y anexos", c: contar(portal, SECCION.DOCUMENTOS) },
  ];

  return (
    <>
      <EncabezadoPagina
        titulo={`Solicitud ${sol.numero}`}
        descripcion={
          <span className="inline-flex flex-wrap items-center gap-2">
            <Insignia tono={tonoEstado(sol.estado)}>{etiquetaEstado(sol.estado)}</Insignia>
            <span>{est?.denominacionRazonSocial ?? "Sin establecimiento"}</span>
            {sol.folioVucem && <span className="font-mono text-xs">Folio {sol.folioVucem}</span>}
          </span>
        }
        migas={[{ etiqueta: "Solicitudes", href: "/solicitudes" }, { etiqueta: `Solicitud ${sol.numero}` }]}
        acciones={
          <>
            <EnlaceBoton href={`/solicitudes/${sol.id}/hoja-captura`} variante="secundario">
              Hoja de captura
            </EnlaceBoton>
            {sol.documentos.length > 0 && (
              <a href={`/solicitudes/${sol.id}/anexos`} className={clasesBoton("secundario")} download>
                Descargar anexos (ZIP)
              </a>
            )}
            {puedeEditar && borradorOLista && (
              <>
                <EnlaceBoton href={`/solicitudes/${sol.id}/vucem`}>Enviar por servicio web</EnlaceBoton>
                <EnlaceBoton href={`/solicitudes/${sol.id}/presentar`} variante="secundario">
                  Registrar presentación en portal
                </EnlaceBoton>
              </>
            )}
            {!borradorOLista && sol.envios.length > 0 && (
              <EnlaceBoton href={`/solicitudes/${sol.id}/vucem`} variante="secundario">
                Servicio web
              </EnlaceBoton>
            )}
          </>
        }
      />

      <div className="mb-6 space-y-3">
        {sp.creada && (
          <Aviso tono="exito" titulo="Borrador creado">
            {sugeridos && sugeridos.some((n) => n > 0)
              ? `Se ligaron automáticamente ${sugeridos[0] ?? 0} documento(s) y ${sugeridos[1] ?? 0} tercero(s) de tus catálogos. `
              : ""}
            Completa cada sección; el panel de validación indica lo que falta.
          </Aviso>
        )}
        {sp.duplicada && (
          <Aviso tono="exito" titulo={`Copia de la solicitud ${parametro(sp.duplicada)}`}>
            Se copiaron mercancías, terceros, anexos y representante. Captura el pago de derechos y acepta la declaración.
          </Aviso>
        )}
        {sp.presentada && <Aviso tono="exito">Presentación registrada. Da seguimiento a requerimientos y resolución abajo.</Aviso>}
        {sp.presentacion && <Aviso tono="exito">Datos de presentación actualizados.</Aviso>}
        {nuevoTerceroId && editable && (
          <Aviso tono="info">
            Tercero creado: está preseleccionado en la sección{" "}
            <Link href="#terceros" className="text-primario underline">
              Terceros
            </Link>
            ; pulsa «Agregar» para ligarlo.
          </Aviso>
        )}
        {requisitoSubido && documentoSubido && editable && (
          <Aviso tono="info">
            Documento «{documentoSubido.nombre}» subido: está preseleccionado en{" "}
            <Link href="#documentos" className="text-primario underline">
              {requisitoSubido.nombre}
            </Link>
            ; pulsa «Ligar» para anexarlo a la solicitud.
          </Aviso>
        )}
        {sol.estado === "CANCELADA" && <Aviso tono="aviso">Esta solicitud está cancelada. Puedes duplicarla para empezar otra con los mismos datos.</Aviso>}
        {puedeEditar && !editable && sol.estado !== "CANCELADA" && (
          <Aviso tono="info">La solicitud ya se presentó: los datos de captura son de solo lectura.</Aviso>
        )}
        {!puedeEditar && <Aviso tono="info">Tu rol es de solo consulta.</Aviso>}
      </div>

      {enSeguimiento && (
        <div className="mb-6">
          <SeccionSeguimiento sol={sol} inhabiles={inhabiles} puedeEditar={puedeEditar} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <aside className="lg:order-2">
          <div className="space-y-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
            <PanelValidacion
              portal={portal}
              ws={ws}
              estado={sol.estado}
              borradorEditable={editable && sol.estado === "BORRADOR"}
              accionMarcarLista={marcarLista.bind(null, sol.id)}
            />
            <nav aria-label="Secciones de la solicitud" className="rounded-lg border border-borde bg-superficie px-4 py-3 text-sm">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-texto-suave">Secciones</p>
              <ol className="space-y-1">
                {secciones.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2">
                    <a href={`#${s.id}`} className="text-primario hover:underline">
                      {s.titulo}
                    </a>
                    {s.c.errores > 0 ? (
                      <span className="text-xs text-peligro">{s.c.errores} ✕</span>
                    ) : s.c.avisos > 0 ? (
                      <span className="text-xs text-aviso">{s.c.avisos} !</span>
                    ) : (
                      <span className="text-xs text-exito" aria-label="completo">
                        ✓
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            </nav>
            {puedeEditar && (
              <div className="space-y-2 rounded-lg border border-borde bg-superficie px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-texto-suave">Más acciones</p>
                <BotonAccion accion={duplicarSolicitud.bind(null, sol.id)} textoEnviando="Duplicando…">
                  Duplicar solicitud
                </BotonAccion>
                {cancelable && (
                  <BotonAccion
                    accion={cancelarSolicitud.bind(null, sol.id)}
                    variante="peligro"
                    textoEnviando="Cancelando…"
                    confirmar={
                      borradorOLista
                        ? `¿Cancelar la solicitud ${sol.numero}? Ya no se podrá editar.`
                        : `¿Marcar como cancelada la solicitud ${sol.numero}? Esto solo cambia su estado en la app; el desistimiento ante COFEPRIS se presenta en VUCEM.`
                    }
                  >
                    Cancelar solicitud
                  </BotonAccion>
                )}
              </div>
            )}
          </div>
        </aside>

        <div className="min-w-0 space-y-6 lg:order-1">
          <div id="solicitante" className="scroll-mt-4">
            <Tarjeta
              titulo="Solicitante"
              descripcion="Datos de la empresa activa; VUCEM los toma de la e.firma."
              acciones={
                ctx.rol === "ADMIN" && (
                  <EnlaceBoton href="/configuracion/empresa" variante="fantasma" tamano="sm">
                    Editar empresa
                  </EnlaceBoton>
                )
              }
            >
              <Datos
                filas={[
                  ["RFC", <span key="rfc" className="font-mono">{empresa.rfc}</span>],
                  ["Nombre o razón social", nombreEmpresa(empresa)],
                  ["Tipo de persona", empresa.tipoPersona === "MORAL" ? "Moral" : "Física"],
                  ["Correo electrónico", empresa.correoElectronico],
                ]}
              />
            </Tarjeta>
          </div>

          <Seccion
            id="datos-generales"
            titulo="Datos generales"
            descripcion="Establecimiento donde se almacenarán los dispositivos, régimen y aduana de entrada."
            problemas={contar(portal, SECCION.ESTABLECIMIENTO, SECCION.REGIMEN_ADUANA)}
          >
            <div className="space-y-5">
              <FormDatosGenerales
                accion={guardarDatosGenerales.bind(null, sol.id)}
                inicial={{ establecimientoId: sol.establecimientoId, cveRegimen: sol.cveRegimen, cveAduana: sol.cveAduana }}
                establecimientos={opcionesEstablecimiento}
                opcionesRegimen={regimen}
                opcionesAduana={aduana}
                soloLectura={!editable}
              />
              {est && (
                <div className="rounded-md bg-fondo px-4 py-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">Datos del establecimiento</p>
                    {puedeEditar && (
                      <Link href={`/establecimientos/${est.id}`} className="text-sm text-primario hover:underline">
                        Editar establecimiento
                      </Link>
                    )}
                  </div>
                  <Datos
                    filas={[
                      [
                        "Domicilio",
                        [est.calle, est.numeroExterior, est.colonia, est.localidad, `C.P. ${est.codigoPostal}`, est.municipio, est.entidadFederativa]
                          .filter(Boolean)
                          .join(", "),
                      ],
                      ["Responsable sanitario (RFC)", est.rfcResponsableSanitario],
                      ["Correo y teléfono", `${est.correoElectronico} · ${est.telefono}`],
                      [
                        "Licencia o aviso",
                        est.noLicenciaSanitaria
                          ? `Licencia sanitaria ${est.noLicenciaSanitaria}`
                          : est.tieneAvisoFuncionamiento
                            ? "Aviso de funcionamiento"
                            : "Sin licencia ni aviso",
                      ],
                      ["SCIAN", est.scian.map((s) => s.clave).join(", ") || "—"],
                    ]}
                  />
                </div>
              )}
            </div>
          </Seccion>

          <Seccion
            id="mercancias"
            titulo={`Mercancías (${sol.partidas.length})`}
            descripcion="Dispositivos médicos a importar. Los datos se copian del catálogo de productos y se pueden ajustar en esta solicitud."
            problemas={contar(portal, SECCION.MERCANCIAS)}
          >
            <SeccionMercancias
              partidas={partidas}
              productos={productosOpcion}
              opciones={{ clasificacion, subclasificacion, tipoProducto, formaFarmaceutica, estadoFisico, unidadMedida, pais, usoEspecifico }}
              accionAgregar={agregarPartida.bind(null, sol.id)}
              soloLectura={!editable}
            />
          </Seccion>

          <Seccion id="manifiestos" titulo="Manifiestos y declaraciones" problemas={contar(portal, SECCION.MANIFIESTOS)}>
            <FormManifiestos
              accion={guardarManifiestos.bind(null, sol.id)}
              inicial={{ cveDeclaracion: sol.cveDeclaracion, informacionConfidencial: sol.informacionConfidencial }}
              soloLectura={!editable}
            />
          </Seccion>

          <Seccion
            id="representante"
            titulo="Representante legal"
            descripcion="Quien firma la solicitud. Si el RFC es de persona física (13 caracteres), el nombre y el apellido paterno son obligatorios."
            problemas={contar(portal, SECCION.REPRESENTANTE)}
          >
            <FormRepresentante
              accion={guardarRepresentante.bind(null, sol.id)}
              inicial={{
                rlRfc: sol.rlRfc,
                rlNombre: sol.rlNombre,
                rlApellidoPaterno: sol.rlApellidoPaterno,
                rlApellidoMaterno: sol.rlApellidoMaterno,
              }}
              soloLectura={!editable}
            />
          </Seccion>

          <Seccion
            id="terceros"
            titulo="Terceros relacionados"
            descripcion="El portal exige al menos un fabricante y el destinatario."
            problemas={contar(portal, SECCION.TERCEROS)}
          >
            <SeccionTerceros sol={sol} candidatos={tercerosCandidatos} editable={editable} nuevoTerceroId={nuevoTerceroId} />
          </Seccion>

          <Seccion
            id="pago"
            titulo="Pago de derechos"
            descripcion="Datos del comprobante e5cinco (hoja de ayuda y recibo bancario)."
            problemas={contar(portal, SECCION.PAGO)}
          >
            <FormPago
              accion={guardarPago.bind(null, sol.id)}
              inicial={{
                pagoOmitido: sol.pagoOmitido,
                claveReferencia: sol.claveReferencia,
                cadenaDependencia: sol.cadenaDependencia,
                cveBanco: sol.cveBanco,
                llavePago: sol.llavePago,
                fechaPago: fechaAInput(sol.fechaPago),
                importePago: sol.importePago,
              }}
              opcionesBanco={banco}
              soloLectura={!editable}
            />
          </Seccion>

          <Seccion
            id="documentos"
            titulo="Requisitos y anexos"
            descripcion="Documentos que se anexan a la solicitud, según la definición vigente del trámite."
            problemas={contar(portal, SECCION.DOCUMENTOS)}
            acciones={
              editable && (
                <BotonAccion accion={ligarSugeridos.bind(null, sol.id)} variante="secundario" textoEnviando="Buscando…">
                  Ligar documentos sugeridos
                </BotonAccion>
              )
            }
          >
            <SeccionDocumentos
              sol={sol}
              definicion={definicion}
              candidatos={documentos}
              editable={editable}
              preseleccion={requisitoSubido && documentoSubido ? { [requisitoSubido.clave]: documentoSubido.id } : {}}
            />
          </Seccion>
        </div>
      </div>
    </>
  );
}
