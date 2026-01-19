-- JUKE Music Streaming Platform Database Schema - FIXED VERSION
-- PostgreSQL 14+ - All errors corrected

-- Create database (run this separately)
-- CREATE DATABASE juke_db;
-- \c juke_db;

-- Enable UUID extension for unique IDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ========================================
-- CORE ENTITY TABLES
-- ========================================

-- Users table - FIXED: Added proper constraints
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    avatar_url VARCHAR(500),
    bio TEXT,
    subscription_tier VARCHAR(20) DEFAULT 'free' CHECK (subscription_tier IN ('free', 'premium', 'family')),
    is_active BOOLEAN DEFAULT true,
    email_verified BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Artists table - CORRECT: Already proper
CREATE TABLE artists (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(200) NOT NULL,
    bio TEXT,
    image_url VARCHAR(500),
    website_url VARCHAR(500),
    social_links JSONB,
    verified BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Albums table - CORRECT: Already proper
CREATE TABLE albums (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(200) NOT NULL,
    artist_id UUID NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
    release_date DATE,
    cover_image_url VARCHAR(500),
    description TEXT,
    genre VARCHAR(100),
    label VARCHAR(200),
    total_tracks INTEGER DEFAULT 0,
    duration_seconds INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tracks table - FIXED: Removed SET type, proper UUID references
CREATE TABLE tracks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(200) NOT NULL,
    uploader_id UUID REFERENCES users(id) ON DELETE SET NULL,
    artist_id UUID NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
    album_id UUID REFERENCES albums(id) ON DELETE SET NULL,
    album VARCHAR(200) DEFAULT 'Single',
    cover_image_url VARCHAR(500),
    audio_url VARCHAR(500),
    video_url VARCHAR(500),
    file_path VARCHAR(500) NOT NULL,
    file_size BIGINT,
    duration_seconds INTEGER NOT NULL,
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

-- ========================================
-- PLAYLIST SYSTEM
-- ========================================

-- Playlists table - FIXED: Complete implementation
CREATE TABLE playlists (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    cover_image_url VARCHAR(500),
    is_public BOOLEAN DEFAULT false,
    is_collaborative BOOLEAN DEFAULT false,
    track_count INTEGER DEFAULT 0,
    total_duration INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Playlist tracks (many-to-many relationship) - FIXED: Complete implementation
CREATE TABLE playlist_tracks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    playlist_id UUID NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
    track_id UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    added_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    added_by UUID REFERENCES users(id) ON DELETE SET NULL,
    position INTEGER NOT NULL,
    UNIQUE(playlist_id, position)
);

-- ========================================
-- SOCIAL FEATURES
-- ========================================

-- User favorites (liked tracks) - FIXED: Correct UNIQUE constraint
CREATE TABLE user_favorites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    track_id UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, track_id)  -- FIXED: This allows one like per user per track
);

-- Track comments - CORRECT: Already proper
CREATE TABLE track_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    track_id UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- User following artists - FIXED: Correct UNIQUE constraint
CREATE TABLE user_following_artists (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    artist_id UUID NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, artist_id)  -- FIXED: This allows one follow per user per artist
);

-- ========================================
-- ANALYTICS & SESSIONS
-- ========================================

-- Play history - FIXED: Removed invalid columns, proper structure
CREATE TABLE play_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    track_id UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    played_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    duration_played INTEGER, -- seconds actually played
    device_type VARCHAR(50),
    source_type VARCHAR(50) -- 'playlist', 'album', 'artist', 'search', etc.
);

-- User sessions for authentication - CORRECT: Already proper
CREATE TABLE user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ip_address INET,
    user_agent TEXT
);

-- ========================================
-- UPLOAD SYSTEM
-- ========================================

-- Upload queue for processing new tracks - FIXED: Proper status constraint
CREATE TABLE upload_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    original_file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_size BIGINT NOT NULL,
    mime_type VARCHAR(100),
    upload_status VARCHAR(20) DEFAULT 'pending' CHECK (upload_status IN ('pending', 'processing', 'completed', 'failed')),
    processing_log TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP WITH TIME ZONE
);

-- ========================================
-- INDEXES FOR PERFORMANCE
-- ========================================

-- User authentication indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);

-- Track discovery indexes
CREATE INDEX idx_tracks_artist_id ON tracks(artist_id);
CREATE INDEX idx_tracks_album_id ON tracks(album_id);
CREATE INDEX idx_tracks_title ON tracks USING gin(to_tsvector('english', title));
CREATE INDEX idx_artists_name ON artists USING gin(to_tsvector('english', name));

-- Playlist indexes
CREATE INDEX idx_playlists_user_id ON playlists(user_id);
CREATE INDEX idx_playlists_is_public ON playlists(is_public);
CREATE INDEX idx_playlist_tracks_playlist_id ON playlist_tracks(playlist_id);
CREATE INDEX idx_playlist_tracks_track_id ON playlist_tracks(track_id);

-- Social feature indexes
CREATE INDEX idx_user_favorites_user_id ON user_favorites(user_id);
CREATE INDEX idx_user_favorites_track_id ON user_favorites(track_id);
CREATE INDEX idx_track_comments_track_id ON track_comments(track_id);
CREATE INDEX idx_track_comments_user_id ON track_comments(user_id);
CREATE INDEX idx_user_following_artists_user_id ON user_following_artists(user_id);
CREATE INDEX idx_user_following_artists_artist_id ON user_following_artists(artist_id);

-- Analytics indexes
CREATE INDEX idx_play_history_user_id ON play_history(user_id);
CREATE INDEX idx_play_history_track_id ON play_history(track_id);
CREATE INDEX idx_play_history_played_at ON play_history(played_at);

-- Session indexes
CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_token ON user_sessions(session_token);

-- Upload queue indexes
CREATE INDEX idx_upload_queue_user_id ON upload_queue(user_id);
CREATE INDEX idx_upload_queue_status ON upload_queue(upload_status);

-- ========================================
-- TRIGGERS FOR AUTOMATIC UPDATES
-- ========================================

-- Trigger function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers to tables with updated_at columns
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_artists_updated_at BEFORE UPDATE ON artists FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_albums_updated_at BEFORE UPDATE ON albums FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_tracks_updated_at BEFORE UPDATE ON tracks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_playlists_updated_at BEFORE UPDATE ON playlists FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to update playlist track count and duration
CREATE OR REPLACE FUNCTION update_playlist_stats()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' OR TG_OP = 'DELETE' THEN
        UPDATE playlists 
        SET 
            track_count = (SELECT COUNT(*) FROM playlist_tracks WHERE playlist_id = COALESCE(NEW.playlist_id, OLD.playlist_id)),
            total_duration = (SELECT COALESCE(SUM(t.duration_seconds), 0) 
                              FROM playlist_tracks pt 
                              JOIN tracks t ON pt.track_id = t.id 
                              WHERE pt.playlist_id = COALESCE(NEW.playlist_id, OLD.playlist_id))
        WHERE id = COALESCE(NEW.playlist_id, OLD.playlist_id);
    END IF;
    
    IF TG_OP = 'UPDATE' THEN
        -- Handle position changes if needed
        NULL;
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ language 'plpgsql';

-- Add triggers for playlist stats
CREATE TRIGGER update_playlist_stats_trigger
    AFTER INSERT OR DELETE ON playlist_tracks
    FOR EACH ROW EXECUTE FUNCTION update_playlist_stats();

-- Function to update track play count
CREATE OR REPLACE FUNCTION increment_play_count()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE tracks 
    SET play_count = play_count + 1 
    WHERE id = NEW.track_id;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add trigger for play count
CREATE TRIGGER increment_play_count_trigger
    AFTER INSERT ON play_history
    FOR EACH ROW EXECUTE FUNCTION increment_play_count();

-- Function to update album stats
CREATE OR REPLACE FUNCTION update_album_stats()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' OR TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND OLD.album_id IS DISTINCT FROM NEW.album_id) THEN
        UPDATE albums 
        SET 
            total_tracks = (SELECT COUNT(*) FROM tracks WHERE album_id = COALESCE(NEW.album_id, OLD.album_id)),
            duration_seconds = (SELECT COALESCE(SUM(duration_seconds), 0) FROM tracks WHERE album_id = COALESCE(NEW.album_id, OLD.album_id))
        WHERE id = COALESCE(NEW.album_id, OLD.album_id);
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ language 'plpgsql';

-- Add trigger for album stats
CREATE TRIGGER update_album_stats_trigger
    AFTER INSERT OR DELETE OR UPDATE ON tracks
    FOR EACH ROW EXECUTE FUNCTION update_album_stats();

-- ========================================
-- SAMPLE DATA (Optional for testing)
-- ========================================

-- Insert sample user
INSERT INTO users (username, email, password_hash, first_name, last_name) 
VALUES ('demo_user', 'demo@juke.com', 'hashed_password', 'Demo', 'User');

-- Insert sample artist
INSERT INTO artists (name, bio) 
VALUES ('Demo Artist', 'A talented musician for testing');

-- Insert sample album
INSERT INTO albums (title, artist_id, genre) 
VALUES ('Demo Album', (SELECT id FROM artists WHERE name = 'Demo Artist'), 'Pop');

-- Insert sample track
INSERT INTO tracks (title, artist_id, album_id, file_path, duration_seconds, genre) 
VALUES ('Demo Track', (SELECT id FROM artists WHERE name = 'Demo Artist'), 
        (SELECT id FROM albums WHERE title = 'Demo Album'), '/path/to/demo.mp3', 180, 'Pop');

-- ========================================
-- COMPLETION MESSAGE
-- ========================================

-- Database schema created successfully!
-- All TIMESTAMP errors fixed
-- All UNIQUE constraints corrected
-- All foreign key relationships properly defined
-- All triggers for automatic updates implemented
-- Performance indexes created
-- Sample data inserted for testing
