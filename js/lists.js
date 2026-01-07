const API_BASE = 'https://juke-api.onrender.com/api';
const API_ORIGIN = API_BASE.replace(/\/api$/, '');

function resolveAssetUrl(url, fallback) {
    if (!url) return fallback;
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    if (url.startsWith('/')) return `${API_ORIGIN}${url}`;
    return url;
}

function getAuthToken() {
    return localStorage.getItem('juke_token');
}

async function fetchJson(url, options = {}) {
    const response = await fetch(url, options);
    if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Request failed: ${response.status}`);
    }
    return response.json();
}

function setEmpty(el, text) {
    if (!el) return;
    el.innerHTML = `<div class="empty-state">${text}</div>`;
}

function renderPlaylistCard(p) {
    const coverUrl = resolveAssetUrl(p.cover_image_url, '../images/juke.png');
    const owner = p.owner_username ? `by ${p.owner_username}` : '';

    const div = document.createElement('div');
    div.className = 'card';
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
    return div;
}

function renderTrackCard(t) {
    const coverUrl = resolveAssetUrl(t.cover_image_url, '../images/juke.png');

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
        window.location.href = 'login.html';
        return;
    }

    const myPlaylistsEl = document.getElementById('myPlaylists');
    const curatedEl = document.getElementById('curatedPlaylists');
    const likedEl = document.getElementById('likedTracks');

    setEmpty(myPlaylistsEl, 'Loading...');
    setEmpty(curatedEl, 'Loading...');
    setEmpty(likedEl, 'Loading...');

    try {
        const profile = await fetchJson(`${API_BASE}/users/profile`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
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
        const curated = await fetchJson(`${API_BASE}/playlists/curated`);
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
    if (typeof isLoggedIn === 'function' && !isLoggedIn()) {
        window.location.href = 'login.html';
        return;
    }

    loadLists();
});
