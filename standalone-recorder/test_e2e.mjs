import { chromium } from 'playwright';
import fs from 'fs';
import { generatePythonCode, generateJsCode } from './src/codegen.js';

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext();

const actions = [];
await context.exposeFunction('__pw_recordAction', function(action) {
  if (action.name === 'navigate' && (action.url === 'about:blank' || action.url.startsWith('about:'))) return;
  actions.push(action);
  console.log('REC:', action.name, action.selector || action.url || '', action.text ? 'text=' + action.text.substring(0, 30) : '', action.value !== undefined ? 'value=' + action.value : '', action.checked !== undefined ? 'checked=' + action.checked : '', action.ariaSnapshot ? 'snapshot' : '');
});
await context.exposeFunction('__pw_panelCommand', function(data) {
  console.log('CMD:', data.method, JSON.stringify(data.params));
  if (data.method === 'stop') browser.close().catch(() => {});
});

const INJECT_SCRIPT = fs.readFileSync('src/injectRecorder.js', 'utf8');
await context.addInitScript(INJECT_SCRIPT);

const page = await context.newPage();
await page.goto('https://example.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForFunction(() => document.getElementById('__pw_toolbar') !== null, { timeout: 10000 });
await page.waitForTimeout(1000);
console.log('=== Page loaded ===');

// Test 1: Assert visible
console.log('\nTEST 1: Assert visible');
await page.click('[id="__pw_btnAV"]');
await page.waitForTimeout(300);
await page.click('h1');
await page.waitForTimeout(500);

// Test 2: Assert text
console.log('\nTEST 2: Assert text');
await page.click('[id="__pw_btnAT"]');
await page.waitForTimeout(300);
await page.click('p');
await page.waitForTimeout(500);
// Dialog should appear - type and confirm
const dialog = page.locator('[id="__pw_dialog"] textarea');
if (await dialog.count() > 0) {
  await dialog.fill('Example Domain');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
}

// Test 3: Assert value - click the link
console.log('\nTEST 3: Assert value');
await page.click('[id="__pw_btnAVa"]');
await page.waitForTimeout(300);

// Test 4: Assert snapshot
console.log('\nTEST 4: Assert snapshot');
await page.click('[id="__pw_btnAS"]');
await page.waitForTimeout(300);
await page.click('div');
await page.waitForTimeout(500);

// Test 5: Minimize
console.log('\nTEST 5: Minimize');
await page.click('[id="__pw_btnMin"]');
await page.waitForTimeout(300);
const miniVis = await page.evaluate(() => document.getElementById('__pw_mini').style.display !== 'none');
console.log('Minibar visible:', miniVis);

// Test 6: Expand
await page.click('[id="__pw_btnMax"]');
await page.waitForTimeout(300);

// Test 7: Drag
console.log('\nTEST 7: Drag');
const grip = page.locator('[id="__pw_grip"]');
await grip.hover();
await page.mouse.down();
await page.mouse.move(300, 50);
await page.mouse.up();
await page.waitForTimeout(300);
const pos = await page.evaluate(() => { const el = document.getElementById('__pw_toolbar'); return { left: el.style.left, top: el.style.top }; });
console.log('After drag:', JSON.stringify(pos));

// Stop
console.log('\nStopping...');
await page.click('[id="__pw_btnStp"]');
await page.waitForTimeout(3000);

// Generate code
console.log('\n=== Python Code ===');
const pyCode = generatePythonCode(actions, { format: 'pytest', testName: 'test_example' });
console.log(pyCode);

// Clean up
fs.unlinkSync('test_e2e.mjs');
