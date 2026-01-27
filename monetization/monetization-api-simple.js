// JUKE Monetization API Routes - Simplified Version
// ===============================================

const express = require('express');
const { db } = require('./database/connection');
const router = express.Router();

// ========================================
// AUTHENTICATION MIDDLEWARE
// ========================================

const requireAuth = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) {
            return res.status(401).json({ error: 'No token provided' });
        }

        // Simple token validation (you can enhance this)
        const user = await db.get('SELECT * FROM users WHERE id = ?', [token]);
        if (!user) {
            return res.status(401).json({ error: 'Invalid token' });
        }

        req.user = user;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Authentication failed' });
    }
};

// ========================================
// SUBSCRIPTION ROUTES
// ========================================

// Get current subscription status
router.get('/subscription/status', requireAuth, async (req, res) => {
    try {
        const user = await db.get('SELECT * FROM users WHERE id = ?', [req.user.id]);
        
        res.json({
            success: true,
            subscription: {
                tier: user.subscription_tier || 'free',
                expiresAt: user.subscription_expires_at,
                cancelledAt: user.subscription_cancelled_at
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========================================
// UPLOAD CREDITS ROUTES
// ========================================

// Get upload credits
router.get('/credits', requireAuth, async (req, res) => {
    try {
        // Check if upload_credits table exists, if not create it
        await db.run(`
            CREATE TABLE IF NOT EXISTS upload_credits (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                credits INTEGER NOT NULL DEFAULT 3,
                last_reset DATE DEFAULT CURRENT_DATE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id)
            )
        `);

        let credits = await db.get('SELECT credits FROM upload_credits WHERE user_id = ?', [req.user.id]);
        
        if (!credits) {
            // Initialize credits for new user
            await db.run('INSERT INTO upload_credits (user_id, credits) VALUES (?, ?)', [req.user.id, 3]);
            credits = { credits: 3 };
        }

        res.json({ success: true, credits: credits.credits });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Consume upload credit
router.post('/credits/consume', requireAuth, async (req, res) => {
    try {
        const { trackId } = req.body;

        const user = await db.get('SELECT subscription_tier FROM users WHERE id = ?', [req.user.id]);
        
        // Premium+ users have unlimited uploads
        if (user.subscription_tier !== 'free') {
            return res.json({ success: true, creditsRemaining: -1 });
        }

        let credits = await db.get('SELECT credits FROM upload_credits WHERE user_id = ?', [req.user.id]);
        
        if (!credits || credits.credits <= 0) {
            return res.status(402).json({ 
                success: false, 
                error: 'No upload credits remaining. Upgrade to Premium for unlimited uploads.',
                upgradeRequired: true,
                subscriptionUrl: '/html/subscription-plans.html'
            });
        }

        // Consume credit
        await db.run('UPDATE upload_credits SET credits = credits - 1 WHERE user_id = ?', [req.user.id]);
        
        credits = await db.get('SELECT credits FROM upload_credits WHERE user_id = ?', [req.user.id]);

        res.json({ success: true, creditsRemaining: credits.credits });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========================================
// ANALYTICS ROUTES
// ========================================

// Get user analytics
router.get('/analytics/user', requireAuth, async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        
        // Demo analytics data (you can enhance this with real data)
        const analytics = {
            dailyData: [],
            aggregates: {
                totalPlays: Math.floor(Math.random() * 1000) + 100,
                totalMinutes: Math.floor(Math.random() * 5000) + 500,
                totalUploads: Math.floor(Math.random() * 20) + 1,
                totalFollowers: Math.floor(Math.random() * 50) + 5
            }
        };

        // Generate daily data for the date range
        if (startDate && endDate) {
            const start = new Date(startDate);
            const end = new Date(endDate);
            const daysDiff = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
            
            for (let i = 0; i < daysDiff; i++) {
                const date = new Date(start);
                date.setDate(date.getDate() + i);
                analytics.dailyData.push({
                    date: date.toISOString().split('T')[0],
                    tracks_played: Math.floor(Math.random() * 50) + 5,
                    minutes_listened: Math.floor(Math.random() * 200) + 20,
                    tracks_uploaded: Math.floor(Math.random() * 2),
                    playlists_created: Math.floor(Math.random() * 1),
                    followers_gained: Math.floor(Math.random() * 2),
                    revenue_generated: 0
                });
            }
        }

        res.json(analytics);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========================================
// FEATURE FLAGS
// ========================================

// Get available features for user
router.get('/features', requireAuth, async (req, res) => {
    try {
        const user = await db.get('SELECT subscription_tier FROM users WHERE id = ?', [req.user.id]);
        
        const features = {
            free: ['basic_uploads', 'basic_quality', 'ads'],
            premium: ['unlimited_uploads', 'high_quality', 'no_ads', 'basic_analytics'],
            pro: ['unlimited_uploads', 'lossless_quality', 'no_ads', 'advanced_analytics', 'promotion_tools'],
            label: ['multi_artist', 'advanced_analytics', 'white_label', 'api_access', 'priority_support']
        };

        const availableFeatures = features[user.subscription_tier] || features.free;

        res.json({ 
            success: true, 
            features: availableFeatures,
            tier: user.subscription_tier || 'free'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
