import { describe, expect, it } from "vitest";

import { parsearXml, esXmlBienFormado, buscarTexto, buscarNodos } from "@/lib/vucem/soap";
import {
  NAMESPACE_260211_MANUAL,
  construirCadenaOriginal260211,
  construirPayload260211,
  construirXml260211,
  fechaDdMmAa,
  importeDosDecimales,
  parsearRespuestaSolicitud,
  seccionesCadena260211,
  xmlVistaPrevia260211,
} from "@/lib/vucem/solicitud-260211";

import { documento, fecha, solicitud } from "./fabrica";

describe("construirPayload260211", () => {
  const p = construirPayload260211(solicitud());

  it("usa los nombres y formatos del manual", () => {
    expect(p.solicitante).toEqual({ rfcSolicitante: "DME200101AB1", tipoPersonaSolicitante: "1" });
    expect(p.establecimiento.cveScian).toEqual(["435313", "339112"]);
    expect(p.establecimiento.avisoFuncionamiento).toBe("0");
    expect(p.establecimiento.CveAduana).toBe("470");
    expect(p.mercancias[0]).toMatchObject({
      fraccionarancelaria: "90183101",
      cantdadUMC: "1000.5",
      cvePaisProcedecnia: "CAN",
      denominacionOnombreCientifico: "JERINGA HIPODERMICA",
      fechaCaducidad: "31/01/29",
    });
    expect(p.manifiestos).toEqual({ cveDeclaracion: "1", informacionConfidencial: "0" });
    expect(p.pagoDerechos).toMatchObject({ fechaPago: "05/10/2026", importePago: "3117.00" });
    expect(p.representanteLegal).toEqual({ Rfc: "PEPJ800101AB1", Nombre: "JUAN", apellidoPaterno: "PEREZ", apellidoMaterno: null });
    expect(p.idEDocument).toEqual(["0762180014HC4", "223218000H1D5"]);
  });

  it("separa terceros por rol y limpia campos del otro tipo de persona", () => {
    expect(p.tercerosFabricantes).toHaveLength(1);
    expect(p.tercerosProveedores).toHaveLength(1);
    expect(p.tercerosFacturadores).toHaveLength(0);
    expect(p.destinatarios[0]).toMatchObject({ tipoPersona: "0", nombre: "MARIA", denominacionRazonSocial: null, estadoLocalidad: "JALISCO" });
    expect(p.tercerosFabricantes[0]).toMatchObject({ tipoPersona: "1", nombre: null, denominacionrazonSocial: "MEDICAL DEVICES EXAMPLE INC" });
  });

  it("omite el pago si se marcó como omitido y solo toma documentos con eDocument", () => {
    const sol = solicitud({ pagoOmitido: true });
    sol.documentos.push({ id: "sd-x", solicitudId: "sol-1", documentoId: "doc-x", requisito: "OTRO", documento: documento({ id: "doc-x", eDocument: null }) });
    const q = construirPayload260211(sol);
    expect(Object.values(q.pagoDerechos).every((v) => v === null)).toBe(true);
    expect(q.idEDocument).toEqual(["0762180014HC4", "223218000H1D5"]);
  });

  it("formatos de fecha e importe", () => {
    expect(fechaDdMmAa(fecha("2019-05-15"))).toBe("15/05/19");
    expect(importeDosDecimales("2748000")).toBe("2748000.00");
    expect(importeDosDecimales("0.5")).toBe("0.50");
    expect(importeDosDecimales("1,250.75")).toBe("1250.75");
    expect(importeDosDecimales("")).toBeNull();
  });
});

describe("cadena original 260211", () => {
  const sol = solicitud();
  const payload = construirPayload260211(sol);

  it("sigue el orden exacto de la sección 4 del manual", () => {
    const esperada =
      "|" +
      [
        // Solicitante (moral)
        "DISPOSITIVOS MEDICOS DEMO SA DE CV", "DME200101AB1", "permisos@ejemplo.mx",
        // Domicilio solicitante
        "AV. EJEMPLO", "100", "", "06600", "JUAREZ", "MEX", "CIUDAD DE MEXICO", "CIUDAD DE MEXICO", "CUAUHTEMOC", "5555555555",
        // Establecimiento
        "PEPJ800101AB1", "DISPOSITIVOS MEDICOS DEMO SA DE CV - ALMACEN", "responsable@ejemplo.mx", "CALLE BODEGA", "12", "54060",
        "MEXICO", "TLALNEPANTLA DE BAZ", "INDUSTRIAL", "TLALNEPANTLA", "5555555556", "435313", "339112", "0", "01", "470", "41414141",
        // Mercancía (CvePaisProcedecnia duplicado como en el manual)
        "52", "25", "JERINGA DESECHABLE ESTERIL 5 ML", "MARCA DEMO", "0245", "12", "90183101", "USA", "CAN", "CAN", "108",
        "1000", "1000.5", "PIEZA", "1234C2020 SSA", "JERINGA HIPODERMICA", "3", "CAJA CON 100 PIEZAS",
        // Manifiesto
        "1", "0",
        // Fabricantes
        "1", "", "", "", "MEDICAL DEVICES EXAMPLE INC", "export@example.com", "MARKET ST", "500", "", "USA", "94105", "CA", "4155550100",
        // Destinatarios (Pais tres veces como en el manual)
        "0", "MARIA", "LOPEZ", "DIAZ", "", "MEX", "LODM800101AB1", "maria@ejemplo.mx", "MEX", "AV. JUAREZ", "1", "B", "MEX", "44100",
        "JALISCO", "GUADALAJARA", "CENTRO", "GUADALAJARA",
        // Proveedores
        "1", "", "", "", "PROVEEDOR UNO LLC", "export@example.com", "MAIN ST", "500", "", "USA", "94105", "CA", "4155550100",
        // Facturadores: ninguno
        // Pago de derechos
        "123456789", "00012345678901", "15", "ABC123DEF456", "05/10/2026", "3117.00",
        // Representante legal (+ ClaveReferencia)
        "PEPJ800101AB1", "JUAN", "PEREZ", "", "123456789",
        // Documentos
        "0762180014HC4", "223218000H1D5",
      ].join("|") +
      "|";
    expect(construirCadenaOriginal260211(payload, sol.empresa)).toBe(esperada);
  });

  it("inicia y termina con pipe, nulos vacíos y respeta espacios internos", () => {
    const cadena = construirCadenaOriginal260211(payload, sol.empresa);
    expect(cadena.startsWith("|")).toBe(true);
    expect(cadena.endsWith("|0762180014HC4|223218000H1D5|")).toBe(true);
    expect(cadena).toContain("|AV. EJEMPLO|100||06600|");
    expect(cadena).toContain("|JERINGA DESECHABLE ESTERIL 5 ML|");
    expect(cadena).not.toContain("null");
    expect(cadena).not.toContain("undefined");
  });

  it("secciones en orden y opciones para quitar los duplicados del manual", () => {
    expect(seccionesCadena260211(payload, sol.empresa).map((s) => s.seccion)).toEqual([
      "Solicitante",
      "Domicilio solicitante",
      "Datos del establecimiento",
      "Mercancía",
      "Manifiesto",
      "Terceros fabricantes",
      "Terceros destinatarios",
      "Terceros proveedores",
      "Terceros facturadores",
      "Pago de derechos",
      "Representante legal",
      "Documentos",
    ]);
    const completa = construirCadenaOriginal260211(payload, sol.empresa).split("|").length;
    const sinDuplicados = construirCadenaOriginal260211(payload, sol.empresa, {
      duplicarPaisProcedencia: false,
      repetirPaisDestinatario: false,
    }).split("|").length;
    expect(completa - sinDuplicados).toBe(3);
  });

  it("persona física: nombre, apellidos, curp, rfc, correo y actividad", () => {
    const fisica = solicitud({
      empresa: {
        ...sol.empresa,
        tipoPersona: "FISICA",
        rfc: "LODM800101AB1",
        razonSocial: null,
        nombre: "MARIA",
        apellidoPaterno: "LOPEZ",
        apellidoMaterno: null,
        curp: "LODM800101MJCPZR09",
        actividadProductiva: "COMERCIO",
      },
    });
    const cadena = construirCadenaOriginal260211(construirPayload260211(fisica), fisica.empresa);
    expect(cadena.startsWith("|MARIA|LOPEZ||LODM800101MJCPZR09|LODM800101AB1|permisos@ejemplo.mx|COMERCIO|AV. EJEMPLO|")).toBe(true);
  });

  it("sin documentos no agrega campos al final", () => {
    const sinDocs = solicitud({ documentos: [] });
    const cadena = construirCadenaOriginal260211(construirPayload260211(sinDocs), sinDocs.empresa);
    expect(cadena.endsWith("|PEPJ800101AB1|JUAN|PEREZ||123456789|")).toBe(true);
  });
});

describe("XML 260211", () => {
  const sol = solicitud();
  const payload = construirPayload260211(sol);
  const cadena = construirCadenaOriginal260211(payload, sol.empresa);
  const xml = construirXml260211(
    payload,
    { certificadoBase64: "Q0VSVA==", cadenaOriginal: cadena, firma: "RklSTUE=" },
    { operacion: "registrarSolicitud260211", usuario: "DME200101AB1", password: "secreta", soapAction: "urn:accion", url: "https://vucem.example/ws" },
  );

  it("está bien formado, con la operación y namespaces del manual", () => {
    expect(esXmlBienFormado(xml)).toBe(true);
    expect(xml).toContain(`xmlns:ws="${NAMESPACE_260211_MANUAL}"`);
    expect(xml).toContain('xmlns:res="http://www.ventanillaunica.gob.mx/common/ws/oxml/respuesta"');
    expect(xml).toContain("<ws:registrarSolicitud260211><res:firmaElectronica><res:certificado>Q0VSVA==</res:certificado>");
    expect(xml).toContain("<solicitante><tipoPersonaSolicitante>1</tipoPersonaSolicitante><rfcSolicitante>DME200101AB1</rfcSolicitante></solicitante>");
    expect(xml).toContain("<scian><cveScian>435313</cveScian><cveScian>339112</cveScian></scian>");
    expect(xml).toContain("<documentos><idEDocument>0762180014HC4</idEDocument><idEDocument>223218000H1D5</idEDocument></documentos>");
    expect(xml).toContain("<wsa:Action");
    expect(xml).toContain(">urn:accion</wsa:Action>");
    expect(xml).not.toContain("<tercerosFacturadores>");
  });

  it("los datos se pueden leer de vuelta", () => {
    const raiz = parsearXml(xml);
    expect(buscarTexto(raiz, ["cadenaOriginal"])).toBe(cadena);
    expect(buscarNodos(raiz, "mercancia")).toHaveLength(1);
    expect(buscarTexto(raiz, ["cantdadUMC"])).toBe("1000.5");
    expect(buscarTexto(raiz, ["Password"])).toBe("secreta");
  });

  it("la vista previa no lleva la contraseña", () => {
    const vista = xmlVistaPrevia260211(payload, cadena, { operacion: "op", usuario: "DME200101AB1" });
    expect(esXmlBienFormado(vista)).toBe(true);
    expect(vista).toContain(">********</wsse:Password>");
  });

  it("rechaza nombres de operación inválidos", () => {
    expect(() =>
      construirXml260211(payload, { certificadoBase64: "", cadenaOriginal: cadena, firma: "" }, { operacion: "a b<", usuario: "x", password: "y" }),
    ).toThrow();
  });
});

describe("parsearRespuestaSolicitud", () => {
  it("folio y mensajes", () => {
    const r = parsearRespuestaSolicitud(
      `<S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/"><S:Body><ns2:resp xmlns:ns2="urn:x"><respuestaBase><tieneError>false</tieneError><mensajes><mensaje>OK</mensaje></mensajes></respuestaBase><ns2:numeroFolio>0402600201120264006000123</ns2:numeroFolio></ns2:resp></S:Body></S:Envelope>`,
    );
    expect(r).toEqual({ exito: true, folio: "0402600201120264006000123", mensajes: ["OK"] });
  });

  it("errores de negocio y SOAP Fault", () => {
    const negocio = parsearRespuestaSolicitud(
      `<Envelope><Body><r><respuestaBase><tieneError>true</tieneError><errores><error>Falta la aduana</error></errores></respuestaBase></r></Body></Envelope>`,
    );
    expect(negocio.exito).toBe(false);
    expect(negocio.mensajes).toEqual(["Falta la aduana"]);
    const fault = parsearRespuestaSolicitud(
      `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><soap:Fault><faultcode>soap:Server</faultcode><faultstring>Error interno</faultstring></soap:Fault></soap:Body></soap:Envelope>`,
    );
    expect(fault).toMatchObject({ exito: false, mensajes: ["Error interno"], fault: { codigo: "soap:Server" } });
    expect(parsearRespuestaSolicitud("").exito).toBe(false);
  });

  it("número de solicitud sin folio", () => {
    const r = parsearRespuestaSolicitud(`<Envelope><Body><r><idSolicitud>12345</idSolicitud></r></Body></Envelope>`);
    expect(r).toEqual({ exito: true, numeroSolicitud: "12345", mensajes: [] });
  });
});
