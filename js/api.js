// JUKE API Integration
const API_BASE = 'https://juke-api.onrender.com/api';
const API_ORIGIN = API_BASE.replace(/\/api$/, '');

let likedTrackIds = new Set();

function getAuthToken() {
    return localStorage.getItem('juke_token');
}

function resolveAssetUrl(url, fallback) {
    if (!url) return fallback;
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    if (url.startsWith('/')) return `${API_ORIGIN}${url}`;
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
        const profile = await fetchJson(`${API_BASE}/users/profile`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });
        const favorites = (profile && profile.favorites) ? profile.favorites : [];
        likedTrackIds = new Set(favorites.map((t) => t.id));
    } catch (e) {
        likedTrackIds = new Set();
    }
}

// Fetch all tracks for feed
async function loadTracks() {
    try {
        const tracksGrid = document.getElementById('tracksGrid');

        await loadLikedTrackIds();

        if (tracksGrid) {
            const token = getAuthToken();
            if (!token) {
                window.location.href = 'login.html';
                return;
            }

            const tracks = await fetchJson(`${API_BASE}/tracks/my`, {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });
            displayCollectionTracks(tracks);
            return;
        }

        const tracks = await fetchJson(`${API_BASE}/tracks`);
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
                </div>
            </div>
        </div>
    `;

    return card;
}

// Play track function
function playTrack(trackId) {
    console.log('Playing track:', trackId);
    // Add your audio player logic here
    alert(`Playing track: ${trackId}`);
}

// Like track function
function likeTrack(trackId) {
    const token = getAuthToken();
    if (!token) {
        window.location.href = 'login.html';
        return;
    }

    fetch(`${API_BASE}/tracks/${trackId}/like`, {
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
    if (document.querySelector('.music-grid') || document.getElementById('tracksGrid')) {
        loadTracks();
    }
});
