// JUKE API Integration
const API_BASE = 'https://juke-api.onrender.com/api';

// Fetch all tracks for feed
async function loadTracks() {
    try {
        const response = await fetch(`${API_BASE}/tracks`);
        const tracks = await response.json();
        displayTracks(tracks);
    } catch (error) {
        console.error('Error loading tracks:', error);
    }
}

// Display tracks in feed/grid
function displayTracks(tracks) {
    const musicGrid = document.querySelector('.music-grid') || document.querySelector('.library-grid');
    if (!musicGrid) return;

    musicGrid.innerHTML = '';

    tracks.forEach(track => {
        const trackCard = createTrackCard(track);
        musicGrid.appendChild(trackCard);
    });
}

// Create track card element
function createTrackCard(track) {
    const card = document.createElement('div');
    card.className = 'music-card';
    
    card.innerHTML = `
        <div class="track-artwork">
            <img src="${track.cover_image_url || '../images/default-album.jpg'}" alt="${track.title}">
        </div>
        <div class="track-info">
            <h3 class="track-title">${track.title}</h3>
            <p class="track-artist">${track.artist_name || 'Unknown Artist'}</p>
            <p class="track-meta">
                <span class="track-genre">${track.genre || 'Unknown'}</span>
                <span class="track-plays">${track.play_count || 0} plays</span>
            </p>
        </div>
        <div class="track-actions">
            <button class="play-btn" onclick="playTrack('${track.id}')">
                <i class="fas fa-play"></i>
            </button>
            <button class="like-btn" onclick="likeTrack('${track.id}')">
                <i class="fas fa-heart"></i>
            </button>
            <button class="add-to-playlist-btn" onclick="addToPlaylist('${track.id}')">
                <i class="fas fa-plus"></i>
            </button>
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
    console.log('Liking track:', trackId);
    // Add your like logic here
    alert(`Liked track: ${trackId}`);
}

// Add to playlist function
function addToPlaylist(trackId) {
    console.log('Adding to playlist:', trackId);
    // Add your playlist logic here
    alert(`Added to playlist: ${trackId}`);
}

// Load tracks when page loads
document.addEventListener('DOMContentLoaded', function() {
    // Check if we're on feed or collection page
    if (document.querySelector('.music-grid') || document.querySelector('.library-grid')) {
        loadTracks();
    }
});
