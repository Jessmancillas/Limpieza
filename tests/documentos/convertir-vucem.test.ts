import { createHash } from "node:crypto";

import { PDFDocument, PDFName, PDFNumber, PDFRawStream, rgb, StandardFonts } from "pdf-lib";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { convertirAVucem, detectarMime, leerPgm, MAX_PAGINAS } from "@/lib/pdf/convertir-vucem";
import { inspeccionarPdf, marcasEnBuffer } from "@/lib/pdf/inspeccionar";

const LIMITES = { minDpi: 300, maxMB: 10 };

// ─── Fixtures generados en la prueba (no se suben binarios) ─────────────────────

async function pdfColor({ blanca = true, javascript = false } = {}): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const fuente = await doc.embedFont(StandardFonts.Helvetica);
  const contenido = (n: number) => {
    const p = doc.addPage([612, 792]);
    p.drawRectangle({ x: 72, y: 380, width: 300, height: 200, color: rgb(0.9, 0.1, 0.1) });
    p.drawText(`Licencia sanitaria - página ${n}`, { x: 72, y: 700, size: 24, font: fuente, color: rgb(0, 0, 0.8) });
  };
  contenido(1);
  if (blanca) doc.addPage([612, 792]);
  contenido(3);
  if (javascript) doc.addJavaScript("saludo", 'app.alert("hola");');
  // Sin object streams para que /JavaScript quede visible también en la búsqueda directa.
  return Buffer.from(await doc.save({ useObjectStreams: !javascript }));
}

async function pdfConFormulario(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const fuente = await doc.embedFont(StandardFonts.Helvetica);
  const pagina = doc.addPage([612, 792]);
  pagina.drawText("Formulario de prueba", { x: 72, y: 700, size: 20, font: fuente });
  const campo = doc.getForm().createTextField("nombre");
  campo.setText("ACME SA de CV");
  campo.addToPage(pagina, { x: 72, y: 600, width: 300, height: 30 });
  return Buffer.from(await doc.save());
}

async function pdfEnBlanco(paginas: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < paginas; i++) doc.addPage([612, 792]);
  return Buffer.from(await doc.save());
}

async function imagenPng(ancho: number, alto: number): Promise<Buffer> {
  const cuadro = await sharp({
    create: { width: Math.floor(ancho / 2), height: Math.floor(alto / 4), channels: 3, background: { r: 20, g: 60, b: 200 } },
  })
    .png()
    .toBuffer();
  return sharp({ create: { width: ancho, height: alto, channels: 3, background: { r: 255, g: 255, b: 255 } } })
    .composite([{ input: cuadro, top: Math.floor(alto / 8), left: Math.floor(ancho / 8) }])
    .png()
    .toBuffer();
}

/** Imágenes embebidas en el PDF con sus datos y la página donde se dibujan. */
async function imagenesDelPdf(pdf: Buffer) {
  const doc = await PDFDocument.load(pdf, { updateMetadata: false });
  const imagenes = doc.context
    .enumerateIndirectObjects()
    .map(([, obj]) => obj)
    .filter((obj): obj is PDFRawStream => obj instanceof PDFRawStream && obj.dict.get(PDFName.of("Subtype")) === PDFName.of("Image"));
  return {
    doc,
    imagenes: imagenes.map((img) => ({
      ancho: (img.dict.get(PDFName.of("Width")) as PDFNumber).asNumber(),
      alto: (img.dict.get(PDFName.of("Height")) as PDFNumber).asNumber(),
      espacioColor: img.dict.get(PDFName.of("ColorSpace")),
      filtro: img.dict.get(PDFName.of("Filter")),
      datos: Buffer.from(img.contents),
    })),
  };
}

function sinFormulariosNiJs(pdf: Buffer) {
  const texto = pdf.toString("latin1");
  expect(texto.includes("/AcroForm")).toBe(false);
  expect(texto.includes("/JavaScript")).toBe(false);
  expect(/\/JS[\s/<[(]/.test(texto)).toBe(false);
}

// ─── Pruebas ──────────────────────────────────────────────────────────────────

describe("convertirAVucem", () => {
  it("convierte un PDF a color: escala de grises, ≥300 dpi, sin la página en blanco ni JavaScript", async () => {
    const entrada = await pdfColor({ javascript: true });
    expect(marcasEnBuffer(entrada).javaScript).toBe(true);
    expect((await inspeccionarPdf(entrada)).tieneJavaScript).toBe(true);

    const r = await convertirAVucem(entrada, "application/pdf", LIMITES);
    expect(r.error).toBeUndefined();
    expect(r.estado).toBe("ADVERTENCIA"); // por la página en blanco eliminada
    expect(r.paginas).toBe(2);
    expect(r.paginasEnBlancoEliminadas).toEqual([2]);
    expect(r.avisos.some((a) => a.includes("página 2"))).toBe(true);
    expect(r.notas.some((n) => n.includes("JavaScript"))).toBe(true);
    expect(r.dpi).toBeGreaterThanOrEqual(300);
    expect(r.bytes).toBe(r.pdf.length);
    sinFormulariosNiJs(r.pdf);

    const { doc, imagenes } = await imagenesDelPdf(r.pdf);
    expect(doc.getPageCount()).toBe(2);
    expect(imagenes).toHaveLength(2);
    for (const [i, img] of imagenes.entries()) {
      expect(img.espacioColor).toBe(PDFName.of("DeviceGray"));
      expect(img.filtro).toBe(PDFName.of("DCTDecode"));
      const meta = await sharp(img.datos).metadata();
      expect(meta.channels).toBe(1);
      // Resolución efectiva = pixeles / pulgadas de la página.
      const pagina = doc.getPage(i);
      expect(img.ancho / (pagina.getWidth() / 72)).toBeGreaterThanOrEqual(300);
      expect(img.alto / (pagina.getHeight() / 72)).toBeGreaterThanOrEqual(300);
      // Conserva el tamaño carta del original.
      expect(pagina.getWidth()).toBeCloseTo(612, 0);
      expect(pagina.getHeight()).toBeCloseTo(792, 0);
    }

    const revision = await inspeccionarPdf(r.pdf);
    expect(revision).toMatchObject({ paginas: 2, cifrado: false, tieneFormularios: false, tieneJavaScript: false });

    // Sin metadatos personales: solo Producer/Creator neutros.
    expect(doc.getProducer()).toBe("Conversor de anexos VUCEM");
    expect(doc.getCreator()).toBe("Conversor de anexos VUCEM");
    expect(doc.getAuthor()).toBeUndefined();
    expect(doc.getTitle()).toBeUndefined();
  });

  it("un PDF sin páginas en blanco ni avisos queda en estado OK", async () => {
    const r = await convertirAVucem(await pdfColor({ blanca: false }), "application/pdf", LIMITES);
    expect(r.estado).toBe("OK");
    expect(r.avisos).toEqual([]);
    expect(r.paginas).toBe(2);
    expect(r.paginasEnBlancoEliminadas).toEqual([]);
  });

  it("elimina los formularios (AcroForm) del PDF", async () => {
    const entrada = await pdfConFormulario();
    expect((await inspeccionarPdf(entrada)).tieneFormularios).toBe(true);

    const r = await convertirAVucem(entrada, "application/pdf", LIMITES);
    expect(r.estado).toBe("OK");
    expect(r.paginas).toBe(1);
    expect(r.notas.some((n) => n.includes("formulario"))).toBe(true);
    sinFormulariosNiJs(r.pdf);
    expect((await inspeccionarPdf(r.pdf)).tieneFormularios).toBe(false);
  });

  it("convierte una imagen PNG en un PDF de 1 página en grises", async () => {
    const r = await convertirAVucem(await imagenPng(2550, 3300), "image/png", LIMITES);
    expect(r.estado).toBe("OK");
    expect(r.paginas).toBe(1);
    expect(r.dpi).toBe(300);
    const { doc, imagenes } = await imagenesDelPdf(r.pdf);
    expect(doc.getPageCount()).toBe(1);
    expect(imagenes[0].espacioColor).toBe(PDFName.of("DeviceGray"));
    expect(doc.getPage(0).getWidth()).toBeCloseTo(612, 0);
  });

  it("avisa si la imagen tiene baja resolución", async () => {
    const r = await convertirAVucem(await imagenPng(800, 1000), "image/png", LIMITES);
    expect(r.estado).toBe("ADVERTENCIA");
    expect(r.dpi).toBeGreaterThanOrEqual(300);
    expect(r.avisos.some((a) => a.includes("baja resolución"))).toBe(true);
  });

  it("convierte JPEG con el mime image/jpg", async () => {
    const jpeg = await sharp(await imagenPng(2550, 3300)).jpeg().toBuffer();
    const r = await convertirAVucem(jpeg, "image/jpg", LIMITES);
    expect(r.estado).toBe("OK");
    expect(r.paginas).toBe(1);
  });

  it("rechaza tipos no soportados con un mensaje claro", async () => {
    const r = await convertirAVucem(Buffer.from("hola"), "text/plain", LIMITES);
    expect(r.estado).toBe("ERROR");
    expect(r.error).toMatch(/no soportado/i);
    expect(r.pdf.length).toBe(0);
  });

  it("rechaza un archivo cuyo contenido no corresponde al tipo", async () => {
    const png = await imagenPng(100, 100);
    expect((await convertirAVucem(png, "application/pdf", LIMITES)).estado).toBe("ERROR");
    expect((await convertirAVucem(await pdfColor(), "image/png", LIMITES)).estado).toBe("ERROR");
  });

  it("regresa ERROR si el PDF está dañado", async () => {
    const r = await convertirAVucem(Buffer.from("%PDF-1.7\nesto no es un pdf\n%%EOF"), "application/pdf", LIMITES);
    expect(r.estado).toBe("ERROR");
    expect(r.error).toMatch(/PDF/);
  });

  it("regresa ERROR si el resultado no cabe en el límite de tamaño", async () => {
    const r = await convertirAVucem(await pdfColor(), "application/pdf", { minDpi: 300, maxMB: 0.001 });
    expect(r.estado).toBe("ERROR");
    expect(r.error).toMatch(/Divide el documento/);
    expect(r.pdf.length).toBe(0);
  });

  it("baja la calidad JPEG para caber en el límite cuando es posible", async () => {
    const base = await convertirAVucem(await pdfColor({ blanca: false }), "application/pdf", LIMITES);
    const limite = (base.bytes * 0.8) / 1_000_000;
    const r = await convertirAVucem(await pdfColor({ blanca: false }), "application/pdf", { minDpi: 300, maxMB: limite });
    if (r.estado !== "ERROR") {
      expect(r.bytes).toBeLessThanOrEqual(limite * 1_000_000);
      expect(r.calidadJpeg).toBeLessThan(80);
      expect(r.avisos.some((a) => a.includes("calidad"))).toBe(true);
    } else {
      expect(r.error).toMatch(/Divide el documento/);
    }
  });

  it("regresa ERROR si todas las páginas están en blanco", async () => {
    const r = await convertirAVucem(await pdfEnBlanco(2), "application/pdf", LIMITES);
    expect(r.estado).toBe("ERROR");
    expect(r.error).toMatch(/en blanco/);
  });

  it(`rechaza PDFs de más de ${MAX_PAGINAS} páginas sin rasterizarlos`, async () => {
    const inicio = Date.now();
    const r = await convertirAVucem(await pdfEnBlanco(MAX_PAGINAS + 1), "application/pdf", LIMITES);
    expect(r.estado).toBe("ERROR");
    expect(r.error).toMatch(/máximo/);
    expect(Date.now() - inicio).toBeLessThan(10_000);
  });

  it("el sha1 corresponde al PDF generado y la conversión es determinista", async () => {
    const entrada = await pdfColor();
    const r = await convertirAVucem(entrada, "application/pdf", LIMITES);
    expect(r.sha1).toBe(createHash("sha1").update(r.pdf).digest("hex"));
    expect(r.sha1).toMatch(/^[0-9a-f]{40}$/);
    const otra = await convertirAVucem(entrada, "application/pdf", LIMITES);
    expect(otra.sha1).toBe(r.sha1);
  });
});

describe("utilidades", () => {
  it("detecta el tipo real por los primeros bytes", async () => {
    expect(detectarMime(await pdfEnBlanco(1))).toBe("application/pdf");
    expect(detectarMime(await imagenPng(10, 10))).toBe("image/png");
    expect(detectarMime(await sharp(await imagenPng(10, 10)).jpeg().toBuffer())).toBe("image/jpeg");
    expect(detectarMime(await sharp(await imagenPng(10, 10)).tiff().toBuffer())).toBe("image/tiff");
    expect(detectarMime(Buffer.from("PK\u0003\u0004"))).toBeNull();
  });

  it("lee PGM con comentarios", () => {
    const pgm = Buffer.concat([Buffer.from("P5\n# comentario\n2 2\n255\n"), Buffer.from([0, 255, 128, 64])]);
    const { ancho, alto, pixeles } = leerPgm(pgm);
    expect([ancho, alto]).toEqual([2, 2]);
    expect([...pixeles]).toEqual([0, 255, 128, 64]);
    expect(() => leerPgm(Buffer.from("P6\n1 1\n255\n\u0000\u0000\u0000"))).toThrow();
  });
});
