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

app.use(express.static(__dirname));

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
                is_admin BOOLEAN DEFAULT false,
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
                album VARCHAR(200) DEFAULT 'Single',
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
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS user_likes (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                liker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                liked_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `;

        await db.query(schema);

        await db.query('ALTER TABLE tracks ADD COLUMN IF NOT EXISTS uploader_id UUID REFERENCES users(id) ON DELETE SET NULL');
        await db.query('ALTER TABLE tracks ADD COLUMN IF NOT EXISTS cover_image_url VARCHAR(500)');
        await db.query('ALTER TABLE tracks ADD COLUMN IF NOT EXISTS audio_url VARCHAR(500)');
        await db.query("ALTER TABLE tracks ADD COLUMN IF NOT EXISTS album VARCHAR(200) DEFAULT 'Single'");
        await db.query('ALTER TABLE tracks ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP');
        await db.query('ALTER TABLE tracks ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP');

        await db.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false');

        await db.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1
                    FROM pg_constraint
                    WHERE conname = 'user_favorites_user_track_unique'
                ) THEN
                    ALTER TABLE user_favorites
                    ADD CONSTRAINT user_favorites_user_track_unique UNIQUE(user_id, track_id);
                END IF;
            END $$;
        `);

        await db.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1
                    FROM pg_constraint
                    WHERE conname = 'user_likes_unique'
                ) THEN
                    ALTER TABLE user_likes
                    ADD CONSTRAINT user_likes_unique UNIQUE(liker_id, liked_user_id);
                END IF;
            END $$;
        `);
        console.log('Database schema initialized');

    } catch (error) {
        console.error('Database initialization error:', error);
    }
}

async function ensureAdminUser() {
    try {
        const adminUsername = 'admin';
        const adminPassword = 'admin';
        const adminEmail = 'admin@juke.local';

        const existing = await db.get(
            'SELECT id FROM users WHERE username = $1',
            [adminUsername]
        );

        const passwordHash = await bcrypt.hash(adminPassword, 10);

        if (!existing) {
            await db.insert('users', {
                username: adminUsername,
                email: adminEmail,
                password_hash: passwordHash,
                first_name: 'Admin',
                last_name: 'User',
                is_admin: true
            });
            return;
        }

        await db.query(
            'UPDATE users SET is_admin = true, password_hash = $2 WHERE id = $1',
            [existing.id, passwordHash]
        );
    } catch (error) {
        console.error('Admin bootstrap error:', error);
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
            email: user.email,
            is_admin: !!(user && (user.is_admin || user.isAdmin))
        },
        JWT_SECRET,
        { expiresIn: '24h' }
    );
};

const isUuid = (value) => {
    return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
};

// ==================== AUTHENTICATION ENDPOINTS ====================

// Register new user
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, email, password, firstName, lastName } = req.body;

        const isAdmin = String(username || '').trim().toLowerCase() === 'admin' && String(password || '') === 'admin';

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
            last_name: lastName,
            is_admin: isAdmin
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
                lastName: newUser.last_name,
                isAdmin: !!(newUser.is_admin || isAdmin)
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
            'SELECT id, username, email, password_hash, first_name, last_name, is_admin FROM users WHERE username = $1 OR email = $1',
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
                lastName: user.last_name,
                isAdmin: !!user.is_admin
            },
            token
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/users/profile', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;

        const user = await db.get(
            'SELECT id, username, email, first_name, last_name, avatar_url, bio FROM users WHERE id = $1',
            [userId]
        );

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const playlists = await db.getAll(`
            SELECT id, name, description, cover_image_url, is_public, track_count, created_at
            FROM playlists
            WHERE user_id = $1
            ORDER BY created_at DESC
            LIMIT 50
        `, [userId]);

        const favorites = await db.getAll(`
            SELECT t.*, 
                   a.name as artist_name,
                   al.title as album_title,
                   al.cover_image_url as album_cover_image_url,
                   u.username as uploader_username
            FROM user_favorites uf
            JOIN tracks t ON uf.track_id = t.id
            JOIN artists a ON t.artist_id = a.id
            LEFT JOIN albums al ON t.album_id = al.id
            LEFT JOIN users u ON t.uploader_id = u.id
            WHERE uf.user_id = $1
            ORDER BY uf.created_at DESC
            LIMIT 100
        `, [userId]);

        const normalizedFavorites = favorites.map((t) => {
            const audioUrl = t.audio_url || (t.file_path ? `/uploads/${path.basename(t.file_path)}` : null);
            const coverUrl = t.cover_image_url || t.album_cover_image_url || null;
            const { file_path, album_cover_image_url, ...rest } = t;
            return { ...rest, audio_url: audioUrl, cover_image_url: coverUrl };
        });

        res.json({
            id: user.id,
            username: user.username,
            email: user.email,
            firstName: user.first_name,
            lastName: user.last_name,
            avatarUrl: user.avatar_url,
            bio: user.bio,
            playlists,
            favorites: normalizedFavorites
        });
    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/users/:id/summary', authenticateToken, async (req, res) => {
    try {
        const viewerId = req.user.id;
        const { id } = req.params;

        if (!isUuid(id)) {
            return res.status(400).json({ error: 'Invalid user ID' });
        }

        const user = await db.get(
            'SELECT id, username, avatar_url, bio FROM users WHERE id = $1',
            [id]
        );

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const likesCountRow = await db.get(
            'SELECT COUNT(*)::int as count FROM user_likes WHERE liked_user_id = $1',
            [id]
        );
        const likedByMeRow = await db.get(
            'SELECT 1 as yes FROM user_likes WHERE liker_id = $1 AND liked_user_id = $2',
            [viewerId, id]
        );

        res.json({
            id: user.id,
            username: user.username,
            avatar_url: user.avatar_url,
            bio: user.bio,
            likes_count: likesCountRow ? (likesCountRow.count || 0) : 0,
            liked_by_me: !!likedByMeRow
        });
    } catch (error) {
        console.error('Get user summary error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/users/:id/like', authenticateToken, async (req, res) => {
    try {
        const likerId = req.user.id;
        const { id: likedUserId } = req.params;

        if (!isUuid(likedUserId)) {
            return res.status(400).json({ error: 'Invalid user ID' });
        }
        if (String(likerId) === String(likedUserId)) {
            return res.status(400).json({ error: 'You cannot like yourself' });
        }

        const target = await db.get('SELECT id FROM users WHERE id = $1', [likedUserId]);
        if (!target) {
            return res.status(404).json({ error: 'User not found' });
        }

        const existing = await db.get(
            'SELECT id FROM user_likes WHERE liker_id = $1 AND liked_user_id = $2',
            [likerId, likedUserId]
        );

        if (existing) {
            await db.query(
                'DELETE FROM user_likes WHERE liker_id = $1 AND liked_user_id = $2',
                [likerId, likedUserId]
            );
        } else {
            await db.query(
                'INSERT INTO user_likes (liker_id, liked_user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
                [likerId, likedUserId]
            );
        }

        const likesCountRow = await db.get(
            'SELECT COUNT(*)::int as count FROM user_likes WHERE liked_user_id = $1',
            [likedUserId]
        );

        res.json({
            success: true,
            liked: !existing,
            likes_count: likesCountRow ? (likesCountRow.count || 0) : 0
        });
    } catch (error) {
        console.error('Toggle user like error:', error);
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
            SELECT t.*,
                   a.name as artist_name,
                   al.title as album_title,
                   al.cover_image_url as album_cover_image_url,
                   u.username as uploader_username
            FROM tracks t
            JOIN artists a ON t.artist_id = a.id
            LEFT JOIN albums al ON t.album_id = al.id
            LEFT JOIN users u ON t.uploader_id = u.id
        `;

        const params = [];

        if (genre) {
            query += ' WHERE t.genre = $1';
            params.push(genre);
        }

        query += ' ORDER BY t.play_count DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
        params.push(limit, offset);

        const tracks = await db.getAll(query, params);
        const normalized = tracks.map((t) => {
            const audioUrl = t.audio_url || (t.file_path ? `/uploads/${path.basename(t.file_path)}` : null);
            const coverUrl = t.cover_image_url || t.album_cover_image_url || null;
            const { file_path, album_cover_image_url, ...rest } = t;
            return { ...rest, audio_url: audioUrl, cover_image_url: coverUrl };
        });
        res.json(normalized);

    } catch (error) {
        console.error('Get tracks error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get my tracks
app.get('/api/tracks/my', authenticateToken, async (req, res) => {

    try {
        const { limit = 50, offset = 0 } = req.query;

        const limitNum = Math.max(1, Math.min(parseInt(limit, 10) || 50, 200));
        const offsetNum = Math.max(0, parseInt(offset, 10) || 0);
        const userId = req.user.id;

        const tracks = await db.getAll(`
            SELECT t.*,
                   a.name as artist_name,
                   al.title as album_title,
                   al.cover_image_url as album_cover_image_url,
                   u.username as uploader_username
            FROM tracks t
            JOIN artists a ON t.artist_id = a.id
            LEFT JOIN albums al ON t.album_id = al.id
            LEFT JOIN users u ON t.uploader_id = u.id
            WHERE t.uploader_id = $1
            ORDER BY t.id DESC
            LIMIT $2 OFFSET $3
        `, [userId, limitNum, offsetNum]);

        const normalized = tracks.map((t) => {
            const audioUrl = t.audio_url || (t.file_path ? `/uploads/${path.basename(t.file_path)}` : null);
            const coverUrl = t.cover_image_url || t.album_cover_image_url || null;
            const { file_path, album_cover_image_url, ...rest } = t;
            return { ...rest, audio_url: audioUrl, cover_image_url: coverUrl };
        });

        res.json(normalized);
    } catch (error) {
        console.error('Get my tracks error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get tracks by uploader
app.get('/api/tracks/user/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        if (!isUuid(id)) {
            return res.status(400).json({ error: 'Invalid user ID' });
        }

        const tracks = await db.getAll(`
            SELECT t.*, 
                   a.name as artist_name,
                   al.title as album_title,
                   al.cover_image_url as album_cover_image_url,
                   u.username as uploader_username
            FROM tracks t
            JOIN artists a ON t.artist_id = a.id
            LEFT JOIN albums al ON t.album_id = al.id
            LEFT JOIN users u ON t.uploader_id = u.id
            WHERE t.uploader_id = $1
            ORDER BY t.id DESC
            LIMIT 200
        `, [id]);

        const normalized = tracks.map((t) => {
            const audioUrl = t.audio_url || (t.file_path ? `/uploads/${path.basename(t.file_path)}` : null);
            const coverUrl = t.cover_image_url || t.album_cover_image_url || null;
            const { file_path, album_cover_image_url, ...rest } = t;
            return { ...rest, audio_url: audioUrl, cover_image_url: coverUrl };
        });

        res.json(normalized);
    } catch (error) {
        console.error('Get user tracks error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get track by ID
app.get('/api/tracks/:id', async (req, res) => {

    try {
        const { id } = req.params;

        if (!isUuid(id)) {
            return res.status(400).json({ error: 'Invalid track ID' });
        }

        const track = await db.get(`
            SELECT t.*,
                   a.name as artist_name, a.id as artist_id,
                   al.title as album_title, al.id as album_id,
                   al.cover_image_url as album_cover_image_url,
                   u.username as uploader_username
            FROM tracks t
            JOIN artists a ON t.artist_id = a.id
            LEFT JOIN albums al ON t.album_id = al.id
            LEFT JOIN users u ON t.uploader_id = u.id
            WHERE t.id = $1
        `, [id]);

        if (!track) {
            return res.status(404).json({ error: 'Track not found' });
        }

        const audioUrl = track.audio_url || (track.file_path ? `/uploads/${path.basename(track.file_path)}` : null);
        const coverUrl = track.cover_image_url || track.album_cover_image_url || null;
        const { file_path, album_cover_image_url, ...rest } = track;
        res.json({ ...rest, audio_url: audioUrl, cover_image_url: coverUrl });

    } catch (error) {
        console.error('Get track error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

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
        const rawAlbum = (req.body && typeof req.body.album === 'string') ? req.body.album : '';
        const albumTitle = (rawAlbum || '').trim() || 'Single';
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

        // Create/find album row (optional) and store both album_id + plain album title.
        // We keep the string column as the authoritative display value.
        let albumId = null;
        if (albumTitle && albumTitle !== 'Single') {
            const albumExisting = await db.get(
                'SELECT id FROM albums WHERE title = $1 AND artist_id = $2',
                [albumTitle, artistId]
            );
            if (albumExisting && albumExisting.id) {
                albumId = albumExisting.id;
            } else {
                const newAlbum = await db.insert('albums', {
                    title: albumTitle,
                    artist_id: artistId,
                    release_date: new Date().toISOString().split('T')[0],
                    cover_image_url: cover ? `/uploads/${path.basename(cover.path)}` : null,
                    genre: genre || null
                });
                albumId = newAlbum.id;
            }
        }

        const result = await db.insert('tracks', {
            title,
            uploader_id: userId,
            artist_id: artistId,
            album_id: albumId,
            album: albumTitle,
            genre,
            file_path: file.path,
            audio_url: `/uploads/${path.basename(file.path)}`,
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

app.get('/api/playlists/my', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const playlists = await db.getAll(`
            SELECT id, name, description, cover_image_url, is_public, track_count, created_at
            FROM playlists
            WHERE user_id = $1
            ORDER BY created_at DESC
            LIMIT 200
        `, [userId]);
        res.json(playlists);
    } catch (error) {
        console.error('Get my playlists error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/playlists', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const rawName = req.body && typeof req.body.name === 'string' ? req.body.name : '';
        const name = rawName.trim();
        const description = req.body && typeof req.body.description === 'string' ? req.body.description : null;
        const isPublic = !!(req.body && req.body.is_public);

        if (!name) {
            return res.status(400).json({ error: 'Playlist name is required' });
        }

        const created = await db.insert('playlists', {
            user_id: userId,
            name,
            description,
            is_public: isPublic,
            track_count: 0
        });

        res.status(201).json(created);
    } catch (error) {
        console.error('Create playlist error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/playlists/:id/tracks', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const playlistId = req.params.id;
        const trackId = req.body && typeof req.body.track_id === 'string' ? req.body.track_id : '';

        if (!isUuid(playlistId)) {
            return res.status(400).json({ error: 'Invalid playlist ID' });
        }
        if (!isUuid(trackId)) {
            return res.status(400).json({ error: 'Invalid track ID' });
        }

        const playlist = await db.get('SELECT id, user_id FROM playlists WHERE id = $1', [playlistId]);
        if (!playlist) {
            return res.status(404).json({ error: 'Playlist not found' });
        }
        if (!playlist.user_id || String(playlist.user_id) !== String(userId)) {
            return res.status(403).json({ error: 'Not allowed' });
        }

        const track = await db.get('SELECT id FROM tracks WHERE id = $1', [trackId]);
        if (!track) {
            return res.status(404).json({ error: 'Track not found' });
        }

        const inserted = await db.get(`
            WITH next_pos AS (
                SELECT COALESCE(MAX(position), 0) + 1 AS pos
                FROM playlist_tracks
                WHERE playlist_id = $1
            ),
            ins AS (
                INSERT INTO playlist_tracks (playlist_id, track_id, position)
                SELECT $1, $2, (SELECT pos FROM next_pos)
                WHERE NOT EXISTS (
                    SELECT 1 FROM playlist_tracks WHERE playlist_id = $1 AND track_id = $2
                )
                RETURNING id
            )
            SELECT id FROM ins
        `, [playlistId, trackId]);

        if (inserted && inserted.id) {
            await db.query(
                'UPDATE playlists SET track_count = (SELECT COUNT(*) FROM playlist_tracks WHERE playlist_id = $1), updated_at = CURRENT_TIMESTAMP WHERE id = $1',
                [playlistId]
            );
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Add track to playlist error:', error);
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
            'INSERT INTO user_favorites (user_id, track_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
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

app.delete('/api/tracks/:id', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const isAdmin = !!(req.user && req.user.is_admin);
        const { id: trackId } = req.params;

        const track = await db.get(
            'SELECT id, uploader_id, file_path, cover_image_url FROM tracks WHERE id = $1',
            [trackId]
        );

        if (!track) {
            return res.status(404).json({ error: 'Track not found' });
        }

        if (!isAdmin && (!track.uploader_id || String(track.uploader_id) !== String(userId))) {
            return res.status(403).json({ error: 'Not allowed' });
        }

        await db.query('DELETE FROM tracks WHERE id = $1', [trackId]);

        const candidates = [track.file_path, track.cover_image_url]
            .filter(Boolean)
            .map((p) => String(p));

        candidates.forEach((p) => {
            try {
                const filename = path.basename(p);
                const abs = path.join(uploadsDir, filename);
                if (abs.startsWith(uploadsDir) && fs.existsSync(abs)) {
                    fs.unlinkSync(abs);
                }
            } catch (_) {
            }
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Delete track error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Initialize database and start server
initializeDatabase().then(async () => {
    await ensureAdminUser();
    app.listen(PORT, '0.0.0.0', () => {
        console.log(` JUKE Music API Server running on port ${PORT}`);
        console.log(` API Base URL: http://localhost:${PORT}/api`);
    });
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log(' Shutting down server...');
    console.log('🛑 Shutting down server...');
    process.exit(0);
});