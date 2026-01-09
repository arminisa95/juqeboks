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

function isSpaMode() {
    return !!(document.body && document.body.dataset && document.body.dataset.spa);
}

function resolveAssetUrl(url, fallback) {
    if (!url) return fallback;
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    if (url.startsWith('/')) return `${getApiOrigin()}${url}`;
    return url;
}

function getAuthToken() {
    return localStorage.getItem('juke_token');
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

function setEmpty(el, text) {
    if (!el) return;
    el.innerHTML = `<div class="empty-state">${text}</div>`;
}

function ensurePlaylistExplorer() {
    const existing = document.getElementById('playlistExplorer');
    if (existing) return existing;
    return null;
}

function showPlaylistExplorer() {
    const el = ensurePlaylistExplorer();
    if (!el) return;
    el.style.display = '';
}

function hidePlaylistExplorer() {
    const el = ensurePlaylistExplorer();
    if (!el) return;
    el.style.display = 'none';
}

async function openPlaylist(playlist) {
    const token = getAuthToken();
    if (!token) {
        if (isSpaMode()) {
            window.location.hash = '#/login';
        } else {
            window.location.href = 'login.html';
        }
        return;
    }

    const explorer = ensurePlaylistExplorer();
    if (!explorer) {
        return;
    }

    const titleEl = explorer.querySelector('#playlistExplorerTitle');
    const tracksEl = explorer.querySelector('#playlistExplorerTracks');
    const statusEl = explorer.querySelector('#playlistExplorerStatus');
    if (titleEl) titleEl.textContent = (playlist && playlist.name) ? playlist.name : 'Playlist';
    if (statusEl) statusEl.textContent = 'Loading...';
    if (tracksEl) tracksEl.innerHTML = '';
    showPlaylistExplorer();

    try {
        const tracks = await apiFetchJson(`/playlists/${encodeURIComponent(playlist.id)}/tracks`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        }, function (d) {
            return Array.isArray(d);
        });

        if (statusEl) statusEl.textContent = '';
        if (!tracksEl) return;

        if (!tracks || tracks.length === 0) {
            tracksEl.innerHTML = '<div class="empty-state">No tracks in this playlist yet.</div>';
            return;
        }

        tracks.forEach(function (t) {
            const row = document.createElement('div');
            row.className = 'folder-track-row';
            const safeTitle = (t && t.title) ? String(t.title) : 'Untitled';
            const safeArtist = (t && t.artist_name) ? String(t.artist_name) : '';
            row.innerHTML = `
                <button class="folder-play-btn" type="button" data-track-id="${t.id}">Play</button>
                <div class="folder-track-meta">
                    <div class="folder-track-title">${safeTitle}</div>
                    <div class="folder-track-artist">${safeArtist}</div>
                </div>
            `;
            row.querySelector('.folder-play-btn').addEventListener('click', function () {
                try {
                    if (typeof window.playTrack === 'function') {
                        window.playTrack(t.id);
                    }
                } catch (_) {
                }
            });
            tracksEl.appendChild(row);
        });
    } catch (e) {
        console.error(e);
        if (statusEl) statusEl.textContent = 'Failed to load tracks.';
        if (tracksEl) tracksEl.innerHTML = '';
    }
}

function bindPlaylistExplorerUi() {
    const explorer = ensurePlaylistExplorer();
    if (!explorer) return;

    const closeBtn = explorer.querySelector('#playlistExplorerClose');
    if (closeBtn && !closeBtn.dataset.bound) {
        closeBtn.dataset.bound = '1';
        closeBtn.addEventListener('click', function () {
            hidePlaylistExplorer();
        });
    }
}

function renderPlaylistCard(p) {
    const coverFallback = isSpaMode() ? 'images/juke.png' : '../images/juke.png';
    const coverUrl = resolveAssetUrl(p.cover_image_url, coverFallback);
    const owner = p.owner_username ? `by ${p.owner_username}` : '';

    const div = document.createElement('div');
    div.className = 'card playlist-card';
    div.tabIndex = 0;
    div.setAttribute('role', 'button');
    try {
        div.dataset.playlistId = p.id;
    } catch (_) {
    }
    div.innerHTML = `
        <div class="card-cover">
            <img src="${coverUrl}" alt="${p.name}">
        </div>
        <div class="card-body">
            <div class="card-title">${p.name}</div>
            <div class="card-subtitle">${p.description || owner || ''}</div>
            <div class="card-meta">
                <span>${p.track_count || 0} tracks</span>
                <span>${p.is_public ? 'public' : 'private'}</span>
            </div>
        </div>
    `;

    div.addEventListener('click', function () {
        bindPlaylistExplorerUi();
        openPlaylist(p);
    });
    div.addEventListener('keydown', function (e) {
        if (!e) return;
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            bindPlaylistExplorerUi();
            openPlaylist(p);
        }
    });
    return div;
}

function renderTrackCard(t) {
    const coverFallback = isSpaMode() ? 'images/juke.png' : '../images/juke.png';
    const coverUrl = resolveAssetUrl(t.cover_image_url, coverFallback);

    const div = document.createElement('div');
    div.className = 'card';
    div.innerHTML = `
        <div class="card-cover">
            <img src="${coverUrl}" alt="${t.title}">
        </div>
        <div class="card-body">
            <div class="card-title">${t.title}</div>
            <div class="card-subtitle">${t.artist_name || ''}</div>
            <div class="card-meta">
                <span>${t.duration_seconds ? `${Math.floor(t.duration_seconds / 60)}:${String(t.duration_seconds % 60).padStart(2, '0')}` : ''}</span>
                <span></span>
            </div>
        </div>
    `;
    return div;
}

async function loadLists() {
    const token = getAuthToken();
    if (!token) {
        if (isSpaMode()) {
            window.location.hash = '#/login';
        } else {
            window.location.href = 'login.html';
        }
        return;
    }

    const myPlaylistsEl = document.getElementById('myPlaylists');
    const curatedEl = document.getElementById('curatedPlaylists');
    const likedEl = document.getElementById('likedTracks');

    bindPlaylistExplorerUi();

    setEmpty(myPlaylistsEl, 'Loading...');
    setEmpty(curatedEl, 'Loading...');
    setEmpty(likedEl, 'Loading...');

    try {
        const profile = await apiFetchJson('/users/profile', {
            headers: {
                Authorization: `Bearer ${token}`
            }
        }, function (d) {
            return !!d && typeof d === 'object' && !Array.isArray(d);
        });

        myPlaylistsEl.innerHTML = '';
        likedEl.innerHTML = '';

        const myPlaylists = profile.playlists || [];
        if (myPlaylists.length === 0) {
            setEmpty(myPlaylistsEl, 'No playlists yet.');
        } else {
            myPlaylists.forEach((p) => myPlaylistsEl.appendChild(renderPlaylistCard(p)));
        }

        const favorites = profile.favorites || [];
        if (favorites.length === 0) {
            setEmpty(likedEl, 'No liked tracks yet.');
        } else {
            favorites.forEach((t) => likedEl.appendChild(renderTrackCard(t)));
        }
    } catch (e) {
        console.error(e);
        setEmpty(myPlaylistsEl, 'Failed to load your playlists.');
        setEmpty(likedEl, 'Failed to load liked tracks.');
    }

    try {
        const curated = await apiFetchJson('/playlists/curated', {}, function (d) {
            return Array.isArray(d);
        });
        curatedEl.innerHTML = '';

        if (!curated || curated.length === 0) {
            setEmpty(curatedEl, 'No curated playlists available yet.');
        } else {
            curated.forEach((p) => curatedEl.appendChild(renderPlaylistCard(p)));
        }
    } catch (e) {
        console.error(e);
        setEmpty(curatedEl, 'Failed to load curated playlists.');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (isSpaMode()) return;
    if (typeof isLoggedIn === 'function' && !isLoggedIn()) {
        window.location.href = 'login.html';
        return;
    }

    loadLists();
});

window.JukeLists = {
    loadLists
};
