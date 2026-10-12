import { describe, expect, it } from "vitest";

import { agruparPorSeccion, SECCION, validarSolicitud } from "@/lib/solicitudes/validacion";

import { destinatario, documento, fecha, HOY, partida, producto, solicitudCompleta, tercero } from "./fabrica";

const mensajes = (r: { mensaje: string }[]) => r.map((p) => p.mensaje).join("\n");

describe("validarSolicitud", () => {
  it("una solicitud completa queda lista (portal y servicio web)", () => {
    const sol = solicitudCompleta();
    const portal = validarSolicitud(sol, { canal: "PORTAL", hoy: HOY });
    expect(portal.errores).toEqual([]);
    expect(portal.lista).toBe(true);
    const ws = validarSolicitud(sol, { canal: "WS", hoy: HOY });
    expect(ws.errores).toEqual([]);
    expect(ws.lista).toBe(true);
  });

  it("sin fabricante → error en terceros", () => {
    const base = solicitudCompleta();
    const sol = solicitudCompleta({ terceros: base.terceros.filter((t) => t.rol !== "FABRICANTE") });
    const r = validarSolicitud(sol, { hoy: HOY });
    expect(r.lista).toBe(false);
    expect(r.errores).toContainEqual(expect.objectContaining({ seccion: SECCION.TERCEROS, campo: "fabricante" }));
  });

  it("sin destinatario o destinatario sin RFC → error", () => {
    const base = solicitudCompleta();
    const sinDestinatario = validarSolicitud(solicitudCompleta({ terceros: base.terceros.filter((t) => t.rol !== "DESTINATARIO") }), { hoy: HOY });
    expect(sinDestinatario.errores.some((p) => p.campo === "destinatario")).toBe(true);

    const sinRfc = solicitudCompleta({
      terceros: [base.terceros[0], { ...base.terceros[1], tercero: destinatario({ rfc: null }) }],
    });
    const r = validarSolicitud(sinRfc, { hoy: HOY });
    expect(r.errores).toContainEqual(expect.objectContaining({ seccion: SECCION.TERCEROS, campo: "rfc" }));
  });

  it("fracción arancelaria inválida → error en mercancías", () => {
    const sol = solicitudCompleta({ partidas: [partida({ fraccionArancelaria: "901831" })] });
    const r = validarSolicitud(sol, { hoy: HOY });
    expect(r.lista).toBe(false);
    expect(r.errores).toContainEqual(expect.objectContaining({ seccion: SECCION.MERCANCIAS, campo: "fraccionarancelaria" }));
    expect(mensajes(r.errores)).toMatch(/8 dígitos/);
  });

  it("cantidades: más de 3 decimales o cero → error", () => {
    const sol = solicitudCompleta({ partidas: [partida({ cantidadUMT: "1.2345", cantidadUMC: "0" })] });
    const r = validarSolicitud(sol, { hoy: HOY });
    expect(r.errores.filter((p) => p.campo === "cantidadUMT" || p.campo === "cantidadUMC")).toHaveLength(2);
  });

  it("registro sanitario vencido → error; por vencer en ≤ 30 días → aviso; sin registro → error", () => {
    const vencido = solicitudCompleta({
      partidas: [partida({ producto: producto({ vigenciaRegistroSanitario: fecha("2026-10-11") }) })],
    });
    const r1 = validarSolicitud(vencido, { hoy: HOY });
    expect(r1.errores).toContainEqual(expect.objectContaining({ seccion: SECCION.MERCANCIAS, campo: "numRegistroSanitario" }));
    expect(mensajes(r1.errores)).toMatch(/venció el 11\/10\/2026/);

    const porVencer = solicitudCompleta({
      partidas: [partida({ producto: producto({ vigenciaRegistroSanitario: fecha("2026-11-01") }) })],
    });
    const r2 = validarSolicitud(porVencer, { hoy: HOY });
    expect(r2.errores).toEqual([]);
    expect(r2.avisos).toContainEqual(expect.objectContaining({ campo: "numRegistroSanitario" }));

    const venceHoy = solicitudCompleta({
      partidas: [partida({ producto: producto({ vigenciaRegistroSanitario: fecha("2026-10-12") }) })],
    });
    expect(validarSolicitud(venceHoy, { hoy: HOY }).errores).toEqual([]);

    const sinRegistro = solicitudCompleta({ partidas: [partida({ numRegistroSanitario: null })] });
    expect(validarSolicitud(sinRegistro, { hoy: HOY }).errores).toContainEqual(
      expect.objectContaining({ campo: "numRegistroSanitario" }),
    );
  });

  it("pago omitido → aviso, no error; pago incompleto → error", () => {
    const omitido = solicitudCompleta({
      pagoOmitido: true,
      claveReferencia: null,
      cadenaDependencia: null,
      cveBanco: null,
      llavePago: null,
      fechaPago: null,
      importePago: null,
    });
    const r = validarSolicitud(omitido, { hoy: HOY });
    expect(r.lista).toBe(true);
    expect(r.avisos).toContainEqual(expect.objectContaining({ seccion: SECCION.PAGO, campo: "pagoOmitido" }));

    const incompleto = solicitudCompleta({ llavePago: null, importePago: "12345678901234.00", claveReferencia: "1234567890" });
    const r2 = validarSolicitud(incompleto, { hoy: HOY });
    const campos = r2.errores.filter((p) => p.seccion === SECCION.PAGO).map((p) => p.campo);
    expect(campos).toEqual(expect.arrayContaining(["llavePago", "importePago", "claveReferencia"]));
  });

  it("documentos obligatorios faltantes → error; falta el registro de un producto → aviso", () => {
    const base = solicitudCompleta();
    const sinLicencia = solicitudCompleta({ documentos: base.documentos.filter((d) => d.requisito !== "LICENCIA_O_AVISO") });
    const r = validarSolicitud(sinLicencia, { hoy: HOY });
    expect(r.errores).toContainEqual(expect.objectContaining({ seccion: SECCION.DOCUMENTOS, campo: "LICENCIA_O_AVISO" }));

    const otroProducto = producto({ id: "prod-2", denominacionEspecifica: "CATETER" });
    const dosProductos = solicitudCompleta({
      partidas: [partida(), partida({ id: "par-2", orden: 2, producto: otroProducto, productoId: "prod-2", denominacionEspecifica: "CATETER" })],
    });
    const r2 = validarSolicitud(dosProductos, { hoy: HOY });
    expect(r2.errores).toEqual([]);
    expect(r2.avisos.some((p) => p.campo === "REGISTRO_SANITARIO" && p.mensaje.includes("CATETER"))).toBe(true);
  });

  it("documento con conversión pendiente, vencido o demasiado grande → error", () => {
    const base = solicitudCompleta();
    const [lic, resp, reg] = base.documentos;
    const sol = solicitudCompleta({
      documentos: [
        { ...lic, documento: documento({ id: "doc-lic", estadoConversion: "PENDIENTE", archivoVucemRuta: null }) },
        { ...resp, documento: documento({ id: "doc-resp", tipo: "AVISO_RESPONSABLE", vigenciaHasta: fecha("2026-01-01") }) },
        { ...reg, documento: { ...reg.documento, archivoVucemBytes: 11_000_000 } },
      ],
    });
    const r = validarSolicitud(sol, { hoy: HOY });
    expect(r.errores.filter((p) => p.seccion === SECCION.DOCUMENTOS)).toHaveLength(3);
    expect(mensajes(r.errores)).toMatch(/aún no está convertido/);
    expect(mensajes(r.errores)).toMatch(/venció/);
    expect(mensajes(r.errores)).toMatch(/máximo es 10 MB/);
  });

  it("canal WS sin eDocument → aviso (no error); canal portal no lo menciona", () => {
    const base = solicitudCompleta();
    const sol = solicitudCompleta({
      documentos: base.documentos.map((sd) => ({ ...sd, documento: { ...sd.documento, eDocument: null, estadoEDocument: "NO_ENVIADO" } })),
    });
    const ws = validarSolicitud(sol, { canal: "WS", hoy: HOY });
    expect(ws.lista).toBe(true);
    expect(ws.avisos.filter((p) => p.campo === "idEDocument")).toHaveLength(3);
    expect(ws.avisos[0].mensaje).toMatch(/se digitalizará antes de enviar/);
    const portal = validarSolicitud(sol, { canal: "PORTAL", hoy: HOY });
    expect(portal.avisos.some((p) => p.campo === "idEDocument")).toBe(false);
  });

  it("forma farmacéutica / estado físico faltantes: error con WS, aviso con portal", () => {
    const sol = solicitudCompleta({ partidas: [partida({ idFormaFarmaceutica: null, idEstadoFisico: null })] });
    const ws = validarSolicitud(sol, { canal: "WS", hoy: HOY });
    expect(ws.errores.map((p) => p.campo)).toEqual(expect.arrayContaining(["idFormaFarmaceutica", "idEstadoFisico"]));
    const portal = validarSolicitud(sol, { canal: "PORTAL", hoy: HOY });
    expect(portal.errores).toEqual([]);
    expect(portal.avisos.filter((p) => p.campo === "idFormaFarmaceutica" || p.campo === "idEstadoFisico")).toHaveLength(2);
    expect(portal.avisos[0].mensaje).toMatch(/manual/i);
  });

  it("representante persona física sin nombre → error; RFC moral no exige nombre", () => {
    const sinNombre = solicitudCompleta({ rlRfc: "PEPJ800101AB1", rlNombre: null, rlApellidoPaterno: "" });
    const r = validarSolicitud(sinNombre, { hoy: HOY });
    expect(r.errores.filter((p) => p.seccion === SECCION.REPRESENTANTE).map((p) => p.campo)).toEqual(["nombre", "apellidoPaterno"]);

    const moral = solicitudCompleta({ rlRfc: "DME200101AB1", rlNombre: null, rlApellidoPaterno: null, rlApellidoMaterno: null });
    expect(validarSolicitud(moral, { hoy: HOY }).errores).toEqual([]);

    const sinRfc = solicitudCompleta({ rlRfc: null });
    expect(validarSolicitud(sinRfc, { hoy: HOY }).errores).toContainEqual(expect.objectContaining({ seccion: SECCION.REPRESENTANTE, campo: "rfc" }));
  });

  it("datos generales: aduana de 3 caracteres, régimen, declaración y establecimiento", () => {
    const sol = solicitudCompleta({ cveAduana: "47", cveRegimen: null, cveDeclaracion: false, establecimiento: null, establecimientoId: null });
    const r = validarSolicitud(sol, { hoy: HOY });
    const campos = r.errores.map((p) => p.campo);
    expect(campos).toEqual(expect.arrayContaining(["cveAduana", "cveRegimen", "cveDeclaracion", "establecimiento"]));
  });

  it("sin SCIAN de 6 dígitos y sin mercancías → error", () => {
    const base = solicitudCompleta();
    const sol = solicitudCompleta({
      partidas: [],
      establecimiento: { ...base.establecimiento!, scian: [{ id: "x", establecimientoId: "est-1", clave: "4353", descripcion: null }] },
    });
    const r = validarSolicitud(sol, { hoy: HOY });
    expect(r.errores.map((p) => p.campo)).toEqual(expect.arrayContaining(["cveScian", "mercancias"]));
  });

  it("entidad federativa de catálogo más larga que el manual → aviso; texto libre extranjero → error", () => {
    const base = solicitudCompleta();
    const sol = solicitudCompleta({
      establecimiento: { ...base.establecimiento!, entidadFederativa: "BAJA CALIFORNIA SUR" },
      terceros: [
        { ...base.terceros[0], tercero: tercero({ entidadFederativa: "CALIFORNIA" }) },
        base.terceros[1],
      ],
    });
    const r = validarSolicitud(sol, { hoy: HOY });
    expect(r.avisos).toContainEqual(expect.objectContaining({ campo: "entidadFederativaEstablecimiento" }));
    expect(r.errores).toContainEqual(expect.objectContaining({ seccion: SECCION.TERCEROS, campo: "entidadFederativa" }));
  });

  it("tipo de persona del solicitante debe corresponder a su RFC", () => {
    const base = solicitudCompleta();
    const sol = solicitudCompleta({ empresa: { ...base.empresa, tipoPersona: "FISICA" } });
    expect(validarSolicitud(sol, { hoy: HOY }).errores).toContainEqual(
      expect.objectContaining({ seccion: SECCION.SOLICITANTE, campo: "tipoPersonaSolicitante" }),
    );
  });

  it("agruparPorSeccion respeta el orden del portal", () => {
    const grupos = agruparPorSeccion([
      { seccion: SECCION.DOCUMENTOS, mensaje: "a" },
      { seccion: SECCION.SOLICITANTE, mensaje: "b" },
      { seccion: SECCION.MERCANCIAS, mensaje: "c" },
      { seccion: SECCION.DOCUMENTOS, mensaje: "d" },
    ]);
    expect(grupos.map((g) => g.seccion)).toEqual([SECCION.SOLICITANTE, SECCION.MERCANCIAS, SECCION.DOCUMENTOS]);
    expect(grupos[2].problemas).toHaveLength(2);
  });
});
