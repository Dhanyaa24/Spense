import os
import glob
import sys

# Ensure UTF-8 encoding is used
sys.stdout.reconfigure(encoding='utf-8')

replacements = {
    '🏠 Home': '<svg width="18" height="18" viewBox="0 0 30 30"><path d="M4 14 L15 5 L26 14 V26 A2 2 0 0 1 24 28 H6 A2 2 0 0 1 4 26 Z" fill="#F6EAD4" stroke="#818263" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 28 V18 H18 V28" fill="#DDBAAE" stroke="#818263" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> Home',
    '📊 Dashboard': '<svg width="18" height="18" viewBox="0 0 30 30"><rect x="5" y="16" width="5" height="10" fill="#EFD7CF" stroke="#818263" stroke-width="2" rx="1"/><rect x="12.5" y="8" width="5" height="18" fill="#C2C395" stroke="#818263" stroke-width="2" rx="1"/><rect x="20" y="12" width="5" height="14" fill="#DDBAAE" stroke="#818263" stroke-width="2" rx="1"/></svg> Dashboard',
    '💸 Expenses': '<svg width="18" height="18" viewBox="0 0 30 30"><circle cx="15" cy="15" r="10" fill="#F6EAD4" stroke="#818263" stroke-width="2"/><text x="11" y="20" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="#818263">$</text></svg> Expenses',
    '👤 Profile Settings': '<svg width="18" height="18" viewBox="0 0 30 30"><circle cx="15" cy="10" r="6" fill="#DDBAAE" stroke="#818263" stroke-width="2"/><path d="M6 26 Q15 16 24 26" fill="#EFD7CF" stroke="#818263" stroke-width="2" stroke-linecap="round"/></svg> Profile Settings',
    '⚙️ Settings': '<svg width="18" height="18" viewBox="0 0 30 30"><circle cx="15" cy="15" r="5" fill="#F6EAD4" stroke="#818263" stroke-width="2"/><path d="M15 4 V7 M15 23 V26 M4 15 H7 M23 15 H26 M7.5 7.5 L9.5 9.5 M20.5 20.5 L22.5 22.5 M7.5 22.5 L9.5 20.5 M20.5 7.5 L22.5 9.5" stroke="#818263" stroke-width="2" stroke-linecap="round"/></svg> Settings'
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
