import re

with open(r'D:\PY\pw\standalone-recorder\src\injectRecorder.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add iframe detection at the top (after the installed check)
old_guard = "  if (window.__pw_recorder_installed) return;\n  window.__pw_recorder_installed = true;"
new_guard = old_guard + "\n\n  // Detect if we are in an iframe or main frame\n  var isMainFrame = window === window.top;"
content = content.replace(old_guard, new_guard)

# 2. Add __pw_setRecorderMode function after currentMode declaration
old_state = "  var currentMode = 'recording';"
new_state = old_state + "\n\n  // Expose mode setter for cross-frame mode updates from Node.js\n  window.__pw_setRecorderMode = function(mode) {\n    currentMode = mode;\n    removeAssertHighlight();\n  };"
content = content.replace(old_state, new_state)

# 3. Move event registration BEFORE the iframe check
# Find the event registration section
old_events = """  document.addEventListener('click', onClick, true);
  document.addEventListener('auxclick', onClick, true);
  document.addEventListener('input', onInput, true);
  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('mousemove', onMouseMove, true);
  document.addEventListener('focus', onFocus, true);"""

new_events = old_events + """

  // Navigation tracking for all frames
  var currentUrl = location.href;
  function checkNavigation() { if (location.href !== currentUrl) { currentUrl = location.href; sendAction({ name: 'navigate', url: currentUrl }); } }

  var _navObserver;
  function startNavObserver() { if (_navObserver) return; _navObserver = new MutationObserver(checkNavigation); _navObserver.observe(document, { childList: true, subtree: true }); }
  window.addEventListener('popstate', function() { setTimeout(checkNavigation, 100); });

  // Send initial navigation for all frames
  sendAction({ name: 'navigate', url: location.href });
  console.log('[Recorder] Script installed in ' + (isMainFrame ? 'main frame' : 'iframe') + ': ' + location.href);

  // ============================================================
  // If in an iframe, stop here - no toolbar injection
  // The toolbar only belongs in the main frame
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
  // BELOW: Main frame only - Toolbar, assertions, UI
  // ============================================================
"""

content = content.replace(old_events, new_events)

# 4. Remove the old navigation tracking section (it's now moved up)
old_nav = """  var currentUrl = location.href;
  function checkNavigation() { if (location.href !== currentUrl) { currentUrl = location.href; sendAction({ name: 'navigate', url: currentUrl }); } }

  document.addEventListener('click', onClick, true);
  document.addEventListener('auxclick', onClick, true);
  document.addEventListener('input', onInput, true);
  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('mousemove', onMouseMove, true);
  document.addEventListener('focus', onFocus, true);

  var _navObserver;
  function startNavObserver() { if (_navObserver) return; _navObserver = new MutationObserver(checkNavigation); _navObserver.observe(document, { childList: true, subtree: true }); }
  window.addEventListener('popstate', function() { setTimeout(checkNavigation, 100); });"""

# Check if the old nav section still exists (it shouldn't after replacement above)
if 'var currentUrl = location.href;' in content[content.find('BELOW: Main frame'):]:
    # There might be duplicate nav sections, remove the second one
    idx = content.find('var currentUrl = location.href;', content.find('BELOW: Main frame'))
    if idx > 0:
        # Find the end of this section
        end_idx = content.find('function sendCommand', idx)
        if end_idx > 0:
            content = content[:idx] + content[end_idx:]

# 5. Also remove the old scheduleToolbarInjection + sendAction at the end
old_end = """  scheduleToolbarInjection();
  sendAction({ name: 'navigate', url: location.href });
  console.log('[Recorder] Injection script installed');
})();"""
new_end = """  scheduleToolbarInjection();
})();"""
content = content.replace(old_end, new_end)

with open(r'D:\PY\pw\standalone-recorder\src\injectRecorder.js', 'w', encoding='utf-8') as f:
    f.write(content)

print('Done! New file size:', len(content))
