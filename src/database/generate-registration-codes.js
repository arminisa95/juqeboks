const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { db } = require('./connection');

const COUNT = 1000;
const OUTPUT_FILE = path.join(__dirname, '..', '..', 'registration-codes.txt');
const SQL_FILE = path.join(__dirname, '..', '..', 'registration-codes.sql');

function generateCode() {
    return crypto.randomBytes(6).toString('hex').toUpperCase();
}

async function main() {
    const codes = new Set();
    while (codes.size < COUNT) {
        codes.add(generateCode());
    }
    const codeList = Array.from(codes);

    // Save locally
    fs.writeFileSync(OUTPUT_FILE, codeList.join('\n') + '\n');
    console.log(`Saved ${codeList.length} codes to ${OUTPUT_FILE}`);

    // Generate SQL file for manual import
    const sqlLines = [
        'INSERT INTO registration_codes (code, is_active) VALUES',
        codeList.map((c) => `    ('${c}', true)`).join(',\n') + ';'
    ];
    fs.writeFileSync(SQL_FILE, sqlLines.join('\n') + '\n');
    console.log(`Saved SQL import file to ${SQL_FILE}`);

    // Insert into database
    let inserted = 0;
    let skipped = 0;
    for (const code of codeList) {
        try {
            await db.query(
                'INSERT INTO registration_codes (code, is_active) VALUES ($1, true) ON CONFLICT (code) DO NOTHING',
                [code]
            );
            inserted++;
        } catch (err) {
            console.error('Insert error for code:', code, err.message);
            skipped++;
        }
    }

    console.log(`Inserted ${inserted} codes into database. Skipped ${skipped}.`);
    process.exit(0);
}

main().catch((err) => {
    console.error('Failed to generate codes:', err);
    process.exit(1);
});
