'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import Navbar from '@/components/Navbar';

interface LeaderboardEntry {
    username: string;
    portfolioValue: number;
    totalReturn: number;
    unrealizedPnl: number;
    tradeCount: number;
    joinedAt: string;
}

export default function LeaderboardPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchLeaderboard = useCallback(async () => {
        try {
            const res = await fetch('/api/leaderboard');
            if (res.ok) setEntries(await res.json());
        } catch { /* ignore */ }
        finally { setLoading(false); }
    }, []);

    useEffect(() => {
        if (status === 'unauthenticated') { router.push('/login'); return; }
        if (status !== 'authenticated') return;
        fetchLeaderboard();
        const interval = setInterval(fetchLeaderboard, 10000);
        return () => clearInterval(interval);
    }, [status, router, fetchLeaderboard]);

    if (status === 'loading' || loading) {
        return (
            <>
                <Navbar />
                <div className="loading-spinner"><div className="spinner" />Loading leaderboard...</div>
            </>
        );
    }

    return (
        <>
            <Navbar />
            <div className="main-content">
                <div className="page-container">
                    <h1 className="page-title">Leaderboard</h1>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: '20px', marginTop: '-12px', fontSize: '13px' }}>
                        Ranked by portfolio return
                    </p>

                    <div className="section-card">
                        {entries.length === 0 ? (
                            <div className="empty-state">
                                <div className="empty-icon">—</div>
                                <div className="empty-text">No traders yet. Be the first!</div>
                            </div>
                        ) : (
                            <table className="leaderboard-table">
                                <thead>
                                    <tr>
                                        <th style={{ width: '60px' }}>Rank</th>
                                        <th>Trader</th>
                                        <th>Portfolio Value</th>
                                        <th>Return</th>
                                        <th>Unrealized P&L</th>
                                        <th>Trades</th>
                                        <th>Joined</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {entries.map((entry, i) => {
                                        const rank = i + 1;
                                        const isCurrentUser = session?.user?.name === entry.username;
                                        return (
                                            <tr key={entry.username} style={isCurrentUser ? { background: 'rgba(41, 98, 255, 0.08)' } : {}}>
                                                <td>
                                                    <span className={`rank-badge ${rank <= 3 ? `rank-${rank}` : 'rank-other'}`}>
                                                        {rank}
                                                    </span>
                                                </td>
                                                <td style={{ fontWeight: 700, fontFamily: 'var(--font-sans)' }}>
                                                    {entry.username} {isCurrentUser && <span style={{ color: 'var(--accent)', fontSize: '11px' }}>(you)</span>}
                                                </td>
                                                <td className="mono">${entry.portfolioValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                                                <td className={`mono ${(entry.totalReturn ?? 0) >= 0 ? 'pnl-positive' : 'pnl-negative'}`} style={{ fontWeight: 700 }}>
                                                    {(entry.totalReturn ?? 0) >= 0 ? '+' : ''}{(entry.totalReturn ?? 0).toFixed(2)}%
                                                </td>
                                                <td className={`mono ${(entry.unrealizedPnl ?? 0) >= 0 ? 'pnl-positive' : 'pnl-negative'}`}>
                                                    ${(entry.unrealizedPnl ?? 0).toFixed(2)}
                                                </td>
                                                <td className="mono">{entry.tradeCount ?? 0}</td>
                                                <td style={{ color: 'var(--text-muted)', fontSize: '12px', fontFamily: 'var(--font-sans)' }}>
                                                    {new Date(entry.joinedAt).toLocaleDateString()}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}
