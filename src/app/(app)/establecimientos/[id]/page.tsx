import Link from "next/link";
import { notFound } from "next/navigation";

import { Aviso, Datos, EncabezadoPagina, EnlaceBoton, Insignia, Tarjeta } from "@/components/ui";
import { obtenerContexto } from "@/lib/auth/contexto";
import { describirClave, obtenerOpcionesCatalogo } from "@/lib/catalogos";
import {
  ETIQUETA_ESTADO_SOLICITUD,
  ETIQUETA_TIPO_DOCUMENTO,
  type EstadoSolicitud,
  type TipoDocumento,
} from "@/lib/constantes";
import { db } from "@/lib/db";
import { formatoFecha } from "@/lib/formularios";
import { faltaLicenciaOAviso } from "@/lib/validacion/establecimiento";

import { AccionesRegistro } from "../_compartido/acciones-registro";
import { cambiarActivoEstablecimiento, eliminarEstablecimiento, guardarEstablecimiento } from "../acciones";
import { FormularioEstablecimiento } from "../formulario";

export default async function DetalleEstablecimiento({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, sp, ctx] = await Promise.all([params, searchParams, obtenerContexto()]);
  const empresaId = ctx.empresa.id;
  const est = await db.establecimiento.findFirst({
    where: { id, empresaId },
    include: {
      scian: { orderBy: { clave: "asc" } },
      solicitudes: {
        where: { empresaId },
        select: { id: true, numero: true, estado: true },
        orderBy: { numero: "desc" },
        take: 20,
      },
      documentos: {
        where: { empresaId },
        select: { id: true, tipo: true, nombre: true, vigenciaHasta: true },
        orderBy: { creadoEn: "desc" },
      },
      _count: { select: { solicitudes: true } },
    },
  });
  if (!est) notFound();

  const puedeEditar = ctx.rol !== "CONSULTA";
  const [opcionesEntidad, opcionesScian] = await Promise.all([
    obtenerOpcionesCatalogo("CAT_ENTIDAD"),
    obtenerOpcionesCatalogo("CAT_SCIAN"),
  ]);
  const volver = encodeURIComponent(`/establecimientos/${est.id}`);

  return (
    <>
      <EncabezadoPagina
        titulo={est.denominacionRazonSocial}
        descripcion={
          <span className="inline-flex flex-wrap items-center gap-2">
            {est.activo ? <Insignia tono="exito">Activo</Insignia> : <Insignia>Inactivo</Insignia>}
            {est.noLicenciaSanitaria && <Insignia tono="info">Licencia {est.noLicenciaSanitaria}</Insignia>}
            {est.tieneAvisoFuncionamiento && <Insignia tono="info">Aviso de funcionamiento</Insignia>}
            {faltaLicenciaOAviso(est) && <Insignia tono="aviso">Sin licencia ni aviso</Insignia>}
          </span>
        }
        migas={[{ etiqueta: "Establecimientos", href: "/establecimientos" }, { etiqueta: est.denominacionRazonSocial }]}
      />

      <div className="space-y-4">
        {sp.creado && <Aviso tono="exito">Establecimiento creado.</Aviso>}
        {!est.activo && (
          <Aviso tono="aviso">Este establecimiento está inactivo: no se ofrece al capturar solicitudes nuevas.</Aviso>
        )}
        {est._count.solicitudes > 0 && puedeEditar && (
          <Aviso tono="info">
            Se usa en {est._count.solicitudes} solicitud{est._count.solicitudes === 1 ? "" : "es"}. Los cambios se reflejan en las
            solicitudes que aún no se presentan; revisa las presentadas antes de modificar datos.
          </Aviso>
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_20rem]">
        <Tarjeta titulo={puedeEditar ? "Editar datos" : "Datos"}>
          {puedeEditar ? (
            <FormularioEstablecimiento
              accion={guardarEstablecimiento.bind(null, est.id)}
              inicial={{
                denominacionRazonSocial: est.denominacionRazonSocial,
                rfcResponsableSanitario: est.rfcResponsableSanitario,
                correoElectronico: est.correoElectronico,
                telefono: est.telefono,
                calle: est.calle,
                numeroExterior: est.numeroExterior,
                codigoPostal: est.codigoPostal,
                entidadFederativa: est.entidadFederativa,
                municipio: est.municipio,
                colonia: est.colonia,
                localidad: est.localidad,
                noLicenciaSanitaria: est.noLicenciaSanitaria,
                tieneAvisoFuncionamiento: est.tieneAvisoFuncionamiento,
                scian: est.scian.map((s) => ({ clave: s.clave, descripcion: s.descripcion })),
              }}
              opcionesEntidad={opcionesEntidad}
              opcionesScian={opcionesScian}
              textoBoton="Guardar cambios"
            />
          ) : (
            <Datos
              filas={[
                ["Denominación o razón social", est.denominacionRazonSocial],
                ["RFC del responsable sanitario", est.rfcResponsableSanitario],
                ["Correo electrónico", est.correoElectronico],
                ["Teléfono", est.telefono],
                ["Calle y número", [est.calle, est.numeroExterior].filter(Boolean).join(" ")],
                ["Código postal", est.codigoPostal],
                ["Entidad federativa", await describirClave("CAT_ENTIDAD", est.entidadFederativa)],
                ["Municipio o alcaldía", est.municipio],
                ["Colonia", est.colonia],
                ["Localidad", est.localidad],
                ["Licencia sanitaria", est.noLicenciaSanitaria],
                ["Aviso de funcionamiento", est.tieneAvisoFuncionamiento ? "Sí" : "No"],
                ["SCIAN", est.scian.map((s) => `${s.clave}${s.descripcion ? ` · ${s.descripcion}` : ""}`).join("; ")],
              ]}
            />
          )}
        </Tarjeta>

        <div className="space-y-6">
          {puedeEditar && (
            <Tarjeta titulo="Estado">
              <AccionesRegistro
                activo={est.activo}
                usos={est._count.solicitudes}
                nombre={est.denominacionRazonSocial}
                accionActivo={cambiarActivoEstablecimiento.bind(null, est.id)}
                accionEliminar={eliminarEstablecimiento.bind(null, est.id)}
                nota={est.documentos.length > 0 ? "Si lo eliminas, sus documentos se conservan pero quedan sin establecimiento." : undefined}
              />
            </Tarjeta>
          )}

          <Tarjeta titulo="Documentos" descripcion="Licencia sanitaria, aviso de funcionamiento y aviso de responsable.">
            {est.documentos.length === 0 ? (
              <p className="text-sm text-texto-suave">Sin documentos ligados.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {est.documentos.map((d) => (
                  <li key={d.id}>
                    <Link href={`/documentos/${d.id}`} className="font-medium text-primario hover:underline">
                      {d.nombre}
                    </Link>
                    <span className="block text-xs text-texto-suave">
                      {ETIQUETA_TIPO_DOCUMENTO[d.tipo as TipoDocumento] ?? d.tipo}
                      {d.vigenciaHasta && ` · vigente hasta ${formatoFecha(d.vigenciaHasta)}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {puedeEditar && (
              <div className="mt-4 flex flex-col gap-2">
                <EnlaceBoton
                  variante="secundario"
                  tamano="sm"
                  href={`/documentos/nuevo?tipo=${est.tieneAvisoFuncionamiento ? "AVISO_FUNCIONAMIENTO" : "LICENCIA_SANITARIA"}&establecimientoId=${est.id}&volver=${volver}`}
                >
                  Subir {est.tieneAvisoFuncionamiento ? "aviso de funcionamiento" : "licencia sanitaria"}
                </EnlaceBoton>
                <EnlaceBoton
                  variante="fantasma"
                  tamano="sm"
                  href={`/documentos/nuevo?tipo=AVISO_RESPONSABLE&establecimientoId=${est.id}&volver=${volver}`}
                >
                  Subir aviso de responsable sanitario
                </EnlaceBoton>
              </div>
            )}
          </Tarjeta>

          <Tarjeta titulo="Solicitudes">
            {est.solicitudes.length === 0 ? (
              <p className="text-sm text-texto-suave">Aún no se usa en solicitudes.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {est.solicitudes.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-2">
                    <Link href={`/solicitudes/${s.id}`} className="font-medium text-primario hover:underline">
                      Solicitud {s.numero}
                    </Link>
                    <Insignia>{ETIQUETA_ESTADO_SOLICITUD[s.estado as EstadoSolicitud] ?? s.estado}</Insignia>
                  </li>
                ))}
                {est._count.solicitudes > est.solicitudes.length && (
                  <li className="text-xs text-texto-suave">y {est._count.solicitudes - est.solicitudes.length} más…</li>
                )}
              </ul>
            )}
          </Tarjeta>
        </div>
      </div>
    </>
  );
}
