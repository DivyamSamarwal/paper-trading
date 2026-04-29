import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useTradingStore } from '@/store/tradingStore';

export function useTradingWebSocket() {
    const { data: session, status } = useSession();
    const { setSymbols, setLatestCandles, setPositions, setCashBalance, setNews, setConnected } = useTradingStore();

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
    }, [status, session?.user?.id, setSymbols, setLatestCandles, setPositions, setCashBalance, setNews, setConnected]);
}
