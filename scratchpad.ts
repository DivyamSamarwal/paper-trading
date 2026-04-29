import { getSQL, initDb } from './src/lib/db';

async function run() {
    await initDb();
    const sql = await getSQL();
    const syms = await sql`SELECT DISTINCT ticker, asset_type FROM symbols`;
    console.log("DB Symbols:");
    console.log(syms);
}
run();
