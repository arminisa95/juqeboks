require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { db } = require('./connection');

async function setupDatabase() {
    try {
        console.log('Testing database connection...');
        
        // Test connection
        const result = await db.query('SELECT NOW()');
        console.log('Database connected successfully:', result.rows[0]);
        
        // Check if tables exist
        const tables = await db.getAll(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
        `);
        
        console.log('Tables found:', tables.map(t => t.table_name));
        
        // Get sample data count
        const artistCount = await db.get('SELECT COUNT(*) as count FROM artists');
        const trackCount = await db.get('SELECT COUNT(*) as count FROM tracks');
        const userCount = await db.get('SELECT COUNT(*) as count FROM users');
        
        console.log('Artists:', artistCount.count);
        console.log('Tracks:', trackCount.count);
        console.log('Users:', userCount.count);
        
        console.log('Database setup verification complete!');
        
    } catch (error) {
        console.error('Database connection failed:', error);
        process.exit(1);
    } finally {
        process.exit(0);
    }
}

setupDatabase();