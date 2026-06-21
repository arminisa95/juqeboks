// JUKE Monetization - Payment Integration
// ======================================

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_dummy');
const { query, getTransaction } = require('../database/connection');

class MonetizationService {
    
    constructor() {
        this.plans = {
            free: { price: 0, features: ['3 uploads', 'basic quality', 'ads'] },
            premium: { price: 9.99, features: ['unlimited uploads', 'high quality', 'no ads', 'basic analytics'] },
            pro: { price: 19.99, features: ['unlimited uploads', 'lossless quality', 'no ads', 'advanced analytics', 'promotion tools'] },
            label: { price: 99.99, features: ['multi-artist', 'advanced analytics', 'white-label', 'api access'] }
        };
    }

    // ========================================
    // SUBSCRIPTION MANAGEMENT
    // ========================================

    async createSubscription(userId, planId, paymentMethodId) {
        try {
            const plan = await this.getPlan(planId);
            if (!plan) {
                throw new Error('Invalid plan selected');
            }

            // Create Stripe customer if not exists
            const customer = await this.getOrCreateCustomer(userId);

            // Create Stripe subscription
            const subscription = await stripe.subscriptions.create({
                customer: customer.id,
                items: [{
                    price: this.getStripePriceId(planId),
                }],
                payment_behavior: 'default_incomplete',
                payment_settings: {
                    save_default_payment_method: 'on_subscription',
                    payment_method_types: ['card'],
                },
                expand: ['latest_invoice.payment_intent'],
            });

            // Save subscription to database
            await this.saveSubscription(userId, subscription, planId);

            return {
                success: true,
                subscriptionId: subscription.id,
                clientSecret: subscription.latest_invoice.payment_intent.client_secret
            };
        } catch (error) {
            console.error('Subscription creation error:', error);
            return { success: false, error: error.message };
        }
    }

    async cancelSubscription(userId) {
        try {
            const subscription = await this.getUserSubscription(userId);
            if (!subscription) {
                throw new Error('No active subscription found');
            }

            // Cancel in Stripe
            await stripe.subscriptions.del(subscription.stripe_subscription_id);

            // Update database
            await query(
                'UPDATE users SET subscription_tier = $1, subscription_cancelled_at = CURRENT_TIMESTAMP WHERE id = $2',
                ['free', userId]
            );

            return { success: true };
        } catch (error) {
            console.error('Subscription cancellation error:', error);
            return { success: false, error: error.message };
        }
    }

    async updateSubscription(userId, newPlanId) {
        try {
            const currentSubscription = await this.getUserSubscription(userId);
            if (!currentSubscription) {
                throw new Error('No active subscription found');
            }

            const newPlan = await this.getPlan(newPlanId);
            if (!newPlan) {
                throw new Error('Invalid plan selected');
            }

            // Update in Stripe
            const subscription = await stripe.subscriptions.retrieve(currentSubscription.stripe_subscription_id);
            const updatedSubscription = await stripe.subscriptions.update(subscription.id, {
                items: [{
                    id: subscription.items.data[0].id,
                    price: this.getStripePriceId(newPlanId),
                }],
            });

            // Update database
            await query(
                'UPDATE users SET subscription_tier = $1 WHERE id = $2',
                [newPlanId, userId]
            );

            return { success: true, subscription: updatedSubscription };
        } catch (error) {
            console.error('Subscription update error:', error);
            return { success: false, error: error.message };
        }
    }

    // ========================================
    // UPLOAD CREDITS SYSTEM
    // ========================================

    async getUploadCredits(userId) {
        const result = await query(
            'SELECT credits, last_reset FROM upload_credits WHERE user_id = $1',
            [userId]
        );
        
        if (result.rows.length === 0) {
            // Create initial credits for new user
            await this.initializeUploadCredits(userId);
            return { credits: 3, last_reset: new Date() };
        }

        const credits = result.rows[0];
        
        // Reset credits monthly for free users
        const user = await this.getUser(userId);
        if (user.subscription_tier === 'free') {
            const lastReset = new Date(credits.last_reset);
            const now = new Date();
            
            if (lastReset.getMonth() !== now.getMonth() || lastReset.getFullYear() !== now.getFullYear()) {
                await this.resetMonthlyCredits(userId);
                return { credits: 3, last_reset: now };
            }
        }

        return credits;
    }

    async consumeUploadCredit(userId, trackId) {
        const user = await this.getUser(userId);
        
        // Premium+ users have unlimited uploads
        if (user.subscription_tier !== 'free') {
            await this.logCreditTransaction(userId, trackId, 0, 'upload', 'Unlimited upload (premium)');
            return { success: true, creditsRemaining: -1 }; // -1 indicates unlimited
        }

        const credits = await this.getUploadCredits(userId);
        
        if (credits.credits <= 0) {
            return { success: false, error: 'No upload credits remaining' };
        }

        // Consume credit
        await query(
            'UPDATE upload_credits SET credits = credits - 1 WHERE user_id = $1',
            [userId]
        );

        await this.logCreditTransaction(userId, trackId, 1, 'upload', 'Track upload');

        const remainingCredits = await this.getUploadCredits(userId);
        return { success: true, creditsRemaining: remainingCredits.credits };
    }

    async purchaseUploadCredits(userId, creditAmount) {
        try {
            const pricePerCredit = 2.99; // €2.99 per credit
            const totalPrice = creditAmount * pricePerCredit;

            const customer = await this.getOrCreateCustomer(userId);

            // Create payment intent
            const paymentIntent = await stripe.paymentIntents.create({
                amount: Math.round(totalPrice * 100), // Convert to cents
                currency: 'eur',
                customer: customer.id,
                metadata: {
                    user_id: userId,
                    credit_amount: creditAmount,
                    type: 'upload_credits'
                }
            });

            return {
                success: true,
                clientSecret: paymentIntent.client_secret,
                totalPrice: totalPrice,
                creditAmount: creditAmount
            };
        } catch (error) {
            console.error('Credit purchase error:', error);
            return { success: false, error: error.message };
        }
    }

    async fulfillCreditPurchase(paymentIntentId) {
        try {
            const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
            
            if (paymentIntent.status !== 'succeeded') {
                return { success: false, error: 'Payment not successful' };
            }

            const userId = paymentIntent.metadata.user_id;
            const creditAmount = parseInt(paymentIntent.metadata.credit_amount);

            // Add credits to user account
            await query(
                'UPDATE upload_credits SET credits = credits + $1, total_earned = total_earned + $1 WHERE user_id = $2',
                [creditAmount, userId]
            );

            // Log purchase
            await query(
                'INSERT INTO credit_purchases (user_id, credits_purchased, price, status) VALUES ($1, $2, $3, $4)',
                [userId, creditAmount, paymentIntent.amount / 100, 'completed']
            );

            return { success: true, creditsAdded: creditAmount };
        } catch (error) {
            console.error('Credit fulfillment error:', error);
            return { success: false, error: error.message };
        }
    }

    // ========================================
    // PROMOTIONAL CAMPAIGNS
    // ========================================

    async createPromotionalCampaign(userId, campaignData) {
        try {
            const user = await this.getUser(userId);
            
            // Check if user has promotion tools access
            if (!this.hasFeature(user.subscription_tier, 'promotion_tools')) {
                throw new Error('Promotion tools not available in your plan');
            }

            const campaign = await query(
                `INSERT INTO promotional_campaigns 
                (user_id, campaign_name, campaign_type, target_url, target_type, target_id, budget, daily_budget, start_date, end_date, targeting_criteria)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                RETURNING *`,
                [
                    userId,
                    campaignData.name,
                    campaignData.type,
                    campaignData.targetUrl,
                    campaignData.targetType,
                    campaignData.targetId,
                    campaignData.budget,
                    campaignData.dailyBudget,
                    campaignData.startDate,
                    campaignData.endDate,
                    JSON.stringify(campaignData.targeting)
                ]
            );

            return { success: true, campaign: campaign.rows[0] };
        } catch (error) {
            console.error('Campaign creation error:', error);
            return { success: false, error: error.message };
        }
    }

    async getPromotionalCampaigns(userId) {
        try {
            const campaigns = await query(
                'SELECT * FROM promotional_campaigns WHERE user_id = $1 ORDER BY created_at DESC',
                [userId]
            );

            return { success: true, campaigns: campaigns.rows };
        } catch (error) {
            console.error('Campaign retrieval error:', error);
            return { success: false, error: error.message };
        }
    }

    // ========================================
    // ANALYTICS & METRICS
    // ========================================

    async getUserAnalytics(userId, startDate, endDate) {
        try {
            const user = await this.getUser(userId);
            
            if (!this.hasFeature(user.subscription_tier, 'analytics_access')) {
                throw new Error('Analytics not available in your plan');
            }

            const analytics = await query(
                `SELECT date, tracks_played, minutes_listened, tracks_uploaded, 
                        playlists_created, followers_gained, revenue_generated
                FROM user_analytics 
                WHERE user_id = $1 AND date BETWEEN $2 AND $3
                ORDER BY date`,
                [userId, startDate, endDate]
            );

            // Calculate aggregates
            const aggregates = analytics.rows.reduce((acc, row) => {
                acc.totalPlays += row.tracks_played;
                acc.totalMinutes += row.minutes_listened;
                acc.totalUploads += row.tracks_uploaded;
                acc.totalPlaylists += row.playlists_created;
                acc.totalFollowers += row.followers_gained;
                acc.totalRevenue += parseFloat(row.revenue_generated);
                return acc;
            }, {
                totalPlays: 0,
                totalMinutes: 0,
                totalUploads: 0,
                totalPlaylists: 0,
                totalFollowers: 0,
                totalRevenue: 0
            });

            return { 
                success: true, 
                dailyData: analytics.rows,
                aggregates: aggregates
            };
        } catch (error) {
            console.error('Analytics retrieval error:', error);
            return { success: false, error: error.message };
        }
    }

    async getPlatformRevenue(startDate, endDate) {
        try {
            const revenue = await query(
                `SELECT date, subscription_revenue, credit_purchase_revenue, 
                        advertising_revenue, promotion_revenue, total_revenue,
                        active_users, paying_users
                FROM revenue_metrics 
                WHERE date BETWEEN $1 AND $2
                ORDER BY date`,
                [startDate, endDate]
            );

            const totals = revenue.rows.reduce((acc, row) => {
                acc.totalSubscriptionRevenue += parseFloat(row.subscription_revenue);
                acc.totalCreditRevenue += parseFloat(row.credit_purchase_revenue);
                acc.totalAdRevenue += parseFloat(row.advertising_revenue);
                acc.totalPromotionRevenue += parseFloat(row.promotion_revenue);
                acc.totalRevenue += parseFloat(row.total_revenue);
                return acc;
            }, {
                totalSubscriptionRevenue: 0,
                totalCreditRevenue: 0,
                totalAdRevenue: 0,
                totalPromotionRevenue: 0,
                totalRevenue: 0
            });

            return { 
                success: true, 
                dailyData: revenue.rows,
                totals: totals
            };
        } catch (error) {
            console.error('Revenue analytics error:', error);
            return { success: false, error: error.message };
        }
    }

    // ========================================
    // HELPER METHODS
    // ========================================

    async getUser(userId) {
        const result = await query('SELECT * FROM users WHERE id = $1', [userId]);
        return result.rows[0];
    }

    async getPlan(planId) {
        const result = await query('SELECT * FROM subscription_plans WHERE name = $1', [planId]);
        return result.rows[0];
    }

    async getUserSubscription(userId) {
        const result = await query(
            'SELECT * FROM subscription_transactions WHERE user_id = $1 AND status = $2 ORDER BY created_at DESC LIMIT 1',
            [userId, 'completed']
        );
        return result.rows[0];
    }

    async getOrCreateCustomer(userId) {
        const user = await this.getUser(userId);
        
        if (user.stripe_customer_id) {
            return await stripe.customers.retrieve(user.stripe_customer_id);
        }

        const customer = await stripe.customers.create({
            email: user.email,
            name: `${user.first_name} ${user.last_name}`,
            metadata: {
                user_id: userId
            }
        });

        await query(
            'UPDATE users SET stripe_customer_id = $1 WHERE id = $2',
            [customer.id, userId]
        );

        return customer;
    }

    async saveSubscription(userId, stripeSubscription, planId) {
        await query(
            `INSERT INTO subscription_transactions 
            (user_id, plan_id, stripe_payment_intent_id, amount, status, billing_period_start, billing_period_end)
            VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
                userId,
                planId,
                stripeSubscription.latest_invoice.payment_intent.id,
                stripeSubscription.latest_invoice.amount / 100,
                'completed',
                new Date(stripeSubscription.current_period_start * 1000),
                new Date(stripeSubscription.current_period_end * 1000)
            ]
        );

        await query(
            'UPDATE users SET subscription_tier = $1, subscription_expires_at = $2 WHERE id = $3',
            [planId, new Date(stripeSubscription.current_period_end * 1000), userId]
        );
    }

    async initializeUploadCredits(userId) {
        await query(
            'INSERT INTO upload_credits (user_id, credits, last_reset) VALUES ($1, $2, CURRENT_DATE)',
            [userId, 3]
        );
    }

    async resetMonthlyCredits(userId) {
        await query(
            'UPDATE upload_credits SET credits = 3, last_reset = CURRENT_DATE WHERE user_id = $1',
            [userId]
        );
    }

    async logCreditTransaction(userId, trackId, creditsSpent, transactionType, description) {
        await query(
            'INSERT INTO credit_transactions (user_id, track_id, credits_spent, transaction_type, description) VALUES ($1, $2, $3, $4, $5)',
            [userId, trackId, creditsSpent, transactionType, description]
        );
    }

    getStripePriceId(planId) {
        // These would be created in Stripe dashboard
        const priceIds = {
            free: null,
            premium: 'price_premium_monthly',
            pro: 'price_pro_monthly',
            label: 'price_label_monthly'
        };
        return priceIds[planId];
    }

    hasFeature(tier, feature) {
        const features = {
            free: ['basic_uploads', 'basic_quality', 'ads'],
            premium: ['unlimited_uploads', 'high_quality', 'no_ads', 'basic_analytics'],
            pro: ['unlimited_uploads', 'lossless_quality', 'no_ads', 'advanced_analytics', 'promotion_tools', 'api_access'],
            label: ['multi_artist', 'advanced_analytics', 'white_label', 'api_access', 'priority_support']
        };
        
        return features[tier] && features[tier].includes(feature);
    }

    // ========================================
    // WEBHOOK HANDLERS
    // ========================================

    async handleStripeWebhook(event) {
        switch (event.type) {
            case 'invoice.payment_succeeded':
                await this.handlePaymentSucceeded(event.data.object);
                break;
            case 'invoice.payment_failed':
                await this.handlePaymentFailed(event.data.object);
                break;
            case 'customer.subscription.deleted':
                await this.handleSubscriptionDeleted(event.data.object);
                break;
            case 'payment_intent.succeeded':
                await this.handlePaymentIntentSucceeded(event.data.object);
                break;
            default:
                console.log(`Unhandled webhook event: ${event.type}`);
        }
    }

    async handlePaymentSucceeded(invoice) {
        const subscriptionId = invoice.subscription;
        const customerId = invoice.customer;

        // Update subscription status in database
        await query(
            `UPDATE subscription_transactions 
            SET status = 'completed', billing_period_end = $1
            WHERE stripe_payment_intent_id = $2`,
            [new Date(invoice.period_end * 1000), invoice.payment_intent]
        );
    }

    async handlePaymentFailed(invoice) {
        // Handle failed payment - notify user, retry logic, etc.
        console.log(`Payment failed for customer: ${invoice.customer}`);
        
        // Update subscription status
        await query(
            'UPDATE subscription_transactions SET status = $3 WHERE stripe_payment_intent_id = $1',
            [invoice.payment_intent, 'failed']
        );
    }

    async handleSubscriptionDeleted(subscription) {
        // Find user by subscription and update to free tier
        await query(
            'UPDATE users SET subscription_tier = $1, subscription_cancelled_at = CURRENT_TIMESTAMP WHERE stripe_customer_id = $2',
            ['free', subscription.customer]
        );
    }

    async handlePaymentIntentSucceeded(paymentIntent) {
        if (paymentIntent.metadata.type === 'upload_credits') {
            await this.fulfillCreditPurchase(paymentIntent.id);
        }
    }
}

module.exports = MonetizationService;
