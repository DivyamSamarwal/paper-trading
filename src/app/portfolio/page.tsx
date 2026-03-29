'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import Navbar from '@/components/Navbar';
import { ToastProvider, useToast } from '@/components/Toast';

interface Position {
    id: string;
    symbol_id: string;
    ticker: string;
    name: string;
    quantity: number;
    avg_price: number;
    side: string;
    current_price: number;
    asset_type: string;
    unrealizedPnl: number;
    marketValue: number;
    pnlPct: number;
    margin_used: number;
}

interface PortfolioData {
    cashBalance: number;
    portfolioValue: number;
    totalUnrealizedPnl: number;
    totalReturn: number;
    totalMarginUsed: number;
    positions: Position[];
    allocation: Record<string, number>;
}

function PortfolioContent() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const { addToast } = useToast();
    const [data, setData] = useState<PortfolioData | null>(null);

    const fetchData = useCallback(async () => {
        try {
            const res = await fetch('/api/portfolio');
            if (res.ok) setData(await res.json());
        } catch { /* ignore */ }
    }, []);

    useEffect(() => {
        if (status === 'unauthenticated') { router.push('/login'); return; }
        if (status !== 'authenticated') return;
        fetchData();
        const interval = setInterval(fetchData, 3000);
        return () => clearInterval(interval);
    }, [status, router, fetchData]);

    const closePosition = async (pos: Position) => {
        try {
            const closeSide = pos.side === 'LONG' ? 'SELL' : 'BUY';
            const res = await fetch('/api/trade', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ symbolId: pos.symbol_id, side: closeSide, orderType: 'MARKET', quantity: pos.quantity }),
            });
            if (res.ok) {
                addToast(`Closed ${pos.ticker}`, 'success');
                // Immediately remove from UI
                setData(prev => prev ? { ...prev, positions: prev.positions.filter(p => p.id !== pos.id) } : prev);
                setTimeout(fetchData, 500);
            }
            else { const d = await res.json(); addToast(d.error, 'error'); }
        } catch { addToast('Failed', 'error'); }
    };

    if (!data) {
        return (
            <>
                <Navbar />
                <div className="loading-spinner"><div className="spinner" />Loading portfolio...</div>
            </>
        );
    }

    const totalAllocation = Object.values(data.allocation).reduce((a, b) => a + b, 0);
    const marginPct = data.totalMarginUsed > 0 ? Math.min(100, (data.totalMarginUsed / data.cashBalance) * 100) : 0;

    return (
        <>
            <Navbar />
            <div className="main-content">
                <div className="page-container">
                    <h1 className="page-title">Portfolio Overview</h1>

                    <div className="stats-grid">
                        <div className="stat-card">
                            <div className="stat-label">Portfolio Value</div>
                            <div className="stat-value">${data.portfolioValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                            <div className={`stat-sub ${data.totalReturn >= 0 ? 'pnl-positive' : 'pnl-negative'}`}>
                                {data.totalReturn >= 0 ? '+' : ''}{data.totalReturn.toFixed(2)}% all time
                            </div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-label">Cash Balance</div>
                            <div className="stat-value" style={{ color: 'var(--green-text)' }}>
                                ${data.cashBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-label">Unrealized P&L</div>
                            <div className={`stat-value ${data.totalUnrealizedPnl >= 0 ? 'pnl-positive' : 'pnl-negative'}`}>
                                ${data.totalUnrealizedPnl.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-label">Margin Used</div>
                            <div className="stat-value" style={{ color: 'var(--purple)' }}>
                                ${data.totalMarginUsed.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </div>
                            {data.totalMarginUsed > 0 && (
                                <div className="margin-bar">
                                    <div
                                        className={`margin-fill ${marginPct < 50 ? 'safe' : marginPct < 80 ? 'warning' : 'danger'}`}
                                        style={{ width: `${marginPct}%` }}
                                    />
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Allocation */}
                    {Object.keys(data.allocation).length > 0 && (
                        <div className="section-card">
                            <div className="section-header">Allocation Breakdown</div>
                            <div className="allocation-grid">
                                {Object.entries(data.allocation).map(([type, value]) => (
                                    <div key={type} className="allocation-item">
                                        <div className="alloc-type">{type}</div>
                                        <div className="alloc-value">${value.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                                        <div className="alloc-pct">{totalAllocation > 0 ? ((value / totalAllocation) * 100).toFixed(1) : 0}%</div>
                                    </div>
                                ))}
                                <div className="allocation-item">
                                    <div className="alloc-type">Cash</div>
                                    <div className="alloc-value">${data.cashBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                                    <div className="alloc-pct">
                                        {data.portfolioValue > 0 ? ((data.cashBalance / data.portfolioValue) * 100).toFixed(1) : '0.0'}%
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Positions Table */}
                    <div className="section-card">
                        <div className="section-header">
                            Open Positions
                            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{data.positions.length} positions</span>
                        </div>
                        {data.positions.length === 0 ? (
                            <div className="empty-state">
                                <div className="empty-icon">—</div>
                                <div className="empty-text">No open positions. Start trading from the Terminal!</div>
                            </div>
                        ) : (
                            <div style={{ overflow: 'auto' }}>
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>Symbol</th>
                                            <th>Type</th>
                                            <th>Side</th>
                                            <th>Qty</th>
                                            <th>Avg Price</th>
                                            <th>Current Price</th>
                                            <th>Market Value</th>
                                            <th>P&L</th>
                                            <th>P&L %</th>
                                            <th>Margin</th>
                                            <th></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.positions.map(pos => (
                                            <tr key={pos.id}>
                                                <td style={{ fontWeight: 700 }}>{pos.ticker}</td>
                                                <td><span className={`asset-type-badge badge-${pos.asset_type.toLowerCase()}`}>{pos.asset_type}</span></td>
                                                <td className={pos.side === 'LONG' ? 'pnl-positive' : 'pnl-negative'}>{pos.side}</td>
                                                <td>{pos.quantity}</td>
                                                <td>${pos.avg_price.toFixed(2)}</td>
                                                <td>${pos.current_price.toFixed(2)}</td>
                                                <td>${pos.marketValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                                                <td className={pos.unrealizedPnl >= 0 ? 'pnl-positive' : 'pnl-negative'}>
                                                    ${pos.unrealizedPnl.toFixed(2)}
                                                </td>
                                                <td className={pos.pnlPct >= 0 ? 'pnl-positive' : 'pnl-negative'}>
                                                    {pos.pnlPct >= 0 ? '+' : ''}{pos.pnlPct.toFixed(2)}%
                                                </td>
                                                <td>{pos.margin_used > 0 ? `$${pos.margin_used.toFixed(2)}` : '—'}</td>
                                                <td><button className="btn-close-pos" onClick={() => closePosition(pos)}>Close</button></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}

export default function PortfolioPage() {
    return <ToastProvider><PortfolioContent /></ToastProvider>;
}
