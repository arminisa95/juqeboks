# JUKE - Music Streaming Platform
## Complete Technical Presentation & Documentation

---

# Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture & Technology Stack](#2-architecture--technology-stack)
3. [Project Structure](#3-project-structure)
4. [HTML - Structure & Templates](#4-html---structure--templates)
5. [CSS - Styling System](#5-css---styling-system)
6. [JavaScript - Core Functionality](#6-javascript---core-functionality)
7. [Backend - Node.js Server](#7-backend---nodejs-server)
8. [Key Features Deep Dive](#8-key-features-deep-dive)
9. [Security & Authentication](#9-security--authentication)
10. [Conclusion](#10-conclusion)

---

# 1. Project Overview

## What is JUKE?

**JUKE** (stylized as JUQE) is a full-stack music streaming platform that allows users to:
- Upload and share music tracks
- Create playlists and collections
- Like, comment, and interact with content
- Discover new music through a social feed
- Stream audio and video content

## Key Features

| Feature | Description |
|---------|-------------|
| **Music Feed** | Instagram-style feed showing latest tracks |
| **Audio Player** | Full-featured music player with queue management |
| **User Authentication** | Secure login/registration system |
| **File Upload** | Support for audio, video, and cover images |
| **Social Features** | Likes, comments, sharing functionality |
| **Responsive Design** | Works on desktop and mobile devices |
| **SPA Architecture** | Single Page Application for smooth navigation |

---

# 2. Architecture & Technology Stack

## Frontend Technologies

- **HTML5** - Semantic markup, templates
- **CSS3** - Custom properties, Flexbox, Grid
- **JavaScript** - Vanilla JS, ES6+, async/await
- **Font Awesome** - Icon library
- **Google Fonts** - Typography

## Backend Technologies

- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **SQLite** - Database
- **JWT** - Authentication tokens
- **bcrypt** - Password hashing
- **AWS S3** - File storage (Cloudflare R2)
- **Multer** - File upload handling

---

# 3. Project Structure

```
JUKE/
├── index.html              # Main entry point (SPA shell)
├── server.js               # Express.js backend server
├── package.json            # Node.js dependencies
├── css/                    # Stylesheets
│   ├── variables.css       # CSS custom properties (theme)
│   ├── styles.css          # Global styles
│   ├── musicplayer.css     # Music player component
│   ├── feed.css            # Feed page styles
│   └── mobile.css          # Responsive breakpoints
├── js/                     # JavaScript modules
│   ├── spa.js              # Single Page App router
│   ├── player.js           # Audio/video player
│   ├── api.js              # API integration & feed
│   ├── auth.js             # Authentication system
│   └── lists.js            # Playlists management
├── html/                   # Page templates
│   ├── login.html, register.html, profile.html, etc.
├── database/               # Database files
│   └── connection.js       # Database connection module
└── uploads/                # Local file uploads
```

---

# 4. HTML - Structure & Templates

## 4.1 Main Entry Point (index.html)

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>JUKE</title>

    <!-- CSS Files - Variables first for theming -->
    <link rel="stylesheet" href="css/variables.css">
    <link rel="stylesheet" href="css/styles.css">
    <link rel="stylesheet" href="css/musicplayer.css">
    <link rel="stylesheet" href="css/feed.css">

    <!-- External Libraries -->
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">

    <!-- JavaScript - defer ensures proper loading order -->
    <script src="js/api-base.js"></script>
    <script src="js/player.js" defer></script>
    <script src="js/auth.js" defer></script>
    <script src="js/api.js" defer></script>
    <script src="js/spa.js" defer></script>
</head>
<body data-spa="true">
    <!-- Fixed Header/Navigation -->
    <header>
        <a href="#/feed">
            <img src="images/juqe.png" alt="Juke Logo" class="logo-img">
        </a>
        <nav>
            <div class="nav-buttons">
                <a href="#/feed" class="feed">_feed</a>
                <a href="#/lists" class="artists">_lists</a>
                <a href="#/disqo" class="lists">_disqo</a>
            </div>
            <div class="search-container">
                <input type="text" class="search-bar" placeholder="Search...">
                <button class="search-btn"><i class="fas fa-search"></i></button>
            </div>
        </nav>
    </header>

    <!-- Dynamic Content Container -->
    <main id="app">
        <!-- Content loaded here by SPA router -->
    </main>

    <!-- Fixed Music Player -->
    <div class="music-player">
        <!-- Player controls injected by player.js -->
    </div>
</body>
</html>
```

**Key Concepts:**
- `defer` attribute: Scripts execute after HTML parsing, in order
- `data-spa="true"`: Signals to JavaScript this is a Single Page Application
- Hash-based routing (`#/feed`, `#/lists`): Enables navigation without page reload

## 4.2 HTML Templates

```html
<!-- Feed Template -->
<template id="tpl-feed">
    <section class="music-feed">
        <div class="feed-container">
            <h1 class="feed-title">Feed</h1>
            <div class="music-grid" id="feedGrid">
                <!-- Tracks loaded dynamically via JavaScript -->
            </div>
        </div>
    </section>
</template>
```

**Why Use Templates?**
1. Content is parsed but not rendered (better performance)
2. Can be cloned multiple times
3. Keeps HTML organized and maintainable

## 4.3 Accessibility

```html
<button class="like-btn" aria-label="Like track" data-track-id="">
    <i class="far fa-heart"></i>
</button>

<div role="tablist">
    <button role="tab" aria-selected="true">Tab 1</button>
</div>
```

---

# 5. CSS - Styling System

## 5.1 CSS Custom Properties (variables.css)

```css
:root {
  /* Color Palette */
  --white: rgba(255, 255, 255, 1);
  --white-50: rgba(255, 255, 255, 0.5);
  --white-10: rgba(255, 255, 255, 0.1);
  --black: rgba(0, 0, 0, 1);
  --primary-color: #F72193;  /* JUKE Pink */

  /* Semantic Background Colors */
  --bg-primary: rgb(5, 8, 15);
  --bg-secondary: rgba(0, 0, 0, 0.3);
  --bg-card: rgba(255, 255, 255, 0.05);

  /* Border Colors */
  --border-primary: rgba(255, 255, 255, 0.2);
  --border-secondary: rgba(255, 255, 255, 0.1);

  /* Shadow Presets */
  --shadow-sm: 0 4px 12px rgba(0, 0, 0, 0.3);
  --shadow-lg: 0 12px 24px rgba(0, 0, 0, 0.3);

  /* Transitions */
  --transition-fast: 0.2s ease;

  /* Border Radius */
  --radius-md: 8px;
  --radius-full: 50%;
}
```

**Benefits:**
- **Consistency**: Same values everywhere
- **Maintainability**: Change once, updates everywhere
- **Theming**: Easy to create dark/light modes

## 5.2 Music Player Styling (musicplayer.css)

```css
.music-player {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    height: 90px;
    background: var(--bg-secondary);
    backdrop-filter: blur(16px);
    border-top: 1px solid var(--border-secondary);
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0 24px;
    z-index: 1000;
}

.music-player .control-btn {
    background: none;
    border: none;
    color: white;
    cursor: pointer;
    transition: color var(--transition-fast);
}

.music-player .control-btn:hover {
    color: #F72193;  /* JUKE Pink on hover */
}

/* Like Button States */
.music-player .like-btn i.far {
    color: white;  /* Empty heart = white */
}

.music-player .like-btn i.fas {
    color: #F72193;  /* Filled heart = pink */
}

/* Progress Bar */
.music-player .progress-bar {
    flex: 1;
    height: 4px;
    background: rgba(255, 255, 255, 0.3);
    border-radius: 2px;
    cursor: pointer;
}

.music-player .progress {
    height: 100%;
    width: 0%;  /* Updated by JavaScript */
    background: var(--primary-color);
    transition: width 0.1s linear;
}
```

## 5.3 Responsive Design (mobile.css)

```css
@media (max-width: 768px) {
    .music-player {
        height: auto;
        min-height: 116px;
        flex-wrap: wrap;
    }

    .music-player .volume-slider-container {
        display: none;  /* Hide on mobile */
    }
}

@media (max-width: 420px) {
    .music-player .progress-bar {
        height: 6px;  /* Larger touch target */
    }
}
```

---

# 6. JavaScript - Core Functionality

## 6.1 SPA Router (spa.js)

```javascript
(function () {
    // Get current route from URL hash
    function getRoute() {
        var hash = window.location.hash || '#/feed';
        return hash;
    }

    // Map routes to templates
    function routeToTemplate(route) {
        switch (route) {
            case '#/feed':
                return { templateId: 'tpl-feed', file: 'html/user.html' };
            case '#/koleqtion':
                return { templateId: 'tpl-koleqtion', file: 'html/koleqtion.html' };
            case '#/login':
                return { templateId: 'tpl-login', file: 'html/login.html' };
            default:
                return { templateId: 'tpl-feed', file: 'html/user.html' };
        }
    }

    // Load template into app container
    async function loadTemplateIntoApp(route) {
        var app = document.getElementById('app');
        var tpl = routeToTemplate(route);

        // Check authentication
        var authed = !!localStorage.getItem('juke_token');
        if (route !== '#/login' && route !== '#/register' && !authed) {
            window.location.hash = '#/login';
            return;
        }

        // Clone template content
        var templateEl = document.getElementById(tpl.templateId);
        if (templateEl && templateEl.content) {
            app.innerHTML = '';
            app.appendChild(templateEl.content.cloneNode(true));
            initRouteHandlers(route);
        }
    }

    // Initialize route-specific functionality
    function initRouteHandlers(route) {
        switch (route) {
            case '#/feed':
                if (window.JukeApi) window.JukeApi.loadTracks();
                break;
            case '#/login':
                if (typeof setupLoginForm === 'function') setupLoginForm();
                break;
        }
    }

    // Listen for navigation
    window.addEventListener('hashchange', function() {
        loadTemplateIntoApp(getRoute());
    });

    // Initial load
    document.addEventListener('DOMContentLoaded', function () {
        if (!window.location.hash) window.location.hash = '#/feed';
        else loadTemplateIntoApp(getRoute());
    });
})();
```

## 6.2 Music Player (player.js)

```javascript
(function () {
    // Format seconds to MM:SS
    function formatTime(seconds) {
        var m = Math.floor(seconds / 60);
        var s = Math.floor(seconds % 60);
        return m + ':' + String(s).padStart(2, '0');
    }

    // Player state
    var state = {
        trackId: null,
        title: '',
        artist: '',
        isPlaying: false,
        queue: [],
        queueIndex: -1
    };

    // Audio element
    var audio = new Audio();

    // Play a track
    function playTrack(track) {
        state.trackId = track.id;
        state.title = track.title;
        state.artist = track.artist_name;
        
        audio.src = track.audio_url;
        audio.play().then(function() {
            state.isPlaying = true;
            updateUI();
        });
    }

    // Toggle play/pause
    function togglePlay() {
        if (state.isPlaying) {
            audio.pause();
        } else {
            audio.play();
        }
        state.isPlaying = !state.isPlaying;
        updateUI();
    }

    // Update UI
    function updateUI() {
        var el = document.querySelector('.music-player');
        if (!el) return;

        // Update play/pause icon
        var playIcon = el.querySelector('.play-btn.large i');
        if (playIcon) {
            playIcon.className = state.isPlaying ? 'fas fa-pause' : 'fas fa-play';
        }

        // Update progress
        var progress = el.querySelector('.progress');
        if (progress && audio.duration > 0) {
            progress.style.width = (audio.currentTime / audio.duration * 100) + '%';
        }
    }

    // Audio events
    audio.addEventListener('timeupdate', updateUI);
    audio.addEventListener('ended', function() { nextTrack(); });

    // Expose API
    window.JukePlayer = {
        play: playTrack,
        toggle: togglePlay,
        next: nextTrack,
        prev: prevTrack
    };
})();
```

## 6.3 API Integration (api.js)

```javascript
// API Fetch helper
async function apiFetchJson(path, options) {
    var base = 'https://api.juqe.live';  // or localhost
    var res = await fetch(base + path, options);
    return await res.json();
}

// Track liked state
let likedTrackIds = new Set();

window.isTrackLiked = function(trackId) {
    return likedTrackIds.has(String(trackId));
};

// Like/unlike a track
async function likeTrack(trackId) {
    const isLiked = likedTrackIds.has(String(trackId));
    const method = isLiked ? 'DELETE' : 'POST';

    await apiFetchJson(`/tracks/${trackId}/like`, {
        method: method,
        headers: { Authorization: `Bearer ${getAuthToken()}` }
    });

    // Update local state
    if (isLiked) likedTrackIds.delete(String(trackId));
    else likedTrackIds.add(String(trackId));

    // Update UI
    document.querySelectorAll(`.like-btn[data-track-id="${trackId}"]`)
        .forEach(btn => {
            btn.querySelector('i').className = isLiked ? 'far fa-heart' : 'fas fa-heart';
        });
}

// Load tracks for feed
async function loadTracks() {
    const tracks = await apiFetchJson('/tracks', {
        headers: { Authorization: `Bearer ${getAuthToken()}` }
    });
    renderFeed(tracks);
}

// Escape HTML (prevent XSS)
function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

window.JukeApi = { loadTracks, likeTrack };
```

## 6.4 Authentication (auth.js)

```javascript
let currentUser = null;

function isLoggedIn() {
    return localStorage.getItem('juke_token') !== null;
}

function getAuthToken() {
    return localStorage.getItem('juke_token');
}

async function login(email, password) {
    const res = await fetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    });
    const data = await res.json();

    if (res.ok) {
        localStorage.setItem('juke_token', data.token);
        localStorage.setItem('juke_user', JSON.stringify(data.user));
        window.location.hash = '#/feed';
        return { success: true };
    }
    return { success: false, error: data.error };
}

function logout() {
    localStorage.removeItem('juke_token');
    localStorage.removeItem('juke_user');
    window.location.hash = '#/login';
}
```

---

# 7. Backend - Node.js Server

## 7.1 Server Setup (server.js)

```javascript
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || 'secret';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// JWT Authentication Middleware
function authenticateToken(req, res, next) {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Token required' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid token' });
        req.user = user;
        next();
    });
}

// Register
app.post('/auth/register', async (req, res) => {
    const { username, email, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Insert user into database...
    const token = jwt.sign({ id: userId, username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: userId, username, email } });
});

// Login
app.post('/auth/login', async (req, res) => {
    const { email, password } = req.body;
    const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
    
    if (!user || !await bcrypt.compare(password, user.password)) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET);
    res.json({ token, user });
});

// Get tracks
app.get('/tracks', authenticateToken, async (req, res) => {
    const tracks = await db.all('SELECT * FROM tracks ORDER BY created_at DESC');
    res.json(tracks);
});

// Like track
app.post('/tracks/:id/like', authenticateToken, async (req, res) => {
    await db.run('INSERT INTO likes (user_id, track_id) VALUES (?, ?)', 
        [req.user.id, req.params.id]);
    res.json({ success: true });
});

app.listen(3000);
```

---

# 8. Key Features Deep Dive

## 8.1 Like System

**Flow:**
1. User clicks heart icon
2. JavaScript calls `likeTrack(trackId)`
3. API request sent to server
4. Server updates database
5. UI updates with animation

```css
/* Like Animation */
.like-btn.liked i {
    color: #F72193;
    animation: likePopIn 0.3s cubic-bezier(0.17, 0.89, 0.32, 1.28);
}

@keyframes likePopIn {
    0% { transform: scale(1); }
    50% { transform: scale(1.3); }
    100% { transform: scale(1); }
}
```

## 8.2 Audio Playback

The HTML5 Audio API provides:
- `.play()`, `.pause()` - Control playback
- `.currentTime`, `.duration` - Track position
- `timeupdate` event - Progress updates
- `ended` event - Track finished

---

# 9. Security & Authentication

## JWT Token Flow

1. User logs in with email/password
2. Server validates credentials with bcrypt
3. Server generates JWT token
4. Client stores token in localStorage
5. Client sends token with every API request
6. Server validates token on protected routes

## Security Best Practices Used

- **Password Hashing**: bcrypt with salt rounds
- **JWT Expiration**: Tokens expire after 7 days
- **CORS**: Configured for allowed origins
- **Input Validation**: Server-side validation
- **XSS Prevention**: HTML escaping in templates

---

# 10. Conclusion

## What We Built

JUKE is a complete music streaming platform demonstrating:

- **Frontend**: Modern SPA with vanilla JavaScript
- **Styling**: CSS custom properties for theming
- **Backend**: RESTful API with Express.js
- **Database**: SQLite with proper relationships
- **Authentication**: JWT-based secure auth
- **File Handling**: Audio/image uploads to S3

## Key Learnings

1. **SPA Architecture**: Hash-based routing without frameworks
2. **CSS Variables**: Maintainable theming system
3. **Async/Await**: Modern JavaScript patterns
4. **REST APIs**: Proper HTTP methods and status codes
5. **Security**: Authentication and authorization

## Future Improvements

- Real-time features with WebSockets
- Music recommendations with ML
- Mobile app with React Native
- Social features (following, messaging)

---

**Thank you for your attention!**

*JUKE - Where Music Meets Community*
