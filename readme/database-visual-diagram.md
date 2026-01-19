# JUKE Database - Visual Relationship Diagram

## 🎵 Complete Entity Relationship Map

```
                    ┌─────────────────────────────────────┐
                    │              USERS                  │
                    ├─────────────────────────────────────┤
                    │ id (UUID) PK                       │
                    │ username VARCHAR(50) UNIQUE         │
                    │ email VARCHAR(255) UNIQUE           │
                    │ password_hash VARCHAR(255)         │
                    │ first_name VARCHAR(100)            │
                    │ last_name VARCHAR(100)             │
                    │ avatar_url VARCHAR(500)            │
                    │ bio TEXT                           │
                    │ subscription_tier VARCHAR(20)       │
                    │ is_active BOOLEAN                  │
                    │ email_verified BOOLEAN              │
                    │ created_at TIMESTAMP               │
                    │ updated_at TIMESTAMP               │
                    └─────────────────────────────────────┘
                              │
                              │ 1:N
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
          │                   │                   │
          ▼                   ▼                   ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ user_sessions   │  │ user_favorites  │  │   playlists     │
├─────────────────┤  ├─────────────────┤  ├─────────────────┤
│ id (UUID) PK    │  │ id (UUID) PK    │  │ id (UUID) PK    │
│ user_id FK      │  │ user_id FK      │  │ user_id FK      │
│ session_token   │  │ track_id FK     │  │ name VARCHAR    │
│ expires_at      │  │ created_at      │  │ description TEXT │
│ created_at      │  └─────────────────┘  │ cover_image_url │
│ last_used_at    │          │            │ is_public       │
│ ip_address      │          │            │ track_count     │
│ user_agent      │          │            │ total_duration  │
└─────────────────┘          │            │ created_at      │
                              │            │ updated_at      │
                              │            └─────────────────┘
                              │                     │
                              │                     │
                              │                     │
                              ▼                     ▼
                    ┌─────────────────┐    ┌─────────────────┐
                    │     tracks      │    │ playlist_tracks │
                    ├─────────────────┤    ├─────────────────┤
                    │ id (UUID) PK    │    │ id (UUID) PK    │
                    │ title VARCHAR   │    │ playlist_id FK  │
                    │ uploader_id FK  │    │ track_id FK     │
                    │ artist_id FK    │    │ added_at        │
                    │ album_id FK     │    │ added_by FK     │
                    │ album VARCHAR   │    │ position INTEGER │
                    │ cover_image_url │    └─────────────────┘
                    │ audio_url       │             │
                    │ video_url       │             │
                    │ file_path       │             │
                    │ file_size       │             │
                    │ duration_seconds│             │
                    │ bitrate         │             │
                    │ sample_rate     │             │
                    │ track_number    │             │
                    │ genre VARCHAR   │             │
                    │ lyrics TEXT     │             │
                    │ metadata JSONB  │             │
                    │ play_count      │             │
                    │ like_count      │             │
                    │ is_explicit     │             │
                    │ is_available    │             │
                    │ release_date    │             │
                    │ created_at      │             │
                    │ updated_at      │             │
                    └─────────────────┘             │
                              │                     │
                              │                     │
          ┌───────────────────┼───────────────────┼─────────────────┐
          │                   │                   │                 │
          │                   │                   │                 │
          ▼                   ▼                   ▼                 ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│     artists     │  │     albums      │  │ track_comments  │  │  play_history   │
├─────────────────┤  ├─────────────────┤  ├─────────────────┤  ├─────────────────┤
│ id (UUID) PK    │  │ id (UUID) PK    │  │ id (UUID) PK    │  │ id (UUID) PK    │
│ name VARCHAR    │  │ title VARCHAR   │  │ track_id FK     │  │ user_id FK      │
│ bio TEXT        │  │ artist_id FK    │  │ user_id FK      │  │ track_id FK     │
│ image_url       │  │ release_date    │  │ body TEXT       │  │ played_at       │
│ website_url     │  │ cover_image_url │  │ created_at      │  │ duration_played │
│ social_links    │  │ description TEXT │  └─────────────────┘  │ device_type     │
│ verified        │  │ genre VARCHAR   │          │            │ source_type     │
│ created_at      │  │ label VARCHAR   │          │            └─────────────────┘
│ updated_at      │  │ total_tracks    │          │
└─────────────────┘  │ duration_seconds│          │
          │           │ created_at      │          │
          │           │ updated_at      │          │
          │           └─────────────────┘          │
          │                   │                 │
          │                   │                 │
          │                   │                 │
          ▼                   ▼                 ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│user_following_  │  │  upload_queue   │  │ album_stats     │
│artists         │  ├─────────────────┤  │ (trigger view)  │
├─────────────────┤  │ id (UUID) PK    │  ├─────────────────┤
│ id (UUID) PK    │  │ user_id FK      │  │ album_id        │
│ user_id FK      │  │ file_name       │  │ track_count     │
│ artist_id FK    │  │ original_name   │  │ duration_seconds│
│ created_at      │  │ file_path       │  └─────────────────┘
└─────────────────┘  │ file_size       │          │
          │           │ mime_type       │          │
          │           │ upload_status   │          │
          │           │ processing_log  │          │
          │           │ created_at      │          │
          │           │ processed_at    │          │
          │           └─────────────────┘          │
          │                   │                 │
          │                   │                 │
          └───────────────────┼─────────────────┘
                              │
                              │
                              ▼
                    ┌─────────────────┐
                    │  file_storage   │
                    │   (S3/Local)   │
                    ├─────────────────┤
                    │ audio files     │
                    │ video files     │
                    │ cover images    │
                    │ user avatars    │
                    └─────────────────┘
```

## 🔗 Relationship Types Explained

### **One-to-Many (1:N)**
```
USERS ──< PLAYLISTS
USERS ──< user_sessions
USERS ──< user_favorites
ARTISTS ──< ALBUMS
ARTISTS ──< TRACKS
ALBUMS ──< TRACKS
```

### **Many-to-Many (N:M)**
```
USERS ──< user_favorites >── TRACKS
USERS ──< user_following_artists >── ARTISTS
PLAYLISTS ──< playlist_tracks >── TRACKS
```

### **One-to-One (1:1)**
```
USERS ──< user_sessions (one active session per user)
```

## 🎯 Key Relationships

### **Core Music Flow**
```
ARTISTS (1) ──< ALBUMS (1) ──< TRACKS (M)
    ↓              ↓              ↓
    │              │              │
    └──────< TRACKS (via artist_id) ───────> USERS (uploaders)
```

### **User Interaction Flow**
```
USERS ──< PLAYLISTS ──< playlist_tracks >── TRACKS
  ↓           ↓              ↓              ↓
favorites   comments     play_history   upload_queue
```

### **Social Features**
```
USERS ──< user_following_artists >── ARTISTS
USERS ──< track_comments >── TRACKS
USERS ──< user_favorites >── TRACKS
```

## 📊 Data Volume Indicators

### **High Volume Tables**
- **play_history** (billions of rows)
- **user_sessions** (millions of rows)
- **track_comments** (millions of rows)

### **Medium Volume Tables**
- **tracks** (millions of rows)
- **users** (millions of rows)
- **playlist_tracks** (millions of rows)

### **Low Volume Tables**
- **artists** (hundreds of thousands)
- **albums** (millions)
- **playlists** (millions)

## 🚀 Performance Hotspots

### **Critical Indexes**
```sql
-- User queries
idx_users_email
idx_users_username

-- Music discovery
idx_tracks_artist_id
idx_tracks_title (full-text)
idx_artists_name (full-text)

-- Analytics
idx_play_history_user_id
idx_play_history_played_at

-- Social features
idx_user_favorites_user_id
idx_playlist_tracks_playlist_id
```

### **Query Patterns**
1. **User Dashboard**: `user_id` based queries
2. **Music Discovery**: Full-text search on tracks/artists
3. **Analytics**: Time-based queries on play_history
4. **Social**: Relationship queries (favorites, following)

## 🔧 Advanced Features

### **Triggers (Automatic Updates)**
```
play_history INSERT → tracks.play_count++
playlist_tracks INSERT/DELETE → playlists.track_count++
tracks INSERT/DELETE → albums.total_tracks++
```

### **JSONB Fields (Flexible Data)**
```
artists.social_links → {twitter: "...", instagram: "..."}
tracks.metadata → {bitrate: 320, format: "MP3", ...}
```

### **Constraints (Data Integrity)**
```
UNIQUE(user_id, track_id) → No duplicate favorites
CHECK(subscription_tier IN ('free', 'premium', 'family'))
CHECK(upload_status IN ('pending', 'processing', 'completed', 'failed'))
```

This diagram shows how all the pieces fit together to create a complete music streaming platform! 🎵✨
