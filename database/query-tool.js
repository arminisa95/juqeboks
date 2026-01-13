// Interactive Database Query Tool
require('dotenv').config();
const { db } = require('./connection');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function executeQuery(query) {
    try {
        console.log(`\n🔍 Executing: ${query}`);
        const start = Date.now();
        
        const result = await db.query(query);
        const duration = Date.now() - start;
        
        console.log(`⏱️  Query completed in ${duration}ms`);
        console.log(`📊 Rows returned: ${result.rowCount}`);
        
        if (result.rows.length > 0) {
            console.log('\n📋 Results:');
            console.table(result.rows);
        } else {
            console.log('✅ Query executed successfully (no rows returned)');
        }
        
        return result;
    } catch (error) {
        console.error('❌ Query error:', error.message);
        return null;
    }
}

function showHelp() {
    console.log(`
🎵 JUKE Database Query Tool
==========================

Commands:
  help     - Show this help message
  tables   - List all tables
  schema   - Show table schema
  stats    - Show database statistics
  recent   - Show recent activity
  exit     - Exit the tool

Examples:
  SELECT * FROM users LIMIT 5
  SELECT COUNT(*) FROM tracks
  SELECT title, artist_name FROM tracks t JOIN artists a ON t.artist_id = a.id
`);
}

async function showTables() {
    try {
        const result = await db.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            ORDER BY table_name
        `);
        
        console.log('\n📊 Database Tables:');
        result.rows.forEach((row, index) => {
            console.log(`  ${index + 1}. ${row.table_name}`);
        });
    } catch (error) {
        console.error('❌ Error fetching tables:', error.message);
    }
}

async function showSchema(tableName) {
    try {
        const result = await db.query(`
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns 
            WHERE table_name = $1 
            ORDER BY ordinal_position
        `, [tableName]);
        
        console.log(`\n📋 Schema for ${tableName}:`);
        console.table(result.rows);
    } catch (error) {
        console.error('❌ Error fetching schema:', error.message);
    }
}

async function showStats() {
    try {
        const tables = ['users', 'artists', 'albums', 'tracks', 'playlists', 'user_favorites', 'play_history'];
        
        console.log('\n📊 Database Statistics:');
        console.log('─'.repeat(50));
        
        for (const table of tables) {
            const result = await db.get(`SELECT COUNT(*) as count FROM ${table}`);
            const size = await db.get(`
                SELECT pg_size_pretty(pg_total_relation_size('${table}')) as size
            `);
            console.log(`${table.padEnd(20)}: ${result.count.toString().padEnd(8)} (${size.size})`);
        }
        
        // Total database size
        const totalSize = await db.get('SELECT pg_size_pretty(pg_database_size(current_database())) as size');
        console.log('─'.repeat(50));
        console.log(`Total Database Size: ${totalSize.size}`);
        
    } catch (error) {
        console.error('❌ Error fetching stats:', error.message);
    }
}

async function showRecentActivity() {
    try {
        console.log('\n📈 Recent Activity (Last 24 Hours):');
        
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        
        const activities = [
            { name: 'New Users', query: 'SELECT COUNT(*) as count FROM users WHERE created_at > $1' },
            { name: 'New Tracks', query: 'SELECT COUNT(*) as count FROM tracks WHERE created_at > $1' },
            { name: 'New Playlists', query: 'SELECT COUNT(*) as count FROM playlists WHERE created_at > $1' },
            { name: 'Tracks Played', query: 'SELECT COUNT(*) as count FROM play_history WHERE played_at > $1' },
            { name: 'New Favorites', query: 'SELECT COUNT(*) as count FROM user_favorites WHERE created_at > $1' }
        ];
        
        for (const activity of activities) {
            const result = await db.get(activity.query, [oneDayAgo]);
            console.log(`${activity.name.padEnd(20)}: ${result.count}`);
        }
        
        // Show top tracks today
        console.log('\n🎵 Top Tracks Today:');
        const topTracks = await db.getAll(`
            SELECT t.title, a.name as artist_name, COUNT(ph.id) as plays
            FROM play_history ph
            JOIN tracks t ON ph.track_id = t.id
            JOIN artists a ON t.artist_id = a.id
            WHERE ph.played_at > $1
            GROUP BY t.id, t.title, a.name
            ORDER BY plays DESC
            LIMIT 5
        `, [oneDayAgo]);
        
        topTracks.forEach((track, index) => {
            console.log(`${index + 1}. "${track.title}" by ${track.artist_name} (${track.plays} plays)`);
        });
        
    } catch (error) {
        console.error('❌ Error fetching activity:', error.message);
    }
}

async function startInteractiveMode() {
    console.log('🎵 Welcome to JUKE Database Query Tool!');
    showHelp();
    
    while (true) {
        const query = await new Promise((resolve) => {
            rl.question('\n🔍 Enter SQL query (or command): ', resolve);
        });
        
        const trimmedQuery = query.trim().toLowerCase();
        
        if (trimmedQuery === 'exit' || trimmedQuery === 'quit') {
            console.log('👋 Goodbye!');
            break;
        } else if (trimmedQuery === 'help') {
            showHelp();
        } else if (trimmedQuery === 'tables') {
            await showTables();
        } else if (trimmedQuery.startsWith('schema ')) {
            const tableName = trimmedQuery.substring(7).trim();
            await showSchema(tableName);
        } else if (trimmedQuery === 'stats') {
            await showStats();
        } else if (trimmedQuery === 'recent') {
            await showRecentActivity();
        } else if (trimmedQuery) {
            await executeQuery(query);
        }
    }
    
    rl.close();
}

// Command line mode
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        startInteractiveMode();
    } else {
        const query = args.join(' ');
        executeQuery(query).then(() => process.exit(0));
    }
}

module.exports = { executeQuery, showStats, showRecentActivity };
