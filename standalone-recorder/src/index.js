import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  generateJsCode, generateJsActionCode,
  generatePythonCode, generatePythonActionCode,
  generateSources
} from './codegen.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgs() {
  const args = process.argv.slice(2);
  let url = 'https://playwright.dev';
  let lang = 'py';
  let format = 'pytest';
  let testName = 'test_example';

  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--lang' || args[i] === '-l') && args[i + 1]) {
      lang = args[i + 1].toLowerCase();
      i++;
    } else if ((args[i] === '--format' || args[i] === '-f') && args[i + 1]) {
      format = args[i + 1].toLowerCase();
      i++;
    } else if ((args[i] === '--name' || args[i] === '-n') && args[i + 1]) {
      testName = args[i + 1];
      i++;
    } else if (!args[i].startsWith('-')) {
      url = args[i];
    }
  }

  return { url, lang, format, testName };
}

const CLI_OPTIONS = parseArgs();

// ============================================================
// Frame Selector Generation
// Adapted from Playwright recorderUtils.ts
// ============================================================

/**
 * Generate a frame path (array of iframe selectors) from a frame to the main frame.
 * This is the key to cross-domain iframe recording.
 * @param {import('playwright').Frame} frame
 * @returns {Promise<string[]>}
 */
async function generateFrameSelector(frame) {
  const selectorChain = [];
  let currentFrame = frame;
  while (currentFrame) {
    const parent = currentFrame.parentFrame();
    if (!parent) break; // reached main frame
    const selector = await generateFrameSelectorInParent(parent, currentFrame);
    selectorChain.push(selector);
    currentFrame = parent;
  }
  return selectorChain.reverse();
}

/**
 * Generate a CSS selector for an iframe element within its parent frame.
 * @param {import('playwright').Frame} parentFrame
 * @param {import('playwright').Frame} childFrame
 * @returns {Promise<string>}
 */
async function generateFrameSelectorInParent(parentFrame, childFrame) {
  try {
    // Try to get the iframe element and generate a selector for it
    const frameElement = await childFrame.frameElement();
    if (frameElement) {
      // Try common selector strategies
      const name = await frameElement.getAttribute('name');
      if (name) return 'iframe[name="' + name + '"]';

      const id = await frameElement.getAttribute('id');
      if (id) return '#' + id;

      const src = await frameElement.getAttribute('src');
      if (src) return 'iframe[src="' + src + '"]';

      // Try data-testid
      const testId = await frameElement.getAttribute('data-testid');
      if (testId) return '[data-testid="' + testId + '"]';

      // Fallback: nth-child
      const tag = await frameElement.evaluate(el => el.tagName.toLowerCase());
      return tag || 'iframe';
    }
  } catch (e) {
    // Cross-origin: may not be able to access frameElement attributes
  }

  // Fallback: use frame name or URL
  const frameName = childFrame.name();
  if (frameName) return 'iframe[name="' + frameName + '"]';

  const frameUrl = childFrame.url();
  if (frameUrl && frameUrl !== 'about:blank') return 'iframe[src*="' + frameUrl.split('/').slice(0, 3).join('/') + '"]';

  return 'iframe';
}

// ============================================================
// Main Recorder
// ============================================================

async function runRecorder() {
  console.log('');
  console.log('  Standalone Playwright Recorder (with cross-domain iframe support)');
  console.log('  =================================================================');
  console.log('  Target URL:', CLI_OPTIONS.url);
  console.log('  Language:', CLI_OPTIONS.lang === 'py' ? 'Python (' + CLI_OPTIONS.format + ')' : 'JavaScript');
  console.log('  Test Name:', CLI_OPTIONS.testName);
  console.log('');

  const recordedActions = [];
  let lastAction = null;
  let currentMode = 'recording';
  let selectedSourceId = getDefaultSourceId();
  let activePage = null;

  function getDefaultSourceId() {
    if (CLI_OPTIONS.lang === 'py') {
      if (CLI_OPTIONS.format === 'sync') return 'python-sync';
      if (CLI_OPTIONS.format === 'async') return 'python-async';
      return 'python-pytest';
    }
    return 'javascript-test';
  }

  function generateCurrentCode() {
    const sources = generateSources(recordedActions, selectedSourceId, {
      testName: CLI_OPTIONS.testName,
    });
    const source = sources.find(s => s.id === selectedSourceId);
    return source ? source.text : '';
  }

  function pushPanelUpdate() {
    if (!activePage || activePage.isClosed()) return;
    try {
      const code = generateCurrentCode();
      // Push update to main frame only (toolbar is only in main frame)
      activePage.evaluate((code) => {
        if (typeof window.__pw_panelDispatch === 'function') {
          window.__pw_panelDispatch({ method: 'codeUpdated', params: { code } });
        }
      }, code).catch(() => {});
    } catch (e) {}
  }

  function pushModeUpdate(mode) {
    if (!activePage || activePage.isClosed()) return;
    // Push mode to ALL frames (including iframes)
    try {
      const frames = activePage.frames();
      for (const frame of frames) {
        frame.evaluate((m) => {
          if (typeof window.__pw_panelDispatch === 'function') {
            window.__pw_panelDispatch({ method: 'modeChanged', params: { mode: m } });
          }
          // Also update recorder mode in iframe
          if (typeof window.__pw_setRecorderMode === 'function') {
            window.__pw_setRecorderMode(m);
          }
        }, mode).catch(() => {});
      }
    } catch (e) {}
  }

  // ============================================================
  // Launch Browser
  // ============================================================
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  activePage = await context.newPage();

  // ============================================================
  // Expose Bindings (use exposeBinding to get frame reference)
  // This is the KEY to cross-domain iframe support:
  // exposeBinding's callback receives { frame, page } as first arg
  // even for cross-origin iframes!
  // ============================================================

  /**
   * Record an action from any frame (main or iframe).
   * The framePath is automatically computed from the frame reference.
   */
  await context.exposeBinding('__pw_recordAction', async function(source, action) {
    if (currentMode === 'paused') return;

    // Filter out about:blank/chrome-error:// navigations
    if (action.name === 'navigate' && (action.url === 'about:blank' || action.url.startsWith('about:') || action.url.startsWith('chrome-error://'))) return;

    // Handle mode change from iframe (finishAssert sends _modeChange action)
    if (action.name === '_modeChange') {
      currentMode = action.mode;
      pushModeUpdate(currentMode);
      console.log('  Mode changed from iframe:', currentMode);
      return;
    }

    // Generate frame path for this action
    const framePath = await generateFrameSelector(source.frame);
    if (framePath.length > 0) {
      action.framePath = framePath;
      console.log('  [iframe action]', action.name, 'framePath:', framePath.join(' > '));
    }

    // Deduplication logic (same as before, but now includes framePath)
    if (action.name === 'fill' && lastAction && lastAction.name === 'fill' &&
        lastAction.selector === action.selector &&
        JSON.stringify(lastAction.framePath || []) === JSON.stringify(action.framePath || [])) {
      lastAction.text = action.text;
      pushPanelUpdate();
      return;
    }
    if (action.name === 'press' && lastAction && lastAction.name === 'press' &&
        lastAction.selector === action.selector &&
        JSON.stringify(lastAction.framePath || []) === JSON.stringify(action.framePath || [])) {
      if (lastAction.key === action.key && lastAction.modifiers === action.modifiers) return;
    }
    if (action.name === 'navigate' && lastAction && lastAction.name === 'navigate' &&
        JSON.stringify(lastAction.framePath || []) === JSON.stringify(action.framePath || [])) {
      lastAction.url = action.url;
      pushPanelUpdate();
      return;
    }

    recordedActions.push(action);
    lastAction = action;

    // Handle screenshot assertion: capture element screenshot
    if (action.name === 'assertScreenshot' && activePage && !activePage.isClosed()) {
      (async () => {
        try {
          const screenshotDir = path.join(__dirname, '..', 'test_case', 'screenshots');
          if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });
          const screenshotName = CLI_OPTIONS.testName + '-' + recordedActions.length + '.png';
          const screenshotPath = path.join(screenshotDir, screenshotName);
          // Build full selector with frame path
          const locator = buildLocator(activePage, action);
          await locator.screenshot({ path: screenshotPath });
          action.screenshotPath = screenshotName;
          console.log('  Screenshot saved:', screenshotName);
          pushPanelUpdate();
        } catch(e) { console.log('  Screenshot error:', e.message); }
      })();
    }

    const isPython = CLI_OPTIONS.lang === 'py';
    const preview = isPython
      ? generatePythonActionCode(action, CLI_OPTIONS.format === 'pytest', CLI_OPTIONS.format === 'async')
      : generateJsActionCode(action, true);
    if (preview) console.log('  > ' + preview.replace(/\n/g, '\n  > '));

    pushPanelUpdate();
  });

  /**
   * Handle panel commands from any frame.
   * Only main frame controls the toolbar; iframe commands are ignored for setMode.
   */
  await context.exposeBinding('__pw_panelCommand', async function(source, data) {
    const isMainFrame = !source.frame.parentFrame();

    switch (data.method) {
      case 'setMode':
        currentMode = data.params.mode;
        pushModeUpdate(currentMode);
        console.log('  Mode:', currentMode, isMainFrame ? '(main frame)' : '(iframe)');
        break;
      case 'clear':
        recordedActions.length = 0;
        lastAction = null;
        pushPanelUpdate();
        console.log('  Actions cleared.');
        break;
      case 'languageChanged':
        selectedSourceId = data.params.language;
        pushPanelUpdate();
        break;
      case 'stop':
        console.log('  Stopping recorder...');
        browser.close().catch(function() {});
        break;
      case 'panelReady':
        pushPanelUpdate();
        break;
    }
  });

  /**
   * Build a Playwright Locator from an action with framePath.
   * This handles both main-frame and iframe actions.
   */
  function buildLocator(page, action) {
    const framePath = action.framePath || [];
    let locator = page;
    // Chain frame_locator() calls for each iframe in the path
    for (const frameSelector of framePath) {
      locator = locator.frameLocator(frameSelector);
    }
    if (action.selector) {
      locator = locator.locator(action.selector);
    }
    return locator;
  }

  // ============================================================
  // Inject Recorder Script
  // Uses addInitScript which automatically runs in ALL frames
  // (main frame + same-origin iframes + cross-origin iframes)
  // The script detects whether it's in the main frame or an iframe
  // and behaves accordingly:
  //   - Main frame: injects toolbar + event capture
  //   - Iframe: event capture only (no toolbar)
  // ============================================================
  const injectPath = path.join(__dirname, 'injectRecorder.js');
  const INJECT_SCRIPT = fs.readFileSync(injectPath, 'utf8');
  await context.addInitScript(INJECT_SCRIPT);

  // Navigate to target URL
  await activePage.goto(CLI_OPTIONS.url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(function(err) {
    console.log('  Navigation warning:', err.message.split('\n')[0]);
  });

  // Handle new pages (popups)
  context.on('page', async function(newPage) {
    console.log('  New page opened:', newPage.url());
  });

  // Track iframe navigations
  activePage.on('framenavigated', function(frame) {
    if (frame !== activePage.mainFrame()) {
      console.log('  Iframe navigated:', frame.url());
    }
  });

  console.log('  Browser opened. Recording your interactions...');
  console.log('  Cross-domain iframes are supported!');
  console.log('  Toolbar: [Record/Pause] [Assert] [Clear] [Stop] [Lang] [Code]');
  console.log('  Shortcuts: F9=Pause/Resume  F10=AssertVisible  F11=AssertText');
  console.log('  Assert: 👁Visible  At Text  Va Value  📋 Snapshot  📷 Screenshot  Esc=Cancel');
  console.log('  Close the browser window to stop recording and see the generated code.');
  console.log('');

  // Wait for browser to close
  await new Promise(function(resolve) {
    browser.on('disconnected', resolve);
  });

  // Generate and output the code
  const isPython = CLI_OPTIONS.lang === 'py';
  const code = isPython
    ? generatePythonCode(recordedActions, { format: CLI_OPTIONS.format || 'pytest', testName: CLI_OPTIONS.testName })
    : generateJsCode(recordedActions, { format: 'test' });

  // Save to test_case folder
  const outputDir = path.join(__dirname, '..', 'test_case');
  try {
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    const ext = isPython ? '.py' : '.js';
    const outputPath = path.join(outputDir, CLI_OPTIONS.testName + ext);
    fs.writeFileSync(outputPath, code, 'utf8');
    console.log('');
    console.log('  Saved to: ' + outputPath);
  } catch(saveErr) {
    console.log('');
    console.log('  Warning: Could not save file:', saveErr.message);
  }

  console.log('');
  console.log('  Generated Playwright ' + (isPython ? 'Python' : 'Test') + ' Code:');
  console.log('  ' + '='.repeat(50));
  console.log(code);
  console.log('  ' + '='.repeat(50));
  console.log('');
  console.log('  Recording complete!');

  await browser.close();
}

runRecorder().catch(function(err) {
  console.error('Recorder error:', err);
  process.exit(1);
});
