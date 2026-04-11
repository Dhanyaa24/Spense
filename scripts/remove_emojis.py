import os
import glob
import sys

# Ensure UTF-8 encoding is used
sys.stdout.reconfigure(encoding='utf-8')

replacements = {
    '🏠 Home': 'Home',
    '📊 Dashboard': 'Dashboard',
    '💸 Expenses': 'Expenses',
    '👤 Profile Settings': 'Profile Settings',
    '⚙️ Settings': 'Settings'
}

for filepath in glob.glob('*.html'):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    modified = False
    for old, new in replacements.items():
        if old in content:
            content = content.replace(old, new)
            modified = True
            
    if modified:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f'Updated {filepath}')
