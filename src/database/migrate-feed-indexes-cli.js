const { Client } = require('pg');

const url = process.argv[2] || process.env.DATABASE_URL;

if (!url) {
    console.error('Usage: node migrate-feed-indexes-cli.js <postgres-url>');
    console.error('   or: DATABASE_URL=<postgres-url> node migrate-feed-indexes-cli.js');
    process.exit(1);
}

const client = new Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false }
});

async function run() {
    await client.connect();
    console.log('Connected to database.');

    await client.query(`
        CREATE INDEX IF NOT EXISTS idx_tracks_feed_newest
            ON tracks (created_at DESC)
            WHERE COALESCE(is_available, true) = true AND COALESCE(moderation_status, 'approved') = 'approved'
    `);
    console.log('✅ idx_tracks_feed_newest');

    await client.query(`
        CREATE INDEX IF NOT EXISTS idx_tracks_feed_popular
            ON tracks (play_count DESC, created_at DESC)
            WHERE COALESCE(is_available, true) = true AND COALESCE(moderation_status, 'approved') = 'approved'
    `);
    console.log('✅ idx_tracks_feed_popular');

    await client.query(`
        CREATE INDEX IF NOT EXISTS idx_tracks_feed_genre_newest
            ON tracks (genre, created_at DESC)
            WHERE COALESCE(is_available, true) = true AND COALESCE(moderation_status, 'approved') = 'approved'
    `);
    console.log('✅ idx_tracks_feed_genre_newest');

    await client.end();
    console.log('Done.');
}

run().catch((err) => {
    console.error('Migration failed:', err.message);
    process.exit(1);
});
