-- Sample Data for JUKE Music Streaming Platform
-- Run this after creating the schema

-- Insert sample artists
INSERT INTO artists (id, name, bio, image_url, verified) VALUES
    ('550e8400-e29b-41d4-a716-446655440001', 'The Midnight Dreams', 'Electronic music duo from Berlin, known for their ambient soundscapes and hypnotic beats.', 'https://example.com/images/midnight_dreams.jpg', true),
    ('550e8400-e29b-41d4-a716-446655440002', 'Luna Rodriguez', 'Indie folk singer-songwriter from Austin, Texas. Her intimate lyrics and acoustic guitar have captivated audiences worldwide.', 'https://example.com/images/luna_rodriguez.jpg', true),
    ('550e8400-e29b-41d4-a716-446655440003', 'Neon Pulse', 'Synthwave producer creating retro-futuristic tracks that blend 80s nostalgia with modern electronic production.', 'https://example.com/images/neon_pulse.jpg', false),
    ('550e8400-e29b-41d4-a716-446655440004', 'The Jazz Collective', 'Modern jazz ensemble that pushes boundaries with experimental compositions and improvisation.', 'https://example.com/images/jazz_collective.jpg', true);

-- Insert sample albums
INSERT INTO albums (id, title, artist_id, release_date, cover_image_url, genre, label) VALUES
    ('660e8400-e29b-41d4-a716-446655440001', 'Digital Horizons', '550e8400-e29b-41d4-a716-446655440001', '2023-03-15', 'https://example.com/albums/digital_horizons.jpg', 'Electronic', 'Dreamscape Records'),
    ('660e8400-e29b-41d4-a716-446655440002', 'Whispers in the Wind', '550e8400-e29b-41d4-a716-446655440002', '2023-07-22', 'https://example.com/albums/whispers_wind.jpg', 'Indie Folk', 'Independent'),
    ('660e8400-e29b-41d4-a716-446655440003', 'Neon Nights', '550e8400-e29b-41d4-a716-446655440003', '2023-11-10', 'https://example.com/albums/neon_nights.jpg', 'Synthwave', 'Retro Wave Records'),
    ('660e8400-e29b-41d4-a716-446655440004', 'Blue Sessions', '550e8400-e29b-41d4-a716-446655440004', '2023-09-05', 'https://example.com/albums/blue_sessions.jpg', 'Jazz', 'Blue Note Records');

-- Insert sample tracks
INSERT INTO tracks (id, title, artist_id, album_id, file_path, duration_seconds, track_number, genre, lyrics, metadata) VALUES
    ('770e8400-e29b-41d4-a716-446655440001', 'Digital Sunrise', '550e8400-e29b-41d4-a716-446655440001', '660e8400-e29b-41d4-a716-446655440001', '/tracks/digital_sunrise.mp3', 245, 1, 'Electronic', 'Watching the digital sunrise, colors paint the sky in code...', '{"bpm": 128, "key": "C minor", "energy": 0.8}'),
    ('770e8400-e29b-41d4-a716-446655440002', 'Neon Dreams', '550e8400-e29b-41d4-a716-446655440001', '660e8400-e29b-41d4-a716-446655440001', '/tracks/neon_dreams.mp3', 312, 2, 'Electronic', 'In the neon lights we dance, shadows fade away...', '{"bpm": 140, "key": "G minor", "energy": 0.9}'),
    ('770e8400-e29b-41d4-a716-446655440003', 'Broken Strings', '550e8400-e29b-41d4-a716-446655440002', '660e8400-e29b-41d4-a716-446655440002', '/tracks/broken_strings.mp3', 198, 1, 'Indie Folk', 'Broken strings on my guitar, but the song still plays...', '{"bpm": 72, "key": "D major", "energy": 0.4}'),
    ('770e8400-e29b-41d4-a716-446655440004', 'Highway Thoughts', '550e8400-e29b-41d4-a716-446655440002', '660e8400-e29b-41d4-a716-446655440002', '/tracks/highway_thoughts.mp3', 267, 2, 'Indie Folk', 'Driving down the highway, watching the world go by...', '{"bpm": 85, "key": "A major", "energy": 0.5}'),
    ('770e8400-e29b-41d4-a716-446655440005', 'Retro Future', '550e8400-e29b-41d4-a716-446655440003', '660e8400-e29b-41d4-a716-446655440003', '/tracks/retro_future.mp3', 289, 1, 'Synthwave', 'Back to the future, with synthesizer dreams...', '{"bpm": 118, "key": "E minor", "energy": 0.7}'),
    ('770e8400-e29b-41d4-a716-446655440006', 'Electric Nights', '550e8400-e29b-41d4-a716-446655440003', '660e8400-e29b-41d4-a716-446655440003', '/tracks/electric_nights.mp3', 334, 2, 'Synthwave', 'Electric nights, city lights shine bright...', '{"bpm": 125, "key": "B minor", "energy": 0.8}'),
    ('770e8400-e29b-41d4-a716-446655440007', 'Blue Monday', '550e8400-e29b-41d4-a716-446655440004', '660e8400-e29b-41d4-a716-446655440004', '/tracks/blue_monday.mp3', 412, 1, 'Jazz', 'Blue Monday blues, saxophone in the rain...', '{"bpm": 65, "key": "Bb minor", "energy": 0.3}'),
    ('770e8400-e29b-41d4-a716-446655440008', 'Midnight Groove', '550e8400-e29b-41d4-a716-446655440004', '660e8400-e29b-41d4-a716-446655440004', '/tracks/midnight_groove.mp3', 378, 2, 'Jazz', 'Midnight groove, bass walking through the night...', '{"bpm": 78, "key": "F minor", "energy": 0.4}');

-- Insert sample users
INSERT INTO users (id, username, email, password_hash, first_name, last_name, subscription_tier) VALUES
    ('880e8400-e29b-41d4-a716-446655440001', 'musiclover', 'music@example.com', '$2b$10$example_hash_here', 'Alex', 'Johnson', 'premium'),
    ('880e8400-e29b-41d4-a716-446655440002', 'jazzfan', 'jazz@example.com', '$2b$10$example_hash_here', 'Sarah', 'Williams', 'free'),
    ('880e8400-e29b-41d4-a716-446655440003', 'synthwave_kid', 'synth@example.com', '$2b$10$example_hash_here', 'Mike', 'Chen', 'premium');

-- Insert sample playlists
INSERT INTO playlists (id, user_id, name, description, is_public, cover_image_url) VALUES
    ('990e8400-e29b-41d4-a716-446655440001', '880e8400-e29b-41d4-a716-446655440001', 'My Favorite Electronic', 'Best electronic tracks for coding and focus', true, 'https://example.com/playlists/electronic.jpg'),
    ('990e8400-e29b-41d4-a716-446655440002', '880e8400-e29b-41d4-a716-446655440001', 'Chill Vibes', 'Relaxing tracks for Sunday mornings', false, 'https://example.com/playlists/chill.jpg'),
    ('990e8400-e29b-41d4-a716-446655440003', '880e8400-e29b-41d4-a716-446655440002', 'Jazz Essentials', 'Classic and modern jazz favorites', true, 'https://example.com/playlists/jazz.jpg'),
    ('990e8400-e29b-41d4-a716-446655440004', '880e8400-e29b-41d4-a716-446655440003', 'Retro Wave Mix', 'Synthwave and retro electronic music', false, 'https://example.com/playlists/retro.jpg');

-- Add tracks to playlists
INSERT INTO playlist_tracks (playlist_id, track_id, position, added_by) VALUES
    ('990e8400-e29b-41d4-a716-446655440001', '770e8400-e29b-41d4-a716-446655440001', 1, '880e8400-e29b-41d4-a716-446655440001'),
    ('990e8400-e29b-41d4-a716-446655440001', '770e8400-e29b-41d4-a716-446655440002', 2, '880e8400-e29b-41d4-a716-446655440001'),
    ('990e8400-e29b-41d4-a716-446655440002', '770e8400-e29b-41d4-a716-446655440003', 1, '880e8400-e29b-41d4-a716-446655440001'),
    ('990e8400-e29b-41d4-a716-446655440002', '770e8400-e29b-41d4-a716-446655440004', 2, '880e8400-e29b-41d4-a716-446655440001'),
    ('990e8400-e29b-41d4-a716-446655440003', '770e8400-e29b-41d4-a716-446655440007', 1, '880e8400-e29b-41d4-a716-446655440002'),
    ('990e8400-e29b-41d4-a716-446655440003', '770e8400-e29b-41d4-a716-446655440008', 2, '880e8400-e29b-41d4-a716-446655440002'),
    ('990e8400-e29b-41d4-a716-446655440004', '770e8400-e29b-41d4-a716-446655440005', 1, '880etrl440003'),
    ('990e8400-e29b-41d4-a716-446655440004', '770e8400-e29b-41d4-a716-446655440006', 2, '880e8400-e29b-41d4-a716-446655440003');

-- Add some user favorites
INSERT INTO user_favorites (user_id, track_id) VALUES
    ('880e8400-e29b-41d4-a716-446655440001', '770e8400-e29b-41d4-a716-446655440001'),
    ('880e8400-e29b-41d4-a716-446655440001', '770e8400-e29b-41d4-a716-446655440002'),
    ('880e8400-e29b-41d4-a716-446655440002', '770e8400-e29b-41d4-a716-446655440007'),
    ('880e8400-e29b-41d4-a716-446655440003', '770e8400-e29b-41d4-a716-446655440005');

-- Add user following artists
INSERT INTO user_following_artists (user_id, artist_id) VALUES
    ('880e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440001'),
    ('880e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440003'),
    ('880e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440004'),
    ('880e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440003');

-- Add some play history
INSERT INTO play_history (user_id, track_id, duration_played, device_type, source_type) VALUES
    ('880e8400-e29b-41d4-a716-446655440001', '770e8400-e29b-41d4-a716-446655440001', 245, 'web', 'playlist'),
    ('880e8400-e29b-41d4-a716-446655440001', '770e8400-e29b-41d4-a716-446655440002', 180, 'mobile', 'album'),
    ('880e8400-e29b-41d4-a716-446655440002', '770e8400-e29b-41d4-a716-446655440007', 412, 'web', 'artist'),
    ('880e8400-e29b-41d4-a716-446655440003', '770e8400-e29b-41d4-a716-446655440005', 289, 'mobile', 'search');

-- Update album statistics (triggers should handle this automatically, but let's verify)
UPDATE albums SET 
    total_tracks = (SELECT COUNT(*) FROM tracks WHERE album_id = albums.id),
    duration_seconds = (SELECT COALESCE(SUM(duration_seconds), 0) FROM tracks WHERE album_id = albums.id);

-- Update playlist statistics
UPDATE playlists SET 
    track_count = (SELECT COUNT(*) FROM playlist_tracks WHERE playlist_id = playlists.id),
    total_duration = (SELECT COALESCE(SUM(t.duration_seconds), 0) 
                      FROM playlist_tracks pt 
                      JOIN tracks t ON pt.track_id = t.id 
                      WHERE pt.playlist_id = playlists.id);

-- Display summary of inserted data
SELECT 
    'Artists' as table_name, COUNT(*) as record_count FROM artists
UNION ALL SELECT 
    'Albums', COUNT(*) FROM albums
UNION ALL SELECT 
    'Tracks', COUNT(*) FROM tracks
UNION ALL SELECT 
    'Users', COUNT(*) FROM users
UNION ALL SELECT 
    'Playlists', COUNT(*) FROM playlists
UNION ALL SELECT 
    'Playlist Tracks', COUNT(*) FROM playlist_tracks
UNION ALL SELECT 
    'User Favorites', COUNT(*) FROM user_favorites
UNION ALL SELECT 
    'User Following Artists', COUNT(*) FROM user_following_artists
UNION ALL SELECT 
    'Play History', COUNT(*) FROM play_history;
