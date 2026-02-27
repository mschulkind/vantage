import { test, expect } from "@playwright/test";

test("navigation via markdown links", async ({ page }) => {
  test.setTimeout(60000);

  // Listen for console logs
  page.on("console", (msg) => console.log("PAGE LOG:", msg.text()));

  await page.goto("/");

  // Wait for the app to settle
  await page.waitForTimeout(5000);

  // Log the table content
  const tableContent = await page.innerText("table");
  console.log("TABLE CONTENT:", tableContent);

  // Take a screenshot for visual debugging
  await page.screenshot({ path: "test-results/debug-screenshot.png" });

  // Find page1.md in the table
  const page1Link = page.getByRole("cell", { name: "page1.md" });
  await expect(page1Link).toBeVisible({ timeout: 20000 });
  await page1Link.click();

  // Now on page1.md content, wait for link to page 2
  const page2Link = page.getByText("Link to Page 2");
  await expect(page2Link).toBeVisible({ timeout: 10000 });

  // Click link to page2.md
  await page2Link.click();

  // Verify page 2 content
  await expect(page.getByText("Page 2")).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("Success!")).toBeVisible();

  // Go back to root
  await page.getByText("root").first().click();

  const subdirLink = page.getByRole("cell", { name: "subdir" });
  await expect(subdirLink).toBeVisible();
  await subdirLink.click();

  // Verify subdir content (auto-renders README)
  await expect(page.getByText("Subdirectory README")).toBeVisible({
    timeout: 10000,
  });
});
