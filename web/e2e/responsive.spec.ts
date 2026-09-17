import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const sizes = [
  { name: "phone-compact", width: 320, height: 700 },
  { name: "phone", width: 390, height: 844 },
  { name: "fold-cover", width: 344, height: 882 },
  { name: "fold-open", width: 717, height: 512 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "tablet-landscape", width: 1024, height: 768 },
];

async function fits(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
}

test("legal information is fast, organised and responsive", async ({
  page,
}) => {
  let requests = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/legal") requests++;
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Sobre, termos e privacidade" })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Sobre, termos e privacidade",
  });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Privacidade e retenção" }),
  ).toHaveAttribute("aria-expanded", "true");
  expect(
    (await new AxeBuilder({ page }).include(".legal-modal").analyze())
      .violations,
  ).toEqual([]);

  for (const size of sizes) {
    await page.setViewportSize(size);
    await fits(page);
    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(size.width + 1);
    expect(box!.y + box!.height).toBeLessThanOrEqual(size.height + 1);
    await page.screenshot({
      path: `test-results/legal-${size.name}.png`,
      fullPage: false,
    });
  }

  await page.setViewportSize({ width: 320, height: 700 });
  await dialog.getByRole("button", { name: "Privacidade e retenção" }).click();
  await dialog.getByRole("button", { name: "Licença MIT" }).click();
  await expect(dialog.locator("pre")).toBeVisible();
  await fits(page);
  await dialog.getByRole("button", { name: "Licença MIT" }).click();
  await dialog.getByRole("button", { name: "Software de terceiros" }).click();
  await expect(
    dialog.getByRole("link", { name: "Licenças da interface" }),
  ).toBeVisible();
  await fits(page);

  await dialog.getByRole("button", { name: "Fechar" }).click();
  await page
    .getByRole("button", { name: "Sobre, termos e privacidade" })
    .click();
  await expect(dialog).toBeVisible();
  expect(requests).toBe(1);
  await dialog.getByRole("button", { name: "Fechar" }).click();
});

test("application shell adapts to phones, folds and tablets", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("E-mail", { exact: true }).fill("family@example.test");
  await page.getByLabel(/^Palavra-passe/).fill("test-only-password-123");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "O que queres fazer?" }),
  ).toBeVisible();

  for (const size of sizes) {
    await page.setViewportSize(size);
    await fits(page);
    const navigation = page.getByRole("navigation", {
      name: "Navegação principal",
    });
    if (size.width <= 900) {
      await expect(navigation).toBeHidden();
      await expect(
        page.getByRole("button", { name: "Abrir menu" }),
      ).toBeVisible();
    } else {
      await expect(navigation).toBeVisible();
    }
    await page.screenshot({
      path: `test-results/app-${size.name}.png`,
      fullPage: true,
    });
  }
});
