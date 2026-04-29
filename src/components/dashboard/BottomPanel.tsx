'use client';

import { useTradingStore, Position } from '@/store/tradingStore';
import { useToast } from '@/components/Toast';

export default function BottomPanel() {
    const { addToast } = useToast();
    const { positions, news, selected, bottomTab, setBottomTab } = useTradingStore();

    const closePosition = async (pos: Position) => {
        try {
            const closeSide = pos.side === 'LONG' ? 'SELL' : 'BUY';
            const res = await fetch('/api/trade', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    symbolId: pos.symbol_id,
                    side: closeSide,
                    orderType: 'MARKET',
                    quantity: pos.quantity,
                }),
            });

            if (res.ok) {
                addToast(`Closed ${pos.ticker} position`, 'success');
                // state update will occur via ws tick
            } else {
                const data = await res.json();
                addToast(data.error || 'Failed to close', 'error');
            }
        } catch {
            addToast('Failed to close position', 'error');
        }
    };

    return (
        <div className="bottom-section">
            <div className="bottom-tabs">
                <button
                    className={`bottom-tab ${bottomTab === 'positions' ? 'active' : ''}`}
                    onClick={() => setBottomTab('positions')}
                >
                    Positions · {positions.length}
                </button>
                <button
                    className={`bottom-tab ${bottomTab === 'news' ? 'active' : ''}`}
                    onClick={() => setBottomTab('news')}
                >
                    News · {news.length}
                </button>
                <button
                    className={`bottom-tab ${bottomTab === 'info' ? 'active' : ''}`}
                    onClick={() => setBottomTab('info')}
                >
                    Symbol Info
                </button>
            </div>


            {bottomTab === 'positions' && (
                <div style={{ overflow: 'auto' }}>
                    {positions.length === 0 ? (
                        <div className="empty-state">
                            <div className="empty-icon">—</div>
                            <div className="empty-text">No open positions</div>
                        </div>
                    ) : (
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Symbol</th>
                                    <th>Side</th>
                                    <th>Qty</th>
                                    <th>Avg Price</th>
                                    <th>Current</th>
                                    <th>P&L</th>
                                    <th>P&L %</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {positions.map(pos => (
                                    <tr key={pos.id}>
                                        <td style={{ fontWeight: 700 }}>{pos.ticker}</td>
                                        <td>
                                            <span className={pos.side === 'LONG' ? 'pnl-positive' : 'pnl-negative'}>
                                                {pos.side}
                                            </span>
                                        </td>
                                        <td>{pos.quantity}</td>
                                        <td>${pos.avg_price.toFixed(2)}</td>
                                        <td>${pos.current_price.toFixed(2)}</td>
                                        <td className={pos.unrealizedPnl >= 0 ? 'pnl-positive' : 'pnl-negative'}>
                                            ${pos.unrealizedPnl.toFixed(2)}
                                        </td>
                                        <td className={pos.pnlPct >= 0 ? 'pnl-positive' : 'pnl-negative'}>
                                            {pos.pnlPct >= 0 ? '+' : ''}{pos.pnlPct.toFixed(2)}%
                                        </td>
                                        <td>
                                            <button className="btn-close-pos" onClick={() => closePosition(pos)}>
                                                Close
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {bottomTab === 'info' && selected && (
                <div style={{ padding: '12px 16px', fontSize: '13px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                        <div>
                            <div style={{ color: 'var(--text-muted)', fontSize: '11px', marginBottom: '2px' }}>Day High</div>
                            <div className="mono" style={{ fontWeight: 600 }}>${selected.day_high.toFixed(2)}</div>
                        </div>
                        <div>
                            <div style={{ color: 'var(--text-muted)', fontSize: '11px', marginBottom: '2px' }}>Day Low</div>
                            <div className="mono" style={{ fontWeight: 600 }}>${selected.day_low.toFixed(2)}</div>
                        </div>
                        <div>
                            <div style={{ color: 'var(--text-muted)', fontSize: '11px', marginBottom: '2px' }}>Prev Close</div>
                            <div className="mono" style={{ fontWeight: 600 }}>${selected.prev_close.toFixed(2)}</div>
                        </div>
                        <div>
                            <div style={{ color: 'var(--text-muted)', fontSize: '11px', marginBottom: '2px' }}>Volume</div>
                            <div className="mono" style={{ fontWeight: 600 }}>{selected.volume_today.toLocaleString()}</div>
                        </div>
                        {selected.asset_type === 'FUTURE' && (
                            <div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '11px', marginBottom: '2px' }}>Leverage</div>
                                <div className="mono" style={{ fontWeight: 600, color: 'var(--purple)' }}>10:1</div>
                            </div>
                        )}
                        {selected.asset_type === 'OPTION' && (
                            <>
                                <div>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '11px', marginBottom: '2px' }}>Strike</div>
                                    <div className="mono" style={{ fontWeight: 600 }}>${selected.option_strike}</div>
                                </div>
                                <div>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '11px', marginBottom: '2px' }}>Type</div>
                                    <div className="mono" style={{ fontWeight: 600 }}>{selected.option_type}</div>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {bottomTab === 'news' && (
                <div style={{ overflow: 'auto', flex: 1 }}>
                    {news.length === 0 ? (
                        <div className="empty-state">
                            <div className="empty-icon">—</div>
                            <div className="empty-text">No news yet</div>
                        </div>
                    ) : (
                        <div className="news-feed-container">
                            {[...news].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).map(n => {
                                const formattedHeadline = n.headline.replace(/^\*/, '').trim();
                                // Optional: simple heuristic to convert ALL CAPS to Title Case
                                const displayHeadline = formattedHeadline === formattedHeadline.toUpperCase()
                                    ? formattedHeadline.toLowerCase().split(' ').map(w => w.length > 1 ? w[0].toUpperCase() + w.slice(1) : w).join(' ')
                                    : formattedHeadline;

                                return (
                                    <div key={n.id} className={`news-item ${n.impact > 0 ? 'impact-pos' : n.impact < 0 ? 'impact-neg' : ''}`}>
                                        <div className="news-header">
                                            <span className="news-time">
                                                {new Date(n.timestamp.includes(' ') && !n.timestamp.includes('Z') ? n.timestamp.replace(' ', 'T') + 'Z' : n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                                            </span>
                                            <span className={`news-impact-badge ${n.impact > 0 ? 'pos' : n.impact < 0 ? 'neg' : 'neutral'}`}>
                                                {n.impact > 0 ? 'Bullish' : n.impact < 0 ? 'Bearish' : 'Neutral'} · {n.impact > 0 ? '+' : ''}{n.impact.toFixed(1)}%
                                            </span>
                                        </div>
                                        <div className="news-headline">{displayHeadline}</div>
                                        <div className="news-footer">
                                            <span className="news-type-tag">{n.type}</span>
                                            {n.affectedTickers?.map(ticker => (
                                                <span key={ticker} className="news-ticker-tag">{ticker}</span>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
