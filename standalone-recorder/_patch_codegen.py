filepath = r'D:\PY\pw\standalone-recorder\src\codegen.js'

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Replace JS action code generator - add framePath support
old_js_subject = """export function generateJsActionCode(action, isTest) {
  const subject = 'page';
  const locator = action.selector ? '.locator(' + jsQuote(action.selector) + ')' : '';"""

new_js_subject = """export function generateJsActionCode(action, isTest) {
  const subject = 'page';
  // Build frame locator chain for iframe support
  const framePath = action.framePath || [];
  let frameLocator = '';
  for (const frameSelector of framePath) {
    frameLocator += '.frameLocator(' + jsQuote(frameSelector) + ')';
  }
  const locator = action.selector ? frameLocator + '.locator(' + jsQuote(action.selector) + ')' : frameLocator;"""

content = content.replace(old_js_subject, new_js_subject)

# 2. Replace Python action code generator - add framePath support
old_py_subject = """export function generatePythonActionCode(action, isPytest, isAsync) {
  const subject = 'page';
  const locator = action.selector ? '.locator(' + pyQuote(action.selector) + ')' : '';"""

new_py_subject = """export function generatePythonActionCode(action, isPytest, isAsync) {
  const subject = 'page';
  // Build frame locator chain for iframe support
  const framePath = action.framePath || [];
  let frameLocator = '';
  for (const frameSelector of framePath) {
    frameLocator += '.frame_locator(' + pyQuote(frameSelector) + ')';
  }
  const locator = action.selector ? frameLocator + '.locator(' + pyQuote(action.selector) + ')' : frameLocator;"""

content = content.replace(old_py_subject, new_py_subject)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print('Done! Has framePath in JS:', 'framePath' in content)
print('Has framePath in Python:', content.count('framePath'))
