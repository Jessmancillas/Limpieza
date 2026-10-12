import { describe, expect, it } from "vitest";

import { esCatalogo } from "@/app/(app)/catalogos-vucem/info";
import { resumirDetalle } from "@/app/(app)/configuracion/bitacora/resumen";
import { generarPasswordTemporal } from "@/app/(app)/configuracion/usuarios/password-temporal";

describe("esCatalogo", () => {
  it("acepta solo catálogos de CATALOGOS", () => {
    expect(esCatalogo("CAT_PAIS")).toBe(true);
    expect(esCatalogo("CAT_INEXISTENTE")).toBe(false);
    expect(esCatalogo("constructor")).toBe(false);
    expect(esCatalogo("__proto__")).toBe(false);
  });
});

describe("generarPasswordTemporal", () => {
  it("genera 16 caracteres con minúscula, mayúscula, dígito y símbolo", () => {
    for (let i = 0; i < 50; i++) {
      const p = generarPasswordTemporal(16);
      expect(p).toHaveLength(16);
      expect(p).toMatch(/[a-z]/);
      expect(p).toMatch(/[A-Z]/);
      expect(p).toMatch(/\d/);
      expect(p).toMatch(/[-_.!@#%]/);
      expect(p).not.toMatch(/[0O1lI]/);
    }
  });

  it("no repite contraseñas", () => {
    const vistas = new Set(Array.from({ length: 200 }, () => generarPasswordTemporal()));
    expect(vistas.size).toBe(200);
  });
});

describe("resumirDetalle", () => {
  it("resume JSON como clave: valor", () => {
    expect(resumirDetalle(JSON.stringify({ catalogo: "CAT_PAIS", insertados: 3, ok: true }))).toBe(
      "catalogo: CAT_PAIS; insertados: 3; ok: sí",
    );
  });

  it("muestra cambios antes → después", () => {
    const detalle = JSON.stringify({ clave: "MEX", cambios: { descripcion: { antes: "Mexico", despues: "México" } } });
    expect(resumirDetalle(detalle)).toBe("clave: MEX; cambios: descripcion: Mexico → México");
  });

  it("oculta llaves que parezcan secretos y trunca", () => {
    expect(resumirDetalle(JSON.stringify({ password: "x", token: "y" }))).toBe("password: [oculto]; token: [oculto]");
    expect(resumirDetalle(JSON.stringify({ texto: "a".repeat(300) }), 50)).toHaveLength(50);
  });

  it("tolera texto que no es JSON y valores vacíos", () => {
    expect(resumirDetalle("no es json")).toBe("no es json");
    expect(resumirDetalle(null)).toBe("");
  });
});
