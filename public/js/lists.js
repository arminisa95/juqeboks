function isTokenExpired() {
    try {
        const token = getAuthToken();
        if (!token) return true;
        
        const payload = JSON.parse(atob(token.split('.')[1]));
        const currentTime = Date.now() / 1000;
        
        return payload.exp < (currentTime + 300);
    } catch (error) {
        return true;
    }
}

function validateTokenAndRedirect() {
    if (isTokenExpired()) {
        localStorage.removeItem('juke_token');
        localStorage.removeItem('juke_user');
        
        if (isSpaMode()) {
            window.location.hash = '#/login';
        } else {
            window.location.href = '../index.html#/login';
        }
        return false;
    }
    return true;
}

async function apiFetchJson(path, options, validateOkData) {
    var bases = window.JukeAPIBase.getApiBases();
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

            if (res.status === 401 || res.status === 403) {
                localStorage.removeItem('juke_token');
                localStorage.removeItem('juke_user');
                
                if (isSpaMode()) {
                    window.location.hash = '#/login';
                } else {
                    window.location.href = '../index.html#/login';
                }
                
                lastErr = new Error(((data && data.error) ? data.error : ('Session expired - Please login again')) + ' (' + (base + path) + ')');
                continue;
            }

            if (res.status === 404 || res.status === 405) {
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

    // Load content for the panel
    if (panelName === 'history') {
        renderHistory();
    }
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
                <button class="playlist-action-btn" type="button" data-action="share">Share</button>
                <button class="playlist-action-btn" type="button" data-action="edit">Edit</button>
                <button class="playlist-action-btn danger" type="button" data-action="delete">Delete</button>
            `;

            const likeBtn = actions.querySelector('[data-action="like"]');
            const commentBtn = actions.querySelector('[data-action="comment"]');
            const shareBtn = actions.querySelector('[data-action="share"]');
            const editBtn = actions.querySelector('[data-action="edit"]');
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

            if (shareBtn && !shareBtn.dataset.bound) {
                shareBtn.dataset.bound = '1';
                shareBtn.addEventListener('click', function () {
                    try {
                        if (!playlist || !playlist.id) return;
                        const url = `${window.location.origin}${window.location.pathname.split('/').slice(0, -1).join('/')}/playlist.html?id=${encodeURIComponent(playlist.id)}`;
                        if (navigator.share) {
                            navigator.share({
                                title: playlist.name || 'Playlist',
                                text: playlist.description || 'Check out this playlist',
                                url: url
                            });
                        } else {
                            navigator.clipboard.writeText(url).then(() => {
                                alert('Playlist link copied to clipboard!');
                            });
                        }
                    } catch (e) {
                        console.error(e);
                    }
                });
            }

            if (editBtn && !editBtn.dataset.bound) {
                editBtn.dataset.bound = '1';
                editBtn.addEventListener('click', function () {
                    try {
                        if (!playlist || !playlist.id) return;
                        editPlaylist(playlist.id, playlist.name);
                    } catch (e) {
                        console.error(e);
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
                safePlayTrack(tracks[0].id);
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
            const coverUrl = (t.cover_image_url) ? t.cover_image_url : 'images/juqe.png';
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
                    <button class="lists-track-action like-btn" data-track-id="${t.id}" type="button" aria-label="Like"><i class="far fa-heart"></i></button>
                    <button class="lists-track-action comment-btn" data-track-id="${t.id}" type="button" aria-label="Comment"><i class="far fa-comment"></i></button>
                    <button class="lists-track-action lists-track-share" data-track-id="${t.id}" type="button" aria-label="Share"><i class="far fa-paper-plane"></i></button>
                    <button class="lists-track-action edit-btn" data-track-id="${t.id}" type="button" aria-label="Edit"><i class="fas fa-edit"></i></button>
                    <button class="lists-track-action delete-btn" data-track-id="${t.id}" type="button" aria-label="Delete"><i class="fas fa-trash"></i></button>
                </div>
                <div class="lists-track-duration">3:45</div>
            `;

            row.addEventListener('click', function (e) {
                if (e.target.closest('.lists-track-action')) return;
                try {
                    safePlayTrack(t.id);
                } catch (_) {}
            });
            
            // Add event listeners for all action buttons
            const likeBtn = row.querySelector('.like-btn');
            if (likeBtn) {
                likeBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    const trackId = this.getAttribute('data-track-id');
                    this.classList.toggle('liked');
                    const icon = this.querySelector('i');
                    if (icon) {
                        icon.className = this.classList.contains('liked') ? 'fas fa-heart' : 'far fa-heart';
                    }
                    // Call global like function if available
                    safeLikeTrack(trackId);
                });
            }

            const commentBtn = row.querySelector('.comment-btn');
            if (commentBtn) {
                commentBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    const trackId = this.getAttribute('data-track-id');
                    // TODO: Implement comment functionality
                    alert('Comment functionality coming soon!');
                });
            }

            const shareBtn = row.querySelector('.lists-track-share');
            if (shareBtn) {
                shareBtn.addEventListener('click', function (e) {
                    e.stopPropagation();
                    const trackId = this.getAttribute('data-track-id');
                    try {
                        safeShareTrack(String(t.id), { title: safeTitle, text: safeArtist });
                    } catch (_) {
                    }
                });
            }

            const editBtn = row.querySelector('.edit-btn');
            if (editBtn) {
                editBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    const trackId = this.getAttribute('data-track-id');
                    // TODO: Implement edit functionality
                    alert('Edit functionality coming soon!');
                });
            }

            const deleteBtn = row.querySelector('.delete-btn');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    const trackId = this.getAttribute('data-track-id');
                    // Call global delete function if available
                    safeDeleteTrack(trackId, e);
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
    } catch (error) {
        console.error('Error getting username:', error);
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

function showPlaylistMenu(playlist, button) {
    // Remove any existing dropdowns
    const existingDropdown = document.querySelector('.playlist-dropdown');
    if (existingDropdown) {
        existingDropdown.remove();
    }

    // Create dropdown menu
    const dropdown = document.createElement('div');
    dropdown.className = 'playlist-dropdown';
    
    // Add menu items
    const items = [
        { text: 'Add Post', action: () => addPostToPlaylist(playlist) },
        { text: 'Edit Listname', action: () => editPlaylist(playlist.id, playlist.name) },
        { text: 'Delete List', action: () => deletePlaylist(playlist.id, playlist.name) }
    ];
    
    items.forEach(item => {
        const menuItem = document.createElement('div');
        menuItem.className = 'playlist-dropdown-item';
        menuItem.textContent = item.text;
        menuItem.onclick = () => {
            dropdown.remove();
            item.action();
        };
        dropdown.appendChild(menuItem);
    });
    
    // Position the dropdown relative to the button
    const buttonRect = button.getBoundingClientRect();
    dropdown.style.position = 'absolute';
    dropdown.style.top = (buttonRect.bottom - buttonRect.top) + 'px';
    dropdown.style.right = '0';
    
    // Make the button container relative for positioning
    const navContainer = button.parentElement;
    navContainer.style.position = 'relative';
    navContainer.appendChild(dropdown);
    
    // Close on click outside
    const closeHandler = (e) => {
        if (!dropdown.contains(e.target) && e.target !== button) {
            dropdown.remove();
            document.removeEventListener('click', closeHandler);
        }
    };
    setTimeout(() => {
        document.addEventListener('click', closeHandler);
    }, 100);
}

function addPostToPlaylist(playlist) {
    // TODO: Implement add post functionality
    alert('Add post functionality coming soon!');
}

function deletePlaylist(playlistId, playlistName) {
    if (confirm(`Are you sure you want to delete "${playlistName}"? This action cannot be undone.`)) {
        const token = getAuthToken();
        if (!token) {
            alert('Please login to delete playlists');
            return;
        }

        // Show loading state
        const navContainer = document.querySelector(`[data-view="playlist-${playlistId}"]`).parentElement;
        if (navContainer) {
            const deleteBtn = navContainer.querySelector('.lists-delete-btn');
            if (deleteBtn) {
                deleteBtn.innerHTML = '...';
                deleteBtn.disabled = true;
            }
        }

        // Make API call to delete playlist
        apiFetchJson(`/playlists/${playlistId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            }
        }).then(response => {
            
            // Remove navigation container
            if (navContainer) {
                navContainer.remove();
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
            if (navContainer) {
                const deleteBtn = navContainer.querySelector('.lists-delete-btn');
                if (deleteBtn) {
                    deleteBtn.innerHTML = '-';
                    deleteBtn.disabled = false;
                }
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
    const coverFallback = isSpaMode() ? 'images/juqe.png' : '../images/juqe.png';
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
    const coverFallback = isSpaMode() ? 'images/juqe.png' : '../images/juqe.png';
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
            safePlayTrack(t.id);
        } catch (_) {
        }
    });

    div.addEventListener('keydown', function (e) {
        if (!e) return;
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            try {
                safePlayTrack(t.id);
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
                    safeOpenComments(String(t.id), t.title || 'Comments');
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
                    safeShareTrack(String(t.id), { title: t.title, text: t.artist_name });
                } catch (_) {
                }
            });
        }
    } catch (_) {
    }
    return div;
}

async function loadLists() {
    if (!validateTokenAndRedirect()) {
        return; // Token validation failed and user was redirected
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

    const curatedEl = document.getElementById('curatedPlaylists');
    const likedEl = document.getElementById('likedTracks');
    const likedPlaylistsEl = document.getElementById('likedPlaylists');
    const randomEl = document.getElementById('randomPlaylists');

    
    bindListsNavigatorUi();
    showPanel('history'); // Show history by default

    // Check which panel is currently active
    const activePanel = document.querySelector('.lists-panel.active');

    if (curatedEl) setEmpty(curatedEl, 'Loading...');
    if (likedEl) setEmpty(likedEl, 'Loading...');
    if (likedPlaylistsEl) setEmpty(likedPlaylistsEl, 'Loading...');
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

        if (likedPlaylistsEl) {
            try {
                await loadLikedPlaylistsInto(likedPlaylistsEl);
            } catch (_) {
            }
        }

        // Load user playlists as separate navigation items
        const navItemsEl = document.querySelector('.lists-nav-items');
        
        if (navItemsEl) {
            try {
                Array.from(navItemsEl.querySelectorAll('.lists-nav-item-container')).forEach(function (n) {
                    try { n.remove(); } catch (_) {}
                });
            } catch (_) {
            }

            try {
                var contentRoot = document.querySelector('.lists-content');
                if (contentRoot) {
                    Array.from(contentRoot.querySelectorAll('.lists-panel[data-panel]')).forEach(function (p) {
                        try {
                            var pn = p.getAttribute('data-panel');
                            if (pn && typeof pn === 'string' && pn.indexOf('playlist-') === 0) {
                                p.remove();
                            }
                        } catch (_) {
                        }
                    });
                }
            } catch (_) {
            }
            
            // Add each playlist as a separate navigation item
            const myPlaylists = profile.playlists || [];
            
            myPlaylists.forEach((playlist, index) => {
                
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
                    showPanel(`playlist-${playlist.id}`);
                    // Load playlist content when clicked
                    loadPlaylistContent(playlist);
                });
                
                // Add action buttons for all playlists (temporarily remove ownership check)
                const menuBtn = document.createElement('button');
                menuBtn.className = 'lists-menu-btn';
                menuBtn.innerHTML = '⋮';
                menuBtn.title = 'Playlist options';
                menuBtn.onclick = (e) => {
                    e.stopPropagation();
                    showPlaylistMenu(playlist, e.target);
                };
                
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'lists-delete-btn';
                deleteBtn.innerHTML = '×';
                deleteBtn.title = 'Delete playlist';
                deleteBtn.onclick = (e) => {
                    e.stopPropagation();
                    deletePlaylist(playlist.id, playlist.name);
                };
                
                navItemContainer.appendChild(navBtn);
                navItemContainer.appendChild(menuBtn);
                navItemContainer.appendChild(deleteBtn);
                
                navItemsEl.appendChild(navItemContainer);
                
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
            });

            try {
                bindListsNavigatorUi();
            } catch (_) {
            }
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
        
        if (!validateTokenAndRedirect()) {
            return; // Token validation failed and user was redirected
        }
        
        // Add "_" prefix to the name
        const playlistName = '_' + name;
        
        const token = getAuthToken();
        if (!token) {
            alert('Please login to create a playlist');
            return;
        }
        
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

        if (response && response.id) {
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
                    showPanel(`playlist-${response.id}`);
                    loadPlaylistContent(response);
                });
                
                // Add action buttons positioned like add button
                const menuBtn = document.createElement('button');
                menuBtn.className = 'lists-menu-btn';
                menuBtn.innerHTML = '⋮';
                menuBtn.title = 'Playlist options';
                menuBtn.onclick = (e) => {
                    e.stopPropagation();
                    showPlaylistMenu(response, e.target);
                };
                
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'lists-delete-btn';
                deleteBtn.innerHTML = '-';
                deleteBtn.title = 'Delete playlist';
                deleteBtn.onclick = (e) => {
                    e.stopPropagation();
                    deletePlaylist(response.id, response.name);
                };
                
                navItemContainer.appendChild(navBtn);
                navItemContainer.appendChild(menuBtn);
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
            alert('Failed to create playlist. Please try again.');
        }
    } catch (error) {
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
            
            // Remove any existing listeners to prevent duplicates
            addPlaylistBtn.removeEventListener('click', handleAddButton);
            
            // Add the event listener
            addPlaylistBtn.addEventListener('click', handleAddButton);
            return true;
        }
        return false;
    };
    
    // Handler function
    const handleAddButton = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const name = prompt('Enter playlist name (will be prefixed with "_"):');
        if (!name || !name.trim()) return;
        
        if (typeof createPlaylist === 'function') {
            createPlaylist(name.trim());
        } else if (typeof window.createPlaylist === 'function') {
            window.createPlaylist(name.trim());
        }
    };
    
    // Try to bind immediately and retry multiple times if needed
    let attempts = 0;
    const maxAttempts = 10;
    
    const tryBind = () => {
        attempts++;
        
        if (bindAddButton()) {
            return;
        }
        
        if (attempts < maxAttempts) {
            setTimeout(tryBind, 200 * attempts); // Exponential backoff
        }
    };
    
    tryBind();
});

// ============================================
// LISTENING HISTORY FEATURE
// ============================================

const HISTORY_STORAGE_KEY = 'juke_listening_history';
const MAX_HISTORY_ITEMS = 100;

function getListeningHistory() {
    try {
        const data = localStorage.getItem(HISTORY_STORAGE_KEY);
        return data ? JSON.parse(data) : [];
    } catch (e) {
        console.error('Error reading history:', e);
        return [];
    }
}

function saveListeningHistory(history) {
    try {
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
    } catch (e) {
        console.error('Error saving history:', e);
    }
}

function addToHistory(track) {
    if (!track || !track.id) return;
    
    const history = getListeningHistory();
    const now = new Date().toISOString();
    
    // Create history entry
    const entry = {
        id: track.id,
        title: track.title || 'Unknown',
        artist: track.artist_name || track.artist || 'Unknown Artist',
        cover: track.cover_image_url || track.cover || 'images/juqe.png',
        playedAt: now
    };
    
    // Remove duplicate if exists (same track played again)
    const filtered = history.filter(h => !(h.id === track.id && isSameDay(new Date(h.playedAt), new Date(now))));
    
    // Add new entry at the beginning
    filtered.unshift(entry);
    
    // Limit history size
    const trimmed = filtered.slice(0, MAX_HISTORY_ITEMS);
    
    saveListeningHistory(trimmed);
}

function isSameDay(d1, d2) {
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
}

function formatHistoryDate(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (isSameDay(date, now)) {
        return 'Today';
    } else if (isSameDay(date, yesterday)) {
        return 'Yesterday';
    } else {
        const options = { weekday: 'long', month: 'short', day: 'numeric' };
        return date.toLocaleDateString('en-US', options);
    }
}

function formatHistoryTime(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function groupHistoryByDate(history) {
    const groups = {};
    
    history.forEach(item => {
        const dateKey = formatHistoryDate(item.playedAt);
        if (!groups[dateKey]) {
            groups[dateKey] = [];
        }
        groups[dateKey].push(item);
    });
    
    return groups;
}

function renderHistory() {
    const historyEl = document.getElementById('historyTracks');
    if (!historyEl) return;
    
    const history = getListeningHistory();
    
    if (!history || history.length === 0) {
        historyEl.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-history" style="font-size: 3rem; color: rgba(255,255,255,0.2); margin-bottom: 1rem;"></i>
                <p>No listening history yet</p>
                <p style="font-size: 0.85rem; color: rgba(255,255,255,0.5);">Start playing some tracks!</p>
            </div>
        `;
        return;
    }
    
    const grouped = groupHistoryByDate(history);
    historyEl.innerHTML = '';
    
    Object.keys(grouped).forEach(dateKey => {
        const group = document.createElement('div');
        group.className = 'history-date-group';
        
        const header = document.createElement('div');
        header.className = 'history-date-header';
        header.innerHTML = `<i class="fas fa-calendar-alt"></i> ${dateKey}`;
        group.appendChild(header);
        
        grouped[dateKey].forEach(item => {
            const row = document.createElement('div');
            row.className = 'history-item';
            row.innerHTML = `
                <img class="history-cover" src="${item.cover}" alt="" onerror="this.src='images/juqe.png'">
                <div class="history-info">
                    <div class="history-title">${item.title}</div>
                    <div class="history-artist">${item.artist}</div>
                </div>
                <div class="history-time">${formatHistoryTime(item.playedAt)}</div>
                <button class="history-play-btn" data-track-id="${item.id}" aria-label="Play">
                    <i class="fas fa-play"></i>
                </button>
            `;
            
            row.addEventListener('click', function(e) {
                if (e.target.closest('.history-play-btn')) return;
                safePlayTrack(item.id);
            });
            
            const playBtn = row.querySelector('.history-play-btn');
            if (playBtn) {
                playBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    safePlayTrack(item.id);
                });
            }
            
            group.appendChild(row);
        });
        
        historyEl.appendChild(group);
    });
}

function clearHistory() {
    if (confirm('Clear all listening history?')) {
        saveListeningHistory([]);
        renderHistory();
    }
}

function bindHistoryUI() {
    const clearBtn = document.getElementById('clearHistoryBtn');
    if (clearBtn && !clearBtn.dataset.bound) {
        clearBtn.dataset.bound = '1';
        clearBtn.addEventListener('click', clearHistory);
    }
}

// Bind mobile tabs
function bindMobileTabs() {
    const tabs = document.querySelectorAll('.lists-tab');
    const panels = document.querySelectorAll('.lists-panel[data-panel]');
    
    tabs.forEach(tab => {
        if (tab.dataset.bound) return;
        tab.dataset.bound = '1';
        
        tab.addEventListener('click', function() {
            const targetPanel = this.getAttribute('data-tab');
            
            // Update tabs
            tabs.forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            
            // Update panels
            panels.forEach(p => {
                const panelName = p.getAttribute('data-panel');
                if (panelName === targetPanel) {
                    p.classList.add('active');
                } else {
                    p.classList.remove('active');
                }
            });
            
            // Load content for the panel
            if (targetPanel === 'history') {
                renderHistory();
            } else if (targetPanel === 'liked') {
                loadLikedTracks();
            } else if (targetPanel === 'playlists') {
                loadLists();
            } else if (targetPanel === 'liked-playlists') {
                const likedPlaylistsEl = document.getElementById('likedPlaylists');
                if (likedPlaylistsEl) loadLikedPlaylistsInto(likedPlaylistsEl);
            }
        });
    });
}

// Hook into player to track history
function hookPlayerForHistory() {
    // Listen for track play events
    if (window.JukePlayer && typeof window.JukePlayer.onTrackPlay === 'function') {
        const originalOnPlay = window.JukePlayer.onTrackPlay;
        window.JukePlayer.onTrackPlay = function(track) {
            addToHistory(track);
            if (originalOnPlay) originalOnPlay(track);
        };
    }
    
    // Also listen for custom events
    document.addEventListener('juke:trackplay', function(e) {
        if (e.detail && e.detail.track) {
            addToHistory(e.detail.track);
        }
    });
}

// Initialize history on lists page load
function initHistoryFeature() {
    bindHistoryUI();
    bindMobileTabs();
    hookPlayerForHistory();
    
    // Render history if on history panel
    const historyPanel = document.getElementById('listsPanelHistory');
    if (historyPanel && historyPanel.classList.contains('active')) {
        renderHistory();
    }
}

// Utility functions for common operations
function safePlayTrack(trackId) {
    if (typeof window.playTrack === 'function') {
        window.playTrack(trackId);
    }
}

function safeLikeTrack(trackId) {
    if (typeof window.likeTrack === 'function') {
        window.likeTrack(trackId);
    }
}

function safeShareTrack(trackId, options) {
    if (typeof window.shareTrackById === 'function') {
        window.shareTrackById(trackId, options);
    }
}

function safeDeleteTrack(trackId, event) {
    if (typeof window.deleteTrack === 'function') {
        window.deleteTrack(trackId, event);
    } else {
        alert('Delete functionality coming soon!');
    }
}

function safeOpenComments(trackId, title) {
    if (typeof window.openTrackCommentsModal === 'function') {
        window.openTrackCommentsModal(trackId, { title });
    }
}

window.JukeHistory = {
    add: addToHistory,
    get: getListeningHistory,
    clear: clearHistory,
    render: renderHistory
};

window.JukeLists = {
    loadLists,
    createPlaylist,
    initHistory: initHistoryFeature
};

window.createPlaylist = createPlaylist;

document.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'addPlaylistBtn') {
        e.preventDefault();
        e.stopPropagation();
        
        const name = prompt('Enter playlist name (will be prefixed with "_"):');
        if (!name || !name.trim()) return;
        
        if (typeof createPlaylist === 'function') {
            createPlaylist(name.trim());
        }
    }
});
