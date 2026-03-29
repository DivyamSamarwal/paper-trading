'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback, useRef } from 'react';
import Navbar from '@/components/Navbar';
import CandlestickChart from '@/components/CandlestickChart';
import { ToastProvider, useToast } from '@/components/Toast';

interface Symbol {
    id: string;
    ticker: string;
    name: string;
    asset_type: string;
    current_price: number;
    prev_close: number;
    base_price: number;
    day_high: number;
    day_low: number;
    volume_today: number;
    margin_req: number;
    lot_size: number;
    option_type?: string;
    option_strike?: number;
    option_expiry?: string;
    underlying?: string;
}

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

interface NewsEvent {
    id: number;
    headline: string;
    type: string;
    impact: number;
    affectedTickers: string[];
    timestamp: string;
}

interface CandleUpdate {
    symbol_id: string;
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

function DashboardContent() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const { addToast } = useToast();

    const [symbols, setSymbols] = useState<Symbol[]>([]);
    const [selected, setSelected] = useState<Symbol | null>(null);
    const [filter, setFilter] = useState('ALL');
    const [search, setSearch] = useState('');
    const [positions, setPositions] = useState<Position[]>([]);
    const [cashBalance, setCashBalance] = useState(1000);
    const [news, setNews] = useState<NewsEvent[]>([]);
    const [latestCandles, setLatestCandles] = useState<CandleUpdate[]>([]);
    const [connected, setConnected] = useState(false);

    // Order form
    const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
    const [orderType, setOrderType] = useState('MARKET');
    const [quantity, setQuantity] = useState('1');
    const [limitPrice, setLimitPrice] = useState('');
    const [orderLoading, setOrderLoading] = useState(false);

    // Bottom tabs
    const [bottomTab, setBottomTab] = useState('positions');

    const selectedRef = useRef(selected);
    const symbolsRef = useRef(symbols);
    selectedRef.current = selected;
    symbolsRef.current = symbols;

    // ── WebSocket Connection with Auto-Reconnection ──────────────────
    useEffect(() => {
        if (status !== 'authenticated' || !session?.user?.id) return;

        const userId = session.user.id;
        let ws: WebSocket | null = null;
        let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
        let reconnectDelay = 1000;
        let unmounted = false;

        function connect() {
            if (unmounted) return;
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            ws = new WebSocket(`${protocol}//${window.location.host}/ws?userId=${encodeURIComponent(userId)}`);

            ws.onopen = () => {
                setConnected(true);
                reconnectDelay = 1000; // reset backoff on successful connect
            };

            ws.onmessage = (e) => {
                const raw = JSON.parse(e.data);
                const { event, data } = raw;
                switch (event) {
                    case 'symbols':
                        setSymbols(data);
                        if (!selectedRef.current && data.length > 0) {
                            setSelected(data[0]);
                        }
                        break;
                    case 'candles':
                        setLatestCandles(data);
                        break;
                    case 'portfolio':
                        setPositions(data.positions);
                        setCashBalance(data.cashBalance);
                        break;
                    case 'news':
                        setNews(data);
                        break;
                }
            };

            ws.onerror = () => setConnected(false);

            ws.onclose = () => {
                setConnected(false);
                if (!unmounted) {
                    // Exponential backoff reconnection (max 30s)
                    reconnectTimeout = setTimeout(() => {
                        connect();
                    }, reconnectDelay);
                    reconnectDelay = Math.min(reconnectDelay * 2, 30000);
                }
            };
        }

        connect();

        return () => {
            unmounted = true;
            if (reconnectTimeout) clearTimeout(reconnectTimeout);
            if (ws) ws.close();
            setConnected(false);
        };
    }, [status, session?.user?.id]);

    // Update selected symbol with latest price data from SSE
    useEffect(() => {
        if (selected && symbols.length > 0) {
            const updated = symbols.find(s => s.id === selected.id);
            if (updated && updated.current_price !== selected.current_price) {
                setSelected(updated);
            }
        }
    }, [symbols, selected]);

    // Redirect if not authenticated
    useEffect(() => {
        if (status === 'unauthenticated') router.push('/login');
    }, [status, router]);

    const handleTrade = async () => {
        if (!selected) return;
        setOrderLoading(true);

        try {
            const body: Record<string, unknown> = {
                symbolId: selected.id,
                side,
                orderType,
                quantity: parseInt(quantity),
            };

            if (orderType !== 'MARKET') {
                body.price = parseFloat(limitPrice);
            }

            const res = await fetch('/api/trade', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            const data = await res.json();

            if (res.ok) {
                addToast(`${side} ${quantity} ${selected.ticker} — Order ${orderType === 'MARKET' ? 'filled' : 'placed'}!`, 'success');
                // Portfolio will update via SSE on next tick
            } else {
                addToast(data.error || 'Order failed', 'error');
            }
        } catch {
            addToast('Trade failed', 'error');
        } finally {
            setOrderLoading(false);
        }
    };

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
                setPositions(prev => prev.filter(p => p.id !== pos.id));
            } else {
                const data = await res.json();
                addToast(data.error || 'Failed to close', 'error');
            }
        } catch {
            addToast('Failed to close position', 'error');
        }
    };

    if (status === 'loading') {
        return <div className="loading-spinner"><div className="spinner" />Loading terminal...</div>;
    }

    // Apply client-side filters
    const filteredSymbols = symbols.filter(s => {
        if (filter !== 'ALL' && s.asset_type !== filter) return false;
        if (search && !s.ticker.toLowerCase().includes(search.toLowerCase()) && !s.name.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
    });

    const changePercent = selected ? ((selected.current_price - selected.prev_close) / selected.prev_close * 100) : 0;
    const estimatedCost = selected ? parseFloat(quantity || '0') * selected.current_price : 0;
    const estimatedCommission = 1 + estimatedCost * 0.001;
    const marginCost = selected?.asset_type === 'FUTURE' ? estimatedCost * selected.margin_req : estimatedCost;

    const assetBadgeClass = selected ? `asset-type-badge badge-${selected.asset_type.toLowerCase()}` : '';

    return (
        <>
            <Navbar />
            {/* Connection indicator */}
            <div style={{
                position: 'fixed', bottom: '6px', right: '6px', zIndex: 999,
                display: 'flex', alignItems: 'center', gap: '4px',
                padding: '2px 8px', borderRadius: '3px',
                background: connected ? 'var(--green-bg)' : 'var(--red-bg)',
                fontSize: '9px', fontFamily: 'var(--font-mono)', fontWeight: 600,
                color: connected ? 'var(--green-text)' : 'var(--red-text)',
            }}>
                <span style={{ width: 4, height: 4, borderRadius: '50%', background: connected ? 'var(--green)' : 'var(--red)' }} />
                {connected ? 'LIVE' : 'RECONNECTING'}
            </div>

            {/* Ticker Bar */}
            <div className="ticker-bar">
                <div className="ticker-scroll">
                    {symbols.slice(0, 20).map(s => {
                        const chg = ((s.current_price - s.prev_close) / s.prev_close * 100);
                        return (
                            <span key={s.id} className="ticker-item">
                                <span className="ticker-symbol">{s.ticker}</span>
                                <span style={{ color: 'var(--text-secondary)' }}>${s.current_price.toFixed(2)}</span>
                                <span className={chg >= 0 ? 'pnl-positive' : 'pnl-negative'}>
                                    {chg >= 0 ? '+' : ''}{chg.toFixed(2)}%
                                </span>
                            </span>
                        );
                    })}
                    {symbols.slice(0, 20).map(s => {
                        const chg = ((s.current_price - s.prev_close) / s.prev_close * 100);
                        return (
                            <span key={`dup-${s.id}`} className="ticker-item">
                                <span className="ticker-symbol">{s.ticker}</span>
                                <span style={{ color: 'var(--text-secondary)' }}>${s.current_price.toFixed(2)}</span>
                                <span className={chg >= 0 ? 'pnl-positive' : 'pnl-negative'}>
                                    {chg >= 0 ? '+' : ''}{chg.toFixed(2)}%
                                </span>
                            </span>
                        );
                    })}
                </div>
            </div>

            <div className="dashboard">
                {/* LEFT - WATCHLIST */}
                <div className="panel">
                    <div className="panel-header">
                        Watchlist
                        <span>{filteredSymbols.length}</span>
                    </div>
                    <div className="watchlist-filters">
                        {['ALL', 'EQUITY', 'FUTURE', 'COMMODITY', 'OPTION'].map(f => (
                            <button
                                key={f}
                                className={`filter-btn ${filter === f ? 'active' : ''}`}
                                onClick={() => setFilter(f)}
                            >
                                {f}
                            </button>
                        ))}
                    </div>
                    <div className="watchlist-search">
                        <input
                            placeholder="Search symbol..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                    <div className="panel-body">
                        {filteredSymbols.map(s => {
                            const chg = ((s.current_price - s.prev_close) / s.prev_close * 100);
                            return (
                                <div
                                    key={s.id}
                                    className={`stock-row ${selected?.id === s.id ? 'active' : ''}`}
                                    onClick={() => setSelected(s)}
                                >
                                    <div className="stock-info">
                                        <div className="stock-ticker">{s.ticker}</div>
                                        <div className="stock-name">{s.name}</div>
                                    </div>
                                    <div className="stock-price">${s.current_price.toFixed(2)}</div>
                                    <div className={`stock-change ${chg >= 0 ? 'positive' : chg < 0 ? 'negative' : 'neutral'}`}>
                                        {chg >= 0 ? '+' : ''}{chg.toFixed(2)}%
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* CENTER - CHART */}
                <div className="center-panel">
                    {selected && (
                        <>
                            <div className="chart-header">
                                <div className="chart-symbol-info">
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span className="symbol-name">{selected.ticker}</span>
                                            <span className={assetBadgeClass}>{selected.asset_type}</span>
                                        </div>
                                        <div className="symbol-fullname">{selected.name}</div>
                                    </div>
                                </div>
                                <div className="chart-price-info">
                                    <span className="current-price">${selected.current_price.toFixed(2)}</span>
                                    <span className={`price-change ${changePercent >= 0 ? 'positive' : 'negative'}`}>
                                        {changePercent >= 0 ? '+' : ''}{(selected.current_price - selected.prev_close).toFixed(2)} ({changePercent.toFixed(2)}%)
                                    </span>
                                </div>
                            </div>
                            <div className="chart-container">
                                <CandlestickChart symbolId={selected.id} ticker={selected.ticker} latestCandles={latestCandles} />
                            </div>

                            {/* Bottom section: positions & orders */}
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
                                    <div style={{ overflow: 'auto', maxHeight: '200px', padding: '4px 8px' }}>
                                        {news.length === 0 ? (
                                            <div className="empty-state">
                                                <div className="empty-icon">—</div>
                                                <div className="empty-text">No news yet</div>
                                            </div>
                                        ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                {[...news].reverse().map(n => (
                                                    <div key={n.id} style={{
                                                        padding: '4px 8px',
                                                        borderRadius: '4px',
                                                        background: n.impact > 0 ? 'rgba(0,255,136,0.04)' : n.impact < 0 ? 'rgba(255,51,102,0.04)' : 'transparent',
                                                        borderLeft: `2px solid ${n.impact > 0 ? 'var(--green-text)' : n.impact < 0 ? 'var(--red-text)' : 'var(--border)'}`,
                                                        fontSize: '11px',
                                                        display: 'flex',
                                                        justifyContent: 'space-between',
                                                        alignItems: 'center',
                                                        gap: '8px',
                                                    }}>
                                                        <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.headline}</span>
                                                        <span className={n.impact >= 0 ? 'pnl-positive' : 'pnl-negative'} style={{ fontSize: '10px', flexShrink: 0 }}>
                                                            {n.impact >= 0 ? '+' : ''}{n.impact.toFixed(1)}%
                                                        </span>
                                                        <span style={{ fontSize: '10px', color: 'var(--text-muted)', flexShrink: 0 }}>{new Date(n.timestamp).toLocaleTimeString()}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>

                {/* RIGHT - ORDER PANEL */}
                <div className="panel order-panel">
                    <div className="panel-header">Place Order</div>
                    {selected && (
                        <div className="order-form">
                            <div className="order-side-btns">
                                <button
                                    className={`side-btn buy ${side === 'BUY' ? 'active' : ''}`}
                                    onClick={() => setSide('BUY')}
                                >
                                    BUY
                                </button>
                                <button
                                    className={`side-btn sell ${side === 'SELL' ? 'active' : ''}`}
                                    onClick={() => setSide('SELL')}
                                >
                                    SELL
                                </button>
                            </div>

                            <select
                                className="order-type-select"
                                value={orderType}
                                onChange={e => setOrderType(e.target.value)}
                            >
                                <option value="MARKET">Market Order</option>
                                <option value="LIMIT">Limit Order</option>
                                <option value="STOP_LOSS">Stop-Loss Order</option>
                            </select>

                            <div className="order-input-group">
                                <label>Quantity</label>
                                <input
                                    type="number"
                                    min="1"
                                    value={quantity}
                                    onChange={e => setQuantity(e.target.value)}
                                />
                            </div>

                            {orderType !== 'MARKET' && (
                                <div className="order-input-group">
                                    <label>{orderType === 'LIMIT' ? 'Limit Price' : 'Stop Price'}</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={limitPrice}
                                        onChange={e => setLimitPrice(e.target.value)}
                                        placeholder={selected.current_price.toFixed(2)}
                                    />
                                </div>
                            )}

                            <div className="order-summary">
                                <div className="summary-row">
                                    <span>Symbol</span>
                                    <span className="value">{selected.ticker}</span>
                                </div>
                                <div className="summary-row">
                                    <span>Price</span>
                                    <span className="value">${selected.current_price.toFixed(2)}</span>
                                </div>
                                <div className="summary-row">
                                    <span>Est. Cost</span>
                                    <span className="value">${estimatedCost.toFixed(2)}</span>
                                </div>
                                {selected.asset_type === 'FUTURE' && (
                                    <div className="summary-row">
                                        <span>Margin Required</span>
                                        <span className="value" style={{ color: 'var(--purple)' }}>${marginCost.toFixed(2)}</span>
                                    </div>
                                )}
                                <div className="summary-row">
                                    <span>Commission</span>
                                    <span className="value">${estimatedCommission.toFixed(2)}</span>
                                </div>
                                <div className="summary-row" style={{ borderTop: '1px solid var(--border)', paddingTop: '8px', marginTop: '4px' }}>
                                    <span style={{ fontWeight: 700 }}>Total</span>
                                    <span className="value" style={{ fontWeight: 700 }}>
                                        ${(marginCost + estimatedCommission).toFixed(2)}
                                    </span>
                                </div>
                            </div>

                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                                Cash: ${cashBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </div>

                            <button
                                className={`btn-place-order ${side.toLowerCase()}`}
                                onClick={handleTrade}
                                disabled={orderLoading || !quantity || parseInt(quantity) <= 0}
                            >
                                {orderLoading ? 'Executing...' : `${side} ${selected.ticker}`}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}

export default function DashboardPage() {
    return (
        <ToastProvider>
            <DashboardContent />
        </ToastProvider>
    );
}
