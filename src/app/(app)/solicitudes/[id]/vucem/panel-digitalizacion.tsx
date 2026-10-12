"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { Firmador, type CertificadoPublico, type ResultadoFirma } from "@/components/firma/firmador";
import { Aviso, Boton } from "@/components/ui";

import { consultarEstadoDigitalizacion, enviarDigitalizacion, prepararDigitalizacion } from "./acciones";
import type { CadenaDocumento, ResultadoPorDocumento } from "./tipos";

const INTERVALO_MS = 10_000;
const MAXIMO_SONDEO_MS = 5 * 60_000;

type Mensaje = { tono: "exito" | "peligro" | "info" | "aviso"; texto: string; resultados?: ResultadoPorDocumento[] };

/**
 * Paso 1: firma y envía a digitalizar los anexos sin eDocument y consulta su estado.
 * Flujo: .cer → el servidor prepara las cadenas (empiezan con el RFC del firmante) → .key y
 * contraseña → firma en el navegador → el servidor verifica y envía cada registro.
 */
export function PanelDigitalizacion({
  solicitudId,
  rfcEsperado,
  porDigitalizar,
  pendientes,
}: {
  solicitudId: string;
  rfcEsperado: string;
  porDigitalizar: number;
  pendientes: number;
}) {
  const router = useRouter();
  const [cadenas, setCadenas] = useState<CadenaDocumento[]>([]);
  const [omitidos, setOmitidos] = useState<Array<{ nombre: string; motivo: string }>>([]);
  const [preparando, setPreparando] = useState(false);
  const [mensaje, setMensaje] = useState<Mensaje | null>(null);
  const [consultando, iniciarConsulta] = useTransition();
  const [sondeoActivo, setSondeoActivo] = useState(pendientes > 0);
  const [sondeoAgotado, setSondeoAgotado] = useState(false);
  const inicioSondeo = useRef<number | null>(null);
  const solicitudPreparacion = useRef(0);

  const alCargarCertificado = useCallback(
    async (cert: CertificadoPublico | null) => {
      const turno = ++solicitudPreparacion.current;
      setCadenas([]);
      setOmitidos([]);
      if (!cert) return;
      setPreparando(true);
      try {
        const r = await prepararDigitalizacion(solicitudId, cert.certificadoBase64);
        if (turno !== solicitudPreparacion.current) return;
        if (!r.ok) {
          setMensaje({ tono: "peligro", texto: r.mensaje });
          return;
        }
        setCadenas(r.documentos);
        setOmitidos(r.omitidos);
        setMensaje(null);
      } catch {
        if (turno === solicitudPreparacion.current) setMensaje({ tono: "peligro", texto: "No se pudieron preparar las cadenas. Intenta de nuevo." });
      } finally {
        if (turno === solicitudPreparacion.current) setPreparando(false);
      }
    },
    [solicitudId],
  );

  async function alFirmar(resultado: ResultadoFirma) {
    const firmas = cadenas.map((c, i) => ({ documentoId: c.documentoId, cadena: c.cadena, firma: resultado.firmas[i] }));
    try {
      const r = await enviarDigitalizacion(solicitudId, { certificadoBase64: resultado.certificadoBase64, firmas });
      setMensaje({ tono: r.ok ? "exito" : "aviso", texto: r.mensaje, resultados: r.resultados });
      if (r.resultados.some((x) => x.ok)) {
        inicioSondeo.current = null;
        setSondeoActivo(true);
        setSondeoAgotado(false);
      }
    } catch {
      setMensaje({ tono: "peligro", texto: "No se pudo completar el envío. Revisa el historial antes de reintentar." });
    }
    setCadenas([]);
    router.refresh();
  }

  const consultar = useCallback(
    (automatico: boolean) => {
      iniciarConsulta(async () => {
        try {
          const r = await consultarEstadoDigitalizacion(solicitudId);
          if (!automatico || r.pendientes === 0 || !r.ok) {
            setMensaje({ tono: r.ok ? (r.resultados.some((x) => !x.ok) && r.pendientes === 0 ? "aviso" : "info") : "peligro", texto: r.mensaje, resultados: r.resultados });
          }
          if (r.pendientes === 0) setSondeoActivo(false);
          router.refresh();
        } catch {
          if (!automatico) setMensaje({ tono: "peligro", texto: "No se pudo consultar el estado. Intenta de nuevo." });
        }
      });
    },
    [router, solicitudId],
  );

  // Sondeo automático cada 10 s mientras haya documentos en proceso (máximo 5 minutos).
  useEffect(() => {
    if (pendientes === 0 || !sondeoActivo) return;
    inicioSondeo.current ??= Date.now();
    const inicio = inicioSondeo.current;
    const temporizador = setInterval(() => {
      if (Date.now() - inicio > MAXIMO_SONDEO_MS) {
        clearInterval(temporizador);
        inicioSondeo.current = null;
        setSondeoActivo(false);
        setSondeoAgotado(true);
        return;
      }
      consultar(true);
    }, INTERVALO_MS);
    return () => clearInterval(temporizador);
  }, [pendientes, sondeoActivo, consultar]);

  return (
    <div className="space-y-4">
      {mensaje && (
        <Aviso tono={mensaje.tono}>
          <p>{mensaje.texto}</p>
          {mensaje.resultados && mensaje.resultados.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
              {mensaje.resultados.map((r) => (
                <li key={r.documentoId}>
                  <strong>{r.nombre}:</strong> {r.mensaje}
                </li>
              ))}
            </ul>
          )}
        </Aviso>
      )}

      {pendientes > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-borde px-3 py-2 text-sm">
          <span>
            {pendientes} documento(s) en proceso en VUCEM.{" "}
            {sondeoActivo
              ? "Se consulta automáticamente cada 10 segundos (hasta 5 minutos)."
              : sondeoAgotado
                ? "La consulta automática se detuvo; consulta manualmente más tarde."
                : null}
          </span>
          <Boton variante="secundario" tamano="sm" onClick={() => consultar(false)} disabled={consultando} aria-busy={consultando}>
            {consultando ? "Consultando…" : "Consultar estado"}
          </Boton>
        </div>
      )}

      {porDigitalizar > 0 ? (
        <div className="space-y-3 rounded-md border border-borde p-4">
          <p className="text-sm">
            Hay {porDigitalizar} documento(s) listos para digitalizar. Carga tu e.firma: primero el .cer (para calcular las cadenas con tu
            RFC) y luego el .key y su contraseña.
          </p>
          {omitidos.length > 0 && (
            <Aviso tono="aviso" titulo="No se incluirán">
              <ul className="list-disc pl-5 text-xs">
                {omitidos.map((o) => (
                  <li key={o.nombre}>
                    {o.nombre}: {o.motivo}
                  </li>
                ))}
              </ul>
            </Aviso>
          )}
          <Firmador
            cadenas={cadenas.map((c) => c.cadena)}
            rfcEsperado={rfcEsperado}
            onCertificado={alCargarCertificado}
            onFirmado={alFirmar}
            cargandoCadenas={preparando}
            mensajeSinCadenas="No hay documentos que se puedan digitalizar con este certificado."
            textoBoton={cadenas.length > 1 ? `Firmar y digitalizar ${cadenas.length} documentos` : "Firmar y digitalizar"}
            textoProcesando="Firmando y enviando…"
          />
        </div>
      ) : (
        pendientes === 0 && <p className="text-sm text-texto-suave">No hay documentos pendientes de digitalizar.</p>
      )}
    </div>
  );
}
