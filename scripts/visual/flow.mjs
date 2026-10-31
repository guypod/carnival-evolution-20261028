// Plays a changed flow in a real browser and writes what happened: the
// screenshots, their sha256 and a pass or fail for each flow. It is the
// evidence the native merge gate asks for on an app change (see
// scripts/native/README.md). Run it through run-flow.sh, which sets up the
// browser and serves this checkout.
//
//   node scripts/visual/flow.mjs <base url> <out dir> <flow>
//
// A flow that cannot reach its end state fails; it never passes by default.
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [base, out, name] = process.argv.slice(2);
const require = createRequire(join(process.env.PLAYWRIGHT_DIR ?? process.cwd(), 'package.json'));
const { chromium } = require('playwright');

/** Pixels of a canvas region, read from the game's own canvas. */
const region = (page, box) =>
  page.evaluate((b) => {
    const c = document.querySelector('canvas');
    return Array.from(c.getContext('2d').getImageData(b.x, b.y, b.w, b.h).data);
  }, box);
const share = (a, b) => {
  let diff = 0;
  for (let i = 0; i < a.length; i += 4)
    if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 24)
      diff++;
  return diff / (a.length / 4);
};

const FLOWS = {
  // Start, putt until the hole ends (sunk or out of strokes), then press Next.
  'mini-putt-hole-next': async (page, shot, check) => {
    const BANNER = { x: 16, y: 446, w: 570, h: 48 };
    const COURSE = { x: 40, y: 70, w: 720, h: 370 };
    await page.goto(new URL('#/play/mini-putt', base).href);
    await page.locator('canvas').click({ position: { x: 5, y: 5 } });
    await page.waitForTimeout(400);
    await page.keyboard.press('Space');
    await page.waitForTimeout(400);
    await shot('aiming');
    const aimingStrip = await region(page, BANNER);
    let done = false;
    for (let putt = 0; putt < 7 && !done; putt++) {
      await page.keyboard.press('Space');
      // Wait for the ball to stop: two equal course reads in a row.
      let prev = await region(page, COURSE);
      for (let i = 0; i < 60; i++) {
        await page.waitForTimeout(250);
        const now = await region(page, COURSE);
        if (share(prev, now) === 0) break;
        prev = now;
      }
      done = share(aimingStrip, await region(page, BANNER)) > 0.2;
    }
    check('hole ends with the result banner below the green', done);
    await shot('hole-done');
    const doneCourse = await region(page, COURSE);
    await page.keyboard.press('Space');
    await page.waitForTimeout(600);
    await shot('after-next');
    check('Next moves to the next hole', share(doneCourse, await region(page, COURSE)) > 0.02);
    check(
      'aim help and meter return after Next',
      share(aimingStrip, await region(page, BANNER)) < 0.2,
    );
  },
};

const flow = FLOWS[name];
if (!flow) {
  console.error(`unknown flow ${name}`);
  process.exit(2);
}
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const report = {
  flow: name,
  base,
  browser: browser.version(),
  checks: [],
  screenshots: [],
  errors: [],
};
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (e) => report.errors.push(String(e)));
  await flow(
    page,
    async (state) => {
      const png = await page.screenshot({ fullPage: true });
      const file = `${name}-${state}.png`;
      writeFileSync(join(out, file), png);
      report.screenshots.push({ file, sha256: createHash('sha256').update(png).digest('hex') });
    },
    (check, ok) => report.checks.push({ check, result: ok ? 'pass' : 'fail' }),
  );
} catch (e) {
  report.errors.push(String(e));
} finally {
  await browser.close();
}
report.result =
  report.checks.length && report.checks.every((c) => c.result === 'pass') && !report.errors.length
    ? 'pass'
    : 'fail';
writeFileSync(join(out, 'flow.json'), JSON.stringify(report, null, 2) + '\n');
for (const c of report.checks) console.log(`${c.result} ${c.check}`);
for (const e of report.errors) console.error(e);
process.exit(report.result === 'pass' ? 0 : 1);
