import { Aviso, EncabezadoPagina, EstadoVacio, Tabla, Tarjeta, Td, Th } from "@/components/ui";
import { obtenerContexto } from "@/lib/auth/contexto";
import { db } from "@/lib/db";
import { formatoFecha } from "@/lib/formularios";
import { claveDiaMexico } from "@/lib/solicitudes/fechas";

import { agregarDiaInhabil, eliminarDiaInhabil } from "../acciones-dias-inhabiles";
import { BotonAccion } from "../_componentes/boton-accion";
import { FormDiaInhabil } from "./formulario";

const DIA_SEMANA = new Intl.DateTimeFormat("es-MX", { weekday: "long", timeZone: "UTC" });

export default async function DiasInhabiles() {
  const ctx = await obtenerContexto();
  const dias = await db.diaInhabil.findMany({ orderBy: { fecha: "asc" } });
  const esAdmin = ctx.rol === "ADMIN";
  const anioActual = Number(claveDiaMexico(new Date()).slice(0, 4));
  const porAnio = new Map<number, typeof dias>();
  for (const d of dias) {
    const anio = d.fecha.getUTCFullYear();
    porAnio.set(anio, [...(porAnio.get(anio) ?? []), d]);
  }
  const anios = [...porAnio.keys()].sort((a, b) => b - a);
  const faltaAnio = !porAnio.has(anioActual) || !porAnio.has(anioActual + 1);

  return (
    <>
      <EncabezadoPagina
        titulo="Días inhábiles"
        descripcion="Se usan para calcular la fecha límite de los requerimientos en días hábiles (LFPA art. 28): no cuentan sábados, domingos ni estos días."
        migas={[{ etiqueta: "Solicitudes", href: "/solicitudes" }, { etiqueta: "Días inhábiles" }]}
      />
      <div className="space-y-6">
        <Aviso tono="info" titulo="Agrega los periodos vacacionales de COFEPRIS">
          Además de los días inhábiles oficiales, COFEPRIS publica cada año en el Diario Oficial de la Federación (DOF) sus periodos
          vacacionales y suspensiones de labores. Agrégalos aquí en cuanto se publiquen; al hacerlo se recalculan las fechas límite de los
          requerimientos pendientes de tus empresas. Los días inhábiles aplican a todas las empresas de esta instalación.
        </Aviso>
        {faltaAnio && (
          <Aviso tono="aviso">
            No hay días inhábiles registrados para {porAnio.has(anioActual) ? anioActual + 1 : anioActual}: las fechas límite podrían
            calcularse antes de tiempo.
          </Aviso>
        )}

        {esAdmin ? (
          <Tarjeta titulo="Agregar día inhábil">
            <FormDiaInhabil accion={agregarDiaInhabil} />
          </Tarjeta>
        ) : (
          <p className="text-sm text-texto-suave">Solo un administrador puede agregar o quitar días inhábiles.</p>
        )}

        {dias.length === 0 ? (
          <EstadoVacio titulo="Sin días inhábiles registrados" descripcion="Ejecuta la carga inicial (npm run db:seed) o agrégalos manualmente." />
        ) : (
          anios.map((anio) => (
            <section key={anio} aria-labelledby={`anio-${anio}`} className="space-y-2">
              <h2 id={`anio-${anio}`} className="text-base font-semibold">
                {anio}
              </h2>
              <Tabla>
                <thead>
                  <tr>
                    <Th>Fecha</Th>
                    <Th>Día</Th>
                    <Th>Descripción</Th>
                    {esAdmin && <Th className="text-right">Acciones</Th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-borde">
                  {(porAnio.get(anio) ?? []).map((d) => (
                    <tr key={d.id}>
                      <Td className="whitespace-nowrap">{formatoFecha(d.fecha)}</Td>
                      <Td className="capitalize">{DIA_SEMANA.format(d.fecha)}</Td>
                      <Td>{d.descripcion}</Td>
                      {esAdmin && (
                        <Td className="text-right">
                          <BotonAccion
                            accion={eliminarDiaInhabil.bind(null, d.id)}
                            variante="fantasma"
                            textoEnviando="Eliminando…"
                            confirmar={`¿Eliminar el día inhábil ${formatoFecha(d.fecha)}?`}
                          >
                            Eliminar
                          </BotonAccion>
                        </Td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </Tabla>
            </section>
          ))
        )}
      </div>
    </>
  );
}
