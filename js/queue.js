// Queue functionality
document.addEventListener('DOMContentLoaded', function() {
    // Initialize queue when the page loads
    loadQueue();
});

function loadQueue() {
    // Load history (previous songs)
    loadPreviousSongs();
    
    // Load current track
    loadCurrentTrack();
    
    // Load next songs (upcoming)
    loadNextSongs();
}

function loadPreviousSongs() {
    const previousContainer = document.getElementById('previousSongs');
    if (!previousContainer) return;
    
    // Get history from localStorage
    const history = JSON.parse(localStorage.getItem('juke_listening_history') || '[]');
    
    if (history.length === 0) {
        previousContainer.innerHTML = '<div class="empty-queue">No previously played songs</div>';
        return;
    }
    
    // Show last 10 songs (most recent first)
    const recentHistory = history.slice(-10).reverse();
    
    previousContainer.innerHTML = '';
    recentHistory.forEach((track, index) => {
        const trackElement = createQueueItem(track, 'previous');
        previousContainer.appendChild(trackElement);
    });
}

function loadCurrentTrack() {
    const currentContainer = document.getElementById('currentTrack');
    if (!currentContainer) return;
    
    // Get current player state
    const playerState = window.JukePlayer?.state || {};
    
    if (!playerState.trackId) {
        currentContainer.innerHTML = '<div class="empty-queue">No track currently playing</div>';
        return;
    }
    
    // Create current track element
    const currentTrackElement = createCurrentTrackElement(playerState);
    currentContainer.innerHTML = '';
    currentContainer.appendChild(currentTrackElement);
}

function loadNextSongs() {
    const nextContainer = document.getElementById('nextSongs');
    if (!nextContainer) return;
    
    // For now, show empty state (queue functionality can be expanded later)
    nextContainer.innerHTML = '<div class="empty-queue">No upcoming songs</div>';
}

function createQueueItem(track, type) {
    const div = document.createElement('div');
    div.className = 'queue-item';
    
    const coverUrl = track.cover_image_url ? 
        (track.cover_image_url.startsWith('http') ? track.cover_image_url : `../uploads/${track.cover_image_url}`) :
        '../images/juke.png';
    
    const duration = track.duration ? formatDuration(track.duration) : '';
    
    div.innerHTML = `
        <img src="${coverUrl}" alt="${track.title || 'Track'}" class="queue-item-cover">
        <div class="queue-item-info">
            <div class="queue-item-title">${track.title || 'Unknown Track'}</div>
            <div class="queue-item-artist">${track.artist_name || 'Unknown Artist'}</div>
        </div>
        <div class="queue-item-duration">${duration}</div>
    `;
    
    // Add click handler to play track
    div.addEventListener('click', function() {
        if (window.JukePlayer && window.JukePlayer.playTrackById) {
            window.JukePlayer.playTrackById(track.id);
        }
    });
    
    return div;
}

function createCurrentTrackElement(playerState) {
    const div = document.createElement('div');
    div.className = 'current-track';
    
    const coverUrl = playerState.coverUrl || '../images/juke.png';
    
    div.innerHTML = `
        <img src="${coverUrl}" alt="${playerState.title || 'Track'}" class="current-track-cover">
        <div class="current-track-info">
            <div class="current-track-title">${playerState.title || 'Unknown Track'}</div>
            <div class="current-track-artist">${playerState.artist || 'Unknown Artist'}</div>
            <div class="current-track-playing">Now Playing</div>
        </div>
    `;
    
    return div;
}

function formatDuration(seconds) {
    if (!seconds) return '';
    
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

// Export for global access
window.JukeQueue = {
    loadQueue,
    loadPreviousSongs,
    loadCurrentTrack,
    loadNextSongs
};
