require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('./database/connection');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const MonetizationService = require('./monetization/payment-integration');
const monetizationRoutes = require('./monetization/monetization-api-simple');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key_here';

const S3_BUCKET = process.env.S3_BUCKET || '';
const S3_REGION = process.env.S3_REGION || 'auto';
const S3_ENDPOINT = process.env.S3_ENDPOINT || '';
const S3_ACCESS_KEY_ID = process.env.S3_ACCESS_KEY_ID || '';
const S3_SECRET_ACCESS_KEY = process.env.S3_SECRET_ACCESS_KEY || '';
const S3_PUBLIC_BASE_URL = process.env.S3_PUBLIC_BASE_URL || '';

function getS3Client() {
    if (!S3_BUCKET || !S3_ENDPOINT || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) return null;
    return new S3Client({
        region: S3_REGION,
        endpoint: S3_ENDPOINT,
        forcePathStyle: true,
        credentials: {
            accessKeyId: S3_ACCESS_KEY_ID,
            secretAccessKey: S3_SECRET_ACCESS_KEY
        }
    });
}

function makePublicObjectUrl(key) {
    if (S3_PUBLIC_BASE_URL) return String(S3_PUBLIC_BASE_URL).replace(/\/$/, '') + '/' + key;
    return String(S3_ENDPOINT).replace(/\/$/, '') + '/' + S3_BUCKET + '/' + key;
}

function guessContentType(file) {
    try {
        if (file && file.mimetype) return file.mimetype;
    } catch (_) {
    }
    return 'application/octet-stream';
}

async function uploadFileToS3(client, file, keyPrefix) {
    const filename = path.basename(file.path || file.filename || 'file');
    const ext = path.extname(filename) || '';
    const key = (keyPrefix.replace(/\/$/, '') + '/' + Date.now() + '-' + Math.round(Math.random() * 1e9) + ext).replace(/^\//, '');
    const body = fs.readFileSync(file.path);

    await client.send(new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
        Body: body,
        ContentType: guessContentType(file)
    }));

    return { key, url: makePublicObjectUrl(key) };
}

async function deleteS3KeyIfAny(key) {
    if (!key) return;
    const client = getS3Client();
    if (!client) return;
    try {
        await client.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key }));
    } catch (e) {
        console.error('S3 delete failed:', e);
    }
}

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
                video_url VARCHAR(500),
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

            CREATE TABLE IF NOT EXISTS playlist_likes (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                playlist_id UUID NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS playlist_comments (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                playlist_id UUID NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                body TEXT NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS track_comments (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                track_id UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                body TEXT NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `;

        await db.query(schema);

        await db.query('ALTER TABLE tracks ADD COLUMN IF NOT EXISTS uploader_id UUID REFERENCES users(id) ON DELETE SET NULL');
        await db.query('ALTER TABLE tracks ADD COLUMN IF NOT EXISTS cover_image_url VARCHAR(500)');
        await db.query('ALTER TABLE tracks ADD COLUMN IF NOT EXISTS audio_url VARCHAR(500)');
        await db.query('ALTER TABLE tracks ADD COLUMN IF NOT EXISTS video_url VARCHAR(500)');
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

        await db.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1
                    FROM pg_constraint
                    WHERE conname = 'playlist_likes_unique'
                ) THEN
                    ALTER TABLE playlist_likes
                    ADD CONSTRAINT playlist_likes_unique UNIQUE(user_id, playlist_id);
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

// Change password
app.post('/api/auth/change-password', authenticateToken, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const userId = req.user.id;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Current password and new password are required' });
        }

        if (newPassword.length < 8) {
            return res.status(400).json({ error: 'New password must be at least 8 characters' });
        }

        // Get current user data
        const user = await db.get(
            'SELECT id, username, password_hash FROM users WHERE id = $1',
            [userId]
        );

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Verify current password
        const bcrypt = require('bcrypt');
        const isPasswordValid = await bcrypt.compare(currentPassword, user.password_hash);

        if (!isPasswordValid) {
            return res.status(401).json({ error: 'Current password is incorrect' });
        }

        // Hash new password
        const newPasswordHash = await bcrypt.hash(newPassword, 10);

        // Update password
        await db.query(
            'UPDATE users SET password_hash = $1 WHERE id = $2',
            [newPasswordHash, userId]
        );

        res.json({ message: 'Password changed successfully' });

    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Change username
app.post('/api/auth/change-username', authenticateToken, async (req, res) => {
    try {
        const { newUsername } = req.body;
        const userId = req.user.id;

        if (!newUsername) {
            return res.status(400).json({ error: 'New username is required' });
        }

        if (newUsername.length < 3) {
            return res.status(400).json({ error: 'Username must be at least 3 characters' });
        }

        // Check if username is already taken
        const existingUser = await db.get(
            'SELECT id FROM users WHERE username = $1 AND id != $2',
            [newUsername, userId]
        );

        if (existingUser) {
            return res.status(409).json({ error: 'Username is already taken' });
        }

        // Get current user data
        const user = await db.get(
            'SELECT id, username, email, first_name, last_name, avatar_url, bio FROM users WHERE id = $1',
            [userId]
        );

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Update username
        await db.query(
            'UPDATE users SET username = $1 WHERE id = $2',
            [newUsername, userId]
        );

        // Generate new token with updated username
        const jwt = require('jsonwebtoken');
        const newToken = jwt.sign(
            {
                id: user.id,
                username: newUsername,
                email: user.email,
                first_name: user.first_name,
                last_name: user.last_name,
                avatar_url: user.avatar_url,
                bio: user.bio,
                is_admin: !!(user && user.is_admin)
            },
            process.env.JWT_SECRET || 'your-secret-key',
            { expiresIn: '7d' }
        );

        res.json({ 
            message: 'Username changed successfully',
            token: newToken,
            user: {
                id: user.id,
                username: newUsername,
                email: user.email,
                firstName: user.first_name,
                lastName: user.last_name,
                avatarUrl: user.avatar_url,
                bio: user.bio
            }
        });

    } catch (error) {
        console.error('Change username error:', error);
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

app.put('/api/users/profile', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { username, first_name, last_name, bio, avatar_url } = req.body;

        // Get current user data
        const currentUser = await db.get(
            'SELECT id, username, email, first_name, last_name, avatar_url, bio FROM users WHERE id = $1',
            [userId]
        );

        if (!currentUser) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Update user profile
        const updatedUser = await db.query(
            'UPDATE users SET username = $1, first_name = $2, last_name = $3, bio = $4, avatar_url = $5 WHERE id = $6 RETURNING id, username, email, first_name, last_name, avatar_url, bio',
            [username || currentUser.username, first_name || currentUser.first_name, last_name || currentUser.last_name, bio || currentUser.bio, avatar_url || currentUser.avatar_url, userId]
        );

        if (updatedUser.rowCount === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = updatedUser.rows[0];

        // Generate new token with updated data
        const jwt = require('jsonwebtoken');
        const newToken = jwt.sign(
            {
                id: user.id,
                username: user.username,
                email: user.email,
                first_name: user.first_name,
                last_name: user.last_name,
                avatar_url: user.avatar_url,
                bio: user.bio,
                is_admin: !!(user && user.is_admin)
            },
            process.env.JWT_SECRET || 'your-secret-key',
            { expiresIn: '7d' }
        );

        res.json({
            message: 'Profile updated successfully',
            token: newToken,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                firstName: user.first_name,
                lastName: user.last_name,
                avatarUrl: user.avatar_url,
                bio: user.bio
            }
        });

    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.delete('/api/users/profile', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;

        // Start transaction
        await db.query('BEGIN');

        try {
            // Delete user's playlists
            await db.query('DELETE FROM playlists WHERE user_id = $1', [userId]);

            // Delete user's favorites
            await db.query('DELETE FROM user_favorites WHERE user_id = $1', [userId]);

            // Delete user's likes
            await db.query('DELETE FROM user_likes WHERE liker_id = $1 OR liked_user_id = $1', [userId]);

            // Delete user's tracks (this will cascade to track-related data)
            // First get all tracks uploaded by this user
            const userTracks = await db.getAll('SELECT id FROM tracks WHERE uploader_id = $1', [userId]);
            
            // Delete track-related data for each track
            for (const track of userTracks) {
                await db.query('DELETE FROM user_favorites WHERE track_id = $1', [track.id]);
                await db.query('DELETE FROM playlist_tracks WHERE track_id = $1', [track.id]);
                await db.query('DELETE FROM user_likes WHERE track_id = $1', [track.id]);
            }

            // Delete the tracks
            await db.query('DELETE FROM tracks WHERE uploader_id = $1', [userId]);

            // Delete user's subscription data (if monetization schema is available)
            try {
                await db.query('DELETE FROM user_subscriptions WHERE user_id = $1', [userId]);
                await db.query('DELETE FROM upload_credits WHERE user_id = $1', [userId]);
            } catch (error) {
                // Ignore if monetization tables don't exist
                console.log('Monetization tables not found, skipping...');
            }

            // Delete the user
            const result = await db.query('DELETE FROM users WHERE id = $1', [userId]);

            if (result.rowCount === 0) {
                await db.query('ROLLBACK');
                return res.status(404).json({ error: 'User not found' });
            }

            // Commit transaction
            await db.query('COMMIT');

            res.json({ message: 'Profile deleted successfully' });

        } catch (error) {
            await db.query('ROLLBACK');
            throw error;
        }

    } catch (error) {
        console.error('Delete profile error:', error);
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

// ==================== DATABASE MONITORING ENDPOINTS ====================

app.get('/api/database/stats', authenticateToken, async (req, res) => {
    try {
        const isAdmin = !!(req.user && req.user.is_admin);
        if (!isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }

        // Get table counts
        const tables = ['users', 'artists', 'albums', 'tracks', 'playlists', 'user_favorites', 'play_history'];
        const stats = {};
        
        for (const table of tables) {
            const result = await db.get(`SELECT COUNT(*) as count FROM ${table}`);
            stats[table] = parseInt(result.count);
        }

        // Get storage usage
        const storageResult = await db.get(`
            SELECT COALESCE(SUM(file_size), 0) as total_size 
            FROM tracks WHERE file_size IS NOT NULL
        `);

        // Get today's activity
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const playsToday = await db.get(`
            SELECT COUNT(*) as count FROM play_history 
            WHERE played_at >= $1
        `, [today]);

        // Get recent activity
        const recentActivity = await db.getAll(`
            SELECT 
                'New User' as type,
                username as description,
                created_at as timestamp
            FROM users 
            WHERE created_at >= NOW() - INTERVAL '7 days'
            ORDER BY created_at DESC 
            LIMIT 10
            
            UNION ALL
            
            SELECT 
                'New Track' as type,
                t.title || ' by ' || a.name as description,
                t.created_at as timestamp
            FROM tracks t
            JOIN artists a ON t.artist_id = a.id
            WHERE t.created_at >= NOW() - INTERVAL '7 days'
            ORDER BY timestamp DESC
            LIMIT 10
        `);

        // Get 7-day activity data
        const activityData = [];
        const activityLabels = [];
        
        for (let i = 6; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            date.setHours(0, 0, 0, 0);
            const nextDate = new Date(date);
            nextDate.setDate(nextDate.getDate() + 1);
            
            const newUsers = await db.get(`
                SELECT COUNT(*) as count FROM users 
                WHERE created_at >= $1 AND created_at < $2
            `, [date, nextDate]);
            
            const newTracks = await db.get(`
                SELECT COUNT(*) as count FROM tracks 
                WHERE created_at >= $1 AND created_at < $2
            `, [date, nextDate]);
            
            activityLabels.push(date.toLocaleDateString('en', { weekday: 'short' }));
            activityData.push({
                newUsers: parseInt(newUsers.count),
                newTracks: parseInt(newTracks.count)
            });
        }

        res.json({
            users: stats.users,
            tracks: stats.tracks,
            playlists: stats.playlists,
            artists: stats.artists,
            storageSize: parseInt(storageResult.total_size),
            playsToday: parseInt(playsToday.count),
            recentActivity,
            activityLabels,
            newUsersData: activityData.map(d => d.newUsers),
            newTracksData: activityData.map(d => d.newTracks)
        });

    } catch (error) {
        console.error('Database stats error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ==================== MUSIC ENDPOINTS ====================

app.get('/api/playlists/my', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const playlists = await db.getAll(`
            SELECT id, name, description, cover_image_url, is_public, track_count, created_at
            FROM playlists
            WHERE user_id = $1
            ORDER BY created_at DESC
            LIMIT 100
        `, [userId]);

        res.json(playlists || []);
    } catch (error) {
        console.error('Get my playlists error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/playlists', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const body = (req && req.body && typeof req.body === 'object') ? req.body : {};
        const name = (typeof body.name === 'string') ? body.name.trim() : '';
        const description = (typeof body.description === 'string') ? body.description.trim() : null;
        const isPublic = !!(body.is_public || body.isPublic);

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

        res.json(created);
    } catch (error) {
        console.error('Create playlist error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/playlists/curated', async (req, res) => {
    try {
        const curated = await db.getAll(`
            SELECT id, name, description, cover_image_url, is_public, track_count, created_at
            FROM playlists
            WHERE is_public = true
            ORDER BY track_count DESC, created_at DESC
            LIMIT 50
        `);
        res.json(curated || []);
    } catch (error) {
        console.error('Get curated playlists error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/playlists/public', async (req, res) => {
    try {
        const publicPlaylists = await db.getAll(`
            SELECT p.id, p.name, p.description, p.cover_image_url, p.is_public, p.track_count, p.created_at,
                   u.username as owner_username
            FROM playlists p
            LEFT JOIN users u ON p.user_id = u.id
            WHERE p.is_public = true
            ORDER BY p.created_at DESC
            LIMIT 200
        `);
        res.json(publicPlaylists || []);
    } catch (error) {
        console.error('Get public playlists error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/playlists/liked', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const playlists = await db.getAll(`
            SELECT p.id, p.name, p.description, p.cover_image_url, p.is_public, p.track_count, p.created_at,
                   u.username as owner_username
            FROM playlist_likes pl
            JOIN playlists p ON pl.playlist_id = p.id
            LEFT JOIN users u ON p.user_id = u.id
            WHERE pl.user_id = $1
            ORDER BY pl.created_at DESC
            LIMIT 100
        `, [userId]);
        res.json(playlists || []);
    } catch (error) {
        console.error('Get liked playlists error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/playlists/:id/like', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { id: playlistId } = req.params;

        if (!isUuid(playlistId)) {
            return res.status(400).json({ error: 'Invalid playlist ID' });
        }

        const playlist = await db.get('SELECT id, user_id, is_public FROM playlists WHERE id = $1', [playlistId]);
        if (!playlist) {
            return res.status(404).json({ error: 'Playlist not found' });
        }

        const canView = !!playlist.is_public || (playlist.user_id && String(playlist.user_id) === String(userId));
        if (!canView) {
            return res.status(403).json({ error: 'Not allowed' });
        }

        const existing = await db.get(
            'SELECT id FROM playlist_likes WHERE user_id = $1 AND playlist_id = $2',
            [userId, playlistId]
        );

        if (existing) {
            await db.query('DELETE FROM playlist_likes WHERE user_id = $1 AND playlist_id = $2', [userId, playlistId]);
        } else {
            await db.query('INSERT INTO playlist_likes (user_id, playlist_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, playlistId]);
        }

        const likeCountRow = await db.get(
            'SELECT COUNT(*)::int as count FROM playlist_likes WHERE playlist_id = $1',
            [playlistId]
        );

        res.json({
            success: true,
            liked: !existing,
            like_count: likeCountRow ? (likeCountRow.count || 0) : 0
        });
    } catch (error) {
        console.error('Like playlist error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/playlists/:id/comments', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { id: playlistId } = req.params;

        if (!isUuid(playlistId)) {
            return res.status(400).json({ error: 'Invalid playlist ID' });
        }

        const playlist = await db.get('SELECT id, user_id, is_public FROM playlists WHERE id = $1', [playlistId]);
        if (!playlist) {
            return res.status(404).json({ error: 'Playlist not found' });
        }

        const canView = !!playlist.is_public || (playlist.user_id && String(playlist.user_id) === String(userId));
        if (!canView) {
            return res.status(403).json({ error: 'Not allowed' });
        }

        const comments = await db.getAll(`
            SELECT pc.id, pc.playlist_id, pc.user_id, pc.body, pc.created_at,
                   u.username as username
            FROM playlist_comments pc
            LEFT JOIN users u ON pc.user_id = u.id
            WHERE pc.playlist_id = $1
            ORDER BY pc.created_at DESC
            LIMIT 100
        `, [playlistId]);
        res.json(comments || []);
    } catch (error) {
        console.error('Get playlist comments error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/playlists/:id/comments', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { id: playlistId } = req.params;
        const body = (req && req.body && typeof req.body === 'object') ? req.body : {};
        const text = (typeof body.body === 'string') ? body.body.trim() : '';

        if (!isUuid(playlistId)) {
            return res.status(400).json({ error: 'Invalid playlist ID' });
        }
        if (!text) {
            return res.status(400).json({ error: 'Comment is required' });
        }

        const playlist = await db.get('SELECT id, user_id, is_public FROM playlists WHERE id = $1', [playlistId]);
        if (!playlist) {
            return res.status(404).json({ error: 'Playlist not found' });
        }

        const canView = !!playlist.is_public || (playlist.user_id && String(playlist.user_id) === String(userId));
        if (!canView) {
            return res.status(403).json({ error: 'Not allowed' });
        }

        const created = await db.insert('playlist_comments', {
            playlist_id: playlistId,
            user_id: userId,
            body: text
        });
        res.json(created);
    } catch (error) {
        console.error('Create playlist comment error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.delete('/api/playlists/:id', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const isAdmin = !!(req.user && req.user.is_admin);
        const { id: playlistId } = req.params;

        if (!isUuid(playlistId)) {
            return res.status(400).json({ error: 'Invalid playlist ID' });
        }

        const playlist = await db.get('SELECT id, user_id FROM playlists WHERE id = $1', [playlistId]);
        if (!playlist) {
            return res.status(404).json({ error: 'Playlist not found' });
        }

        if (!isAdmin && (!playlist.user_id || String(playlist.user_id) !== String(userId))) {
            return res.status(403).json({ error: 'Not allowed' });
        }

        await db.query('DELETE FROM playlists WHERE id = $1', [playlistId]);
        res.json({ success: true });
    } catch (error) {
        console.error('Delete playlist error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/playlists/:id/tracks', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { id: playlistId } = req.params;
        const body = (req && req.body && typeof req.body === 'object') ? req.body : {};
        const trackId = body.track_id || body.trackId;

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

        const nextPosRow = await db.get(
            'SELECT COALESCE(MAX(position), 0)::int + 1 as pos FROM playlist_tracks WHERE playlist_id = $1',
            [playlistId]
        );
        const nextPos = nextPosRow && Number.isFinite(nextPosRow.pos) ? nextPosRow.pos : 1;

        await db.query(
            'INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
            [playlistId, trackId, nextPos]
        );

        const countRow = await db.get(
            'SELECT COUNT(*)::int as count FROM playlist_tracks WHERE playlist_id = $1',
            [playlistId]
        );
        const count = countRow ? (countRow.count || 0) : 0;
        await db.query('UPDATE playlists SET track_count = $2 WHERE id = $1', [playlistId, count]);

        res.json({ success: true, track_count: count });
    } catch (error) {
        console.error('Add track to playlist error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/playlists/:id/tracks', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { id: playlistId } = req.params;

        if (!isUuid(playlistId)) {
            return res.status(400).json({ error: 'Invalid playlist ID' });
        }

        const playlist = await db.get('SELECT id, user_id, is_public FROM playlists WHERE id = $1', [playlistId]);
        if (!playlist) {
            return res.status(404).json({ error: 'Playlist not found' });
        }

        const canView = !!playlist.is_public || (playlist.user_id && String(playlist.user_id) === String(userId));
        if (!canView) {
            return res.status(403).json({ error: 'Not allowed' });
        }

        const tracks = await db.getAll(`
            SELECT t.*, 
                   a.name as artist_name,
                   al.title as album_title,
                   al.cover_image_url as album_cover_image_url,
                   u.username as uploader_username
            FROM playlist_tracks pt
            JOIN tracks t ON pt.track_id = t.id
            JOIN artists a ON t.artist_id = a.id
            LEFT JOIN albums al ON t.album_id = al.id
            LEFT JOIN users u ON t.uploader_id = u.id
            WHERE pt.playlist_id = $1
            ORDER BY pt.id DESC
            LIMIT 500
        `, [playlistId]);

        const normalized = (tracks || []).map((t) => {
            const audioUrl = t.audio_url || (t.file_path ? `/uploads/${path.basename(t.file_path)}` : null);
            const coverUrl = t.cover_image_url || t.album_cover_image_url || null;
            const { file_path, album_cover_image_url, ...rest } = t;
            return { ...rest, audio_url: audioUrl, cover_image_url: coverUrl };
        });

        res.json(normalized);
    } catch (error) {
        console.error('Get playlist tracks error:', error);
        res.status(500).json({ error: 'Internal server error', detail: error && error.message ? String(error.message) : 'Unknown error' });
    }
});

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

// Get all tracks - optimiert mit Pagination und Total Count
app.get('/api/tracks', async (req, res) => {
    try {
        const { limit = 20, offset = 0, genre, sort = 'popular' } = req.query;

        // Validierung und Limits
        const limitNum = Math.max(1, Math.min(parseInt(limit, 10) || 20, 100));
        const offsetNum = Math.max(0, parseInt(offset, 10) || 0);

        // Basis-Query mit optimierten JOINs
        let query = `
            SELECT t.id, t.title, t.genre, t.duration_seconds, t.play_count, t.like_count,
                   t.cover_image_url, t.audio_url, t.file_path, t.created_at, t.uploader_id,
                   a.name as artist_name, a.id as artist_id,
                   al.title as album_title, al.cover_image_url as album_cover_image_url,
                   u.username as uploader_username
            FROM tracks t
            LEFT JOIN artists a ON t.artist_id = a.id
            LEFT JOIN albums al ON t.album_id = al.id
            LEFT JOIN users u ON t.uploader_id = u.id
            WHERE COALESCE(t.is_available, true) = true
        `;

        const params = [];
        let paramIndex = 1;

        // Genre Filter
        if (genre && genre.trim()) {
            query += ` AND LOWER(t.genre) = LOWER($${paramIndex})`;
            params.push(genre.trim());
            paramIndex++;
        }

        // Sortierung
        const sortOptions = {
            'popular': 'ORDER BY t.play_count DESC, t.created_at DESC',
            'newest': 'ORDER BY t.created_at DESC',
            'oldest': 'ORDER BY t.created_at ASC',
            'likes': 'ORDER BY t.like_count DESC, t.created_at DESC',
            'title': 'ORDER BY t.title ASC'
        };
        query += ` ${sortOptions[sort] || sortOptions['popular']}`;

        // Pagination
        query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(limitNum, offsetNum);

        const tracks = await db.getAll(query, params);

        // Total Count für Pagination (nur wenn offset = 0)
        let totalCount = null;
        if (offsetNum === 0) {
            let countQuery = `SELECT COUNT(*) as total FROM tracks t WHERE COALESCE(t.is_available, true) = true`;
            const countParams = [];
            if (genre && genre.trim()) {
                countQuery += ` AND LOWER(t.genre) = LOWER($1)`;
                countParams.push(genre.trim());
            }
            const countResult = await db.get(countQuery, countParams);
            totalCount = parseInt(countResult?.total || 0, 10);
        }

        // Normalisierung
        const normalized = (tracks || []).map((t) => {
            const audioUrl = t.audio_url || (t.file_path ? `/uploads/${path.basename(t.file_path)}` : null);
            const coverUrl = t.cover_image_url || t.album_cover_image_url || null;
            const { file_path, album_cover_image_url, ...rest } = t;
            return { ...rest, audio_url: audioUrl, cover_image_url: coverUrl };
        });

        // Strukturierte Response mit Pagination-Info
        res.json({
            tracks: normalized,
            pagination: {
                limit: limitNum,
                offset: offsetNum,
                count: normalized.length,
                total: totalCount,
                hasMore: normalized.length === limitNum
            }
        });

    } catch (error) {
        console.error('Get tracks error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get newest tracks
app.get('/api/tracks/new', async (req, res) => {
    try {
        const { limit = 20, offset = 0 } = req.query;

        const limitNum = Math.max(1, Math.min(parseInt(limit, 10) || 20, 100));
        const offsetNum = Math.max(0, parseInt(offset, 10) || 0);

        const tracks = await db.getAll(`
            SELECT t.*,
                   a.name as artist_name,
                   al.title as album_title,
                   al.cover_image_url as album_cover_image_url,
                   u.username as uploader_username
            FROM tracks t
            LEFT JOIN artists a ON t.artist_id = a.id
            LEFT JOIN albums al ON t.album_id = al.id
            LEFT JOIN users u ON t.uploader_id = u.id
            WHERE COALESCE(t.is_available, true) = true
            ORDER BY t.created_at DESC
            LIMIT $1 OFFSET $2
        `, [limitNum, offsetNum]);

        const normalized = (tracks || []).map((t) => {
            const audioUrl = t.audio_url || (t.file_path ? `/uploads/${path.basename(t.file_path)}` : null);
            const coverUrl = t.cover_image_url || t.album_cover_image_url || null;
            const { file_path, album_cover_image_url, ...rest } = t;
            return { ...rest, audio_url: audioUrl, cover_image_url: coverUrl };
        });

        res.json(normalized);
    } catch (error) {
        console.error('Get newest tracks error:', error);
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
            ORDER BY t.created_at DESC
            LIMIT $2 OFFSET $3
        `, [userId, limitNum, offsetNum]);

        const normalized = (tracks || []).map((t) => {
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
            ORDER BY t.created_at DESC
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

app.post('/api/tracks/:id/like', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { id: trackId } = req.params;

        if (!isUuid(trackId)) {
            return res.status(400).json({ error: 'Invalid track ID' });
        }

        const track = await db.get('SELECT id FROM tracks WHERE id = $1', [trackId]);
        if (!track) {
            return res.status(404).json({ error: 'Track not found' });
        }

        const existing = await db.get(
            'SELECT id FROM user_favorites WHERE user_id = $1 AND track_id = $2',
            [userId, trackId]
        );

        if (existing) {
            await db.query(
                'DELETE FROM user_favorites WHERE user_id = $1 AND track_id = $2',
                [userId, trackId]
            );
        } else {
            await db.query(
                'INSERT INTO user_favorites (user_id, track_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
                [userId, trackId]
            );
        }

        const likeCountRow = await db.get(
            'SELECT COUNT(*)::int as count FROM user_favorites WHERE track_id = $1',
            [trackId]
        );

        try {
            await db.query('UPDATE tracks SET like_count = $2 WHERE id = $1', [trackId, likeCountRow ? (likeCountRow.count || 0) : 0]);
        } catch (_) {
        }

        res.json({
            success: true,
            liked: !existing,
            like_count: likeCountRow ? (likeCountRow.count || 0) : 0
        });
    } catch (error) {
        console.error('Like track error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/tracks/:id/comments', authenticateToken, async (req, res) => {
    try {
        const { id: trackId } = req.params;

        if (!isUuid(trackId)) {
            return res.status(400).json({ error: 'Invalid track ID' });
        }

        const track = await db.get('SELECT id FROM tracks WHERE id = $1', [trackId]);
        if (!track) {
            return res.status(404).json({ error: 'Track not found' });
        }

        const comments = await db.getAll(`
            SELECT tc.id, tc.track_id, tc.user_id, tc.body, tc.created_at,
                   u.username as username
            FROM track_comments tc
            LEFT JOIN users u ON tc.user_id = u.id
            WHERE tc.track_id = $1
            ORDER BY tc.created_at DESC
            LIMIT 100
        `, [trackId]);

        res.json(comments || []);
    } catch (error) {
        console.error('Get track comments error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/tracks/:id/comments', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { id: trackId } = req.params;
        const body = (req && req.body && typeof req.body === 'object') ? req.body : {};
        const text = (typeof body.body === 'string') ? body.body.trim() : '';

        if (!isUuid(trackId)) {
            return res.status(400).json({ error: 'Invalid track ID' });
        }
        if (!text) {
            return res.status(400).json({ error: 'Comment is required' });
        }

        const track = await db.get('SELECT id FROM tracks WHERE id = $1', [trackId]);
        if (!track) {
            return res.status(404).json({ error: 'Track not found' });
        }

        const created = await db.insert('track_comments', {
            track_id: trackId,
            user_id: userId,
            body: text
        });

        res.json({
            ...(created || {}),
            username: (req.user && req.user.username) ? req.user.username : undefined
        });
    } catch (error) {
        console.error('Create track comment error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.delete('/api/tracks/:trackId/comments/:commentId', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const isAdmin = !!(req.user && req.user.is_admin);
        const { trackId, commentId } = req.params;

        if (!isUuid(trackId) || !isUuid(commentId)) {
            return res.status(400).json({ error: 'Invalid ID' });
        }

        const comment = await db.get(
            'SELECT id, user_id, track_id FROM track_comments WHERE id = $1 AND track_id = $2',
            [commentId, trackId]
        );

        if (!comment) {
            return res.status(404).json({ error: 'Comment not found' });
        }

        if (!isAdmin && (!comment.user_id || String(comment.user_id) !== String(userId))) {
            return res.status(403).json({ error: 'Not allowed' });
        }

        await db.query('DELETE FROM track_comments WHERE id = $1', [commentId]);
        res.json({ success: true });
    } catch (error) {
        console.error('Delete track comment error:', error);
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

// Upload Credits Check Middleware
async function checkUploadCredits(req, res, next) {
    try {
        let user;
        try {
            user = await db.get('SELECT subscription_tier FROM users WHERE id = $1', [req.user.id]);
        } catch (columnError) {
            if (columnError.message && columnError.message.includes('subscription_tier')) {
                console.log('subscription_tier column missing, treating user as free tier');
                user = { subscription_tier: 'free' };
            } else {
                throw columnError;
            }
        }
        
        // If user doesn't exist, return error
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Premium+ users have unlimited uploads
        if (user.subscription_tier !== 'free') {
            return next();
        }

        // Check free user credits
        let credits;
        try {
            credits = await db.get('SELECT credits FROM upload_credits WHERE user_id = $1', [req.user.id]);
        } catch (creditsError) {
            console.log('upload_credits table missing, allowing upload');
            return next();
        }
        
        // If no credits record exists, create one with 5 credits
        if (!credits) {
            try {
                await db.query('INSERT INTO upload_credits (user_id, credits) VALUES ($1, 5)', [req.user.id]);
            } catch (insertError) {
                console.log('Failed to create credits record, allowing upload');
            }
            return next();
        }
        
        if (credits.credits <= 0) {
            return res.status(402).json({ 
                success: false, 
                error: 'No upload credits remaining. Upgrade to Premium for unlimited uploads.',
                upgradeRequired: true,
                subscriptionUrl: '/html/subscription-plans.html'
            });
        }

        next();
    } catch (error) {
        console.error('Upload credits check error:', error);
        
        // Retry logic for connection timeouts
        if (error.message && (error.message.includes('timeout') || error.message.includes('terminated'))) {
            console.log('Retrying database connection...');
            try {
                const user = await db.get('SELECT subscription_tier FROM users WHERE id = $1', [req.user.id]);
                if (user && user.subscription_tier !== 'free') {
                    return next();
                }
                // Allow upload on connection issues for free users
                console.log('Allowing upload due to connection issues');
                return next();
            } catch (retryError) {
                console.error('Retry failed:', retryError);
            }
        }
        
        // If upload_credits table doesn't exist, create it and allow upload
        if (error.message && error.message.includes('upload_credits')) {
            try {
                await db.query(`
                CREATE TABLE IF NOT EXISTS upload_credits (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER,
                    credits INTEGER DEFAULT 5,
                    last_reset DATE DEFAULT CURRENT_DATE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )`);
                // Create credits for this user
                await db.query('INSERT INTO upload_credits (user_id, credits) VALUES ($1, 5)', [req.user.id]);
                return next();
            } catch (createError) {
                console.error('Failed to create upload_credits table:', createError);
            }
        }
        
        // Allow upload on any database error for now
        console.log('Allowing upload due to database error');
        return next();
    }
}

app.post('/api/upload', authenticateToken, checkUploadCredits, upload.fields([{ name: 'audioFile', maxCount: 1 }, { name: 'coverImage', maxCount: 1 }, { name: 'videoFile', maxCount: 1 }]), async (req, res) => {
    try {
        const { title, artist: artistRaw, genre } = req.body;
        const rawAlbum = (req.body && typeof req.body.album === 'string') ? req.body.album : '';
        const albumTitle = (rawAlbum || '').trim() || 'Single';
        const file = req.files && req.files.audioFile ? req.files.audioFile[0] : null;
        const cover = req.files && req.files.coverImage ? req.files.coverImage[0] : null;
        const video = req.files && req.files.videoFile ? req.files.videoFile[0] : null;
        const userId = req.user.id;

        const artist = (typeof artistRaw === 'string') ? artistRaw.trim() : '';
        const artistName = artist || (req.user && req.user.username ? String(req.user.username) : '');

        if (!file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        if (!artistName) {
            return res.status(400).json({ error: 'Artist is required' });
        }

        // Get or create artist first
        let artistResult = await db.query(
            'SELECT id FROM artists WHERE name = $1',
            [artistName]
        );

        let artistId;
        if (artistResult.rows.length === 0) {
            // Create new artist
            const newArtist = await db.insert('artists', {
                name: artistName,
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

        const s3 = getS3Client();
        let audioUrl = `/uploads/${path.basename(file.path)}`;
        let coverUrl = cover ? `/uploads/${path.basename(cover.path)}` : null;
        let videoUrl = video ? `/uploads/${path.basename(video.path)}` : null;
        let filePathValue = file.path;
        let metadata = {};

        if (s3) {
            const audioObj = await uploadFileToS3(s3, file, 'tracks/audio');
            audioUrl = audioObj.url;
            filePathValue = audioObj.key;
            metadata.storage = 's3';
            metadata.audio_key = audioObj.key;

            if (cover) {
                const coverObj = await uploadFileToS3(s3, cover, 'tracks/covers');
                coverUrl = coverObj.url;
                metadata.cover_key = coverObj.key;
            }

            if (video) {
                const videoObj = await uploadFileToS3(s3, video, 'tracks/videos');
                videoUrl = videoObj.url;
                metadata.video_key = videoObj.key;
            }

            try {
                if (file && file.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
            } catch (_) {
            }
            try {
                if (cover && cover.path && fs.existsSync(cover.path)) fs.unlinkSync(cover.path);
            } catch (_) {
            }
            try {
                if (video && video.path && fs.existsSync(video.path)) fs.unlinkSync(video.path);
            } catch (_) {
            }
        }

        const result = await db.insert('tracks', {
            title,
            uploader_id: userId,
            artist_id: artistId,
            album_id: albumId,
            album: albumTitle,
            genre,
            file_path: filePathValue,
            audio_url: audioUrl,
            cover_image_url: coverUrl,
            video_url: videoUrl,
            metadata,
            duration_seconds: 0,
            release_date: new Date().toISOString().split('T')[0],
            is_available: true
        });

        // Consume upload credit for free users
        const user = await db.get('SELECT subscription_tier FROM users WHERE id = $1', [userId]);
        if (user.subscription_tier === 'free') {
            await db.query('UPDATE upload_credits SET credits = credits - 1 WHERE user_id = $1', [userId]);
            
            // Log credit transaction
            await db.insert('credit_transactions', {
                user_id: userId,
                track_id: result.id,
                credits_spent: 1,
                transaction_type: 'upload',
                description: 'Track upload',
                created_at: new Date().toISOString()
            });
        }

        res.json({ success: true, track: result });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Upload failed' });
    }
});

// ... (rest of the code remains the same)

app.delete('/api/tracks/:id', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const isAdmin = !!(req.user && req.user.is_admin);
        const { id: trackId } = req.params;

        // Bessere Validierung
        if (!trackId || isNaN(Number(trackId))) {
            return res.status(400).json({ error: 'Invalid track ID' });
        }

        // Track mit allen Relationen abrufen
        const track = await db.get(`
            SELECT t.*, u.username as uploader_username 
            FROM tracks t 
            LEFT JOIN users u ON t.uploader_id = u.id 
            WHERE t.id = $1
        `, [trackId]);

        if (!track) {
            return res.status(404).json({ error: 'Track not found' });
        }

        // Bessere Berechtigungsprüfung
        if (!isAdmin && (!track.uploader_id || String(track.uploader_id) !== String(userId))) {
            return res.status(403).json({ 
                error: 'Not allowed',
                details: 'You can only delete your own tracks'
            });
        }

        // Kaskaden-Löschung mit Transaktion
        await db.query('BEGIN');

        try {
            // 1. Aus Playlists entfernen
            await db.query('DELETE FROM playlist_tracks WHERE track_id = $1', [trackId]);
            
            // 2. Aus Favoriten entfernen
            await db.query('DELETE FROM user_favorites WHERE track_id = $1', [trackId]);
            
            // 3. Likes entfernen
            await db.query('DELETE FROM likes WHERE track_id = $1', [trackId]);
            
            // 4. Kommentare entfernen (falls vorhanden)
            try {
                await db.query('DELETE FROM track_comments WHERE track_id = $1', [trackId]);
            } catch (_) {
                // Tabelle existiert nicht, ignorieren
            }
            
            // 5. Track selbst löschen
            await db.query('DELETE FROM tracks WHERE id = $1', [trackId]);
            
            await db.query('COMMIT');
            
        } catch (error) {
            await db.query('ROLLBACK');
            throw error;
        }

        try {
            const meta = track && track.metadata ? track.metadata : null;
            if (meta && typeof meta === 'object') {
                if (meta.audio_key) await deleteS3KeyIfAny(meta.audio_key);
                if (meta.cover_key) await deleteS3KeyIfAny(meta.cover_key);
                if (meta.video_key) await deleteS3KeyIfAny(meta.video_key);
            }
        } catch (_) {
        }

        const candidates = [track.file_path, track.cover_image_url, track.video_url]
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

        // Success Response mit Track-Info
        res.json({ 
            success: true, 
            message: 'Track deleted successfully',
            track: {
                id: track.id,
                title: track.title,
                uploader: track.uploader_username
            }
        });
    } catch (error) {
        console.error('Delete track error:', error);
        
        // Bessere Fehlerbehandlung
        if (error.message.includes('foreign key constraint')) {
            return res.status(500).json({ 
                error: 'Database constraint error',
                details: 'Failed to delete track due to database constraints'
            });
        }
        
        if (error.message.includes('timeout') || error.message.includes('connection')) {
            return res.status(503).json({ 
                error: 'Database error',
                details: 'Service temporarily unavailable'
            });
        }
        
        res.status(500).json({ 
            error: 'Internal server error',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Quick fix for subscription_tier column
app.post('/fix-subscription-tier', async (req, res) => {
    try {
        console.log('Adding subscription_tier column to users table...');
        await db.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_tier VARCHAR(20) DEFAULT \'free\'');
        console.log('subscription_tier column added successfully');
        
        // Update existing users to have 'free' tier
        await db.query('UPDATE users SET subscription_tier = \'free\' WHERE subscription_tier IS NULL');
        
        console.log('Existing users updated with free tier');
        
        res.json({ 
            success: true, 
            message: 'subscription_tier column added successfully' 
        });
    } catch (error) {
        console.error('Error adding subscription_tier column:', error);
        res.status(500).json({ error: error.message });
    }
});

// Admin password reset endpoint (temporary - remove after use)
app.post('/reset-admin-password', async (req, res) => {
    try {
        const bcrypt = require('bcryptjs');
        const hashedPassword = '$2b$10$ikNRGDbpARH31ryaTVCjD.IF.xZODMr9m6NhLcul1aZ/5LhTZh7CW';
        
        await db.query(
            'UPDATE users SET password_hash = $1 WHERE username = $2',
            [hashedPassword, 'admin']
        );
        
        res.json({ 
            success: true, 
            message: 'Admin password reset successfully!',
        });
    } catch (error) {
        console.error('Password reset error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Complete database setup endpoint (temporary - remove after use)
app.post('/complete-database-setup', async (req, res) => {
    try {
        // Drop and recreate all tables
        await db.query('DROP TABLE IF EXISTS credit_transactions CASCADE');
        await db.query('DROP TABLE IF EXISTS upload_credits CASCADE');
        await db.query('DROP TABLE IF EXISTS user_favorites CASCADE');
        await db.query('DROP TABLE IF EXISTS playlist_tracks CASCADE');
        await db.query('DROP TABLE IF EXISTS playlists CASCADE');
        await db.query('DROP TABLE IF EXISTS likes CASCADE');
        await db.query('DROP TABLE IF EXISTS albums CASCADE');
        await db.query('DROP TABLE IF EXISTS artists CASCADE');
        await db.query('DROP TABLE IF EXISTS tracks CASCADE');
        
        // Create artists table
        await db.query(`
        CREATE TABLE artists (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            bio TEXT,
            verified BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);
        
        // Create albums table
        await db.query(`
        CREATE TABLE albums (
            id SERIAL PRIMARY KEY,
            title VARCHAR(255) NOT NULL,
            artist_id INTEGER,
            release_date DATE,
            cover_image_url VARCHAR(500),
            genre VARCHAR(100),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);
        
        // Create tracks table
        await db.query(`
        CREATE TABLE tracks (
            id SERIAL PRIMARY KEY,
            title VARCHAR(200) NOT NULL,
            uploader_id INTEGER,
            artist_id INTEGER,
            album_id INTEGER,
            album VARCHAR(200) DEFAULT 'Single',
            cover_image_url VARCHAR(500),
            video_url VARCHAR(500),
            file_path VARCHAR(500),
            file_size BIGINT,
            duration_seconds INTEGER DEFAULT 0,
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
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);
        
        // Create playlists table
        await db.query(`
        CREATE TABLE playlists (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            description TEXT,
            user_id INTEGER REFERENCES users(id),
            is_public BOOLEAN DEFAULT FALSE,
            cover_image_url VARCHAR(500),
            track_count INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);
        
        // Create playlist_tracks table
        await db.query(`
        CREATE TABLE playlist_tracks (
            id SERIAL PRIMARY KEY,
            playlist_id INTEGER REFERENCES playlists(id),
            track_id INTEGER REFERENCES tracks(id),
            added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(playlist_id, track_id)
        )`);
        
        // Create likes table
        await db.query(`
        CREATE TABLE likes (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id),
            track_id INTEGER REFERENCES tracks(id),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, track_id)
        )`);
        
        // Create user_favorites table
        await db.query(`
        CREATE TABLE user_favorites (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id),
            track_id INTEGER REFERENCES tracks(id),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, track_id)
        )`);
        
        // Create upload_credits table
        await db.query(`
        CREATE TABLE upload_credits (
            id SERIAL PRIMARY KEY,
            user_id INTEGER,
            credits INTEGER DEFAULT 5,
            last_reset DATE DEFAULT CURRENT_DATE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);
        
        // Create credit_transactions table
        await db.query(`
        CREATE TABLE credit_transactions (
            id SERIAL PRIMARY KEY,
            user_id INTEGER,
            track_id INTEGER,
            credits_spent INTEGER DEFAULT 1,
            transaction_type VARCHAR(50) DEFAULT 'upload',
            description TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);
        
        // Update users table to add subscription_tier column
        await db.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_tier VARCHAR(20) DEFAULT \'free\'');
        
        // Update tracks table
        await db.query('ALTER TABLE tracks ADD COLUMN IF NOT EXISTS artist_id INTEGER');
        await db.query('ALTER TABLE tracks ADD COLUMN IF NOT EXISTS album_id INTEGER');
        await db.query('ALTER TABLE tracks ADD COLUMN IF NOT EXISTS uploader_id INTEGER');
        await db.query('ALTER TABLE tracks ADD COLUMN IF NOT EXISTS audio_url VARCHAR(500)');
        await db.query('ALTER TABLE tracks ADD COLUMN IF NOT EXISTS cover_image_url VARCHAR(500)');
        await db.query('ALTER TABLE tracks ADD COLUMN IF NOT EXISTS video_url VARCHAR(500)');
        await db.query('ALTER TABLE tracks ADD COLUMN IF NOT EXISTS file_path VARCHAR(500)');
        await db.query('ALTER TABLE tracks ADD COLUMN IF NOT EXISTS metadata JSONB');
        await db.query('ALTER TABLE tracks ADD COLUMN IF NOT EXISTS duration_seconds INTEGER DEFAULT 0');
        await db.query('ALTER TABLE tracks ADD COLUMN IF NOT EXISTS release_date DATE');
        await db.query('ALTER TABLE tracks ADD COLUMN IF NOT EXISTS is_available BOOLEAN DEFAULT TRUE');
        await db.query('ALTER TABLE tracks ADD COLUMN IF NOT EXISTS genre VARCHAR(100)');
        await db.query('ALTER TABLE tracks ADD COLUMN IF NOT EXISTS album VARCHAR(255)');
        await db.query('ALTER TABLE tracks ADD COLUMN IF NOT EXISTS file_size BIGINT');
        await db.query('ALTER TABLE tracks ADD COLUMN IF NOT EXISTS bitrate INTEGER');
        await db.query('ALTER TABLE tracks ADD COLUMN IF NOT EXISTS sample_rate INTEGER');
        await db.query('ALTER TABLE tracks ADD COLUMN IF NOT EXISTS track_number INTEGER');
        await db.query('ALTER TABLE tracks ADD COLUMN IF NOT EXISTS lyrics TEXT');
        await db.query('ALTER TABLE tracks ADD COLUMN IF NOT EXISTS play_count INTEGER DEFAULT 0');
        await db.query('ALTER TABLE tracks ADD COLUMN IF NOT EXISTS like_count INTEGER DEFAULT 0');
        await db.query('ALTER TABLE tracks ADD COLUMN IF NOT EXISTS is_explicit BOOLEAN DEFAULT false');
        await db.query('ALTER TABLE tracks ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP');
        await db.query('ALTER TABLE tracks ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP');
        
        // Insert sample data
        await db.query("INSERT INTO artists (name, bio, verified) VALUES ('Artist 1', 'Sample artist 1', false)");
        await db.query("INSERT INTO artists (name, bio, verified) VALUES ('Artist 2', 'Sample artist 2', false)");
        await db.query("INSERT INTO artists (name, bio, verified) VALUES ('Artist 3', 'Sample artist 3', false)");
        
        await db.query("INSERT INTO albums (title, artist_id, release_date, genre) VALUES ('Album 1', 1, '2024-01-01', 'Pop')");
        await db.query("INSERT INTO albums (title, artist_id, release_date, genre) VALUES ('Album 2', 2, '2024-02-01', 'Rock')");
        await db.query("INSERT INTO albums (title, artist_id, release_date, genre) VALUES ('Album 3', 3, '2024-03-01', 'Electronic')");
        
        // Update tracks
        await db.query("UPDATE tracks SET artist_id = 1, album_id = 1, uploader_id = 1, audio_url = '/uploads/sample1.mp3', cover_image_url = '/uploads/cover1.jpg', is_available = true WHERE title = 'Sample Song 1'");
        await db.query("UPDATE tracks SET artist_id = 2, album_id = 2, uploader_id = 1, audio_url = '/uploads/sample2.mp3', cover_image_url = '/uploads/cover2.jpg', is_available = true WHERE title = 'Sample Song 2'");
        await db.query("UPDATE tracks SET artist_id = 3, album_id = 3, uploader_id = 1, audio_url = '/uploads/sample3.mp3', cover_image_url = '/uploads/cover3.jpg', is_available = true WHERE title = 'Sample Song 3'");
        
        // Create upload credits
        await db.query("INSERT INTO upload_credits (user_id, credits) SELECT id, 5 FROM users");
        
        res.json({ 
            success: true, 
            message: 'Complete database setup finished!',
            tables: ['users', 'tracks', 'playlists', 'playlist_tracks', 'likes', 'user_favorites', 'artists', 'albums', 'upload_credits', 'credit_transactions']
        });
        
    } catch (error) {
        console.error('Complete setup error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Fix tracks table endpoint
app.post('/fix-tracks-table', async (req, res) => {
    try {
        console.log('Dropping and recreating tracks table...');
        
        // Drop tracks table
        await db.query('DROP TABLE IF EXISTS tracks CASCADE');
        
        // Recreate tracks table with all columns
        await db.query(`
        CREATE TABLE tracks (
            id SERIAL PRIMARY KEY,
            title VARCHAR(200) NOT NULL,
            uploader_id INTEGER,
            artist_id INTEGER,
            album_id INTEGER,
            album VARCHAR(200) DEFAULT 'Single',
            cover_image_url VARCHAR(500),
            video_url VARCHAR(500),
            file_path VARCHAR(500),
            file_size BIGINT,
            duration_seconds INTEGER DEFAULT 0,
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
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);
        
        console.log('Tracks table recreated successfully');
        
        res.json({ 
            success: true, 
            message: 'Tracks table recreated successfully with all columns' 
        });
    } catch (error) {
        console.error('Error fixing tracks table:', error);
        res.status(500).json({ error: error.message });
    }
});

// Keep-alive endpoint for Render PostgreSQL
app.get('/keep-alive', async (req, res) => {
    try {
        await db.query('SELECT 1');
        res.json({ 
            status: 'Database is alive', 
            timestamp: new Date().toISOString(),
            service: 'JUKE Database Keep-Alive'
        });
    } catch (error) {
        res.status(500).json({ 
            status: 'Database error', 
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        service: 'JUKE Web Service',
        timestamp: new Date().toISOString()
    });
});

// Start server with error handling
const server = app.listen(PORT, () => {
    console.log(`🚀 JUKE Server running on port ${PORT}`);
    console.log(`📱 Health check: http://localhost:${PORT}/health`);
    console.log(`🔗 Keep-alive: http://localhost:${PORT}/keep-alive`);
    console.log(`⚙️  Database setup: http://localhost:${PORT}/setup-database`);
});

// Handle server errors
server.on('error', (error) => {
    if (error.syscall !== 'listen') {
        throw error;
    }
    
    const bind = typeof PORT === 'string' ? 'Pipe ' + PORT : 'Port ' + PORT;
    
    switch (error.code) {
        case 'EACCES':
            console.error(bind + ' requires elevated privileges');
            process.exit(1);
            break;
        case 'EADDRINUSE':
            console.error(bind + ' is already in use');
            process.exit(1);
            break;
        default:
            throw error;
    }
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log(' Shutting down server...');
    console.log('🛑 Shutting down server...');
    await new Promise(resolve => setTimeout(resolve, 1000));
    process.exit(0);
});