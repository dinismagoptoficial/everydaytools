import { expect, test } from "@playwright/test";
import path from "node:path";

const email = "family@example.test";
const password = "test-only-password-123";

test("edit existing PDF text and pictures on desktop and mobile", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel(/^Palavra-passe/).fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "O que queres fazer?" }),
  ).toBeVisible();

  const name = `pdf-edit-${Date.now()}.pdf`;
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name,
      mimeType: "application/pdf",
      buffer: await import("node:fs/promises").then((fs) =>
        fs.readFile(path.resolve("e2e/fixtures/editable.pdf")),
      ),
    });
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /Editar PDF/ })
    .click();

  const editor = page.getByRole("dialog", { name: "Editar PDF" });
  await expect(editor.locator(".rendering")).toHaveCount(0, {
    timeout: 30_000,
  });
  await editor.getByRole("button", { name: "Editar conteúdo" }).click();
  await expect(editor.locator(".text-run").first()).toBeVisible();
  await expect(editor.locator(".pdf-picture").first()).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  const dialogBox = await editor.boundingBox();
  expect(dialogBox).not.toBeNull();
  expect(dialogBox!.width).toBeLessThanOrEqual(390);
  expect(dialogBox!.height).toBeLessThanOrEqual(844);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();

  const existing = editor.locator(".text-run").first();
  await existing.click();
  const text = editor.getByLabel("Substituir este texto");
  await text.fill("Texto corrigido");
  await editor.getByRole("button", { name: "Trocar aqui" }).click();
  await expect(editor.locator(".annotation-layer text")).toContainText(
    "Texto corrigido",
  );
  await editor.getByRole("button", { name: "Desfazer" }).click();
  await expect(editor.locator(".text-run").first()).toBeVisible();

  await editor.locator(".text-run").first().click();
  await editor.getByLabel("Substituir este texto").fill("Texto final");
  await editor.getByRole("button", { name: "Trocar aqui" }).click();
  await editor.locator(".pdf-picture").first().click();
  await editor.getByRole("button", { name: "Mover ou esticar" }).click();
  await expect(editor.getByText("Objeto selecionado")).toBeVisible();

  await editor.getByRole("button", { name: "Guardar PDF" }).click();
  const row = page.locator(".job-row").filter({ hasText: name });
  await expect(row.getByText("Concluído", { exact: true })).toBeVisible({
    timeout: 60_000,
  });
  await row.getByRole("button", { name: "Pré-visualizar" }).click();
  await expect(page.locator(".preview-page")).toBeVisible({ timeout: 30_000 });
  expect(errors).toEqual([]);
});
