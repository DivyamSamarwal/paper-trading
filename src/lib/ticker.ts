// Server-side pub/sub ticker singleton
// Runs price ticks on a fixed interval and notifies all subscribers

import { initDb } from './db';
import { tickPrices } from './price-engine';

type Listener = (event: string, data: unknown) => void;

class Ticker {
    private listeners = new Set<Listener>();
    private interval: ReturnType<typeof setInterval> | null = null;
    private running = false;
    private initialized = false;

    async ensureInit() {
        if (this.initialized) return;
        this.initialized = true;
        await initDb();
    }

    subscribe(listener: Listener) {
        this.listeners.add(listener);
        // Auto-start when first subscriber connects
        if (this.listeners.size === 1 && !this.interval) {
            this.start();
        }
        return () => {
            this.listeners.delete(listener);
            // Auto-stop when last subscriber disconnects
            if (this.listeners.size === 0 && this.interval) {
                this.stop();
            }
        };
    }

    private start() {
        if (this.interval) return;
        console.log('[Ticker] Starting price engine (1s interval)');
        this.interval = setInterval(() => this.tick(), 1000);
        // Immediate first tick
        this.tick();
    }

    private stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
            console.log('[Ticker] Stopped (no subscribers)');
        }
    }

    private async tick() {
        if (this.running) return; // Skip if previous tick still running
        this.running = true;
        try {
            await this.ensureInit();
            await tickPrices();
            this.broadcast('tick', { timestamp: Date.now() });
        } catch (e) {
            console.error('[Ticker] tick error:', e);
        } finally {
            this.running = false;
        }
    }

    broadcast(event: string, data: unknown) {
        for (const listener of this.listeners) {
            try {
                listener(event, data);
            } catch { /* listener error, ignore */ }
        }
    }
}

// Singleton — survives hot reloads in dev
const globalTicker = globalThis as unknown as { __ticker?: Ticker };

// Force a clean restart of the ticker to pick up the patched price-engine logic
if (globalTicker.__ticker) {
    // We can't access private methods directly, but we can hack it to stop
    (globalTicker.__ticker as any).stop();
}
globalTicker.__ticker = new Ticker();

export const ticker = globalTicker.__ticker;
