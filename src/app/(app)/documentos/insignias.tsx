import { Insignia } from "@/components/ui";
import { formatoFecha } from "@/lib/formularios";

import { ETIQUETA_ESTADO_CONVERSION, ETIQUETA_ESTADO_EDOCUMENT, esEstadoConversion, esEstadoEDocument } from "./_lib/esquema";
import { estadoVigencia } from "./_lib/utilidades";

/** Vigencia del documento: vencido, por vencer (≤ 60 días), vigente o sin fecha. */
export function InsigniaVigencia({ vigenciaHasta, ahora }: { vigenciaHasta: Date | null; ahora?: Date }) {
  const v = estadoVigencia(vigenciaHasta, ahora);
  const fecha = formatoFecha(vigenciaHasta);
  switch (v.estado) {
    case "SIN_VIGENCIA":
      return <span className="text-xs text-texto-suave">Sin vigencia</span>;
    case "VENCIDO":
      return <Insignia tono="peligro">Vencido el {fecha}</Insignia>;
    case "POR_VENCER":
      return (
        <Insignia tono="aviso">
          {v.dias === 0 ? "Vence hoy" : `Vence en ${v.dias} día${v.dias === 1 ? "" : "s"}`} ({fecha})
        </Insignia>
      );
    case "VIGENTE":
      return <Insignia tono="exito">Vigente al {fecha}</Insignia>;
  }
}

export function InsigniaConversion({ estado }: { estado: string }) {
  if (!esEstadoConversion(estado)) return <Insignia>{estado}</Insignia>;
  const tono = ({ PENDIENTE: "neutro", OK: "exito", ADVERTENCIA: "aviso", ERROR: "peligro" } as const)[estado];
  return <Insignia tono={tono}>{ETIQUETA_ESTADO_CONVERSION[estado]}</Insignia>;
}

export function InsigniaEDocument({ estado }: { estado: string }) {
  if (!esEstadoEDocument(estado)) return <Insignia>{estado}</Insignia>;
  const tono = ({ NO_ENVIADO: "neutro", PENDIENTE: "info", OK: "exito", ERROR: "peligro" } as const)[estado];
  return <Insignia tono={tono}>{ETIQUETA_ESTADO_EDOCUMENT[estado]}</Insignia>;
}
