import re

filepath = r'D:\PY\pw\standalone-recorder\src\injectRecorder.js'

with open(filepath, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Step 1: Add isMainFrame detection
for i, line in enumerate(lines):
    if '__pw_recorder_installed = true;' in line and 'if' not in line:
        lines.insert(i + 1, '\n  var isMainFrame = window === window.top;\n')
        break

# Step 2: Find the line "document.addEventListener('focus', onFocus, true);"
# and insert iframe guard after it
focus_idx = None
for i, line in enumerate(lines):
    if "addEventListener('focus', onFocus, true)" in line:
        focus_idx = i
        break

if focus_idx is not None:
    guard_lines = [
        '\n',
        '  var currentUrl = location.href;\n',
        "  function checkNavigation() { if (location.href !== currentUrl) { currentUrl = location.href; sendAction({ name: 'navigate', url: currentUrl }); } }\n",
        '\n',
        "  var _navObserver;\n",
        "  function startNavObserver() { if (_navObserver) return; _navObserver = new MutationObserver(checkNavigation); _navObserver.observe(document, { childList: true, subtree: true }); }\n",
        "  window.addEventListener('popstate', function() { setTimeout(checkNavigation, 100); });\n",
        '\n',
        "  sendAction({ name: 'navigate', url: location.href });\n",
        "  console.log('[Recorder] Script installed in ' + (isMainFrame ? 'main frame' : 'iframe') + ': ' + location.href);\n",
        '\n',
        "  if (!isMainFrame) {\n",
        "    if (document.readyState === 'loading') {\n",
        "      document.addEventListener('DOMContentLoaded', function() { startNavObserver(); });\n",
        "    } else {\n",
        "      startNavObserver();\n",
        "    }\n",
        "    return;\n",
        "  }\n",
        '\n',
        "  // === BELOW: Main frame only ===\n",
    ]
    # Insert after the focus line
    for j, gl in enumerate(guard_lines):
        lines.insert(focus_idx + 1 + j, gl)

# Step 3: Remove old duplicate navigation tracking and end lines
new_lines = []
skip_until_toolbar = False
skip_end_lines = False

i = 0
while i < len(lines):
    line = lines[i]
    
    # Skip the old navigation section (var currentUrl... through popstate)
    if "var currentUrl = location.href;" in line and i > 400:
        # Check if we already inserted the new one above
        skip_until_toolbar = True
        i += 1
        continue
    
    if skip_until_toolbar:
        if "// Toolbar injection" in line or "function sendCommand" in line:
            skip_until_toolbar = False
            new_lines.append(line)
        i += 1
        continue
    
    # Skip old end lines
    if "sendAction({ name: 'navigate', url: location.href });" in line and i > len(lines) - 5:
        i += 1
        continue
    if "Injection script installed" in line:
        i += 1
        continue
    
    new_lines.append(line)
    i += 1

with open(filepath, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print('Done! New file size:', len(''.join(new_lines)))
print('Has isMainFrame:', 'isMainFrame' in ''.join(new_lines))
print('Has iframe guard:', 'if (!isMainFrame)' in ''.join(new_lines))
