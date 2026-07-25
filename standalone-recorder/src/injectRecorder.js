/**
 * Injection script for recording user interactions in the target page.
 * Features: floating draggable toolbar, minimize, 6 assertion modes.
 * Assertion modes match Playwright source: visible/text/value/checked/snapshot/screenshot.
 * Supports cross-domain iframe recording via exposeBinding.
 */

(function() {
  if (window.__pw_recorder_installed) return;
  window.__pw_recorder_installed = true;

  var isMainFrame = window === window.top;

  // ============================================================
  // Selector Generation
  // ============================================================

  function generateSelector(element) {
    if (!element || !element.tagName) return 'body';
    var testId = element.getAttribute('data-testid');
    if (testId) return '[data-testid=' + JSON.stringify(testId) + ']';
    if (element.id) return '#' + CSS.escape(element.id);
    var role = element.getAttribute('role') || implicitRole(element);
    var name = element.getAttribute('aria-label')
      || element.getAttribute('placeholder')
      || element.title
      || element.getAttribute('alt');
    if (role && name) return role + '[name=' + JSON.stringify(name) + ']';
    if (['BUTTON', 'A', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(element.tagName)) {
      var text = element.textContent && element.textContent.trim();
      if (text && text.length < 50)
        return (role || element.tagName.toLowerCase()) + ':has-text(' + JSON.stringify(text) + ')';
    }
    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
      var placeholder = element.getAttribute('placeholder');
      if (placeholder) return element.tagName.toLowerCase() + '[placeholder=' + JSON.stringify(placeholder) + ']';
    }
    if (element.id) {
      var label = document.querySelector('label[for="' + element.id + '"]');
      if (label) {
        var ltext = label.textContent && label.textContent.trim();
        if (ltext && ltext.length < 50) return element.tagName.toLowerCase() + ':has-text(' + JSON.stringify(ltext) + ')';
      }
    }
    var parent = element.parentElement;
    if (parent) {
      var siblings = Array.from(parent.children).filter(function(s) { return s.tagName === element.tagName; });
      if (siblings.length === 1) return generateSelector(parent) + ' > ' + element.tagName.toLowerCase();
      var index = siblings.indexOf(element) + 1;
      return generateSelector(parent) + ' > ' + element.tagName.toLowerCase() + ':nth-child(' + index + ')';
    }
    return element.tagName.toLowerCase();
  }

  function implicitRole(element) {
    var tag = element.tagName, type = element.type;
    if (tag === 'BUTTON') return 'button';
    if (tag === 'A' && element.hasAttribute('href')) return 'link';
    if (tag === 'INPUT') {
      if (type === 'checkbox') return 'checkbox';
      if (type === 'radio') return 'radio';
      if (type === 'search') return 'searchbox';
      if (['text', 'email', 'password', 'tel', 'url', 'number'].includes(type)) return 'textbox';
    }
    if (tag === 'SELECT') return 'listbox';
    if (tag === 'TEXTAREA') return 'textbox';
    if (['H1','H2','H3','H4','H5','H6'].includes(tag)) return 'heading';
    return '';
  }

  // ============================================================
  // Utilities
  // ============================================================

  function getModifiers(e) {
    return (e.altKey ? 1 : 0) | (e.ctrlKey ? 2 : 0) | (e.metaKey ? 4 : 0) | (e.shiftKey ? 8 : 0);
  }

  function asCheckbox(node) {
    if (!node || node.nodeName !== 'INPUT') return null;
    if (['checkbox', 'radio'].includes(node.type)) return node;
    return null;
  }

  function shouldIgnoreMouseEvent(target) {
    if (target.nodeName === 'SELECT' || target.nodeName === 'OPTION') return true;
    if (target.nodeName === 'INPUT') {
      var s = new Set(['color', 'date', 'datetime-local', 'file', 'month', 'range', 'time', 'week']);
      if (s.has(target.type)) return true;
    }
    return false;
  }

  /** Check if event targets the toolbar - MUST return false in iframes */
  function isToolbarEvent(e) {
    if (!isMainFrame) return false;
    var node = e.target;
    while (node) {
      if (node.id === '__pw_toolbar' || node.id === '__pw_dialog') return true;
      node = node.parentElement;
    }
    return false;
  }

  /** Check if event targets the assertion dialog - MUST return false in iframes */
  function isDialogEvent(e) {
    if (!isMainFrame) return false;
    var node = e.target;
    while (node) {
      if (node.id === '__pw_dialog') return true;
      node = node.parentElement;
    }
    return false;
  }

  function sendAction(action) {
    if (typeof window.__pw_recordAction === 'function') {
      window.__pw_recordAction(action);
    }
  }

  function elementHasValue(el) {
    if (!el) return false;
    return el.nodeName === 'TEXTAREA' || el.nodeName === 'SELECT' ||
      (el.nodeName === 'INPUT' && !['button', 'image', 'reset', 'submit'].includes(el.type));
  }

  /** Get text from element - handles both text content and input values */
  function getElementText(el) {
    if (!el) return '';
    if (elementHasValue(el)) return (el.value || '').replace(/\s+/g, ' ').trim();
    return (el.textContent || '').replace(/\s+/g, ' ').trim();
  }

  /**
   * Generate ARIA snapshot in Playwright's YAML format.
   * Format: "- role \"accessible name\"" for leaf nodes,
   *         "- role \"name\":" for container nodes with indented children.
   */
  function generateAriaSnapshot(el) {
    if (!el) return '';
    var role = el.getAttribute('role') || implicitRole(el);
    var name = el.getAttribute('aria-label')
      || el.getAttribute('placeholder')
      || el.title
      || el.getAttribute('alt')
      || '';
    if (!name && el.textContent) {
      var trimmed = el.textContent.replace(/\s+/g, ' ').trim();
      if (trimmed.length > 0 && trimmed.length < 80) name = trimmed;
    }
    var children = el.children;
    var hasChildren = children.length > 0 && children.length < 15;
    var line = '- ';
    if (role) {
      line += role;
    } else if (el.tagName === 'IMG') {
      line += 'img';
    } else if (el.tagName === 'INPUT' && el.type === 'search') {
      line += 'searchbox';
    } else if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      line += 'textbox';
    } else {
      line += el.tagName.toLowerCase();
    }
    if (name) line += ' ' + JSON.stringify(name);
    if (hasChildren) {
      var childSnaps = [];
      for (var i = 0; i < children.length; i++) {
        var cs = generateAriaSnapshot(children[i]);
        if (cs) {
          var cslines = cs.split('\n');
          for (var j = 0; j < cslines.length; j++) {
            if (cslines[j]) childSnaps.push('  ' + cslines[j]);
          }
        }
      }
      if (childSnaps.length > 0) {
        return line + ':\n' + childSnaps.join('\n');
      }
    }
    return line;
  }

  // ============================================================
  // State
  // ============================================================

  var activeModel = null;
  var hoveredModel = null;
  var hoveredElement = null;
  var pendingClickAction = null;
  var currentMode = 'recording';

  // Expose mode setter for cross-frame mode updates from Node.js
  window.__pw_setRecorderMode = function(mode) {
    currentMode = mode;
    removeAssertHighlight();
  };

  // ============================================================
  // Assertion Highlight
  // ============================================================

  var _assertOverlay = null;

  function updateAssertHighlight(target) {
    removeAssertHighlight();
    if (!target || target === document.body || target === document.documentElement) return;
    if (currentMode === 'assertingText' && !getElementText(target)) return;
    if (currentMode === 'assertingSnapshot' && !target.textContent.trim() && !getElementText(target)) return;
    if (currentMode === 'assertingValue' && !elementHasValue(target) && !asCheckbox(target)) return;
    try {
      var rect = target.getBoundingClientRect();
      var overlay = document.createElement('div');
      overlay.id = '__pw_assert_highlight';
      overlay.style.cssText = 'position:fixed;top:' + rect.top + 'px;left:' + rect.left + 'px;width:' + rect.width + 'px;height:' + rect.height + 'px;border:2px solid #e0a030;background:rgba(224,160,48,0.08);z-index:2147483646;pointer-events:none;border-radius:2px;transition:all 0.1s ease';
      document.documentElement.appendChild(overlay);
      _assertOverlay = overlay;
    } catch(e) {}
  }

  function removeAssertHighlight() {
    if (_assertOverlay && _assertOverlay.parentNode) _assertOverlay.parentNode.removeChild(_assertOverlay);
    _assertOverlay = null;
  }

  // ============================================================
  // Event Handlers (capture phase on document)
  // ============================================================

  function onClick(e) {
    if (!e.isTrusted) return;
    if (isDialogEvent(e)) return;
    if (isToolbarEvent(e)) return;

    if (currentMode.startsWith('asserting')) {
      e.preventDefault(); e.stopPropagation();
      handleAssertClick(e.target);
      return;
    }

    if (currentMode === 'paused') return;
    if (shouldIgnoreMouseEvent(e.target)) return;

    var checkbox = asCheckbox(e.target);
    if (checkbox && e.detail === 1) {
      sendAction({ name: checkbox.checked ? 'uncheck' : 'check', selector: hoveredModel ? hoveredModel.selector : generateSelector(checkbox), modifiers: getModifiers(e) });
      return;
    }

    if (pendingClickAction) { clearTimeout(pendingClickAction.timeout); pendingClickAction = null; }

    var selector = hoveredModel ? hoveredModel.selector : generateSelector(e.target);
    if (e.detail === 2) {
      sendAction({ name: 'dblclick', selector: selector, button: 'left', modifiers: getModifiers(e), clickCount: 2 });
    } else if (e.detail === 1) {
      var action = { name: 'click', selector: selector, button: 'left', modifiers: getModifiers(e), clickCount: 1, position: e.target.tagName === 'CANVAS' ? { x: e.offsetX, y: e.offsetY } : undefined };
      pendingClickAction = { action: action, timeout: setTimeout(function() { if (currentMode !== 'paused') sendAction(action); pendingClickAction = null; }, 200) };
    }
  }

  function onInput(e) {
    if (isToolbarEvent(e) || isDialogEvent(e)) return;
    if (currentMode !== 'recording') return;
    var target = e.target;
    if (target.nodeName === 'INPUT' && target.type.toLowerCase() === 'file') { sendAction({ name: 'setInputFiles', selector: generateSelector(target), files: Array.from(target.files || []).map(function(f) { return f.name; }) }); return; }
    if (target.nodeName === 'INPUT' && target.type.toLowerCase() === 'range') { sendAction({ name: 'fill', selector: generateSelector(target), text: target.value }); return; }
    if (['INPUT', 'TEXTAREA'].includes(target.nodeName) || target.isContentEditable) {
      if (['checkbox', 'radio'].includes(target.type)) return;
      sendAction({ name: 'fill', selector: generateSelector(target), text: target.isContentEditable ? target.innerText : target.value }); return;
    }
    if (target.nodeName === 'SELECT') sendAction({ name: 'select', selector: generateSelector(target), options: Array.from(target.selectedOptions).map(function(o) { return o.value; }) });
  }

  function onKeyDown(e) {
    if (!e.isTrusted) return;
    if (isDialogEvent(e)) return;
    if (isToolbarEvent(e)) return;
    if (e.key === 'F9' || e.key === 'F10' || e.key === 'F11') return;
    if (currentMode !== 'recording') return;
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
    if (e.key === ' ') { var cb = asCheckbox(e.target); if (cb && e.detail === 0) { sendAction({ name: cb.checked ? 'uncheck' : 'check', selector: activeModel ? activeModel.selector : generateSelector(cb), modifiers: getModifiers(e) }); return; } }
    sendAction({ name: 'press', selector: activeModel ? activeModel.selector : generateSelector(e.target), key: e.key, modifiers: getModifiers(e) });
  }

  function onMouseMove(e) {
    if (isToolbarEvent(e) || isDialogEvent(e)) return;
    var target = e.target;
    if (hoveredElement === target) return;
    hoveredElement = target;
    hoveredModel = { selector: generateSelector(target) };
    if (currentMode.startsWith('asserting')) updateAssertHighlight(target);
  }

  function onFocus(e) {
    if (isToolbarEvent(e) || isDialogEvent(e)) return;
    var ae = document.activeElement;
    if (ae && ae !== document.body && ae.closest && !ae.closest('#__pw_toolbar')) activeModel = { selector: generateSelector(ae) };
  }

  // ============================================================
  // Assertion Click Handler
  // ============================================================

  function handleAssertClick(target) {
    var selector = hoveredModel ? hoveredModel.selector : generateSelector(target);

    switch (currentMode) {
      case 'assertingVisible':
        sendAction({ name: 'assertVisible', selector: selector });
        finishAssert();
        break;
      case 'assertingText':
        var text = getElementText(target);
        // For elements with value (input/textarea/select), use assertValue instead of assertText
        // because to_contain_text does not work on input elements
        if (elementHasValue(target) && text) {
          showAssertDialog(selector, text, 'assertValue', target);
        } else if (text) {
          showAssertDialog(selector, text, 'assertText', target);
        }
        break;
      case 'assertingValue':
        if (asCheckbox(target)) {
          sendAction({ name: 'assertChecked', selector: selector, checked: !target.checked });
          finishAssert();
        } else if (elementHasValue(target)) {
          var currentVal = target.value || '';
          showAssertDialog(selector, currentVal, 'assertValue', target);
        }
        break;
      case 'assertingSnapshot':
        var snapshot = generateAriaSnapshot(target);
        sendAction({ name: 'assertSnapshot', selector: selector, ariaSnapshot: snapshot });
        finishAssert();
        break;
      case 'assertingScreenshot':
        sendAction({ name: 'assertScreenshot', selector: selector });
        finishAssert();
        break;
    }
  }

  // ============================================================
  // Finish Assertion (works in both main frame and iframe)
  // ============================================================

  function finishAssert() {
    currentMode = 'recording';
    removeAssertHighlight();
    if (isMainFrame) {
      flashSuccess();
      sendCommand('setMode', { mode: 'recording' });
      if (typeof toolbarSetMode === 'function') toolbarSetMode('recording');
    } else {
      // In iframe: notify Node.js which will push mode to all frames
      sendAction({ name: '_modeChange', mode: 'recording' });
    }
  }

  // ============================================================
  // Event Registration (ALL frames - before iframe return)
  // ============================================================

  document.addEventListener('click', onClick, true);
  document.addEventListener('auxclick', onClick, true);
  document.addEventListener('input', onInput, true);
  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('mousemove', onMouseMove, true);
  document.addEventListener('focus', onFocus, true);

  // Navigation tracking for all frames
  var currentUrl = location.href;
  function checkNavigation() {
    if (location.href !== currentUrl) {
      currentUrl = location.href;
      if (currentUrl.startsWith('chrome-error://') || currentUrl === 'about:blank' || currentUrl.startsWith('about:')) return;
      sendAction({ name: 'navigate', url: currentUrl });
    }
  }

  var _navObserver;
  function startNavObserver() {
    if (_navObserver) return;
    _navObserver = new MutationObserver(checkNavigation);
    _navObserver.observe(document, { childList: true, subtree: true });
  }
  window.addEventListener('popstate', function() { setTimeout(checkNavigation, 100); });

  // Send initial navigation for all frames (skip invalid URLs)
  if (location.href && !location.href.startsWith('chrome-error://') && location.href !== 'about:blank' && !location.href.startsWith('about:')) {
    sendAction({ name: 'navigate', url: location.href });
  }
  console.log('[Recorder] Script installed in ' + (isMainFrame ? 'main frame' : 'iframe') + ': ' + location.href);

  // ============================================================
  // If in an iframe, stop here - no toolbar injection
  // ============================================================

  if (!isMainFrame) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function() { startNavObserver(); });
    } else {
      startNavObserver();
    }
    return;
  }

  // ============================================================
  // BELOW: Main frame only - Toolbar, commands, UI
  // ============================================================

  function sendCommand(method, params) {
    if (typeof window.__pw_panelCommand === 'function') {
      window.__pw_panelCommand({ method: method, params: params || {} });
    }
  }

  // Toolbar mode setter - declared here so finishAssert() can call it
  var toolbarSetMode;

  // ============================================================
  // Assert Dialog (with input value entry for text/value assertions)
  // ============================================================

  function showAssertDialog(selector, defaultText, assertName, target) {
    removeAssertHighlight();
    var existing = document.getElementById('__pw_dialog');
    if (existing) existing.parentNode.removeChild(existing);

    var dialog = document.createElement('div');
    dialog.id = '__pw_dialog';
    dialog.style.cssText = 'position:fixed;z-index:2147483647;background:#1e1e1e;border:1px solid #3d3d3d;border-radius:6px;padding:10px;box-shadow:0 4px 16px rgba(0,0,0,0.5);font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;font-size:11px;color:#ccc;pointer-events:auto;min-width:260px;max-width:380px';

    // Label
    var label = document.createElement('div');
    label.style.cssText = 'margin-bottom:6px;font-size:11px;color:#e0e0e0;font-weight:bold';
    if (assertName === 'assertValue')
      label.textContent = '\uD83D\uDCDD Enter expected value (empty = assert empty):';
    else
      label.textContent = '\uD83D\uDCDD Enter expected text to assert:';
    dialog.appendChild(label);

    // Textarea input
    var textarea = document.createElement('textarea');
    textarea.setAttribute('spellcheck', 'false');
    textarea.value = defaultText;
    textarea.style.cssText = 'width:100%;min-height:60px;max-height:120px;background:#1a1a2e;border:2px solid #0078d4;border-radius:4px;color:#fff;font-size:12px;font-family:Consolas,monospace;padding:8px;resize:vertical;outline:none;box-sizing:border-box';
    dialog.appendChild(textarea);

    // Buttons row
    var btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:6px;margin-top:8px;justify-content:flex-end';

    var btnOK = document.createElement('button');
    btnOK.textContent = '\u2713 Assert';
    btnOK.style.cssText = 'padding:4px 14px;border:1px solid #2d6d2d;border-radius:3px;background:#2d6d2d;color:#fff;font-size:11px;cursor:pointer;font-weight:bold';
    btnRow.appendChild(btnOK);

    var btnCancel = document.createElement('button');
    btnCancel.textContent = '\u2715 Cancel';
    btnCancel.style.cssText = 'padding:4px 14px;border:1px solid #3d3d3d;border-radius:3px;background:#2d2d2d;color:#ccc;font-size:11px;cursor:pointer';
    btnRow.appendChild(btnCancel);

    dialog.appendChild(btnRow);

    // Position near the target element
    try {
      var rect = target.getBoundingClientRect();
      dialog.style.top = Math.max(0, rect.bottom + 4) + 'px';
      dialog.style.left = Math.min(window.innerWidth - 400, rect.left) + 'px';
    } catch(e) { dialog.style.top = '50px'; dialog.style.left = '50px'; }

    document.documentElement.appendChild(dialog);

    // CRITICAL: click stopPropagation must be BUBBLE phase (not capture)
    // Capture-phase stopPropagation prevents exposeFunction from working!
    dialog.addEventListener('mousedown', function(e) { e.stopPropagation(); }, true);
    dialog.addEventListener('click', function(e) { e.stopPropagation(); }, false);
    dialog.addEventListener('input', function(e) { e.stopPropagation(); }, true);
    dialog.addEventListener('keydown', function(e) { e.stopPropagation(); }, true);
    dialog.addEventListener('focus', function(e) { e.stopPropagation(); }, true);

    textarea.focus(); textarea.select();

    // Assert button handler
    btnOK.addEventListener('click', function() {
      var value = textarea.value.replace(/\s+/g, ' ').trim();
      if (assertName === 'assertText') sendAction({ name: 'assertText', selector: selector, text: value, substring: true });
      else sendAction({ name: 'assertValue', selector: selector, value: value });
      closeDlg(); finishAssert();
    });

    btnCancel.addEventListener('click', function() {
      closeDlg();
      toolbarSetMode('recording');
      sendCommand('setMode', { mode: 'recording' });
    });

    // Keyboard shortcuts in dialog
    textarea.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); btnOK.click(); }
      else if (e.key === 'Escape') { e.preventDefault(); closeDlg(); toolbarSetMode('recording'); sendCommand('setMode', { mode: 'recording' }); }
      e.stopPropagation();
    });

    function closeDlg() { if (dialog.parentNode) dialog.parentNode.removeChild(dialog); }
  }

  function flashSuccess() {
    var tb = document.getElementById('__pw_toolbar');
    if (tb) { tb.style.boxShadow = '0 0 0 2px #2d6d2d, 0 2px 10px rgba(0,0,0,0.5)'; setTimeout(function() { tb.style.boxShadow = ''; }, 800); }
  }

  // ============================================================
  // Toolbar Injection (main frame only)
  // ============================================================

  function injectToolbar() {
    if (document.getElementById('__pw_toolbar')) return;

    var css = '' +
      '.__pw-root{position:fixed;top:0;left:0;z-index:2147483647;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;font-size:11px;line-height:1.3;pointer-events:auto;border-radius:4px;box-shadow:0 2px 10px rgba(0,0,0,0.5);overflow:hidden;background:#1e1e1e}' +
      '.__pw-root.__pw-mini{border-radius:16px}' +
      '.__pw-root *{box-sizing:border-box;pointer-events:auto}' +
      '.__pw-bar{display:flex;align-items:center;gap:3px;padding:3px 6px;background:#1e1e1e;color:#ccc;user-select:none}' +
      '.__pw-grip{cursor:move;padding:1px 2px;color:#555;font-size:9px;letter-spacing:1px;flex-shrink:0}' +
      '.__pw-grip:hover{color:#999}' +
      '.__pw-btn{display:inline-flex;align-items:center;gap:2px;padding:2px 6px;border:1px solid #3d3d3d;border-radius:2px;background:#2d2d2d;color:#ccc;font-size:10px;cursor:pointer;white-space:nowrap;transition:background .1s;outline:none}' +
      '.__pw-btn:hover{background:#3d3d3d}' +
      '.__pw-btn:active{background:#0078d4}' +
      '.__pw-btn-rec{background:#c42b2b!important;border-color:#c42b2b!important;color:#fff!important}' +
      '.__pw-btn-pause{background:#2d6d2d!important;border-color:#2d6d2d!important;color:#fff!important}' +
      '.__pw-btn-asm{background:#b5872a!important;border-color:#b5872a!important;color:#fff!important}' +
      '.__pw-dot{width:6px;height:6px;border-radius:50%;background:#f44747;animation:__pw-pulse 1.2s ease-in-out infinite;flex-shrink:0}' +
      '.__pw-dot.__pw-off{background:#858585;animation:none}' +
      '.__pw-dot.__pw-asm{background:#d4a832;animation:none}' +
      '@keyframes __pw-pulse{0%,100%{opacity:1}50%{opacity:.4}}' +
      '.__pw-sep{flex:1;min-width:4px}' +
      '.__pw-vsep{width:1px;height:14px;background:#3d3d3d;margin:0 1px}' +
      '.__pw-lbl{font-size:9px;color:#858585;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100px}' +
      '.__pw-sel{padding:1px 3px;border:1px solid #3d3d3d;border-radius:2px;background:#2d2d2d;color:#ccc;font-size:10px;cursor:pointer;outline:none}' +
      '.__pw-sel option{background:#2d2d2d;color:#ccc}' +
      '.__pw-panel{background:#1e1e1e;border-top:1px solid #3d3d3d;max-height:250px;overflow:hidden;display:flex;flex-direction:column}' +
      '.__pw-panel-hdr{display:flex;align-items:center;justify-content:space-between;padding:2px 6px;background:#252526;font-size:10px;color:#858585}' +
      '.__pw-code{padding:6px;margin:0;font-family:Cascadia Code,Fira Code,Consolas,monospace;font-size:11px;line-height:1.4;white-space:pre;overflow:auto;max-height:230px;color:#ccc;background:#1e1e1e}' +
      '.__pw-mbar{display:flex;align-items:center;gap:4px;padding:3px 8px;background:#1e1e1e;color:#ccc;user-select:none;cursor:move;border-radius:16px}' +
      '.__pw-mbar .__pw-btn{border:none;background:transparent;padding:2px 4px}' +
      '.__pw-mbar .__pw-btn:hover{background:#3d3d3d;border-radius:3px}';

    var styleEl = document.createElement('style');
    styleEl.textContent = css;
    (document.head || document.documentElement).appendChild(styleEl);

    var html = '<div id="__pw_toolbar" class="__pw-root">' +
      '<div class="__pw-bar" id="__pw_bar">' +
        '<div class="__pw-grip" id="__pw_grip" title="Drag">&#8942;&#8942;</div>' +
        '<div class="__pw-dot" id="__pw_dot"></div>' +
        '<button class="__pw-btn __pw-btn-rec" id="__pw_btnRec" title="Pause (F9)">&#9679;Rec</button>' +
        '<div class="__pw-vsep"></div>' +
        '<button class="__pw-btn" id="__pw_btnAV" title="Assert visible (F10)">&#128065;</button>' +
        '<button class="__pw-btn" id="__pw_btnAT" title="Assert text (F11)">A<sub>t</sub></button>' +
        '<button class="__pw-btn" id="__pw_btnAVa" title="Assert value">V<sub>a</sub></button>' +
        '<button class="__pw-btn" id="__pw_btnAS" title="Assert ARIA snapshot">&#128203;</button>' +
        '<button class="__pw-btn" id="__pw_btnSS" title="Assert screenshot">&#128247;</button>' +
        '<div class="__pw-vsep"></div>' +
        '<button class="__pw-btn" id="__pw_btnClr" title="Clear">&#10005;</button>' +
        '<button class="__pw-btn" id="__pw_btnStp" title="Stop">&#9632;</button>' +
        '<div class="__pw-vsep"></div>' +
        '<select class="__pw-sel" id="__pw_lang" title="Language">' +
          '<option value="python-pytest">Pytest</option>' +
          '<option value="python-sync">PySync</option>' +
          '<option value="python-async">PyAsync</option>' +
          '<option value="javascript-test">JSTest</option>' +
          '<option value="javascript-library">JSLib</option>' +
        '</select>' +
        '<button class="__pw-btn" id="__pw_btnCode" title="Code">&#9660;</button>' +
        '<div class="__pw-sep"></div>' +
        '<span class="__pw-lbl" id="__pw_lbl">Rec...</span>' +
        '<button class="__pw-btn" id="__pw_btnMin" title="Minimize">&#8722;</button>' +
      '</div>' +
      '<div class="__pw-panel" id="__pw_panel" style="display:none">' +
        '<div class="__pw-panel-hdr"><span>Code</span><button class="__pw-btn" id="__pw_btnCp" style="font-size:9px;padding:1px 4px">&#128203;</button></div>' +
        '<pre class="__pw-code" id="__pw_code"># Record actions to generate code...</pre>' +
      '</div>' +
      '<div class="__pw-mbar" id="__pw_mini" style="display:none">' +
        '<div class="__pw-dot" id="__pw_dotM"></div>' +
        '<button class="__pw-btn" id="__pw_btnRM" title="Toggle (F9)">&#9679;</button>' +
        '<button class="__pw-btn" id="__pw_btnMax" title="Expand">&#9776;</button>' +
      '</div>' +
    '</div>';

    var container = document.createElement('div');
    container.innerHTML = html;
    var toolbarEl = container.firstElementChild;
    document.documentElement.appendChild(toolbarEl);

    // DOM refs
    var dot = document.getElementById('__pw_dot');
    var dotM = document.getElementById('__pw_dotM');
    var btnRec = document.getElementById('__pw_btnRec');
    var btnAV = document.getElementById('__pw_btnAV');
    var btnAT = document.getElementById('__pw_btnAT');
    var btnAVa = document.getElementById('__pw_btnAVa');
    var btnAS = document.getElementById('__pw_btnAS');
    var btnSS = document.getElementById('__pw_btnSS');
    var btnClr = document.getElementById('__pw_btnClr');
    var btnStp = document.getElementById('__pw_btnStp');
    var langSel = document.getElementById('__pw_lang');
    var btnCode = document.getElementById('__pw_btnCode');
    var lbl = document.getElementById('__pw_lbl');
    var btnMin = document.getElementById('__pw_btnMin');
    var panel = document.getElementById('__pw_panel');
    var codeEl = document.getElementById('__pw_code');
    var btnCp = document.getElementById('__pw_btnCp');
    var mini = document.getElementById('__pw_mini');
    var btnRM = document.getElementById('__pw_btnRM');
    var btnMax = document.getElementById('__pw_btnMax');
    var bar = document.getElementById('__pw_bar');
    var grip = document.getElementById('__pw_grip');

    var panelVisible = false;
    var generatedCode = '';
    var selectedLang = 'python-pytest';

    // Drag
    var isDragging = false, dsx = 0, dsy = 0, tsx = 0, tsy = 0;
    function startDrag(e) {
      if (e.target.tagName === 'BUTTON' || e.target.tagName === 'SELECT' || e.target.tagName === 'OPTION') return;
      isDragging = true; dsx = e.clientX; dsy = e.clientY;
      var r = toolbarEl.getBoundingClientRect(); tsx = r.left; tsy = r.top;
      e.preventDefault(); e.stopPropagation();
    }
    function onDrag(e) {
      if (!isDragging) return;
      var nx = tsx + e.clientX - dsx, ny = tsy + e.clientY - dsy;
      var r = toolbarEl.getBoundingClientRect();
      nx = Math.max(0, Math.min(window.innerWidth - r.width, nx));
      ny = Math.max(0, Math.min(window.innerHeight - 30, ny));
      toolbarEl.style.left = nx + 'px'; toolbarEl.style.top = ny + 'px'; toolbarEl.style.right = 'auto';
      e.preventDefault(); e.stopPropagation();
    }
    function endDrag(e) { if (!isDragging) return; isDragging = false; e.preventDefault(); e.stopPropagation(); }

    bar.addEventListener('mousedown', function(e) { if (e.target === grip || e.target === bar || e.target.classList.contains('__pw-sep') || e.target.classList.contains('__pw-lbl')) startDrag(e); }, true);
    mini.addEventListener('mousedown', function(e) { if (e.target.tagName !== 'BUTTON') startDrag(e); }, true);
    document.addEventListener('mousemove', onDrag, true);
    document.addEventListener('mouseup', endDrag, true);

    // Communication from Node.js
    window.__pw_panelDispatch = function(event) {
      if (event.method === 'codeUpdated') { generatedCode = event.params.code; if (panelVisible) { codeEl.textContent = generatedCode || '# No code yet...'; codeEl.scrollTop = codeEl.scrollHeight; } }
      else if (event.method === 'modeChanged') { if (event.params.mode !== currentMode) { currentMode = event.params.mode; toolbarSetMode(event.params.mode); } }
      else if (event.method === 'languageChanged') { selectedLang = event.params.language; langSel.value = selectedLang; }
    };

    // ============================================================
    // Toolbar Mode Setter
    // ============================================================

    toolbarSetMode = function(m) {
      currentMode = m;
      removeAssertHighlight();
      var dlg = document.getElementById('__pw_dialog'); if (dlg) dlg.parentNode.removeChild(dlg);

      var dc = '__pw-dot';
      if (m === 'recording') {
        btnRec.className = '__pw-btn __pw-btn-rec'; btnRec.innerHTML = '&#9679;Rec'; btnRec.title = 'Pause (F9)';
        btnAV.className = '__pw-btn'; btnAT.className = '__pw-btn'; btnAVa.className = '__pw-btn'; btnAS.className = '__pw-btn'; btnSS.className = '__pw-btn';
        lbl.textContent = 'Rec...'; btnRM.innerHTML = '&#9679;';
      } else if (m === 'paused') {
        btnRec.className = '__pw-btn __pw-btn-pause'; btnRec.innerHTML = '&#9654;Pause'; btnRec.title = 'Resume (F9)';
        btnAV.className = '__pw-btn'; btnAT.className = '__pw-btn'; btnAVa.className = '__pw-btn'; btnAS.className = '__pw-btn'; btnSS.className = '__pw-btn';
        dc += ' __pw-off'; lbl.textContent = 'Paused'; btnRM.innerHTML = '&#9654;';
      } else if (m.startsWith('asserting')) {
        btnRec.className = '__pw-btn'; btnRec.innerHTML = '&#9679;Rec'; btnRec.title = 'Back (F9)';
        dc += ' __pw-asm';
        btnAV.className = '__pw-btn' + (m === 'assertingVisible' ? ' __pw-btn-asm' : '');
        btnAT.className = '__pw-btn' + (m === 'assertingText' ? ' __pw-btn-asm' : '');
        btnAVa.className = '__pw-btn' + (m === 'assertingValue' ? ' __pw-btn-asm' : '');
        btnAS.className = '__pw-btn' + (m === 'assertingSnapshot' ? ' __pw-btn-asm' : '');
        btnSS.className = '__pw-btn' + (m === 'assertingScreenshot' ? ' __pw-btn-asm' : '');
        var al = { assertingVisible: 'Assert visible...', assertingText: 'Assert text...', assertingValue: 'Assert value...', assertingSnapshot: 'Assert snapshot...', assertingScreenshot: 'Assert screenshot...' };
        lbl.textContent = al[m] || 'Assert...'; btnRM.innerHTML = '&#10003;';
      }
      dot.className = dc; dotM.className = dc;
    };

    // ============================================================
    // Toolbar Action Functions
    // ============================================================

    function toggleRecPause() {
      if (currentMode === 'recording') {
        toolbarSetMode('paused'); sendCommand('setMode', { mode: 'paused' });
      } else {
        toolbarSetMode('recording'); sendCommand('setMode', { mode: 'recording' });
      }
    }

    function enterAssertMode(mode) {
      if (currentMode === mode) {
        toolbarSetMode('recording'); sendCommand('setMode', { mode: 'recording' });
      } else {
        toolbarSetMode(mode); sendCommand('setMode', { mode: mode });
      }
    }

    // ============================================================
    // Button Event Handlers
    // ============================================================

    function stopMd(e) { e.stopPropagation(); }

    btnRec.addEventListener('mousedown', stopMd, true);
    btnRec.addEventListener('click', function(e) { e.preventDefault(); toggleRecPause(); });
    btnAV.addEventListener('mousedown', stopMd, true);
    btnAV.addEventListener('click', function(e) { e.preventDefault(); enterAssertMode('assertingVisible'); });
    btnAT.addEventListener('mousedown', stopMd, true);
    btnAT.addEventListener('click', function(e) { e.preventDefault(); enterAssertMode('assertingText'); });
    btnAVa.addEventListener('mousedown', stopMd, true);
    btnAVa.addEventListener('click', function(e) { e.preventDefault(); enterAssertMode('assertingValue'); });
    btnAS.addEventListener('mousedown', stopMd, true);
    btnAS.addEventListener('click', function(e) { e.preventDefault(); enterAssertMode('assertingSnapshot'); });
    btnSS.addEventListener('mousedown', stopMd, true);
    btnSS.addEventListener('click', function(e) { e.preventDefault(); enterAssertMode('assertingScreenshot'); });
    btnClr.addEventListener('mousedown', stopMd, true);
    btnClr.addEventListener('click', function(e) { e.preventDefault(); sendCommand('clear', {}); });
    btnStp.addEventListener('mousedown', stopMd, true);
    btnStp.addEventListener('click', function(e) { e.preventDefault(); lbl.textContent = 'Stopping...'; sendCommand('stop', {}); });
    langSel.addEventListener('mousedown', stopMd, true);
    langSel.addEventListener('focus', function(e) { e.stopPropagation(); }, true);
    langSel.addEventListener('change', function() { selectedLang = langSel.value; sendCommand('languageChanged', { language: selectedLang }); });
    btnCode.addEventListener('mousedown', stopMd, true);
    btnCode.addEventListener('click', function(e) { e.preventDefault(); panelVisible = !panelVisible; panel.style.display = panelVisible ? '' : 'none'; btnCode.textContent = panelVisible ? '\u25B2' : '\u25BC'; if (panelVisible && generatedCode) { codeEl.textContent = generatedCode; codeEl.scrollTop = codeEl.scrollHeight; } });
    btnCp.addEventListener('mousedown', stopMd, true);
    btnCp.addEventListener('click', function(e) { e.preventDefault(); if (generatedCode) navigator.clipboard.writeText(generatedCode).then(function() { btnCp.textContent = '\u2713'; setTimeout(function() { btnCp.textContent = '\uD83D\uDCCB'; }, 1000); }); });
    btnMin.addEventListener('mousedown', stopMd, true);
    btnMin.addEventListener('click', function(e) { e.preventDefault(); bar.style.display = 'none'; panel.style.display = 'none'; panelVisible = false; mini.style.display = ''; toolbarEl.classList.add('__pw-mini'); btnCode.textContent = '\u25BC'; });
    btnRM.addEventListener('mousedown', stopMd, true);
    btnRM.addEventListener('click', function(e) { e.preventDefault(); if (currentMode.startsWith('asserting')) { toolbarSetMode('recording'); sendCommand('setMode', { mode: 'recording' }); } else toggleRecPause(); });
    btnMax.addEventListener('mousedown', stopMd, true);
    btnMax.addEventListener('click', function(e) { e.preventDefault(); bar.style.display = ''; mini.style.display = 'none'; toolbarEl.classList.remove('__pw-mini'); });

    // Shortcuts - NO stopPropagation (so they don't break exposeFunction)
    document.addEventListener('keydown', function(e) {
      if (e.key === 'F9') { e.preventDefault(); if (currentMode.startsWith('asserting')) { toolbarSetMode('recording'); sendCommand('setMode', { mode: 'recording' }); } else toggleRecPause(); }
      else if (e.key === 'F10') { e.preventDefault(); enterAssertMode('assertingVisible'); }
      else if (e.key === 'F11') { e.preventDefault(); enterAssertMode('assertingText'); }
      else if (e.key === 'Escape' && currentMode.startsWith('asserting')) { e.preventDefault(); toolbarSetMode('recording'); sendCommand('setMode', { mode: 'recording' }); }
    }, true);

    toolbarSetMode('recording');
    sendCommand('panelReady', {});
    console.log('[Recorder] Toolbar injected');
  }

  // ============================================================
  // Schedule Toolbar Injection
  // ============================================================

  function scheduleToolbarInjection() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function() { injectToolbar(); startNavObserver(); });
    } else {
      // DOMContentLoaded already fired, inject immediately
      injectToolbar(); startNavObserver();
    }
  }

  scheduleToolbarInjection();
})();
