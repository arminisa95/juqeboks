// JUKE Monetization API Routes
// ============================

const express = require('express');
const MonetizationService = require('./payment-integration');
const { validateToken } = require('./js/api');
const { db } = require('./database/connection');
const router = express.Router();

const monetizationService = new MonetizationService();

// ========================================
// AUTHENTICATION MIDDLEWARE
// ========================================

const requireAuth = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const user = await validateToken(token);
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
        const credits = await monetizationService.getUploadCredits(req.user.id);

        res.json({
            success: true,
            subscription: {
                tier: user.subscription_tier || 'free',
                expiresAt: user.subscription_expires_at,
                cancelledAt: user.subscription_cancelled_at
            },
            credits: credits
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get available subscription plans
router.get('/subscription/plans', async (req, res) => {
    try {
        const plans = await monetizationService.query('SELECT * FROM subscription_plans ORDER BY price');
        res.json({ success: true, plans: plans.rows });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Create new subscription
router.post('/subscription/create', requireAuth, async (req, res) => {
    try {
        const { planId, paymentMethodId } = req.body;

        if (!planId) {
            return res.status(400).json({ success: false, error: 'Plan ID required' });
        }

        const result = await monetizationService.createSubscription(
            req.user.id,
            planId,
            paymentMethodId
        );

        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Cancel subscription
router.post('/subscription/cancel', requireAuth, async (req, res) => {
    try {
        const result = await monetizationService.cancelSubscription(req.user.id);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update subscription
router.post('/subscription/update', requireAuth, async (req, res) => {
    try {
        const { newPlanId } = req.body;

        if (!newPlanId) {
            return res.status(400).json({ success: false, error: 'New plan ID required' });
        }

        const result = await monetizationService.updateSubscription(req.user.id, newPlanId);
        res.json(result);
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
        const credits = await monetizationService.getUploadCredits(req.user.id);
        res.json({ success: true, credits });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Purchase upload credits
router.post('/credits/purchase', requireAuth, async (req, res) => {
    try {
        const { creditAmount } = req.body;

        if (!creditAmount || creditAmount <= 0) {
            return res.status(400).json({ success: false, error: 'Valid credit amount required' });
        }

        const result = await monetizationService.purchaseUploadCredits(req.user.id, creditAmount);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Consume upload credit (used when uploading track)
router.post('/credits/consume', requireAuth, async (req, res) => {
    try {
        const { trackId } = req.body;

        if (!trackId) {
            return res.status(400).json({ success: false, error: 'Track ID required' });
        }

        const result = await monetizationService.consumeUploadCredit(req.user.id, trackId);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get credit purchase history
router.get('/credits/history', requireAuth, async (req, res) => {
    try {
        const history = await monetizationService.query(
            'SELECT * FROM credit_purchases WHERE user_id = $1 ORDER BY created_at DESC',
            [req.user.id]
        );
        res.json({ success: true, history: history.rows });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========================================
// PROMOTIONAL CAMPAIGNS ROUTES
// ========================================

// Create promotional campaign
router.post('/campaigns', requireAuth, async (req, res) => {
    try {
        const campaignData = req.body;
        const result = await monetizationService.createPromotionalCampaign(req.user.id, campaignData);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get user's promotional campaigns
router.get('/campaigns', requireAuth, async (req, res) => {
    try {
        const result = await monetizationService.getPromotionalCampaigns(req.user.id);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get campaign analytics
router.get('/campaigns/:campaignId/analytics', requireAuth, async (req, res) => {
    try {
        const { campaignId } = req.params;
        const { startDate, endDate } = req.query;

        const analytics = await monetizationService.query(
            `SELECT date, impressions, clicks, conversions, cost 
            FROM campaign_analytics 
            WHERE campaign_id = $1 AND date BETWEEN $2 AND $3
            ORDER BY date`,
            [campaignId, startDate, endDate]
        );

        res.json({ success: true, analytics: analytics.rows });
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

        if (!startDate || !endDate) {
            return res.status(400).json({ success: false, error: 'Start and end dates required' });
        }

        const result = await monetizationService.getUserAnalytics(
            req.user.id,
            startDate,
            endDate
        );
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get platform revenue analytics (admin only)
router.get('/analytics/revenue', requireAuth, async (req, res) => {
    try {
        // Check if user is admin
        const user = await monetizationService.getUser(req.user.id);
        if (user.subscription_tier !== 'admin') {
            return res.status(403).json({ success: false, error: 'Admin access required' });
        }

        const { startDate, endDate } = req.query;

        if (!startDate || !endDate) {
            return res.status(400).json({ success: false, error: 'Start and end dates required' });
        }

        const result = await monetizationService.getPlatformRevenue(startDate, endDate);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========================================
// WEBHOOK ROUTES
// ========================================

// Stripe webhook handler
router.post('/webhook/stripe', async (req, res) => {
    try {
        const sig = req.headers['stripe-signature'];
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

        let event;

        try {
            event = require('stripe').webhooks.constructEvent(req.body, sig, webhookSecret);
        } catch (err) {
            console.log(`Webhook signature verification failed:`, err.message);
            return res.status(400).json({ error: 'Webhook signature verification failed' });
        }

        await monetizationService.handleStripeWebhook(event);
        res.json({ received: true });
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
});

// ========================================
// FEATURE FLAGS ROUTES
// ========================================

// Get feature flags for user
router.get('/features', requireAuth, async (req, res) => {
    try {
        const user = await monetizationService.getUser(req.user.id);
        const flags = await monetizationService.query('SELECT * FROM feature_flags WHERE enabled = true');

        // Filter flags based on user's subscription tier
        const availableFeatures = flags.rows.filter(flag => {
            // Check if feature is available for user's tier
            return monetizationService.hasFeature(user.subscription_tier, flag.feature_name);
        });

        res.json({ success: true, features: availableFeatures });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========================================
// BILLING ROUTES
// ========================================

// Get billing history
router.get('/billing/history', requireAuth, async (req, res) => {
    try {
        const transactions = await monetizationService.query(
            `SELECT st.*, sp.name as plan_name
            FROM subscription_transactions st
            LEFT JOIN subscription_plans sp ON st.plan_id = sp.id
            WHERE st.user_id = $1
            ORDER BY st.created_at DESC`,
            [req.user.id]
        );

        res.json({ success: true, transactions: transactions.rows });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update payment method
router.post('/billing/payment-method', requireAuth, async (req, res) => {
    try {
        const { paymentMethodId } = req.body;

        const customer = await monetizationService.getOrCreateCustomer(req.user.id);
        
        // Attach new payment method to customer
        await require('stripe')(process.env.STRIPE_SECRET_KEY).customers.update(customer.id, {
            invoice_settings: {
                default_payment_method: paymentMethodId,
            },
        });

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========================================
// MIDDLEWARE FOR UPLOAD CREDIT CHECK
// ========================================

// Middleware to check upload credits before allowing upload
const checkUploadCredits = async (req, res, next) => {
    try {
        const user = await monetizationService.getUser(req.user.id);
        
        // Premium+ users have unlimited uploads
        if (user.subscription_tier !== 'free') {
            return next();
        }

        const credits = await monetizationService.getUploadCredits(req.user.id);
        
        if (credits.credits <= 0) {
            return res.status(402).json({ 
                success: false, 
                error: 'No upload credits remaining',
                upgradeRequired: true,
                creditPurchaseUrl: '/monetization/credits'
            });
        }

        next();
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// ========================================
// EXPORTS
// ========================================

module.exports = router;
module.exports.checkUploadCredits = checkUploadCredits;
