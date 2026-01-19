# JUKE Music Streaming Platform - Database Architecture

## 📊 Database Overview

The JUKE platform uses **PostgreSQL** as its primary database, designed with a relational model that supports music streaming, user management, and social features. The schema is optimized for performance with proper indexing, triggers, and constraints.

## 🗄️ Core Table Structure

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│     users       │    │    artists      │    │     albums      │
├─────────────────┤    ├─────────────────┤    ├─────────────────┤
│ id (UUID)       │    │ id (UUID)       │    │ id (UUID)       │
│ username        │    │ name            │    │ title           │
│ email           │    │ bio             │    │ artist_id (FK)  │
│ password_hash   │    │ image_url       │    │ release_date    │
│ first_name      │    │ website_url     │    │ cover_image_url │
│ last_name       │    │ social_links    │    │ description     │
│ avatar_url      │    │ verified        │    │ genre           │
│ bio             │    │ created_at      │    │ label           │
│ subscription    │    │ updated_at      │    │ total_tracks    │
│ is_active       │    └─────────────────┘    │ duration_seconds│
│ email_verified  │                           │ created_at      │
│ created_at      │                           │ updated_at      │
│ updated_at      │                           └─────────────────┘
└─────────────────┘                                     │
         │                                              │
         │                                              │
         ▼                                              ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ user_sessions   │    │     tracks      │    │ playlist_tracks │
├─────────────────┤    ├─────────────────┤    ├─────────────────┤
│ id (UUID)       │    │ id (UUID)       │    │ id (UUID)       │
│ user_id (FK)    │◄───┤ title           │    │ playlist_id (FK)│
│ session_token   │    │ uploader_id (FK)│◄───┤ track_id (FK)   │
│ expires_at      │    │ artist_id (FK)  │    │ added_at        │
│ created_at      │    │ album_id (FK)   │    │ added_by (FK)   │
│ last_used_at    │    │ album           │    │ position        │
│ ip_address      │    │ cover_image_url │    └─────────────────┘
│ user_agent      │    │ audio_url       │             │
└─────────────────┘    │ video_url       │             │
         │              │ file_path       │             │
         │              │ file_size       │             ▼
         │              │ duration_seconds│    ┌─────────────────┐
         │              │ bitrate         │    │    playlists     │
         │              │ sample_rate     │    ├─────────────────┤
         │              │ track_number    │    │ id (UUID)       │
         │              │ genre           │    │ user_id (FK)    │◄─┘
         │              │ lyrics          │    │ name            │
         │              │ metadata        │    │ description     │
         │              │ play_count      │    │ cover_image_url │
         │              │ like_count      │    │ is_public       │
         │              │ is_explicit     │    │ is_collaborative│
         │              │ is_available    │    │ track_count     │
         │              │ release_date    │    │ total_duration  │
         │              │ created_at      │    │ created_at      │
         │              │ updated_at      │    │ updated_at      │
         │              └─────────────────┘    └─────────────────┘
         │                      │                     │
         │                      │                     │
         ▼                      ▼                     ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ user_favorites  │    │ track_comments  │    │ play_history    │
├─────────────────┤    ├─────────────────┤    ├─────────────────┤
│ id (UUID)       │    │ id (UUID)       │    │ id (UUID)       │
│ user_id (FK)    │    │ track_id (FK)   │    │ user_id (FK)    │
│ track_id (FK)   │    │ user_id (FK)    │    │ track_id (FK)   │
│ created_at      │    │ body            │    │ played_at       │
└─────────────────┘    │ created_at      │    │ duration_played │
         │              └─────────────────┘    │ device_type     │
         │                      │             │ source_type     │
         │                      │             └─────────────────┘
         │                      │
         ▼                      ▼
┌─────────────────┐    ┌─────────────────┐
│user_following_  │    │  upload_queue   │
│artists          │    ├─────────────────┤
├─────────────────┤    │ id (UUID)       │
│ id (UUID)       │    │ user_id (FK)    │
│ user_id (FK)    │    │ file_name       │
│ artist_id (FK)  │    │ original_name   │
│ created_at      │    │ file_path       │
└─────────────────┘    │ file_size       │
                      │ mime_type       │
                      │ upload_status   │
                      │ processing_log  │
                      │ created_at      │
                      │ processed_at    │
                      └─────────────────┘
```

## 🎯 Core Entity Relationships

### **1. User Management**
- **users**: Central user accounts with authentication, profiles, and subscriptions
- **user_sessions**: JWT-based session management for authentication
- **user_favorites**: Many-to-many relationship between users and liked tracks
- **user_following_artists**: Social feature for following favorite artists

### **2. Music Content**
- **artists**: Artist profiles with verification status and social links
- **albums**: Album collections linked to artists with metadata
- **tracks**: Individual songs with rich metadata, file storage, and statistics

### **3. Playlists & Social**
- **playlists**: User-created playlists with privacy settings
- **playlist_tracks**: Many-to-many relationship with ordering and collaboration
- **track_comments**: User comments on tracks for social interaction

### **4. Analytics & Processing**
- **play_history**: Detailed playback tracking for analytics and recommendations
- **upload_queue**: Background processing system for uploaded files

## 🔧 Key Technical Features

### **UUID Primary Keys**
All tables use UUID primary keys for:
- **Security**: Non-sequential IDs prevent enumeration
- **Scalability**: Distributed generation across systems
- **Performance**: Efficient indexing with PostgreSQL's UUID handling

### **Advanced Indexing Strategy**
```sql
-- Full-text search for music discovery
CREATE INDEX idx_tracks_title ON tracks USING gin(to_tsvector('english', title));
CREATE INDEX idx_artists_name ON artists USING gin(to_tsvector('english', name));

-- Performance indexes for common queries
CREATE INDEX idx_play_history_user_id ON play_history(user_id);
CREATE INDEX idx_play_history_played_at ON play_history(played_at);
```

### **Automated Triggers**
1. **Timestamp Updates**: Automatic `updated_at` maintenance
2. **Playlist Statistics**: Real-time track count and duration updates
3. **Play Count Tracking**: Automatic increment on playback
4. **Album Statistics**: Dynamic track and duration calculations

## 📊 Data Flow Examples

### **Music Upload Flow**
```
1. User uploads file → upload_queue (status: pending)
2. Background processing → upload_queue (status: processing)
3. File analysis & storage → tracks table
4. Metadata extraction → tracks.metadata (JSONB)
5. Processing complete → upload_queue (status: completed)
```

### **Playlist Management**
```
1. User creates playlist → playlists table
2. Adds tracks → playlist_tracks (with position)
3. Trigger updates → playlists.track_count, playlists.total_duration
4. Real-time stats → Available for API responses
```

### **Play Tracking**
```
1. User plays track → play_history entry
2. Trigger fires → tracks.play_count++
3. Analytics data → Available for recommendations
4. User stats → Updated in real-time
```

## 🚀 Performance Optimizations

### **1. Index Strategy**
- **Foreign Key Indexes**: All FK columns indexed
- **Search Indexes**: Full-text search on titles and artist names
- **Time-based Indexes**: play_history.played_at for analytics queries
- **Composite Indexes**: Multi-column queries optimized

### **2. JSONB Usage**
- **artists.social_links**: Flexible social media data
- **tracks.metadata**: Extensible audio file metadata
- **Future-proof**: Easy to add new fields without schema changes

### **3. Constraint Optimization**
- **UNIQUE constraints**: Prevent duplicate data
- **CHECK constraints**: Data validation at database level
- **Foreign Key constraints**: Referential integrity
- **NOT NULL constraints**: Required data enforcement

## 🔐 Security Features

### **1. Authentication**
- **JWT Tokens**: Stored in user_sessions with expiration
- **Session Management**: IP and user agent tracking
- **Password Security**: Hashed passwords (bcrypt in application layer)

### **2. Data Protection**
- **Soft Deletes**: Users marked inactive rather than deleted
- **Privacy Controls**: Playlist visibility settings
- **Content Moderation**: Explicit content flagging

## 📈 Scalability Considerations

### **1. Horizontal Scaling**
- **UUID Primary Keys**: Enable distributed systems
- **Connection Pooling**: PostgreSQL connection management
- **Read Replicas**: Analytics queries can be offloaded

### **2. Vertical Scaling**
- **Partitioning**: play_history can be partitioned by time
- **Archiving**: Old play_history data can be archived
- **Caching**: Frequently accessed data can be cached

## 🔄 Migration Strategy

### **Schema Evolution**
- **Backward Compatible**: New fields added as nullable
- **Migration Scripts**: Version-controlled schema changes
- **Data Validation**: Constraints ensure data integrity

### **Backup Strategy**
- **Point-in-Time Recovery**: WAL logging enabled
- **Regular Backups**: Automated backup schedules
- **Testing**: Restore procedures regularly tested

This database architecture provides a solid foundation for a music streaming platform with room for growth and feature expansion while maintaining performance and data integrity.
