/**
 * Code generation module for Playwright recorder.
 * Supports JavaScript and Python output with multiple format options.
 *
 * Adapted from:
 *   - playwright-core/server/codegen/javascript.ts
 *   - playwright-core/server/codegen/python.ts
 */

// ============================================================
// Shared Utilities
// ============================================================

/**
 * Convert modifier bitmask to human-readable key names.
 * @param {number} modifiers - Bitmask: Alt=1, Control=2, Meta=4, Shift=8
 * @returns {string[]}
 */
export function toKeyboardModifiers(modifiers) {
  const result = [];
  if (modifiers & 1) result.push('Alt');
  if (modifiers & 2) result.push('Control');
  if (modifiers & 4) result.push('Meta');
  if (modifiers & 8) result.push('Shift');
  return result;
}

// ============================================================
// JavaScript Code Generation
// ============================================================

/**
 * Quote a string using single quotes (JS convention).
 */
function jsQuote(text) {
  return "'" + text.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
}

/**
 * Format a value as JavaScript literal.
 */
function formatJsObject(value, indent) {
  indent = indent || '  ';
  if (typeof value === 'string') return jsQuote(value);
  if (Array.isArray(value))
    return '[' + value.map(function(v) { return formatJsObject(v, indent); }).join(', ') + ']';
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value)
      .filter(function(pair) { return pair[1] !== undefined; })
      .map(function(pair) { return indent + pair[0] + ': ' + formatJsObject(pair[1], indent + '  '); });
    return '{\n' + entries.join(',\n') + '}';
  }
  return String(value);
}

/**
 * Generate JavaScript Playwright code from recorded actions.
 * @param {Array} actions - Recorded action objects
 * @param {object} options - { format: 'test'|'library', browserName }
 * @returns {string}
 */
export function generateJsCode(actions, options) {
  options = options || {};
  const isTest = options.format !== 'library';
  const browserName = options.browserName || 'chromium';
  const lines = [];

  if (isTest) {
    lines.push("import { test, expect } from '@playwright/test';");
    lines.push('');
    lines.push("test('test', async ({ page }) => {");
  } else {
    lines.push("const { " + browserName + " } = require('playwright');");
    lines.push('');
    lines.push('(async () => {');
    lines.push('  const browser = await ' + browserName + '.launch();');
    lines.push('  const context = await browser.newContext();');
    lines.push('  const page = await context.newPage();');
  }

  for (const action of actions) {
    const code = generateJsActionCode(action, isTest);
    if (code) lines.push('  ' + code);
  }

  if (isTest) {
    lines.push('});');
  } else {
    lines.push('  await context.close();');
    lines.push('  await browser.close();');
    lines.push('})();');
  }

  return lines.join('\n');
}

/**
 * Generate a single JavaScript action code line.
 */
export function generateJsActionCode(action, isTest) {
  const subject = 'page';
  // Build frame locator chain for iframe support
  const framePath = action.framePath || [];
  let frameLocator = '';
  for (const frameSelector of framePath) {
    frameLocator += '.frameLocator(' + jsQuote(frameSelector) + ')';
  }
  const locator = action.selector ? frameLocator + '.locator(' + jsQuote(action.selector) + ')' : frameLocator;

  switch (action.name) {
    case 'navigate':
      // Iframe navigations are auto-triggered, skip generating page.goto for them
      if (action.framePath && action.framePath.length > 0) return '';
      return 'await ' + subject + '.goto(' + jsQuote(action.url) + ');';
    case 'click':
      return 'await ' + subject + locator + '.click();';
    case 'dblclick':
      return 'await ' + subject + locator + '.dblclick();';
    case 'hover':
      return 'await ' + subject + locator + '.hover();';
    case 'fill':
      return 'await ' + subject + locator + '.fill(' + jsQuote(action.text) + ');';
    case 'press': {
      const modifiers = toKeyboardModifiers(action.modifiers || 0);
      const shortcut = [...modifiers, action.key].join('+');
      return 'await ' + subject + locator + '.press(' + jsQuote(shortcut) + ');';
    }
    case 'check':
      return 'await ' + subject + locator + '.check();';
    case 'uncheck':
      return 'await ' + subject + locator + '.uncheck();';
    case 'select':
      return 'await ' + subject + locator + '.selectOption(' + formatJsObject(action.options) + ');';
    case 'assertVisible':
      return (isTest ? '' : '// ') + 'await expect(' + subject + locator + ').toBeVisible();';
    case 'assertText':
      return (isTest ? '' : '// ') + 'await expect(' + subject + locator + ').' + (action.substring ? 'toContainText' : 'toHaveText') + '(' + jsQuote(action.text) + ');';
    case 'assertChecked':
      return (isTest ? '' : '// ') + 'await expect(' + subject + locator + ')' + (action.checked ? '' : '.not') + '.toBeChecked();';
    case 'assertValue': {
      const assertion = action.value ? 'toHaveValue(' + jsQuote(action.value) + ')' : 'toBeEmpty()';
      return (isTest ? '' : '// ') + 'await expect(' + subject + locator + ').' + assertion + ';';
    }
    case 'assertSnapshot':
      var _snap = (action.ariaSnapshot || '').split('\n')[0]; return (isTest ? '' : '// ') + 'await expect(' + subject + locator + ').toMatchAriaSnapshot(' + jsQuote(_snap) + ');';
    case 'assertScreenshot': {
      const snapName = action.screenshotPath || 'screenshot.png';
      return (isTest ? '' : '// ') + 'await expect(' + subject + locator + ').toHaveScreenshot(' + jsQuote(snapName) + ');';
    }
    default:
      return '// ' + action.name;
  }
}

// ============================================================
// Python Code Generation
// ============================================================

/**
 * Python-style quote using double quotes.
 */
function pyQuote(text) {
  return '"' + text.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

/**
 * Convert camelCase to snake_case.
 */
function toSnakeCase(str) {
  return str.replace(/([A-Z])/g, function(m) { return '_' + m.toLowerCase(); });
}

/**
 * Format a value as Python literal.
 */
function formatPyValue(value) {
  if (value === false) return 'False';
  if (value === true) return 'True';
  if (value === undefined || value === null) return 'None';
  if (Array.isArray(value)) return '[' + value.map(formatPyValue).join(', ') + ']';
  if (typeof value === 'string') return pyQuote(value);
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * Format Python keyword arguments.
 */
function formatPyOptions(value, hasArguments) {
  const keys = Object.keys(value).filter(function(key) { return value[key] !== undefined; });
  if (!keys.length) return '';
  const parts = keys.map(function(key) {
    return toSnakeCase(key) + '=' + formatPyValue(value[key]);
  });
  return (hasArguments ? ', ' : '') + parts.join(', ');
}

/**
 * Generate Python Playwright code from recorded actions.
 * @param {Array} actions - Recorded action objects
 * @param {object} options - { format: 'pytest'|'sync'|'async', browserName }
 * @returns {string}
 */
export function generatePythonCode(actions, options) {
  options = options || {};
  const format = options.format || 'pytest';
  const isPytest = format === 'pytest';
  const isAsync = format === 'async';
  const browserName = options.browserName || 'chromium';
  const testName = options.testName || 'test_example';
  const lines = [];

  if (isPytest) {
    lines.push('import os');
    lines.push('import re');
    lines.push('from datetime import datetime');
    lines.push('from playwright.sync_api import Page, expect');
    lines.push('import allure');
    lines.push('');
    lines.push('');
    lines.push('def _screenshot(page, name: str) -> None:');
    lines.push('    """Take a screenshot and attach to Allure report."""');
    lines.push('    ts = datetime.now().strftime("%H%M%S")');
    lines.push('    path = os.path.join("allure-results", f"{name}_{ts}.png")');
    lines.push('    os.makedirs(os.path.dirname(path), exist_ok=True)');
    lines.push('    page.screenshot(path=path)');
    lines.push('    allure.attach.file(path, name=name, attachment_type=allure.attachment_type.PNG)');
    lines.push('');
    lines.push('');
    lines.push('@allure.feature("录制测试")');
    lines.push('@allure.story("' + testName + '")');
    lines.push('def ' + testName + '(page: Page) -> None:');
  } else if (isAsync) {
    lines.push('import asyncio');
    lines.push('import re');
    lines.push('from playwright.async_api import Playwright, async_playwright, expect');
    lines.push('');
    lines.push('');
    lines.push('async def run(playwright: Playwright) -> None:');
    lines.push('    browser = await playwright.' + browserName + '.launch()');
    lines.push('    context = await browser.new_context()');
    lines.push('    page = await context.new_page()');
  } else {
    lines.push('import re');
    lines.push('from playwright.sync_api import Playwright, sync_playwright, expect');
    lines.push('');
    lines.push('');
    lines.push('def run(playwright: Playwright) -> None:');
    lines.push('    browser = playwright.' + browserName + '.launch()');
    lines.push('    context = browser.new_context()');
    lines.push('    page = context.new_page()');
  }

  // Generate action lines with allure steps (pytest only)
  for (var ai = 0; ai < actions.length; ai++) {
    var action = actions[ai];
    action._stepIndex = ai;
    const code = generatePythonActionCode(action, isPytest, isAsync);
    if (!code) continue;

    if (isPytest) {
      // Get a human-readable step title
      var stepTitle = _actionStepTitle(action, ai + 1);
      // Wrap with allure.step and add screenshot after
      lines.push('    with allure.step(' + pyQuote(stepTitle) + '):');
      // Indent the code inside the step
      var codeLines = code.split('\n');
      for (var ci = 0; ci < codeLines.length; ci++) {
        lines.push('        ' + codeLines[ci]);
      }
      // Add screenshot after each step
      lines.push('        _screenshot(page, ' + pyQuote('step_' + (ai + 1)) + ')');
    } else {
      lines.push('    ' + code);
    }
  }

  if (isPytest) {
    // No footer for pytest
  } else if (isAsync) {
    lines.push('');
    lines.push('    # ---------------------');
    lines.push('    await context.close()');
    lines.push('    await browser.close()');
    lines.push('');
    lines.push('');
    lines.push('async def main() -> None:');
    lines.push('    async with async_playwright() as playwright:');
    lines.push('        await run(playwright)');
    lines.push('');
    lines.push('');
    lines.push('asyncio.run(main())');
  } else {
    lines.push('');
    lines.push('    # ---------------------');
    lines.push('    context.close()');
    lines.push('    browser.close()');
    lines.push('');
    lines.push('');
    lines.push('with sync_playwright() as playwright:');
    lines.push('    run(playwright)');
  }

  return lines.join('\n');
}

/**
 * Generate a human-readable step title for Allure report.
 */
function _actionStepTitle(action, stepNum) {
  var prefix = '步骤 ' + stepNum + ': ';
  switch (action.name) {
    case 'navigate':
      return prefix + '导航到 ' + action.url;
    case 'click':
      return prefix + '点击 ' + (action.selector || '元素');
    case 'dblclick':
      return prefix + '双击 ' + (action.selector || '元素');
    case 'hover':
      return prefix + '悬停在 ' + (action.selector || '元素');
    case 'fill':
      return prefix + '在 ' + (action.selector || '输入框') + ' 中填入 ' + pyQuote(action.text || '');
    case 'press':
      var modifiers = toKeyboardModifiers(action.modifiers || 0);
      var shortcut = [...modifiers, action.key].join('+');
      return prefix + '按下 ' + shortcut;
    case 'check':
      return prefix + '勾选 ' + (action.selector || '复选框');
    case 'uncheck':
      return prefix + '取消勾选 ' + (action.selector || '复选框');
    case 'select':
      return prefix + '在下拉框 ' + (action.selector || '下拉框') + ' 中选择';
    case 'assertVisible':
      return prefix + '断言可见: ' + (action.selector || '元素');
    case 'assertText':
      return prefix + '断言文本: ' + (action.selector || '元素') + ' 包含 ' + pyQuote(action.text || '');
    case 'assertChecked':
      return prefix + '断言已勾选: ' + (action.selector || '复选框');
    case 'assertValue':
      return prefix + '断言值: ' + (action.selector || '输入框') + ' = ' + pyQuote(action.value || '');
    case 'assertSnapshot':
      return prefix + '断言ARIA快照: ' + (action.selector || '元素');
    case 'assertScreenshot':
      return prefix + '断言截图: ' + (action.selector || '元素');
    default:
      return prefix + action.name;
  }
}

/**
 * Generate a single Python action code line.
 */
export function generatePythonActionCode(action, isPytest, isAsync) {
  const subject = 'page';
  // Build frame locator chain for iframe support
  const framePath = action.framePath || [];
  let frameLocator = '';
  for (const frameSelector of framePath) {
    frameLocator += '.frame_locator(' + pyQuote(frameSelector) + ')';
  }
  const locator = action.selector ? frameLocator + '.locator(' + pyQuote(action.selector) + ')' : frameLocator;
  const awaitPrefix = isAsync ? 'await ' : '';

  switch (action.name) {
    case 'navigate':
      if (action.framePath && action.framePath.length > 0) return '';
      return awaitPrefix + subject + '.goto(' + pyQuote(action.url) + ')';
    case 'click':
      return awaitPrefix + subject + locator + '.click()';
    case 'dblclick':
      return awaitPrefix + subject + locator + '.dblclick()';
    case 'hover':
      return awaitPrefix + subject + locator + '.hover()';
    case 'fill':
      return awaitPrefix + subject + locator + '.fill(' + pyQuote(action.text) + ')';
    case 'press': {
      const modifiers = toKeyboardModifiers(action.modifiers || 0);
      const shortcut = [...modifiers, action.key].join('+');
      return awaitPrefix + subject + locator + '.press(' + pyQuote(shortcut) + ')';
    }
    case 'check':
      return awaitPrefix + subject + locator + '.check()';
    case 'uncheck':
      return awaitPrefix + subject + locator + '.uncheck()';
    case 'select':
      return awaitPrefix + subject + locator + '.select_option(' + formatPyValue(action.options) + ')';
    case 'assertVisible':
      return 'expect(' + subject + locator + ').to_be_visible()';
    case 'assertText':
      return 'expect(' + subject + locator + ').' + (action.substring ? 'to_contain_text' : 'to_have_text') + '(' + pyQuote(action.text) + ')';
    case 'assertChecked':
      return 'expect(' + subject + locator + ').' + (action.checked ? 'to_be_checked()' : 'not_to_be_checked()');
    case 'assertValue': {
      const assertion = action.value ? 'to_have_value(' + pyQuote(action.value) + ')' : 'to_be_empty()';
      return 'expect(' + subject + locator + ').' + assertion;
    }
    case 'assertSnapshot':
      var _snap = (action.ariaSnapshot || '').split('\n')[0];
      return 'expect(' + subject + locator + ').to_match_aria_snapshot(' + pyQuote(_snap) + ')  # ARIA snapshot - adjust if needed';
    case 'assertScreenshot': {
      const snapPath = action.screenshotPath || 'screenshot.png';
      const pyLines = [];
      pyLines.push('# Screenshot assertion: save screenshot for visual comparison');
      pyLines.push(awaitPrefix + subject + locator + '.screenshot(path=' + pyQuote('screenshots/' + snapPath) + ')');
      return pyLines.join('\n');
    }
    default:
      return '# ' + action.name;
  }
}

// ============================================================
// Source Generation (for Recorder Panel)
// ============================================================

/**
 * Generate Source objects for all language generators.
 * Used by the recorder panel to display code in different languages.
 * @param {Array} actions - Recorded action objects
 * @param {string} selectedId - Currently selected language generator id
 * @returns {Array<Source>}
 */
export function generateSources(actions, selectedId, options) {
  const testName = (options && options.testName) || 'test_example';
  const generators = [
    { id: 'python-pytest', label: 'Pytest', group: 'Python', language: 'python' },
    { id: 'python-sync', label: 'Library', group: 'Python', language: 'python' },
    { id: 'python-async', label: 'Library Async', group: 'Python', language: 'python' },
    { id: 'javascript-test', label: 'Test', group: 'JavaScript', language: 'javascript' },
    { id: 'javascript-library', label: 'Library', group: 'JavaScript', language: 'javascript' },
  ];

  return generators.map(function(gen) {
    let text = '';
    if (gen.id === 'python-pytest') {
      text = generatePythonCode(actions, { format: 'pytest', testName });
    } else if (gen.id === 'python-sync') {
      text = generatePythonCode(actions, { format: 'sync', testName });
    } else if (gen.id === 'python-async') {
      text = generatePythonCode(actions, { format: 'async', testName });
    } else if (gen.id === 'javascript-test') {
      text = generateJsCode(actions, { format: 'test' });
    } else if (gen.id === 'javascript-library') {
      text = generateJsCode(actions, { format: 'library' });
    }

    return {
      isRecorded: true,
      id: gen.id,
      label: gen.label,
      group: gen.group,
      text: text,
      language: gen.language,
      highlight: [],
      revealLine: text.split('\n').length - 1,
    };
  });
}
