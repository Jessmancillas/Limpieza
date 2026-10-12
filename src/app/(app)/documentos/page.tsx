import Link from "next/link";

import { Aviso, clasesBoton, EncabezadoPagina, EnlaceBoton, Entrada, EstadoVacio, Selector, Tabla, Td, Th } from "@/components/ui";
import { obtenerContexto } from "@/lib/auth/contexto";
import {
  ESTADOS_CONVERSION,
  ESTADOS_EDOCUMENT,
  ETIQUETA_TIPO_DOCUMENTO,
  TIPOS_DOCUMENTO,
  type TipoDocumento,
} from "@/lib/constantes";
import { db } from "@/lib/db";
import { formatoBytes } from "@/lib/pdf/limites";

import {
  ETIQUETA_ESTADO_CONVERSION,
  ETIQUETA_ESTADO_EDOCUMENT,
  esEstadoConversion,
  esEstadoEDocument,
} from "./_lib/esquema";
import { estadoVigencia, parametro } from "./_lib/utilidades";
import { InsigniaConversion, InsigniaEDocument, InsigniaVigencia } from "./insignias";

/** Máximo de documentos que se muestran (los más recientes). */
const LIMITE = 300;

export default async function Documentos({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [sp, ctx] = await Promise.all([searchParams, obtenerContexto()]);
  const empresaId = ctx.empresa.id;
  const tipoParam = parametro(sp.tipo);
  const tipo = (TIPOS_DOCUMENTO as readonly string[]).includes(tipoParam) ? (tipoParam as TipoDocumento) : "";
  const conversionParam = parametro(sp.conversion);
  const conversion = esEstadoConversion(conversionParam) ? conversionParam : "";
  const edocParam = parametro(sp.edoc);
  const edoc = esEstadoEDocument(edocParam) ? edocParam : "";
  const q = parametro(sp.q).slice(0, 100);
  const hayFiltros = Boolean(tipo || conversion || edoc || q);

  const [documentos, total] = await Promise.all([
    db.documento.findMany({
      where: {
        empresaId,
        ...(tipo ? { tipo } : {}),
        ...(conversion ? { estadoConversion: conversion } : {}),
        ...(edoc ? { estadoEDocument: edoc } : {}),
        ...(q
          ? { OR: [{ nombre: { contains: q } }, { archivoOriginalNombre: { contains: q } }, { eDocument: { contains: q } }] }
          : {}),
      },
      select: {
        id: true,
        nombre: true,
        tipo: true,
        archivoOriginalNombre: true,
        archivoOriginalBytes: true,
        archivoVucemRuta: true,
        archivoVucemBytes: true,
        paginas: true,
        vigenciaHasta: true,
        estadoConversion: true,
        estadoEDocument: true,
        eDocument: true,
        producto: { select: { id: true, denominacionEspecifica: true } },
        establecimiento: { select: { id: true, denominacionRazonSocial: true } },
      },
      orderBy: { creadoEn: "desc" },
      take: LIMITE,
    }),
    db.documento.count({ where: { empresaId } }),
  ]);

  const puedeEditar = ctx.rol !== "CONSULTA";
  const ahora = new Date();
  const conErrorConversion = documentos.filter((d) => d.estadoConversion === "ERROR").length;
  const porAtender = documentos.filter((d) => {
    const e = estadoVigencia(d.vigenciaHasta, ahora).estado;
    return e === "VENCIDO" || e === "POR_VENCER";
  }).length;

  return (
    <>
      <EncabezadoPagina
        titulo="Documentos"
        descripcion="Anexos del trámite (licencias, avisos, registros sanitarios, etc.). Al subirlos se convierten al formato que exige VUCEM: PDF en escala de grises a 300 dpi, sin formularios ni páginas en blanco."
        migas={[{ etiqueta: "Inicio", href: "/" }, { etiqueta: "Documentos" }]}
        acciones={puedeEditar && <EnlaceBoton href="/documentos/nuevo">+ Subir documento</EnlaceBoton>}
      />

      <div className="mb-4 space-y-3">
        {sp.eliminado && <Aviso tono="exito">Documento eliminado.</Aviso>}
        {!hayFiltros && conErrorConversion > 0 && (
          <Aviso tono="peligro">
            {conErrorConversion} documento{conErrorConversion === 1 ? " no se pudo" : "s no se pudieron"} convertir al formato VUCEM.{" "}
            <Link href="/documentos?conversion=ERROR" className="font-medium underline">
              Ver cuáles
            </Link>
          </Aviso>
        )}
        {!hayFiltros && porAtender > 0 && (
          <Aviso tono="aviso">
            {porAtender} documento{porAtender === 1 ? " está vencido o vence" : "s están vencidos o vencen"} en 60 días o menos.
          </Aviso>
        )}
      </div>

      <form action="/documentos" role="search" aria-label="Filtrar documentos" className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_repeat(3,minmax(0,12rem))_auto]">
        <div>
          <label htmlFor="q" className="sr-only">
            Buscar
          </label>
          <Entrada id="q" name="q" type="search" defaultValue={q} placeholder="Nombre, archivo o eDocument" />
        </div>
        <div>
          <label htmlFor="tipo" className="sr-only">
            Tipo de documento
          </label>
          <Selector id="tipo" name="tipo" defaultValue={tipo}>
            <option value="">Todos los tipos</option>
            {TIPOS_DOCUMENTO.map((t) => (
              <option key={t} value={t}>
                {ETIQUETA_TIPO_DOCUMENTO[t]}
              </option>
            ))}
          </Selector>
        </div>
        <div>
          <label htmlFor="conversion" className="sr-only">
            Estado de conversión
          </label>
          <Selector id="conversion" name="conversion" defaultValue={conversion}>
            <option value="">Cualquier conversión</option>
            {ESTADOS_CONVERSION.map((e) => (
              <option key={e} value={e}>
                {ETIQUETA_ESTADO_CONVERSION[e]}
              </option>
            ))}
          </Selector>
        </div>
        <div>
          <label htmlFor="edoc" className="sr-only">
            Estado de digitalización (eDocument)
          </label>
          <Selector id="edoc" name="edoc" defaultValue={edoc}>
            <option value="">Cualquier eDocument</option>
            {ESTADOS_EDOCUMENT.map((e) => (
              <option key={e} value={e}>
                {ETIQUETA_ESTADO_EDOCUMENT[e]}
              </option>
            ))}
          </Selector>
        </div>
        <div className="flex gap-2">
          <button type="submit" className={clasesBoton("secundario")}>
            Filtrar
          </button>
          {hayFiltros && (
            <Link href="/documentos" className={clasesBoton("fantasma")}>
              Limpiar
            </Link>
          )}
        </div>
      </form>

      {documentos.length === 0 ? (
        <EstadoVacio
          titulo={total === 0 ? "Aún no hay documentos" : "Sin resultados"}
          descripcion={
            total === 0
              ? "Sube la licencia sanitaria o aviso de funcionamiento, el aviso de responsable sanitario y los registros sanitarios de tus productos. Se convierten solos al formato de VUCEM."
              : "No hay documentos con esos filtros."
          }
          accion={puedeEditar && total === 0 && <EnlaceBoton href="/documentos/nuevo">Subir documento</EnlaceBoton>}
        />
      ) : (
        <>
          <Tabla>
            <thead>
              <tr>
                <Th>Documento</Th>
                <Th>Tipo</Th>
                <Th>Ligado a</Th>
                <Th>Vigencia</Th>
                <Th>Conversión</Th>
                <Th className="text-right">Págs.</Th>
                <Th className="text-right">Tamaño</Th>
                <Th>eDocument</Th>
                <Th>
                  <span className="sr-only">Acciones</span>
                </Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {documentos.map((d) => (
                <tr key={d.id}>
                  <Td className="max-w-[18rem]">
                    <Link href={`/documentos/${d.id}`} className="font-medium break-words text-primario hover:underline">
                      {d.nombre}
                    </Link>
                    <span className="block truncate text-xs text-texto-suave" title={d.archivoOriginalNombre}>
                      {d.archivoOriginalNombre}
                    </span>
                  </Td>
                  <Td className="text-xs">{ETIQUETA_TIPO_DOCUMENTO[d.tipo as TipoDocumento] ?? d.tipo}</Td>
                  <Td className="max-w-[14rem] text-xs">
                    {d.producto && (
                      <Link href={`/productos/${d.producto.id}`} className="block break-words hover:text-primario hover:underline">
                        {d.producto.denominacionEspecifica}
                      </Link>
                    )}
                    {d.establecimiento && (
                      <Link
                        href={`/establecimientos/${d.establecimiento.id}`}
                        className="block break-words hover:text-primario hover:underline"
                      >
                        {d.establecimiento.denominacionRazonSocial}
                      </Link>
                    )}
                    {!d.producto && !d.establecimiento && <span className="text-texto-suave">—</span>}
                  </Td>
                  <Td>
                    <InsigniaVigencia vigenciaHasta={d.vigenciaHasta} ahora={ahora} />
                  </Td>
                  <Td>
                    <InsigniaConversion estado={d.estadoConversion} />
                  </Td>
                  <Td className="text-right tabular-nums">{d.paginas ?? "—"}</Td>
                  <Td className="text-right whitespace-nowrap tabular-nums">
                    {d.archivoVucemBytes !== null ? (
                      formatoBytes(d.archivoVucemBytes)
                    ) : (
                      <span className="text-texto-suave" title="Tamaño del original">
                        {formatoBytes(d.archivoOriginalBytes)}
                      </span>
                    )}
                  </Td>
                  <Td>
                    <InsigniaEDocument estado={d.estadoEDocument} />
                    {d.eDocument && <span className="mt-0.5 block font-mono text-xs">{d.eDocument}</span>}
                  </Td>
                  <Td className="whitespace-nowrap">
                    <div className="flex flex-col items-start gap-1">
                      <Link href={`/documentos/${d.id}`} className="text-xs text-primario hover:underline">
                        Ver detalle
                      </Link>
                      {d.archivoVucemRuta && (
                        <a
                          href={`/api/documentos/${d.id}/archivo?version=vucem`}
                          className="text-xs text-primario hover:underline"
                          aria-label={`Descargar PDF para VUCEM de ${d.nombre}`}
                        >
                          Descargar PDF
                        </a>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Tabla>
          {documentos.length === LIMITE && (
            <p className="mt-2 text-xs text-texto-suave">Se muestran los {LIMITE} documentos más recientes; usa los filtros para encontrar otros.</p>
          )}
        </>
      )}
    </>
  );
}
