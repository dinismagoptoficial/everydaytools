import { expect, test } from "@playwright/test";
import { Buffer } from "node:buffer";
import AxeBuilder from "@axe-core/playwright";

const email = "family@example.test";
const password = "test-only-password-123";
const picture = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAKAAAABkCAIAAACO1KzYAAABY0lEQVR42u3cuw3CQBAGYXtFWUQIiZAyqI+ckDKogJgC6AACHr79/U2MxO6N5rAEYr7dHxNyKUdAMAgGwSAYBINgEEwwCAbBWJ5N/Ibn7f71C47XS/D6c96XDW+Nrsp3juAPvaaaThD8dbVJmnsL/qnaDM1dBf9NbXfNxe7477uiggc54kYpF7vZKRe72Y6L3WzHxW6242I3e8JydtlzllPLnracV/bMvvCf/KJDCo0nL2eUPb8r2hUt385bKFjB8u28i4IVLN/OGylYwfLtvJeCFQyC3c/DbqdgBYNgEIxVCs5+whphRwUrGASDYBAMgkEwCCYYBINgEIxwwdl/5TvCjgpWMAgGwVir4OznrMW3U7CCQbBbeti9FKxgEXfeSMEKFnHnXRSsYBF33kLBChZx5/nLGWVP7ooOZ96dDk7BZzAIBsEgGASDYBBMMAgGwSAYBINgEEwwCAbBIBgEg2AQjCfVbW87lOZi2wAAAABJRU5ErkJggg==",
  "base64",
);

test("preview, background image and manual mask editing", async ({ page }) => {
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await page.goto("/");
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel(/^Palavra-passe/).fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "O que queres fazer?" }),
  ).toBeVisible();

  const fileName = `mask-editor-${Date.now()}.png`;
  await page.locator("input[type=file]").first().setInputFiles({
    name: fileName,
    mimeType: "image/png",
    buffer: picture,
  });
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /Remover fundo/ })
    .click();
  await page.getByRole("button", { name: "Processar ficheiro" }).click();

  const row = page.locator(".job-row").filter({ hasText: fileName });
  await expect(row.getByText("Concluído", { exact: true })).toBeVisible({
    timeout: 120_000,
  });
  await row.getByRole("button", { name: "Pré-visualizar" }).click();
  const preview = page.getByRole("dialog", { name: /image-1\.png/ });
  await expect(preview.locator(".preview-image")).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).include(".preview-modal").analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({
    path: "test-results/preview-desktop.png",
    fullPage: true,
  });
  await preview
    .getByRole("button", { name: "Ajustar máscara e fundo" })
    .click();

  const editor = page.getByRole("dialog", {
    name: "Ajustar máscara e fundo",
  });
  const canvas = editor.locator("canvas");
  await expect(canvas).toBeVisible();
  await editor.locator("input[type=file]").setInputFiles({
    name: "background.png",
    mimeType: "image/png",
    buffer: picture,
  });
  await expect(
    editor.getByRole("button", { name: "Trocar imagem" }),
  ).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).include(".matte-modal").analyze())
      .violations,
  ).toEqual([]);

  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.move(
    bounds!.x + bounds!.width * 0.4,
    bounds!.y + bounds!.height * 0.5,
  );
  await page.mouse.down();
  await page.mouse.move(
    bounds!.x + bounds!.width * 0.6,
    bounds!.y + bounds!.height * 0.5,
    {
      steps: 6,
    },
  );
  await page.mouse.up();
  await expect(editor.getByRole("button", { name: "Anular" })).toBeEnabled();
  await editor.getByRole("button", { name: "Anular" }).click();
  await editor.getByRole("button", { name: "Recuperar" }).click();
  await canvas.click({
    position: { x: bounds!.width / 2, y: bounds!.height / 2 },
  });

  await page.screenshot({
    path: "test-results/mask-editor-desktop.png",
    fullPage: true,
  });
  const downloadEvent = page.waitForEvent("download");
  await editor.getByRole("button", { name: "Descarregar PNG" }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe("image-1-editado.png");
  const saved = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of saved) chunks.push(Buffer.from(chunk));
  const result = Buffer.concat(chunks);
  expect(result.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  expect(result.readUInt32BE(16)).toBe(160);
  expect(result.readUInt32BE(20)).toBe(100);

  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "test-results/mask-editor-mobile.png",
    fullPage: true,
  });

  await editor.getByRole("button", { name: "Fechar" }).click();
  await row
    .getByRole("button", { name: `Eliminar agora: ${fileName}` })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Eliminar agora", exact: true })
    .click();
  await expect(row).toHaveCount(0);
  expect(browserErrors).toEqual([]);
});
