require('dotenv').config();
const { db, close } = require('./connection');

async function run() {
    console.log('Creating feed performance indexes...');

    await db.query(`
        CREATE INDEX IF NOT EXISTS idx_tracks_feed_newest
            ON tracks (created_at DESC)
            WHERE COALESCE(is_available, true) = true AND COALESCE(moderation_status, 'approved') = 'approved'
    `);
    console.log('✅ idx_tracks_feed_newest');

    await db.query(`
        CREATE INDEX IF NOT EXISTS idx_tracks_feed_popular
            ON tracks (play_count DESC, created_at DESC)
            WHERE COALESCE(is_available, true) = true AND COALESCE(moderation_status, 'approved') = 'approved'
    `);
    console.log('✅ idx_tracks_feed_popular');

    await db.query(`
        CREATE INDEX IF NOT EXISTS idx_tracks_feed_genre_newest
            ON tracks (genre, created_at DESC)
            WHERE COALESCE(is_available, true) = true AND COALESCE(moderation_status, 'approved') = 'approved'
    `);
    console.log('✅ idx_tracks_feed_genre_newest');

    await close();
    console.log('Done.');
}

run().catch((err) => {
    console.error('Migration failed:', err.message);
    process.exit(1);
});
