'use client';

import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import ThemeToggle from './ThemeToggle';

export default function Navbar() {
    const { data: session } = useSession();
    const pathname = usePathname();

    if (!session) return null;

    const links = [
        { href: '/dashboard', label: 'Terminal' },
        { href: '/portfolio', label: 'Portfolio' },
        { href: '/history', label: 'History' },
        { href: '/leaderboard', label: 'Leaderboard' },
        { href: '/competitions', label: 'Compete' },
    ];

    return (
        <nav className="navbar">
            <div className="navbar-brand">
                <div className="brand-mark">PT</div>
                <span>PaperTrade</span>
            </div>

            <div className="navbar-links">
                {links.map(link => (
                    <Link
                        key={link.href}
                        href={link.href}
                        className={`nav-link ${pathname === link.href ? 'active' : ''}`}
                    >
                        {link.label}
                    </Link>
                ))}
            </div>

            <div className="navbar-right">
                <ThemeToggle />
                <div className="user-avatar" title={session.user?.name || 'User'}>
                    {(session.user?.name || 'U')[0].toUpperCase()}
                </div>
                <button className="btn-logout" onClick={() => signOut({ callbackUrl: '/login' })}>
                    Sign out
                </button>
            </div>
        </nav>
    );
}
