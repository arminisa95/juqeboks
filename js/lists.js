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

async function loadLikedPlaylistsInto(likedTracksEl) {
    const token = getAuthToken();
    if (!token) return;
    if (!likedTracksEl) return;

    var host = ensureLikedPlaylistsHost(likedTracksEl);
    if (!host) return;
    host.innerHTML = '<div class="lists-subsection-title">Liked playlists</div><div class="cards-grid" id="likedPlaylistsGrid"></div>';
    var grid = host.querySelector('#likedPlaylistsGrid');
    if (!grid) return;

    try {
        const liked = await apiFetchJson('/playlists/liked', {
            headers: {
                Authorization: `Bearer ${token}`
            }
        }, function (d) {
            return Array.isArray(d);
        });

        grid.innerHTML = '';
        if (!liked || liked.length === 0) {
            grid.innerHTML = '<div class="empty-state">No liked playlists yet.</div>';
            return;
        }

        liked.forEach(function (p) {
            grid.appendChild(renderPlaylistCard(p));
        });
    } catch (e) {
        console.error(e);
        grid.innerHTML = '<div class="empty-state">Failed to load liked playlists.</div>';
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
            p.style.display = '';
        } else {
            p.style.display = 'none';
        }
    });

    ui.navItems.forEach(function (btn) {
        if (!btn) return;
        const v = btn.getAttribute('data-view');
        if (v === panelName) {
            btn.classList.add('active');
            btn.setAttribute('aria-selected', 'true');
            btn.tabIndex = 0;
        } else {
            btn.classList.remove('active');
            btn.setAttribute('aria-selected', 'false');
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

            row.innerHTML = `
                <div class="lists-track-num">${pos}</div>
                <div class="lists-track-play-hover"><i class="fas fa-play"></i></div>
                <img class="lists-track-cover" src="${coverUrl}" alt="">
                <div class="lists-track-meta">
                    <div class="lists-track-title">${safeTitle}</div>
                    <div class="lists-track-artist">${safeArtist}</div>
                </div>
                <div class="lists-track-actions">
                    <button class="lists-track-action" type="button" aria-label="Like"><i class="far fa-heart"></i></button>
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
    const randomEl = document.getElementById('randomPlaylists');

    bindListsNavigatorUi();
    showPanel('liked');

    setEmpty(myPlaylistsEl, 'Loading...');
    setEmpty(curatedEl, 'Loading...');
    setEmpty(likedEl, 'Loading...');
    setEmpty(randomEl, 'Loading...');

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

        try {
            await loadLikedPlaylistsInto(likedEl);
        } catch (_) {
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

    try {
        const random = await apiFetchJson('/playlists/public', {}, function (d) {
            return Array.isArray(d);
        });
        randomEl.innerHTML = '';

        if (!random || random.length === 0) {
            setEmpty(randomEl, 'No public playlists available yet.');
        } else {
            const shuffled = random.slice().sort(function () {
                return Math.random() - 0.5;
            });
            shuffled.forEach((p) => randomEl.appendChild(renderPlaylistCard(p)));
        }
    } catch (e) {
        console.error(e);
        setEmpty(randomEl, 'Failed to load public playlists.');
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
