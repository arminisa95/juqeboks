// PostgreSQL Database Connection Configuration
const { Pool } = require('pg');

const isProduction = process.env.NODE_ENV === 'production';
const isLocalhost = !process.env.DB_HOST || process.env.DB_HOST === 'localhost';

// Database configuration
const config = {
    user: process.env.DB_USER || 'juke_user',
    host: process.env.DB_HOST ? (process.env.DB_HOST.includes('.oregon-postgres.render.com') ? process.env.DB_HOST : `${process.env.DB_HOST}.oregon-postgres.render.com`) : 'localhost',
    database: process.env.DB_NAME || 'juke_db',
    password: process.env.DB_PASSWORD || 'your_password_here',
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    ssl: isLocalhost ? false : (process.env.DB_SSL === 'false' ? false : {
        rejectUnauthorized: false
    }),
    max: 10,                          // Maximum pool size
    idleTimeoutMillis: 10000,         // Close idle clients after 10s
    connectionTimeoutMillis: 10000,   // Connection timeout
    acquireTimeoutMillis: 60000,      // Acquire timeout
    createTimeoutMillis: 30000,       // Create timeout
    destroyTimeoutMillis: 5000,       // Destroy timeout
    reapIntervalMillis: 1000,         // Reap interval
    createRetryIntervalMillis: 200    // Retry interval on connection issues
};

// Create connection pool
const pool = new Pool(config);

// Test database connection
pool.on('connect', () => {
    console.log('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
    process.exit(-1);
});

// Database query helper functions
const db = {
    // Execute a query with parameters
    query: async (text, params) => {
        const start = Date.now();
        try {
            const res = await pool.query(text, params);
            const duration = Date.now() - start;
            // Only log queries in development mode
            if (!isProduction) {
                console.log('Executed query', { text: text.substring(0, 100), duration, rows: res.rowCount });
            }
            return res;
        } catch (error) {
            console.error('Database query error', { text: text.substring(0, 200), error: error.message });
            throw error;
        }
    },

    // Get a single row
    get: async (text, params) => {
        const res = await db.query(text, params);
        return res.rows[0];
    },

    // Get multiple rows
    getAll: async (text, params) => {
        const res = await db.query(text, params);
        return res.rows;
    },

    // Insert data and return the inserted row
    insert: async (table, data) => {
        const keys = Object.keys(data);
        const values = Object.values(data);
        const placeholders = keys.map((_, index) => `$${index + 1}`).join(', ');
        
        const text = `
            INSERT INTO ${table} (${keys.join(', ')})
            VALUES (${placeholders})
            RETURNING *
        `;
        
        return await db.get(text, values);
    },

    // Update data and return the updated row
    update: async (table, id, data) => {
        const keys = Object.keys(data);
        const values = Object.values(data);
        const setClause = keys.map((key, index) => `${key} = $${index + 2}`).join(', ');
        
        const text = `
            UPDATE ${table}
            SET ${setClause}, updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
            RETURNING *
        `;
        
        return await db.get(text, [id, ...values]);
    },

    // Delete a row
    delete: async (table, id) => {
        const text = `DELETE FROM ${table} WHERE id = $1 RETURNING *`;
        return await db.get(text, [id]);
    },

    // Check if a record exists
    exists: async (table, field, value) => {
        const text = `SELECT 1 FROM ${table} WHERE ${field} = $1 LIMIT 1`;
        const res = await db.query(text, [value]);
        return res.rows.length > 0;
    },

    // Get count of records
    count: async (table, whereClause = '1=1', params = []) => {
        const text = `SELECT COUNT(*) FROM ${table} WHERE ${whereClause}`;
        const res = await db.query(text, params);
        return parseInt(res.rows[0].count);
    },

    // Begin a transaction
    transaction: async (callback) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const result = await callback(client);
            await client.query('COMMIT');
            return result;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }
};

// Close database connection pool
const close = async () => {
    await pool.end();
    console.log('Database connection pool closed');
};

module.exports = {
    pool,
    db,
    close
};
