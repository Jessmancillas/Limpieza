import Link from "next/link";
import { notFound } from "next/navigation";

import { Aviso, EncabezadoPagina, Tarjeta } from "@/components/ui";
import { obtenerContexto } from "@/lib/auth/contexto";
import { fechaAInput } from "@/lib/formularios";
import { cargarSolicitudCompleta } from "@/lib/solicitudes/consultas";
import { claveDiaMexico } from "@/lib/solicitudes/fechas";
import { validarSolicitud } from "@/lib/solicitudes/validacion";

import { registrarPresentacion } from "../../acciones-seguimiento";
import { FormPresentacion } from "../../_componentes/formularios-seguimiento";

export default async function PresentarSolicitud({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, ctx] = await Promise.all([params, obtenerContexto()]);
  const sol = await cargarSolicitudCompleta(ctx.empresa.id, id);
  if (!sol) notFound();

  const registrar = sol.estado === "BORRADOR" || sol.estado === "LISTA";
  const corregir = sol.estado === "PRESENTADA" || sol.estado === "REQUERIMIENTO";
  const validacion = registrar ? validarSolicitud(sol, { canal: "PORTAL" }) : null;
  const titulo = registrar ? "Registrar presentación en el portal" : "Datos de presentación";

  return (
    <>
      <EncabezadoPagina
        titulo={titulo}
        descripcion="Después de firmar la solicitud en el portal VUCEM, captura aquí el folio y el acuse para darle seguimiento."
        migas={[
          { etiqueta: "Solicitudes", href: "/solicitudes" },
          { etiqueta: `Solicitud ${sol.numero}`, href: `/solicitudes/${sol.id}` },
          { etiqueta: registrar ? "Registrar presentación" : "Presentación" },
        ]}
      />
      {ctx.rol === "CONSULTA" ? (
        <Aviso tono="aviso">Tu rol es de solo consulta.</Aviso>
      ) : !registrar && !corregir ? (
        <Aviso tono="aviso">La solicitud está {sol.estado === "CANCELADA" ? "cancelada" : "resuelta"}: ya no se registran datos de presentación.</Aviso>
      ) : (
        <div className="space-y-4">
          {validacion && !validacion.lista && (
            <Aviso tono="aviso" titulo={`La validación previa tiene ${validacion.errores.length} error(es)`}>
              Si ya presentaste la solicitud en el portal (corrigiendo los datos allá), registra el folio de todos modos y actualiza la captura
              para que coincida. <Link href={`/solicitudes/${sol.id}`} className="text-primario underline">Ver la validación</Link>.
            </Aviso>
          )}
          {registrar && (
            <p className="text-sm text-texto-suave">
              Al guardar, la solicitud pasa a «Presentada» por el portal y sus datos de captura quedan de solo lectura. Usa la{" "}
              <Link href={`/solicitudes/${sol.id}/hoja-captura`} className="text-primario hover:underline">
                hoja de captura
              </Link>{" "}
              y el ZIP de anexos para llenar el portal.
            </p>
          )}
          <Tarjeta>
            <FormPresentacion
              accion={registrarPresentacion.bind(null, sol.id)}
              inicial={{
                numeroTemporal: sol.numeroTemporal ?? "",
                folioVucem: sol.folioVucem ?? "",
                fechaPresentacion: sol.fechaPresentacion ? fechaAInput(sol.fechaPresentacion) : claveDiaMexico(new Date()),
              }}
              textoBoton={registrar ? "Registrar presentación" : "Guardar cambios"}
              hayAcuse={!!sol.acuseRuta}
            />
          </Tarjeta>
        </div>
      )}
    </>
  );
}
