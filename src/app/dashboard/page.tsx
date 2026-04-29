'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import Navbar from '@/components/Navbar';
import CandlestickChart from '@/components/CandlestickChart';
import { ToastProvider } from '@/components/Toast';

import { useTradingStore } from '@/store/tradingStore';
import { useTradingWebSocket } from '@/hooks/useTradingWebSocket';

import TickerBar from '@/components/dashboard/TickerBar';
import Watchlist from '@/components/dashboard/Watchlist';
import OrderPanel from '@/components/dashboard/OrderPanel';
import BottomPanel from '@/components/dashboard/BottomPanel';

function DashboardContent() {
    const { status } = useSession();
    const router = useRouter();

    // Initialize WebSocket connection
    useTradingWebSocket();

    // Select specifically the state we need for this main component to avoid unnecessary re-renders
    const connected = useTradingStore((state) => state.connected);
    const selected = useTradingStore((state) => state.selected);
    const latestCandles = useTradingStore((state) => state.latestCandles);

    // Redirect if not authenticated
    useEffect(() => {
        if (status === 'unauthenticated') router.push('/login');
    }, [status, router]);

    if (status === 'loading') {
        return <div className="loading-spinner"><div className="spinner" />Loading terminal...</div>;
    }

    const changePercent = selected ? ((selected.current_price - selected.prev_close) / selected.prev_close * 100) : 0;
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

            <TickerBar />

            <div className="dashboard">
                <div className="panel-container" style={{ display: 'contents' }}>
                    <Watchlist />
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

                            <BottomPanel />
                        </>
                    )}
                </div>

                <div className="panel-container" style={{ display: 'contents' }}>
                    <OrderPanel />
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
