-- JUKE Monetization Database Schema
-- =====================================

-- ========================================
-- 1. SUBSCRIPTION SYSTEM
-- ========================================

-- Extend users table for subscription management
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_tier VARCHAR(20) DEFAULT 'free' CHECK (subscription_tier IN ('free', 'premium', 'pro', 'label'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_id VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_used BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_cancelled_at TIMESTAMP WITH TIME ZONE;

-- Subscription plans table
CREATE TABLE IF NOT EXISTS subscription_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(50) NOT NULL UNIQUE,
    price DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'EUR',
    billing_interval VARCHAR(20) DEFAULT 'month' CHECK (billing_interval IN ('month', 'year')),
    features JSONB NOT NULL,
    max_upload_tracks INTEGER,
    max_storage_gb INTEGER,
    audio_quality VARCHAR(20) DEFAULT 'standard' CHECK (audio_quality IN ('standard', 'high', 'lossless')),
    can_create_playlists BOOLEAN DEFAULT true,
    max_playlists INTEGER,
    analytics_access BOOLEAN DEFAULT false,
    promotion_tools BOOLEAN DEFAULT false,
    api_access BOOLEAN DEFAULT false,
    priority_support BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Subscription transactions
CREATE TABLE IF NOT EXISTS subscription_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES subscription_plans(id),
    stripe_payment_intent_id VARCHAR(255),
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'EUR',
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
    billing_period_start TIMESTAMP WITH TIME ZONE,
    billing_period_end TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- 2. UPLOAD CREDITS SYSTEM
-- ========================================

-- Upload credits management
CREATE TABLE IF NOT EXISTS upload_credits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    credits INTEGER NOT NULL DEFAULT 3,
    last_reset DATE DEFAULT CURRENT_DATE,
    total_earned INTEGER DEFAULT 0,
    total_spent INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

-- Credit purchases
CREATE TABLE IF NOT EXISTS credit_purchases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    credits_purchased INTEGER NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'EUR',
    stripe_payment_intent_id VARCHAR(255),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Credit transactions (track uploads)
CREATE TABLE IF NOT EXISTS credit_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    track_id UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    credits_spent INTEGER DEFAULT 1,
    transaction_type VARCHAR(20) DEFAULT 'upload' CHECK (transaction_type IN ('upload', 'refund', 'bonus')),
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- 3. PROMOTION & MARKETING TOOLS
-- ========================================

-- Promotional campaigns
CREATE TABLE IF NOT EXISTS promotional_campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    campaign_name VARCHAR(200) NOT NULL,
    campaign_type VARCHAR(50) NOT NULL CHECK (campaign_type IN ('featured_track', 'featured_artist', 'sponsored_playlist', 'boost_play', 'banner_ad')),
    target_url VARCHAR(500),
    target_type VARCHAR(50) CHECK (target_type IN ('track', 'artist', 'playlist', 'profile')),
    target_id UUID,
    budget DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'EUR',
    daily_budget DECIMAL(10,2),
    impressions INTEGER DEFAULT 0,
    clicks INTEGER DEFAULT 0,
    conversions INTEGER DEFAULT 0,
    cost_per_click DECIMAL(10,2) DEFAULT 0.00,
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'cancelled')),
    targeting_criteria JSONB, -- age, location, genre, etc.
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Campaign analytics
CREATE TABLE IF NOT EXISTS campaign_analytics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID NOT NULL REFERENCES promotional_campaigns(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    impressions INTEGER DEFAULT 0,
    clicks INTEGER DEFAULT 0,
    cost DECIMAL(10,2) DEFAULT 0.00,
    conversions INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(campaign_id, date)
);

-- ========================================
-- 4. ADVERTISING SYSTEM
-- ========================================

-- Ad placements
CREATE TABLE IF NOT EXISTS ad_placements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    placement_name VARCHAR(100) NOT NULL UNIQUE,
    placement_type VARCHAR(50) NOT NULL CHECK (placement_type IN ('banner', 'audio_pre_roll', 'audio_mid_roll', 'popup', 'sidebar')),
    dimensions VARCHAR(50), -- "300x250", "728x90", etc.
    max_file_size_mb INTEGER DEFAULT 5,
    supported_formats JSONB, -- ["jpg", "png", "mp3", "mp4"]
    cpm_rate DECIMAL(10,2) DEFAULT 1.00, -- Cost per 1000 impressions
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Ad campaigns
CREATE TABLE IF NOT EXISTS ad_campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    advertiser_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    campaign_name VARCHAR(200) NOT NULL,
    placement_id UUID NOT NULL REFERENCES ad_placements(id),
    ad_creative_url VARCHAR(500),
    ad_destination_url VARCHAR(500),
    target_audience JSONB,
    budget DECIMAL(10,2) NOT NULL,
    daily_budget DECIMAL(10,2),
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE,
    impressions INTEGER DEFAULT 0,
    clicks INTEGER DEFAULT 0,
    ctr DECIMAL(5,4) DEFAULT 0.0000, -- Click-through rate
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- 5. ANALYTICS & METRICS
-- ========================================

-- User engagement metrics
CREATE TABLE IF NOT EXISTS user_analytics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    tracks_played INTEGER DEFAULT 0,
    minutes_listened INTEGER DEFAULT 0,
    tracks_uploaded INTEGER DEFAULT 0,
    playlists_created INTEGER DEFAULT 0,
    followers_gained INTEGER DEFAULT 0,
    revenue_generated DECIMAL(10,2) DEFAULT 0.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, date)
);

-- Platform revenue metrics
CREATE TABLE IF NOT EXISTS revenue_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    date DATE NOT NULL UNIQUE,
    subscription_revenue DECIMAL(10,2) DEFAULT 0.00,
    credit_purchase_revenue DECIMAL(10,2) DEFAULT 0.00,
    advertising_revenue DECIMAL(10,2) DEFAULT 0.00,
    promotion_revenue DECIMAL(10,2) DEFAULT 0.00,
    total_revenue DECIMAL(10,2) DEFAULT 0.00,
    active_users INTEGER DEFAULT 0,
    paying_users INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- 6. FEATURE FLAGS & CONTROLS
-- ========================================

-- Feature flags for monetization
CREATE TABLE IF NOT EXISTS feature_flags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    feature_name VARCHAR(100) NOT NULL UNIQUE,
    enabled BOOLEAN DEFAULT false,
    rollout_percentage INTEGER DEFAULT 0, -- 0-100 for gradual rollout
    user_whitelist JSONB, -- Specific users to enable/disable for
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- 7. INDEXES FOR PERFORMANCE
-- ========================================

-- Subscription indexes
CREATE INDEX IF NOT EXISTS idx_users_subscription_tier ON users(subscription_tier);
CREATE INDEX IF NOT EXISTS idx_users_subscription_expires ON users(subscription_expires_at);
CREATE INDEX IF NOT EXISTS idx_subscription_transactions_user_id ON subscription_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscription_transactions_status ON subscription_transactions(status);

-- Credit system indexes
CREATE INDEX IF NOT EXISTS idx_upload_credits_user_id ON upload_credits(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_purchases_user_id ON credit_purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id ON credit_transactions(user_id);

-- Promotion indexes
CREATE INDEX IF NOT EXISTS idx_promotional_campaigns_user_id ON promotional_campaigns(user_id);
CREATE INDEX IF NOT EXISTS idx_promotional_campaigns_status ON promotional_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaign_analytics_campaign_id ON campaign_analytics(campaign_id);

-- Advertising indexes
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_advertiser_id ON ad_campaigns(advertiser_id);
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_status ON ad_campaigns(status);

-- Analytics indexes
CREATE INDEX IF NOT EXISTS idx_user_analytics_user_id ON user_analytics(user_id);
CREATE INDEX IF NOT EXISTS idx_user_analytics_date ON user_analytics(date);
CREATE INDEX IF NOT EXISTS idx_revenue_metrics_date ON revenue_metrics(date);

-- ========================================
-- 8. TRIGGERS FOR AUTOMATIC UPDATES
-- ========================================

-- Update user analytics when tracks are uploaded
CREATE OR REPLACE FUNCTION update_user_upload_analytics()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO user_analytics (user_id, date, tracks_uploaded)
    VALUES (NEW.uploader_id, CURRENT_DATE, 1)
    ON CONFLICT (user_id, date)
    DO UPDATE SET 
        tracks_uploaded = user_analytics.tracks_uploaded + 1,
        updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_user_upload_analytics_trigger
    AFTER INSERT ON tracks
    FOR EACH ROW EXECUTE FUNCTION update_user_upload_analytics();

-- Update play history analytics
CREATE OR REPLACE FUNCTION update_user_play_analytics()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO user_analytics (user_id, date, tracks_played, minutes_listened)
    VALUES (NEW.user_id, CURRENT_DATE, 1, COALESCE(NEW.duration_played, 0) / 60)
    ON CONFLICT (user_id, date)
    DO UPDATE SET 
        tracks_played = user_analytics.tracks_played + 1,
        minutes_listened = user_analytics.minutes_listened + COALESCE(NEW.duration_played, 0) / 60,
        updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_user_play_analytics_trigger
    AFTER INSERT ON play_history
    FOR EACH ROW EXECUTE FUNCTION update_user_play_analytics();

-- ========================================
-- 9. SAMPLE DATA FOR TESTING
-- ========================================

-- Insert subscription plans
INSERT INTO subscription_plans (name, price, features, max_upload_tracks, max_storage_gb, audio_quality, max_playlists, analytics_access, promotion_tools, api_access, priority_support) VALUES
('free', 0.00, '{"upload_limit": 3, "ads": true, "basic_quality": true}', 3, 1, 'standard', 5, false, false, false, false),
('premium', 9.99, '{"unlimited_uploads": true, "no_ads": true, "high_quality": true}', -1, 10, 'high', 50, true, false, false, false),
('pro', 19.99, '{"unlimited_uploads": true, "no_ads": true, "lossless_quality": true, "analytics": true}', -1, 50, 'lossless', -1, true, true, true, true),
('label', 99.99, '{"multi_artist": true, "advanced_analytics": true, "api_access": true, "priority_support": true}', -1, 500, 'lossless', -1, true, true, true, true)
ON CONFLICT (name) DO NOTHING;

-- Insert feature flags
INSERT INTO feature_flags (feature_name, enabled, rollout_percentage) VALUES
('subscription_system', false, 0),
('upload_credits', false, 0),
('promotional_campaigns', false, 0),
('advertising_system', false, 0),
('analytics_dashboard', false, 0)
ON CONFLICT (feature_name) DO NOTHING;

-- ========================================
-- 10. COMPLETION
-- ========================================

-- Monetization schema created successfully!
-- Ready for integration with payment providers and analytics systems
