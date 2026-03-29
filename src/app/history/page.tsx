'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import Navbar from '@/components/Navbar';

interface Trade {
    id: string;
    symbol_id: string;
    ticker: string;
    name: string;
    asset_type: string;
    side: string;
    quantity: number;
    price: number;
    commission: number;
    slippage: number;
    realized_pnl: number;
    timestamp: string;
}

export default function HistoryPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const [trades, setTrades] = useState<Trade[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(0);
    const pageSize = 50;

    const fetchTrades = useCallback(async () => {
        try {
            const res = await fetch(`/api/history?page=${page + 1}`);
            if (res.ok) {
                const data = await res.json();
                setTrades(data.trades);
                setTotal(data.total);
            }
        } catch { /* ignore */ }
    }, [page]);

    useEffect(() => {
        if (status === 'unauthenticated') { router.push('/login'); return; }
        if (status !== 'authenticated') return;
        fetchTrades();
    }, [status, router, fetchTrades]);

    if (status === 'loading') {
        return (
            <>
                <Navbar />
                <div className="loading-spinner"><div className="spinner" />Loading...</div>
            </>
        );
    }

    const totalPages = Math.ceil(total / pageSize);
    const totalPnl = trades.reduce((sum, t) => sum + t.realized_pnl, 0);
    const totalCommissions = trades.reduce((sum, t) => sum + t.commission, 0);

    return (
        <>
            <Navbar />
            <div className="main-content">
                <div className="page-container">
                    <h1 className="page-title">Trade History</h1>

                    <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                        <div className="stat-card">
                            <div className="stat-label">Total Trades</div>
                            <div className="stat-value">{total}</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-label">Total Realized P&L</div>
                            <div className={`stat-value ${totalPnl >= 0 ? 'pnl-positive' : 'pnl-negative'}`}>
                                ${totalPnl.toFixed(2)}
                            </div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-label">Total Commissions</div>
                            <div className="stat-value" style={{ color: 'var(--yellow)' }}>${totalCommissions.toFixed(2)}</div>
                        </div>
                    </div>

                    <div className="section-card">
                        <div className="section-header">
                            All Trades
                            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                Page {page + 1} of {Math.max(1, totalPages)}
                            </span>
                        </div>
                        {trades.length === 0 ? (
                            <div className="empty-state">
                                <div className="empty-icon">—</div>
                                <div className="empty-text">No trades yet. Place your first order!</div>
                            </div>
                        ) : (
                            <div style={{ overflow: 'auto' }}>
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>Time</th>
                                            <th>Symbol</th>
                                            <th>Type</th>
                                            <th>Side</th>
                                            <th>Qty</th>
                                            <th>Price</th>
                                            <th>Value</th>
                                            <th>Slippage</th>
                                            <th>Commission</th>
                                            <th>Realized P&L</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {trades.map(t => (
                                            <tr key={t.id}>
                                                <td style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                                                    {new Date(t.timestamp).toLocaleString()}
                                                </td>
                                                <td style={{ fontWeight: 700 }}>{t.ticker}</td>
                                                <td><span className={`asset-type-badge badge-${t.asset_type.toLowerCase()}`}>{t.asset_type}</span></td>
                                                <td className={t.side === 'BUY' ? 'pnl-positive' : 'pnl-negative'}>{t.side}</td>
                                                <td>{t.quantity}</td>
                                                <td>${t.price.toFixed(2)}</td>
                                                <td>${(t.price * t.quantity).toFixed(2)}</td>
                                                <td style={{ color: 'var(--text-muted)' }}>{t.slippage.toFixed(3)}%</td>
                                                <td style={{ color: 'var(--yellow)' }}>${t.commission.toFixed(2)}</td>
                                                <td className={t.realized_pnl >= 0 ? 'pnl-positive' : 'pnl-negative'}>
                                                    {t.realized_pnl !== 0 ? `$${t.realized_pnl.toFixed(2)}` : '—'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {totalPages > 1 && (
                            <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', padding: '16px' }}>
                                <button
                                    className="filter-btn"
                                    disabled={page === 0}
                                    onClick={() => setPage(p => p - 1)}
                                >
                                    ← Prev
                                </button>
                                <button
                                    className="filter-btn"
                                    disabled={page >= totalPages - 1}
                                    onClick={() => setPage(p => p + 1)}
                                >
                                    Next →
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}
