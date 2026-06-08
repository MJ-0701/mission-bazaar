import { chromium } from "playwright-core";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

const base = process.env.APP_URL || "http://localhost:3010";
const chrome =
  process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const outDir = new URL("../test-artifacts/", import.meta.url);

async function call(path, init = {}) {
  const response = await fetch(base + path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers || {})
    }
  });
  const json = await response.json();
  if (!json.ok) {
    throw new Error(`${path} ${json.error}`);
  }
  return { data: json.data, response };
}

async function assertMobileLayout(page, label) {
  const result = await page.evaluate(() => {
    const viewport = document.documentElement.clientWidth;
    const scrollWidth = document.documentElement.scrollWidth;
    const broken = Array.from(document.querySelectorAll(".btn, .stepper button"))
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      })
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          text: element.textContent?.trim() || element.getAttribute("aria-label") || element.tagName,
          width: rect.width,
          height: rect.height,
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth
        };
      })
      .filter((item) => item.width < 28 || item.height < 28 || item.scrollWidth > item.clientWidth + 2);

    return {
      viewport,
      scrollWidth,
      hasHorizontalOverflow: scrollWidth > viewport + 1,
      broken
    };
  });

  if (result.hasHorizontalOverflow || result.broken.length) {
    throw new Error(`${label} mobile layout failed: ${JSON.stringify(result, null, 2)}`);
  }
  return result;
}

async function waitForBodyText(page, text) {
  await page.waitForFunction(
    (expected) => document.body.innerText.includes(expected),
    text,
    { timeout: 8000 }
  );
}

await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: chrome,
  headless: true,
  args: ["--no-sandbox"]
});

const context = await browser.newContext({
  viewport: { width: 430, height: 932 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true
});

const page = await context.newPage();
const report = [];

await page.goto(`${base}/pickup`, { waitUntil: "domcontentloaded" });
await waitForBodyText(page, "주문 후 픽업 상태를 확인할 수 있습니다.");
report.push(["pickup-empty", await assertMobileLayout(page, "pickup-empty")]);
await page.screenshot({ path: fileURLToPath(new URL("mobile-pickup-empty.png", outDir)), fullPage: true });

await page.goto(base, { waitUntil: "domcontentloaded" });
await waitForBodyText(page, "영주팀");
await waitForBodyText(page, "모닝샌드");
report.push(["customer", await assertMobileLayout(page, "customer")]);
await page.screenshot({ path: fileURLToPath(new URL("mobile-customer.png", outDir)), fullPage: true });

const boot = await call("/api/public/bootstrap");
const morning = boot.data.menus.find((menu) => menu.code === "yeongju-morning-sand");
const main = boot.data.menus.find((menu) => menu.code === "jeju-main-dish");
const created = await call("/api/orders", {
  method: "POST",
  body: JSON.stringify({
    pickupName: `모바일검증${Date.now()}`,
    phone: `010${String(Date.now()).slice(-8)}`,
    items: [
      { menuId: morning.id, quantity: 1 },
      { menuId: main.id, quantity: 1 }
    ]
  })
});
await call(`/api/orders/${created.data.orderNo}/payment-checking`, {
  method: "POST",
  body: JSON.stringify({ token: created.data.orderToken })
});

await page.goto(
  `${base}/pickup?orderNo=${encodeURIComponent(created.data.orderNo)}&token=${encodeURIComponent(
    created.data.orderToken
  )}`,
  { waitUntil: "domcontentloaded" }
);
await waitForBodyText(page, created.data.orderNo);
await waitForBodyText(page, "입금 확인 중");
report.push(["pickup", await assertMobileLayout(page, "pickup")]);
await page.screenshot({ path: fileURLToPath(new URL("mobile-pickup.png", outDir)), fullPage: true });

await page.goto(`${base}/admin`, { waitUntil: "domcontentloaded" });
await waitForBodyText(page, "관리자 로그인");
report.push(["admin-login", await assertMobileLayout(page, "admin-login")]);
await page.screenshot({ path: fileURLToPath(new URL("mobile-admin-login.png", outDir)), fullPage: true });

await page.getByLabel("PIN").fill("master 0000");
await page.getByRole("button", { name: "로그인" }).click();
await waitForBodyText(page, "주문 목록");
await waitForBodyText(page, created.data.orderNo);
report.push(["admin-dashboard", await assertMobileLayout(page, "admin-dashboard")]);
await page.screenshot({ path: fileURLToPath(new URL("mobile-admin-dashboard.png", outDir)), fullPage: true });

await page.locator(".metric-card.status-payment-checking").click();
await page.locator(".metric-card.status-payment-checking.active").waitFor({ timeout: 3000 });
await page.locator(".metric-card.status-payment-checking").click();
await page.locator(".metric-card.status-payment-checking.active").waitFor({ state: "detached", timeout: 3000 });
await page.locator(".metric-card.status-payment-checking").click();

let adminOrder = page.locator(".order-card").filter({ hasText: created.data.orderNo }).first();
await adminOrder.getByRole("button", { name: "취소" }).click();
await adminOrder.getByLabel("취소 사유").fill("모바일 검증 취소");
await adminOrder.getByRole("button", { name: "취소 확정" }).click();
await page.locator(".metric-card.status-canceled").click();
await waitForBodyText(page, "모바일 검증 취소");
adminOrder = page.locator(".order-card").filter({ hasText: created.data.orderNo }).first();
await adminOrder.getByRole("button", { name: "주문 복구" }).click();
await waitForBodyText(page, "입금 확인 중");

await context.close();

const tabletContext = await browser.newContext({
  viewport: { width: 834, height: 1194 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true
});
const tabletPage = await tabletContext.newPage();

await tabletPage.goto(base, { waitUntil: "domcontentloaded" });
await waitForBodyText(tabletPage, "영주팀");
await waitForBodyText(tabletPage, "제주팀");
report.push(["tablet-customer", await assertMobileLayout(tabletPage, "tablet-customer")]);
await tabletPage.screenshot({ path: fileURLToPath(new URL("tablet-customer.png", outDir)), fullPage: true });

await tabletPage.goto(
  `${base}/pickup?orderNo=${encodeURIComponent(created.data.orderNo)}&token=${encodeURIComponent(
    created.data.orderToken
  )}`,
  { waitUntil: "domcontentloaded" }
);
await waitForBodyText(tabletPage, created.data.orderNo);
report.push(["tablet-pickup", await assertMobileLayout(tabletPage, "tablet-pickup")]);
await tabletPage.screenshot({ path: fileURLToPath(new URL("tablet-pickup.png", outDir)), fullPage: true });

await tabletPage.goto(`${base}/admin`, { waitUntil: "domcontentloaded" });
await waitForBodyText(tabletPage, "관리자 로그인");
await tabletPage.getByLabel("PIN").fill("0000");
await tabletPage.getByRole("button", { name: "로그인" }).click();
await waitForBodyText(tabletPage, "주문 목록");
await waitForBodyText(tabletPage, created.data.orderNo);
report.push(["tablet-admin-dashboard", await assertMobileLayout(tabletPage, "tablet-admin-dashboard")]);
await tabletPage.screenshot({ path: fileURLToPath(new URL("tablet-admin-dashboard.png", outDir)), fullPage: true });
await tabletContext.close();

await browser.close();
console.log(JSON.stringify(report, null, 2));
