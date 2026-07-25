filepath = r'D:\PY\pw\standalone-recorder\src\injectRecorder.js'

with open(filepath, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Show lines around 437-450
for i in range(max(0, 434), min(len(lines), 470)):
    print(f'{i+1:4}: {lines[i].rstrip()[:100]}')
