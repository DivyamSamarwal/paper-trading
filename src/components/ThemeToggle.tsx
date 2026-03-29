'use client';

import { useEffect, useState } from 'react';

export default function ThemeToggle() {
    const [theme, setTheme] = useState<'dark' | 'light'>('dark');

    useEffect(() => {
        const saved = localStorage.getItem('theme') as 'dark' | 'light' | null;
        if (saved) {
            setTheme(saved);
            document.documentElement.setAttribute('data-theme', saved);
        }
    }, []);

    const toggle = () => {
        const next = theme === 'dark' ? 'light' : 'dark';
        setTheme(next);
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('theme', next);
        // Dispatch custom event so chart can react
        window.dispatchEvent(new CustomEvent('themechange', { detail: next }));
    };

    return (
        <button
            onClick={toggle}
            className="btn-theme"
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            style={{
                padding: '4px 8px',
                fontSize: '14px',
                background: 'none',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                cursor: 'pointer',
                color: 'var(--text-secondary)',
                lineHeight: 1,
                transition: 'border-color 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--border-hover)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
        >
            {theme === 'dark' ? '☀' : '☾'}
        </button>
    );
}
