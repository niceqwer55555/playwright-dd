with open(r'D:\PY\pw\standalone-recorder\src\injectRecorder.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# 1. Add isMainFrame detection after line 9
# Find the line with __pw_recorder_installed = true
for i, line in enumerate(lines):
    if '__pw_recorder_installed = true' in line and 'if' not in line:
        lines.insert(i + 1, '\n  // Detect if we are in an iframe or main frame\n  var isMainFrame = window === window.top;\n')
        break

# Re-read with new line numbers
content = ''.join(lines)

# 2. Find the FIRST block of addEventListener calls (for click/input/keydown etc.)
# These are at around line 437 (now shifted by 3 lines ~440)
# We need to ADD after them: navigation tracking, initial navigate, iframe guard

# Find the event listener block end
import re
# Pattern: document.addEventListener('focus', onFocus, true); followed by blank line
pattern = r\"(document\.addEventListener\('focus', onFocus, true\);)\n\n(\s+var currentUrl)\"
match = re.search(pattern, content)
if match:
    print('Found event listeners end at position:', match.start())
    # Insert iframe guard code here
    insert_pos = match.end() - len(match.group(2))  # before 'var currentUrl'
    
    iframe_guard = '''
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
  // ============================================================

'''
    content = content[:insert_pos] + iframe_guard + content[insert_pos:]
    
    # Now remove the duplicate navigation tracking that comes later
    # Find and remove the old nav section that's now redundant
    old_nav_pattern = r\"  var currentUrl = location\.href;\n  function checkNavigation\(\).*?window\.addEventListener\('popstate'.*?\n\"
    old_nav_match = re.search(old_nav_pattern, content[content.find('BELOW: Main frame'):])
    if old_nav_match:
        start = content.find('BELOW: Main frame:') + old_nav_match.start()
        end = start + old_nav_match.end()
        content = content[:start] + content[end:]
        print('Removed duplicate nav section')
    
    # Remove old end lines
    content = content.replace(
        \"  sendAction({ name: 'navigate', url: location.href });\\n  console.log('[Recorder] Injection script installed');\",
        ''
    )
    
    with open(r'D:\PY\pw\standalone-recorder\src\injectRecorder.js', 'w', encoding='utf-8') as f:
        f.write(content)
    print('SUCCESS! File written, size:', len(content))
else:
    print('ERROR: Could not find event listener block end')
    # Debug
    for i, line in enumerate(lines[430:450], 431):
        print(f'{i}: {line.rstrip()[:80]}')
