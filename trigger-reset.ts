import { tickPrices } from './src/lib/price-engine';
async function run() {
    console.log('Manually triggering tickPrices...');
    await tickPrices();
    console.log('Done.');
    process.exit(0);
}
run();
