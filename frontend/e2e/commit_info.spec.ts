import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe("Commit Info", () => {
  const testDir = path.join(__dirname, "../../tests/e2e/test_repo");
  const readmePath = path.join(testDir, "commit_info_test.md");

  test.beforeAll(async () => {
    // Create a new file to ensure it has a commit
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    // We don't actually need to create a file since we are using page1.md which exists
  });

  test.afterAll(() => {
    if (fs.existsSync(readmePath)) {
      fs.unlinkSync(readmePath);
    }
  });

  test("displays commit info for a markdown file", async ({ page }) => {
    // Navigate to an existing file that should have commit info
    await page.goto("/page1.md");

    // Wait for file content to load
    await expect(page.getByRole("heading", { name: "Page 1" })).toBeVisible();

    // Check for commit info elements
    const commitButton = page.locator('button[title="Click to view diff"]');

    // It might take a moment to load the commit info
    await expect(commitButton).toBeVisible({ timeout: 5000 });

    // The message should perform an action (open diff)
    await commitButton.click();

    // Check if diff modal opens
    // Note: Since this file definitely has commits, valid output is expected
    await expect(page.locator("text=Commit Diff")).toBeVisible();
  });
});
