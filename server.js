require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('./database/connection');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key_here';

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

app.use('/uploads', express.static(uploadsDir));

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname) || '';
        cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 }
});

// Update your initializeDatabase function in server.js
async function initializeDatabase() {
    try {
        console.log('Starting database initialization...');

        // Create tables with IF NOT EXISTS
        const schema = `
            CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

            CREATE TABLE IF NOT EXISTS users (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                username VARCHAR(50) UNIQUE NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                first_name VARCHAR(100),
                last_name VARCHAR(100),
                avatar_url VARCHAR(500),
                bio TEXT,
                subscription_tier VARCHAR(20) DEFAULT 'free',
                is_active BOOLEAN DEFAULT true,
                email_verified BOOLEAN DEFAULT false,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS artists (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                name VARCHAR(200) NOT NULL,
                bio TEXT,
                verified BOOLEAN DEFAULT false,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS albums (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                title VARCHAR(200) NOT NULL,
                artist_id UUID NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
                release_date DATE,
                cover_image_url VARCHAR(500),
                description TEXT,
                genre VARCHAR(100),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS tracks (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                title VARCHAR(200) NOT NULL,
                uploader_id UUID REFERENCES users(id) ON DELETE SET NULL,
                artist_id UUID NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
                album_id UUID REFERENCES albums(id) ON DELETE SET NULL,
                cover_image_url VARCHAR(500),
                file_path VARCHAR(500) NOT NULL,
                file_size BIGINT,
                duration_seconds INTEGER NOT NULL DEFAULT 0,
                bitrate INTEGER,
                sample_rate INTEGER,
                track_number INTEGER,
                genre VARCHAR(100),
                lyrics TEXT,
                metadata JSONB,
                play_count INTEGER DEFAULT 0,
                like_count INTEGER DEFAULT 0,
                is_explicit BOOLEAN DEFAULT false,
                is_available BOOLEAN DEFAULT true,
                release_date DATE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS playlists (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                name VARCHAR(200) NOT NULL,
                description TEXT,
                cover_image_url VARCHAR(500),
                is_public BOOLEAN DEFAULT false,
                track_count INTEGER DEFAULT 0,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS playlist_tracks (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                playlist_id UUID NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
                track_id UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
                added_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                position INTEGER,
                UNIQUE(playlist_id, track_id)
            );

            CREATE TABLE IF NOT EXISTS user_favorites (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                track_id UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, track_id)
            );
        `;

        await db.query(schema);

        await db.query('ALTER TABLE tracks ADD COLUMN IF NOT EXISTS uploader_id UUID REFERENCES users(id) ON DELETE SET NULL');
        await db.query('ALTER TABLE tracks ADD COLUMN IF NOT EXISTS cover_image_url VARCHAR(500)');
        console.log('Database schema initialized');

    } catch (error) {
        console.error('Database initialization error:', error);
    }
}

// JUKE Music Streaming Platform API Server v2
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid token' });
        }
        req.user = user;
        next();
    });
};

// Helper function to generate JWT
const generateToken = (user) => {
    return jwt.sign(
        {
            id: user.id,
            username: user.username,
            email: user.email
        },
        JWT_SECRET,
        { expiresIn: '24h' }
    );
};

// ==================== AUTHENTICATION ENDPOINTS ====================

// Register new user
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, email, password, firstName, lastName } = req.body;

        // Validate input
        if (!username || !email || !password) {
            return res.status(400).json({ error: 'Username, email, and password are required' });
        }

        // Check if user already exists
        const existingUser = await db.get(
            'SELECT id FROM users WHERE username = $1 OR email = $2',
            [username, email]
        );

        if (existingUser) {
            return res.status(409).json({ error: 'Username or email already exists' });
        }

        // Hash password
        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        // Create user
        const newUser = await db.insert('users', {
            username,
            email,
            password_hash: passwordHash,
            first_name: firstName,
            last_name: lastName
        });

        // Generate token
        const token = generateToken(newUser);

        res.status(201).json({
            message: 'User registered successfully',
            user: {
                id: newUser.id,
                username: newUser.username,
                email: newUser.email,
                firstName: newUser.first_name,
                lastName: newUser.last_name
            },
            token
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Login user
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        // Find user
        const user = await db.get(
            'SELECT id, username, email, password_hash, first_name, last_name FROM users WHERE username = $1 OR email = $1',
            [username]
        );

        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Verify password
        const isValidPassword = await bcrypt.compare(password, user.password_hash);

        if (!isValidPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Generate token
        const token = generateToken(user);

        res.json({
            message: 'Login successful',
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                firstName: user.first_name,
                lastName: user.last_name
            },
            token
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ==================== MUSIC ENDPOINTS ====================

// Get all artists
app.get('/api/artists', async (req, res) => {
    try {
        const artists = await db.getAll(`
            SELECT id, name, bio, image_url, verified 
            FROM artists 
            ORDER BY name
        `);
        res.json(artists);
    } catch (error) {
        console.error('Get artists error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get artist by ID
app.get('/api/artists/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const artist = await db.get(`
            SELECT id, name, bio, image_url, website_url, social_links, verified 
            FROM artists 
            WHERE id = $1
        `, [id]);

        if (!artist) {
            return res.status(404).json({ error: 'Artist not found' });
        }

        // Get artist's albums
        const albums = await db.getAll(`
            SELECT id, title, release_date, cover_image_url, genre 
            FROM albums 
            WHERE artist_id = $1 
            ORDER BY release_date DESC
        `, [id]);

        // Get artist's tracks
        const tracks = await db.getAll(`
            SELECT id, title, album_id, duration_seconds, track_number, genre, play_count 
            FROM tracks 
            WHERE artist_id = $1 
            ORDER BY album_id, track_number
        `, [id]);

        res.json({
            ...artist,
            albums,
            tracks
        });

    } catch (error) {
        console.error('Get artist error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get all tracks
app.get('/api/tracks', async (req, res) => {
    try {
        const { limit = 20, offset = 0, genre } = req.query;

        let query = `
            SELECT t.id, t.title, t.duration_seconds, t.track_number, t.genre, t.play_count, t.like_count,
                   t.uploader_id,
                   a.name as artist_name, al.title as album_title,
                   COALESCE(t.cover_image_url, al.cover_image_url) as cover_image_url
            FROM tracks t
            JOIN artists a ON t.artist_id = a.id
            LEFT JOIN albums al ON t.album_id = al.id
        `;

        const params = [];

        if (genre) {
            query += ' WHERE t.genre = $1';
            params.push(genre);
        }

        query += ' ORDER BY t.play_count DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
        params.push(limit, offset);

        const tracks = await db.getAll(query, params);
        res.json(tracks);

    } catch (error) {
        console.error('Get tracks error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get track by ID
app.get('/api/tracks/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const track = await db.get(`
            SELECT t.id, t.title, t.duration_seconds, t.track_number, t.genre, t.play_count, t.like_count,
                   t.lyrics, t.metadata, t.release_date,
                   a.name as artist_name, a.id as artist_id,
                   al.title as album_title, al.id as album_id, al.cover_image_url
            FROM tracks t
            JOIN artists a ON t.artist_id = a.id
            LEFT JOIN albums al ON t.album_id = al.id
            WHERE t.id = $1
        `, [id]);

        if (!track) {
            return res.status(404).json({ error: 'Track not found' });
        }

        res.json(track);

    } catch (error) {
        console.error('Get track error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get all albums
app.get('/api/albums', async (req, res) => {
    try {
        const albums = await db.getAll(`
            SELECT al.id, al.title, al.release_date, al.cover_image_url, al.genre, al.total_tracks, al.duration_seconds,
                   a.name as artist_name, a.id as artist_id
            FROM albums al
            JOIN artists a ON al.artist_id = a.id
            ORDER BY al.release_date DESC
        `);
        res.json(albums);
    } catch (error) {
        console.error('Get albums error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get album by ID with tracks
app.get('/api/albums/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const album = await db.get(`
            SELECT al.id, al.title, al.release_date, al.cover_image_url, al.genre, al.description, al.label,
                   a.name as artist_name, a.id as artist_id
            FROM albums al
            JOIN artists a ON al.artist_id = a.id
            WHERE al.id = $1
        `, [id]);

        if (!album) {
            return res.status(404).json({ error: 'Album not found' });
        }

        // Get album tracks
        const tracks = await db.getAll(`
            SELECT id, title, duration_seconds, track_number, genre, play_count
            FROM tracks
            WHERE album_id = $1
            ORDER BY track_number
        `, [id]);

        res.json({
            ...album,
            tracks
        });

    } catch (error) {
        console.error('Get album error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ==================== USER ENDPOINTS ====================

// Get user profile
app.get('/api/users/profile', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;

        const user = await db.get(`
            SELECT id, username, email, first_name, last_name, avatar_url, bio, subscription_tier, created_at
            FROM users
            WHERE id = $1
        `, [userId]);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Get user's favorite tracks
        const favorites = await db.getAll(`
            SELECT t.id, t.title, t.duration_seconds,
                   a.name as artist_name,
                   COALESCE(t.cover_image_url, al.cover_image_url) as cover_image_url
            FROM user_favorites uf
            JOIN tracks t ON uf.track_id = t.id
            JOIN artists a ON t.artist_id = a.id
            LEFT JOIN albums al ON t.album_id = al.id
            WHERE uf.user_id = $1
            ORDER BY uf.created_at DESC
        `, [userId]);

        // Get user's playlists
        const playlists = await db.getAll(`
            SELECT id, name, description, cover_image_url, is_public, track_count, created_at
            FROM playlists
            WHERE user_id = $1
            ORDER BY created_at DESC
        `, [userId]);

        res.json({
            ...user,
            favorites,
            playlists
        });

    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get my tracks
app.get('/api/tracks/my', authenticateToken, async (req, res) => {
    try {
        const { limit = 50, offset = 0 } = req.query;
        const userId = req.user.id;

        const tracks = await db.getAll(`
            SELECT t.id, t.title, t.duration_seconds, t.track_number, t.genre, t.play_count, t.like_count,
                   t.uploader_id,
                   a.name as artist_name, al.title as album_title,
                   COALESCE(t.cover_image_url, al.cover_image_url) as cover_image_url
            FROM tracks t
            JOIN artists a ON t.artist_id = a.id
            LEFT JOIN albums al ON t.album_id = al.id
            WHERE t.uploader_id = $1
            ORDER BY t.created_at DESC
            LIMIT $2 OFFSET $3
        `, [userId, limit, offset]);

        res.json(tracks);
    } catch (error) {
        console.error('Get my tracks error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ==================== SEARCH ENDPOINTS ====================

// Search for music
app.get('/api/search', async (req, res) => {
    try {
        const { q, type = 'all', limit = 20 } = req.query;

        if (!q) {
            return res.status(400).json({ error: 'Search query is required' });
        }

        const searchTerm = `%${q}%`;
        const results = {};

        if (type === 'all' || type === 'tracks') {
            results.tracks = await db.getAll(`
                SELECT t.id, t.title, t.duration_seconds,
                       a.name as artist_name, al.title as album_title, al.cover_image_url
                FROM tracks t
                JOIN artists a ON t.artist_id = a.id
                LEFT JOIN albums al ON t.album_id = al.id
                WHERE t.title ILIKE $1 OR a.name ILIKE $1
                ORDER BY t.play_count DESC
                LIMIT $2
            `, [searchTerm, limit]);
        }

        if (type === 'all' || type === 'artists') {
            results.artists = await db.getAll(`
                SELECT id, name, image_url, verified
                FROM artists
                WHERE name ILIKE $1
                ORDER BY verified DESC, name
                LIMIT $2
            `, [searchTerm, limit]);
        }

        if (type === 'all' || type === 'albums') {
            results.albums = await db.getAll(`
                SELECT al.id, al.title, al.release_date, al.cover_image_url,
                       a.name as artist_name
                FROM albums al
                JOIN artists a ON al.artist_id = a.id
                WHERE al.title ILIKE $1 OR a.name ILIKE $1
                ORDER BY al.release_date DESC
                LIMIT $2
            `, [searchTerm, limit]);
        }

        res.json(results);

    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ==================== UPLOAD ENDPOINT ====================

app.post('/api/upload', authenticateToken, upload.fields([{ name: 'audioFile', maxCount: 1 }, { name: 'coverImage', maxCount: 1 }]), async (req, res) => {
    try {
        const { title, artist, genre } = req.body;
        const file = req.files && req.files.audioFile ? req.files.audioFile[0] : null;
        const cover = req.files && req.files.coverImage ? req.files.coverImage[0] : null;
        const userId = req.user.id;

        if (!file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        // Get or create artist first
        let artistResult = await db.query(
            'SELECT id FROM artists WHERE name = $1',
            [artist]
        );

        let artistId;
        if (artistResult.rows.length === 0) {
            // Create new artist
            const newArtist = await db.insert('artists', {
                name: artist,
                bio: 'Uploaded via JUKE platform',
                verified: false
            });
            artistId = newArtist.id;
        } else {
            artistId = artistResult.rows[0].id;
        }

        const result = await db.insert('tracks', {
            title,
            uploader_id: userId,
            artist_id: artistId,
            album_id: null,
            genre,
            file_path: file.path,
            cover_image_url: cover ? `/uploads/${path.basename(cover.path)}` : null,
            duration_seconds: 0,
            release_date: new Date().toISOString().split('T')[0],
            is_available: true
        });

        res.json({ success: true, track: result });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Upload failed' });
    }
});

// Get curated playlists
app.get('/api/playlists/curated', async (req, res) => {
    try {
        const { limit = 20, offset = 0 } = req.query;

        const playlists = await db.getAll(`
            SELECT p.id, p.name, p.description, p.cover_image_url, p.is_public, p.track_count, p.created_at,
                   u.username as owner_username
            FROM playlists p
            JOIN users u ON p.user_id = u.id
            WHERE p.is_public = true
            ORDER BY p.created_at DESC
            LIMIT $1 OFFSET $2
        `, [limit, offset]);

        res.json(playlists);
    } catch (error) {
        console.error('Get curated playlists error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Like track
app.post('/api/tracks/:id/like', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { id: trackId } = req.params;

        const existing = await db.get(
            'SELECT id FROM user_favorites WHERE user_id = $1 AND track_id = $2',
            [userId, trackId]
        );

        if (existing) {
            await db.query(
                'DELETE FROM user_favorites WHERE user_id = $1 AND track_id = $2',
                [userId, trackId]
            );
            await db.query(
                'UPDATE tracks SET like_count = GREATEST(like_count - 1, 0), updated_at = CURRENT_TIMESTAMP WHERE id = $1',
                [trackId]
            );
            res.json({ success: true, liked: false });
            return;
        }

        await db.query(
            'INSERT INTO user_favorites (user_id, track_id) VALUES ($1, $2) ON CONFLICT (user_id, track_id) DO NOTHING',
            [userId, trackId]
        );

        await db.query(
            'UPDATE tracks SET like_count = like_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
            [trackId]
        );

        res.json({ success: true, liked: true });
    } catch (error) {
        console.error('Like track error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Initialize database and start server
initializeDatabase().then(() => {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(` JUKE Music API Server running on port ${PORT}`);
        console.log(` API Base URL: http://localhost:${PORT}/api`);
    });
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('🛑 Shutting down server...');
    process.exit(0);
});