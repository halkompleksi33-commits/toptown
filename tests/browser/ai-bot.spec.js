import { test, expect } from "@playwright/test";
test("AI configuration is visible to admin and missing key is shown without exposure", async ({
  page,
  request,
}) => {
  const admin = await (
    await request.post("/api/login", {
      data: { name: "admin", password: "local-test-password" },
    })
  ).json();
  const headers = { Authorization: "Bearer " + admin.token };
  await request.post("/api/rooms", {
    headers,
    data: { name: "AI test odası" },
  });
  await page.addInitScript(
    (token) => sessionStorage.setItem("toptown-session", token),
    admin.token,
  );
  await page.goto("/");
  await page.locator("#adminButton").click();
  await page.getByRole("button", { name: "🤖 AI botlar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "AI bot yönetimi" }),
  ).toBeVisible();
  await expect(page.locator(".ai-status")).toContainText(
    "OPENAI_API_KEY eksik",
  );
  await page.locator('.ai-config [name="name"]').fill("Test Asistan");
  await page
    .locator(".ai-config")
    .getByRole("button", { name: "Kaydet", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "AI bot yönetimi" }),
  ).toHaveCount(0);
});
