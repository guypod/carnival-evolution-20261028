// Captures the rendered states the visual design baseline and the visual repair
// loop judge: desktop, narrow, keyboard focus and Quiet. It needs Playwright,
// which is not a dependency of the carnival: install the pinned version outside
// the clone and point PLAYWRIGHT_DIR at it (see docs/visual-baseline/README.md).
//
//   node scripts/visual/capture.mjs <base url> <out dir> [route ...]
//
// Every screenshot is inspected in the browser before it counts: a blank or
// near-uniform image fails the run instead of passing as evidence.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [base = 'http://localhost:5173/', out = 'visual-capture', ...routes] = process.argv.slice(2);
const require = createRequire(join(process.env.PLAYWRIGHT_DIR ?? process.cwd(), 'package.json'));
const { chromium } = require('playwright');

const VIEWPORTS = { desktop: { width: 1280, height: 800 }, narrow: { width: 390, height: 844 } };
const targets = routes.length ? routes : ['#/', '#/balloon'];

// Interaction states per route: what a visitor does before the screenshot.
// Plain wishes, so the comparison images stay clean; safe text for markup is
// covered by cleanWish's unit tests, not by these screenshots.
const INTERACTIONS = {
  '#/balloon': async (page) => {
    await page.getByLabel('gold').check();
    await page.getByLabel(/Your wish/).fill('ride the big wheel');
    await page.getByRole('button', { name: 'Release the balloon' }).click();
    await page.getByLabel('blue').check();
    await page.getByLabel(/Your wish/).fill('see the stars');
    await page.getByRole('button', { name: 'Release the balloon' }).click();
    await page.waitForTimeout(1500);
  },
  // Starter decor only, so the image needs no earned prizes.
  '#/room': async (page) => {
    await page.getByRole('button', { name: 'Paper Lantern' }).click();
    await page.locator('.room-slots button').nth(1).click();
    await page.getByRole('button', { name: 'Striped Rug' }).click();
    await page.locator('.room-slots button').nth(9).click();
  },
};

// Counts colours on a coarse grid and how much of the image is one flat colour.
async function inspect(page, png) {
  return page.evaluate(
    async (src) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      const { data } = g.getImageData(0, 0, c.width, c.height);
      const counts = new Map();
      let samples = 0;
      for (let y = 0; y < c.height; y += 4) {
        for (let x = 0; x < c.width; x += 4) {
          const i = (y * c.width + x) * 4;
          const key = `${data[i] >> 4},${data[i + 1] >> 4},${data[i + 2] >> 4}`;
          counts.set(key, (counts.get(key) ?? 0) + 1);
          samples++;
        }
      }
      const top = Math.max(...counts.values());
      return {
        width: c.width,
        height: c.height,
        colours: counts.size,
        flatShare: Number((top / samples).toFixed(3)),
      };
    },
    `data:image/png;base64,${png.toString('base64')}`,
  );
}

const browser = await chromium.launch();
const report = {
  base,
  capturedAt: new Date().toISOString(),
  browser: browser.version(),
  shots: [],
};
mkdirSync(out, { recursive: true });
try {
  for (const route of targets) {
    const slug = route.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'midway';
    for (const [name, viewport] of Object.entries(VIEWPORTS)) {
      for (const quiet of [false, true]) {
        const context = await browser.newContext({
          viewport,
          reducedMotion: quiet ? 'reduce' : 'no-preference',
        });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', (e) => errors.push(String(e)));
        await page.goto(new URL(route, base).href);
        await page.waitForTimeout(600);
        const states = [['clean', null]];
        if (!quiet) states.push(['focus', 'Tab']);
        if (INTERACTIONS[route]) states.push(['interaction', INTERACTIONS[route]]);
        for (const [state, action] of states) {
          if (typeof action === 'string') {
            await page.keyboard.press(action);
            await page.keyboard.press(action);
          } else if (action) {
            await action(page);
          }
          const png = await page.screenshot({ fullPage: true });
          const file = `${slug}-${name}${quiet ? '-quiet' : ''}-${state}.png`;
          writeFileSync(join(out, file), png);
          const pixels = await inspect(page, png);
          const blank = pixels.colours < 8 || pixels.flatShare > 0.97;
          report.shots.push({ route, file, viewport, quiet, state, pixels, blank, errors });
        }
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
}
writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
const bad = report.shots.filter((s) => s.blank || s.errors.length);
for (const s of report.shots) {
  console.log(`${s.blank ? 'BLANK' : 'ok   '} ${s.file} ${JSON.stringify(s.pixels)}`);
}
if (bad.length) {
  console.error(`${bad.length} screenshot(s) are blank or threw page errors`);
  process.exit(1);
}
