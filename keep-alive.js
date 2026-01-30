// Keep-alive endpoint for Render PostgreSQL
const express = require('express');
const { db } = require('./database/connection');

const app = express();

app.get('/keep-alive', async (req, res) => {
    try {
        await db.query('SELECT 1');
        res.json({ status: 'Database is alive', timestamp: new Date().toISOString() });
    } catch (error) {
        res.status(500).json({ status: 'Database error', error: error.message });
    }
});

app.get('/health', (req, res) => {
    res.json({ status: 'OK', service: 'JUKE Keep-Alive' });
});

const PORT = process.env.KEEP_ALIVE_PORT || 3001;
app.listen(PORT, () => {
    console.log(`Keep-alive service running on port ${PORT}`);
});
