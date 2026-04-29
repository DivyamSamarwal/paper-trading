import { create } from 'zustand';

export interface Symbol {
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

export interface Position {
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

export interface NewsEvent {
    id: number;
    headline: string;
    type: string;
    impact: number;
    affectedTickers: string[];
    timestamp: string;
}

export interface CandleUpdate {
    symbol_id: string;
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

interface TradingState {
    // Data
    symbols: Symbol[];
    selected: Symbol | null;
    positions: Position[];
    cashBalance: number;
    news: NewsEvent[];
    latestCandles: CandleUpdate[];
    connected: boolean;

    // UI State
    filter: string;
    search: string;
    bottomTab: string;
    side: 'BUY' | 'SELL';
    orderType: string;
    quantity: string;
    limitPrice: string;
    orderLoading: boolean;

    // Actions
    setSymbols: (symbols: Symbol[]) => void;
    setSelected: (symbol: Symbol | null) => void;
    setPositions: (positions: Position[]) => void;
    setCashBalance: (balance: number) => void;
    setNews: (news: NewsEvent[]) => void;
    setLatestCandles: (candles: CandleUpdate[]) => void;
    setConnected: (connected: boolean) => void;

    setFilter: (filter: string) => void;
    setSearch: (search: string) => void;
    setBottomTab: (tab: string) => void;
    setSide: (side: 'BUY' | 'SELL') => void;
    setOrderType: (type: string) => void;
    setQuantity: (qty: string) => void;
    setLimitPrice: (price: string) => void;
    setOrderLoading: (loading: boolean) => void;
}

export const useTradingStore = create<TradingState>((set) => ({
    symbols: [],
    selected: null,
    positions: [],
    cashBalance: 1000,
    news: [],
    latestCandles: [],
    connected: false,

    filter: 'ALL',
    search: '',
    bottomTab: 'positions',
    side: 'BUY',
    orderType: 'MARKET',
    quantity: '1',
    limitPrice: '',
    orderLoading: false,

    setSymbols: (symbols) => set((state) => {
        let updatedSelected = state.selected;
        if (state.selected) {
            const updated = symbols.find(s => s.id === state.selected?.id);
            if (updated && updated.current_price !== state.selected.current_price) {
                updatedSelected = updated;
            }
        } else if (symbols.length > 0) {
            updatedSelected = symbols[0];
        }
        return { symbols, selected: updatedSelected };
    }),
    setSelected: (selected) => set({ selected }),
    setPositions: (positions) => set({ positions }),
    setCashBalance: (cashBalance) => set({ cashBalance }),
    setNews: (news) => set({ news }),
    setLatestCandles: (latestCandles) => set({ latestCandles }),
    setConnected: (connected) => set({ connected }),

    setFilter: (filter) => set({ filter }),
    setSearch: (search) => set({ search }),
    setBottomTab: (bottomTab) => set({ bottomTab }),
    setSide: (side) => set({ side }),
    setOrderType: (orderType) => set({ orderType }),
    setQuantity: (quantity) => set({ quantity }),
    setLimitPrice: (limitPrice) => set({ limitPrice }),
    setOrderLoading: (orderLoading) => set({ orderLoading }),
}));
