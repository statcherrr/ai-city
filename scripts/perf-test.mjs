import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();

// Navigate to the app and wait for scene to load
await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

// Click on the first scenario button (Water Main) - bypass canvas by using force
const buttons = await page.$$('button');
console.log('Found', buttons.length, 'buttons');
for (const btn of buttons) {
  const text = await btn.textContent();
  if (text && text.includes('Water')) {
    console.log('Clicking:', text);
    await btn.click({ force: true });
    break;
  }
}

// Wait for the scenario to run for 10 seconds
await page.waitForTimeout(10000);

// Measure FPS during the last part of the run
const fpsStats = await page.evaluate(() => {
  return new Promise(resolve => {
    const frames = [];
    let lastTime = performance.now();
    const start = performance.now();
    
    const measure = () => {
      const now = performance.now();
      const delta = now - lastTime;
      lastTime = now;
      if (delta > 0) {
        frames.push(1000 / delta);
      }
      if (now - start < 10000) {
        requestAnimationFrame(measure);
      } else {
        resolve(frames);
      }
    };
    requestAnimationFrame(measure);
  });
});

// Calculate statistics
const validFrames = fpsStats.filter(d => d > 0 && d < 200);
const avgFps = validFrames.reduce((a, b) => a + b, 0) / validFrames.length;
const minFps = Math.min(...validFrames);
const maxFps = Math.max(...validFrames);
const avgFrameTime = 1000 / avgFps;

console.log('\nPerformance Results (10 seconds with Road Risk layer ON):');
console.log('  Average FPS:', avgFps.toFixed(1));
console.log('  Min FPS:', minFps.toFixed(1));
console.log('  Max FPS:', maxFps.toFixed(1));
console.log('  Average frame time:', avgFrameTime.toFixed(3) + 's');
console.log('  Total samples:', validFrames.length);

await browser.close();
