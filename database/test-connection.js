// Test Database Connection
require('dotenv').config();
const { Pool } = require('pg');

async function testConnection() {
    console.log('🔍 Testing database connection...');
    console.log('Environment variables:');
    console.log('  DB_HOST:', process.env.DB_HOST || 'localhost');
    console.log('  DB_NAME:', process.env.DB_NAME || 'juke_db_s8gk');
    console.log('  DB_USER:', process.env.DB_USER || 'juke_user');
    console.log('  DB_PORT:', process.env.DB_PORT || '5432');
    console.log('  DB_SSL:', process.env.DB_SSL || 'not set');
    
    // Try different SSL configurations
    const configs = [
        { ssl: false, name: 'No SSL' },
        { ssl: { rejectUnauthorized: false }, name: 'SSL with rejectUnauthorized: false' },
        { ssl: { rejectUnauthorized: true }, name: 'SSL with rejectUnauthorized: true' }
    ];
    
    for (const config of configs) {
        console.log(`\n🔍 Testing with ${config.name}...`);
        
        try {
            const pool = new Pool({
                user: process.env.DB_USER || 'juke_user',
                host: process.env.DB_HOST || 'localhost',
                database: process.env.DB_NAME || 'juke_db_s8gk',
                password: process.env.DB_PASSWORD || 'your_password_here',
                port: process.env.DB_PORT || 5432,
                ssl: config.ssl,
                max: 1,
                connectionTimeoutMillis: 5000
            });
            
            const result = await pool.query('SELECT NOW() as current_time, version() as version');
            console.log('✅ Connection successful!');
            console.log('  Current time:', result.rows[0].current_time);
            console.log('  PostgreSQL version:', result.rows[0].version.split(' ')[1]);
            
            await pool.end();
            return config;
            
        } catch (error) {
            console.log('❌ Connection failed:', error.message);
        }
    }
    
    console.log('\n❌ All connection attempts failed');
    return null;
}

async function testBasicQueries() {
    console.log('\n🔍 Testing basic queries...');
    
    const { db } = require('./connection');
    
    try {
        // Test connection
        const timeResult = await db.get('SELECT NOW() as current_time');
        console.log('✅ Basic query successful:', timeResult.current_time);
        
        // Test table counts
        const tables = ['users', 'tracks', 'artists', 'playlists'];
        for (const table of tables) {
            try {
                const count = await db.get(`SELECT COUNT(*) as count FROM ${table}`);
                console.log(`📊 ${table}: ${count.count} records`);
            } catch (err) {
                console.log(`❌ ${table}: ${err.message}`);
            }
        }
        
    } catch (error) {
        console.error('❌ Query test failed:', error.message);
    }
}

if (require.main === module) {
    (async () => {
        const workingConfig = await testConnection();
        
        if (workingConfig) {
            console.log('\n🎉 Found working configuration!');
            await testBasicQueries();
        } else {
            console.log('\n💡 Suggestions:');
            console.log('1. Check if your database server is running');
            console.log('2. Verify your connection parameters in .env file');
            console.log('3. For Render PostgreSQL, use the connection string from Render dashboard');
            console.log('4. Try setting DB_SSL=false in your .env file');
            console.log('5. Make sure your IP is whitelisted if using cloud database');
        }
        
        process.exit(0);
    })();
}

module.exports = { testConnection };
