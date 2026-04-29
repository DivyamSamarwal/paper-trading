'use client';

import { useEffect, useRef, useCallback } from 'react';
import { createChart, IChartApi, ISeriesApi, CandlestickSeries, HistogramSeries, CandlestickData, Time } from 'lightweight-charts';

interface CandleData {
    symbol_id?: string;
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

interface Props {
    symbolId: string;
    ticker: string;
    latestCandles?: CandleData[]; // pushed from SSE
}

export default function CandlestickChart({ symbolId, ticker, latestCandles }: Props) {
    const chartRef = useRef<HTMLDivElement>(null);
    const chartInstance = useRef<IChartApi | null>(null);
    const candleSeries = useRef<ISeriesApi<'Candlestick'> | null>(null);
    const volumeSeries = useRef<ISeriesApi<'Histogram'> | null>(null);
    const initializedRef = useRef(false);
    const currentSymbolRef = useRef(symbolId);

    // Fetch initial candle history (one-time on symbol change)
    const fetchInitialCandles = useCallback(async () => {
        try {
            const res = await fetch(`/api/market/candles?symbolId=${symbolId}&limit=500`);
            if (!res.ok) return;
            const raw: CandleData[] = await res.json();
            if (!candleSeries.current || !volumeSeries.current) return;

            const deduped = new Map<number, CandleData>();
            for (const c of raw) deduped.set(c.timestamp, c);
            const candles = Array.from(deduped.values()).sort((a, b) => a.timestamp - b.timestamp);

            if (candles.length > 0) {
                candleSeries.current.setData(candles.map(c => ({
                    time: c.timestamp as Time, open: c.open, high: c.high, low: c.low, close: c.close,
                })));
                volumeSeries.current.setData(candles.map(c => ({
                    time: c.timestamp as Time, value: c.volume,
                    color: c.close >= c.open ? 'rgba(38, 166, 154, 0.25)' : 'rgba(239, 83, 80, 0.25)',
                })));
            } else {
                candleSeries.current.setData([]);
                volumeSeries.current.setData([]);
            }
            initializedRef.current = true;
        } catch (e) {
            console.error('Failed to fetch candles:', e);
        }
    }, [symbolId]);


    // Create chart and fetch initial data
    useEffect(() => {
        if (!chartRef.current) return;
        if (chartInstance.current) { chartInstance.current.remove(); chartInstance.current = null; }
        initializedRef.current = false;
        currentSymbolRef.current = symbolId;

        const getVar = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

        const chart = createChart(chartRef.current, {
            layout: {
                background: { color: getVar('--chart-bg') || '#131722' },
                textColor: getVar('--chart-text') || '#848e9c',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11,
            },
            grid: {
                vertLines: { color: getVar('--chart-grid') || 'rgba(255,255,255,0.03)' },
                horzLines: { color: getVar('--chart-grid') || 'rgba(255,255,255,0.03)' },
            },
            crosshair: {
                mode: 0,
                vertLine: { color: getVar('--chart-crosshair') || 'rgba(41,98,255,0.3)', labelBackgroundColor: getVar('--chart-label-bg') || '#1e222d' },
                horzLine: { color: getVar('--chart-crosshair') || 'rgba(41,98,255,0.3)', labelBackgroundColor: getVar('--chart-label-bg') || '#1e222d' },
            },
            timeScale: {
                timeVisible: true,
                secondsVisible: true,
                borderColor: getVar('--border'),
                tickMarkFormatter: (time: number) => {
                    const date = new Date(time * 1000);
                    const h = date.getHours().toString().padStart(2, '0');
                    const m = date.getMinutes().toString().padStart(2, '0');
                    const s = date.getSeconds().toString().padStart(2, '0');
                    return `${h}:${m}${s !== '00' ? ':' + s : ''}`;
                },
            },
            rightPriceScale: { borderColor: getVar('--border') },
            handleScroll: { vertTouchDrag: false },
            localization: {
                timeFormatter: (time: number) => {
                    const date = new Date(time * 1000);
                    return date.getHours().toString().padStart(2, '0') + ':' +
                           date.getMinutes().toString().padStart(2, '0') + ':' +
                           date.getSeconds().toString().padStart(2, '0');
                },
                priceFormatter: (price: number) => price.toFixed(2),
            },
        });

        const cs = chart.addSeries(CandlestickSeries, {
            upColor: '#26a69a', downColor: '#ef5350',
            borderUpColor: '#26a69a', borderDownColor: '#ef5350',
            wickUpColor: '#26a69a', wickDownColor: '#ef5350',
        });

        const vs = chart.addSeries(HistogramSeries, {
            priceFormat: { type: 'volume' },
            priceScaleId: 'volume',
        });

        chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });

        chartInstance.current = chart;
        candleSeries.current = cs;
        volumeSeries.current = vs;

        fetchInitialCandles();

        // Listen for theme changes
        const onThemeChange = () => {
            const bg = getVar('--chart-bg') || '#131722';
            const text = getVar('--chart-text') || '#848e9c';
            const grid = getVar('--chart-grid') || 'rgba(255,255,255,0.03)';
            const cross = getVar('--chart-crosshair') || 'rgba(41,98,255,0.3)';
            const labelBg = getVar('--chart-label-bg') || '#1e222d';
            const border = getVar('--border');
            chart.applyOptions({
                layout: { background: { color: bg }, textColor: text },
                grid: { vertLines: { color: grid }, horzLines: { color: grid } },
                crosshair: {
                    vertLine: { color: cross, labelBackgroundColor: labelBg },
                    horzLine: { color: cross, labelBackgroundColor: labelBg },
                },
                timeScale: { borderColor: border },
                rightPriceScale: { borderColor: border },
            });
        };
        // Small delay so CSS vars update first
        const themeHandler = () => setTimeout(onThemeChange, 50);
        window.addEventListener('themechange', themeHandler);

        const ro = new ResizeObserver(() => {
            if (chartRef.current && chartInstance.current) {
                chartInstance.current.applyOptions({
                    width: chartRef.current.clientWidth,
                    height: chartRef.current.clientHeight,
                });
            }
        });
        ro.observe(chartRef.current);

        return () => {
            window.removeEventListener('themechange', themeHandler);
            ro.disconnect();
            if (chartInstance.current) { chartInstance.current.remove(); chartInstance.current = null; }
        };
    }, [symbolId, ticker, fetchInitialCandles]);

    // Apply real-time candle updates from SSE
    useEffect(() => {
        if (!latestCandles || latestCandles.length === 0 || !initializedRef.current) return;
        if (!candleSeries.current || !volumeSeries.current) return;

        // Filter candles for the current symbol and find the newest one
        const myCandles = latestCandles
            .filter((c: CandleData) => c.symbol_id === currentSymbolRef.current)
            .sort((a, b) => a.timestamp - b.timestamp);

        if (myCandles.length === 0) return;

        // Only update the single newest candle (avoids "Cannot update oldest data" error)
        const c = myCandles[myCandles.length - 1];
        try {
            candleSeries.current.update({
                time: c.timestamp as Time,
                open: c.open, high: c.high, low: c.low, close: c.close,
            });
            volumeSeries.current.update({
                time: c.timestamp as Time,
                value: c.volume,
                color: c.close >= c.open ? 'rgba(38, 166, 154, 0.25)' : 'rgba(239, 83, 80, 0.25)',
            });
        } catch {
            // If update fails (e.g., time out of order), silently skip
        }
    }, [latestCandles]);

    return <div ref={chartRef} style={{ width: '100%', height: '100%' }} />;
}
