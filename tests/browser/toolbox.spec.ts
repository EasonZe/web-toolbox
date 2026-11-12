import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function noOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({ width: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
  expect(overflow.content).toBeLessThanOrEqual(overflow.width + 1);
}

test("全部工具在真实浏览器中可打开且页面没有横向溢出", async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  const sitemap = await readFile("public/sitemap.xml", "utf8");
  const paths = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => new URL(match[1]).pathname).filter(path => path !== "/");
  expect(paths).toHaveLength(127);
  const failures: string[] = [], pageErrors: string[] = [];
  page.on("pageerror", error => pageErrors.push(`${page.url()}: ${error.message}`));
  for (const path of paths) {
    await test.step(path, async () => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(page.locator(".tool-header h1")).toBeVisible();
      if (path === "/world-clock") await expect.poll(() => page.locator(".world-clock-toolbar option").count()).toBeGreaterThan(20);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const sizes = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth }));
      if (sizes.page > sizes.viewport + 1) failures.push(`${path}: ${sizes.page}px > ${sizes.viewport}px`);
    });
  }
  await testInfo.attach("route-layout", { body: JSON.stringify({ failures, pageErrors }, null, 2), contentType: "application/json" });
  expect(pageErrors).toEqual([]);
  expect(failures).toEqual([]);
});

for (const view of ["groups", "table", "minimal", "cards"]) {
  test(`收藏在${view}布局中不让工具消失，刷新后仍保留`, async ({ page }) => {
    await page.addInitScript(mode => localStorage.setItem("eason-toolbox-tool-view", mode), view);
    await page.goto("/");
    await page.getByRole("searchbox", { name: "搜索工具" }).fill("字数统计");
    const link = page.locator('a[href="/word-counter"]');
    await expect(link).toBeVisible();
    await page.getByRole("button", { name: "收藏字数统计" , exact: true }).click();
    await expect(link).toBeVisible();
    await page.reload();
    await page.getByRole("searchbox", { name: "搜索工具" }).fill("字数统计");
    await expect(page.getByRole("button", { name: "取消收藏字数统计", exact: true })).toBeVisible();
    await page.locator(".favorites-filter").click();
    await expect(page.locator('a[href="/word-counter"]')).toBeVisible();
    await page.locator(".favorites-filter").click();
    await expect(page.locator('a[href="/word-counter"]')).toBeVisible();
    await noOverflow(page);
  });
}

test("设置切换布局后返回主页，深色偏好在新导航时保留", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "打开设置", exact: true }).click();
  await page.getByRole("button", { name: "深色", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await noOverflow(page);
  await page.getByRole("button", { name: "紧凑表格", exact: true }).click();
  await expect(page.getByRole("searchbox", { name: "搜索工具" })).toBeVisible();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect.poll(() => page.locator(".tool-card").first().evaluate(element => {
    let opacity = 1;
    for (let node: Element | null = element; node; node = node.parentElement) opacity *= Number(getComputedStyle(node).opacity);
    return opacity;
  })).toBeGreaterThan(0.99);
  await page.screenshot({ path: test.info().outputPath("home-dark.png") });
});

test("折叠分组收起再展开后工具仍可见", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("eason-toolbox-tool-view", "groups"));
  await page.goto("/");
  const group = page.locator(".tool-category-collapsible").first();
  const toggle = group.locator('button[aria-expanded]').first();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(group.locator("a.tool-card").first()).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
});

test("手机卡片先播放箭头反馈再进入工具，桌面悬浮仍有效", async ({ page, isMobile }) => {
  await page.addInitScript(() => localStorage.setItem("eason-toolbox-tool-view", "cards"));
  await page.goto("/");
  await page.getByRole("searchbox", { name: "搜索工具" }).fill("字数统计");
  const card = page.locator('a[href="/word-counter"]');
  await expect(card).toBeVisible();
  if (isMobile) {
    await card.tap();
    await expect(card).toHaveClass(/is-touch-entering/);
    expect(new URL(page.url()).pathname).toBe("/");
    const arrow = card.locator(".tool-arrow");
    await expect.poll(async () => (await arrow.boundingBox())?.width ?? 0).toBeGreaterThan(60);
  } else {
    await card.hover();
    await expect.poll(async () => (await card.locator(".tool-arrow").boundingBox())?.width ?? 0).toBeGreaterThan(60);
    await card.click();
  }
  await expect(page).toHaveURL(/\/word-counter$/);
  await expect(page.locator("h1")).toContainText("字数");
});

test("渐变色标在手机上保持横向标签和可用控件", async ({ page }) => {
  await page.goto("/gradient-generator");
  await noOverflow(page);
  const dimensions = await page.locator('.design-stop-editor label').evaluateAll(labels => labels.map(label => ({ text: label.textContent, width: label.getBoundingClientRect().width })));
  expect(dimensions.length).toBeGreaterThan(0);
  expect(dimensions.filter(label => label.width < 45)).toEqual([]);
  const preview = page.getByRole("img", { name: "渐变色预览", exact: true });
  await expect(preview).toBeVisible();
  await expect.poll(() => preview.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await page.screenshot({ path: test.info().outputPath("gradient-controls.png"), fullPage: true });
});

test("图片导入、圆角处理与 PNG 下载走真实 Canvas 流程", async ({ page }) => {
  await page.goto("/image-rounded");
  const png = await page.evaluate(() => { const canvas = document.createElement("canvas"); canvas.width = 96; canvas.height = 64; const ctx = canvas.getContext("2d")!; ctx.fillStyle = "#3478ed"; ctx.fillRect(0, 0, 96, 64); return canvas.toDataURL("image/png").split(",")[1]; });
  const picker = page.locator('input[type="file"]');
  await expect(picker).toBeEnabled();
  await picker.setInputFiles({ name: "sample.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") });
  await page.getByRole("button", { name: "生成 PNG", exact: true }).click();
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("link", { name: /下载.*PNG/ }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toMatch(/\.png$/);
  const file = await download.path();
  const bytes = await readFile(file!);
  expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  expect(bytes.readUInt32BE(16)).toBe(96);
  expect(bytes.readUInt32BE(20)).toBe(64);
  await noOverflow(page);
});

test("移除的 YouTube 接口返回 404", async ({ request }) => {
  for (const path of ["/api/youtube", "/api/youtube/"]) {
    const response = await request.get(path + "?url=https://youtu.be/dQw4w9WgXcQ");
    expect(response.status()).toBe(404);
  }
});

test("编辑器导入中文文本、保存草稿并下载 UTF-8 文件", async ({ page }) => {
  await page.goto("/plain-text-editor");
  const text = "浏览器测试\nHello toolbox 👋";
  await expect(page.locator('input[type="file"]')).toBeEnabled();
  await expect(page.getByRole("textbox", { name: "纯文本编辑区域" })).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from(text) });
  await expect(page.locator(".cm-content")).toContainText("浏览器测试");
  await page.getByRole("checkbox", { name: "自动保存草稿" }).check();
  await page.locator(".cm-content").press("End");
  await page.locator(".cm-content").pressSequentially(" saved");
  await page.getByLabel("编辑器字号").selectOption("18");
  await page.reload();
  await expect(page.locator(".cm-content")).toContainText("saved");
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载 TXT", exact: true }).click();
  const download = await event;
  const downloaded = await readFile((await download.path())!, "utf8");
  expect(downloaded).toContain("浏览器测试");
  expect(downloaded).toContain("saved");
  await noOverflow(page);
});

test("取消繁重正则任务后可以重新运行真实 Worker", async ({ page }) => {
  await page.goto("/regex-tester");
  await page.getByLabel("表达式（不用填写两侧斜杠）").fill("(a+)+$");
  await page.getByLabel("测试文本").fill("a".repeat(50000) + "!");
  await page.getByRole("button", { name: "测试匹配", exact: true }).click();
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await expect(page.getByText("已取消处理。", { exact: true })).toBeVisible();
  await page.getByLabel("表达式（不用填写两侧斜杠）").fill("width=\\d+");
  await page.getByLabel("测试文本").fill("width=1920");
  await page.getByRole("button", { name: "测试匹配", exact: true }).click();
  await expect(page.getByRole("heading", { name: "1 个匹配" })).toBeVisible();
});
