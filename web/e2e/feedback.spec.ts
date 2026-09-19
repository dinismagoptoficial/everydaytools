import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const email = "family@example.test";
const password = "test-only-password-123";

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel(/^Palavra-passe/).fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "O que queres fazer?" }),
  ).toBeVisible();
}

async function openFeedback(page: import("@playwright/test").Page) {
  await page.locator(".account").click();
  await page
    .getByRole("button", { name: "Reportar erro ou sugerir" })
    .click();
  return page.getByRole("dialog", { name: "Enviar comentário" });
}

test("feedback works end to end in Portuguese and English", async ({ page }) => {
  await signIn(page);
  const titlePt = `Erro no PDF ${Date.now()}`;
  const formPt = await openFeedback(page);
  await formPt.getByLabel("Tipo").selectOption("BUG");
  await formPt.getByLabel("Título").fill(titlePt);
  await formPt
    .getByLabel("Descrição")
    .fill("O objeto selecionado não acompanha o ponteiro durante o movimento.");
  await expect(
    (await new AxeBuilder({ page }).include(".feedback-modal").analyze())
      .violations,
  ).toEqual([]);
  await formPt.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Comentário enviado. Obrigado.",
  );

  await page
    .getByRole("button", { name: "Administração", exact: true })
    .click();
  const adminFeedbackButton = page.getByRole("button", {
    name: "Reportar erro ou sugerir",
    exact: true,
  });
  await expect(adminFeedbackButton).toBeVisible();
  await adminFeedbackButton.click();
  await expect(page.getByRole("dialog", { name: "Enviar comentário" })).toBeVisible();
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  await page.getByRole("button", { name: "Comentários", exact: true }).click();
  const rowPt = page.locator(".feedback-table tbody tr").filter({ hasText: titlePt });
  await expect(rowPt).toContainText("Novo");
  await rowPt.getByRole("button", { name: "Abrir" }).click();
  const detailPt = page.getByRole("dialog", { name: titlePt });
  await expect(detailPt).toContainText("home");
  await detailPt.getByRole("button", { name: "Marcar em tratamento" }).click();
  await expect(detailPt).toContainText("Em tratamento");
  await detailPt.getByRole("button", { name: "Marcar como concluído" }).click();
  await expect(detailPt).toContainText("Concluído");
  await detailPt.getByRole("button", { name: "Eliminar pedido", exact: true }).click();
  const confirmPt = page.getByRole("dialog", { name: "Eliminar pedido?" });
  await expect(
    confirmPt.getByRole("heading", { name: "Eliminar pedido?" }),
  ).toBeVisible();
  await confirmPt.getByRole("button", { name: "Eliminar pedido" }).click();
  await expect(page.getByText(titlePt, { exact: true })).toHaveCount(0);

  await page.getByLabel("Idioma").selectOption("en");
  await page.locator(".account").click();
  await page
    .locator(".account-menu")
    .getByRole("button", { name: "Report a bug or suggest" })
    .click();
  const titleEn = `Export suggestion ${Date.now()}`;
  const formEn = page.getByRole("dialog", { name: "Send feedback" });
  await formEn.getByLabel("Type").selectOption("FEATURE");
  await formEn.getByLabel("Title").fill(titleEn);
  await formEn
    .getByLabel("Description")
    .fill("Add a reusable export preset for repeated document conversions.");
  await formEn.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Feedback submitted. Thank you.",
  );

  await page.getByRole("button", { name: "Users", exact: true }).click();
  await page.getByRole("button", { name: "Feedback", exact: true }).click();
  const rowEn = page.locator(".feedback-table tbody tr").filter({ hasText: titleEn });
  await expect(rowEn).toContainText("Feature suggestion");
  await rowEn.getByRole("button", { name: "Open" }).click();
  const detailEn = page.getByRole("dialog", { name: titleEn });
  await page.setViewportSize({ width: 390, height: 844 });
  const box = await detailEn.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeLessThanOrEqual(390);
  expect(box!.height).toBeLessThanOrEqual(844);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  await page.waitForTimeout(250);
  await expect(
    (await new AxeBuilder({ page }).include(".feedback-detail-modal").analyze())
      .violations,
  ).toEqual([]);
  await detailEn.getByRole("button", { name: "Mark as completed" }).click();
  await expect(detailEn).toContainText("Completed");
  await detailEn.getByRole("button", { name: "Delete report", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Delete report?" })
    .getByRole("button", { name: "Delete report" })
    .click();
  await expect(page.getByText(titleEn, { exact: true })).toHaveCount(0);
});
