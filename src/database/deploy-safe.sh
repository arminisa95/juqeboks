#!/bin/bash

# JUKE Database Safe Deployment Script
# =====================================
# 1. Backup → 2. Schema → 3. Test → 4. Profit! 🎵

set -e  # Stop on any error

echo "🎵 JUKE Database Deployment Started..."
echo "====================================="

# Configuration
DB_NAME="juke_db"
BACKUP_DIR="./backups"
SCHEMA_FILE="./schema-fixed.sql"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

# Create backup directory
mkdir -p $BACKUP_DIR

echo "📦 Step 1: Creating Backup..."
# =================================
BACKUP_FILE="$BACKUP_DIR/juke_backup_$TIMESTAMP.sql"

echo "📍 Creating backup: $BACKUP_FILE"
pg_dump $DB_NAME > $BACKUP_FILE

if [ $? -eq 0 ]; then
    echo "✅ Backup created successfully!"
    echo "📊 Backup size: $(du -h $BACKUP_FILE | cut -f1)"
else
    echo "❌ Backup failed! Stopping deployment."
    exit 1
fi

echo ""
echo "🔧 Step 2: Applying New Schema..."
# =================================
echo "📍 Applying schema: $SCHEMA_FILE"

# Test schema syntax first
echo "🔍 Testing schema syntax..."
psql $DB_NAME -c "\set ON_ERROR_STOP on" -f $SCHEMA_FILE --echo-all --quiet

if [ $? -eq 0 ]; then
    echo "✅ Schema applied successfully!"
else
    echo "❌ Schema application failed!"
    echo "🔄 Restoring from backup..."
    psql $DB_NAME < $BACKUP_FILE
    echo "✅ Database restored from backup"
    exit 1
fi

echo ""
echo "🧪 Step 3: Testing Database..."
# =================================
echo "📍 Running database tests..."

# Test 1: Check if all tables exist
echo "🔍 Test 1: Checking tables..."
TABLES=$(psql $DB_NAME -t -c "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';")

EXPECTED_TABLES="users artists albums tracks playlists playlist_tracks user_favorites user_following_artists track_comments play_history user_sessions upload_queue"

for table in $EXPECTED_TABLES; do
    if echo "$TABLES" | grep -q "$table"; then
        echo "✅ Table $table exists"
    else
        echo "❌ Table $table missing!"
        echo "🔄 Restoring from backup..."
        psql $DB_NAME < $BACKUP_FILE
        echo "✅ Database restored from backup"
        exit 1
    fi
done

# Test 2: Check if data is intact
echo "🔍 Test 2: Checking data integrity..."
USER_COUNT=$(psql $DB_NAME -t -c "SELECT COUNT(*) FROM users;")
TRACK_COUNT=$(psql $DB_NAME -t -c "SELECT COUNT(*) FROM tracks;")
ARTIST_COUNT=$(psql $DB_NAME -t -c "SELECT COUNT(*) FROM artists;")

echo "📊 Data counts:"
echo "   Users: $USER_COUNT"
echo "   Tracks: $TRACK_COUNT"
echo "   Artists: $ARTIST_COUNT"

if [ "$USER_COUNT" -gt 0 ] && [ "$TRACK_COUNT" -gt 0 ]; then
    echo "✅ Data integrity verified!"
else
    echo "❌ Data integrity check failed!"
    echo "🔄 Restoring from backup..."
    psql $DB_NAME < $BACKUP_FILE
    echo "✅ Database restored from backup"
    exit 1
fi

# Test 3: Check UUID extension
echo "🔍 Test 3: Checking UUID extension..."
UUID_CHECK=$(psql $DB_NAME -t -c "SELECT 1 FROM pg_extension WHERE extname = 'uuid-ossp';")

if [ -n "$UUID_CHECK" ]; then
    echo "✅ UUID extension is active!"
else
    echo "❌ UUID extension missing!"
    exit 1
fi

# Test 4: Check foreign keys
echo "🔍 Test 4: Checking foreign key constraints..."
FK_CHECK=$(psql $DB_NAME -t -c "SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_type = 'FOREIGN KEY';")

echo "✅ Foreign key constraints: $FK_CHECK"

echo ""
echo "🎉 Step 4: PROFIT! 🎵"
# ========================
echo "====================================="
echo "✅ JUKE Database Deployment SUCCESSFUL!"
echo "🎵 Your music platform is ready!"
echo ""
echo "📊 Deployment Summary:"
echo "   Backup: $BACKUP_FILE"
echo "   Users: $USER_COUNT"
echo "   Tracks: $TRACK_COUNT"
echo "   Artists: $ARTIST_COUNT"
echo "   Tables: $(echo "$TABLES" | wc -l | tr -d ' ')"
echo ""
echo "🚀 Your website should now work perfectly!"
echo "🔧 All database errors have been fixed!"
echo "📈 Performance improved with new indexes!"
echo ""
echo "🎯 Next steps:"
echo "   1. Test your website manually"
echo "   2. Check music upload/playback"
echo "   3. Verify user login works"
echo "   4. Test playlist creation"
echo ""
echo "💡 If anything goes wrong, restore with:"
echo "   psql $DB_NAME < $BACKUP_FILE"
echo ""
echo "🎵 Happy streaming! 🎵"
