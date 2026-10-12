import Link from "next/link";
import { notFound } from "next/navigation";

import { Aviso, clasesBoton, EncabezadoPagina, EnlaceBoton } from "@/components/ui";
import { BotonCopiar } from "@/components/ui/copiar";
import { obtenerContexto } from "@/lib/auth/contexto";
import { mapaCatalogo } from "@/lib/catalogos";
import type { Catalogo } from "@/lib/constantes";
import { cargarSolicitudCompleta } from "@/lib/solicitudes/consultas";
import { construirHojaCaptura, type MapasCatalogo } from "@/lib/solicitudes/hoja-captura";
import { etiquetaEstado } from "@/lib/solicitudes/presentacion";
import { validarSolicitud } from "@/lib/solicitudes/validacion";

import { BotonImprimir } from "../../_componentes/boton-imprimir";

const CATALOGOS_HOJA: Catalogo[] = [
  "CAT_ENTIDAD",
  "CAT_PAIS",
  "CAT_SCIAN",
  "CAT_REGIMEN",
  "CAT_ADUANA",
  "CAT_CLASIF_PRODUCTO",
  "CAT_SUBCLASIF_PRODUCTO",
  "CAT_TIPO_PRODUCTO",
  "CAT_FORMA_FARMACEUTICA",
  "CAT_ESTADO_FISICO",
  "CAT_UNIDAD_MEDIDA",
  "CAT_USO_ESPECIFICO",
  "CAT_BANCO",
];

export default async function HojaCaptura({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, ctx] = await Promise.all([params, obtenerContexto()]);
  const sol = await cargarSolicitudCompleta(ctx.empresa.id, id);
  if (!sol) notFound();

  const mapas: MapasCatalogo = Object.fromEntries(
    await Promise.all(CATALOGOS_HOJA.map(async (c) => [c, await mapaCatalogo(c)] as const)),
  );
  const hoja = construirHojaCaptura(sol, mapas);
  const validacion = validarSolicitud(sol, { canal: "PORTAL" });
  const generada = new Intl.DateTimeFormat("es-MX", { dateStyle: "long", timeStyle: "short", timeZone: "America/Mexico_City" }).format(new Date());

  return (
    <>
      <div className="no-imprimir">
        <EncabezadoPagina
          titulo="Hoja de captura"
          descripcion="Datos en el orden de las pantallas del portal VUCEM (trámite 260211). Usa «Copiar» en cada dato y el ZIP para los anexos."
          migas={[
            { etiqueta: "Solicitudes", href: "/solicitudes" },
            { etiqueta: `Solicitud ${sol.numero}`, href: `/solicitudes/${sol.id}` },
            { etiqueta: "Hoja de captura" },
          ]}
          acciones={
            <>
              <BotonImprimir />
              {sol.documentos.length > 0 && (
                <a href={`/solicitudes/${sol.id}/anexos`} className={clasesBoton("secundario")} download>
                  Descargar anexos (ZIP)
                </a>
              )}
              <EnlaceBoton href={`/solicitudes/${sol.id}`} variante="fantasma">
                Volver a la solicitud
              </EnlaceBoton>
            </>
          }
        />
        {!validacion.lista && (
          <div className="mb-6">
            <Aviso tono="aviso" titulo={`La validación previa tiene ${validacion.errores.length} error(es)`}>
              Corrígelos antes de capturar en el portal.{" "}
              <Link href={`/solicitudes/${sol.id}`} className="text-primario underline">
                Ver la validación
              </Link>
            </Aviso>
          </div>
        )}
      </div>

      <article className="space-y-8 print:text-[11px]">
        <header className="border-b border-borde pb-3">
          <p className="text-lg font-semibold">
            Solicitud {sol.numero} · Permiso sanitario de importación de dispositivos médicos (VUCEM 260211)
          </p>
          <p className="text-sm text-texto-suave">
            Estado: {etiquetaEstado(sol.estado)}
            {sol.folioVucem && ` · Folio ${sol.folioVucem}`} · Generada el {generada}
          </p>
        </header>

        {hoja.map((seccion) => (
          <section key={seccion.id} aria-labelledby={`hoja-${seccion.id}`} className="space-y-4">
            <h2 id={`hoja-${seccion.id}`} className="text-base font-semibold text-primario print:text-black">
              {seccion.numero}. {seccion.titulo}
            </h2>
            {seccion.grupos.map((grupo, gi) => (
              <div key={`${seccion.id}-${gi}`} className="break-inside-avoid rounded-md border border-borde bg-superficie">
                <div className="border-b border-borde px-4 py-2">
                  <h3 className="text-sm font-semibold">{grupo.titulo}</h3>
                  {grupo.nota && <p className="text-xs text-texto-suave">{grupo.nota}</p>}
                </div>
                {grupo.campos.length > 0 && (
                  <dl className="divide-y divide-borde">
                    {grupo.campos.map((c, ci) => (
                      <div key={ci} className="grid grid-cols-1 gap-1 px-4 py-2 sm:grid-cols-[minmax(0,16rem)_1fr] sm:gap-4">
                        <dt className="text-xs font-medium text-texto-suave sm:text-sm">{c.etiqueta}</dt>
                        <dd className="min-w-0 text-sm">
                          <div className="flex flex-wrap items-center gap-2">
                            {c.valor ? (
                              <>
                                <span className="font-mono break-all">{c.valor}</span>
                                <BotonCopiar valor={c.valor} />
                              </>
                            ) : (
                              <span className="text-texto-suave">—</span>
                            )}
                          </div>
                          {c.descripcion && <p className="text-xs text-texto-suave">{c.descripcion}</p>}
                          {c.nota && <p className="text-xs text-aviso print:text-black">{c.nota}</p>}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
            ))}
          </section>
        ))}
      </article>
    </>
  );
}
