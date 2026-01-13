# 🎵 JUKE Database Monitoring Tools

## 📊 Database Overview

Your JUKE database is running locally with PostgreSQL 18.1 and contains:

- **3 Users** - musiclover, jazzfan, synthwave_kid
- **4 Artists** - Including Luna Rodriguez, Neon Pulse, The Jazz Collective
- **8 Tracks** - Various electronic and jazz tracks
- **4 Playlists** - User-created playlists
- **8 Play History** records
- **4 User Favorites**

## 🛠️ Available Tools

### 1. **Database Monitor** - Quick Overview
```bash
node monitor.js
```
Shows:
- Table counts and statistics
- Recent users, tracks, and playlists
- Storage usage
- Last 24 hours activity

### 2. **Interactive Query Tool** - Explore Data
```bash
node query-tool.js
```
Commands:
- `stats` - Detailed database statistics with table sizes
- `tables` - List all tables
- `schema [table]` - Show table structure
- `recent` - Recent activity analysis
- Any SQL query - Execute custom queries

### 3. **Connection Test** - Troubleshoot Issues
```bash
node test-connection.js
```
Tests different SSL configurations and basic connectivity.

### 4. **Web Dashboard** - Visual Analytics
Open `dashboard.html` in your browser for:
- Real-time charts and graphs
- Interactive statistics
- Activity visualizations
- Auto-refresh every 30 seconds

## 🔧 Database Configuration

Current working configuration (`.env`):
```env
DB_HOST=localhost
DB_NAME=juke_db
DB_USER=postgres
DB_PASSWORD=postgres
DB_PORT=5432
DB_SSL=false
```

## 📈 Key Insights

### **Content Distribution:**
- Electronic music dominates (Neon Pulse, Midnight Dreams)
- Jazz presence (The Jazz Collective)
- Mixed artist collaborations

### **User Engagement:**
- 3 active users with diverse tastes
- 4 favorites across different genres
- 8 play history records (moderate engagement)

### **Storage Efficiency:**
- Total database size: ~9MB
- Well-organized table structure
- Room for growth

## 🚀 Production Setup (Render)

When deploying to Render, update your `.env`:

```env
# Render PostgreSQL
DB_HOST=your-render-db-host.compute-1.amazonaws.com
DB_NAME=juke_db_s8gk
DB_USER=your_render_username
DB_PASSWORD=your_render_password
DB_PORT=5432
DB_SSL=false
```

### **Render Dashboard Access:**
1. Go to Render dashboard → PostgreSQL service
2. Click "External Connection"
3. Copy connection string
4. Update credentials above

## 🎯 Monitoring Recommendations

### **Daily Checks:**
1. Run `node monitor.js` for quick overview
2. Check user growth trends
3. Monitor storage usage

### **Weekly Analysis:**
1. Use `node query-tool.js` for deep dives
2. Analyze popular tracks/artists
3. Review playlist creation patterns

### **Monthly Reports:**
1. Web dashboard for comprehensive view
2. Export key metrics
3. Plan capacity scaling

## 🔍 Sample Queries

### **Top Artists by Track Count:**
```sql
SELECT a.name, COUNT(t.id) as track_count
FROM artists a
LEFT JOIN tracks t ON a.id = t.artist_id
GROUP BY a.id, a.name
ORDER BY track_count DESC;
```

### **Most Played Tracks:**
```sql
SELECT t.title, a.name, COUNT(ph.id) as play_count
FROM tracks t
JOIN artists a ON t.artist_id = a.id
LEFT JOIN play_history ph ON t.id = ph.track_id
GROUP BY t.id, t.title, a.name
ORDER BY play_count DESC;
```

### **User Activity Summary:**
```sql
SELECT 
    u.username,
    COUNT(DISTINCT uf.track_id) as favorites,
    COUNT(DISTINCT p.id) as playlists,
    COUNT(DISTINCT ph.track_id) as tracks_played
FROM users u
LEFT JOIN user_favorites uf ON u.id = uf.user_id
LEFT JOIN playlists p ON u.id = p.user_id
LEFT JOIN play_history ph ON u.id = ph.user_id
GROUP BY u.id, u.username;
```

## 🛡️ Security Notes

- Database credentials are in `.env` file
- Never commit `.env` to version control
- Use strong passwords in production
- Consider connection pooling for high traffic
- Regular backups recommended

## 📞 Support

For database issues:
1. Check PostgreSQL service status
2. Verify `.env` configuration
3. Run `node test-connection.js` for diagnostics
4. Review Render dashboard for cloud issues

---

**🎵 Happy monitoring! Your JUKE database is healthy and ready to grow!**
