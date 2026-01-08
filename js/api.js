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
                    lastErr = new Error('Invalid response');
                    continue;
                }
                try {
                    localStorage.setItem('juke_api_base', base);
                } catch (_) {
                }
                return data;
            }

            if (res.status === 401 || res.status === 403 || res.status === 404 || res.status === 405) {
                lastErr = new Error((data && data.error) ? data.error : ('Request failed: ' + res.status));
                continue;
            }

            throw new Error((data && data.error) ? data.error : ('Request failed: ' + res.status));
        } catch (e) {
            lastErr = e;
        }
    }

    throw lastErr || new Error('Network error');
}

let likedTrackIds = new Set();

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
        likedTrackIds = new Set(favorites.map((t) => t.id));
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

// Fetch all tracks for feed
async function loadTracks() {
    try {
        const tracksGrid = document.getElementById('tracksGrid');

        await loadLikedTrackIds();

        if (tracksGrid) {
            await loadMyTracks();
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

function displayFeedTracks(tracks) {
    const musicGrid = document.querySelector('.music-grid');
    if (!musicGrid) return;

    musicGrid.innerHTML = '';

    tracks.forEach(track => {
        const trackCard = createFeedTrackCard(track);
        musicGrid.appendChild(trackCard);
    });
}

function displayCollectionTracks(tracks) {
    const tracksGrid = document.getElementById('tracksGrid');
    if (!tracksGrid) return;

    tracksGrid.innerHTML = '';

    if (!Array.isArray(tracks)) {
        tracksGrid.innerHTML = '<div class="empty-state">Failed to load tracks.</div>';
        return;
    }

    if (!tracks || tracks.length === 0) {
        tracksGrid.innerHTML = '<div class="empty-state">No uploaded tracks yet.</div>';
        return;
    }

    tracks.forEach(track => {
        const card = createCollectionTrackCard(track);
        tracksGrid.appendChild(card);
    });
}

function createFeedTrackCard(track) {
    const card = document.createElement('div');
    card.className = 'music-card';

    const coverUrl = resolveAssetUrl(track.cover_image_url, '../images/juke.png');
    const artistName = track.artist_name || 'Unknown Artist';
    const isLiked = likedTrackIds.has(track.id);

    card.innerHTML = `
        <div class="album-cover">
            <img src="${coverUrl}" alt="${track.title}">
            <button class="play-btn" onclick="playTrack('${track.id}')">
                <i class="fas fa-play"></i>
            </button>
        </div>
        <div class="track-info">
            <div class="track-title">${track.title}</div>
            <div class="artist-name">${artistName}</div>
        </div>
        <div class="track-actions">
            <button class="like-btn ${isLiked ? 'liked' : ''}" onclick="likeTrack('${track.id}')">
                <i class="${isLiked ? 'fas' : 'far'} fa-heart"></i>
            </button>
            <span class="duration">${track.genre || ''}</span>
        </div>
    `;

    return card;
}

function createCollectionTrackCard(track) {
    const card = document.createElement('div');
    card.className = 'track-card';

    const coverUrl = resolveAssetUrl(track.cover_image_url, '../images/juke.png');
    const artistName = track.artist_name || 'Unknown Artist';
    const isLiked = likedTrackIds.has(track.id);
    const currentUserId = getCurrentUserId();
    const canDelete = !!currentUserId && !!track.uploader_id && String(track.uploader_id) === String(currentUserId);

    card.innerHTML = `
        <div class="track-cover">
            <img src="${coverUrl}" alt="${track.title}">
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
                    <button class="action-btn ${isLiked ? 'liked' : ''}" onclick="likeTrack('${track.id}')">
                        <i class="${isLiked ? 'fas' : 'far'} fa-heart"></i>
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
        await loadMyTracks();
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
function likeTrack(trackId) {
    const token = getAuthToken();
    if (!token) {
        if (isSpaMode()) {
            window.location.hash = '#/login';
        } else {
            window.location.href = 'login.html';
        }
        return;
    }

    fetch(`${getApiBase()}/tracks/${trackId}/like`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`
        }
    })
        .then((r) => r.json())
        .then((data) => {
            if (data && data.liked === true) likedTrackIds.add(trackId);
            if (data && data.liked === false) likedTrackIds.delete(trackId);
            return loadTracks();
        })
        .catch((e) => console.error('Liking track failed:', e));
}

// Add to playlist function
function addToPlaylist(trackId) {
    console.log('Adding to playlist:', trackId);
    // Add your playlist logic here
    alert(`Added to playlist: ${trackId}`);
}

// Load tracks when page loads
document.addEventListener('DOMContentLoaded', function() {
    if (isSpaMode()) return;
    if (document.querySelector('.music-grid') || document.getElementById('tracksGrid')) {
        loadTracks();
    }
});

window.JukeApi = {
    loadTracks,
    loadMyTracks
};

window.deleteTrack = deleteTrack;
