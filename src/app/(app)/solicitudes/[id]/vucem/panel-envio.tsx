"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Firmador, type ResultadoFirma } from "@/components/firma/firmador";
import { Aviso, Casilla } from "@/components/ui";
import type { AmbienteVucem } from "@/lib/constantes";

import { enviarSolicitudVucem } from "./acciones";
import type { ResultadoEnvio } from "./tipos";

/** Paso 2: firma la cadena original de la solicitud en el navegador y la envía al WS 260211. */
export function PanelEnvio({
  solicitudId,
  cadena,
  rfcEsperado,
  ambiente,
  requiereConfirmacionReenvio,
}: {
  solicitudId: string;
  cadena: string;
  rfcEsperado: string;
  ambiente: AmbienteVucem;
  requiereConfirmacionReenvio: boolean;
}) {
  const router = useRouter();
  const [resultado, setResultado] = useState<ResultadoEnvio | null>(null);
  const [confirmaProduccion, setConfirmaProduccion] = useState(false);
  const [confirmaReenvio, setConfirmaReenvio] = useState(false);

  const bloqueado =
    (ambiente === "PRODUCCION" && !confirmaProduccion) || (requiereConfirmacionReenvio && !confirmaReenvio) || Boolean(resultado?.folio);

  async function alFirmar(firma: ResultadoFirma) {
    try {
      const r = await enviarSolicitudVucem(solicitudId, {
        certificadoBase64: firma.certificadoBase64,
        cadenaOriginal: cadena,
        firma: firma.firmas[0],
        confirmarReenvio: confirmaReenvio,
      });
      setResultado(r);
    } catch {
      setResultado({
        ok: false,
        mensaje: "No se pudo completar el envío (error de conexión con el servidor). Revisa el historial antes de volver a enviar.",
      });
    }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {resultado && (
        <Aviso tono={resultado.ok ? "exito" : "peligro"} titulo={resultado.ok ? "Solicitud enviada" : "No se presentó la solicitud"}>
          <p>{resultado.mensaje}</p>
          {resultado.detalles && resultado.detalles.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
              {resultado.detalles.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          )}
        </Aviso>
      )}

      {ambiente === "PRODUCCION" && (
        <Casilla
          checked={confirmaProduccion}
          onChange={(e) => setConfirmaProduccion(e.target.checked)}
          etiqueta="Confirmo que revisé la solicitud y quiero presentarla ante COFEPRIS en VUCEM (producción)."
        />
      )}
      {requiereConfirmacionReenvio && (
        <Aviso tono="aviso" titulo="Ya hubo un envío aceptado sin folio">
          <Casilla
            checked={confirmaReenvio}
            onChange={(e) => setConfirmaReenvio(e.target.checked)}
            etiqueta="Revisé en el portal de VUCEM que la solicitud anterior no quedó registrada y quiero enviarla de nuevo."
          />
        </Aviso>
      )}

      <Firmador
        cadenas={[cadena]}
        rfcEsperado={rfcEsperado}
        onFirmado={alFirmar}
        deshabilitado={bloqueado}
        textoBoton={ambiente === "SIMULADOR" ? "Firmar y enviar al simulador" : "Firmar y enviar a VUCEM"}
        textoProcesando="Firmando y enviando…"
      />
    </div>
  );
}
