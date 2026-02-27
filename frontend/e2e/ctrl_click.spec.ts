import { test, expect } from "@playwright/test";

test.describe("link accessibility for new tab navigation", () => {
  test("sidebar file links have proper href attributes for ctrl+click/middle-click", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForTimeout(2000);

    // Find a markdown file link in the sidebar
    const mdFile = page.locator('a:has-text("page1.md")').first();
    await expect(mdFile).toBeVisible({ timeout: 10000 });

    // Verify it has a proper href attribute
    const href = await mdFile.getAttribute("href");
    expect(href).toBe("/page1.md");

    // Verify it's an actual anchor tag, not a div with click handler
    const tagName = await mdFile.evaluate((el) => el.tagName.toLowerCase());
    expect(tagName).toBe("a");
  });

  test("markdown links have proper absolute href attributes", async ({
    page,
  }) => {
    // Navigate to page1.md which has a link to page2.md
    await page.goto("/page1.md");
    await page.waitForTimeout(2000);

    // Find the link to page2 in the markdown content
    const link = page.locator('a:has-text("Link to Page 2")');
    await expect(link).toBeVisible({ timeout: 10000 });

    // Verify it has a proper absolute href attribute (not relative like "page2.md")
    const href = await link.getAttribute("href");
    expect(href).toBe("/page2.md");

    // Verify it's an actual anchor tag
    const tagName = await link.evaluate((el) => el.tagName.toLowerCase());
    expect(tagName).toBe("a");
  });

  test("regular click on sidebar file navigates in same tab", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForTimeout(2000);

    const mdFile = page.locator('a:has-text("page1.md")').first();
    await expect(mdFile).toBeVisible({ timeout: 10000 });

    // Regular click should navigate in same tab
    await mdFile.click();

    await expect(page).toHaveURL(/page1\.md/, { timeout: 10000 });
  });

  test("regular click on markdown link navigates in same tab", async ({
    page,
  }) => {
    // First navigate to page1.md
    await page.goto("/page1.md");
    await page.waitForTimeout(2000);

    // Wait for the link to be visible
    const link = page.locator('a:has-text("Link to Page 2")');
    await expect(link).toBeVisible({ timeout: 10000 });

    // Regular click
    await link.click();

    // Should navigate in same tab
    await expect(page).toHaveURL(/page2\.md/, { timeout: 10000 });
    await expect(page.getByText("Success!")).toBeVisible();
  });

  test("ctrl+click does not prevent default behavior", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(2000);

    const mdFile = page.locator('a:has-text("page1.md")').first();
    await expect(mdFile).toBeVisible({ timeout: 10000 });

    // Track if preventDefault was called
    const wasDefaultPrevented = await page.evaluate(() => {
      return new Promise<boolean>((resolve) => {
        const link = document.querySelector('a[href="/page1.md"]');
        if (!link) {
          resolve(true); // fail the test
          return;
        }
        link.addEventListener(
          "click",
          (e) => {
            resolve(e.defaultPrevented);
          },
          { once: true },
        );

        // Simulate ctrl+click
        const event = new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          ctrlKey: true,
          button: 0,
        });
        link.dispatchEvent(event);
      });
    });

    // Default should NOT be prevented for ctrl+click
    expect(wasDefaultPrevented).toBe(false);
  });

  test("middle-click does not prevent default behavior", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(2000);

    const mdFile = page.locator('a:has-text("page1.md")').first();
    await expect(mdFile).toBeVisible({ timeout: 10000 });

    // Track if preventDefault was called
    const wasDefaultPrevented = await page.evaluate(() => {
      return new Promise<boolean>((resolve) => {
        const link = document.querySelector('a[href="/page1.md"]');
        if (!link) {
          resolve(true); // fail the test
          return;
        }
        link.addEventListener(
          "click",
          (e) => {
            resolve(e.defaultPrevented);
          },
          { once: true },
        );

        // Simulate middle-click (button 1)
        const event = new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          button: 1,
        });
        link.dispatchEvent(event);
      });
    });

    // Default should NOT be prevented for middle-click
    expect(wasDefaultPrevented).toBe(false);
  });
});
