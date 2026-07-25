 # Standalone Playwright Recorder
 
 Extracted from playwright-1.61.1 recorder infrastructure.
 
This tool launches a browser, records your interactions, and generates Playwright test code.

By default, it generates **Python (pytest)** code. You can also switch to JavaScript output.

## Quick Start

```bash
npm install
npm start
```

## Usage

```bash
# Record with Python pytest format (default)
npm start

# Record a specific URL
node src/index.js https://example.com

# JavaScript output
node src/index.js --lang js

# Python sync library format
node src/index.js --lang py --format sync

# Python async library format
node src/index.js --lang py --format async

# Full options
node src/index.js https://example.com --lang py --format pytest
```

Close the browser window to stop recording. The generated code will be printed to the console.

### CLI Options

| Option | Short | Values | Default | Description |
|--------|-------|--------|---------|-------------|
| `--lang` | `-l` | `py`, `js` | `py` | Output language |
| `--format` | `-f` | `pytest`, `sync`, `async`, `test`, `library` | `pytest` | Code format |

### Python Output Formats

**pytest** (default):
```python
import re
from playwright.sync_api import Page, expect


def test_example(page: Page) -> None:
    page.goto("https://example.com")
    page.locator("#search").fill("playwright")
    page.locator("#search").press("Enter")
```

**sync** (library):
```python
import re
from playwright.sync_api import Playwright, sync_playwright, expect


def run(playwright: Playwright) -> None:
    browser = playwright.chromium.launch()
    context = browser.new_context()
    page = context.new_page()
    page.goto("https://example.com")
    page.locator("#search").fill("playwright")
    # ---------------------
    context.close()
    browser.close()


with sync_playwright() as playwright:
    run(playwright)
```

**async** (library):
```python
import asyncio
import re
from playwright.async_api import Playwright, async_playwright, expect


async def run(playwright: Playwright) -> None:
    browser = await playwright.chromium.launch()
    context = await browser.new_context()
    page = await context.new_page()
    await page.goto("https://example.com")
    await page.locator("#search").fill("playwright")
    # ---------------------
    await context.close()
    await browser.close()


async def main() -> None:
    async with async_playwright() as playwright:
        await run(playwright)


asyncio.run(main())
```

## How It Works
 
1. **Launch Browser**: Opens Chromium with the target URL
2. **Inject Recorder**: Injects `injectRecorder.js` into the page to capture interactions
3. **Record Actions**: Clicks, fills, presses, navigations etc. are recorded
4. **Generate Code**: When the browser closes, Python or JavaScript code is generated

## Architecture
 
 The recorder consists of:
 
- **`src/index.js`**: Main entry point, browser orchestration, and panel management
  - Inspector panel adapted from `packages/playwright-core/src/server/recorder/recorderApp.ts`

- **`src/codegen.js`**: Code generation module (JS + Python)
  - JS code generation adapted from `packages/playwright-core/src/server/codegen/javascript.ts`
  - Python code generation adapted from `packages/playwright-core/src/server/codegen/python.ts`
 
 - **`src/injectRecorder.js`**: Injection script for capturing user interactions
   - Adapted from `packages/injected/src/recorder/recorder.ts`
   - Selector generation adapted from `packages/injected/src/selectorGenerator.ts`
 
 ## Source Files Reference
 
 The `*.origin.ts` files are the original Playwright source code for reference:
 - `src/recorderInject.origin.ts` - Original injection script
- `src/codegenJavascript.origin.ts` - Original JS code generator
- `src/codegenPython.origin.ts` - Original Python code generator
- `src/recorderApp.origin.ts` - Original recorder app
 - `src/recorder.origin.ts` - Original recorder class
 - `src/recorderRunner.origin.ts` - Original action runner
 - `src/recorderUtils.origin.ts` - Original utilities
 - `src/actions.origin.d.ts` - Original action types
 
 ## Supported Actions
 
 | Action       | Description                  |
 |-------------|------------------------------|
 | click       | Click on an element          |
 | dblclick    | Double-click on an element   |
 | fill        | Fill in a text input         |
 | press       | Press a key                  |
 | check       | Check a checkbox/radio       |
 | uncheck     | Uncheck a checkbox           |
 | select      | Select dropdown option(s)    |
 | navigate    | Navigate to a URL            |
 | hover       | Hover over an element        |
 | setInputFiles | Choose file(s) for upload  |
