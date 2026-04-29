'use client';

import { useTradingStore } from '@/store/tradingStore';

export default function TickerBar() {
    const symbols = useTradingStore((state) => state.symbols);

    // Limit to 20 to avoid heavy DOM
    const topSymbols = symbols.slice(0, 20);

    return (
        <div className="ticker-bar">
            <div className="ticker-scroll">
                {topSymbols.map(s => {
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
                {/* Duplicate for seamless scrolling */}
                {topSymbols.map(s => {
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
    );
}
