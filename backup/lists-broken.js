// JUKE Lists Management - Clean Architecture

// ==================== UTILITIES ====================
const Utils = {
    isSpaMode: () => !!(document.body?.dataset?.spa),
    
    resolveAssetUrl: (url, fallback) => {
        if (!url) return fallback;
        if (url.startsWith('http://') || url.startsWith('https://')) return url;
        if (url.startsWith('/')) return `${window.JukeAPIBase.getApiOrigin()}${url}`;
        return url;
    },

    getAuthToken: () => localStorage.getItem('juke_token'),

    isTokenExpired: () => {
        try {
            const token = Utils.getAuthToken();
            if (!token) return true;
            
            const payload = JSON.parse(atob(token.split('.')[1]));
            const currentTime = Date.now() / 1000;
            
            return payload.exp < (currentTime + 300);
        } catch {
            return true;
        }
    },

    validateTokenAndRedirect: () => {
        if (Utils.isTokenExpired()) {
            localStorage.removeItem('juke_token');
            localStorage.removeItem('juke_user');
            
            if (Utils.isSpaMode()) {
                window.location.hash = '#/login';
            } else {
                window.location.href = '../index.html#/login';
            }
            return false;
        }
        return true;
    },

    safeJsonString: (v) => {
        try {
            return JSON.stringify(v);
        } catch {
            return '{}';
        }
    },

    escapeHtml: (text) => String(text || '').replace(/[&<>"']/g, 
        m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]))
};

// ==================== API SERVICE ====================
class ListsApiService {
    static async apiFetchJson(path, options = {}, validateOkData) {
        const bases = window.JukeAPIBase.getApiBases();
        let lastErr = null;

        for (const base of bases) {
            try {
                const res = await fetch(base + path, options || {});
                let data = null;

                try {
                    data = await res.json();
                } catch {
                    const text = await res.text().catch(() => '');
                    data = text ? { error: text } : null;
                }

                if (res.ok) {
                    if (typeof validateOkData === 'function' && !validateOkData(data)) {
                        lastErr = new Error(`Invalid response from ${base + path}`);
                        continue;
                    }
                    try {
                        localStorage.setItem('juke_api_base', base);
                    } catch {}
                    return data;
                }

                if (res.status === 401 || res.status === 403) {
                    localStorage.removeItem('juke_token');
                    localStorage.removeItem('juke_user');
                    
                    if (Utils.isSpaMode()) {
                        window.location.hash = '#/login';
                    } else {
                        window.location.href = '../index.html#/login';
                    }
                    
                    lastErr = new Error(`${data?.error || 'Session expired - Please login again'} (${base + path})`);
                    continue;
                }

                if (res.status === 404 || res.status === 405) {
                    lastErr = new Error(`${data?.error || `Request failed: ${res.status}`} (${base + path})`);
                    continue;
                }

                throw new Error(`${data?.error || `Request failed: ${res.status}`} (${base + path})`);
            } catch (e) {
                lastErr = e;
            }
        }

        throw lastErr || new Error('Network error');
    }

    static async loadLikedPlaylists() {
        const token = Utils.getAuthToken();
        if (!token) return [];

        try {
            return await ListsApiService.apiFetchJson('/playlists/liked', {
                headers: { Authorization: `Bearer ${token}` }
            }, d => Array.isArray(d));
        } catch {
            return [];
        }
    }

    static async loadPlaylistTracks(playlistId) {
        const token = Utils.getAuthToken();
        if (!token) return [];

        try {
            return await ListsApiService.apiFetchJson(`/playlists/${encodeURIComponent(playlistId)}/tracks`, {
                headers: { Authorization: `Bearer ${token}` }
            }, d => Array.isArray(d));
        } catch {
            return [];
        }
    }

    static async likePlaylist(playlistId) {
        const token = Utils.getAuthToken();
        if (!token) return null;

        try {
            return await ListsApiService.apiFetchJson(`/playlists/${encodeURIComponent(playlistId)}/like`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
            }, d => d && typeof d === 'object' && typeof d.liked === 'boolean');
        } catch {
            return null;
        }
    }

    static async commentOnPlaylist(playlistId, text) {
        const token = Utils.getAuthToken();
        if (!token) return null;

        try {
            return await ListsApiService.apiFetchJson(`/playlists/${encodeURIComponent(playlistId)}/comments`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: Utils.safeJsonString({ body: text })
            }, d => d && typeof d === 'object');
        } catch {
            return null;
        }
    }

    static async deletePlaylist(playlistId) {
        const token = Utils.getAuthToken();
        if (!token) return false;

        try {
            await ListsApiService.apiFetchJson(`/playlists/${encodeURIComponent(playlistId)}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            }, d => d && typeof d === 'object' && (d.success === true || d.success === undefined));
            return true;
        } catch {
            return false;
        }
    }
}

// ==================== UI MANAGER ====================
class ListsUIManager {
    static getElements() {
        return {
            shell: document.getElementById('listsShell'),
            navItems: Array.from(document.querySelectorAll('.lists-nav-item')),
            panels: Array.from(document.querySelectorAll('.lists-panel')),
            playlistBack: document.querySelector('.playlist-back'),
            playlistTitle: document.querySelector('.playlist-title'),
            playlistStatus: document.querySelector('.playlist-status'),
            playlistTracks: document.querySelector('.playlist-tracks'),
            likedPlaylists: document.querySelector('.liked-playlists-host')
        };
    }

    static setEmpty(element, text) {
        if (!element) return;
        element.innerHTML = `<div class="empty-state">${text}</div>`;
    }

    static ensureLikedPlaylistsHost(likedEl) {
        if (!likedEl) return null;
        let host = likedEl.querySelector('.liked-playlists-host');
        if (host) return host;

        host = document.createElement('div');
        host.className = 'liked-playlists-host';
        likedEl.appendChild(host);
        return host;
    }

    static showPanel(panelName) {
        const ui = ListsUIManager.getElements();
        if (!ui?.panels?.length) return;

        ui.panels.forEach(p => {
            if (!p) return;
            const name = p.getAttribute('data-panel');
            p.style.display = name === panelName ? '' : 'none';
        });

        ui.navItems.forEach(btn => {
            if (!btn) return;
            const v = btn.getAttribute('data-view');
            btn.classList.toggle('active', v === panelName);
        });
    }

    static renderPlaylistCard(playlist) {
        const card = document.createElement('div');
        card.className = 'playlist-card';
        
        const safeName = Utils.escapeHtml(playlist.name || 'Untitled');
        const coverUrl = Utils.resolveAssetUrl(playlist.cover_image_url, 'images/juke.png');
        
        card.innerHTML = `
            <div class="playlist-card-cover">
                <img src="${coverUrl}" alt="${safeName}">
                <div class="playlist-card-overlay">
                    <button class="playlist-play-btn" data-playlist-id="${playlist.id}">
                        <i class="fas fa-play"></i>
                    </button>
                </div>
            </div>
            <div class="playlist-card-info">
                <h3 class="playlist-card-title">${safeName}</h3>
                <p class="playlist-card-meta">${playlist.track_count || 0} tracks</p>
            </div>
        `;

        card.addEventListener('click', (e) => {
            if (!e.target.closest('.playlist-play-btn')) {
                window.openPlaylist(playlist);
            }
        });

        const playBtn = card.querySelector('.playlist-play-btn');
        if (playBtn) {
            playBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                window.openPlaylist(playlist);
            });
        }

        return card;
    }

    static renderTrackRow(track, index) {
        const row = document.createElement('div');
        row.className = 'lists-track-row';
        
        const safeTitle = Utils.escapeHtml(track.title || 'Untitled');
        const safeArtist = Utils.escapeHtml(track.artist_name || '');
        const coverUrl = Utils.resolveAssetUrl(track.cover_image_url, 'images/juke.png');
        const dateTxt = this.getTrackDateText(track);

        row.innerHTML = `
            <div class="lists-track-num">${index + 1}</div>
            <div class="lists-track-play-hover"><i class="fas fa-play"></i></div>
            <img class="lists-track-cover" src="${coverUrl}" alt="">
            <div class="lists-track-meta">
                <div class="lists-track-title">${safeTitle}</div>
                <div class="lists-track-artist">${safeArtist}</div>
                ${dateTxt ? `<div class="lists-track-date">${dateTxt}</div>` : ''}
            </div>
            <div class="lists-track-actions">
                <button class="lists-track-action like-btn" data-track-id="${track.id}" type="button" aria-label="Like">
                    <i class="far fa-heart"></i>
                </button>
                <button class="lists-track-action comment-btn" data-track-id="${track.id}" type="button" aria-label="Comment">
                    <i class="far fa-comment"></i>
                </button>
                <button class="lists-track-action share-btn" data-track-id="${track.id}" type="button" aria-label="Share">
                    <i class="far fa-paper-plane"></i>
                </button>
                <button class="lists-track-action edit-btn" data-track-id="${track.id}" type="button" aria-label="Edit">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="lists-track-action delete-btn" data-track-id="${track.id}" type="button" aria-label="Delete">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
            <div class="lists-track-duration">3:45</div>
        `;

        this.bindTrackEvents(row, track);
        return row;
    }

    static getTrackDateText(track) {
        try {
            if (window.JukeUi?.formatTrackDateShort) {
                return window.JukeUi.formatTrackDateShort(track) || '';
            }
        } catch {}
        return '';
    }

    static bindTrackEvents(row, track) {
        // Track click to play
        row.addEventListener('click', (e) => {
            if (!e.target.closest('.lists-track-action')) {
                try {
                    if (typeof window.playTrack === 'function') {
                        window.playTrack(track.id);
                    }
                } catch {}
            }
        });

        // Like button
        const likeBtn = row.querySelector('.like-btn');
        if (likeBtn) {
            likeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const trackId = likeBtn.getAttribute('data-track-id');
                likeBtn.classList.toggle('liked');
                const icon = likeBtn.querySelector('i');
                if (icon) {
                    icon.className = likeBtn.classList.contains('liked') ? 'fas fa-heart' : 'far fa-heart';
                }
                if (typeof window.likeTrack === 'function') {
                    window.likeTrack(trackId);
                }
            });
        }

        // Comment button
        const commentBtn = row.querySelector('.comment-btn');
        if (commentBtn) {
            commentBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                alert('Comment functionality coming soon!');
            });
        }

        // Share button
        const shareBtn = row.querySelector('.share-btn');
        if (shareBtn) {
            shareBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                try {
                    if (typeof window.shareTrackById === 'function') {
                        window.shareTrackById(String(track.id), { 
                            title: track.title || 'Untitled', 
                            text: track.artist_name || '' 
                        });
                    }
                } catch {}
            });
        }

        // Edit button
        const editBtn = row.querySelector('.edit-btn');
        if (editBtn) {
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                alert('Edit functionality coming soon!');
            });
        }

        // Delete button
        const deleteBtn = row.querySelector('.delete-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const trackId = deleteBtn.getAttribute('data-track-id');
                if (typeof window.deleteTrack === 'function') {
                    window.deleteTrack(trackId, e);
                } else {
                    alert('Delete functionality coming soon!');
                }
            });
        }
    }

    static bindPlaylistControls(playlist, token) {
        const ui = ListsUIManager.getElements();

        // Like button
        const likeBtn = ui.playlistTracks?.querySelector('.like-btn');
        if (likeBtn && !likeBtn.dataset.bound) {
            likeBtn.dataset.bound = '1';
            likeBtn.addEventListener('click', async () => {
                try {
                    const data = await ListsApiService.likePlaylist(playlist.id);
                    likeBtn.textContent = data?.liked ? 'Liked' : 'Like';
                } catch {
                    console.error('Failed to like playlist');
                }
            });
        }

        // Comment button
        const commentBtn = ui.playlistTracks?.querySelector('.comment-btn');
        if (commentBtn && !commentBtn.dataset.bound) {
            commentBtn.dataset.bound = '1';
            commentBtn.addEventListener('click', async () => {
                try {
                    const text = window.prompt('Comment on this playlist:');
                    if (text?.trim()) {
                        await ListsApiService.commentOnPlaylist(playlist.id, text.trim());
                        if (ui.playlistStatus) ui.playlistStatus.textContent = 'Comment posted.';
                    }
                } catch {
                    if (ui.playlistStatus) ui.playlistStatus.textContent = 'Failed to post comment.';
                }
            });
        }

        // Share button
        const shareBtn = ui.playlistTracks?.querySelector('.share-btn');
        if (shareBtn && !shareBtn.dataset.bound) {
            shareBtn.dataset.bound = '1';
            shareBtn.addEventListener('click', () => {
                try {
                    const url = `${window.location.origin}${window.location.pathname.split('/').slice(0, -1).join('/')}/playlist.html?id=${encodeURIComponent(playlist.id)}`;
                    if (navigator.share) {
                        navigator.share({ title: playlist.name, url });
                    } else {
                        navigator.clipboard.writeText(url);
                        alert('Playlist URL copied to clipboard!');
                    }
                } catch {
                    console.error('Failed to share playlist');
                }
            });
        }

        // Edit button
        const editBtn = ui.playlistTracks?.querySelector('.edit-btn');
        if (editBtn && !editBtn.dataset.bound) {
            editBtn.dataset.bound = '1';
            editBtn.addEventListener('click', () => {
                try {
                    if (typeof window.editPlaylist === 'function') {
                        window.editPlaylist(playlist.id, playlist.name);
                    }
                } catch {
                    console.error('Failed to edit playlist');
                }
            });
        }

        // Delete button
        const deleteBtn = ui.playlistTracks?.querySelector('.delete-btn');
        if (deleteBtn && !deleteBtn.dataset.bound) {
            deleteBtn.dataset.bound = '1';
            deleteBtn.addEventListener('click', async () => {
                try {
                    const ok = window.confirm('Delete this playlist?');
                    if (ok) {
                        const success = await ListsApiService.deletePlaylist(playlist.id);
                        if (success) {
                            if (ui.playlistStatus) ui.playlistStatus.textContent = 'Deleted.';
                            ListsUIManager.showPanel('lists');
                        } else {
                            if (ui.playlistStatus) ui.playlistStatus.textContent = 'Failed to delete.';
                        }
                    }
                } catch {
                    if (ui.playlistStatus) ui.playlistStatus.textContent = 'Failed to delete.';
                }
            });
        }
    }

    static bindPlaylistControlsEvents(tracks) {
        const controlsDiv = document.querySelector('.playlist-controls');
        if (!controlsDiv) return;

        // Play all button
        const playAllBtn = controlsDiv.querySelector('.playlist-play-btn');
        if (playAllBtn && tracks.length > 0) {
            playAllBtn.addEventListener('click', () => {
                if (typeof window.playTrack === 'function') {
                    window.playTrack(tracks[0].id);
                }
            });
        }

        // Shuffle button
        const shuffleBtn = controlsDiv.querySelector('[data-action="shuffle"]');
        if (shuffleBtn) {
            shuffleBtn.addEventListener('click', function() {
                this.classList.toggle('active');
            });
        }

        // Repeat button
        const repeatBtn = controlsDiv.querySelector('[data-action="repeat"]');
        if (repeatBtn) {
            repeatBtn.addEventListener('click', function() {
                this.classList.toggle('active');
            });
        }
    }

    static bindNavigatorEvents() {
        const ui = ListsUIManager.getElements();
        if (!ui?.navItems?.length) return;

        ui.navItems.forEach(btn => {
            if (!btn || btn.dataset.bound) return;
            btn.dataset.bound = '1';

            btn.addEventListener('click', () => {
                const v = btn.getAttribute('data-view');
                if (v) ListsUIManager.showPanel(v);
            });

            btn.addEventListener('keydown', (e) => {
                const key = e.key;
                if (key === 'Enter' || key === ' ') {
                    e.preventDefault();
                    const v = btn.getAttribute('data-view');
                    if (v) ListsUIManager.showPanel(v);
                    return;
                }

                if (key !== 'ArrowDown' && key !== 'ArrowUp') return;
                e.preventDefault();
                const idx = ui.navItems.indexOf(btn);
                if (idx < 0) return;
                const next = key === 'ArrowDown' ? idx + 1 : idx - 1;
                const wrap = (next + ui.navItems.length) % ui.navItems.length;
                try {
                    ui.navItems[wrap].focus();
                } catch {}
            });
        });

        if (ui.playlistBack && !ui.playlistBack.dataset.bound) {
            ui.playlistBack.dataset.bound = '1';
            ui.playlistBack.addEventListener('click', () => {
                ListsUIManager.showPanel('lists');
            });
        }
    }
}

// ==================== PLAYLIST MANAGER ====================
class PlaylistManager {
    static async loadLikedPlaylists() {
        const likedPlaylistsEl = document.querySelector('.liked-playlists');
        if (!likedPlaylistsEl) return;

        const host = ListsUIManager.ensureLikedPlaylistsHost(likedPlaylistsEl);
        if (!host) return;

        try {
            const liked = await ListsApiService.loadLikedPlaylists();
            if (!liked || liked.length === 0) {
                ListsUIManager.setEmpty(host, 'No liked playlists yet.');
                return;
            }

            host.innerHTML = '';
            liked.forEach(playlist => {
                host.appendChild(ListsUIManager.renderPlaylistCard(playlist));
            });
        } catch (e) {
            console.error('Failed to load liked playlists:', e);
            ListsUIManager.setEmpty(host, 'Failed to load playlists.');
        }
    }

    static async openPlaylist(playlist) {
        const token = Utils.getAuthToken();
        if (!token) {
            if (Utils.isSpaMode()) {
                window.location.hash = '#/login';
            } else {
                window.location.href = '../index.html#/login';
            }
            return;
        }

        const ui = ListsUIManager.getElements();
        if (!ui) return;

        try {
            // Update UI
            if (ui.playlistTitle) ui.playlistTitle.textContent = playlist.name || 'Untitled';
            if (ui.playlistStatus) ui.playlistStatus.textContent = '';
            if (ui.playlistTracks) ui.playlistTracks.innerHTML = '';

            // Load tracks
            const tracks = await ListsApiService.loadPlaylistTracks(playlist.id);
            if (!tracks || tracks.length === 0) {
                ListsUIManager.setEmpty(ui.playlistTracks, 'No tracks in this playlist.');
                return;
            }

            // Set player queue
            try {
                if (window.JukePlayer?.setTrackList && Array.isArray(tracks)) {
                    window.JukePlayer.setTrackList(tracks.map(t => String(t.id)));
                }
            } catch {}

            try {
                if (window.JukePlayer?.setQueueTracks && Array.isArray(tracks)) {
                    window.JukePlayer.setQueueTracks(tracks);
                }
            } catch {}

            // Add controls
            const controlsDiv = document.createElement('div');
            controlsDiv.className = 'playlist-controls';
            controlsDiv.innerHTML = `
                <button class="playlist-control-btn playlist-play-btn" type="button" aria-label="Play all">
                    <i class="fas fa-play"></i> Play All
                </button>
                <button class="playlist-control-btn" type="button" data-action="shuffle" aria-label="Shuffle">
                    <i class="fas fa-random"></i>
                </button>
                <button class="playlist-control-btn" type="button" data-action="repeat" aria-label="Repeat">
                    <i class="fas fa-redo"></i>
                </button>
                <button class="playlist-control-btn like-btn" type="button" aria-label="Like">Like</button>
                <button class="playlist-control-btn comment-btn" type="button" aria-label="Comment">Comment</button>
                <button class="playlist-control-btn share-btn" type="button" aria-label="Share">Share</button>
                <button class="playlist-control-btn edit-btn" type="button" aria-label="Edit">Edit</button>
                <button class="playlist-control-btn delete-btn" type="button" aria-label="Delete">Delete</button>
            `;
            ui.playlistTracks.appendChild(controlsDiv);

            // Bind control events
            ListsUIManager.bindPlaylistControlsEvents(tracks);
            ListsUIManager.bindPlaylistControls(playlist, token);

            // Render tracks
            tracks.forEach((track, idx) => {
                ui.playlistTracks.appendChild(ListsUIManager.renderTrackRow(track, idx));
            });

            // Show playlist panel
            ListsUIManager.showPanel('playlist');

        } catch (e) {
            console.error('Failed to open playlist:', e);
            if (ui.playlistStatus) ui.playlistStatus.textContent = 'Failed to load tracks.';
            if (ui.playlistTracks) ui.playlistTracks.innerHTML = '';
        }
    }

    static getCurrentUsername() {
        try {
            const token = Utils.getAuthToken();
            if (token) {
                const payload = JSON.parse(atob(token.split('.')[1]));
                return payload.username || payload.sub || null;
            }
        } catch {
            return null;
        }
    }

    static async loadMyPlaylists() {
        const token = Utils.getAuthToken();
        if (!token) return;

        const username = PlaylistManager.getCurrentUsername();
        if (!username) return;

        const myPlaylistsEl = document.querySelector('.my-playlists');
        if (!myPlaylistsEl) return;

        try {
            const playlists = await ListsApiService.apiFetchJson(`/users/${encodeURIComponent(username)}/playlists`, {
                headers: { Authorization: `Bearer ${token}` }
            }, d => Array.isArray(d));

            if (!playlists || playlists.length === 0) {
                ListsUIManager.setEmpty(myPlaylistsEl, 'No playlists yet. Create your first playlist!');
                return;
            }

            myPlaylistsEl.innerHTML = '';
            playlists.forEach(playlist => {
                myPlaylistsEl.appendChild(ListsUIManager.renderPlaylistCard(playlist));
            });

        } catch (e) {
            console.error('Failed to load my playlists:', e);
            ListsUIManager.setEmpty(myPlaylistsEl, 'Failed to load playlists.');
        }
    }

    static bindCreatePlaylist() {
        const createBtn = document.querySelector('.create-playlist-btn');
        const createInput = document.querySelector('.create-playlist-input');

        if (!createBtn || !createInput) return;

        createBtn.addEventListener('click', () => {
            const name = createInput.value?.trim();
            if (!name) return;

            if (typeof window.createPlaylist === 'function') {
                window.createPlaylist(name);
                createInput.value = '';
            }
        });

        createInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                createBtn.click();
            }
        });
    }
}

// ==================== INITIALIZATION ====================
// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    PlaylistManager.loadLikedPlaylists();
    PlaylistManager.loadMyPlaylists();
    ListsUIManager.bindNavigatorEvents();
    PlaylistManager.bindCreatePlaylist();
});

// Re-initialize on SPA navigation
document.addEventListener('spa:navigate', () => {
    PlaylistManager.loadLikedPlaylists();
    PlaylistManager.loadMyPlaylists();
    ListsUIManager.bindNavigatorEvents();
    PlaylistManager.bindCreatePlaylist();
});

// Global functions for backward compatibility
window.openPlaylist = (playlist) => PlaylistManager.openPlaylist(playlist);
window.showPanel = (panelName) => ListsUIManager.showPanel(panelName);
window.loadLikedPlaylistsInto = (el) => PlaylistManager.loadLikedPlaylists();
window.bindListsNavigatorUi = () => ListsUIManager.bindNavigatorEvents();

// Export classes for advanced usage
window.JukeLists = {
    PlaylistManager,
    ListsUIManager,
    ListsApiService,
    Utils
};
