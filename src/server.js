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
const crypto = require('crypto');
const MonetizationService = require('./monetization/payment-integration');
const monetizationRoutes = require('./monetization/monetization-api-simple');
const { sendEmailVerification } = require('./services/email');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key_here';

const S3_BUCKET = process.env.S3_BUCKET || '';
const S3_REGION = process.env.S3_REGION || 'auto';
const S3_ENDPOINT = process.env.S3_ENDPOINT || '';
const S3_ACCESS_KEY_ID = process.env.S3_ACCESS_KEY_ID || '';
const S3_SECRET_ACCESS_KEY = process.env.S3_SECRET_ACCESS_KEY || '';
const S3_PUBLIC_BASE_URL = process.env.S3_PUBLIC_BASE_URL || '';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_PUBLISHABLE_KEY = process.env.STRIPE_PUBLISHABLE_KEY || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const STRIPE_USER_PRICE_ID = process.env.STRIPE_USER_PRICE_ID || '';
const STRIPE_GROUP_PRICE_ID = process.env.STRIPE_GROUP_PRICE_ID || '';
const APP_BASE_URL = process.env.APP_BASE_URL || `http://localhost:${PORT}`;

const stripe = STRIPE_SECRET_KEY ? require('stripe')(STRIPE_SECRET_KEY) : null;
const monetizationService = new MonetizationService();
const createdPriceIds = { user: null, group: null };

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

function computeFileHash(filePath) {
    try {
        if (!filePath || !fs.existsSync(filePath)) return null;
        const hash = crypto.createHash('sha256');
        hash.update(fs.readFileSync(filePath));
        return hash.digest('hex');
    } catch (error) {
        console.error('Hash computation error:', error);
        return null;
    }
}

async function calculateUploadRiskScore(db, file, userId, metadata) {
    let score = 0;
    let reasons = [];

    if (!file || !file.path) return { score, reasons };

    // Duplicate hash check
    const hash = computeFileHash(file.path);
    if (hash) {
        const existing = await db.get('SELECT id FROM tracks WHERE audio_sha256 = $1 LIMIT 1', [hash]);
        if (existing) {
            score += 50;
            reasons.push('duplicate_audio_hash');
        }
    }

    // File size anomalies
    if (!file.size || file.size < 50000) {
        score += 10;
        reasons.push('file_too_small');
    }
    if (file.size > 200 * 1024 * 1024) {
        score += 10;
        reasons.push('file_too_large');
    }

    // User history
    const user = await db.get('SELECT copyright_strikes FROM users WHERE id = $1', [userId]);
    if (user && user.copyright_strikes > 0) {
        score += Math.min(user.copyright_strikes * 15, 45);
        reasons.push('prior_copyright_strikes');
    }

    // Metadata quality
    if (!metadata || !metadata.genre) {
        score += 5;
        reasons.push('missing_genre');
    }
    if (!metadata || !metadata.coverUrl) {
        score += 5;
        reasons.push('missing_cover');
    }

    return { score: Math.min(score, 100), reasons };
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

// Stripe helpers
async function getOrCreateStripePrice(accountType, groupSize) {
    if (!stripe) return null;

    const configuredId = accountType === 'group' ? STRIPE_GROUP_PRICE_ID : STRIPE_USER_PRICE_ID;

    if (configuredId) return configuredId;
    if (createdPriceIds[accountType]) return createdPriceIds[accountType];

    const isGroup = accountType === 'group';
    const unitAmount = isGroup ? 1500 : 500;
    const name = isGroup ? 'juqeboks Group (5 Users)' : 'juqeboks User Subscription';
    const description = isGroup ? 'Monthly subscription for 5 users' : 'Monthly user subscription';

    try {
        const price = await stripe.prices.create({
            unit_amount: unitAmount,
            currency: 'eur',
            product_data: { name, description },
            recurring: { interval: 'month' },
        });
        createdPriceIds[accountType] = price.id;
        return price.id;
    } catch (error) {
        console.error('Stripe price creation error:', error);
        return null;
    }
}

async function createStripeCustomer(user) {
    if (!stripe) return null;
    try {
        const customer = await stripe.customers.create({
            email: user.email,
            name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username,
            metadata: { user_id: user.id, account_type: user.account_type || 'user' },
        });
        return customer.id;
    } catch (error) {
        console.error('Stripe customer creation error:', error);
        return null;
    }
}

async function createCheckoutSession(user, priceId, customerId) {
    if (!stripe || !priceId) return null;
    try {
        const successUrl = `${APP_BASE_URL}/checkout-success.html?session_id={CHECKOUT_SESSION_ID}`;
        const cancelUrl = `${APP_BASE_URL}/index.html#/verify-pending`;
        const session = await stripe.checkout.sessions.create({
            customer: customerId,
            line_items: [{ price: priceId, quantity: 1 }],
            mode: 'subscription',
            success_url: successUrl,
            cancel_url: cancelUrl,
            metadata: {
                user_id: user.id,
                account_type: user.account_type || 'user',
                is_registration: 'true',
            },
        });
        return session;
    } catch (error) {
        console.error('Stripe checkout session creation error:', error);
        return null;
    }
}

// Stripe webhook (must use raw body, so it is defined before express.json())
app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    if (stripe && STRIPE_WEBHOOK_SECRET && sig) {
        try {
            event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
        } catch (err) {
            console.error('Stripe webhook signature verification failed:', err.message);
            return res.status(400).send(`Webhook Error: ${err.message}`);
        }
    } else {
        try {
            event = JSON.parse(req.body);
        } catch (err) {
            return res.status(400).send('Invalid JSON');
        }
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const userId = session.metadata && session.metadata.user_id;
        const subscriptionId = session.subscription;

        if (userId) {
            try {
                await db.query(
                    'UPDATE users SET registration_paid = true, stripe_subscription_id = $1 WHERE id = $2',
                    [subscriptionId || null, userId]
                );
                await db.query(
                    `INSERT INTO upload_credits (user_id, credits) VALUES ($1, 999) ON CONFLICT (user_id) DO NOTHING`,
                    [userId]
                );
            } catch (error) {
                console.error('Webhook user update error:', error);
            }
        }
    }

    res.json({ received: true });
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.get('/favicon.ico', (req, res) => {
    res.redirect(302, '/images/juqe.png');
});

app.get('/juke.png', (req, res) => {
    res.redirect(302, '/images/juqe.png');
});

// Ensure uploads directory exists (at project root level)
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Serve uploaded files
app.use('/uploads', express.static(uploadsDir));

// Serve static frontend files from public/
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));

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
                copyright_strikes INTEGER DEFAULT 0,
                upload_disabled BOOLEAN DEFAULT false,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS artists (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                name VARCHAR(200) NOT NULL,
                bio TEXT,
                created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
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
                terms_confirmed BOOLEAN DEFAULT false,
                rights_confirmed BOOLEAN DEFAULT false,
                rights_confirmed_at TIMESTAMP WITH TIME ZONE,
                audio_sha256 VARCHAR(64),
                risk_score INTEGER DEFAULT 0,
                moderation_status VARCHAR(20) DEFAULT 'approved' CHECK (moderation_status IN ('approved', 'pending', 'blocked')),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS copyright_reports (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                track_id UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
                reporter_name VARCHAR(200) NOT NULL,
                reporter_email VARCHAR(255) NOT NULL,
                rights_holder VARCHAR(200),
                work_title VARCHAR(300),
                reason TEXT NOT NULL,
                track_url VARCHAR(500),
                status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'removed', 'dismissed')),
                admin_notes TEXT,
                resolved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
                resolved_at TIMESTAMP WITH TIME ZONE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
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
                track_id TEXT NOT NULL,
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                body TEXT NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS play_history (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                track_id UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
                artist_id UUID REFERENCES artists(id) ON DELETE SET NULL,
                played_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                duration_played INTEGER DEFAULT 0,
                device_type VARCHAR(50),
                source_type VARCHAR(50)
            );

            CREATE TABLE IF NOT EXISTS monthly_royalty_pools (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                year INTEGER NOT NULL,
                month INTEGER NOT NULL,
                total_collected_cents BIGINT NOT NULL DEFAULT 0,
                platform_fee_cents BIGINT NOT NULL DEFAULT 0,
                artist_pool_cents BIGINT NOT NULL DEFAULT 0,
                processed BOOLEAN DEFAULT false,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(year, month)
            );

            CREATE TABLE IF NOT EXISTS artist_royalties (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                artist_id UUID NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                year INTEGER NOT NULL,
                month INTEGER NOT NULL,
                tracked_seconds BIGINT NOT NULL DEFAULT 0,
                share_percent DECIMAL(10, 6) NOT NULL DEFAULT 0,
                payout_cents BIGINT NOT NULL DEFAULT 0,
                paid BOOLEAN DEFAULT false,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(artist_id, user_id, year, month)
            );
        `;

        try {
            await db.query(schema);
        } catch (schemaErr) {
            console.error('Schema creation error (non-fatal, tables may already exist):', schemaErr.message);
        }

        // These ALTER TABLE statements must always run regardless of schema creation result
        // Each wrapped individually to handle type mismatches on production (SERIAL vs UUID)
        const alterStatements = [
            'ALTER TABLE tracks ADD COLUMN IF NOT EXISTS cover_image_url VARCHAR(500)',
            'ALTER TABLE tracks ADD COLUMN IF NOT EXISTS audio_url VARCHAR(500)',
            'ALTER TABLE tracks ADD COLUMN IF NOT EXISTS video_url VARCHAR(500)',
            "ALTER TABLE tracks ADD COLUMN IF NOT EXISTS album VARCHAR(200) DEFAULT 'Single'",
            'ALTER TABLE tracks ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP',
            'ALTER TABLE tracks ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP',
            'ALTER TABLE tracks ADD COLUMN IF NOT EXISTS terms_confirmed BOOLEAN DEFAULT false',
            'ALTER TABLE tracks ADD COLUMN IF NOT EXISTS rights_confirmed BOOLEAN DEFAULT false',
            'ALTER TABLE tracks ADD COLUMN IF NOT EXISTS rights_confirmed_at TIMESTAMP WITH TIME ZONE',
            'ALTER TABLE tracks ADD COLUMN IF NOT EXISTS audio_sha256 VARCHAR(64)',
            'ALTER TABLE tracks ADD COLUMN IF NOT EXISTS risk_score INTEGER DEFAULT 0',
            "ALTER TABLE tracks ADD COLUMN IF NOT EXISTS moderation_status VARCHAR(20) DEFAULT 'approved'",
            // Users table - critical columns for auth
            'ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name VARCHAR(100)',
            'ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name VARCHAR(100)',
            'ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500)',
            'ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT',
            'ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false',
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_tier VARCHAR(20) DEFAULT 'premium'",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS account_type VARCHAR(20) DEFAULT 'user'",
            'ALTER TABLE users ADD COLUMN IF NOT EXISTS group_size INTEGER DEFAULT 1',
            'ALTER TABLE users ADD COLUMN IF NOT EXISTS copyright_strikes INTEGER DEFAULT 0',
            'ALTER TABLE users ADD COLUMN IF NOT EXISTS upload_disabled BOOLEAN DEFAULT false',
            'ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false',
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_token VARCHAR(255)",
            'ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP WITH TIME ZONE',
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS registration_paid BOOLEAN DEFAULT false",
            'ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255)',
            'ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(255)',
            'ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_checkout_session_id VARCHAR(255)',
        ];

        for (const stmt of alterStatements) {
            try {
                await db.query(stmt);
            } catch (alterErr) {
                console.error('ALTER TABLE error (non-fatal):', alterErr.message, '|', stmt.substring(0, 60));
            }
        }

        // Constraint modifications - each wrapped in try/catch for production compatibility
        const constraintBlocks = [
            `DO $$ BEGIN
                IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_account_type_check') THEN
                    ALTER TABLE users DROP CONSTRAINT users_account_type_check;
                END IF;
                ALTER TABLE users ADD CONSTRAINT users_account_type_check CHECK (account_type IN ('user', 'group'));
            END $$;`,
            `DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_favorites_user_track_unique') THEN
                    ALTER TABLE user_favorites ADD CONSTRAINT user_favorites_user_track_unique UNIQUE(user_id, track_id);
                END IF;
            END $$;`,
            `DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_likes_unique') THEN
                    ALTER TABLE user_likes ADD CONSTRAINT user_likes_unique UNIQUE(liker_id, liked_user_id);
                END IF;
            END $$;`,
            `DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'playlist_likes_unique') THEN
                    ALTER TABLE playlist_likes ADD CONSTRAINT playlist_likes_unique UNIQUE(user_id, playlist_id);
                END IF;
            END $$;`,
        ];

        for (const block of constraintBlocks) {
            try {
                await db.query(block);
            } catch (constraintErr) {
                console.error('Constraint block error (non-fatal):', constraintErr.message);
            }
        }

        console.log('Database schema initialized');

        await runMigrations();

    } catch (error) {
        console.error('Database initialization error:', error);
    }
}

async function runMigrations() {
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS migrations (
                name TEXT PRIMARY KEY,
                applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Create analytics tables with integer references to match production SERIAL ids
        await db.query(`
            CREATE TABLE IF NOT EXISTS play_history (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                track_id INTEGER REFERENCES tracks(id) ON DELETE CASCADE,
                artist_id INTEGER REFERENCES artists(id) ON DELETE SET NULL,
                duration_played INTEGER DEFAULT 0,
                source_type VARCHAR(50),
                played_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS artist_royalties (
                id SERIAL PRIMARY KEY,
                artist_id INTEGER REFERENCES artists(id) ON DELETE CASCADE,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                year INTEGER NOT NULL,
                month INTEGER NOT NULL,
                tracked_seconds BIGINT NOT NULL DEFAULT 0,
                share_percent DECIMAL(10, 6) NOT NULL DEFAULT 0,
                payout_cents BIGINT NOT NULL DEFAULT 0,
                paid BOOLEAN DEFAULT false,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(artist_id, user_id, year, month)
            );
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS monthly_royalty_pools (
                id SERIAL PRIMARY KEY,
                year INTEGER NOT NULL,
                month INTEGER NOT NULL,
                total_collected_cents BIGINT NOT NULL DEFAULT 0,
                platform_fee_cents BIGINT NOT NULL DEFAULT 0,
                artist_pool_cents BIGINT NOT NULL DEFAULT 0,
                processed BOOLEAN DEFAULT false,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(year, month)
            );
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS user_reposts (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                track_id INTEGER REFERENCES tracks(id) ON DELETE CASCADE,
                caption TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, track_id)
            );
        `);

        // Run one-time data migrations only when not already applied
        const existing = await db.get(
            'SELECT applied_at FROM migrations WHERE name = $1',
            ['mark_existing_users_verified_paid']
        );

        if (existing) {
            return;
        }

        await db.query(`
            UPDATE users
            SET account_type = 'user',
                email_verified = true,
                email_verified_at = CURRENT_TIMESTAMP,
                registration_paid = true
            WHERE account_type = 'artist';
        `);

        await db.query(`
            UPDATE users
            SET email_verified = true,
                email_verified_at = CURRENT_TIMESTAMP,
                registration_paid = true
            WHERE email_verified = false
              AND email_verified_at IS NULL
              AND registration_paid = false
              AND stripe_checkout_session_id IS NULL;
        `);

        await db.query(
            'INSERT INTO migrations (name) VALUES ($1)',
            ['mark_existing_users_verified_paid']
        );

        console.log('Migration applied: existing users marked as verified and paid');
    } catch (error) {
        console.error('Migration error:', error);
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
                is_admin: true,
                account_type: 'user',
                subscription_tier: 'premium',
                email_verified: true,
                email_verified_at: new Date().toISOString(),
                registration_paid: true,
            });
            return;
        }

        await db.query(
            `UPDATE users SET is_admin = true, password_hash = $2,
                    account_type = COALESCE(account_type, 'user'),
                    subscription_tier = COALESCE(subscription_tier, 'premium'),
                    email_verified = true,
                    registration_paid = true
             WHERE id = $1`,
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
            is_admin: !!(user && (user.is_admin || user.isAdmin)),
            account_type: user.account_type || 'user',
            group_size: user.group_size || 1,
            email_verified: !!user.email_verified,
            registration_paid: !!user.registration_paid,
        },
        JWT_SECRET,
        { expiresIn: '24h' }
    );
};

const isUuid = (value) => {
    return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
};

// Check if value is a valid ID (UUID or numeric)
const isValidId = (value) => {
    if (!value) return false;
    const str = String(value);
    // Check if it's a UUID
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)) return true;
    // Check if it's a positive integer
    if (/^\d+$/.test(str) && parseInt(str, 10) > 0) return true;
    return false;
};

// ==================== AUTHENTICATION ENDPOINTS ====================

// Register new user
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, email, password, firstName, lastName, accountType, groupSize } = req.body;

        const normalizedAccountType = ['user', 'group'].includes(accountType) ? accountType : 'user';
        const normalizedGroupSize = normalizedAccountType === 'group' ? (Math.min(Math.max(parseInt(groupSize, 10) || 5, 2), 20)) : 1;
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
        const verificationToken = crypto.randomBytes(32).toString('hex');

        // Create user - only include columns that definitely exist
        let newUser;
        try {
            newUser = await db.insert('users', {
                username,
                email,
                password_hash: passwordHash,
                first_name: firstName || null,
                last_name: lastName || null,
                is_admin: isAdmin,
            });
        } catch (insertErr) {
            console.error('User insert error:', insertErr.message);
            return res.status(500).json({ error: 'Failed to create user: ' + insertErr.message });
        }

        // Try to set extended fields (may fail on older schemas)
        try {
            await db.query(
                `UPDATE users SET account_type = $1, group_size = $2, subscription_tier = $3,
                 email_verified = $4, email_verified_token = $5, registration_paid = $6
                 WHERE id = $7`,
                [normalizedAccountType, normalizedGroupSize, 'premium', false, verificationToken, false, newUser.id]
            );
            // Re-fetch user with updated fields
            const updated = await db.get('SELECT * FROM users WHERE id = $1', [newUser.id]);
            if (updated) newUser = updated;
        } catch (updateErr) {
            console.error('User extended fields update (non-fatal):', updateErr.message);
        }

        // Send verification email (non-fatal)
        let emailSent = false;
        try {
            const emailResult = await sendEmailVerification(newUser, verificationToken);
            emailSent = !!(emailResult && (emailResult.sent || emailResult.simulated));
        } catch (emailErr) {
            console.error('Email send error (non-fatal):', emailErr.message);
        }

        // Create Stripe checkout session (non-fatal)
        let checkoutUrl = null;
        let stripeSessionId = null;
        if (stripe) {
            try {
                const customerId = await createStripeCustomer(newUser);
                const priceId = await getOrCreateStripePrice(normalizedAccountType, normalizedGroupSize);
                const session = await createCheckoutSession(newUser, priceId, customerId);
                if (session) {
                    checkoutUrl = session.url;
                    stripeSessionId = session.id;
                    await db.query('UPDATE users SET stripe_customer_id = $1, stripe_checkout_session_id = $2 WHERE id = $3', [
                        customerId,
                        session.id,
                        newUser.id,
                    ]);
                }
            } catch (stripeErr) {
                console.error('Stripe setup error (non-fatal):', stripeErr.message);
            }
        }

        // Generate token
        const token = generateToken(newUser);

        res.status(201).json({
            message: 'User registered successfully.',
            user: {
                id: newUser.id,
                username: newUser.username,
                email: newUser.email,
                firstName: newUser.first_name,
                lastName: newUser.last_name,
                accountType: newUser.account_type || 'user',
                groupSize: newUser.group_size || 1,
                isAdmin: !!(newUser.is_admin || isAdmin),
                emailVerified: !!newUser.email_verified,
                registrationPaid: !!newUser.registration_paid,
            },
            token,
            needsEmailVerification: true,
            needsPayment: !!(stripe),
            checkoutUrl,
            stripeSessionId,
            emailSent,
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed: ' + (error.message || 'Internal server error') });
    }
});

// Verify email
app.post('/api/auth/verify-email', async (req, res) => {
    try {
        const { token } = req.body;
        if (!token) {
            return res.status(400).json({ error: 'Verification token is required' });
        }

        const user = await db.get(
            'SELECT id, account_type, email_verified FROM users WHERE email_verified_token = $1',
            [token]
        );

        if (!user) {
            return res.status(400).json({ error: 'Invalid or expired verification token' });
        }

        if (user.email_verified) {
            return res.json({ verified: true, message: 'Email already verified' });
        }

        await db.query(
            'UPDATE users SET email_verified = true, email_verified_token = NULL, email_verified_at = CURRENT_TIMESTAMP WHERE id = $1',
            [user.id]
        );

        res.json({ verified: true, accountType: user.account_type });
    } catch (error) {
        console.error('Email verification error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Resend verification email
app.post('/api/auth/resend-verification', authenticateToken, async (req, res) => {
    try {
        const user = await db.get(
            'SELECT id, email, username, first_name, last_name, account_type, email_verified, email_verified_token FROM users WHERE id = $1',
            [req.user.id]
        );

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (user.email_verified) {
            return res.json({ sent: true, message: 'Email already verified' });
        }

        let token = user.email_verified_token;
        if (!token) {
            token = crypto.randomBytes(32).toString('hex');
            await db.query('UPDATE users SET email_verified_token = $1 WHERE id = $2', [token, user.id]);
        }

        const emailResult = await sendEmailVerification(user, token);
        res.json({
            sent: !!(emailResult && (emailResult.sent || emailResult.simulated)),
            simulated: !!emailResult.simulated,
        });
    } catch (error) {
        console.error('Resend verification error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Check Stripe checkout status
app.get('/api/payments/checkout-status', authenticateToken, async (req, res) => {
    try {
        const { session_id } = req.query;
        if (!session_id) {
            return res.status(400).json({ error: 'session_id is required' });
        }

        if (!stripe) {
            return res.json({ paid: true, simulated: true });
        }

        const session = await stripe.checkout.sessions.retrieve(session_id);
        const paid = session && session.payment_status === 'paid';

        if (paid && session.metadata && session.metadata.user_id === req.user.id) {
            await db.query(
                'UPDATE users SET registration_paid = true, stripe_subscription_id = $1 WHERE id = $2',
                [session.subscription || null, req.user.id]
            );
        }

        res.json({
            paid: !!paid,
            payment_status: session ? session.payment_status : 'unknown',
            account_type: session ? session.metadata.account_type : null,
        });
    } catch (error) {
        console.error('Checkout status error:', error);
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

        // Find user - use SELECT * to avoid missing column errors
        let user;
        try {
            user = await db.get('SELECT * FROM users WHERE username = $1 OR email = $1', [username]);
        } catch (dbErr) {
            console.error('Login DB query error:', dbErr.message);
            return res.status(500).json({ error: 'Database error: ' + dbErr.message });
        }

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
        const needsEmailVerification = !user.email_verified;
        const needsPayment = !user.registration_paid;
        const redirectTo = (needsEmailVerification || needsPayment) ? 'verify-pending' : 'feed';

        res.json({
            message: 'Login successful',
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                firstName: user.first_name,
                lastName: user.last_name,
                accountType: user.account_type || 'user',
                groupSize: user.group_size || 1,
                subscriptionTier: user.subscription_tier || 'premium',
                isAdmin: !!user.is_admin,
                emailVerified: !!user.email_verified,
                registrationPaid: !!user.registration_paid,
            },
            token,
            needsEmailVerification,
            needsPayment,
            redirectTo,
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed: ' + (error.message || 'Internal server error') });
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
            JWT_SECRET,
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


// Avatar upload endpoint
app.post('/api/users/avatar', authenticateToken, upload.single('avatar'), async (req, res) => {
    try {
        const userId = req.user.id;
        const file = req.file;

        if (!file) {
            return res.status(400).json({ error: 'No avatar file provided' });
        }

        // Validate file type
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (!allowedTypes.includes(file.mimetype)) {
            return res.status(400).json({ error: 'Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.' });
        }

        let avatarUrl = `/uploads/${path.basename(file.path)}`;

        // Upload to S3 if configured
        const s3 = getS3Client();
        if (s3) {
            try {
                const avatarObj = await uploadFileToS3(s3, file, 'avatars');
                avatarUrl = avatarObj.url;

                // Delete local file after S3 upload
                if (file.path && fs.existsSync(file.path)) {
                    fs.unlinkSync(file.path);
                }
            } catch (s3Error) {
                console.error('S3 upload error:', s3Error);
                // Fall back to local storage
            }
        }

        // Update user's avatar_url in database
        await db.query(
            'UPDATE users SET avatar_url = $1 WHERE id = $2',
            [avatarUrl, userId]
        );

        // Get updated user
        const user = await db.get(
            'SELECT id, username, email, first_name, last_name, avatar_url, bio FROM users WHERE id = $1',
            [userId]
        );

        res.json({
            success: true,
            avatar_url: avatarUrl,
            user: user
        });
    } catch (error) {
        console.error('Avatar upload error:', error);
        res.status(500).json({ error: 'Failed to upload avatar' });
    }
});

// Get user avatar
app.get('/api/users/avatar', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const user = await db.get('SELECT avatar_url FROM users WHERE id = $1', [userId]);
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ avatar_url: user.avatar_url });
    } catch (error) {
        console.error('Get avatar error:', error);
        res.status(500).json({ error: 'Failed to get avatar' });
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
            JWT_SECRET,
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

// User reposts: tracks a user has reposted to their profile
app.get('/api/reposts', authenticateToken, async (req, res) => {
    try {
        // Ensure table exists (defensive for older deployments)
        await db.query(`
            CREATE TABLE IF NOT EXISTS user_reposts (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                track_id INTEGER REFERENCES tracks(id) ON DELETE CASCADE,
                caption TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, track_id)
            );
        `);

        const userId = req.user.id;
        const rows = await db.getAll(`
            SELECT ur.id, ur.track_id, ur.caption, ur.created_at,
                   t.title, t.artist_name, t.cover_image_url, t.audio_url, t.duration_seconds,
                   u.username as uploader_name
            FROM user_reposts ur
            JOIN tracks t ON ur.track_id = t.id
            LEFT JOIN users u ON t.uploader_id = u.id
            WHERE ur.user_id = $1
            ORDER BY ur.created_at DESC
        `, [userId]);
        res.json({ reposts: rows });
    } catch (error) {
        console.error('Get reposts error:', error);
        res.status(500).json({ error: 'Internal server error', detail: error.message });
    }
});

app.post('/api/reposts', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { trackId, caption } = req.body;
        if (!trackId) {
            return res.status(400).json({ error: 'trackId is required' });
        }

        const track = await db.get('SELECT id FROM tracks WHERE id = $1', [trackId]);
        if (!track) {
            return res.status(404).json({ error: 'Track not found' });
        }

        const existing = await db.get(
            'SELECT id FROM user_reposts WHERE user_id = $1 AND track_id = $2',
            [userId, trackId]
        );
        if (existing) {
            return res.status(409).json({ error: 'Already reposted' });
        }

        const result = await db.query(
            'INSERT INTO user_reposts (user_id, track_id, caption) VALUES ($1, $2, $3) RETURNING id, created_at',
            [userId, trackId, caption || null]
        );
        res.json({ success: true, repost: result.rows[0] });
    } catch (error) {
        console.error('Create repost error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.delete('/api/reposts/:id', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;
        const result = await db.query(
            'DELETE FROM user_reposts WHERE id = $1 AND user_id = $2 RETURNING id',
            [id, userId]
        );
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Repost not found' });
        }
        res.json({ success: true });
    } catch (error) {
        console.error('Delete repost error:', error);
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
              AND COALESCE(t.moderation_status, 'approved') = 'approved'
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
            let countQuery = `SELECT COUNT(*) as total FROM tracks t WHERE COALESCE(t.is_available, true) = true AND COALESCE(t.moderation_status, 'approved') = 'approved'`;
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
              AND COALESCE(t.moderation_status, 'approved') = 'approved'
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

        const isOwner = req.user && String(req.user.id) === String(id);
        const isAdmin = req.user && req.user.is_admin;

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
              AND ($2 = true OR COALESCE(t.moderation_status, 'approved') = 'approved')
            ORDER BY t.created_at DESC
            LIMIT 200
        `, [id, isOwner || isAdmin]);

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

        if (!isValidId(id)) {
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

        const currentUserId = req.user ? req.user.id : null;
        const isOwner = currentUserId && String(track.uploader_id) === String(currentUserId);
        const isAdmin = req.user && req.user.is_admin;
        if (track.moderation_status === 'blocked' && !isOwner && !isAdmin) {
            return res.status(403).json({ error: 'This track is not available' });
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

        if (!isValidId(trackId)) {
            return res.status(400).json({ error: 'Invalid track ID' });
        }

        const track = await db.get('SELECT id FROM tracks WHERE id::text = $1::text', [trackId]);
        if (!track) {
            return res.status(404).json({ error: 'Track not found' });
        }

        const existing = await db.get(
            'SELECT id FROM user_favorites WHERE user_id = $1 AND track_id::text = $2::text',
            [userId, trackId]
        );

        if (existing) {
            await db.query(
                'DELETE FROM user_favorites WHERE user_id = $1 AND track_id::text = $2::text',
                [userId, trackId]
            );
        } else {
            await db.query(
                'INSERT INTO user_favorites (user_id, track_id) VALUES ($1, $2::text) ON CONFLICT DO NOTHING',
                [userId, trackId]
            );
        }

        const likeCountRow = await db.get(
            'SELECT COUNT(*)::int as count FROM user_favorites WHERE track_id::text = $1::text',
            [trackId]
        );

        try {
            await db.query('UPDATE tracks SET like_count = $2 WHERE id::text = $1::text', [trackId, likeCountRow ? (likeCountRow.count || 0) : 0]);
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

        if (!isValidId(trackId)) {
            return res.status(400).json({ error: 'Invalid track ID' });
        }

        const track = await db.get('SELECT id FROM tracks WHERE id::text = $1::text', [trackId]);
        if (!track) {
            return res.status(404).json({ error: 'Track not found' });
        }

        const comments = await db.getAll(`
            SELECT tc.id, tc.track_id, tc.user_id, tc.body, tc.created_at,
                   u.username as username
            FROM track_comments tc
            LEFT JOIN users u ON tc.user_id = u.id
            WHERE tc.track_id::text = $1::text
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

        if (!isValidId(trackId)) {
            return res.status(400).json({ error: 'Invalid track ID' });
        }
        if (!text) {
            return res.status(400).json({ error: 'Comment is required' });
        }

        const track = await db.get('SELECT id FROM tracks WHERE id::text = $1::text', [trackId]);
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

        if (!isValidId(trackId) || !isValidId(commentId)) {
            return res.status(400).json({ error: 'Invalid ID' });
        }

        const comment = await db.get(
            'SELECT id, user_id, track_id FROM track_comments WHERE id = $1 AND track_id::text = $2::text',
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

// Record a play event for royalty tracking with anti-fraud checks
app.post('/api/play', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { trackId, durationPlayed = 0, source = 'player' } = req.body;
        const duration = Math.max(0, parseInt(durationPlayed, 10) || 0);

        if (!isValidId(trackId)) {
            return res.status(400).json({ error: 'Invalid track ID' });
        }

        // Anti-fraud: cap single event duration to 5 minutes
        const cappedDuration = Math.min(duration, 300);

        // Anti-fraud: ignore very short plays (less than 5 seconds) for royalty tracking,
        // but still count them as light engagement.
        const royaltyDuration = cappedDuration >= 5 ? cappedDuration : 0;

        const track = await db.get(`
            SELECT t.id, t.artist_id, a.id as artist_id
            FROM tracks t
            JOIN artists a ON t.artist_id = a.id
            WHERE t.id = $1
        `, [trackId]);

        if (!track) {
            return res.status(404).json({ error: 'Track not found' });
        }

        // Anti-fraud: max 1 play per track per user per 30 seconds
        const recentDuplicate = await db.get(`
            SELECT id FROM play_history
            WHERE user_id = $1 AND track_id = $2 AND played_at > NOW() - INTERVAL '30 seconds'
            LIMIT 1
        `, [userId, trackId]);

        if (recentDuplicate) {
            return res.status(429).json({ error: 'Play recorded too recently' });
        }

        // Anti-fraud: max 1000 plays per user per day, max 12 hours total duration per day
        const dailyStats = await db.get(`
            SELECT COUNT(*) as play_count, COALESCE(SUM(duration_played), 0) as total_duration
            FROM play_history
            WHERE user_id = $1 AND played_at > NOW() - INTERVAL '1 day'
        `, [userId]);

        if (parseInt(dailyStats.play_count, 10) >= 1000) {
            return res.status(429).json({ error: 'Daily play limit reached' });
        }

        if (parseInt(dailyStats.total_duration, 10) + cappedDuration > 43200) {
            return res.status(429).json({ error: 'Daily listening limit reached' });
        }

        await db.query(`
            INSERT INTO play_history (user_id, track_id, artist_id, duration_played, source_type)
            VALUES ($1, $2, $3, $4, $5)
        `, [userId, trackId, track.artist_id, cappedDuration, source]);

        // Only increment play_count for meaningful plays (5+ seconds)
        if (royaltyDuration > 0) {
            await db.query('UPDATE tracks SET play_count = play_count + 1 WHERE id = $1', [trackId]);
        }

        res.json({ success: true, countedDuration: cappedDuration, royaltyDuration });
    } catch (error) {
        console.error('Play tracking error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Calculate monthly royalties: 90% of collected subscription revenue goes to artists
// pro-rata based on each user's listening share per artist.
app.post('/api/admin/royalties/calculate', authenticateToken, async (req, res) => {
    try {
        if (!req.user.is_admin) {
            return res.status(403).json({ error: 'Admin required' });
        }

        const { year, month } = req.body;
        const now = new Date();
        const targetYear = year ? parseInt(year, 10) : now.getFullYear();
        const targetMonth = month ? parseInt(month, 10) : now.getMonth() + 1;

        const startDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
        const endDate = targetMonth === 12
            ? `${targetYear + 1}-01-01`
            : `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-01`;

        // Total subscription revenue collected this month (in cents)
        const revenueResult = await db.get(`
            SELECT COALESCE(SUM(
                CASE WHEN account_type = 'group' THEN 1500 ELSE 500 END
            ), 0) as total_cents
            FROM users
            WHERE registration_paid = true
              AND email_verified = true
              AND created_at < $1
        `, [endDate]);

        const totalCollectedCents = parseInt(revenueResult.total_cents, 10) || 0;
        const platformFeeCents = Math.round(totalCollectedCents * 0.10);
        const artistPoolCents = totalCollectedCents - platformFeeCents;

        await db.query(`
            INSERT INTO monthly_royalty_pools (year, month, total_collected_cents, platform_fee_cents, artist_pool_cents, processed)
            VALUES ($1, $2, $3, $4, $5, true)
            ON CONFLICT (year, month) DO UPDATE SET
                total_collected_cents = EXCLUDED.total_collected_cents,
                platform_fee_cents = EXCLUDED.platform_fee_cents,
                artist_pool_cents = EXCLUDED.artist_pool_cents,
                processed = true,
                updated_at = CURRENT_TIMESTAMP
        `, [targetYear, targetMonth, totalCollectedCents, platformFeeCents, artistPoolCents]);

        // Clear previous calculations for this month
        await db.query(`
            DELETE FROM artist_royalties WHERE year = $1 AND month = $2
        `, [targetYear, targetMonth]);

        // Per user: sum of listening seconds per artist
        const userArtistPlays = await db.getAll(`
            SELECT user_id, artist_id, COALESCE(SUM(duration_played), 0) as seconds
            FROM play_history
            WHERE played_at >= $1 AND played_at < $2
              AND artist_id IS NOT NULL
            GROUP BY user_id, artist_id
        `, [startDate, endDate]);

        // Per user: total listening seconds
        const userTotals = {};
        for (const row of userArtistPlays) {
            const uid = row.user_id;
            const secs = parseInt(row.seconds, 10) || 0;
            userTotals[uid] = (userTotals[uid] || 0) + secs;
        }

        // User subscription value (in cents) for this month
        const userValues = await db.getAll(`
            SELECT id, CASE WHEN account_type = 'group' THEN 1500 ELSE 500 END as value_cents
            FROM users
            WHERE registration_paid = true AND email_verified = true
        `);

        const userValueMap = {};
        for (const u of userValues) {
            userValueMap[u.id] = parseInt(u.value_cents, 10) || 0;
        }

        // Calculate per-artist, per-user payouts
        for (const row of userArtistPlays) {
            const uid = row.user_id;
            const aid = row.artist_id;
            const artistSeconds = parseInt(row.seconds, 10) || 0;
            const totalUserSeconds = userTotals[uid] || 1;
            const userValue = userValueMap[uid] || 0;

            if (artistSeconds <= 0 || userValue <= 0) continue;

            const share = artistSeconds / totalUserSeconds;
            const payoutCents = Math.round(userValue * share * 0.90); // 90% of that user's subscription

            await db.query(`
                INSERT INTO artist_royalties (artist_id, user_id, year, month, tracked_seconds, share_percent, payout_cents)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
            `, [aid, uid, targetYear, targetMonth, artistSeconds, (share * 100).toFixed(6), payoutCents]);
        }

        res.json({
            success: true,
            year: targetYear,
            month: targetMonth,
            totalCollectedCents,
            platformFeeCents,
            artistPoolCents,
        });
    } catch (error) {
        console.error('Royalty calculation error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Admin royalty report for a month
app.get('/api/admin/royalties', authenticateToken, async (req, res) => {
    try {
        if (!req.user.is_admin) {
            return res.status(403).json({ error: 'Admin required' });
        }

        const { year, month } = req.query;
        const now = new Date();
        const targetYear = year ? parseInt(year, 10) : now.getFullYear();
        const targetMonth = month ? parseInt(month, 10) : now.getMonth() + 1;

        const pool = await db.get(`
            SELECT * FROM monthly_royalty_pools WHERE year = $1 AND month = $2
        `, [targetYear, targetMonth]);

        const perArtist = await db.getAll(`
            SELECT a.name as artist_name, ar.artist_id,
                   SUM(ar.tracked_seconds) as total_seconds,
                   SUM(ar.payout_cents) as total_payout_cents,
                   COUNT(DISTINCT ar.user_id) as listeners
            FROM artist_royalties ar
            JOIN artists a ON ar.artist_id = a.id
            WHERE ar.year = $1 AND ar.month = $2
            GROUP BY ar.artist_id, a.name
            ORDER BY total_payout_cents DESC
        `, [targetYear, targetMonth]);

        res.json({
            pool: pool || null,
            artists: perArtist || []
        });
    } catch (error) {
        console.error('Royalty report error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Aggregate unpaid balances per artist (for payouts)
app.get('/api/admin/artist-balances', authenticateToken, async (req, res) => {
    try {
        if (!req.user.is_admin) {
            return res.status(403).json({ error: 'Admin required' });
        }

        const balances = await db.getAll(`
            SELECT a.id as artist_id, a.name as artist_name, u.email as owner_email, u.username as owner_username,
                   SUM(ar.payout_cents) as unpaid_cents,
                   COUNT(DISTINCT ar.year || '-' || ar.month) as periods,
                   MAX(ar.year) as last_year,
                   MAX(ar.month) as last_month
            FROM artist_royalties ar
            JOIN artists a ON ar.artist_id = a.id
            LEFT JOIN users u ON a.created_by_user_id = u.id
            WHERE ar.paid = false
            GROUP BY a.id, a.name, u.email, u.username
            HAVING SUM(ar.payout_cents) > 0
            ORDER BY unpaid_cents DESC
        `);

        res.json({ balances: balances || [] });
    } catch (error) {
        console.error('Artist balances error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Mark royalties as paid for a specific artist and month
app.post('/api/admin/payouts/mark-paid', authenticateToken, async (req, res) => {
    try {
        if (!req.user.is_admin) {
            return res.status(403).json({ error: 'Admin required' });
        }

        const { artistId, year, month } = req.body;

        if (!isValidId(artistId)) {
            return res.status(400).json({ error: 'Invalid artist ID' });
        }

        const result = await db.query(`
            UPDATE artist_royalties
            SET paid = true, updated_at = CURRENT_TIMESTAMP
            WHERE artist_id = $1 AND year = $2 AND month = $3 AND paid = false
        `, [artistId, parseInt(year, 10), parseInt(month, 10)]);

        res.json({ success: true, markedPaid: result.rowCount || 0 });
    } catch (error) {
        console.error('Mark paid error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Public analytics endpoint for the _fair dashboard
app.get('/api/analytics', async (req, res) => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = month === 12
        ? `${year + 1}-01-01`
        : `${year}-${String(month + 1).padStart(2, '0')}-01`;

    const result = {
        totalUsers: 0, totalTracks: 0, totalPlays: 0, totalPlaySeconds: 0,
        totalCollectedCents: 0, platformFeeCents: 0, artistPoolCents: 0,
        perArtist: [], moneyFlow: [], topArtists: [], year, month,
        errors: []
    };

    async function safeQuery(name, fn) {
        try {
            return await fn();
        } catch (error) {
            console.error(`Analytics query error (${name}):`, error.message);
            result.errors.push(name + ': ' + error.message);
            return null;
        }
    }

    const totalUsers = await safeQuery('totalUsers', () => db.get(`SELECT COUNT(*)::int as count FROM users`));
    if (totalUsers) result.totalUsers = totalUsers.count || 0;

    const totalTracks = await safeQuery('totalTracks', () => db.get(`SELECT COUNT(*)::int as count FROM tracks`));
    if (totalTracks) result.totalTracks = totalTracks.count || 0;

    const totalPlays = await safeQuery('totalPlays', () => db.get(`SELECT COUNT(*)::int as count FROM play_history`));
    if (totalPlays) result.totalPlays = totalPlays.count || 0;

    const totalPlaySeconds = await safeQuery('totalPlaySeconds', () => db.get(`SELECT COALESCE(SUM(duration_played), 0)::bigint as seconds FROM play_history`));
    if (totalPlaySeconds) result.totalPlaySeconds = parseInt(totalPlaySeconds.seconds, 10) || 0;

    const totalRevenue = await safeQuery('totalRevenue', () => db.get(`
        SELECT COALESCE(SUM(CASE WHEN account_type = 'group' THEN 1500 ELSE 500 END), 0) as cents
        FROM users
        WHERE registration_paid = true AND email_verified = true AND created_at < $1
    `, [endDate]));

    const totalCollectedCents = totalRevenue ? (parseInt(totalRevenue.cents, 10) || 0) : 0;
    result.totalCollectedCents = totalCollectedCents;
    result.platformFeeCents = Math.round(totalCollectedCents * 0.10);
    result.artistPoolCents = totalCollectedCents - result.platformFeeCents;

    const perArtist = await safeQuery('perArtist', () => db.getAll(`
        SELECT a.id as artist_id, a.name as artist_name,
               SUM(ar.payout_cents) as payout_cents,
               COUNT(DISTINCT ar.user_id) as paying_users,
               SUM(ar.tracked_seconds) as tracked_seconds
        FROM artist_royalties ar
        JOIN artists a ON ar.artist_id = a.id
        WHERE ar.year = $1 AND ar.month = $2
        GROUP BY a.id, a.name
        ORDER BY payout_cents DESC
    `, [year, month]));
    if (perArtist) result.perArtist = perArtist;

    const moneyFlow = await safeQuery('moneyFlow', () => db.getAll(`
        SELECT u.username as listener_username,
               a.name as artist_name,
               ar.payout_cents,
               ar.tracked_seconds,
               ar.share_percent
        FROM artist_royalties ar
        JOIN users u ON ar.user_id = u.id
        JOIN artists a ON ar.artist_id = a.id
        WHERE ar.year = $1 AND ar.month = $2 AND ar.payout_cents > 0
        ORDER BY ar.payout_cents DESC
        LIMIT 100
    `, [year, month]));
    if (moneyFlow) result.moneyFlow = moneyFlow;

    const topArtists = await safeQuery('topArtists', () => db.getAll(`
        SELECT a.name as artist_name, COALESCE(SUM(ph.duration_played), 0) as total_seconds
        FROM play_history ph
        JOIN artists a ON ph.artist_id = a.id
        WHERE ph.played_at >= $1 AND ph.played_at < $2
        GROUP BY a.id, a.name
        ORDER BY total_seconds DESC
        LIMIT 10
    `, [startDate, endDate]));
    if (topArtists) result.topArtists = topArtists;

    res.json(result);
});

// Search for music - optimiert mit besserer Performance
app.get('/api/search', async (req, res) => {
    try {
        const { q, type = 'all', limit = 20 } = req.query;

        if (!q || !q.trim()) {
            return res.status(400).json({ error: 'Search query is required' });
        }

        // Validierung und Limits
        const limitNum = Math.max(1, Math.min(parseInt(limit, 10) || 20, 50));
        const searchTerm = `%${q.trim()}%`;
        const results = {};

        // Parallele Queries für bessere Performance
        const promises = [];

        if (type === 'all' || type === 'tracks') {
            promises.push(
                db.getAll(`
                    SELECT t.id, t.title, t.duration_seconds, t.genre, t.play_count,
                           t.cover_image_url, t.audio_url, t.file_path,
                           a.name as artist_name, a.id as artist_id,
                           al.title as album_title, al.cover_image_url as album_cover_image_url
                    FROM tracks t
                    LEFT JOIN artists a ON t.artist_id = a.id
                    LEFT JOIN albums al ON t.album_id = al.id
                    WHERE COALESCE(t.is_available, true) = true
                      AND (t.title ILIKE $1 OR a.name ILIKE $1 OR t.genre ILIKE $1)
                    ORDER BY 
                        CASE WHEN t.title ILIKE $1 THEN 0 ELSE 1 END,
                        t.play_count DESC
                    LIMIT $2
                `, [searchTerm, limitNum]).then(tracks => {
                    results.tracks = (tracks || []).map(t => {
                        const audioUrl = t.audio_url || (t.file_path ? `/uploads/${require('path').basename(t.file_path)}` : null);
                        const coverUrl = t.cover_image_url || t.album_cover_image_url || null;
                        const { file_path, album_cover_image_url, ...rest } = t;
                        return { ...rest, audio_url: audioUrl, cover_image_url: coverUrl };
                    });
                })
            );
        }

        if (type === 'all' || type === 'artists') {
            promises.push(
                db.getAll(`
                    SELECT id, name, image_url, bio, verified
                    FROM artists
                    WHERE name ILIKE $1
                    ORDER BY verified DESC, name
                    LIMIT $2
                `, [searchTerm, limitNum]).then(artists => {
                    results.artists = artists || [];
                })
            );
        }

        if (type === 'all' || type === 'albums') {
            promises.push(
                db.getAll(`
                    SELECT al.id, al.title, al.release_date, al.cover_image_url, al.genre,
                           a.name as artist_name, a.id as artist_id
                    FROM albums al
                    LEFT JOIN artists a ON al.artist_id = a.id
                    WHERE al.title ILIKE $1 OR a.name ILIKE $1
                    ORDER BY al.release_date DESC
                    LIMIT $2
                `, [searchTerm, limitNum]).then(albums => {
                    results.albums = albums || [];
                })
            );
        }

        // Warte auf alle parallelen Queries
        await Promise.all(promises);

        // Response mit Metadaten
        res.json({
            query: q.trim(),
            ...results,
            meta: {
                total: (results.tracks?.length || 0) + (results.artists?.length || 0) + (results.albums?.length || 0)
            }
        });
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
            user = await db.get('SELECT subscription_tier, email_verified, registration_paid FROM users WHERE id = $1', [req.user.id]);
        } catch (columnError) {
            if (columnError.message && columnError.message.includes('subscription_tier')) {
                console.log('subscription_tier column missing, treating user as free tier');
                user = { subscription_tier: 'free', email_verified: true, registration_paid: true };
            } else {
                throw columnError;
            }
        }
        
        // If user doesn't exist, return error
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (!user.email_verified) {
            return res.status(403).json({
                success: false,
                error: 'Please verify your email address before uploading.',
                needsEmailVerification: true,
            });
        }

        if (!user.registration_paid) {
            return res.status(402).json({
                success: false,
                error: 'Please complete your subscription payment before uploading.',
                needsPayment: true,
            });
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

        const termsConfirmed = req.body && (req.body.termsConfirmed === 'true' || req.body.termsConfirmed === true);
        const rightsConfirmed = req.body && (req.body.rightsConfirmed === 'true' || req.body.rightsConfirmed === true);

        if (!termsConfirmed || !rightsConfirmed) {
            return res.status(403).json({
                success: false,
                error: 'You must accept the Terms of Service and confirm that you own all rights to this track.'
            });
        }

        const uploader = await db.get('SELECT upload_disabled, copyright_strikes FROM users WHERE id = $1', [userId]);
        if (uploader && uploader.upload_disabled) {
            return res.status(403).json({
                success: false,
                error: 'Upload access has been disabled for this account due to repeated copyright violations.'
            });
        }

        const artist = (typeof artistRaw === 'string') ? artistRaw.trim() : '';
        const artistName = artist || (req.user && req.user.username ? String(req.user.username) : '');

        if (!file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        if (!artistName) {
            return res.status(400).json({ error: 'Artist is required' });
        }

        // Compute audio hash and risk score
        const audioHash = computeFileHash(file.path);
        const risk = await calculateUploadRiskScore(db, file, userId, { genre, coverUrl: cover ? 'yes' : null });
        let moderationStatus = 'approved';
        if (risk.score >= 80) {
            moderationStatus = 'blocked';
        } else if (risk.score >= 40) {
            moderationStatus = 'pending';
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
                created_by_user_id: userId,
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
                if (file.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
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
            is_available: moderationStatus !== 'blocked',
            terms_confirmed: termsConfirmed,
            rights_confirmed: rightsConfirmed,
            rights_confirmed_at: new Date().toISOString(),
            audio_sha256: audioHash,
            risk_score: risk.score,
            moderation_status: moderationStatus
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

        res.json({
            success: true,
            track: result,
            riskScore: risk.score,
            riskReasons: risk.reasons,
            moderationStatus: moderationStatus
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Upload failed' });
    }
});

// Submit a copyright report (Notice-and-Takedown)
app.post('/api/copyright-reports', async (req, res) => {
    try {
        const { trackId, reporterName, reporterEmail, rightsHolder, workTitle, reason, trackUrl } = req.body;

        if (!isValidId(trackId) || !reporterName || !reporterEmail || !reason) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const track = await db.get('SELECT id, title, uploader_id FROM tracks WHERE id = $1', [trackId]);
        if (!track) {
            return res.status(404).json({ error: 'Track not found' });
        }

        const report = await db.insert('copyright_reports', {
            track_id: trackId,
            reporter_name: reporterName,
            reporter_email: reporterEmail,
            rights_holder: rightsHolder || reporterName,
            work_title: workTitle || track.title,
            reason,
            track_url: trackUrl || null,
            status: 'pending'
        });

        res.json({ success: true, report: report || { id: null } });
    } catch (error) {
        console.error('Copyright report error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Admin: list copyright reports
app.get('/api/admin/copyright-reports', authenticateToken, async (req, res) => {
    try {
        if (!req.user.is_admin) {
            return res.status(403).json({ error: 'Admin required' });
        }

        const status = req.query.status || 'pending';
        const reports = await db.getAll(`
            SELECT cr.*, t.title as track_title, u.username as uploader_username, t.moderation_status
            FROM copyright_reports cr
            JOIN tracks t ON cr.track_id = t.id
            LEFT JOIN users u ON t.uploader_id = u.id
            WHERE cr.status = $1 OR $1 = 'all'
            ORDER BY cr.created_at DESC
        `, [status === 'all' ? 'all' : status]);

        res.json({ reports: reports || [] });
    } catch (error) {
        console.error('List reports error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Admin: resolve a copyright report (remove or dismiss)
app.post('/api/admin/copyright-reports/:id/resolve', authenticateToken, async (req, res) => {
    try {
        if (!req.user.is_admin) {
            return res.status(403).json({ error: 'Admin required' });
        }

        const reportId = req.params.id;
        const { action, notes } = req.body;

        if (!isValidId(reportId) || !['removed', 'dismissed', 'reviewed'].includes(action)) {
            return res.status(400).json({ error: 'Invalid action' });
        }

        const report = await db.get('SELECT * FROM copyright_reports WHERE id = $1', [reportId]);
        if (!report) {
            return res.status(404).json({ error: 'Report not found' });
        }

        await db.query('BEGIN');

        if (action === 'removed') {
            // Block the track and increment strike counter on uploader
            await db.query(`
                UPDATE tracks SET moderation_status = 'blocked', is_available = false, updated_at = CURRENT_TIMESTAMP
                WHERE id = $1
            `, [report.track_id]);

            const track = await db.get('SELECT uploader_id FROM tracks WHERE id = $1', [report.track_id]);
            if (track && track.uploader_id) {
                await db.query(`
                    UPDATE users
                    SET copyright_strikes = copyright_strikes + 1,
                        upload_disabled = CASE WHEN copyright_strikes + 1 >= 3 THEN true ELSE upload_disabled END
                    WHERE id = $1
                `, [track.uploader_id]);
            }
        }

        await db.query(`
            UPDATE copyright_reports
            SET status = $1, admin_notes = $2, resolved_by_user_id = $3, resolved_at = CURRENT_TIMESTAMP
            WHERE id = $4
        `, [action, notes || null, req.user.id, reportId]);

        await db.query('COMMIT');
        res.json({ success: true, action });
    } catch (error) {
        try { await db.query('ROLLBACK'); } catch (_) {}
        console.error('Resolve report error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

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
            WHERE t.id::text = $1::text
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
            await db.query('DELETE FROM playlist_tracks WHERE track_id::text = $1::text', [trackId]);
            
            // 2. Aus Favoriten entfernen
            await db.query('DELETE FROM user_favorites WHERE track_id::text = $1::text', [trackId]);
            
            // 3. Likes entfernen
            await db.query('DELETE FROM likes WHERE track_id::text = $1::text', [trackId]);
            
            // 4. Kommentare entfernen (falls vorhanden)
            try {
                await db.query('DELETE FROM track_comments WHERE track_id::text = $1::text', [trackId]);
            } catch (_) {
                // Tabelle existiert nicht, ignorieren
            }
            
            // 5. Track selbst löschen
            await db.query('DELETE FROM tracks WHERE id::text = $1::text', [trackId]);
            
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


// Quick fix for users table columns (avatar_url, bio, etc.)
app.post('/fix-users-table', async (req, res) => {
    try {
        console.log('Adding missing columns to users table...');
        await db.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500)');
        await db.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT');
        await db.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name VARCHAR(100)');
        await db.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name VARCHAR(100)');
        await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_tier VARCHAR(20) DEFAULT 'free'`);
        console.log('Users table columns added successfully');
        
        res.json({ 
            success: true, 
            message: 'Users table columns added successfully' 
        });
    } catch (error) {
        console.error('Error fixing users table:', error);
        res.status(500).json({ error: error.message });
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
        
        // 🎯 Database Indexes für bessere Performance
        console.log('Creating database indexes...');
        await db.query('CREATE INDEX IF NOT EXISTS idx_tracks_artist_id ON tracks(artist_id)');
        await db.query('CREATE INDEX IF NOT EXISTS idx_tracks_album_id ON tracks(album_id)');
        await db.query('CREATE INDEX IF NOT EXISTS idx_tracks_uploader_id ON tracks(uploader_id)');
        await db.query('CREATE INDEX IF NOT EXISTS idx_tracks_created_at ON tracks(created_at DESC)');
        await db.query('CREATE INDEX IF NOT EXISTS idx_tracks_play_count ON tracks(play_count DESC)');
        await db.query('CREATE INDEX IF NOT EXISTS idx_tracks_is_available ON tracks(is_available)');
        await db.query('CREATE INDEX IF NOT EXISTS idx_tracks_genre ON tracks(genre)');
        await db.query('CREATE INDEX IF NOT EXISTS idx_tracks_title_search ON tracks USING gin(to_tsvector(\'english\', title))');
        
        await db.query('CREATE INDEX IF NOT EXISTS idx_artists_name ON artists(name)');
        await db.query('CREATE INDEX IF NOT EXISTS idx_albums_artist_id ON albums(artist_id)');
        await db.query('CREATE INDEX IF NOT EXISTS idx_albums_title ON albums(title)');
        
        await db.query('CREATE INDEX IF NOT EXISTS idx_playlist_tracks_playlist_id ON playlist_tracks(playlist_id)');
        await db.query('CREATE INDEX IF NOT EXISTS idx_playlist_tracks_track_id ON playlist_tracks(track_id)');
        await db.query('CREATE INDEX IF NOT EXISTS idx_user_favorites_user_id ON user_favorites(user_id)');
        await db.query('CREATE INDEX IF NOT EXISTS idx_user_favorites_track_id ON user_favorites(track_id)');
        await db.query('CREATE INDEX IF NOT EXISTS idx_likes_user_id ON likes(user_id)');
        await db.query('CREATE INDEX IF NOT EXISTS idx_likes_track_id ON likes(track_id)');
        
        console.log('Database indexes created successfully');
        
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


// Get stories for feed (users who uploaded recently with their avatar)
app.get('/api/stories', async (req, res) => {
    try {
        const stories = await db.getAll(`
            SELECT DISTINCT ON (u.id)
                u.id as user_id,
                u.username,
                u.avatar_url,
                t.id as latest_track_id,
                t.title as latest_track_title,
                t.cover_image_url as track_cover,
                t.created_at as uploaded_at
            FROM users u
            INNER JOIN tracks t ON t.uploader_id = u.id
            WHERE t.created_at > NOW() - INTERVAL '24 hours'
              AND COALESCE(t.is_available, true) = true
            ORDER BY u.id, t.created_at DESC
            LIMIT 20
        `);
        res.json(stories || []);
    } catch (error) {
        console.error('Get stories error:', error);
        res.status(500).json({ error: 'Internal server error' });
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

// Database setup endpoint (also runs on startup)
app.get('/setup-database', async (req, res) => {
    try {
        await initializeDatabase();
        res.json({ success: true, message: 'Database setup completed' });
    } catch (error) {
        console.error('/setup-database error:', error);
        res.status(500).json({ error: 'Database setup failed: ' + error.message });
    }
});

// Admin: Reset all users and create testuser (one-time setup endpoint)
app.post('/api/admin/reset-users', async (req, res) => {
    try {
        const { secret } = req.body;
        // Simple secret to prevent accidental calls
        if (secret !== 'juqe-reset-2024') {
            return res.status(403).json({ error: 'Invalid secret' });
        }

        // Delete all dependent records first
        try { await db.query('DELETE FROM user_favorites'); } catch (_) {}
        try { await db.query('DELETE FROM track_comments'); } catch (_) {}
        try { await db.query('DELETE FROM play_history'); } catch (_) {}
        try { await db.query('DELETE FROM user_sessions'); } catch (_) {}
        try { await db.query('DELETE FROM playlist_tracks'); } catch (_) {}
        try { await db.query('DELETE FROM playlists'); } catch (_) {}
        try { await db.query('DELETE FROM likes'); } catch (_) {}
        try { await db.query('DELETE FROM user_following_artists'); } catch (_) {}
        try { await db.query('DELETE FROM upload_credits'); } catch (_) {}
        try { await db.query('DELETE FROM artist_royalties'); } catch (_) {}

        // Delete all users
        await db.query('DELETE FROM users');

        // Create testuser with password 'testuser'
        const passwordHash = await bcrypt.hash('testuser', 10);
        let testUser;
        try {
            testUser = await db.insert('users', {
                username: 'testuser',
                email: 'testuser@juqeboks.de',
                password_hash: passwordHash,
                first_name: 'Test',
                last_name: 'User',
                is_admin: false,
            });
        } catch (insertErr) {
            console.error('Reset insert error:', insertErr.message);
            return res.status(500).json({ error: 'Failed to create user: ' + insertErr.message });
        }

        // Try to set extended fields (may fail if columns don't exist yet)
        try {
            await db.query(
                `UPDATE users SET email_verified = true, registration_paid = true,
                 account_type = 'user', subscription_tier = 'premium' WHERE id = $1`,
                [testUser.id]
            );
        } catch (updateErr) {
            console.error('Reset extended fields update (non-fatal):', updateErr.message);
        }

        res.json({
            success: true,
            message: 'All users deleted. Created testuser/testuser.',
            user: { id: testUser.id, username: testUser.username, email: testUser.email }
        });
    } catch (error) {
        console.error('Reset users error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Start server with error handling
const server = app.listen(PORT, () => {
    console.log(`🚀 JUKE Server running on port ${PORT}`);
    console.log(`📱 Health check: http://localhost:${PORT}/health`);
    console.log(`🔗 Keep-alive: http://localhost:${PORT}/keep-alive`);
    console.log(`⚙️  Database setup: http://localhost:${PORT}/setup-database`);

    // Initialize database schema and ensure admin user exists
    initializeDatabase().then(() => ensureAdminUser()).catch((err) => {
        console.error('Startup initialization error:', err.message);
    });
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