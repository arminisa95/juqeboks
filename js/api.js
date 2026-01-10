// JUKE API Integration
var DEFAULT_API_BASE = (function () {
    try {
        if (window.location && window.location.origin) {
            var host = String(window.location.hostname || '');
            if (host.endsWith('github.io')) return 'https://juke-api.onrender.com/api';
            return window.location.origin.replace(/\/$/, '') + '/api';
        }
    } catch (_) {
    }
    return 'https://juke-api.onrender.com/api';
})();
var API_BASE = (function () {
    try {
        return localStorage.getItem('juke_api_base') || DEFAULT_API_BASE;
    } catch (_) {
        return DEFAULT_API_BASE;
    }
})();
var API_ORIGIN = API_BASE.replace(/\/api$/, '');

function getApiBase() {
    try {
        return localStorage.getItem('juke_api_base') || DEFAULT_API_BASE;
    } catch (_) {
        return DEFAULT_API_BASE;
    }
}

function getApiOrigin() {
    return getApiBase().replace(/\/api$/, '');
}

function getApiBases() {
    var bases = [getApiBase(), 'https://juke-api.onrender.com/api'];
    return bases.filter(function (v, i, a) {
        return !!v && a.indexOf(v) === i;
    });
}

async function apiFetchJson(path, options, validateOkData) {
    var bases = getApiBases();
    var lastErr = null;

    for (var i = 0; i < bases.length; i++) {
        var base = bases[i];
        try {
            var res = await fetch(base + path, options || {});
            var data = null;

            try {
                data = await res.json();
            } catch (_) {
                var text = '';
                try {
                    text = await res.text();
                } catch (_) {
                }
                data = text ? { error: text } : null;
            }

            if (res.ok) {
                if (typeof validateOkData === 'function' && !validateOkData(data)) {
                    lastErr = new Error('Invalid response from ' + (base + path));
                    continue;
                }
                try {
                    localStorage.setItem('juke_api_base', base);
                } catch (_) {
                }
                return data;
            }

            if (res.status === 401 || res.status === 403 || res.status === 404 || res.status === 405) {
                lastErr = new Error(((data && data.error) ? data.error : ('Request failed: ' + res.status)) + ' (' + (base + path) + ')');
                continue;
            }

            throw new Error(((data && data.error) ? data.error : ('Request failed: ' + res.status)) + ' (' + (base + path) + ')');
        } catch (e) {
            lastErr = e;
        }
    }

    throw lastErr || new Error('Network error');
}

let likedTrackIds = new Set();

window.isTrackLiked = function (trackId) {
    try {
        return likedTrackIds.has(String(trackId));
    } catch (_) {
        return false;
    }
};

function isSpaMode() {
    return !!(document.body && document.body.dataset && document.body.dataset.spa);
}

function getAuthToken() {
    return localStorage.getItem('juke_token');
}

function resolveAssetUrl(url, fallback) {
    if (!url) return fallback;
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    if (url.startsWith('/')) return `${getApiOrigin()}${url}`;
    return url;
}

async function fetchJson(url, options = {}) {
    const response = await fetch(url, options);
    if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Request failed: ${response.status}`);
    }
    return response.json();
}

async function loadLikedTrackIds() {
    const token = getAuthToken();
    if (!token) {
        likedTrackIds = new Set();
        return;
    }

    try {
        const profile = await apiFetchJson('/users/profile', {
            headers: {
                Authorization: `Bearer ${token}`
            }
        }, function (d) {
            return !!d && typeof d === 'object' && !Array.isArray(d);
        });
        const favorites = (profile && profile.favorites) ? profile.favorites : [];
        likedTrackIds = new Set(favorites.map((t) => String(t && t.id)));
    } catch (e) {
        likedTrackIds = new Set();
    }
}

function getCurrentUserId() {
    try {
        if (typeof getCurrentUser === 'function') {
            const u = getCurrentUser();
            return u && u.id ? u.id : null;
        }
    } catch (_) {
        return null;
    }
    try {
        const raw = localStorage.getItem('juke_user');
        if (!raw) return null;
        const u = JSON.parse(raw);
        return u && u.id ? u.id : null;
    } catch (_) {
        return null;
    }
}

async function loadMyTracks() {
    try {
        const tracksGrid = document.getElementById('tracksGrid');
        if (!tracksGrid) return;

        try {
            const libraryHeader = document.querySelector('.library-header');
            if (libraryHeader) {
                const existing = libraryHeader.querySelector('.user-summary');
                if (existing) existing.remove();
            }
        } catch (_) {
        }

        const token = getAuthToken();
        if (!token) {
            if (isSpaMode()) {
                window.location.hash = '#/login';
            } else {
                window.location.href = 'login.html';
            }
            return;
        }

        await loadLikedTrackIds();

        const tracks = await apiFetchJson('/tracks/my', {
            headers: {
                Authorization: `Bearer ${token}`
            }
        }, function (d) {
            return Array.isArray(d);
        });
        displayCollectionTracks(tracks);
    } catch (error) {
        console.error('Error loading my tracks:', error);

        try {
            const tracksGrid = document.getElementById('tracksGrid');
            if (tracksGrid) {
                tracksGrid.innerHTML = '<div class="empty-state">Failed to load your uploaded tracks. Please refresh and try again.</div>';
            }
        } catch (_) {
        }
    }
}

async function loadUserTracks(userId) {
    try {
        const tracksGrid = document.getElementById('tracksGrid');
        if (!tracksGrid) return;

        const token = getAuthToken();
        if (!token) {
            if (isSpaMode()) {
                window.location.hash = '#/login';
            } else {
                window.location.href = 'login.html';
            }
            return;
        }

        await loadLikedTrackIds();
        await renderUserHeader(userId);

        const tracks = await apiFetchJson(`/tracks/user/${encodeURIComponent(userId)}`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        }, function (d) {
            return Array.isArray(d);
        });

        displayCollectionTracks(tracks);
    } catch (error) {
        console.error('Error loading user tracks:', error);

        try {
            const tracksGrid = document.getElementById('tracksGrid');
            if (tracksGrid) {
                tracksGrid.innerHTML = '<div class="empty-state">Failed to load this user\'s tracks.</div>';
            }
        } catch (_) {
        }
    }
}

async function renderUserHeader(userId) {
    try {
        const token = getAuthToken();
        if (!token) return;

        const libraryHeader = document.querySelector('.library-header');
        if (!libraryHeader) return;

        if (String(getCurrentUserId() || '') === String(userId || '')) {
            const existing = libraryHeader.querySelector('.user-summary');
            if (existing) existing.remove();
            return;
        }

        const summary = await apiFetchJson(`/users/${encodeURIComponent(userId)}/summary`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        }, function (d) {
            return !!d && typeof d === 'object' && !Array.isArray(d);
        });

        let host = libraryHeader.querySelector('.user-summary');
        if (!host) {
            host = document.createElement('div');
            host.className = 'user-summary';
            libraryHeader.appendChild(host);
        }

        const likedByMe = !!summary.liked_by_me;
        const likesCount = (typeof summary.likes_count === 'number') ? summary.likes_count : 0;
        const username = summary.username || 'User';

        host.innerHTML = `
            <div style="display:flex; align-items:center; gap:0.75rem; flex-wrap:wrap;">
                <div style="color:#dbd8d8;">Viewing @${username}</div>
                <button class="filter-btn" id="btnLikeUser" type="button">${likedByMe ? 'Liked' : 'Like'} (${likesCount})</button>
            </div>
        `;

        const btn = host.querySelector('#btnLikeUser');
        if (btn) {
            btn.onclick = async function () {
                try {
                    const data = await apiFetchJson(`/users/${encodeURIComponent(userId)}/like`, {
                        method: 'POST',
                        headers: {
                            Authorization: `Bearer ${token}`
                        }
                    }, function (d) {
                        return !!d && typeof d === 'object' && !Array.isArray(d) && typeof d.liked === 'boolean';
                    });

                    const newLiked = !!data.liked;
                    const newCount = (typeof data.likes_count === 'number') ? data.likes_count : 0;
                    btn.textContent = `${newLiked ? 'Liked' : 'Like'} (${newCount})`;
                } catch (e) {
                    console.error('Like user failed:', e);
                }
            };
        }
    } catch (e) {
        console.error('Render user header failed:', e);
    }
}

// Fetch all tracks for feed
async function loadTracks() {
    try {
        const tracksGrid = document.getElementById('tracksGrid');

        await loadLikedTrackIds();

        if (tracksGrid) {
            await loadMyTracks();
            return;
        }

        const feedGrid = document.querySelector('.music-grid');
        if (feedGrid) {
            await loadFeedStream(true);
            return;
        }

        const tracks = await apiFetchJson('/tracks', {}, function (d) {
            return Array.isArray(d);
        });
        displayFeedTracks(tracks);
    } catch (error) {
        console.error('Error loading tracks:', error);
    }
}

var feedState = {
    offset: 0,
    limit: 10,
    loading: false,
    done: false,
    bound: false,
    storiesLoaded: false,
    trackIds: [],
    sharedTrackPlayed: false
};

function getHashQueryParam(key) {
    try {
        var h = String(window.location.hash || '');
        var idx = h.indexOf('?');
        if (idx === -1) return null;
        var qs = h.slice(idx + 1);
        var params = new URLSearchParams(qs);
        return params.get(key);
    } catch (_) {
        return null;
    }
}

function maybeAutoPlaySharedTrack() {
    try {
        if (feedState.sharedTrackPlayed) return;
        var id = getHashQueryParam('track');
        if (!id) return;
        feedState.sharedTrackPlayed = true;
        if (typeof playTrack === 'function') {
            playTrack(String(id));
        }
    } catch (_) {
    }
}

async function renderStoriesBar() {
    try {
        const feedContainer = document.querySelector('.feed-container');
        if (!feedContainer || feedState.storiesLoaded) return;
        
        let storiesBar = feedContainer.querySelector('.stories-bar');
        if (!storiesBar) {
            storiesBar = document.createElement('div');
            storiesBar.className = 'stories-bar';
            const title = feedContainer.querySelector('.feed-title');
            if (title) {
                title.insertAdjacentElement('afterend', storiesBar);
            } else {
                feedContainer.insertAdjacentElement('afterbegin', storiesBar);
            }
        }
        
        const tracks = await apiFetchJson('/tracks/new?limit=20&offset=0', {}, d => Array.isArray(d));
        const uploaders = new Map();
        
        (tracks || []).forEach(t => {
            if (t.uploader_id && t.uploader_username && !uploaders.has(t.uploader_id)) {
                uploaders.set(t.uploader_id, {
                    id: t.uploader_id,
                    username: t.uploader_username,
                    avatar: t.cover_image_url || null,
                    hasNew: true
                });
            }
        });
        
        if (uploaders.size === 0) {
            storiesBar.style.display = 'none';
            return;
        }
        
        storiesBar.innerHTML = '';
        uploaders.forEach(u => {
            const item = document.createElement('div');
            item.className = 'story-item';
            item.innerHTML = `
                <div class="story-avatar ${u.hasNew ? '' : 'no-story'}">
                    <img src="${resolveAssetUrl(u.avatar, 'images/juke.png')}" alt="${u.username}">
                </div>
                <div class="story-username">${u.username}</div>
            `;
            item.addEventListener('click', () => {
                if (isSpaMode()) {
                    window.location.hash = '#/koleqtion/' + u.id;
                } else {
                    window.location.href = 'koleqtion.html?user=' + u.id;
                }
            });
            storiesBar.appendChild(item);
        });
        
        feedState.storiesLoaded = true;
    } catch (e) {
        console.error('Stories bar failed:', e);
    }
}

async function loadFeedStream(reset) {
    const grid = document.querySelector('.music-grid');
    if (!grid) return;

    if (reset) {
        feedState.offset = 0;
        feedState.done = false;
        feedState.storiesLoaded = false;
        feedState.trackIds = [];
        feedState.sharedTrackPlayed = false;
        grid.innerHTML = '';
        renderStoriesBar();
    }

    if (feedState.loading || feedState.done) return;
    feedState.loading = true;

    try {
        await loadLikedTrackIds();
    } catch (_) {
    }

    try {
        const tracks = await apiFetchJson('/tracks/new?limit=' + feedState.limit + '&offset=' + feedState.offset, {}, function (d) {
            return Array.isArray(d);
        });

        if (!Array.isArray(tracks) || tracks.length === 0) {
            feedState.done = true;
            return;
        }

        tracks.forEach(function (t) {
            grid.appendChild(createFeedPostCard(t));
            try {
                if (t && t.id != null) {
                    var idStr = String(t.id);
                    if (feedState.trackIds.indexOf(idStr) === -1) {
                        feedState.trackIds.push(idStr);
                    }
                }
            } catch (_) {
            }
        });

        // Update contextual queue for prev/next
        try {
            if (window.JukePlayer && typeof window.JukePlayer.setTrackList === 'function') {
                window.JukePlayer.setTrackList(feedState.trackIds.slice());
            }
        } catch (_) {
        }

        // If user opened a shared link like #/feed?track=123, auto-play it once
        maybeAutoPlaySharedTrack();

        feedState.offset += tracks.length;
    } catch (e) {
        console.error('Feed stream load failed:', e);
    } finally {
        feedState.loading = false;
    }

    if (!feedState.bound) {
        feedState.bound = true;
        window.addEventListener('scroll', function () {
            try {
                if (feedState.loading || feedState.done) return;
                var nearBottom = (window.innerHeight + window.scrollY) >= (document.body.offsetHeight - 900);
                if (nearBottom) {
                    loadFeedStream(false);
                }
            } catch (_) {
            }
        });
    }
}

function displayFeedTracks(tracks) {
    const musicGrid = document.querySelector('.music-grid');
    if (!musicGrid) return;

    musicGrid.innerHTML = '';

    // Set global track list for prev/next functionality
    try {
        if (window.JukePlayer && typeof window.JukePlayer.setTrackList === 'function') {
            const trackIds = tracks.map(t => String(t.id));
            window.JukePlayer.setTrackList(trackIds);
        }
    } catch (_) {}

    tracks.forEach(track => {
        const trackCard = createFeedPostCard(track);
        musicGrid.appendChild(trackCard);
    });
}

function displayCollectionTracks(tracks) {
    const tracksGrid = document.getElementById('tracksGrid');
    if (!tracksGrid) return;

    try {
        tracksGrid.classList.add('music-grid');
        tracksGrid.classList.remove('tracks-grid');
    } catch (_) {
    }

    tracksGrid.innerHTML = '';

    if (!Array.isArray(tracks)) {
        tracksGrid.innerHTML = '<div class="empty-state">Failed to load tracks.</div>';
        return;
    }

    if (!tracks || tracks.length === 0) {
        tracksGrid.innerHTML = '<div class="empty-state">No uploaded tracks yet.</div>';
        return;
    }

    // Set global track list for prev/next functionality
    try {
        if (window.JukePlayer && typeof window.JukePlayer.setTrackList === 'function') {
            const trackIds = tracks.map(t => String(t.id));
            window.JukePlayer.setTrackList(trackIds);
        }
    } catch (_) {}

    tracks.forEach(track => {
        const card = createFeedPostCard(track);
        tracksGrid.appendChild(card);
    });
}

function createFeedPostCard(track) {
    const card = document.createElement('div');
    card.className = 'music-card';

    const coverUrl = resolveAssetUrl(track.cover_image_url, '../images/juke.png');
    const artistName = track.artist_name || 'Unknown Artist';
    const uploaderName = track.uploader_username || '';
    const uploaderId = track.uploader_id || '';
    const currentUserId = getCurrentUserId();
    let isAdmin = false;
    try {
        if (typeof getCurrentUser === 'function') {
            const u = getCurrentUser();
            isAdmin = !!(u && (u.isAdmin || u.is_admin));
        }
    } catch (_) {
        isAdmin = false;
    }
    const trackIdStr = String(track.id);
    const isLiked = likedTrackIds.has(trackIdStr);
    const canDelete = !!isAdmin || (!!currentUserId && !!uploaderId && String(uploaderId) === String(currentUserId));

    const safeTitle = (track && track.title) ? String(track.title) : '';
    const safeArtist = (artistName && typeof artistName === 'string') ? artistName : '';
    const coverMedia = `<img class="post-media" src="${coverUrl}" alt="${safeTitle}">`;
    const uploaderLine = (uploaderName && uploaderId && String(uploaderId) !== String(currentUserId || ''))
        ? `<a href="#/koleqtion/${uploaderId}" class="uploader-link">@${uploaderName}</a>`
        : (uploaderName ? `<span class="uploader-link">@${uploaderName}</span>` : '');

    card.innerHTML = `
        <div class="post-header">
            <div class="post-header-left">
                <div class="post-title">${safeTitle}</div>
                <div class="post-subtitle">${safeArtist}</div>
            </div>
            <div class="post-header-right">${uploaderLine}</div>
        </div>

        <div class="post-media-wrap" data-track-id="${track.id}">
            ${coverMedia}
            <i class="fas fa-heart double-tap-heart"></i>
            <button class="post-play" type="button" aria-label="Play" data-track-id="${track.id}">
                <i class="fas fa-play"></i>
            </button>
        </div>

        <div class="post-actions">
            <div class="post-actions-left">
                <button class="post-action like-btn ${isLiked ? 'liked' : ''}" data-track-id="${track.id}" type="button" aria-label="Like">
                    <i class="${isLiked ? 'fas' : 'far'} fa-heart"></i>
                </button>
                <button class="post-action post-comment-toggle" type="button" aria-expanded="false" aria-label="Comments">
                    <i class="far fa-comment"></i>
                </button>
                <button class="post-action share-btn" type="button" aria-label="Share">
                    <i class="far fa-paper-plane"></i>
                </button>
                ${canDelete ? `
                <button class="post-action" type="button" onclick="deleteTrack('${track.id}', event);" aria-label="Delete track">
                    <i class="fas fa-trash"></i>
                </button>
                ` : ''}
            </div>
            <div class="post-actions-right">
                <button class="post-action save-btn" data-track-id="${track.id}" type="button" aria-label="Save">
                    <i class="far fa-bookmark"></i>
                </button>
            </div>
        </div>

        <div class="post-comments">
            <div class="post-comments-title">Comments</div>
            <div class="post-comments-list" data-track-id="${track.id}"></div>
            <div class="post-comment-compose">
                <input type="text" class="post-comment-input" placeholder="Add a comment…" data-track-id="${track.id}">
                <button type="button" class="post-comment-send" data-track-id="${track.id}">Post</button>
            </div>
        </div>
    `;

    try {
        const cover = card.querySelector('.post-media-wrap');
        const play = card.querySelector('.post-play');
        const likeBtn = card.querySelector('.like-btn');
        const saveBtn = card.querySelector('.save-btn');
        const shareBtn = card.querySelector('.share-btn');
        const heart = card.querySelector('.double-tap-heart');
        
        let lastTap = 0;
        if (cover && !cover.dataset.bound) {
            cover.dataset.bound = '1';
            cover.addEventListener('click', function (e) {
                try {
                    if (e && e.target && e.target.closest && e.target.closest('button')) return;
                } catch (_) {}
                
                const now = Date.now();
                if (now - lastTap < 300) {
                    if (heart) {
                        heart.classList.remove('animate');
                        void heart.offsetWidth;
                        heart.classList.add('animate');
                        setTimeout(() => heart.classList.remove('animate'), 800);
                    }
                    if (!likedTrackIds.has(trackIdStr)) {
                        likeTrack(trackIdStr);
                        // Immediately update UI for double-tap like
                        const isLiked = likedTrackIds.has(trackIdStr);
                        if (likeBtn) {
                            const icon = likeBtn.querySelector('i');
                            if (icon) {
                                icon.className = isLiked ? 'fas fa-heart' : 'far fa-heart';
                            }
                            likeBtn.classList.toggle('liked', isLiked);
                        }
                    }
                } else {
                    playTrack(String(track.id));
                }
                lastTap = now;
            });
        }
        
        if (play && !play.dataset.bound) {
            play.dataset.bound = '1';
            play.addEventListener('click', function (e) {
                e.stopPropagation();
                playTrack(String(track.id));
            });
        }
        
        if (likeBtn && !likeBtn.dataset.bound) {
            likeBtn.dataset.bound = '1';
            likeBtn.addEventListener('click', function () {
                likeTrack(trackIdStr);
                // Immediately update this like button UI
                const isLiked = likedTrackIds.has(trackIdStr);
                const icon = likeBtn.querySelector('i');
                if (icon) {
                    icon.className = isLiked ? 'fas fa-heart' : 'far fa-heart';
                }
                likeBtn.classList.toggle('liked', isLiked);
            });
        }
        
        if (saveBtn && !saveBtn.dataset.bound) {
            saveBtn.dataset.bound = '1';
            saveBtn.addEventListener('click', function () {
                saveBtn.classList.toggle('saved');
                const icon = saveBtn.querySelector('i');
                if (icon) {
                    icon.className = saveBtn.classList.contains('saved') ? 'fas fa-bookmark' : 'far fa-bookmark';
                }
                addToPlaylist(String(track.id));
            });
        }
        
        if (shareBtn && !shareBtn.dataset.bound) {
            shareBtn.dataset.bound = '1';
            shareBtn.addEventListener('click', function () {
                try {
                    if (typeof window.shareTrackById === 'function') {
                        window.shareTrackById(String(track.id), { title: track.title, text: track.artist_name });
                    }
                } catch (_) {
                }
            });
        }
        
        const toggle = card.querySelector('.post-comment-toggle');
        const comments = card.querySelector('.post-comments');
        if (toggle && comments && !toggle.dataset.bound) {
            toggle.dataset.bound = '1';
            toggle.addEventListener('click', function () {
                const open = card.classList.contains('comments-open');
                card.classList.toggle('comments-open', !open);
                toggle.setAttribute('aria-expanded', open ? 'false' : 'true');
            });
        }
        
        const commentInput = card.querySelector('.post-comment-input');
        const commentSend = card.querySelector('.post-comment-send');
        if (commentInput && commentSend && !commentSend.dataset.bound) {
            commentSend.dataset.bound = '1';
            commentSend.addEventListener('click', async function () {
                const text = commentInput.value.trim();
                if (!text) return;
                commentInput.value = '';
            });
            commentInput.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') commentSend.click();
            });
        }
    } catch (_) {
    }

    return card;
}

function createCollectionTrackCard(track) {
    const card = document.createElement('div');
    card.className = 'track-card';

    const coverUrl = resolveAssetUrl(track.cover_image_url, '../images/juke.png');
    const artistName = track.artist_name || 'Unknown Artist';
    const isLiked = likedTrackIds.has(String(track.id));
    const currentUserId = getCurrentUserId();
    const canDelete = !!currentUserId && !!track.uploader_id && String(track.uploader_id) === String(currentUserId);

    card.innerHTML = `
        <div class="track-cover">
            <img src="${coverUrl}" alt="${track.title}" onclick="playTrack('${track.id}')">
            <div class="track-overlay">
                <button class="play-btn" onclick="playTrack('${track.id}')">
                    <i class="fas fa-play"></i>
                </button>
            </div>
        </div>
        <div class="track-info">
            <h3 class="track-title">${track.title}</h3>
            <p class="track-artist">${artistName}</p>
            <div class="track-stats">
                <span>${track.genre || ''}</span>
                <div class="track-actions">
                    <button class="action-btn ${isLiked ? 'liked' : ''}" data-track-id="${track.id}" onclick="likeTrack('${track.id}')">
                        <i class="${isLiked ? 'fas' : 'far'} fa-heart"></i>
                    </button>
                    <button class="action-btn share-btn" data-track-id="${track.id}" type="button" aria-label="Share">
                        <i class="far fa-paper-plane"></i>
                    </button>
                    ${canDelete ? `
                    <button class="action-btn delete-btn" onclick="deleteTrack('${track.id}', event);" aria-label="Delete track">
                        <i class="fas fa-trash"></i>
                    </button>
                    ` : ''}
                </div>
            </div>
        </div>
    `;

    try {
        const shareBtn = card.querySelector('.share-btn');
        if (shareBtn && !shareBtn.dataset.bound) {
            shareBtn.dataset.bound = '1';
            shareBtn.addEventListener('click', function (e) {
                try {
                    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
                } catch (_) {
                }
                try {
                    if (typeof window.shareTrackById === 'function') {
                        window.shareTrackById(String(track.id), { title: track.title, text: track.artist_name });
                    }
                } catch (_) {
                }
            });
        }
    } catch (_) {
    }

    return card;
}

async function deleteTrack(trackId, evt) {
    try {
        if (evt && typeof evt.stopPropagation === 'function') {
            evt.stopPropagation();
        }
    } catch (_) {
    }

    const token = getAuthToken();
    if (!token) {
        if (isSpaMode()) {
            window.location.hash = '#/login';
        } else {
            window.location.href = 'login.html';
        }
        return;
    }

    const ok = window.confirm('Delete this track?');
    if (!ok) return;

    try {
        await fetchJson(`${getApiBase()}/tracks/${encodeURIComponent(trackId)}`, {
            method: 'DELETE',
            headers: {
                Authorization: `Bearer ${token}`
            }
        });
        await loadTracks();
    } catch (e) {
        console.error('Deleting track failed:', e);
        alert('Delete failed. Please try again.');
    }
}

// Play track function
function playTrack(trackId) {
    const token = getAuthToken();
    if (!token) {
        if (isSpaMode()) {
            window.location.hash = '#/login';
        } else {
            window.location.href = 'login.html';
        }
        return;
    }

    if (window.JukePlayer && typeof window.JukePlayer.playTrackById === 'function') {
        window.JukePlayer.playTrackById(trackId);
        return;
    }

    console.log('Player not initialized yet.');
}

// Like track function
async function likeTrack(trackId) {
    const token = getAuthToken();
    if (!token) {
        if (isSpaMode()) {
            window.location.hash = '#/login';
        } else {
            window.location.href = 'login.html';
        }
        return;
    }

    trackId = String(trackId);

    // Optimistically toggle local state before API
    const wasLiked = likedTrackIds.has(trackId);
    const newLiked = !wasLiked;
    if (newLiked) {
        likedTrackIds.add(trackId);
    } else {
        likedTrackIds.delete(trackId);
    }

    try {
        document.querySelectorAll(`.like-btn[data-track-id="${CSS.escape(String(trackId))}"], .action-btn[data-track-id="${CSS.escape(String(trackId))}"]`).forEach((btn) => {
            const icon = btn.querySelector('i');
            if (icon) {
                icon.className = newLiked ? 'fas fa-heart' : 'far fa-heart';
            }
            if (btn && btn.classList) {
                btn.classList.toggle('liked', !!newLiked);
            }
        });
    } catch (_) {
    }

    try {
        window.dispatchEvent(new CustomEvent('tracks:liked-changed', {
            detail: { trackId: trackId, liked: !!newLiked }
        }));
    } catch (_) {
    }

    try {
        const data = await apiFetchJson(`/tracks/${encodeURIComponent(trackId)}/like`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`
            }
        }, function (d) {
            return !!d && typeof d === 'object' && !Array.isArray(d) && typeof d.liked === 'boolean';
        });

        // Reconcile with server response if needed
        if (data && typeof data.liked === 'boolean') {
            if (data.liked) {
                likedTrackIds.add(trackId);
            } else {
                likedTrackIds.delete(trackId);
            }
        }

        try {
            window.dispatchEvent(new CustomEvent('tracks:liked-changed', {
                detail: { trackId: trackId, liked: !!(data && data.liked) }
            }));
        } catch (_) {
        }

        try {
            document.querySelectorAll(`.like-btn[data-track-id="${CSS.escape(String(trackId))}"], .action-btn[data-track-id="${CSS.escape(String(trackId))}"]`).forEach((btn) => {
                const icon = btn.querySelector('i');
                if (icon) {
                    icon.className = (data && data.liked) ? 'fas fa-heart' : 'far fa-heart';
                }
                if (btn && btn.classList) {
                    btn.classList.toggle('liked', !!(data && data.liked));
                }
            });
        } catch (_) {
        }
    } catch (e) {
        // Revert optimistic update on failure
        if (wasLiked) {
            likedTrackIds.add(trackId);
        } else {
            likedTrackIds.delete(trackId);
        }

        try {
            const revertedLiked = !!wasLiked;
            document.querySelectorAll(`.like-btn[data-track-id="${CSS.escape(String(trackId))}"], .action-btn[data-track-id="${CSS.escape(String(trackId))}"]`).forEach((btn) => {
                const icon = btn.querySelector('i');
                if (icon) {
                    icon.className = revertedLiked ? 'fas fa-heart' : 'far fa-heart';
                }
                if (btn && btn.classList) {
                    btn.classList.toggle('liked', revertedLiked);
                }
            });
        } catch (_) {
        }

        try {
            window.dispatchEvent(new CustomEvent('tracks:liked-changed', {
                detail: { trackId: trackId, liked: !!wasLiked }
            }));
        } catch (_) {
        }

        console.error('Liking track failed:', e);
    }
}

// Add to playlist function
async function addToPlaylist(trackId) {
    const token = getAuthToken();
    if (!token) {
        if (isSpaMode()) {
            window.location.hash = '#/login';
        } else {
            window.location.href = 'login.html';
        }
        return;
    }

    try {
        const playlists = await apiFetchJson('/playlists/my', {
            headers: {
                Authorization: `Bearer ${token}`
            }
        }, function (d) {
            return Array.isArray(d);
        });

        const name = window.prompt('Add to playlist (type an existing playlist name or a new name):', (playlists && playlists[0] && playlists[0].name) ? playlists[0].name : '');
        if (!name) return;

        const trimmed = String(name).trim();
        if (!trimmed) return;

        const existing = (playlists || []).find((p) => String(p.name || '').toLowerCase() === trimmed.toLowerCase());

        let playlistId = existing ? existing.id : null;
        if (!playlistId) {
            const created = await apiFetchJson('/playlists', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ name: trimmed })
            }, function (d) {
                return !!d && typeof d === 'object' && !Array.isArray(d) && !!d.id;
            });
            playlistId = created.id;
        }

        await apiFetchJson(`/playlists/${encodeURIComponent(playlistId)}/tracks`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ track_id: trackId })
        }, function (d) {
            return !!d && typeof d === 'object' && !Array.isArray(d) && d.success === true;
        });

        alert('Added to playlist.');
    } catch (e) {
        console.error('Add to playlist failed:', e);
        var msg = 'Add to playlist failed.';
        try {
            if (e && e.message) msg = e.message;
        } catch (_) {
        }
        alert(msg);
    }
}

// Load tracks when page loads
document.addEventListener('DOMContentLoaded', function() {
    if (isSpaMode()) return;
    if (document.querySelector('.music-grid') || document.getElementById('tracksGrid')) {
        loadTracks();
    }
});

function debounce(fn, waitMs) {
    var t = null;
    return function () {
        var ctx = this;
        var args = arguments;
        if (t) clearTimeout(t);
        t = setTimeout(function () {
            t = null;
            fn.apply(ctx, args);
        }, waitMs);
    };
}

function setupGlobalSearch() {
    var container = document.querySelector('.search-container');
    var input = document.querySelector('.search-bar');
    if (!container || !input) return;

    if (container.dataset.bound === 'true') return;
    container.dataset.bound = 'true';

    container.style.position = 'relative';

    var results = document.createElement('div');
    results.className = 'search-results';
    results.style.display = 'none';
    container.appendChild(results);

    function hide() {
        results.style.display = 'none';
        results.innerHTML = '';
    }

    function showLoading() {
        results.style.display = '';
        results.innerHTML = '<div class="search-results__item search-results__item--muted">Searching…</div>';
    }

    function renderTracks(tracks) {
        if (!Array.isArray(tracks) || tracks.length === 0) {
            results.style.display = '';
            results.innerHTML = '<div class="search-results__item search-results__item--muted">No results</div>';
            return;
        }

        results.style.display = '';
        results.innerHTML = tracks.slice(0, 10).map(function (t) {
            var coverFallback = isSpaMode() ? 'images/juke.png' : '../images/juke.png';
            var cover = resolveAssetUrl(t.cover_image_url, coverFallback);
            var title = (t && t.title) ? String(t.title) : 'Unknown';
            var artist = (t && t.artist_name) ? String(t.artist_name) : '';
            return (
                '<button type="button" class="search-results__item" data-track-id="' + String(t.id) + '">' +
                '  <img class="search-results__cover" src="' + cover + '" alt="">' +
                '  <span class="search-results__meta">' +
                '    <span class="search-results__title">' + title.replace(/</g, '&lt;') + '</span>' +
                '    <span class="search-results__subtitle">' + artist.replace(/</g, '&lt;') + '</span>' +
                '  </span>' +
                '  <span class="search-results__play"><i class="fas fa-play"></i></span>' +
                '</button>'
            );
        }).join('');
    }

    var doSearch = debounce(async function () {
        var q = String(input.value || '').trim();
        if (!q) {
            hide();
            return;
        }

        showLoading();
        try {
            var data = await apiFetchJson('/search?q=' + encodeURIComponent(q) + '&type=tracks&limit=10', {}, function (d) {
                return !!d && typeof d === 'object' && (Array.isArray(d.tracks) || Array.isArray(d));
            });

            var tracks = Array.isArray(data) ? data : (data && data.tracks ? data.tracks : []);
            renderTracks(tracks);
        } catch (e) {
            results.style.display = '';
            results.innerHTML = '<div class="search-results__item search-results__item--muted">Search failed</div>';
        }
    }, 200);

    input.addEventListener('input', function () {
        doSearch();
    });

    input.addEventListener('focus', function () {
        if (String(input.value || '').trim()) doSearch();
    });

    document.addEventListener('click', function (e) {
        try {
            if (!container.contains(e.target)) hide();
        } catch (_) {
            hide();
        }
    });

    results.addEventListener('click', function (e) {
        var btn = e.target && e.target.closest ? e.target.closest('.search-results__item[data-track-id]') : null;
        if (!btn) return;
        var id = btn.getAttribute('data-track-id');
        if (!id) return;
        try {
            input.blur();
        } catch (_) {
        }
        hide();
        playTrack(id);
    });
}

document.addEventListener('DOMContentLoaded', function () {
    setupGlobalSearch();
});

document.addEventListener('spa:navigate', function () {
    setupGlobalSearch();
});

// Disqo page functions
async function loadDisqoPage() {
    try {
        await loadDisqoFeatured();
        await loadDisqoRecommendations();
        await loadDisqoNewReleases();
        bindGenreCards();
    } catch (e) {
        console.error('Disqo load failed:', e);
    }
}

async function loadDisqoFeatured() {
    const featured = document.getElementById('disqoFeatured');
    if (!featured) return;
    
    try {
        const tracks = await apiFetchJson('/tracks/new?limit=1&offset=0', {}, d => Array.isArray(d));
        if (!tracks || tracks.length === 0) {
            featured.style.display = 'none';
            return;
        }
        
        const track = tracks[0];
        const coverUrl = resolveAssetUrl(track.cover_image_url, 'images/juke.png');
        
        featured.innerHTML = `
            <div class="disqo-featured-hero">
                <img class="disqo-featured-bg" src="${coverUrl}" alt="">
                <div class="disqo-featured-content">
                    <img class="disqo-featured-cover" src="${coverUrl}" alt="${track.title}">
                    <div class="disqo-featured-info">
                        <div class="disqo-featured-label">Featured Track</div>
                        <h1 class="disqo-featured-title">${track.title || 'Untitled'}</h1>
                        <div class="disqo-featured-artist">${track.artist_name || 'Unknown Artist'}</div>
                        <div class="disqo-featured-actions">
                            <button class="disqo-play-btn" data-track-id="${track.id}">
                                <i class="fas fa-play"></i> Play
                            </button>
                            <button class="disqo-save-btn" data-track-id="${track.id}">
                                <i class="far fa-bookmark"></i>
                            </button>
                            <button class="disqo-save-btn disqo-share-btn" data-track-id="${track.id}" type="button" aria-label="Share">
                                <i class="far fa-paper-plane"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        const playBtn = featured.querySelector('.disqo-play-btn');
        if (playBtn) {
            playBtn.addEventListener('click', () => playTrack(track.id));
        }
        
        const saveBtn = featured.querySelector('.disqo-save-btn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => addToPlaylist(track.id));
        }

        const shareBtn = featured.querySelector('.disqo-share-btn');
        if (shareBtn) {
            shareBtn.addEventListener('click', function (e) {
                try {
                    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
                } catch (_) {
                }
                try {
                    if (typeof window.shareTrackById === 'function') {
                        window.shareTrackById(String(track.id), { title: track.title, text: track.artist_name });
                    }
                } catch (_) {
                }
            });
        }
    } catch (e) {
        console.error('Featured load failed:', e);
    }
}

async function loadDisqoRecommendations() {
    const row = document.getElementById('recommendationsRow');
    if (!row) return;
    
    try {
        const tracks = await apiFetchJson('/tracks/new?limit=8&offset=1', {}, d => Array.isArray(d));
        if (!tracks || tracks.length === 0) {
            row.innerHTML = '<div class="empty-state">No recommendations yet</div>';
            return;
        }
        
        row.innerHTML = tracks.map(t => {
            const coverUrl = resolveAssetUrl(t.cover_image_url, 'images/juke.png');
            return `
                <div class="recommendation-card" data-track-id="${t.id}">
                    <img class="recommendation-cover" src="${coverUrl}" alt="">
                    <div class="recommendation-info">
                        <div class="recommendation-title">${t.title || 'Untitled'}</div>
                        <div class="recommendation-artist">${t.artist_name || ''}</div>
                        <button class="recommendation-play"><i class="fas fa-play"></i></button>
                        <button class="recommendation-share" type="button" aria-label="Share"><i class="far fa-paper-plane"></i></button>
                    </div>
                </div>
            `;
        }).join('');
        
        row.querySelectorAll('.recommendation-card').forEach(card => {
            card.addEventListener('click', (e) => {
                try {
                    if (e && e.target && e.target.closest && e.target.closest('button.recommendation-share')) return;
                } catch (_) {
                }
                const id = card.dataset.trackId;
                if (id) playTrack(id);
            });

            const shareBtn = card.querySelector('.recommendation-share');
            if (shareBtn && !shareBtn.dataset.bound) {
                shareBtn.dataset.bound = '1';
                shareBtn.addEventListener('click', function (e) {
                    try {
                        if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
                    } catch (_) {
                    }
                    const id = card.dataset.trackId;
                    if (!id) return;
                    try {
                        if (typeof window.shareTrackById === 'function') {
                            const t = (tracks || []).find(function (x) { return String(x.id) === String(id); });
                            window.shareTrackById(String(id), { title: t && t.title ? t.title : '', text: t && t.artist_name ? t.artist_name : '' });
                        }
                    } catch (_) {
                    }
                });
            }
        });
    } catch (e) {
        console.error('Recommendations load failed:', e);
    }
}

async function loadDisqoNewReleases() {
    const grid = document.getElementById('newReleasesGrid');
    if (!grid) return;
    
    try {
        const tracks = await apiFetchJson('/tracks/new?limit=12&offset=0', {}, d => Array.isArray(d));
        if (!tracks || tracks.length === 0) {
            grid.innerHTML = '<div class="empty-state">No new releases</div>';
            return;
        }
        
        grid.innerHTML = tracks.map(t => {
            const coverUrl = resolveAssetUrl(t.cover_image_url, 'images/juke.png');
            return `
                <div class="album-card" data-track-id="${t.id}">
                    <button class="album-share" type="button" aria-label="Share"><i class="far fa-paper-plane"></i></button>
                    <img class="album-cover" src="${coverUrl}" alt="">
                    <div class="album-title">${t.title || 'Untitled'}</div>
                    <div class="album-artist">${t.artist_name || ''}</div>
                </div>
            `;
        }).join('');
        
        grid.querySelectorAll('.album-card').forEach(card => {
            card.addEventListener('click', (e) => {
                try {
                    if (e && e.target && e.target.closest && e.target.closest('button.album-share')) return;
                } catch (_) {
                }
                const id = card.dataset.trackId;
                if (id) playTrack(id);
            });

            const shareBtn = card.querySelector('.album-share');
            if (shareBtn && !shareBtn.dataset.bound) {
                shareBtn.dataset.bound = '1';
                shareBtn.addEventListener('click', function (e) {
                    try {
                        if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
                    } catch (_) {
                    }
                    const id = card.dataset.trackId;
                    if (!id) return;
                    try {
                        if (typeof window.shareTrackById === 'function') {
                            const t = (tracks || []).find(function (x) { return String(x.id) === String(id); });
                            window.shareTrackById(String(id), { title: t && t.title ? t.title : '', text: t && t.artist_name ? t.artist_name : '' });
                        }
                    } catch (_) {
                    }
                });
            }
        });
    } catch (e) {
        console.error('New releases load failed:', e);
    }
}

function bindGenreCards() {
    const cards = document.querySelectorAll('.genre-card');
    cards.forEach(card => {
        if (card.dataset.bound) return;
        card.dataset.bound = '1';
        card.addEventListener('click', () => {
            const genre = card.dataset.genre;
            if (genre) {
                window.location.hash = '#/feed?genre=' + genre;
            }
        });
    });
}

// Koleqtion tabs functionality
function setupKoleqtionTabs() {
    const tabs = document.querySelectorAll('.tabs .tab');
    const grid = document.getElementById('tracksGrid');
    if (!tabs.length || !grid) return;
    
    tabs.forEach((tab, idx) => {
        if (tab.dataset.bound) return;
        tab.dataset.bound = '1';
        
        tab.addEventListener('click', async () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            const tabName = tab.textContent.trim().toLowerCase();
            grid.innerHTML = '<div class="empty-state">Loading...</div>';
            
            try {
                const token = getAuthToken();
                if (!token) {
                    grid.innerHTML = '<div class="empty-state">Please log in</div>';
                    return;
                }
                
                if (tabName === 'tracks') {
                    await loadMyTracks();
                } else if (tabName === 'playlists') {
                    const playlists = await apiFetchJson('/playlists/my', {
                        headers: { Authorization: `Bearer ${token}` }
                    }, d => Array.isArray(d));
                    renderKoleqtionPlaylists(playlists, grid);
                } else if (tabName === 'likes') {
                    const profile = await apiFetchJson('/users/profile', {
                        headers: { Authorization: `Bearer ${token}` }
                    }, d => !!d && typeof d === 'object');
                    const favorites = (profile && profile.favorites) ? profile.favorites : [];
                    if (favorites.length === 0) {
                        grid.innerHTML = '<div class="empty-state">No liked tracks yet</div>';
                    } else {
                        displayCollectionTracks(favorites);
                    }
                } else if (tabName === 'albums') {
                    grid.innerHTML = '<div class="empty-state">Albums coming soon</div>';
                }
            } catch (e) {
                console.error('Tab load failed:', e);
                grid.innerHTML = '<div class="empty-state">Failed to load</div>';
            }
        });
    });
}

function renderKoleqtionPlaylists(playlists, grid) {
    if (!playlists || playlists.length === 0) {
        grid.innerHTML = '<div class="empty-state">No playlists yet</div>';
        return;
    }
    
    grid.innerHTML = playlists.map(p => {
        const coverUrl = p.cover_url || 'images/juke.png';
        return `
            <div class="music-card" style="cursor:pointer" data-playlist-id="${p.id}">
                <div class="post-header">
                    <div class="post-header-left">
                        <div class="post-title">${p.name || 'Untitled'}</div>
                        <div class="post-subtitle">${p.track_count || 0} tracks</div>
                    </div>
                </div>
                <div class="post-media-wrap">
                    <img class="post-media" src="${coverUrl}" alt="" style="max-height:200px">
                </div>
            </div>
        `;
    }).join('');
    
    grid.querySelectorAll('[data-playlist-id]').forEach(card => {
        card.addEventListener('click', () => {
            const id = card.dataset.playlistId;
            if (id) window.location.hash = '#/lists?playlist=' + id;
        });
    });
}

window.JukeApi = {
    loadTracks,
    loadMyTracks,
    loadUserTracks,
    loadDisqoPage,
    setupKoleqtionTabs
};

window.deleteTrack = deleteTrack;
window.loadDisqoPage = loadDisqoPage;
window.setupKoleqtionTabs = setupKoleqtionTabs;
