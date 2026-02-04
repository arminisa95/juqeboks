// Database Monitoring Tool
require('dotenv').config();
const { db } = require('./connection');

async function getDatabaseStats() {
    try {
        const stats = {};
        
        // Get table counts
        const tables = [
            'users', 'artists', 'albums', 'tracks', 
            'playlists', 'playlist_tracks', 'user_favorites',
            'user_following_artists', 'play_history'
        ];
        
        for (const table of tables) {
            try {
                const result = await db.get(`SELECT COUNT(*) as count FROM ${table}`);
                stats[table] = parseInt(result.count);
            } catch (error) {
                stats[table] = 0;
            }
        }
        
        // Get recent activity
        const recentUsers = await db.getAll(`
            SELECT username, created_at FROM users 
            ORDER BY created_at DESC LIMIT 5
        `);
        
        const recentTracks = await db.getAll(`
            SELECT t.title, a.name as artist_name, t.created_at 
            FROM tracks t 
            JOIN artists a ON t.artist_id = a.id 
            ORDER BY t.created_at DESC LIMIT 5
        `);
        
        const recentPlaylists = await db.getAll(`
            SELECT name, created_at FROM playlists 
            ORDER BY created_at DESC LIMIT 5
        `);
        
        // Get storage stats
        const totalFileSize = await db.get(`
            SELECT COALESCE(SUM(file_size), 0) as total_size 
            FROM tracks WHERE file_size IS NOT NULL
        `);
        
        console.log('\n=== 📊 DATABASE STATISTICS ===');
        console.log('\n📊 Table Counts:');
        Object.entries(stats).forEach(([table, count]) => {
            console.log(`  ${table}: ${count}`);
        });
        
        console.log('\n👥 Recent Users:');
        recentUsers.forEach(user => {
            console.log(`  ${user.username} - ${new Date(user.created_at).toLocaleDateString()}`);
        });
        
        console.log('\n🎵 Recent Tracks:');
        recentTracks.forEach(track => {
            console.log(`  "${track.title}" by ${track.artist_name} - ${new Date(track.created_at).toLocaleDateString()}`);
        });
        
        console.log('\n📝 Recent Playlists:');
        recentPlaylists.forEach(playlist => {
            console.log(`  ${playlist.name} - ${new Date(playlist.created_at).toLocaleDateString()}`);
        });
        
        console.log('\n💾 Storage Usage:');
        console.log(`  Total file size: ${(totalFileSize.total_size / 1024 / 1024).toFixed(2)} MB`);
        
        return stats;
    } catch (error) {
        console.error('Database monitoring error:', error);
    }
}

async function getActivityLog() {
    try {
        console.log('\n=== 📈 ACTIVITY LOG (Last 24 Hours) ===');
        
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        
        const newUsers = await db.get(`
            SELECT COUNT(*) as count FROM users 
            WHERE created_at > $1
        `, [oneDayAgo]);
        
        const newTracks = await db.get(`
            SELECT COUNT(*) as count FROM tracks 
            WHERE created_at > $1
        `, [oneDayAgo]);
        
        const newPlaylists = await db.get(`
            SELECT COUNT(*) as count FROM playlists 
            WHERE created_at > $1
        `, [oneDayAgo]);
        
        const plays = await db.get(`
            SELECT COUNT(*) as count FROM play_history 
            WHERE played_at > $1
        `, [oneDayAgo]);
        
        console.log(`  New users: ${newUsers.count}`);
        console.log(`  New tracks: ${newTracks.count}`);
        console.log(`  New playlists: ${newPlaylists.count}`);
        console.log(`  Tracks played: ${plays.count}`);
        
    } catch (error) {
        console.error('Activity log error:', error);
    }
}

// Run monitoring
if (require.main === module) {
    (async () => {
        await getDatabaseStats();
        await getActivityLog();
        process.exit(0);
    })();
}

module.exports = { getDatabaseStats, getActivityLog };
