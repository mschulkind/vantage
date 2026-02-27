import { test, expect } from "@playwright/test";

test("loads the file tree and views a file", async ({ page }) => {
  await page.goto("/");

  // Check title
  await expect(page).toHaveTitle(/Vantage/);

  // Check file tree sidebar has README.md
  // Use getByRole 'cell' to avoid ambiguity with the README preview header
  const readmeFile = page.getByRole("cell", { name: "README.md" });
  await expect(readmeFile).toBeVisible();

  // Click README.md
  await readmeFile.click();

  // Check content is displayed
  await expect(page.getByText("Hello E2E")).toBeVisible();
  await expect(page.getByText("This is a test file")).toBeVisible();
});
