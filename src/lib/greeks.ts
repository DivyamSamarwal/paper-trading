import { getSQL } from './db';

function normCDF(x: number): number {
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
    const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x) / Math.sqrt(2);
    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    return 0.5 * (1.0 + sign * y);
}

function normPDF(x: number): number {
    return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

export interface Greeks { price: number; delta: number; gamma: number; theta: number; vega: number; iv: number; }

const RISK_FREE_RATE = 0.05;

export function d1(S: number, K: number, T: number, r: number, sigma: number): number {
    return (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
}

export function d2(S: number, K: number, T: number, r: number, sigma: number): number {
    return d1(S, K, T, r, sigma) - sigma * Math.sqrt(T);
}

export function blackScholesPrice(type: 'CALL' | 'PUT', S: number, K: number, T: number, r: number = RISK_FREE_RATE, sigma: number = 0.3): number {
    if (T <= 0) return type === 'CALL' ? Math.max(0, S - K) : Math.max(0, K - S);
    const D1 = d1(S, K, T, r, sigma);
    const D2 = d2(S, K, T, r, sigma);
    if (type === 'CALL') return S * normCDF(D1) - K * Math.exp(-r * T) * normCDF(D2);
    else return K * Math.exp(-r * T) * normCDF(-D2) - S * normCDF(-D1);
}

export function calcGreeks(type: 'CALL' | 'PUT', S: number, K: number, T: number, r: number = RISK_FREE_RATE, sigma: number = 0.3): Greeks {
    if (T <= 0) {
        const intrinsic = type === 'CALL' ? Math.max(0, S - K) : Math.max(0, K - S);
        const itm = type === 'CALL' ? S > K : K > S;
        return { price: intrinsic, delta: itm ? (type === 'CALL' ? 1 : -1) : 0, gamma: 0, theta: 0, vega: 0, iv: sigma };
    }
    const D1 = d1(S, K, T, r, sigma);
    const D2 = d2(S, K, T, r, sigma);
    const sqrtT = Math.sqrt(T);
    const price = blackScholesPrice(type, S, K, T, r, sigma);
    const delta = type === 'CALL' ? normCDF(D1) : normCDF(D1) - 1;
    const gamma = normPDF(D1) / (S * sigma * sqrtT);
    const vega = S * normPDF(D1) * sqrtT / 100;
    const theta = type === 'CALL'
        ? (-(S * normPDF(D1) * sigma) / (2 * sqrtT) - r * K * Math.exp(-r * T) * normCDF(D2)) / 365
        : (-(S * normPDF(D1) * sigma) / (2 * sqrtT) + r * K * Math.exp(-r * T) * normCDF(-D2)) / 365;
    return { price: Math.max(0.01, price), delta, gamma, theta, vega, iv: sigma };
}

export async function updateOptionPrices() {
    const sql = await getSQL();
    const options = await sql`
        SELECT s.id, s.option_type, s.option_strike, s.option_expiry, s.iv, s.underlying, s.current_price as prev_price, u.current_price as underlying_price
        FROM symbols s JOIN symbols u ON u.ticker = s.underlying
        WHERE s.asset_type = 'OPTION'
    `;
    const now = Math.floor(Date.now() / 1000);

    for (const opt of options) {
        const T = Math.max(0, (new Date(opt.option_expiry).getTime() - Date.now()) / (365 * 86400000));
        const price = blackScholesPrice(opt.option_type as 'CALL' | 'PUT', opt.underlying_price, opt.option_strike, T, RISK_FREE_RATE, opt.iv);
        const rounded = Math.round(Math.max(0.01, price) * 100) / 100;
        // Only update the current price — skip price_history for options (too many writes)
        const dayHighRows = await sql`SELECT day_high, day_low FROM symbols WHERE id = ${opt.id}`;
        if (dayHighRows.length > 0) {
            const newDayHigh = Math.max(Number(dayHighRows[0].day_high), rounded);
            const newDayLow = Math.min(Number(dayHighRows[0].day_low), rounded);
            await sql`UPDATE symbols SET current_price = ${rounded}, day_high = ${newDayHigh}, day_low = ${newDayLow} WHERE id = ${opt.id}`;
        }
    }
}
