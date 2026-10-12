import { describe, expect, it } from "vitest";

import { rutaVolverSegura } from "@/app/(app)/establecimientos/_compartido/rutas";

describe("rutaVolverSegura", () => {
  it("acepta rutas internas", () => {
    expect(rutaVolverSegura("/productos/nuevo")).toBe("/productos/nuevo");
    expect(rutaVolverSegura("/solicitudes/abc?paso=2")).toBe("/solicitudes/abc?paso=2");
  });

  it.each([undefined, null, "", "productos", "//evil.example", "https://evil.example", "/\\evil.example", "/\t/evil.example", "/a".repeat(300)])(
    "rechaza %j",
    (valor) => {
      expect(rutaVolverSegura(valor)).toBeNull();
    },
  );
});
