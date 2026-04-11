const themes = {
    'doodle-light': {
        '--savory-sage': '#818263',
        '--avocado-smoothie': '#C2C395',
        '--blush-beet': '#DDBAAE',
        '--peach-protein': '#EFD7CF',
        '--oat-latte': '#DCD4C1',
        '--honey-oatmilk': '#F6EAD4',
        '--coconut-cream': '#FFFAF2',
        '--dark-text': '#2d2d2d',
        '--light-text': '#5a5a5a'
    },
    'doodle-dark': {
        '--savory-sage': '#A5A682',
        '--avocado-smoothie': '#3D3E2F',
        '--blush-beet': '#7A5C52',
        '--peach-protein': '#4A3B36',
        '--oat-latte': '#1F1F1F',
        '--honey-oatmilk': '#2d2d2d',
        '--coconut-cream': '#121212',
        '--dark-text': '#FFFAF2',
        '--light-text': '#DCD4C1'
    },
    'peach-glow': {
        '--savory-sage': '#d67e65',
        '--avocado-smoothie': '#F7B09F',
        '--blush-beet': '#E8A798',
        '--peach-protein': '#FFE4DC',
        '--oat-latte': '#F9EBE6',
        '--honey-oatmilk': '#ffded1',
        '--coconut-cream': '#fff2ed',
        '--dark-text': '#422D28',
        '--light-text': '#84625A'
    },
    'sage-minimal': {
        '--savory-sage': '#5c614b',
        '--avocado-smoothie': '#99A184',
        '--blush-beet': '#BBAA99',
        '--peach-protein': '#E8E4D8',
        '--oat-latte': '#DADCCF',
        '--honey-oatmilk': '#e8eae0',
        '--coconut-cream': '#f4f5f1',
        '--dark-text': '#383a2c',
        '--light-text': '#6F725F'
    }
};

function applyGlobalTheme(themeName) {
    const root = document.documentElement;
    const theme = themes[themeName] || themes['doodle-light'];

    for (const [prop, value] of Object.entries(theme)) {
        root.style.setProperty(prop, value);
    }
    
    localStorage.setItem('spense_theme', themeName);

    // Sync with backend if logged in
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');
    if (token && userStr) {
        const user = JSON.parse(userStr);
        user.theme = themeName;
        localStorage.setItem('user', JSON.stringify(user));

        fetch('/api/user/theme', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ theme: themeName })
        }).catch(err => console.error('Failed to sync theme with server:', err));
    }
}

// Auto-apply on load
(function() {
    // 1. Check direct theme storage
    let savedTheme = localStorage.getItem('spense_theme');
    
    // 2. Fallback to user object theme
    if (!savedTheme) {
        const userStr = localStorage.getItem('user');
        if (userStr) {
            const user = JSON.parse(userStr);
            if (user.theme) {
                savedTheme = user.theme;
                localStorage.setItem('spense_theme', savedTheme);
            }
        }
    }

    if (savedTheme) {
        // Run immediately to prevent flash
        const root = document.documentElement;
        const theme = themes[savedTheme] || themes['doodle-light'];
        for (const [prop, value] of Object.entries(theme)) {
            root.style.setProperty(prop, value);
        }
    }
})();
