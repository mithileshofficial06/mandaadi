// Act on the most recent tab of the CDP-controlled Chromium: fill a field and/or click a button, then report.
// Usage: node tools/rb-act.mjs '<json steps>' [shot.png]
// steps: [{"fill":"placeholder text","value":"x"},{"click":"button name regex"},{"wait":2000}]
import { chromium } from 'playwright';
const steps = JSON.parse(process.argv[2] ?? '[]');
const shot = process.argv[3] ?? '.mandaadi/act.png';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
const pages = browser.contexts()[0].pages();
const page = [...pages].reverse().find((p) => !p.url().startsWith('about:')) ?? pages[0];
for (const s of steps) {
  if (s.fill) {
    await page.getByPlaceholder(new RegExp(s.fill, 'i')).first().click();
    await page.keyboard.press('Control+A');
    await page.keyboard.type(s.value, { delay: 40 });
  }
  if (s.click) await page.getByRole(s.role ?? 'button', { name: new RegExp(s.click, 'i') }).first().click();
  if (s.check) await page.getByRole('checkbox').nth(s.check - 1).check();
  await page.waitForTimeout(s.wait ?? 2500);
}
await page.screenshot({ path: shot });
console.log('url:', page.url());
console.log((await page.innerText('body')).replace(/\s+/g, ' ').slice(0, 700));
await browser.close();
