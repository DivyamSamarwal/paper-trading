'use client';

import { useTradingStore } from '@/store/tradingStore';

export default function Watchlist() {
    const { symbols, selected, filter, search, setFilter, setSearch, setSelected } = useTradingStore();

    // Apply client-side filters
    const filteredSymbols = symbols.filter(s => {
        if (filter !== 'ALL' && s.asset_type !== filter) return false;
        if (search && !s.ticker.toLowerCase().includes(search.toLowerCase()) && !s.name.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
    });

    return (
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
                    const dayChg = ((s.current_price - s.prev_close) / s.prev_close * 100);
                    
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
                            <div className={`stock-change-badge ${dayChg >= 0 ? 'positive' : dayChg < 0 ? 'negative' : 'neutral'}`}>
                                {dayChg >= 0 ? '+' : ''}{dayChg.toFixed(2)}%
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
