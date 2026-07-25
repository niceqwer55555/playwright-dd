filepath = r'D:\PY\pw\standalone-recorder\src\injectRecorder.js'

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# The issue is that the event listeners (click, input, keydown, mousemove, focus)
# and navigation tracking were removed during patching.
# We need to add them back + iframe guard.

# Find the "// Navigation Tracking" section and replace it
# with the proper event listeners + iframe guard

old_nav = '''    // ============================================================
    // Navigation Tracking
    // ============================================================

    // Toolbar injection
    // ============================================================'''

new_nav = '''    // ============================================================
    // Event Registration (ALL frames)
    // ============================================================

    document.addEventListener('click', onClick, true);
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
    // ============================================================'''

if old_nav in content:
    content = content.replace(old_nav, new_nav)
    print('Replaced navigation section')
else:
    print('ERROR: Could not find old navigation section')
    # Try to find it with different whitespace
    import re
    m = re.search(r'// Navigation Tracking.*?// Toolbar injection', content, re.DOTALL)
    if m:
        print('Found with regex, replacing...')
        content = content[:m.start()] + new_nav + content[m.end():]
    else:
        print('Giving up, writing manually')

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

# Verify
with open(filepath, 'r', encoding='utf-8') as f:
    verify = f.read()
print('Has isMainFrame:', 'isMainFrame' in verify)
print('Has iframe guard:', 'if (!isMainFrame)' in verify)
print('Has addEventListener click:', "addEventListener('click', onClick" in verify)
print('File size:', len(verify))
