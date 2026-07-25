import re

with open(r'D:\PY\pw\standalone-recorder\src\injectRecorder.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add iframe detection after the installed check
content = content.replace(
    "  if (window.__pw_recorder_installed) return;\n  window.__pw_recorder_installed = true;",
    "  if (window.__pw_recorder_installed) return;\n  window.__pw_recorder_installed = true;\n\n  // Detect if we are in an iframe or main frame\n  var isMainFrame = window === window.top;"
)

# 2. Replace the event registration + navigation section
# Find the event registration block and add iframe guard after it
old_block = """  document.addEventListener('click', onClick, true);
  document.addEventListener('auxclick', onClick, true);
  document.addEventListener('input', onInput, true);
  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('mousemove', onMouseMove, true);
  document.addEventListener('focus', onFocus, true);

  var currentUrl = location.href;
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

new_block = """  document.addEventListener('click', onClick, true);
  document.addEventListener('auxclick', onClick, true);
  document.addEventListener('input', onInput, true);
  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('mousemove', onMouseMove, true);
  document.addEventListener('focus', onFocus, true);

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
  // ============================================================"""

content = content.replace(old_block, new_block)

# 3. Fix the end of the file - remove old sendAction and console.log
old_end = """  scheduleToolbarInjection();
  sendAction({ name: 'navigate', url: location.href });
  console.log('[Recorder] Injection script installed');
})();"""

new_end = """  scheduleToolbarInjection();
})();"""

content = content.replace(old_end, new_end)

with open(r'D:\PY\pw\standalone-recorder\src\injectRecorder.js', 'w', encoding='utf-8') as f:
    f.write(content)

# Verify
with open(r'D:\PY\pw\standalone-recorder\src\injectRecorder.js', 'r', encoding='utf-8') as f:
    verify = f.read()

print('Has isMainFrame:', 'isMainFrame' in verify)
print('Has iframe guard:', 'if (!isMainFrame)' in verify)
print('Has __pw_setRecorderMode:', '__pw_setRecorderMode' in verify)
print('Has BELOW: Main frame:', 'BELOW: Main frame' in verify)
print('File size:', len(verify))
