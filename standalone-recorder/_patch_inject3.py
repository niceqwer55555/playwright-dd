with open(r'D:\PY\pw\standalone-recorder\src\injectRecorder.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Find key line numbers
for i, line in enumerate(lines):
    stripped = line.strip()
    if '__pw_recorder_installed = true' in stripped:
        print(f'L{i+1}: {stripped}')
    if "var currentMode = 'recording'" in stripped:
        print(f'L{i+1}: {stripped}')
    if 'addEventListener' in stripped and 'click' in stripped:
        print(f'L{i+1}: {stripped}')
    if 'checkNavigation' in stripped and 'function' in stripped:
        print(f'L{i+1}: {stripped}')
    if 'startNavObserver' in stripped and 'function' in stripped:
        print(f'L{i+1}: {stripped}')
    if 'scheduleToolbarInjection' in stripped:
        print(f'L{i+1}: {stripped}')
    if 'sendAction({ name: ' in stripped and 'navigate' in stripped:
        print(f'L{i+1}: {stripped}')
    if 'Injection script installed' in stripped:
        print(f'L{i+1}: {stripped}')
    if '__pw_setRecorderMode' in stripped:
        print(f'L{i+1}: {stripped}')
