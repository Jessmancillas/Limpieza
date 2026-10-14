import { expect, test, type Page } from "@playwright/test";

// Recorrido del ERP con los datos de demostración (prisma/seed-demo-erp.ts): procure-to-pay y
// order-to-cash completos, y las pantallas de gobierno.
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

test("las pantallas del ERP cargan sin errores", async ({ page }) => {
  await entrar(page);
  for (const ruta of [
    "/erp",
    "/compras/ordenes",
    "/compras/proveedores",
    "/compras/proveedores/nuevo",
    "/compras/reabastecimiento",
    "/almacen/articulos",
    "/almacen/articulos/nuevo",
    "/almacen/movimientos",
    "/almacen/almacenes",
    "/ventas/pedidos",
    "/ventas/clientes",
    "/ventas/clientes/nuevo",
    "/cobranza",
    "/finanzas",
    "/gobierno",
    "/gobierno/controles?marco=COBIT",
    "/gobierno/controles?marco=ISO27001",
    "/gobierno/riesgos",
    "/gobierno/servicios",
    "/gobierno/politicas",
  ]) {
    await page.goto(ruta);
    await sinErrores(page);
    await expect(page.locator("h1")).toBeVisible();
  }
});

test("procure-to-pay y order-to-cash", async ({ page }) => {
  await entrar(page);

  // Reabastecimiento: BOLSA-90 y DESENG-1L están bajo su punto de reorden.
  await page.goto("/compras/reabastecimiento");
  await expect(page.getByRole("cell", { name: /BOLSA-90/ })).toBeVisible();

  // Orden de compra dentro de política → aprobación automática.
  await page.goto("/compras/ordenes");
  await page.getByLabel("Proveedor").selectOption({ label: "QUIM-NTE · QUIMICOS DEL NORTE SA DE CV" });
  await page.getByRole("button", { name: "Crear borrador" }).click();
  await page.waitForURL(/\/compras\/ordenes\/[^/]+$/);
  await page.getByLabel("Artículo").selectOption({ index: 1 });
  await page.getByLabel("Cantidad").fill("10");
  await page.getByRole("button", { name: "Agregar partida" }).click();
  await expect(page.getByText(/Se agregó/)).toBeVisible();
  await page.getByRole("button", { name: "Enviar" }).click();
  // La tarjeta de envío desaparece: el resultado queda en la trazabilidad de la OC.
  await expect(page.getByText("Automática (política)", { exact: false })).toBeVisible();

  // Recepción con factura que cuadra → CxP liberada.
  const total = (await page.getByText(/Subtotal \/ IVA \/ Total/).locator("..").textContent()) ?? "";
  const importe = total.match(/\$([\d,]+\.\d{2})\s*$/)?.[1]?.replace(/,/g, "") ?? "";
  await page.getByLabel("Folio / UUID de factura").fill("FAC-E2E-1");
  await page.getByLabel("Importe de factura (con IVA)").fill(importe);
  await page.getByRole("button", { name: "Registrar recepción" }).click();
  await expect(page.getByRole("cell", { name: "Conciliada" })).toBeVisible();
  await expect(page.getByRole("link", { name: /FAC-E2E-1 · pendiente/ })).toBeVisible();

  // Pedido a crédito: el modelo aprueba, se entrega y se cobra.
  await page.goto("/ventas/pedidos");
  await page.getByLabel("Cliente").selectOption({ label: "HOTEL-CTR · HOTEL CENTRO HISTORICO SA DE CV" });
  await page.getByLabel("Condición de pago").selectOption("CREDITO");
  await page.getByRole("button", { name: "Crear borrador" }).click();
  await page.waitForURL(/\/ventas\/pedidos\/[^/]+$/);
  await page.getByLabel("Artículo").selectOption({ index: 1 });
  await page.getByLabel("Cantidad").fill("3");
  await page.getByRole("button", { name: "Agregar partida" }).click();
  await expect(page.getByText(/Se agregó/)).toBeVisible();
  await page.getByRole("button", { name: "Confirmar pedido" }).click();
  await expect(page.getByRole("heading", { name: "Decisión de crédito" })).toBeVisible();
  await expect(page.getByText("APROBAR")).toBeVisible();
  await page.getByRole("button", { name: "Registrar entrega" }).click();
  await expect(page.getByRole("link", { name: /^FAC-/ })).toBeVisible();

  await page.goto("/cobranza");
  await page.getByRole("link", { name: /^FAC-/ }).first().click();
  await page.getByRole("button", { name: "Registrar cobro" }).click();
  await expect(page.getByRole("heading", { name: "Registrar cobro" })).toBeHidden();
  await expect(page.getByText("pagada", { exact: true })).toBeVisible();

  await page.goto("/erp");
  await sinErrores(page);
  await expect(page.getByText("Ventas netas")).toBeVisible();
});
