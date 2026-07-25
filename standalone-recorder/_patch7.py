filepath = r'D:\PY\pw\standalone-recorder\src\injectRecorder.js'

with open(filepath, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Show lines around 410-440
for i in range(max(0, 410), min(len(lines), 442)):
    print(f'{i+1:4}: {lines[i].rstrip()[:120]}')
