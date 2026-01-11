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

function safeJsonString(v) {
    try {
        return JSON.stringify(v);
    } catch (_) {
        return 'null';
    }
}

function ensureLikedPlaylistsHost(likedEl) {
    if (!likedEl) return null;
    var host = likedEl.querySelector('.liked-playlists-host');
    if (host) return host;
    host = document.createElement('div');
    host.className = 'liked-playlists-host';
    likedEl.insertAdjacentElement('beforebegin', host);
    return host;
}

async function loadLikedPlaylistsInto(likedPlaylistsEl) {
    const token = getAuthToken();
    if (!token) return;
    if (!likedPlaylistsEl) return;

    try {
        const liked = await apiFetchJson('/playlists/liked', {
            headers: {
                Authorization: `Bearer ${token}`
            }
        }, function (d) {
            return Array.isArray(d);
        });

        likedPlaylistsEl.innerHTML = '';
        if (!liked || liked.length === 0) {
            setEmpty(likedPlaylistsEl, 'No liked playlists yet.');
            return;
        }

        liked.forEach(function (p) {
            likedPlaylistsEl.appendChild(renderPlaylistCard(p));
        });
    } catch (e) {
        console.error(e);
        setEmpty(likedPlaylistsEl, 'Failed to load liked playlists.');
    }
}

function getListsUi() {
    return {
        shell: document.getElementById('listsShell'),
        navItems: Array.from(document.querySelectorAll('.lists-nav-item')),
        panels: Array.from(document.querySelectorAll('.lists-panel[data-panel]')),
        playlistPanel: document.getElementById('listsPanelPlaylist'),
        playlistTitle: document.getElementById('playlistTitle'),
        playlistStatus: document.getElementById('playlistStatus'),
        playlistTracks: document.getElementById('playlistTracks'),
        playlistBack: document.getElementById('playlistBack')
    };
}

function showPanel(panelName) {
    const ui = getListsUi();
    if (!ui || !ui.panels || ui.panels.length === 0) return;

    ui.panels.forEach(function (p) {
        if (!p) return;
        const name = p.getAttribute('data-panel');
        if (name === panelName) {
            p.classList.add('active');
        } else {
            p.classList.remove('active');
        }
    });

    ui.navItems.forEach(function (btn) {
        if (!btn) return;
        const v = btn.getAttribute('data-view');
        if (v === panelName) {
            btn.classList.add('active');
            btn.tabIndex = 0;
        } else {
            btn.classList.remove('active');
            btn.tabIndex = -1;
        }
    });
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

    const ui = getListsUi();
    if (!ui || !ui.playlistPanel) return;

    if (ui.playlistTitle) ui.playlistTitle.textContent = (playlist && playlist.name) ? playlist.name : 'Playlist';
    if (ui.playlistStatus) ui.playlistStatus.textContent = 'Loading...';
    if (ui.playlistTracks) ui.playlistTracks.innerHTML = '';

    try {
        const header = ui.playlistPanel.querySelector('.lists-panel-header');
        if (header) {
            let actions = header.querySelector('.playlist-actions');
            if (!actions) {
                actions = document.createElement('div');
                actions.className = 'playlist-actions';
                header.appendChild(actions);
            }
            actions.innerHTML = `
                <button class="playlist-action-btn" type="button" data-action="like">Like</button>
                <button class="playlist-action-btn" type="button" data-action="comment">Comment</button>
                <button class="playlist-action-btn danger" type="button" data-action="delete">Delete</button>
            `;

            const likeBtn = actions.querySelector('[data-action="like"]');
            const commentBtn = actions.querySelector('[data-action="comment"]');
            const delBtn = actions.querySelector('[data-action="delete"]');

            if (likeBtn && !likeBtn.dataset.bound) {
                likeBtn.dataset.bound = '1';
                likeBtn.addEventListener('click', async function () {
                    try {
                        if (!playlist || !playlist.id) return;
                        const data = await apiFetchJson(`/playlists/${encodeURIComponent(playlist.id)}/like`, {
                            method: 'POST',
                            headers: {
                                Authorization: `Bearer ${token}`
                            }
                        }, function (d) {
                            return !!d && typeof d === 'object' && typeof d.liked === 'boolean';
                        });
                        likeBtn.textContent = (data && data.liked) ? 'Liked' : 'Like';
                    } catch (e) {
                        console.error(e);
                        if (ui.playlistStatus) ui.playlistStatus.textContent = 'Like failed.';
                    }
                });
            }

            if (commentBtn && !commentBtn.dataset.bound) {
                commentBtn.dataset.bound = '1';
                commentBtn.addEventListener('click', async function () {
                    try {
                        if (!playlist || !playlist.id) return;
                        const text = window.prompt('Comment on this playlist:');
                        if (!text) return;
                        await apiFetchJson(`/playlists/${encodeURIComponent(playlist.id)}/comments`, {
                            method: 'POST',
                            headers: {
                                Authorization: `Bearer ${token}`,
                                'Content-Type': 'application/json'
                            },
                            body: safeJsonString({ body: text })
                        }, function (d) {
                            return !!d && typeof d === 'object';
                        });
                        if (ui.playlistStatus) ui.playlistStatus.textContent = 'Comment posted.';
                    } catch (e) {
                        console.error(e);
                        if (ui.playlistStatus) ui.playlistStatus.textContent = 'Comment failed.';
                    }
                });
            }

            if (delBtn && !delBtn.dataset.bound) {
                delBtn.dataset.bound = '1';
                delBtn.addEventListener('click', async function () {
                    try {
                        if (!playlist || !playlist.id) return;
                        const ok = window.confirm('Delete this playlist?');
                        if (!ok) return;
                        await apiFetchJson(`/playlists/${encodeURIComponent(playlist.id)}`, {
                            method: 'DELETE',
                            headers: {
                                Authorization: `Bearer ${token}`
                            }
                        }, function (d) {
                            return !!d && typeof d === 'object' && (d.success === true || d.success === undefined);
                        });
                        if (ui.playlistStatus) ui.playlistStatus.textContent = 'Deleted.';
                        showPanel('lists');
                        loadLists();
                    } catch (e) {
                        console.error(e);
                        if (ui.playlistStatus) ui.playlistStatus.textContent = 'Delete failed.';
                    }
                });
            }
        }
    } catch (_) {
    }

    try {
        ui.playlistPanel.style.display = '';
    } catch (_) {
    }
    showPanel('playlist');

    try {
        const tracks = await apiFetchJson(`/playlists/${encodeURIComponent(playlist.id)}/tracks`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        }, function (d) {
            return Array.isArray(d);
        });

        // Set contextual queue for prev/next within this playlist
        try {
            if (window.JukePlayer && typeof window.JukePlayer.setTrackList === 'function' && Array.isArray(tracks)) {
                window.JukePlayer.setTrackList(tracks.map(function (t) {
                    return String(t.id);
                }));
            }
        } catch (_) {
        }

        try {
            if (window.JukePlayer && typeof window.JukePlayer.setQueueTracks === 'function' && Array.isArray(tracks)) {
                window.JukePlayer.setQueueTracks(tracks);
            }
        } catch (_) {
        }

        if (ui.playlistStatus) ui.playlistStatus.textContent = '';
        if (!ui.playlistTracks) return;

        if (!tracks || tracks.length === 0) {
            ui.playlistTracks.innerHTML = '<div class="empty-state">No tracks in this playlist yet.</div>';
            return;
        }

        ui.playlistTracks.innerHTML = '';
        
        const controlsDiv = document.createElement('div');
        controlsDiv.className = 'playlist-controls';
        controlsDiv.innerHTML = `
            <button class="playlist-play-btn" type="button" aria-label="Play all"><i class="fas fa-play"></i></button>
            <button class="playlist-control-btn" type="button" data-action="shuffle" aria-label="Shuffle"><i class="fas fa-random"></i></button>
            <button class="playlist-control-btn" type="button" data-action="repeat" aria-label="Repeat"><i class="fas fa-redo"></i></button>
            <button class="playlist-control-btn" type="button" data-action="queue" aria-label="Add to queue"><i class="fas fa-list"></i></button>
        `;
        ui.playlistTracks.appendChild(controlsDiv);
        
        const playAllBtn = controlsDiv.querySelector('.playlist-play-btn');
        if (playAllBtn && tracks.length > 0) {
            playAllBtn.addEventListener('click', function() {
                if (typeof window.playTrack === 'function') {
                    window.playTrack(tracks[0].id);
                }
            });
        }
        
        const shuffleBtn = controlsDiv.querySelector('[data-action="shuffle"]');
        if (shuffleBtn) {
            shuffleBtn.addEventListener('click', function() {
                this.classList.toggle('active');
            });
        }
        
        const repeatBtn = controlsDiv.querySelector('[data-action="repeat"]');
        if (repeatBtn) {
            repeatBtn.addEventListener('click', function() {
                this.classList.toggle('active');
            });
        }
        
        tracks.forEach(function (t, idx) {
            const row = document.createElement('div');
            row.className = 'lists-track-row';
            const safeTitle = (t && t.title) ? String(t.title) : 'Untitled';
            const safeArtist = (t && t.artist_name) ? String(t.artist_name) : '';
            const pos = idx + 1;
            const coverUrl = (t.cover_image_url) ? t.cover_image_url : 'images/juke.png';
            let dateTxt = '';
            try {
                if (window.JukeUi && typeof window.JukeUi.formatTrackDateShort === 'function') {
                    dateTxt = window.JukeUi.formatTrackDateShort(t) || '';
                }
            } catch (_) {
                dateTxt = '';
            }

            row.innerHTML = `
                <div class="lists-track-num">${pos}</div>
                <div class="lists-track-play-hover"><i class="fas fa-play"></i></div>
                <img class="lists-track-cover" src="${coverUrl}" alt="">
                <div class="lists-track-meta">
                    <div class="lists-track-title">${safeTitle}</div>
                    <div class="lists-track-artist">${safeArtist}</div>
                    ${dateTxt ? `<div class="lists-track-date">${dateTxt}</div>` : ''}
                </div>
                <div class="lists-track-actions">
                    <button class="lists-track-action" type="button" aria-label="Like"><i class="far fa-heart"></i></button>
                    <button class="lists-track-action lists-track-share" type="button" aria-label="Share"><i class="far fa-paper-plane"></i></button>
                    <button class="lists-track-action" type="button" aria-label="More"><i class="fas fa-ellipsis-h"></i></button>
                </div>
                <div class="lists-track-duration">3:45</div>
            `;

            row.addEventListener('click', function (e) {
                if (e.target.closest('.lists-track-action')) return;
                try {
                    if (typeof window.playTrack === 'function') {
                        window.playTrack(t.id);
                    }
                } catch (_) {}
            });
            
            const likeBtn = row.querySelector('.lists-track-action');
            if (likeBtn) {
                likeBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    this.classList.toggle('liked');
                    const icon = this.querySelector('i');
                    if (icon) {
                        icon.className = this.classList.contains('liked') ? 'fas fa-heart' : 'far fa-heart';
                    }
                });
            }

            const shareBtn = row.querySelector('.lists-track-share');
            if (shareBtn) {
                shareBtn.addEventListener('click', function (e) {
                    e.stopPropagation();
                    try {
                        if (typeof window.shareTrackById === 'function') {
                            window.shareTrackById(String(t.id), { title: safeTitle, text: safeArtist });
                        }
                    } catch (_) {
                    }
                });
            }

            ui.playlistTracks.appendChild(row);
        });
    } catch (e) {
        console.error(e);
        if (ui.playlistStatus) ui.playlistStatus.textContent = 'Failed to load tracks.';
        if (ui.playlistTracks) ui.playlistTracks.innerHTML = '';
    }
}

function bindListsNavigatorUi() {
    const ui = getListsUi();
    if (!ui || !ui.navItems || ui.navItems.length === 0) return;

    ui.navItems.forEach(function (btn) {
        if (!btn || btn.dataset.bound) return;
        btn.dataset.bound = '1';

        btn.addEventListener('click', function () {
            const v = btn.getAttribute('data-view');
            if (!v) return;
            showPanel(v);
        });

        btn.addEventListener('keydown', function (e) {
            if (!e) return;
            const key = e.key;
            if (key === 'Enter' || key === ' ') {
                e.preventDefault();
                const v = btn.getAttribute('data-view');
                if (!v) return;
                showPanel(v);
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
            } catch (_) {
            }
        });
    });

    if (ui.playlistBack && !ui.playlistBack.dataset.bound) {
        ui.playlistBack.dataset.bound = '1';
        ui.playlistBack.addEventListener('click', function () {
            showPanel('lists');
        });
    }
}

function getCurrentUsername() {
    try {
        const token = getAuthToken();
        if (token) {
            const payload = JSON.parse(atob(token.split('.')[1]));
            return payload.username || payload.sub || null;
        }
    } catch (_) {
    }
    return null;
}

function editPlaylist(playlistId, currentName) {
    const newName = prompt('Edit playlist name:', currentName.replace(/^_/, ''));
    if (newName && newName.trim()) {
        const finalName = '_' + newName.trim();
        
        // Check if name actually changed
        if (finalName === currentName) {
            return; // No change needed
        }
        
        const token = getAuthToken();
        if (!token) {
            alert('Please login to edit playlists');
            return;
        }

        // Show loading state
        const navBtn = document.querySelector(`[data-view="playlist-${playlistId}"]`);
        if (navBtn) {
            navBtn.textContent = 'Updating...';
            navBtn.disabled = true;
        }

        // Make API call to update playlist
        apiFetchJson(`/playlists/${playlistId}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({
                name: finalName
            })
        }).then(response => {
            console.log('Playlist updated successfully:', response);
            
            // Update navigation button text
            if (navBtn) {
                navBtn.textContent = finalName;
                navBtn.disabled = false;
            }
            
            // Update panel title
            const panel = document.getElementById(`listsPanelPlaylist${playlistId}`);
            if (panel) {
                const titleEl = panel.querySelector('.lists-panel-title');
                if (titleEl) {
                    titleEl.textContent = finalName;
                }
            }
            
            // Show success message
            alert(`Playlist renamed to "${finalName}" successfully.`);
            
        }).catch(error => {
            console.error('Error updating playlist:', error);
            
            // Restore button state
            if (navBtn) {
                navBtn.textContent = currentName;
                navBtn.disabled = false;
            }
            
            alert(`Failed to rename playlist. Please try again.`);
        });
    }
}

function deletePlaylist(playlistId, playlistName) {
    if (confirm(`Are you sure you want to delete "${playlistName}"? This action cannot be undone.`)) {
        const token = getAuthToken();
        if (!token) {
            alert('Please login to delete playlists');
            return;
        }

        // Show loading state
        const navBtn = document.querySelector(`[data-view="playlist-${playlistId}"]`);
        if (navBtn) {
            navBtn.textContent = 'Deleting...';
            navBtn.disabled = true;
        }

        // Make API call to delete playlist
        apiFetchJson(`/playlists/${playlistId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            }
        }).then(response => {
            console.log('Playlist deleted successfully:', response);
            
            // Remove navigation button
            if (navBtn) {
                navBtn.remove();
            }
            
            // Remove panel
            const panel = document.getElementById(`listsPanelPlaylist${playlistId}`);
            if (panel) {
                panel.remove();
            }
            
            // Show success message
            alert(`"${playlistName}" has been deleted successfully.`);
            
            // Reload the lists to update navigation
            setTimeout(() => {
                if (typeof loadLists === 'function') {
                    loadLists();
                }
            }, 500);
            
        }).catch(error => {
            console.error('Error deleting playlist:', error);
            
            // Restore button state
            if (navBtn) {
                navBtn.textContent = playlistName;
                navBtn.disabled = false;
            }
            
            alert(`Failed to delete "${playlistName}". Please try again.`);
        });
    }
}

function loadPlaylistContent(playlist) {
    const token = getAuthToken();
    if (!token) return;
    
    const playlistGridEl = document.getElementById(`playlist-${playlist.id}`);
    if (!playlistGridEl) return;
    
    playlistGridEl.innerHTML = 'Loading...';
    
    // Load tracks for this playlist
    apiFetchJson(`/playlists/${playlist.id}/tracks`, {
        headers: {
            Authorization: `Bearer ${token}`
        }
    }, function (d) {
        return Array.isArray(d);
    }).then(tracks => {
        playlistGridEl.innerHTML = '';
        if (!tracks || tracks.length === 0) {
            setEmpty(playlistGridEl, 'No tracks in this playlist yet.');
        } else {
            tracks.forEach((track) => {
                playlistGridEl.appendChild(renderTrackCard(track));
            });
        }
    }).catch(error => {
        console.error('Error loading playlist tracks:', error);
        setEmpty(playlistGridEl, 'Failed to load tracks.');
    });
}

function renderPlaylistCard(p) {
    const coverFallback = isSpaMode() ? 'images/juke.png' : '../images/juke.png';
    const coverUrl = resolveAssetUrl(p.cover_image_url, coverFallback);
    const owner = p.owner_username ? `by ${p.owner_username}` : '';
    const isOwner = !p.owner_username || p.owner_username === getCurrentUsername(); // Check if current user owns this playlist

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
            ${isOwner ? `
            <div class="card-actions">
                <button class="card-action-btn edit-btn" onclick="event.stopPropagation(); editPlaylist('${p.id}', '${p.name.replace(/'/g, "\\'")}')" title="Edit playlist">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="card-action-btn delete-btn" onclick="event.stopPropagation(); deletePlaylist('${p.id}', '${p.name.replace(/'/g, "\\'")}')" title="Delete playlist">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
            ` : ''}
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
        openPlaylist(p);
    });
    div.addEventListener('keydown', function (e) {
        if (!e) return;
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openPlaylist(p);
        }
    });
    return div;
}

function renderTrackCard(t) {
    const coverFallback = isSpaMode() ? 'images/juke.png' : '../images/juke.png';
    const coverUrl = resolveAssetUrl(t.cover_image_url, coverFallback);
    let dateTxt = '';
    try {
        if (window.JukeUi && typeof window.JukeUi.formatTrackDateShort === 'function') {
            dateTxt = window.JukeUi.formatTrackDateShort(t) || '';
        }
    } catch (_) {
        dateTxt = '';
    }

    const div = document.createElement('div');
    div.className = 'card';
    div.tabIndex = 0;
    div.setAttribute('role', 'button');
    div.innerHTML = `
        <div class="card-cover">
            <img src="${coverUrl}" alt="${t.title}">
        </div>
        <div class="card-body">
            <div class="card-title">${t.title}</div>
            <div class="card-subtitle">${t.artist_name || ''}</div>
            <div class="card-meta">
                <span>${t.duration_seconds ? `${Math.floor(t.duration_seconds / 60)}:${String(t.duration_seconds % 60).padStart(2, '0')}` : ''}${dateTxt ? ` · ${dateTxt}` : ''}</span>
                <span>
                    <button class="card-action-btn card-comment-btn" type="button" aria-label="Comments"><i class="far fa-comment"></i></button>
                    <button class="card-action-btn card-share-btn" type="button" aria-label="Share"><i class="far fa-paper-plane"></i></button>
                </span>
            </div>
        </div>
    `;

    div.addEventListener('click', function (e) {
        try {
            if (e && e.target && e.target.closest && e.target.closest('button')) return;
        } catch (_) {
        }
        try {
            if (typeof window.playTrack === 'function') {
                window.playTrack(t.id);
            }
        } catch (_) {
        }
    });

    div.addEventListener('keydown', function (e) {
        if (!e) return;
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            try {
                if (typeof window.playTrack === 'function') {
                    window.playTrack(t.id);
                }
            } catch (_) {
            }
        }
    });

    try {
        const commentBtn = div.querySelector('.card-comment-btn');
        if (commentBtn && !commentBtn.dataset.bound) {
            commentBtn.dataset.bound = '1';
            commentBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                try {
                    if (typeof window.openTrackCommentsModal === 'function') {
                        window.openTrackCommentsModal(String(t.id), { title: t.title || 'Comments' });
                    }
                } catch (_) {
                }
            });
        }

        const shareBtn = div.querySelector('.card-share-btn');
        if (shareBtn && !shareBtn.dataset.bound) {
            shareBtn.dataset.bound = '1';
            shareBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                try {
                    if (typeof window.shareTrackById === 'function') {
                        window.shareTrackById(String(t.id), { title: t.title, text: t.artist_name });
                    }
                } catch (_) {
                }
            });
        }
    } catch (_) {
    }
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

    const curatedEl = document.getElementById('curatedPlaylists');
    const likedEl = document.getElementById('likedTracks');
    const randomEl = document.getElementById('randomPlaylists');

    console.log('Elements found:', {
        curated: !!curatedEl,
        liked: !!likedEl,
        random: !!randomEl
    });

    bindListsNavigatorUi();
    showPanel('liked'); // Show liked tracks by default

    // Check which panel is currently active
    const activePanel = document.querySelector('.lists-panel.active');
    console.log('Currently active panel:', activePanel ? activePanel.id : 'none');

    if (curatedEl) setEmpty(curatedEl, 'Loading...');
    if (likedEl) setEmpty(likedEl, 'Loading...');
    if (randomEl) setEmpty(randomEl, 'Loading...');

    try {
        const profile = await apiFetchJson('/users/profile', {
            headers: {
                Authorization: `Bearer ${token}`
            }
        }, function (d) {
            return !!d && typeof d === 'object' && !Array.isArray(d);
        });

        if (likedEl) {
            likedEl.innerHTML = '';
            const favorites = profile.favorites || [];
            if (favorites.length === 0) {
                setEmpty(likedEl, 'No liked tracks yet.');
            } else {
                favorites.forEach((t) => likedEl.appendChild(renderTrackCard(t)));
            }
        }

        // Load user playlists as separate navigation items
        const navItemsEl = document.querySelector('.lists-nav-items');
        console.log('Navigation items container found:', !!navItemsEl);
        
        if (navItemsEl) {
            // Keep the existing _liked tracks button
            const likedTracksBtn = navItemsEl.querySelector('[data-view="liked"]');
            console.log('Liked tracks button found:', !!likedTracksBtn);
            
            // Clear existing navigation items except _liked tracks
            navItemsEl.innerHTML = '';
            if (likedTracksBtn) {
                navItemsEl.appendChild(likedTracksBtn);
                console.log('Re-added liked tracks button');
            }
            
            // Add each playlist as a separate navigation item
            const myPlaylists = profile.playlists || [];
            console.log('User playlists from profile:', myPlaylists.length, myPlaylists);
            
            myPlaylists.forEach((playlist, index) => {
                console.log(`Creating navigation item ${index + 1}:`, playlist.name);
                
                // Create navigation item that mimics lists-nav-title structure
                const navItemContainer = document.createElement('div');
                navItemContainer.className = 'lists-nav-item-container';
                navItemContainer.style.display = 'flex';
                navItemContainer.style.alignItems = 'center';
                navItemContainer.style.justifyContent = 'space-between';
                navItemContainer.style.gap = '0.5rem';
                navItemContainer.style.marginBottom = '2px';
                
                const navBtn = document.createElement('button');
                navBtn.className = 'lists-nav-item';
                navBtn.type = 'button';
                navBtn.role = 'tab';
                navBtn.setAttribute('data-view', `playlist-${playlist.id}`);
                navBtn.textContent = playlist.name;
                navBtn.style.flex = '1';
                navBtn.style.textAlign = 'left';
                
                navBtn.addEventListener('click', () => {
                    console.log('Clicked playlist:', playlist.name);
                    showPanel(`playlist-${playlist.id}`);
                    // Load playlist content when clicked
                    loadPlaylistContent(playlist);
                });
                
                // Add delete button for owned playlists (positioned like add button)
                const isOwner = !playlist.owner_username || playlist.owner_username === getCurrentUsername();
                if (isOwner) {
                    const deleteBtn = document.createElement('button');
                    deleteBtn.className = 'lists-delete-btn';
                    deleteBtn.innerHTML = '-';
                    deleteBtn.title = 'Delete playlist';
                    deleteBtn.onclick = (e) => {
                        e.stopPropagation();
                        console.log('Delete button clicked for:', playlist.name);
                        deletePlaylist(playlist.id, playlist.name);
                    };
                    
                    navItemContainer.appendChild(navBtn);
                    navItemContainer.appendChild(deleteBtn);
                } else {
                    navItemContainer.appendChild(navBtn);
                }
                
                navItemsEl.appendChild(navItemContainer);
                console.log(`Added navigation item for: ${playlist.name}`);
                
                // Create corresponding panel
                const panel = document.createElement('div');
                panel.className = 'lists-panel';
                panel.id = `listsPanelPlaylist${playlist.id}`;
                panel.setAttribute('data-panel', `playlist-${playlist.id}`);
                panel.setAttribute('role', 'tabpanel');
                panel.innerHTML = `
                    <div class="lists-panel-header">
                        <div class="lists-panel-title">${playlist.name}</div>
                        <div class="lists-panel-hint">${playlist.description || 'Your playlist'}</div>
                    </div>
                    <div id="playlist-${playlist.id}" class="cards-grid"></div>
                `;
                document.querySelector('.lists-content').appendChild(panel);
                console.log(`Created panel for: ${playlist.name}`);
            });
            
            console.log('Navigation setup complete. Total items:', navItemsEl.children.length);
        }
    } catch (e) {
        console.error(e);
        setEmpty(likedEl, 'Failed to load liked tracks.');
    }

    try {
        const curated = await apiFetchJson('/playlists/curated', {}, function (d) {
            return Array.isArray(d);
        });
        if (curatedEl) {
            curatedEl.innerHTML = '';
            if (!curated || curated.length === 0) {
                setEmpty(curatedEl, 'No curated playlists available yet.');
            } else {
                curated.forEach((p) => curatedEl.appendChild(renderPlaylistCard(p)));
            }
        }
    } catch (e) {
        console.error(e);
        if (curatedEl) setEmpty(curatedEl, 'Failed to load curated playlists.');
    }

    try {
        const random = await apiFetchJson('/playlists/public', {}, function (d) {
            return Array.isArray(d);
        });
        if (randomEl) {
            randomEl.innerHTML = '';
            if (!random || random.length === 0) {
                setEmpty(randomEl, 'No public playlists available yet.');
            } else {
                const shuffled = random.slice().sort(function () {
                    return Math.random() - 0.5;
                });
                shuffled.forEach((p) => randomEl.appendChild(renderPlaylistCard(p)));
            }
        }
    } catch (e) {
        console.error(e);
        if (randomEl) setEmpty(randomEl, 'Failed to load public playlists.');
    }
}

async function createPlaylist(name) {
    try {
        console.log('createPlaylist called with:', name);
        
        // Add "_" prefix to the name
        const playlistName = '_' + name;
        
        const token = getAuthToken();
        if (!token) {
            console.log('No auth token found');
            alert('Please login to create a playlist');
            return;
        }

        console.log('Making API call to create playlist with name:', playlistName);
        
        const response = await apiFetchJson('/playlists', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({
                name: playlistName,
                description: ''
            })
        });

        console.log('API response:', response);

        if (response && response.id) {
            console.log('Playlist created successfully:', response);
            alert('Playlist created successfully!');
            
            // Add the new playlist as a navigation item with delete button positioned like add button
            const navItemsEl = document.querySelector('.lists-nav-items');
            if (navItemsEl) {
                // Create navigation item that mimics lists-nav-title structure
                const navItemContainer = document.createElement('div');
                navItemContainer.className = 'lists-nav-item-container';
                navItemContainer.style.display = 'flex';
                navItemContainer.style.alignItems = 'center';
                navItemContainer.style.justifyContent = 'space-between';
                navItemContainer.style.gap = '0.5rem';
                navItemContainer.style.marginBottom = '2px';
                
                const navBtn = document.createElement('button');
                navBtn.className = 'lists-nav-item';
                navBtn.type = 'button';
                navBtn.role = 'tab';
                navBtn.setAttribute('data-view', `playlist-${response.id}`);
                navBtn.textContent = response.name;
                navBtn.style.flex = '1';
                navBtn.style.textAlign = 'left';
                navBtn.style.border = '2px solid #1ed760';
                navBtn.style.boxShadow = '0 0 20px rgba(30, 215, 96, 0.5)';
                
                navBtn.addEventListener('click', () => {
                    console.log('Clicked playlist:', response.name);
                    showPanel(`playlist-${response.id}`);
                    loadPlaylistContent(response);
                });
                
                // Add delete button positioned like add button
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'lists-delete-btn';
                deleteBtn.innerHTML = '-';
                deleteBtn.title = 'Delete playlist';
                deleteBtn.onclick = (e) => {
                    e.stopPropagation();
                    console.log('Delete button clicked for new playlist:', response.name);
                    deletePlaylist(response.id, response.name);
                };
                
                navItemContainer.appendChild(navBtn);
                navItemContainer.appendChild(deleteBtn);
                navItemsEl.appendChild(navItemContainer);
                
                // Create corresponding panel
                const panel = document.createElement('div');
                panel.className = 'lists-panel';
                panel.id = `listsPanelPlaylist${response.id}`;
                panel.setAttribute('data-panel', `playlist-${response.id}`);
                panel.setAttribute('role', 'tabpanel');
                panel.innerHTML = `
                    <div class="lists-panel-header">
                        <div class="lists-panel-title">${response.name}</div>
                        <div class="lists-panel-hint">${response.description || 'Your playlist'}</div>
                    </div>
                    <div id="playlist-${response.id}" class="cards-grid"></div>
                `;
                document.querySelector('.lists-content').appendChild(panel);
                
                // Switch to the new playlist panel
                setTimeout(() => {
                    console.log('Switching to new playlist panel');
                    showPanel(`playlist-${response.id}`);
                    loadPlaylistContent(response);
                    
                    // Remove highlight after 3 seconds
                    setTimeout(() => {
                        navBtn.style.border = '';
                        navBtn.style.boxShadow = '';
                    }, 3000);
                }, 100);
            }
        } else {
            console.error('Failed to create playlist - invalid response:', response);
            alert('Failed to create playlist. Please try again.');
        }
    } catch (error) {
        console.error('Error creating playlist:', error);
        alert('Error creating playlist: ' + (error.message || 'Unknown error'));
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (isSpaMode()) return;
    if (typeof isLoggedIn === 'function' && !isLoggedIn()) {
        window.location.href = 'login.html';
        return;
    }

    loadLists();
    
    // Add event listener for add playlist button with multiple attempts
    const bindAddButton = () => {
        const addPlaylistBtn = document.getElementById('addPlaylistBtn');
        if (addPlaylistBtn) {
            console.log('Add playlist button found, binding click event');
            
            // Remove any existing listeners to prevent duplicates
            addPlaylistBtn.removeEventListener('click', handleAddButton);
            
            // Add the event listener
            addPlaylistBtn.addEventListener('click', handleAddButton);
            
            console.log('Add playlist button click event bound successfully');
            return true;
        }
        return false;
    };
    
    // Handler function
    const handleAddButton = (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('Add playlist button clicked');
        const name = prompt('Enter playlist name (will be prefixed with "_"):');
        if (!name || !name.trim()) return;
        
        console.log('Creating playlist:', name.trim());
        if (typeof createPlaylist === 'function') {
            createPlaylist(name.trim());
        } else {
            console.error('createPlaylist function not found');
            alert('Error: createPlaylist function not available');
        }
    };
    
    // Try to bind immediately and retry multiple times if needed
    let attempts = 0;
    const maxAttempts = 10;
    
    const tryBind = () => {
        attempts++;
        console.log(`Attempt ${attempts} to bind add button`);
        
        if (bindAddButton()) {
            console.log('Add button bound successfully');
            return;
        }
        
        if (attempts < maxAttempts) {
            setTimeout(tryBind, 200 * attempts); // Exponential backoff
        } else {
            console.error('Failed to bind add button after multiple attempts');
        }
    };
    
    tryBind();
});

window.JukeLists = {
    loadLists,
    createPlaylist
};

window.createPlaylist = createPlaylist;

// Global click handler as fallback
document.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'addPlaylistBtn') {
        console.log('Global click handler triggered for add button');
        e.preventDefault();
        e.stopPropagation();
        
        const name = prompt('Enter playlist name (will be prefixed with "_"):');
        if (!name || !name.trim()) return;
        
        console.log('Creating playlist via global handler:', name.trim());
        if (typeof createPlaylist === 'function') {
            createPlaylist(name.trim());
        } else {
            console.error('createPlaylist function not found in global handler');
            alert('Error: createPlaylist function not available');
        }
    }
});
