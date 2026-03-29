'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import Navbar from '@/components/Navbar';

interface ActiveEntry {
    userId: string;
    username: string;
    startingBalance: number;
    currentValue: number;
    profit: number;
    profitPct: number;
    joinedAt: string;
}

interface SettledEntry {
    username: string;
    profit: number;
    rank: number;
    finalBalance: number;
    startingBalance: number;
}

interface Competition {
    id: string;
    name: string;
    status: string;
    start_time: string;
    end_time: string;
    entries?: SettledEntry[];
}

interface CompetitionData {
    active: Competition | null;
    activeEntries: ActiveEntry[];
    settled: Competition[];
}

export default function CompetitionsPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const [data, setData] = useState<CompetitionData | null>(null);
    const [loading, setLoading] = useState(true);
    const [joining, setJoining] = useState(false);
    const [timeLeft, setTimeLeft] = useState('');

    const fetchData = useCallback(async () => {
        try {
            const res = await fetch('/api/competitions');
            if (res.ok) setData(await res.json());
        } catch { /* ignore */ }
        finally { setLoading(false); }
    }, []);

    useEffect(() => {
        if (status === 'unauthenticated') { router.push('/login'); return; }
        if (status !== 'authenticated') return;
        fetchData();
        const interval = setInterval(fetchData, 5000);
        return () => clearInterval(interval);
    }, [status, router, fetchData]);

    // Countdown timer
    useEffect(() => {
        if (!data?.active) return;
        const update = () => {
            const end = new Date(data.active!.end_time).getTime();
            const diff = Math.max(0, end - Date.now());
            const h = Math.floor(diff / 3600000);
            const m = Math.floor((diff % 3600000) / 60000);
            const s = Math.floor((diff % 60000) / 1000);
            setTimeLeft(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
        };
        update();
        const timer = setInterval(update, 1000);
        return () => clearInterval(timer);
    }, [data?.active]);

    const joinCompetition = async () => {
        setJoining(true);
        try {
            const res = await fetch('/api/competitions', { method: 'POST' });
            if (res.ok) { await fetchData(); }
            else {
                const err = await res.json();
                alert(err.error || 'Failed to join');
            }
        } catch { alert('Network error'); }
        finally { setJoining(false); }
    };

    const hasJoined = data?.activeEntries.some(e => e.userId === (session?.user as { id?: string })?.id);
    const myEntry = data?.activeEntries.find(e => e.userId === (session?.user as { id?: string })?.id);
    const myRank = myEntry ? data!.activeEntries.indexOf(myEntry) + 1 : null;

    if (status === 'loading' || loading) {
        return (
            <>
                <Navbar />
                <div className="loading-spinner"><div className="spinner" />Loading competitions...</div>
            </>
        );
    }

    return (
        <>
            <Navbar />
            <div className="main-content">
                <div className="page-container">
                    <h1 className="page-title">Competitions</h1>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', marginTop: '-12px', fontSize: '13px' }}>
                        Compete daily for the highest portfolio profit
                    </p>

                    {/* Active Competition */}
                    {data?.active ? (
                        <div className="comp-active-card">
                            <div className="comp-active-header">
                                <div>
                                    <div className="comp-active-name">{data.active.name}</div>
                                    <div className="comp-active-status">
                                        <span className="comp-status-dot" />LIVE
                                    </div>
                                </div>
                                <div className="comp-timer">
                                    <div className="comp-timer-label">Ends in</div>
                                    <div className="comp-timer-value">{timeLeft}</div>
                                </div>
                            </div>

                            {/* Join button or your stats */}
                            {!hasJoined ? (
                                <div className="comp-join-section">
                                    <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '12px' }}>
                                        Join now to compete! Your current portfolio value will be snapshotted as the starting point.
                                    </p>
                                    <button className="comp-join-btn" onClick={joinCompetition} disabled={joining}>
                                        {joining ? 'Joining...' : '🏆 Join Competition'}
                                    </button>
                                </div>
                            ) : myEntry && (
                                <div className="comp-my-stats">
                                    <div className="comp-stat">
                                        <div className="comp-stat-label">Your Rank</div>
                                        <div className="comp-stat-value">#{myRank}</div>
                                    </div>
                                    <div className="comp-stat">
                                        <div className="comp-stat-label">Starting Balance</div>
                                        <div className="comp-stat-value">${myEntry.startingBalance.toFixed(2)}</div>
                                    </div>
                                    <div className="comp-stat">
                                        <div className="comp-stat-label">Current Value</div>
                                        <div className="comp-stat-value">${myEntry.currentValue.toFixed(2)}</div>
                                    </div>
                                    <div className="comp-stat">
                                        <div className="comp-stat-label">Profit</div>
                                        <div className={`comp-stat-value ${myEntry.profit >= 0 ? 'pnl-positive' : 'pnl-negative'}`}>
                                            {myEntry.profit >= 0 ? '+' : ''}${myEntry.profit.toFixed(2)} ({myEntry.profitPct.toFixed(2)}%)
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Live Standings */}
                            <div className="comp-standings">
                                <div className="section-header">
                                    Live Standings
                                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                        {data.activeEntries.length} participants
                                    </span>
                                </div>
                                {data.activeEntries.length === 0 ? (
                                    <div className="empty-state">
                                        <div className="empty-icon">🏆</div>
                                        <div className="empty-text">No participants yet. Be the first to join!</div>
                                    </div>
                                ) : (
                                    <table className="leaderboard-table">
                                        <thead>
                                            <tr>
                                                <th style={{ width: '60px' }}>Rank</th>
                                                <th>Trader</th>
                                                <th>Starting</th>
                                                <th>Current</th>
                                                <th>Profit</th>
                                                <th>Return</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.activeEntries.map((entry, i) => {
                                                const rank = i + 1;
                                                const isMe = entry.userId === (session?.user as { id?: string })?.id;
                                                return (
                                                    <tr key={entry.userId} style={isMe ? { background: 'rgba(41, 98, 255, 0.08)' } : {}}>
                                                        <td>
                                                            <span className={`rank-badge ${rank <= 3 ? `rank-${rank}` : 'rank-other'}`}>
                                                                {rank}
                                                            </span>
                                                        </td>
                                                        <td style={{ fontWeight: 700 }}>
                                                            {entry.username} {isMe && <span style={{ color: 'var(--accent)', fontSize: '11px' }}>(you)</span>}
                                                        </td>
                                                        <td className="mono">${entry.startingBalance.toFixed(2)}</td>
                                                        <td className="mono">${entry.currentValue.toFixed(2)}</td>
                                                        <td className={`mono ${entry.profit >= 0 ? 'pnl-positive' : 'pnl-negative'}`} style={{ fontWeight: 700 }}>
                                                            {entry.profit >= 0 ? '+' : ''}${entry.profit.toFixed(2)}
                                                        </td>
                                                        <td className={`mono ${entry.profitPct >= 0 ? 'pnl-positive' : 'pnl-negative'}`}>
                                                            {entry.profitPct >= 0 ? '+' : ''}{entry.profitPct.toFixed(2)}%
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="section-card">
                            <div className="empty-state" style={{ padding: '40px' }}>
                                <div className="empty-icon">⏳</div>
                                <div className="empty-text">Next competition starting soon...</div>
                            </div>
                        </div>
                    )}

                    {/* Past Competitions */}
                    {data?.settled && data.settled.length > 0 && (
                        <>
                            <h2 style={{ fontSize: '16px', fontWeight: 700, margin: '28px 0 14px', color: 'var(--text-primary)' }}>
                                Past Competitions
                            </h2>
                            {data.settled.map(comp => (
                                <div key={comp.id} className="comp-past-card">
                                    <div className="comp-past-header">
                                        <span className="comp-past-name">{comp.name}</span>
                                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                            {new Date(comp.end_time).toLocaleDateString()}
                                        </span>
                                    </div>
                                    {comp.entries && comp.entries.length > 0 ? (
                                        <div className="comp-past-winners">
                                            {comp.entries.map(e => (
                                                <div key={e.username} className="comp-winner-item">
                                                    <span className={`rank-badge ${e.rank <= 3 ? `rank-${e.rank}` : 'rank-other'}`}>
                                                        {e.rank}
                                                    </span>
                                                    <span style={{ fontWeight: 600, flex: 1 }}>{e.username}</span>
                                                    <span className={`mono ${e.profit >= 0 ? 'pnl-positive' : 'pnl-negative'}`} style={{ fontWeight: 700 }}>
                                                        {e.profit >= 0 ? '+' : ''}${e.profit.toFixed(2)}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div style={{ padding: '12px', color: 'var(--text-muted)', fontSize: '12px' }}>No participants</div>
                                    )}
                                </div>
                            ))}
                        </>
                    )}
                </div>
            </div>
        </>
    );
}
