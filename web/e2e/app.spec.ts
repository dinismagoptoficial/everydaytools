import { test, expect } from "@playwright/test";
import { Buffer } from "node:buffer";
const email = "family@example.test";
const password = "test-only-password-123";

test("setup, local tools, upload, conversion, download, deletion and mobile", async ({
  page,
}) => {
  const external: string[] = [],
    errors: string[] = [];
  page.on("request", (r) => {
    if (
      /^https?:/.test(r.url()) &&
      !r.url().startsWith("http://127.0.0.1:8087")
    )
      external.push(r.url());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator(".auth-form")).toBeVisible();
  if (
    await page
      .getByRole("heading", { name: "Bem-vindo ao Everyday Tools" })
      .isVisible()
  ) {
    await page.getByLabel("E-mail", { exact: true }).fill(email);
    await page.getByLabel(/^Palavra-passe/).fill(password);
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
    await expect(page.getByLabel("Retenção (minutos)")).toHaveValue("60");
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
    await page.getByText("Condições de utilização", { exact: true }).click();
    await expect(
      page.getByText("Privacidade e retenção", { exact: true }),
    ).toBeVisible();
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Começar a utilizar" }).click();
  } else {
    await page.getByLabel("E-mail", { exact: true }).fill(email);
    await page.getByLabel(/^Palavra-passe/).fill(password);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
  }
  await expect(
    page.getByRole("heading", { name: "O que queres fazer?" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/home-desktop.png",
    fullPage: true,
  });
  await page.getByLabel("Idioma").selectOption("en");
  await expect(
    page.getByRole("heading", { name: "What would you like to do?" }),
  ).toBeVisible();
  await page.getByLabel("Language").selectOption("pt-PT");
  await page.getByRole("button", { name: "Dia a dia", exact: true }).click();
  await page.getByRole("button", { name: /Trabalhar com texto/ }).click();
  await page.getByLabel("O teu texto").fill("olá mundo\nolá mundo");
  await page.getByRole("button", { name: "Remover linhas repetidas" }).click();
  await expect(page.getByLabel("O teu texto")).toHaveValue("olá mundo");
  await page.getByRole("button", { name: "Todas as ferramentas" }).click();
  await page.getByRole("button", { name: /Criar QR Code/ }).click();
  await page
    .getByLabel("Conteúdo", { exact: true })
    .fill("Everyday Tools local");
  await page.getByRole("button", { name: "Gerar código" }).click();
  await expect(page.getByAltText("QR Code gerado")).toBeVisible();
  await page.getByRole("button", { name: "Início", exact: true }).click();
  // A tiny valid PNG, processed by the actual isolated container worker.
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNgYGBgAAAABQABeqhXUAAAAABJRU5ErkJggg==",
    "base64",
  );
  const fileName = `family-photo-${Date.now()}.png`;
  await page
    .locator("input[type=file]")
    .setInputFiles({ name: fileName, mimeType: "image/png", buffer: png });
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /Converter imagem/ })
    .click();
  await page.getByLabel("Formato de saída").selectOption("jpg");
  await page.getByRole("button", { name: "Processar ficheiro" }).click();
  await expect(
    page.getByText("Concluído", { exact: true }).first(),
  ).toBeVisible({ timeout: 60000 });
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("link", { name: "Descarregar", exact: true })
    .first()
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.jpg$/);
  expect(await download.failure()).toBeNull();
  await page
    .getByRole("button", { name: "Eliminar agora: " + fileName })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Eliminar agora", exact: true })
    .click();
  await expect(page.getByText(fileName, { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Início", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  // A closed mobile menu must leave the accessibility tree, not just slide off screen.
  await expect(
    page.getByRole("navigation", { name: "Navegação principal" }),
  ).toBeHidden();
  await page.screenshot({
    path: "test-results/home-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.getByRole("button", { name: "Abrir menu" }).click();
  await expect(
    page.getByRole("navigation", { name: "Navegação principal" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Ficheiros recentes", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Ficheiros recentes" }),
  ).toBeVisible();
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

test("registration and login use separate personal file lists", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".auth-form")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Esqueceste-te da palavra-passe?" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Esqueceste-te da palavra-passe?" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Recuperar palavra-passe" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Voltar ao início de sessão" })
    .click();
  await page.getByRole("button", { name: "Criar uma conta" }).click();
  const unique = `person-${Date.now()}@example.test`;
  await page.getByLabel("E-mail", { exact: true }).fill(unique);
  await page.getByLabel(/^Palavra-passe/).fill(password);
  await page.getByRole("button", { name: "Criar conta", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "O que queres fazer?" }),
  ).toBeVisible();
  await page.locator(".account").click();
  await page.getByRole("button", { name: "Terminar sessão" }).click();
  await page.getByLabel("E-mail", { exact: true }).fill(unique);
  await page.getByLabel(/^Palavra-passe/).fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "O que queres fazer?" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Administração", exact: true }),
  ).toHaveCount(0);
});
