import os

# Read the current injectRecorder.js to get the toolbar/UI portion (after "MAIN FRAME ONLY")
# We need to rewrite the whole file with iframe support

content = '''/**
 * Injection script for recording user interactions in the target page.
 * Features: floating draggable toolbar, minimize, 6 assertion modes.
 * Supports cross-domain iframe recording via exposeBinding.
 *
 * Architecture:
 *   - This script runs in ALL frames (addInitScript handles this automatically)
 *   - Main frame: injects toolbar + captures events
 *   - Iframe: captures events only (no toolbar)
 *   - Communication uses __pw_recordAction / __pw_panelCommand which are
 *     exposed via exposeBinding and work across all frames including cross-origin
 */

(function() {
  if (window.__pw_recorder_installed) return;
  window.__pw_recorder_installed = true;

  // Detect if we are in an iframe or main frame
  var isMainFrame = window === window.top;
'''

# Read the existing file to extract all shared functions
with open(r'D:\\PY\\pw\\standalone-recorder\\src\\injectRecorder.js', 'r', encoding='utf-8') as f:
    old = f.read()

# Find the key parts we need to keep and modify
# The shared functions (generateSelector, implicitRole, etc.) stay the same
# The event handlers stay the same but need to be registered in ALL frames
# The toolbar/UI code only goes in the main frame

print('Old file size:', len(old))
print('Writing new file...')
