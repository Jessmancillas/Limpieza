import { Insignia } from "@/components/ui";
import { formatoFecha } from "@/lib/formularios";
import { estadoRegistroSanitario } from "@/lib/validacion/producto";

/** Insignia con el estado del registro sanitario (vencido, por vencer ≤ 90 días, vigente, sin registro). */
export function InsigniaRegistro({
  numRegistroSanitario,
  vigenciaRegistroSanitario,
  hoy,
}: {
  numRegistroSanitario: string | null;
  vigenciaRegistroSanitario: Date | null;
  hoy?: Date;
}) {
  const { estado, dias } = estadoRegistroSanitario({ numRegistroSanitario, vigenciaRegistroSanitario }, hoy);
  const fecha = formatoFecha(vigenciaRegistroSanitario);
  switch (estado) {
    case "SIN_REGISTRO":
      return <Insignia>Sin registro</Insignia>;
    case "SIN_VIGENCIA":
      return <Insignia tono="info">Sin fecha de vigencia</Insignia>;
    case "VENCIDO":
      return <Insignia tono="peligro">Vencido el {fecha}</Insignia>;
    case "POR_VENCER":
      return (
        <Insignia tono="aviso">
          {dias === 0 ? "Vence hoy" : `Vence en ${dias} día${dias === 1 ? "" : "s"}`} ({fecha})
        </Insignia>
      );
    case "VIGENTE":
      return <Insignia tono="exito">Vigente al {fecha}</Insignia>;
  }
}
