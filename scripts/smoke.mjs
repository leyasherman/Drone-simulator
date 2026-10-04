// Drives the dev build in a real browser (installed Edge) and prints sim state.
// Usage: npm run dev (in another terminal), then: node scripts/smoke.mjs
import { chromium } from 'playwright-core';

const URL = process.env.SIM_URL ?? 'http://localhost:5173/';
const browser = await chromium.launch({
  channel: 'msedge',
  headless: true,
  args: ['--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => console.log('[console]', m.type(), m.text()));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(URL);
await page.waitForFunction(() => 'window' in globalThis && '__sim' in window);

const state = () =>
  page.evaluate(() => {
    const { flight, input } = window.__sim;
    const b = flight.drone.body;
    return {
      armed: flight.drone.armed,
      thr: +input.sticks.throttle.toFixed(2),
      src: input.active.kind,
      alt: +flight.altitude.toFixed(2),
      vy: +b.velocity.y.toFixed(2),
      motors: flight.drone.quad.motors.map((m) => +m.toFixed(2)),
    };
  });

await page.mouse.click(640, 360);
console.log('start   ', await state());
await page.keyboard.press('Space');
await page.waitForTimeout(300);
console.log('armed?  ', await state());
await page.keyboard.down('KeyW');
for (let i = 0; i < 6; i++) {
  await page.waitForTimeout(250);
  console.log(`W ${(i + 1) * 250}ms`, await state());
}
await page.keyboard.up('KeyW');
for (let i = 0; i < 4; i++) {
  await page.waitForTimeout(500);
  console.log(`after +${(i + 1) * 500}ms`, await state());
}
await page.screenshot({ path: process.env.SHOT ?? 'smoke.png' });
await browser.close();
