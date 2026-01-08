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

    tracks.forEach(track => {
        const card = createFeedTrackCard(track);
        tracksGrid.appendChild(card);
    });
}

function createFeedTrackCard(track) {
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
    const isLiked = likedTrackIds.has(track.id);
    const canDelete = !!isAdmin || (!!currentUserId && !!uploaderId && String(uploaderId) === String(currentUserId));

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
            ${uploaderName && uploaderId && String(uploaderId) !== String(currentUserId || '') ? `<div class="artist-name"><a href="#/koleqtion/${uploaderId}" class="uploader-link">@${uploaderName}</a></div>` : ''}
        </div>
        <div class="track-actions">
            <div class="left-actions">
                <button class="like-btn ${isLiked ? 'liked' : ''}" data-track-id="${track.id}" onclick="likeTrack('${track.id}')">
                    <i class="${isLiked ? 'fas' : 'far'} fa-heart"></i>
                </button>
                <button class="like-btn" onclick="addToPlaylist('${track.id}')" aria-label="Add to playlist">
                    <i class="fas fa-plus"></i>
                </button>
                ${canDelete ? `
                <button class="like-btn" onclick="deleteTrack('${track.id}', event);" aria-label="Delete track">
                    <i class="fas fa-trash"></i>
                </button>
                ` : ''}
            </div>
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

    try {
        const data = await apiFetchJson(`/tracks/${encodeURIComponent(trackId)}/like`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`
            }
        }, function (d) {
            return !!d && typeof d === 'object' && !Array.isArray(d) && typeof d.liked === 'boolean';
        });

        if (data && data.liked === true) likedTrackIds.add(trackId);
        if (data && data.liked === false) likedTrackIds.delete(trackId);

        try {
            document.querySelectorAll(`.like-btn[data-track-id="${CSS.escape(String(trackId))}"]`).forEach((btn) => {
                btn.classList.toggle('liked', !!data.liked);
                const icon = btn.querySelector('i');
                if (icon) {
                    icon.className = (data.liked ? 'fas' : 'far') + ' fa-heart';
                }
            });
        } catch (_) {
        }
    } catch (e) {
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

window.JukeApi = {
    loadTracks,
    loadMyTracks,
    loadUserTracks
};

window.deleteTrack = deleteTrack;
