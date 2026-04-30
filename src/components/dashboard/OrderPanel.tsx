'use client';

import { useState } from 'react';
import { useTradingStore } from '@/store/tradingStore';
import { useToast } from '@/components/Toast';

export default function OrderPanel() {
    const { addToast } = useToast();
    const { 
        selected, cashBalance, side, orderType, quantity, limitPrice, orderLoading,
        setSide, setOrderType, setQuantity, setLimitPrice, setOrderLoading 
    } = useTradingStore();

    const [cooldown, setCooldown] = useState(0);

    if (!selected) return null;

    const estimatedCost = parseFloat(quantity || '0') * selected.current_price;
    const estimatedCommission = 1 + estimatedCost * 0.001;
    const marginCost = selected.asset_type === 'FUTURE' ? estimatedCost * selected.margin_req : estimatedCost;
 
    const handleTrade = async () => {
        if (cooldown > 0) return;
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
                addToast(`${side} ${quantity} ${selected.ticker} — Order submitted`, 'success');
                // Start UI cooldown
                setCooldown(3);
                const timer = setInterval(() => {
                    setCooldown(prev => {
                        if (prev <= 1) { clearInterval(timer); return 0; }
                        return prev - 1;
                    });
                }, 1000);
            } else {
                addToast(data.error || 'Order failed', 'error');
            }
        } catch {
            addToast('Trade failed', 'error');
        } finally {
            setOrderLoading(false);
        }
    };

    return (
        <div className="panel order-panel">
            <div className="panel-header">Place Order</div>
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
                    disabled={orderLoading || cooldown > 0 || !quantity || parseInt(quantity) <= 0}
                >
                    {orderLoading ? 'Executing...' : cooldown > 0 ? `Wait ${cooldown}s` : `${side} ${selected.ticker}`}
                </button>
            </div>
        </div>
    );
}
