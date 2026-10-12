import { expect, test, type Page } from "@playwright/test";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

// Recorrido principal con los datos de demostración (prisma/seed-demo.ts).
const DEMO = { email: "demo@ejemplo.mx", password: "Demo-Permisos-2026" };

async function entrar(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(DEMO.email);
  await page.getByLabel("Contraseña").fill(DEMO.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL("/");
}

async function sinErrores(page: Page) {
  await expect(page.locator("body")).not.toContainText("Application error");
  await expect(page.locator("body")).not.toContainText("Internal Server Error");
}

async function pdfDePrueba(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const fuente = await doc.embedFont(StandardFonts.Helvetica);
  const pagina = doc.addPage([612, 792]);
  pagina.drawText("REGISTRO SANITARIO DE PRUEBA", { x: 72, y: 700, size: 20, font: fuente, color: rgb(0.1, 0.2, 0.6) });
  pagina.drawRectangle({ x: 72, y: 400, width: 300, height: 200, color: rgb(0.8, 0.1, 0.1) });
  return Buffer.from(await doc.save());
}

test("todas las pantallas principales cargan sin errores", async ({ page }) => {
  await entrar(page);
  for (const ruta of [
    "/",
    "/solicitudes",
    "/solicitudes/nueva",
    "/documentos",
    "/documentos/nuevo",
    "/productos",
    "/terceros",
    "/establecimientos",
    "/catalogos-vucem",
    "/catalogos-vucem/CAT_PAIS",
    "/configuracion/empresa",
    "/configuracion/vucem",
    "/configuracion/usuarios",
    "/configuracion/bitacora",
  ]) {
    const respuesta = await page.goto(ruta);
    expect(respuesta?.status(), ruta).toBeLessThan(400);
    await sinErrores(page);
    await expect(page.locator("h1").first()).toBeVisible();
  }
});

test("subir un documento lo convierte al formato VUCEM", async ({ page }) => {
  await entrar(page);
  await page.goto("/documentos/nuevo?tipo=REGISTRO_SANITARIO");
  await page.locator('input[name="archivo"]').setInputFiles({
    name: "registro.pdf",
    mimeType: "application/pdf",
    buffer: await pdfDePrueba(),
  });
  await page.locator('input[name="nombre"]').fill("Registro sanitario jeringa");
  await page.locator('form button[type="submit"]').last().click();
  await page.waitForURL(/\/documentos\/(?!nuevo)[^/?]+/);
  await sinErrores(page);
  await expect(page.locator("body")).toContainText("Registro sanitario jeringa");
  await expect(page.locator("body")).toContainText(/300\s*dpi/i);
  await page.screenshot({ path: "test-results/documento.png", fullPage: true });
});

test("crear una solicitud, validarla y abrir hoja de captura y envío VUCEM", async ({ page }) => {
  await entrar(page);
  await page.goto("/solicitudes/nueva");
  await page.getByRole("button", { name: "Crear borrador" }).click();
  await page.waitForURL(/\/solicitudes\/(?!nueva)[^/?]+(\?.*)?$/);
  await sinErrores(page);
  const urlSolicitud = page.url().split("?")[0];
  await page.screenshot({ path: "test-results/solicitud.png", fullPage: true });

  await page.goto(`${urlSolicitud}/hoja-captura`);
  await sinErrores(page);
  await expect(page.locator("body")).toContainText("DME200101AB1");
  await page.screenshot({ path: "test-results/hoja-captura.png", fullPage: true });

  await page.goto(`${urlSolicitud}/vucem`);
  await sinErrores(page);
  await page.screenshot({ path: "test-results/vucem.png", fullPage: true });

  await page.goto("/");
  await sinErrores(page);
  await page.screenshot({ path: "test-results/tablero.png", fullPage: true });
});
