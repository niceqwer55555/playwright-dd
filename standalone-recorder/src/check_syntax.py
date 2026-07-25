import os

f = open(r"D:\PY\pw\standalone-recorder\src\injectRecorder.js", "r", encoding="utf-8")
c = f.read()
f.close()

# Check brace balance
brace_count = 0
for i, ch in enumerate(c):
    if ch == "{": brace_count += 1
    elif ch == "}": brace_count -= 1
    if brace_count < 0:
        line_num = c[:i].count("\n") + 1
        print(f"Brace underflow at line {line_num}!")

print(f"Final brace count: {brace_count} (should be 0)")

# Check IIFE wrapping
stripped = c.strip()
print(f"Starts OK: {stripped.startswith('(function()')}")
end_ok = stripped.endswith("})();")
print(f"Ends OK: {end_ok}")

# Check functions exist
for func in ["handleAssertClick", "finishAssert", "showAssertDialog", "flashSuccess", "sendCommand", "toolbarSetMode", "onClick", "onInput", "onKeyDown", "onMouseMove", "onFocus"]:
    idx = c.find(func)
    print(f"  {func}: at {idx}")
