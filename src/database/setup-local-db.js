// Setup Local PostgreSQL Database
require('dotenv').config();
const { Pool } = require('pg');

async function setupDatabase() {
    console.log('🔧 Setting up JUKE database...');
    
    // First connect to postgres database to create our database
    try {
        const adminPool = new Pool({
            user: 'postgres', // Default postgres superuser
            host: process.env.DB_HOST || 'localhost',
            database: 'postgres', // Default postgres database
            password: process.env.POSTGRES_PASSWORD || 'postgres', // Default postgres password
            port: process.env.DB_PORT || 5432,
            ssl: false
        });
        
        console.log('🔍 Connecting to PostgreSQL as admin...');
        
        // Create database if it doesn't exist
        await adminPool.query(`CREATE DATABASE juke_db`);
        console.log('✅ Database juke_db created');
        
        // Create user if it doesn't exist
        await adminPool.query(`CREATE USER juke_user WITH PASSWORD 'juke_password'`);
        console.log('✅ User juke_user created');
        
        // Grant privileges
        await adminPool.query(`GRANT ALL PRIVILEGES ON DATABASE juke_db TO juke_user`);
        console.log('✅ Privileges granted');
        
        await adminPool.end();
        
    } catch (error) {
        if (error.message.includes('already exists')) {
            console.log('ℹ️  Database and user already exist');
        } else {
            console.error('❌ Setup error:', error.message);
            console.log('\n💡 Try running this with PostgreSQL admin privileges');
            console.log('   Or use psql: CREATE DATABASE juke_db; CREATE USER juke_user WITH PASSWORD \'juke_password\';');
            return;
        }
    }
    
    // Now connect to our database and create tables
    try {
        const userPool = new Pool({
            user: 'juke_user',
            host: process.env.DB_HOST || 'localhost',
            database: 'juke_db',
            password: 'juke_password',
            port: process.env.DB_PORT || 5432,
            ssl: false
        });
        
        console.log('🔍 Connecting to juke_db...');
        
        // Read and execute schema
        const fs = require('fs');
        const schema = fs.readFileSync('./schema.sql', 'utf8');
        
        await userPool.query(schema);
        console.log('✅ Schema created successfully');
        
        // Test basic queries
        const result = await userPool.query('SELECT COUNT(*) as count FROM users');
        console.log(`📊 Users table: ${result.rows[0].count} records`);
        
        await userPool.end();
        
        console.log('\n🎉 Database setup complete!');
        console.log('\n📝 Update your .env file with:');
        console.log('DB_HOST=localhost');
        console.log('DB_NAME=juke_db');
        console.log('DB_USER=juke_user');
        console.log('DB_PASSWORD=juke_password');
        console.log('DB_PORT=5432');
        console.log('DB_SSL=false');
        
    } catch (error) {
        console.error('❌ Schema creation error:', error.message);
    }
}

async function checkPostgresStatus() {
    console.log('🔍 Checking PostgreSQL status...');
    
    try {
        // Try to connect to default postgres database
        const pool = new Pool({
            user: 'postgres',
            host: 'localhost',
            database: 'postgres',
            password: 'postgres',
            port: 5432,
            ssl: false,
            connectionTimeoutMillis: 3000
        });
        
        const result = await pool.query('SELECT version()');
        console.log('✅ PostgreSQL is running');
        console.log('📋 Version:', result.rows[0].version.split(',')[0]);
        
        await pool.end();
        return true;
        
    } catch (error) {
        console.log('❌ PostgreSQL connection failed:', error.message);
        console.log('\n💡 Make sure PostgreSQL is installed and running:');
        console.log('   Windows: Check Services for "postgresql-x64-14"');
        console.log('   Or install from: https://www.postgresql.org/download/windows/');
        return false;
    }
}

if (require.main === module) {
    const command = process.argv[2];
    
    if (command === 'check') {
        checkPostgresStatus().then(isRunning => {
            if (isRunning) {
                console.log('\n🚀 PostgreSQL is ready! Run "node setup-local-db.js setup" to create the database.');
            }
            process.exit(0);
        });
    } else if (command === 'setup') {
        checkPostgresStatus().then(isRunning => {
            if (isRunning) {
                setupDatabase();
            } else {
                console.log('\n❌ Please install and start PostgreSQL first');
            }
            process.exit(0);
        });
    } else {
        console.log('🔧 JUKE Database Setup Tool');
        console.log('Usage:');
        console.log('  node setup-local-db.js check  - Check if PostgreSQL is running');
        console.log('  node setup-local-db.js setup  - Create database and tables');
    }
}

module.exports = { setupDatabase, checkPostgresStatus };
