// JUKE API Integration

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

window.isTrackLiked = function (trackId) {
    try {
        return likedTrackIds.has(String(trackId));
    } catch (_) {
        return false;
    }
};

function resolveLocalAssetUrl(pathFromRoot) {
    try {
        var p = (window.location && window.location.pathname) ? String(window.location.pathname).replace(/\\/g, '/') : '';
        var base = p.includes('/html/') ? '..' : '.';
        return base + '/' + String(pathFromRoot || '').replace(/^\//, '');
    } catch (_) {
        return pathFromRoot;
    }
}

function escapeHtml(value) {
    try {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    } catch (_) {
        return '';
    }
}

function formatRelativeTime(value) {
    try {
        var d = value ? new Date(value) : null;
        if (!d || !isFinite(d.getTime())) return '';
        var diff = Date.now() - d.getTime();
        if (!isFinite(diff)) return '';
        var s = Math.max(0, Math.floor(diff / 1000));
        if (s < 10) return 'now';
        if (s < 60) return s + 's';
        var m = Math.floor(s / 60);
        if (m < 60) return m + 'm';
        var h = Math.floor(m / 60);
        if (h < 24) return h + 'h';
        var days = Math.floor(h / 24);
        if (days < 7) return days + 'd';
        var w = Math.floor(days / 7);
        if (w < 5) return w + 'w';
        var mo = Math.floor(days / 30);
        if (mo < 12) return mo + 'mo';
        var y = Math.floor(days / 365);
        return y + 'y';
    } catch (_) {
        return '';
    }
}

async function fetchTrackComments(trackId) {
    const token = getAuthToken();
    if (!token) {
        if (isSpaMode()) {
            window.location.hash = '#/login';
        } else {
            window.location.href = 'login.html';
        }
        return [];
    }

    try {
        return await apiFetchJson(`/tracks/${encodeURIComponent(String(trackId))}/comments`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        }, function (d) {
            return Array.isArray(d);
        });
    } catch (_) {
        return [];
    }
}

async function createTrackComment(trackId, text) {
    const token = getAuthToken();
    if (!token) {
        if (isSpaMode()) {
            window.location.hash = '#/login';
        } else {
            window.location.href = 'login.html';
        }
        return null;
    }

    try {
        return await apiFetchJson(`/tracks/${encodeURIComponent(String(trackId))}/comments`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ body: String(text || '').trim() })
        }, function (d) {
            return !!d && typeof d === 'object' && !Array.isArray(d);
        });
    } catch (_) {
        return null;
    }
}

async function deleteTrackComment(trackId, commentId) {
    const token = getAuthToken();
    if (!token) {
        if (isSpaMode()) {
            window.location.hash = '#/login';
        } else {
            window.location.href = 'login.html';
        }
        return false;
    }

    try {
        await apiFetchJson(`/tracks/${encodeURIComponent(String(trackId))}/comments/${encodeURIComponent(String(commentId))}`, {
            method: 'DELETE',
            headers: {
                Authorization: `Bearer ${token}`
            }
        }, function (d) {
            return !!d && typeof d === 'object' && (d.success === true || d.success === undefined);
        });
        return true;
    } catch (_) {
        return false;
    }
}

function renderTrackCommentsList(listEl, comments) {
    if (!listEl) return;
    if (!Array.isArray(comments) || comments.length === 0) {
        listEl.innerHTML = '<div class="post-comments-empty">No comments yet.</div>';
        return;
    }

    var currentUserId = null;
    var isAdmin = false;
    try {
        if (typeof getCurrentUser === 'function') {
            var u = getCurrentUser();
            currentUserId = u && u.id ? String(u.id) : null;
            isAdmin = !!(u && (u.isAdmin || u.is_admin));
        }
    } catch (_) {
        currentUserId = null;
        isAdmin = false;
    }

    listEl.innerHTML = comments.map(function (c) {
        var cid = (c && c.id) ? String(c.id) : '';
        var tid = (c && c.track_id) ? String(c.track_id) : '';
        var canDelete = false;
        try {
            canDelete = !!isAdmin || (!!currentUserId && !!c && c.user_id && String(c.user_id) === String(currentUserId));
        } catch (_) {
            canDelete = false;
        }
        var username = escapeHtml((c && c.username) ? c.username : 'user');
        var body = escapeHtml((c && c.body) ? c.body : '');
        var time = formatRelativeTime(c && c.created_at ? c.created_at : null);
        var initial = username ? username.charAt(0).toUpperCase() : 'U';
        return '' +
            '<div class="comment-item">' +
            '  <div class="comment-avatar">' + escapeHtml(initial) + '</div>' +
            '  <div class="comment-content">' +
            '    <div class="comment-username">@' + username + (time ? (' <span class="comment-time">' + escapeHtml(time) + '</span>') : '') + (canDelete ? (' <button type="button" class="comment-delete-btn" data-track-id="' + escapeHtml(tid) + '" data-comment-id="' + escapeHtml(cid) + '" aria-label="Delete">Delete</button>') : '') + '</div>' +
            '    <div class="comment-text">' + body + '</div>' +
            '  </div>' +
            '</div>';
    }).join('');
}

async function loadAndRenderTrackComments(trackId, listEl) {
    if (!listEl) return;
    listEl.innerHTML = '<div class="post-comments-empty">Loading...</div>';
    const comments = await fetchTrackComments(trackId);
    renderTrackCommentsList(listEl, comments);
}

function openTrackCommentsModal(trackId, meta) {
    try {
        if (!trackId) return;
        var existing = document.getElementById('jukeTrackCommentsRoot');
        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

        var root = document.createElement('div');
        root.id = 'jukeTrackCommentsRoot';
        root.className = 'juke-track-comments-root';

        var title = (meta && meta.title) ? String(meta.title) : 'Comments';

        root.innerHTML = '' +
            '<div class="juke-track-comments-backdrop" data-juke-track-comments-close="1"></div>' +
            '<div class="juke-track-comments-sheet" role="dialog" aria-modal="true">' +
            '  <div class="juke-track-comments-header">' +
            '    <div class="juke-track-comments-title">' + escapeHtml(title) + '</div>' +
            '    <button type="button" class="juke-track-comments-close" data-juke-track-comments-close="1" aria-label="Close"><i class="fas fa-times"></i></button>' +
            '  </div>' +
            '  <div class="post-comments-list" data-track-id="' + escapeHtml(String(trackId)) + '"></div>' +
            '  <div class="post-comment-compose">' +
            '    <input type="text" class="post-comment-input" placeholder="Add a comment…" data-track-id="' + escapeHtml(String(trackId)) + '">' +
            '    <button type="button" class="post-comment-send" data-track-id="' + escapeHtml(String(trackId)) + '">Post</button>' +
            '  </div>' +
            '</div>';

        document.body.appendChild(root);

        try {
            requestAnimationFrame(function () {
                try {
                    root.classList.add('open');
                } catch (_) {
                }
            });
        } catch (_) {
        }

        try {
            var listEl = root.querySelector('.post-comments-list[data-track-id]');
            loadAndRenderTrackComments(String(trackId), listEl);
        } catch (_) {
        }

        function close() {
            try {
                root.classList.remove('open');
            } catch (_) {
            }
            try {
                root.parentNode.removeChild(root);
            } catch (_) {
            }
        }

        root.addEventListener('click', function (e) {
            var t = e && e.target ? e.target : null;
            if (!t) return;

            try {
                if (t.getAttribute && t.getAttribute('data-juke-track-comments-close') === '1') {
                    close();
                    return;
                }
            } catch (_) {
            }

            var send = null;
            try {
                send = t.closest ? t.closest('.post-comment-send[data-track-id]') : null;
            } catch (_) {
                send = null;
            }
            if (send) {
                var id = send.getAttribute('data-track-id');
                if (!id) return;
                try {
                    var input = root.querySelector('.post-comment-input[data-track-id="' + String(id) + '"]');
                    var list = root.querySelector('.post-comments-list[data-track-id="' + String(id) + '"]');
                    var text = input ? String(input.value || '').trim() : '';
                    if (!text) return;
                    if (input) input.value = '';
                    createTrackComment(id, text).then(function () {
                        loadAndRenderTrackComments(id, list);
                    });
                } catch (_) {
                }
                return;
            }

            var delBtn = null;
            try {
                delBtn = t.closest ? t.closest('.comment-delete-btn[data-track-id][data-comment-id]') : null;
            } catch (_) {
                delBtn = null;
            }
            if (delBtn) {
                var tid = delBtn.getAttribute('data-track-id');
                var cid = delBtn.getAttribute('data-comment-id');
                if (!tid || !cid) return;
                try {
                    if (!window.confirm('Delete this comment?')) return;
                } catch (_) {
                }
                try {
                    var listEl = root.querySelector('.post-comments-list[data-track-id]');
                    deleteTrackComment(tid, cid).then(function () {
                        loadAndRenderTrackComments(String(tid), listEl);
                    });
                } catch (_) {
                }
                return;
            }
        });

        try {
            root.addEventListener('keydown', function (e) {
                var t = e && e.target ? e.target : null;
                if (!t) return;
                if (t.classList && t.classList.contains('post-comment-input')) {
                    if (e.key === 'Enter') {
                        try {
                            var id = t.getAttribute('data-track-id');
                            var send = id ? root.querySelector('.post-comment-send[data-track-id="' + String(id) + '"]') : null;
                            if (send) send.click();
                        } catch (_) {
                        }
                    }
                }
            });
        } catch (_) {
        }
    } catch (_) {
    }
}

function parseTrackDate(track) {
    try {
        var v = track && (track.created_at || track.createdAt || track.created);
        if (!v) return null;
        var d = new Date(v);
        if (!d || isNaN(d.getTime())) return null;
        return d;
    } catch (_) {
        return null;
    }
}

function formatTrackDateShort(track) {
    var d = parseTrackDate(track);
    if (!d) return '';
    try {
        var now = new Date();
        var diffMs = now.getTime() - d.getTime();
        if (!isFinite(diffMs)) return '';
        var diffMin = Math.floor(diffMs / 60000);
        if (diffMin < 1) return 'now';
        if (diffMin < 60) return diffMin + 'm';
        var diffHr = Math.floor(diffMin / 60);
        if (diffHr < 24) return diffHr + 'h';
        var diffDay = Math.floor(diffHr / 24);
        if (diffDay < 7) return diffDay + 'd';
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch (_) {
        return '';
    }
}

try {
    window.JukeUi = window.JukeUi || {};
    window.JukeUi.formatTrackDateShort = formatTrackDateShort;
} catch (_) {
}

try {
    window.openTrackCommentsModal = openTrackCommentsModal;
} catch (_) {
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
        likedTrackIds = new Set(favorites.map((t) => String(t && t.id)));
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

// Add a global loading guard for loadTracks to prevent double calls
var isLoadTracksRunning = false;

window.isFeedInitialized = false;

// Fetch all tracks for feed
async function loadTracks() {
    // Prevent multiple simultaneous calls
    if (isLoadTracksRunning) {
        return;
    }
    
    isLoadTracksRunning = true;
    
    try {
        const tracksGrid = document.getElementById('tracksGrid');

        await loadLikedTrackIds();

        if (tracksGrid) {
            await loadMyTracks();
            return;
        }

        // Only allow feed loading on the actual feed route.
        // Require an explicit '#/feed' hash so we don't accidentally load during initial navigation.
        try {
            var baseHash = String(window.location.hash || '');
            baseHash = baseHash ? baseHash.split('?')[0] : '';
            if (baseHash !== '#/feed') {
                return;
            }
        } catch (_) {
        }

        const appRoot = document.getElementById('app');
        const feedGrid = document.getElementById('feedGrid') || (appRoot ? appRoot.querySelector('.music-grid') : null);
        
        if (feedGrid) {
            // Additional guard to prevent duplicate feed initialization
            if (window.isFeedInitialized) {
                return;
            }
            window.isFeedInitialized = true;
            await loadFeedStream(true);
            return;
        }

        // Only run this fallback if neither grid exists
        const tracks = await apiFetchJson('/tracks', {}, function (d) {
            return Array.isArray(d);
        });
        displayFeedTracks(tracks);
    } catch (error) {
        console.error('Error loading tracks:', error);
    } finally {
        isLoadTracksRunning = false;
    }
}

var feedState = {
    offset: 0,
    limit: 10,
    loading: false,
    done: false,
    bound: false,
    storiesLoaded: false,
    trackIds: [],
    queueTracks: [],
    sharedTrackPlayed: false
};

function openTrackMediaViewer(tracksArr, startTrackId) {
    try {
        console.log('openTrackMediaViewer called with', tracksArr?.length, 'tracks, startId:', startTrackId);
        if (!startTrackId) return;

        var existing = document.getElementById('jukeMediaViewerRoot');
        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

        var root = document.createElement('div');
        root.id = 'jukeMediaViewerRoot';
        root.className = 'juke-media-viewer-root';

        root.innerHTML = '' +
            '<div class="juke-media-backdrop" data-juke-media-close="1"></div>' +
            '<div class="juke-media-viewer-sheet" role="dialog" aria-modal="true">' +
            '  <div class="juke-media-header">' +
            '    <div class="juke-media-title">Media</div>' +
            '    <button type="button" class="juke-media-close" data-juke-media-close="1" aria-label="Close">' +
            '      <i class="fas fa-times"></i>' +
            '    </button>' +
            '  </div>' +
            '  <div class="juke-media-container">' +
            '    <div class="juke-media-main">' +
            '      <div class="juke-media-frame">' +
            '        <button type="button" class="juke-media-nav juke-media-prev" data-juke-media-nav="prev" aria-label="Previous"><i class="fas fa-chevron-left"></i></button>' +
            '        <div class="juke-media-content"></div>' +
            '        <button type="button" class="juke-media-nav juke-media-next" data-juke-media-nav="next" aria-label="Next"><i class="fas fa-chevron-right"></i></button>' +
            '      </div>' +
            '      <div class="juke-media-info">' +
            '        <div class="juke-media-title"></div>' +
            '        <div class="juke-media-artist"></div>' +
            '        <div class="juke-media-date"></div>' +
            '      </div>' +
            '      <div class="juke-media-actions">' +
            '        <button class="juke-media-action like-btn" data-track-id="" type="button" aria-label="Like">' +
            '          <i class="far fa-heart"></i>' +
            '          <span class="like-count"></span>' +
            '        </button>' +
            '        <button class="juke-media-action comment-btn" type="button" aria-label="Comments" data-juke-media-comments-toggle="1">' +
            '          <i class="far fa-comment"></i>' +
            '        </button>' +
            '        <button class="juke-media-action share-btn" type="button" aria-label="Share" data-share-track-id="">' +
            '          <i class="far fa-paper-plane"></i>' +
            '        </button>' +
            '      </div>' +
            '    </div>' +
            '    <div class="juke-media-sidebar" id="jukeMediaSidebar">' +
            '      <div class="juke-sidebar-header">' +
            '        <h3>Comments</h3>' +
            '        <button type="button" class="juke-sidebar-close" data-juke-sidebar-close="1" aria-label="Close sidebar">' +
            '          <i class="fas fa-times"></i>' +
            '        </button>' +
            '      </div>' +
            '      <div class="juke-comments-list" data-track-id=""></div>' +
            '      <div class="juke-comment-compose">' +
            '        <input type="text" class="juke-comment-input" placeholder="Add a comment…" data-track-id="">' +
            '        <button type="button" class="juke-comment-send" data-track-id="">Post</button>' +
            '      </div>' +
            '    </div>' +
            '  </div>' +
            '</div>';

        document.body.appendChild(root);

        try {
            requestAnimationFrame(function () {
                try {
                    root.classList.add('open');
                } catch (_) {
                }
            });
        } catch (_) {
        }

        var activeTrackId = String(startTrackId);
        var mediaHost = null;
        try {
            mediaHost = root.querySelector('.juke-stories-tray-media');
        } catch (_) {
            mediaHost = null;
        }

        function findTrackById(trackId) {
            try {
                var idStr = String(trackId);
                return (tracksArr && Array.isArray(tracksArr)) ? (tracksArr || []).find(function (x) { return x && String(x.id) === idStr; }) : null;
            } catch (_) {
                return null;
            }
        }

        function getActiveIndex() {
            try {
                if (!Array.isArray(tracksArr) || !activeTrackId) return -1;
                return (tracksArr || []).findIndex(function (x) { return x && String(x.id) === String(activeTrackId); });
            } catch (_) {
                return -1;
            }
        }

        function playTrackObj(trackObj) {
            try {
                if (!trackObj) return;
                if (window.JukePlayer && typeof window.JukePlayer.playTrack === 'function') {
                    window.JukePlayer.playTrack(trackObj, { autoShowVideo: !!trackObj.video_url });
                    return;
                }
                if (trackObj && trackObj.id && typeof playTrack === 'function') {
                    playTrack(String(trackObj.id));
                }
            } catch (_) {
            }
        }

        function setActiveTrack(trackObj, opts) {
            try {
                if (!trackObj || trackObj.id == null) return;
                activeTrackId = String(trackObj.id);

                var idx = getActiveIndex();
                var hasPrev = !!(idx > 0);
                var hasNext = !!(idx >= 0 && Array.isArray(tracksArr) && idx < (tracksArr.length - 1));

                var cover = resolveAssetUrl(trackObj.cover_image_url, resolveLocalAssetUrl('images/juke.png'));
                var safeTitle = trackObj && trackObj.title ? String(trackObj.title) : 'Untitled';
                var safeArtist = (trackObj && (trackObj.artist_name || trackObj.uploader_username)) ? String(trackObj.artist_name || trackObj.uploader_username) : '';
                var dateTxt = formatTrackDateShort(trackObj);
                var videoUrl = trackObj && trackObj.video_url ? resolveAssetUrl(trackObj.video_url, '') : '';

                var mediaEl = '';
                if (videoUrl) {
                    mediaEl = '<video src="' + String(videoUrl).replace(/</g, '&lt;').replace(/>/g, '&gt;') + '" playsinline muted autoplay loop controls></video>';
                } else {
                    mediaEl = '<img src="' + String(cover).replace(/</g, '&lt;').replace(/>/g, '&gt;') + '" alt="">';
                }

                var liked = false;
                try {
                    liked = likedTrackIds.has(String(trackObj.id));
                } catch (_) {
                    liked = false;
                }

                var likeCount = 0;
                try {
                    likeCount = (typeof trackObj.like_count === 'number') ? trackObj.like_count : 0;
                } catch (_) {
                    likeCount = 0;
                }
                var likeCountTxt = (liked || likeCount > 0) ? String(likeCount) : '';

                // Update media content
                var mediaContent = root.querySelector('.juke-media-content');
                if (mediaContent) {
                    mediaContent.innerHTML = mediaEl;
                }

                // Update media info
                var titleEl = root.querySelector('.juke-media-title');
                var artistEl = root.querySelector('.juke-media-artist');
                var dateEl = root.querySelector('.juke-media-date');
                
                if (titleEl) titleEl.textContent = safeTitle;
                if (artistEl) artistEl.textContent = safeArtist;
                if (dateEl) dateEl.textContent = dateTxt || '';

                // Update navigation buttons
                var prevBtn = root.querySelector('.juke-media-prev');
                var nextBtn = root.querySelector('.juke-media-next');
                
                if (prevBtn) prevBtn.disabled = !hasPrev;
                if (nextBtn) nextBtn.disabled = !hasNext;

                // Update action buttons
                var likeBtn = root.querySelector('.like-btn');
                var commentBtn = root.querySelector('.comment-btn');
                var shareBtn = root.querySelector('.share-btn');
                
                if (likeBtn) {
                    likeBtn.setAttribute('data-track-id', String(trackObj.id));
                    likeBtn.querySelector('i').className = liked ? 'fas fa-heart' : 'far fa-heart';
                    likeBtn.classList.toggle('liked', liked);
                    var likeCountEl = likeBtn.querySelector('.like-count');
                    if (likeCountEl) likeCountEl.textContent = likeCountTxt;
                }
                
                if (commentBtn) {
                    commentBtn.setAttribute('data-track-id', String(trackObj.id));
                }
                
                if (shareBtn) {
                    shareBtn.setAttribute('data-share-track-id', String(trackObj.id));
                }

                // Update sidebar elements
                var commentsList = root.querySelector('.juke-comments-list');
                var commentInput = root.querySelector('.juke-comment-input');
                var commentSend = root.querySelector('.juke-comment-send');
                
                if (commentsList) commentsList.setAttribute('data-track-id', String(trackObj.id));
                if (commentInput) commentInput.setAttribute('data-track-id', String(trackObj.id));
                if (commentSend) commentSend.setAttribute('data-track-id', String(trackObj.id));

                // Play track if available
                playTrackObj(trackObj);

            } catch (e) {
                console.error('Set active track failed:', e);
            }
        }

        // Set initial track
        var initialTrack = findTrackById(startTrackId);
        if (initialTrack) {
            setActiveTrack(initialTrack);
        }

        function close() {
            try {
                if (!root) return;
                try {
                    var v = root.querySelector('video');
                    if (v && typeof v.pause === 'function') v.pause();
                } catch (_) {
                }
                try {
                    root.classList.remove('open');
                } catch (_) {
                }
                try {
                    if (root.parentNode) root.parentNode.removeChild(root);
                } catch (_) {
                }
            } catch (_) {
            }
        }

        // Add event listeners
        root.addEventListener('click', function (e) {
            var target = e && e.target ? e.target : null;
            if (!target) return;

            try {
                if (target.getAttribute && target.getAttribute('data-juke-media-close') === '1') {
                    close();
                    return;
                }
            } catch (_) {
            }

            var navBtn = null;
            try {
                navBtn = target.closest ? target.closest('[data-juke-media-nav]') : null;
            } catch (_) {
                navBtn = null;
            }
            if (navBtn) {
                try {
                    if (navBtn.disabled) return;
                } catch (_) {
                }
                var dir = null;
                try {
                    dir = navBtn.getAttribute('data-juke-media-nav');
                } catch (_) {
                    dir = null;
                }
                var idx = getActiveIndex();
                if (dir === 'prev' && idx > 0) {
                    setActiveTrack(tracksArr[idx - 1], { play: true });
                    return;
                }
                if (dir === 'next' && idx >= 0 && idx < (tracksArr.length - 1)) {
                    setActiveTrack(tracksArr[idx + 1], { play: true });
                    return;
                }
            }

            var commentToggle = null;
            try {
                commentToggle = target.closest ? target.closest('[data-juke-media-comments-toggle="1"]') : null;
            } catch (_) {
                commentToggle = null;
            }
            if (commentToggle) {
                try {
                    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
                } catch (_) {
                }
                
                var sidebar = root.querySelector('.juke-media-sidebar');
                if (sidebar) {
                    var willOpen = !sidebar.classList.contains('open');
                    sidebar.classList.toggle('open', willOpen);
                    
                    if (willOpen) {
                        try {
                            var listEl = root.querySelector('.juke-comments-list[data-track-id]');
                            var tid = listEl ? listEl.getAttribute('data-track-id') : null;
                            if (tid) loadAndRenderTrackComments(tid, listEl);
                        } catch (_) {
                        }
                    }
                }
                return;
            }

            var sendBtn = null;
            try {
                sendBtn = target.closest ? target.closest('.post-comment-send[data-track-id]') : null;
            } catch (_) {
                sendBtn = null;
            }
            if (sendBtn) {
                var tid2 = sendBtn.getAttribute('data-track-id');
                if (!tid2) return;
                try {
                    var input2 = root.querySelector('.juke-comment-input[data-track-id="' + String(tid2) + '"]');
                    var list2 = root.querySelector('.juke-comments-list[data-track-id="' + String(tid2) + '"]');
                    var txt2 = input2 ? String(input2.value || '').trim() : '';
                    if (!txt2) return;
                    if (input2) input2.value = '';
                    createTrackComment(tid2, txt2).then(function () {
                        loadAndRenderTrackComments(tid2, list2);
                    });
                } catch (_) {
                }
                return;
            }

            var delBtn = null;
            try {
                delBtn = target.closest ? target.closest('.comment-delete-btn[data-track-id][data-comment-id]') : null;
            } catch (_) {
                delBtn = null;
            }
            if (delBtn) {
                var dtid = delBtn.getAttribute('data-track-id');
                var dcid = delBtn.getAttribute('data-comment-id');
                if (!dtid || !dcid) return;
                try {
                    if (!window.confirm('Delete this comment?')) return;
                } catch (_) {
                }
                try {
                    var listDel = root.querySelector('.juke-comments-list[data-track-id="' + String(dtid) + '"]');
                    deleteTrackComment(dtid, dcid).then(function () {
                        loadAndRenderTrackComments(dtid, listDel);
                    });
                } catch (_) {
                }
                return;
            }

            var likeBtn = null;
            try {
                likeBtn = target.closest ? target.closest('.like-btn[data-track-id]') : null;
            } catch (_) {
                likeBtn = null;
            }
            if (likeBtn) {
                var lid = likeBtn.getAttribute('data-track-id');
                if (!lid) return;
                try {
                    likeTrack(String(lid));
                } catch (_) {
                }
                try {
                    var tObj = findTrackById(lid);
                    if (tObj) setActiveTrack(tObj, { play: false });
                } catch (_) {
                }
                return;
            }

            var shareBtn = null;
            try {
                shareBtn = target.closest ? target.closest('[data-share-track-id]') : null;
            } catch (_) {
                shareBtn = null;
            }
            if (shareBtn) {
                var sid = null;
                try {
                    sid = shareBtn.getAttribute('data-share-track-id');
                } catch (_) {
                    sid = null;
                }
                if (sid && typeof window.shareTrackById === 'function') {
                    try {
                        var tt = findTrackById(sid);
                        window.shareTrackById(String(sid), { title: tt && tt.title ? tt.title : '', text: tt && (tt.artist_name || tt.uploader_username) ? (tt.artist_name || tt.uploader_username) : '' });
                    } catch (_) {
                    }
                }
                return;
            }
        });

        try {
            // Add keyboard navigation to document for better capture
            document.addEventListener('keydown', function (e) {
                // Only handle keys when media viewer is open
                var mediaViewer = document.getElementById('jukeMediaViewerRoot');
                if (!mediaViewer || !mediaViewer.classList.contains('open')) return;
                
                if (e.key === 'Escape') {
                    close();
                    return;
                }
                
                // Arrow key navigation
                if (e.key === 'ArrowLeft') {
                    try {
                        var prevBtn = mediaViewer.querySelector('.juke-media-prev');
                        if (prevBtn && !prevBtn.disabled) prevBtn.click();
                    } catch (_) {}
                    return;
                }
                
                if (e.key === 'ArrowRight') {
                    try {
                        var nextBtn = mediaViewer.querySelector('.juke-media-next');
                        if (nextBtn && !nextBtn.disabled) nextBtn.click();
                    } catch (_) {}
                    return;
                }
                
                // Handle comment input
                var t = e && e.target ? e.target : null;
                if (t && t.classList && t.classList.contains('juke-comment-input')) {
                    if (e.key === 'Enter') {
                        try {
                            var id = t.getAttribute('data-track-id');
                            var send = id ? mediaViewer.querySelector('.juke-comment-send[data-track-id="' + String(id) + '"]') : null;
                            if (send) send.click();
                        } catch (_) {
                        }
                    }
                }
            });
        } catch (_) {
        }
    } catch (_) {
    }
}

try {
    window.openTrackMediaViewer = openTrackMediaViewer;
} catch (_) {
}

function getHashQueryParam(key) {
    try {
        var h = String(window.location.hash || '');
        var idx = h.indexOf('?');
        if (idx === -1) return null;
        var qs = h.slice(idx + 1);
        var params = new URLSearchParams(qs);
        return params.get(key);
    } catch (_) {
        return null;
    }
}

function maybeAutoPlaySharedTrack() {
    try {
        if (feedState.sharedTrackPlayed) return;
        var id = getHashQueryParam('track');
        if (!id) return;
        feedState.sharedTrackPlayed = true;
        if (typeof playTrack === 'function') {
            playTrack(String(id));
        }
    } catch (_) {
    }
}

// Clean up stories older than 1 month
async function cleanupOldStories() {
    try {
        const token = getAuthToken();
        if (!token) return;
        
        // Get all tracks to check for stories older than 1 month
        const tracks = await apiFetchJson('/tracks/new?limit=1000&offset=0', {}, d => Array.isArray(d));
        if (!Array.isArray(tracks)) return;
        
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
        
        const oldTracks = tracks.filter(track => {
            if (!track.created_at) return false;
            const trackDate = new Date(track.created_at);
            return trackDate < oneMonthAgo;
        });
        
        // Delete old tracks (stories)
        for (const track of oldTracks) {
            try {
                await apiFetchJson(`/tracks/${encodeURIComponent(String(track.id))}`, {
                    method: 'DELETE',
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                });
            } catch (e) {
                console.warn('Failed to delete old story track:', track.id, e);
            }
        }
        
        if (oldTracks.length > 0) {
            console.log(`Cleaned up ${oldTracks.length} old story tracks`);
        }
    } catch (e) {
        console.warn('Story cleanup failed:', e);
    }
}

async function renderStoriesBar() {
    try {
        const feedContainer = document.querySelector('.feed-container');
        if (!feedContainer || feedState.storiesLoaded) return;
        
        // Clean up stories older than 1 month
        await cleanupOldStories();
        
        let storiesBar = feedContainer.querySelector('.stories-bar');
        if (!storiesBar) {
            storiesBar = document.createElement('div');
            storiesBar.className = 'stories-bar';
            const title = feedContainer.querySelector('.feed-title');
            var isMobile = false;
            try {
                isMobile = !!(window.matchMedia && window.matchMedia('(max-width: 768px)').matches);
            } catch (_) {
                isMobile = false;
            }
            if (isMobile) {
                feedContainer.insertAdjacentElement('afterbegin', storiesBar);
            } else if (title) {
                title.insertAdjacentElement('afterend', storiesBar);
            } else {
                feedContainer.insertAdjacentElement('afterbegin', storiesBar);
            }
        }
        
        const tracks = await apiFetchJson('/tracks/new?limit=40&offset=0', {}, d => Array.isArray(d));
        const uploaders = new Map();

        (tracks || []).forEach(t => {
            if (!t || !t.uploader_id || !t.uploader_username) return;
            var key = String(t.uploader_id);
            if (!uploaders.has(key)) {
                uploaders.set(key, {
                    id: t.uploader_id,
                    username: t.uploader_username,
                    avatar: t.cover_image_url || null,
                    hasNew: false,
                    tracks: []
                });
            }
            try {
                uploaders.get(key).tracks.push(t);
            } catch (_) {
            }
        });

        // Sort tracks per uploader by created_at desc, and uploaders by latest track
        var uploaderArr = Array.from(uploaders.values());
        uploaderArr.forEach(function (u) {
            try {
                u.tracks = (u.tracks || []).slice().sort(function (a, b) {
                    var da = parseTrackDate(a);
                    var db = parseTrackDate(b);
                    var ta = da ? da.getTime() : 0;
                    var tb = db ? db.getTime() : 0;
                    return tb - ta;
                });
            } catch (_) {
            }
        });
        uploaderArr.sort(function (a, b) {
            try {
                var ta = (a && a.tracks && a.tracks[0]) ? (parseTrackDate(a.tracks[0]) || new Date(0)).getTime() : 0;
                var tb = (b && b.tracks && b.tracks[0]) ? (parseTrackDate(b.tracks[0]) || new Date(0)).getTime() : 0;
                return tb - ta;
            } catch (_) {
                return 0;
            }
        });
        
        if (uploaders.size === 0) {
            storiesBar.style.display = 'none';
            return;
        }

        // Mark as "new" if latest upload is within last 24h
        try {
            var nowTs = Date.now();
            uploaderArr.forEach(function (u) {
                try {
                    var latest = (u && u.tracks && u.tracks[0]) ? parseTrackDate(u.tracks[0]) : null;
                    var ts = latest ? latest.getTime() : 0;
                    u.hasNew = !!(ts && (nowTs - ts) < (24 * 60 * 60 * 1000));
                } catch (_) {
                    u.hasNew = false;
                }
            });
        } catch (_) {
        }
        
        function openStoriesTrayForTrack(track) {
            try {
                if (!track) return;
                
                // Open YouTube-sized media viewer with the single track
                openTrackMediaViewer([track], track.id);
            } catch (_) {
                console.error('Failed to open media viewer for track:', _);
            }
        }
        
        function openCommentsModal(trackId, trackTitle) {
            try {
                if (!trackId) return;
                
                // Remove existing modal if present
                var existingModal = document.getElementById('jukeCommentsModalRoot');
                if (existingModal && existingModal.parentNode) {
                    existingModal.parentNode.removeChild(existingModal);
                }
                
                // Create modal container
                var modalRoot = document.createElement('div');
                modalRoot.id = 'jukeCommentsModalRoot';
                modalRoot.className = 'juke-comments-modal-root';
                
                modalRoot.innerHTML = '' +
                    '<div class="juke-comments-modal-backdrop" data-juke-comments-close="1"></div>' +
                    '<div class="juke-comments-modal-sheet">' +
                    '  <div class="juke-comments-modal-header">' +
                    '    <div class="juke-comments-modal-title">Comments - ' + (trackTitle || 'Track') + '</div>' +
                    '    <button type="button" class="juke-comments-modal-close" data-juke-comments-close="1" aria-label="Close">' +
                    '      <i class="fas fa-times"></i>' +
                    '    </button>' +
                    '  </div>' +
                    '  <div class="juke-comments-modal-content" id="jukeCommentsModalContent">' +
                    '    <div class="juke-comments-modal-empty">Loading comments...</div>' +
                    '  </div>' +
                    '  <div class="juke-comments-modal-compose">' +
                    '    <input type="text" class="juke-comments-modal-input" placeholder="Add a comment…" data-track-id="' + trackId + '">' +
                    '    <button type="button" class="juke-comments-modal-send" data-track-id="' + trackId + '">Post</button>' +
                    '  </div>' +
                    '</div>';
                
                document.body.appendChild(modalRoot);
                
                // Load comments
                loadCommentsForTrack(trackId);
                
                // Setup event listeners
                setupCommentsModalListeners(modalRoot, trackId);
                
                // Open modal with animation
                requestAnimationFrame(function() {
                    modalRoot.classList.add('open');
                });
                
            } catch (_) {
                console.error('Failed to open comments modal:', _);
            }
        }
        
        function loadCommentsForTrack(trackId) {
            try {
                var token = getAuthToken();
                if (!token) {
                    showCommentsError('Please login to view comments');
                    return;
                }
                
                apiFetchJson('/comments/track/' + encodeURIComponent(String(trackId)), {
                    headers: { Authorization: 'Bearer ' + token }
                }).then(function(comments) {
                    displayCommentsInModal(comments || []);
                }).catch(function(err) {
                    console.error('Failed to load comments:', err);
                    showCommentsError('Failed to load comments');
                });
                
            } catch (_) {
                showCommentsError('Failed to load comments');
            }
        }
        
        function displayCommentsInModal(comments) {
            try {
                var contentEl = document.getElementById('jukeCommentsModalContent');
                if (!contentEl) return;
                
                if (!Array.isArray(comments) || comments.length === 0) {
                    contentEl.innerHTML = '<div class="juke-comments-modal-empty">No comments yet. Be the first to comment!</div>';
                    return;
                }
                
                var commentsHtml = '';
                comments.forEach(function(comment) {
                    var safeUsername = (comment.username || 'Anonymous').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    var safeText = (comment.text || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    var timeAgo = formatCommentTime(comment.created_at);
                    
                    commentsHtml += '' +
                        '<div class="juke-comments-modal-comment">' +
                        '  <div class="juke-comments-modal-avatar">' +
                        '    <img src="' + resolveAssetUrl(comment.avatar_url, '../images/default-avatar.png') + '" alt="' + safeUsername + '">' +
                        '  </div>' +
                        '  <div class="juke-comments-modal-content-wrapper">' +
                        '    <div class="juke-comments-modal-username">' + safeUsername + '</div>' +
                        '    <div class="juke-comments-modal-text">' + safeText + '</div>' +
                        '    <div class="juke-comments-modal-time">' + timeAgo + '</div>' +
                        '  </div>' +
                        '</div>';
                });
                
                contentEl.innerHTML = commentsHtml;
                
            } catch (_) {
                showCommentsError('Failed to display comments');
            }
        }
        
        function showCommentsError(message) {
            try {
                var contentEl = document.getElementById('jukeCommentsModalContent');
                if (contentEl) {
                    contentEl.innerHTML = '<div class="juke-comments-modal-empty">' + (message || 'An error occurred') + '</div>';
                }
            } catch (_) {}
        }
        
        function setupCommentsModalListeners(modalRoot, trackId) {
            try {
                // Close modal listeners
                var closeEls = modalRoot.querySelectorAll('[data-juke-comments-close="1"]');
                closeEls.forEach(function(el) {
                    el.addEventListener('click', closeCommentsModal);
                });
                
                // Backdrop click to close
                var backdrop = modalRoot.querySelector('.juke-comments-modal-backdrop');
                if (backdrop) {
                    backdrop.addEventListener('click', function(e) {
                        if (e.target === backdrop) {
                            closeCommentsModal();
                        }
                    });
                }
                
                // Send comment listener
                var sendBtn = modalRoot.querySelector('.juke-comments-modal-send[data-track-id="' + trackId + '"]');
                var input = modalRoot.querySelector('.juke-comments-modal-input[data-track-id="' + trackId + '"]');
                
                if (sendBtn && input) {
                    var sendComment = function() {
                        var text = String(input.value || '').trim();
                        if (!text) return;
                        
                        var token = getAuthToken();
                        if (!token) {
                            alert('Please login to post comments');
                            return;
                        }
                        
                        sendBtn.disabled = true;
                        sendBtn.textContent = 'Posting...';
                        
                        apiFetchJson('/comments', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': 'Bearer ' + token
                            },
                            body: JSON.stringify({
                                track_id: trackId,
                                text: text
                            })
                        }).then(function(newComment) {
                            input.value = '';
                            loadCommentsForTrack(trackId); // Reload comments
                        }).catch(function(err) {
                            console.error('Failed to post comment:', err);
                            alert('Failed to post comment');
                        }).finally(function() {
                            sendBtn.disabled = false;
                            sendBtn.textContent = 'Post';
                        });
                    };
                    
                    sendBtn.addEventListener('click', sendComment);
                    input.addEventListener('keypress', function(e) {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            sendComment();
                        }
                    });
                }
                
                // ESC key to close
                var escHandler = function(e) {
                    if (e.key === 'Escape') {
                        closeCommentsModal();
                        document.removeEventListener('keydown', escHandler);
                    }
                };
                document.addEventListener('keydown', escHandler);
                
            } catch (_) {
                console.error('Failed to setup comments modal listeners:', _);
            }
        }
        
        function closeCommentsModal() {
            try {
                var modalRoot = document.getElementById('jukeCommentsModalRoot');
                if (modalRoot) {
                    modalRoot.classList.remove('open');
                    setTimeout(function() {
                        if (modalRoot.parentNode) {
                            modalRoot.parentNode.removeChild(modalRoot);
                        }
                    }, 300);
                }
            } catch (_) {}
        }
        
        function formatCommentTime(dateStr) {
            try {
                if (!dateStr) return '';
                var date = new Date(dateStr);
                var now = new Date();
                var diffMs = now - date;
                var diffMins = Math.floor(diffMs / 60000);
                var diffHours = Math.floor(diffMs / 3600000);
                var diffDays = Math.floor(diffMs / 86400000);
                
                if (diffMins < 1) return 'just now';
                if (diffMins < 60) return diffMins + 'm ago';
                if (diffHours < 24) return diffHours + 'h ago';
                if (diffDays < 7) return diffDays + 'd ago';
                return date.toLocaleDateString();
            } catch (_) {
                return '';
            }
        }
        
        function openStoriesTray(u) {
            try {
                if (!u) return;
                var existing = document.getElementById('jukeStoriesTrayRoot');
                if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

                var root = document.createElement('div');
                root.id = 'jukeStoriesTrayRoot';
                root.className = 'juke-stories-tray-root';

                function buildListHtml(tracksArr) {
                    var listHtml = '';
                    (tracksArr || []).slice(0, 20).forEach(function (t) {
                        var cover = resolveAssetUrl(t.cover_image_url, resolveLocalAssetUrl('images/juke.png'));
                        var safeTitle = t && t.title ? String(t.title) : 'Untitled';
                        var safeArtist = (t && (t.artist_name || t.uploader_username)) ? String(t.artist_name || t.uploader_username) : '';
                        var dateTxt = formatTrackDateShort(t);
                        listHtml += '' +
                            '<div class="juke-story-track" role="button" tabindex="0" data-track-id="' + String(t.id) + '">' +
                            '  <img class="juke-story-track-cover" src="' + cover + '" alt="">' +
                            '  <div class="juke-story-track-meta">' +
                            '    <div class="juke-story-track-title">' + safeTitle.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</div>' +
                            '    <div class="juke-story-track-sub">' +
                            '      <span class="juke-story-track-artist">' + safeArtist.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</span>' +
                            (dateTxt ? ('<span class="juke-story-track-date">' + dateTxt.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</span>') : '') +
                            '    </div>' +
                            '  </div>' +
                            '  <button type="button" class="juke-story-track-share" data-share-track-id="' + String(t.id) + '" aria-label="Share"><i class="far fa-paper-plane"></i></button>' +
                            '</div>';
                    });
                    return listHtml || '<div class="empty-state">No recent tracks</div>';
                }

                var title = u.username ? ('@' + String(u.username)) : 'Stories';
                var listHtml = buildListHtml(u.tracks || []);

                root.innerHTML = '' +
                    '<div class="juke-stories-tray-backdrop" data-juke-stories-close="1"></div>' +
                    '<div class="juke-stories-tray-sheet" role="dialog" aria-modal="true">' +
                    '  <div class="juke-stories-tray-header">' +
                    '    <div class="juke-stories-tray-title">' + title.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</div>' +
                    '    <button type="button" class="juke-stories-tray-close" data-juke-stories-close="1" aria-label="Close">' +
                    '      <i class="fas fa-times"></i>' +
                    '    </button>' +
                    '  </div>' +
                    '  <div class="juke-stories-tray-media juke-story-split"></div>' +
                    '  <div class="juke-stories-tray-list">' + listHtml + '</div>' +
                    '</div>';

                document.body.appendChild(root);

                try {
                    requestAnimationFrame(function () {
                        try {
                            root.classList.add('open');
                        } catch (_) {
                        }
                    });
                } catch (_) {
                }

                var activeTrackId = null;

                function getActiveIndex() {
                    try {
                        if (!u || !Array.isArray(u.tracks) || !activeTrackId) return -1;
                        var idStr = String(activeTrackId);
                        return (u.tracks || []).findIndex(function (x) { return x && String(x.id) === idStr; });
                    } catch (_) {
                        return -1;
                    }
                }

                function playStoryTrack(trackObj) {
                    try {
                        if (!trackObj) return;
                        if (window.JukePlayer && typeof window.JukePlayer.playTrack === 'function') {
                            window.JukePlayer.playTrack(trackObj, { autoShowVideo: !!trackObj.video_url });
                            return;
                        }
                        if (trackObj && trackObj.id && typeof playTrack === 'function') {
                            playTrack(String(trackObj.id));
                        }
                    } catch (_) {
                    }
                }

                function goToIndex(nextIndex) {
                    try {
                        if (!u || !Array.isArray(u.tracks)) return;
                        var idx = Number(nextIndex);
                        if (!isFinite(idx)) return;
                        if (idx < 0 || idx >= (u.tracks || []).length) return;
                        var t = (u.tracks || [])[idx];
                        if (!t) return;
                        setActiveTrack(t);
                        playStoryTrack(t);
                    } catch (_) {
                    }
                }

                function findTrackById(trackId) {
                    try {
                        var idStr = String(trackId);
                        return (u && u.tracks && Array.isArray(u.tracks)) ? (u.tracks || []).find(function (x) { return x && String(x.id) === idStr; }) : null;
                    } catch (_) {
                        return null;
                    }
                }

                function setActiveTrack(track) {
                    try {
                        if (!track || !track.id) return;
                        activeTrackId = String(track.id);

                        try {
                            root.querySelectorAll('.juke-story-track[data-track-id]').forEach(function (el) {
                                try {
                                    el.classList.toggle('active', String(el.getAttribute('data-track-id')) === activeTrackId);
                                } catch (_) {
                                }
                            });
                        } catch (_) {
                        }

                        var mediaHost = null;
                        try {
                            mediaHost = root.querySelector('.juke-stories-tray-media');
                        } catch (_) {
                            mediaHost = null;
                        }
                        if (!mediaHost) return;

                        var commentsWereOpen = false;
                        try {
                            commentsWereOpen = !!(mediaHost.classList && mediaHost.classList.contains('comments-open'));
                        } catch (_) {
                            commentsWereOpen = false;
                        }

                        var cover = resolveAssetUrl(track.cover_image_url, resolveLocalAssetUrl('images/juke.png'));
                        var safeTitle = track && track.title ? String(track.title) : 'Untitled';
                        var safeArtist = (track && (track.artist_name || track.uploader_username)) ? String(track.artist_name || track.uploader_username) : '';
                        var dateTxt = formatTrackDateShort(track);
                        var videoUrl = track && track.video_url ? resolveAssetUrl(track.video_url, '') : '';

                        var idx = -1;
                        try {
                            idx = getActiveIndex();
                        } catch (_) {
                            idx = -1;
                        }
                        var hasPrev = !!(idx > 0);
                        var hasNext = !!(idx >= 0 && u && u.tracks && (idx < (u.tracks.length - 1)));

                        var mediaEl = '';
                        if (videoUrl) {
                            mediaEl = '<video src="' + String(videoUrl).replace(/</g, '&lt;').replace(/>/g, '&gt;') + '" playsinline muted autoplay loop></video>';
                        } else {
                            mediaEl = '<img src="' + String(cover).replace(/</g, '&lt;').replace(/>/g, '&gt;') + '" alt="">';
                        }

                        var liked = false;
                        try {
                            liked = likedTrackIds.has(String(track.id));
                        } catch (_) {
                            liked = false;
                        }

                        var likeCount = 0;
                        try {
                            likeCount = (typeof track.like_count === 'number') ? track.like_count : 0;
                        } catch (_) {
                            likeCount = 0;
                        }
                        var likeCountTxt = (liked || likeCount > 0) ? String(likeCount) : '';

                        mediaHost.innerHTML = '' +
                            '<div class="juke-story-left">' +
                            '  <div class="juke-story-media-layout">' +
                            '    <button type="button" class="juke-story-side juke-story-side-prev" data-juke-story-nav="prev" aria-label="Previous"' + (hasPrev ? '' : ' disabled') + '><i class="fas fa-chevron-left"></i></button>' +
                            '    <div class="juke-story-media-frame">' + mediaEl + '</div>' +
                            '    <button type="button" class="juke-story-side juke-story-side-next" data-juke-story-nav="next" aria-label="Next"' + (hasNext ? '' : ' disabled') + '><i class="fas fa-chevron-right"></i></button>' +
                            '  </div>' +
                            '  <div class="juke-story-actions">' +
                            '    <button class="post-action like-btn ' + (liked ? 'liked' : '') + '" data-track-id="' + String(track.id) + '" type="button" aria-label="Like">' +
                            '      <i class="' + (liked ? 'fas' : 'far') + ' fa-heart"></i>' +
                            '      <span class="like-count" data-track-id="' + String(track.id) + '">' + likeCountTxt.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</span>' +
                            '    </button>' +
                            '    <button class="post-action" type="button" aria-label="Comments" data-juke-story-comments-toggle="1" data-track-id="' + String(track.id) + '">' +
                            '      <i class="far fa-comment"></i>' +
                            '    </button>' +
                            '    <button class="post-action" type="button" aria-label="Share" data-share-track-id="' + String(track.id) + '">' +
                            '      <i class="far fa-paper-plane"></i>' +
                            '    </button>' +
                            '  </div>' +
                            '  <div class="juke-story-media-meta">' +
                            '    <div style="min-width:0;flex:1;">' +
                            '      <div class="juke-story-media-title">' + safeTitle.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</div>' +
                            '      <div class="juke-story-media-sub">' + safeArtist.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</div>' +
                            '    </div>' +
                            (dateTxt ? ('<div class="juke-story-media-date">' + dateTxt.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</div>') : '') +
                            '  </div>' +
                            '</div>' +
                            '<div class="juke-story-right">' +
                            '  <div class="juke-story-comments">' +
                            '    <div class="post-comments-title">Comments</div>' +
                            '    <div class="post-comments-list" data-track-id="' + String(track.id) + '"></div>' +
                            '    <div class="post-comment-compose">' +
                            '      <input type="text" class="post-comment-input" placeholder="Add a comment…" data-track-id="' + String(track.id) + '">' +
                            '      <button type="button" class="post-comment-send" data-track-id="' + String(track.id) + '">Post</button>' +
                            '    </div>' +
                            '  </div>' +
                            '</div>';

                        try {
                            if (mediaHost.classList) mediaHost.classList.add('comments-open');
                            var listElAuto = mediaHost.querySelector('.post-comments-list[data-track-id]');
                            var tidAuto = listElAuto ? listElAuto.getAttribute('data-track-id') : null;
                            if (tidAuto) loadAndRenderTrackComments(tidAuto, listElAuto);
                        } catch (_) {
                        }

                        try {
                            var v = mediaHost.querySelector('video');
                            if (v && typeof v.play === 'function') {
                                v.play().catch(function () { });
                            }
                        } catch (_) {
                        }
                    } catch (_) {
                    }
                }

                try {
                    var initial = (u && u.tracks && u.tracks[0]) ? u.tracks[0] : null;
                    if (initial) {
                        setActiveTrack(initial);
                        playStoryTrack(initial);
                    }
                } catch (_) {
                }

                function close() {
                    try {
                        if (!root) return;
                        try {
                            root.classList.remove('open');
                        } catch (_) {
                        }
                        try {
                            root.classList.add('closing');
                        } catch (_) {
                        }

                        var removed = false;
                        function finalize() {
                            if (removed) return;
                            removed = true;
                            try {
                                if (root && root.parentNode) root.parentNode.removeChild(root);
                            } catch (_) {
                            }
                        }

                        try {
                            var sheet = root.querySelector('.juke-stories-tray-sheet');
                            if (sheet) {
                                sheet.addEventListener('transitionend', finalize, { once: true });
                                setTimeout(finalize, 350);
                                return;
                            }
                        } catch (_) {
                        }

                        finalize();
                    } catch (_) {
                    }
                }

                // Fetch full recent tracks for that user when authenticated
                (async function () {
                    try {
                        var token = getAuthToken();
                        if (!token || !u || !u.id) return;
                        var listEl = root.querySelector('.juke-stories-tray-list');
                        if (listEl) listEl.innerHTML = '<div class="empty-state">Loading...</div>';
                        var userTracks = await apiFetchJson('/tracks/user/' + encodeURIComponent(String(u.id)), {
                            headers: { Authorization: 'Bearer ' + token }
                        }, function (d) { return Array.isArray(d); });
                        try {
                            userTracks = (userTracks || []).slice().sort(function (a, b) {
                                var da = parseTrackDate(a);
                                var db = parseTrackDate(b);
                                var ta = da ? da.getTime() : 0;
                                var tb = db ? db.getTime() : 0;
                                return tb - ta;
                            });
                        } catch (_) {
                        }
                        if (listEl) listEl.innerHTML = buildListHtml(userTracks);
                        try {
                            u.tracks = userTracks;
                        } catch (_) {
                        }

                        try {
                            var nextActive = null;
                            if (activeTrackId) nextActive = findTrackById(activeTrackId);
                            if (!nextActive && userTracks && userTracks[0]) nextActive = userTracks[0];
                            if (nextActive) setActiveTrack(nextActive);
                        } catch (_) {
                        }
                    } catch (_) {
                        try {
                            var listEl2 = root.querySelector('.juke-stories-tray-list');
                            if (listEl2) listEl2.innerHTML = buildListHtml(u.tracks || []);
                        } catch (_) {
                        }
                    }
                })();

                // Swipe-down to close
                try {
                    var sheetEl = root.querySelector('.juke-stories-tray-sheet');
                    var headerEl = root.querySelector('.juke-stories-tray-header');
                    var dragEl = headerEl || sheetEl;
                    if (sheetEl && dragEl) {
                        var startY = 0;
                        var dragging = false;
                        dragEl.addEventListener('touchstart', function (e) {
                            try {
                                if (!e || !e.touches || !e.touches[0]) return;
                                dragging = true;
                                startY = e.touches[0].clientY;
                            } catch (_) {
                            }
                        }, { passive: true });

                        dragEl.addEventListener('touchmove', function (e) {
                            try {
                                if (!dragging || !e || !e.touches || !e.touches[0]) return;
                                var dy = e.touches[0].clientY - startY;
                                if (dy < 0) dy = 0;
                                sheetEl.style.transform = 'translate(-50%, ' + dy + 'px)';
                            } catch (_) {
                            }
                        }, { passive: true });

                        dragEl.addEventListener('touchend', function () {
                            try {
                                if (!dragging) return;
                                dragging = false;
                                var m = sheetEl.style.transform || '';
                                var match = m.match(/,\s*([0-9.]+)px\)/);
                                var dy = match ? parseFloat(match[1]) : 0;
                                if (dy > 90) {
                                    close();
                                    return;
                                }
                                sheetEl.style.transform = '';
                            } catch (_) {
                            }
                        });
                    }
                } catch (_) {
                }

                root.addEventListener('click', function (e) {
                    var target = e && e.target ? e.target : null;
                    if (!target) return;

                    var likeBtn = null;
                    try {
                        likeBtn = target.closest ? target.closest('.like-btn[data-track-id]') : null;
                    } catch (_) {
                        likeBtn = null;
                    }
                    if (likeBtn) {
                        try {
                            if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
                        } catch (_) {
                        }
                        var lid = likeBtn.getAttribute('data-track-id');
                        if (lid) {
                            try {
                                likeTrack(String(lid));
                            } catch (_) {
                            }
                        }
                        return;
                    }

                    var navBtn = null;
                    try {
                        navBtn = target.closest ? target.closest('[data-juke-story-nav]') : null;
                    } catch (_) {
                        navBtn = null;
                    }
                    if (navBtn) {
                        try {
                            if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
                        } catch (_) {
                        }
                        try {
                            if (navBtn.disabled) return;
                        } catch (_) {
                        }
                        var dir = null;
                        try {
                            dir = navBtn.getAttribute('data-juke-story-nav');
                        } catch (_) {
                            dir = null;
                        }
                        var curIdx = -1;
                        try {
                            curIdx = getActiveIndex();
                        } catch (_) {
                            curIdx = -1;
                        }
                        if (dir === 'prev') {
                            goToIndex(curIdx - 1);
                            return;
                        }
                        if (dir === 'next') {
                            goToIndex(curIdx + 1);
                            return;
                        }
                    }

                    var storyCommentToggle = null;
                    try {
                        storyCommentToggle = target.closest ? target.closest('[data-juke-story-comments-toggle="1"]') : null;
                    } catch (_) {
                        storyCommentToggle = null;
                    }
                    if (storyCommentToggle) {
                        try {
                            if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
                        } catch (_) {
                        }
                        
                        // Get track ID from the comment toggle button or nearby elements
                        var trackId = storyCommentToggle.getAttribute('data-track-id');
                        if (!trackId) {
                            // Try to find track ID from parent elements
                            var trackEl = storyCommentToggle.closest('[data-track-id]');
                            if (trackEl) {
                                trackId = trackEl.getAttribute('data-track-id');
                            }
                        }
                        
                        // Get track title for the modal
                        var trackTitle = '';
                        try {
                            var titleEl = root.querySelector('.juke-story-media-title');
                            if (titleEl) trackTitle = titleEl.textContent || '';
                        } catch (_) {}
                        
                        // Open comments modal instead of inline comments
                        if (trackId && typeof openCommentsModal === 'function') {
                            openCommentsModal(trackId, trackTitle);
                        }
                        return;
                    }

                    var storySend = null;
                    try {
                        storySend = target.closest ? target.closest('.post-comment-send[data-track-id]') : null;
                    } catch (_) {
                        storySend = null;
                    }
                    if (storySend) {
                        try {
                            if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
                        } catch (_) {
                        }
                        var tid2 = storySend.getAttribute('data-track-id');
                        if (!tid2) return;
                        try {
                            var host2 = root.querySelector('.juke-stories-tray-media');
                            var input2 = host2 ? host2.querySelector('.post-comment-input[data-track-id="' + String(tid2) + '"]') : null;
                            var list2 = host2 ? host2.querySelector('.post-comments-list[data-track-id="' + String(tid2) + '"]') : null;
                            var txt2 = input2 ? String(input2.value || '').trim() : '';
                            if (!txt2) return;
                            if (input2) input2.value = '';
                            createTrackComment(tid2, txt2).then(function () {
                                loadAndRenderTrackComments(tid2, list2);
                            });
                        } catch (_) {
                        }
                        return;
                    }

                    try {
                        if (target.getAttribute && target.getAttribute('data-juke-stories-close') === '1') {
                            close();
                            return;
                        }
                    } catch (_) {
                    }

                    var shareBtn2 = null;
                    try {
                        shareBtn2 = target.closest ? target.closest('[data-share-track-id]') : null;
                    } catch (_) {
                        shareBtn2 = null;
                    }
                    if (shareBtn2) {
                        try {
                            if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
                        } catch (_) {
                        }
                        var sid = null;
                        try {
                            sid = shareBtn2.getAttribute('data-share-track-id');
                        } catch (_) {
                            sid = null;
                        }
                        if (sid && typeof window.shareTrackById === 'function') {
                            try {
                                var tt = (u.tracks || []).find(function (x) { return String(x.id) === String(sid); });
                                window.shareTrackById(String(sid), { title: tt && tt.title ? tt.title : '', text: tt && (tt.artist_name || tt.uploader_username) ? (tt.artist_name || tt.uploader_username) : '' });
                            } catch (_) {
                            }
                        }
                        return;
                    }

                    var shareBtn = null;
                    try {
                        shareBtn = target.closest ? target.closest('.juke-story-track-share[data-share-track-id]') : null;
                    } catch (_) {
                        shareBtn = null;
                    }
                    if (shareBtn) {
                        try {
                            if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
                        } catch (_) {
                        }
                        var sid = shareBtn.getAttribute('data-share-track-id');
                        if (sid && typeof window.shareTrackById === 'function') {
                            try {
                                var tt = (u.tracks || []).find(function (x) { return String(x.id) === String(sid); });
                                window.shareTrackById(String(sid), { title: tt && tt.title ? tt.title : '', text: tt && (tt.artist_name || tt.uploader_username) ? (tt.artist_name || tt.uploader_username) : '' });
                            } catch (_) {
                            }
                        }
                        return;
                    }

                    var trackBtn = null;
                    try {
                        trackBtn = target.closest ? target.closest('.juke-story-track[data-track-id]') : null;
                    } catch (_) {
                        trackBtn = null;
                    }
                    if (trackBtn) {
                        var tid = trackBtn.getAttribute('data-track-id');
                        if (tid) {
                            try {
                                var tt2 = findTrackById(tid);
                                if (tt2) setActiveTrack(tt2);
                            } catch (_) {
                            }
                            try {
                                var trackObj = null;
                                try {
                                    trackObj = tt2 || findTrackById(tid);
                                } catch (_) {
                                    trackObj = null;
                                }
                                if (trackObj) {
                                    playStoryTrack(trackObj);
                                } else {
                                    playStoryTrack({ id: tid });
                                }
                            } catch (_) {
                            }
                        }
                    }
                });

                try {
                    root.addEventListener('keydown', function (e) {
                        var t = e && e.target ? e.target : null;
                        if (!t) return;
                        if (t.classList && t.classList.contains('post-comment-input')) {
                            if (e.key === 'Enter') {
                                try {
                                    var id = t.getAttribute('data-track-id');
                                    var send = id ? root.querySelector('.post-comment-send[data-track-id="' + String(id) + '"]') : null;
                                    if (send) send.click();
                                } catch (_) {
                                }
                            }
                        }
                    });
                } catch (_) {
                }
            } catch (_) {
            }
        }

        storiesBar.innerHTML = '';

        // "Your story" bubble first (upload shortcut)
        try {
            var cu = null;
            try {
                if (typeof getCurrentUser === 'function') cu = getCurrentUser();
            } catch (_) {
                cu = null;
            }
            var myUsername = (cu && cu.username) ? String(cu.username) : '';
            if (myUsername) {
                const your = document.createElement('div');
                your.className = 'story-item';
                your.innerHTML = `
                    <div class="story-avatar your-story">
                        <img src="${resolveAssetUrl(null, resolveLocalAssetUrl('images/juke.png'))}" alt="${myUsername}">
                        <div class="story-plus-badge">+</div>
                    </div>
                    <div class="story-username">Your story</div>
                `;
                your.addEventListener('click', function () {
                    try {
                        if (isSpaMode()) {
                            window.location.hash = '#/upload';
                        } else {
                            window.location.href = 'upload.html';
                        }
                    } catch (_) {
                    }
                });
                storiesBar.appendChild(your);
            }
        } catch (_) {
        }

        uploaderArr.forEach(function (u) {
            const item = document.createElement('div');
            item.className = 'story-item';
            item.innerHTML = `
                <div class="story-avatar ${u.hasNew ? '' : 'no-story'}">
                    <img src="${resolveAssetUrl(u.avatar, resolveLocalAssetUrl('images/juke.png'))}" alt="${u.username}">
                </div>
                <div class="story-username">${u.username}</div>
            `;
            item.addEventListener('click', () => {
                // Open YouTube-sized media viewer with story tracks
                console.log('Story avatar clicked, opening media viewer with tracks:', u.tracks ? u.tracks.length : 0);
                if (u.tracks && u.tracks.length > 0) {
                    openTrackMediaViewer(u.tracks, u.tracks[0].id);
                }
            });
            
            // Also add touch event listener for mobile
            item.addEventListener('touchend', (e) => {
                e.preventDefault();
                console.log('Story avatar touchend, opening media viewer with tracks:', u.tracks ? u.tracks.length : 0);
                if (u.tracks && u.tracks.length > 0) {
                    openTrackMediaViewer(u.tracks, u.tracks[0].id);
                }
            });
            storiesBar.appendChild(item);
        });
        
        feedState.storiesLoaded = true;
    } catch (e) {
        console.error('Stories bar failed:', e);
    }
}

async function loadFeedStream(reset) {
    // Always enforce feed route guard (even if SPA detection is incorrect).
    try {
        var baseHash = String(window.location.hash || '');
        baseHash = baseHash ? baseHash.split('?')[0] : '';
        if (baseHash !== '#/feed') {
            return;
        }
    } catch (_) {
    }

    const appRoot = document.getElementById('app');
    const grid = document.getElementById('feedGrid') || (appRoot ? appRoot.querySelector('.music-grid') : null);
    if (!grid) {
        return;
    }

    if (reset) {
        // Prevent multiple simultaneous resets
        if (feedState.loading && feedState.offset === 0) {
            return;
        }

        feedState.offset = 0;
        feedState.done = false;
        feedState.storiesLoaded = false;
        feedState.trackIds = [];
        feedState.queueTracks = [];
        feedState.sharedTrackPlayed = false;
        grid.innerHTML = '';
        renderStoriesBar();
    }

    if (feedState.loading || feedState.done) {
        return;
    }
    feedState.loading = true;

    try {
        await loadLikedTrackIds();
    } catch (_) {
    }

    try {
        const tracks = await apiFetchJson('/tracks/new?limit=' + feedState.limit + '&offset=' + feedState.offset, {}, function (d) {
            return Array.isArray(d);
        });

        if (!Array.isArray(tracks) || tracks.length === 0) {
            feedState.done = true;
            return;
        }

        tracks.forEach(function (t) {
            grid.appendChild(createFeedPostCard(t));
            try {
                if (t && t.id != null) {
                    var idStr = String(t.id);
                    if (feedState.trackIds.indexOf(idStr) === -1) {
                        feedState.trackIds.push(idStr);
                        feedState.queueTracks.push(t);
                    }
                }
            } catch (_) {
            }
        });

        // Update contextual queue for prev/next
        try {
            if (window.JukePlayer && typeof window.JukePlayer.setTrackList === 'function') {
                window.JukePlayer.setTrackList(feedState.trackIds.slice());
            }
        } catch (_) {
        }

        try {
            if (window.JukePlayer && typeof window.JukePlayer.setQueueTracks === 'function') {
                window.JukePlayer.setQueueTracks(feedState.queueTracks.slice());
            }
        } catch (_) {
        }

        // If user opened a shared link like #/feed?track=123, auto-play it once
        maybeAutoPlaySharedTrack();

        feedState.offset += tracks.length;
    } catch (e) {
        console.error('Feed stream load failed:', e);
    } finally {
        feedState.loading = false;
    }

    if (!feedState.bound) {
        feedState.bound = true;
        // Delay binding scroll listener to prevent immediate triggering
        setTimeout(() => {
            window.addEventListener('scroll', function () {
                try {
                    if (feedState.loading || feedState.done) return;

                    // Never load feed items if we're not on the feed route.
                    try {
                        var baseHash = String(window.location.hash || '');
                        baseHash = baseHash ? baseHash.split('?')[0] : '';
                        if (baseHash !== '#/feed') return;
                    } catch (_) {
                    }
                    
                    // Only allow scroll loading if we have some content already loaded
                    if (feedState.trackIds.length === 0) {
                        return;
                    }
                    
                    // Increased threshold from 900px to 1500px to prevent premature loading
                    var nearBottom = (window.innerHeight + window.scrollY) >= (document.body.offsetHeight - 1500);
                    if (nearBottom) {
                        loadFeedStream(false);
                    }
                } catch (_) {
                }
            });
        }, 1000); // 1 second delay
    }
}

function displayFeedTracks(tracks) {
    const appRoot = document.getElementById('app');
    const musicGrid = document.getElementById('feedGrid') || (appRoot ? appRoot.querySelector('.music-grid') : null);
    if (!musicGrid) {
        return;
    }

    musicGrid.innerHTML = '';

    // Set global track list for prev/next functionality
    try {
        if (window.JukePlayer && typeof window.JukePlayer.setTrackList === 'function') {
            const trackIds = tracks.map(t => String(t.id));
            window.JukePlayer.setTrackList(trackIds);
        }
    } catch (_) {}

    try {
        if (window.JukePlayer && typeof window.JukePlayer.setQueueTracks === 'function') {
            window.JukePlayer.setQueueTracks(tracks);
        }
    } catch (_) {}

    try {
        feedState.trackIds = Array.isArray(tracks) ? tracks.map(function (t) { return String(t.id); }) : [];
        feedState.queueTracks = Array.isArray(tracks) ? tracks.slice() : [];
    } catch (_) {
        feedState.trackIds = [];
        feedState.queueTracks = [];
    }

    tracks.forEach(track => {
        const trackCard = createFeedPostCard(track);
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

    // Set global track list for prev/next functionality
    try {
        if (window.JukePlayer && typeof window.JukePlayer.setTrackList === 'function') {
            const trackIds = tracks.map(t => String(t.id));
            window.JukePlayer.setTrackList(trackIds);
        }
    } catch (_) {}

    try {
        if (window.JukePlayer && typeof window.JukePlayer.setQueueTracks === 'function') {
            window.JukePlayer.setQueueTracks(tracks);
        }
    } catch (_) {}

    try {
        feedState.trackIds = Array.isArray(tracks) ? tracks.map(function (t) { return String(t.id); }) : [];
        feedState.queueTracks = Array.isArray(tracks) ? tracks.slice() : [];
    } catch (_) {
        feedState.trackIds = [];
        feedState.queueTracks = [];
    }

    tracks.forEach(track => {
        const card = createFeedPostCard(track);
        tracksGrid.appendChild(card);
    });
}

function createFeedPostCard(track) {
    const card = document.createElement('div');
    card.className = 'music-card';

    const coverUrl = resolveAssetUrl(track.cover_image_url, '../images/juke.png');
    const artistName = track.artist_name || track.uploader_username || 'Unknown Artist';
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
    const trackIdStr = String(track.id);
    const isLiked = likedTrackIds.has(trackIdStr);
    const canDelete = !!isAdmin || (!!currentUserId && !!uploaderId && String(uploaderId) === String(currentUserId));

    const safeTitle = (track && track.title) ? String(track.title) : '';
    const safeArtist = (artistName && typeof artistName === 'string') ? artistName : '';
    const uploadedShort = formatTrackDateShort(track);
    const coverMedia = `<img class="post-media" src="${coverUrl}" alt="${safeTitle}">`;
    const uploaderLine = (uploaderName && uploaderId && String(uploaderId) !== String(currentUserId || ''))
        ? `<a href="#/koleqtion/${uploaderId}" class="uploader-link">@${uploaderName}</a>`
        : (uploaderName ? `<span class="uploader-link">@${uploaderName}</span>` : '');
    const uploadedLine = uploadedShort ? `<span class="post-date">${uploadedShort}</span>` : '';

    card.innerHTML = `
        <div class="post-header">
            <div class="post-header-left">
                <div class="post-title">${safeTitle}</div>
                <div class="post-subtitle">${safeArtist}</div>
            </div>
            <div class="post-header-right">${uploaderLine}${uploadedLine}</div>
        </div>

        <div class="post-media-wrap" data-track-id="${track.id}">
            ${coverMedia}
            <i class="fas fa-heart double-tap-heart"></i>
            <button class="post-play" type="button" aria-label="Play" data-track-id="${track.id}">
                <i class="fas fa-play"></i>
            </button>
        </div>

        <div class="post-actions">
            <div class="post-actions-left">
                <button class="post-action like-btn ${isLiked ? 'liked' : ''}" data-track-id="${track.id}" type="button" aria-label="Like">
                    <i class="${isLiked ? 'fas' : 'far'} fa-heart"></i>
                    <span class="like-count" data-track-id="${track.id}">${(isLiked || (typeof track.like_count === 'number' && track.like_count > 0)) ? String(track.like_count || 0) : ''}</span>
                </button>
                <button class="post-action post-comment-toggle" type="button" aria-expanded="false" aria-label="Comments">
                    <i class="far fa-comment"></i>
                </button>
                <button class="post-action share-btn" type="button" aria-label="Share">
                    <i class="far fa-paper-plane"></i>
                </button>
                ${canDelete ? `
                <button class="post-action" type="button" onclick="deleteTrack('${track.id}', event);" aria-label="Delete track">
                    <i class="fas fa-trash"></i>
                </button>
                ` : ''}
            </div>
            <div class="post-actions-right">
                <button class="post-action save-btn" data-track-id="${track.id}" type="button" aria-label="Save">
                    <i class="far fa-bookmark"></i>
                </button>
            </div>
        </div>

        <div class="post-comments">
            <div class="post-comments-title">Comments</div>
            <div class="post-comments-list" data-track-id="${track.id}"></div>
            <div class="post-comment-compose">
                <input type="text" class="post-comment-input" placeholder="Add a comment…" data-track-id="${track.id}">
                <button type="button" class="post-comment-send" data-track-id="${track.id}">Post</button>
            </div>
        </div>
    `;

    try {
        const cover = card.querySelector('.post-media-wrap');
        const play = card.querySelector('.post-play');
        const likeBtn = card.querySelector('.like-btn');
        const saveBtn = card.querySelector('.save-btn');
        const shareBtn = card.querySelector('.share-btn');
        const heart = card.querySelector('.double-tap-heart');
        
        let lastTap = 0;
        if (cover && !cover.dataset.bound) {
            cover.dataset.bound = '1';
            cover.addEventListener('click', function (e) {
                try {
                    if (e && e.target && e.target.closest && e.target.closest('button')) return;
                } catch (_) {}
                
                const now = Date.now();
                if (now - lastTap < 300) {
                    if (heart) {
                        heart.classList.remove('animate');
                        void heart.offsetWidth;
                        heart.classList.add('animate');
                        setTimeout(() => heart.classList.remove('animate'), 800);
                    }
                    if (!likedTrackIds.has(trackIdStr)) {
                        likeTrack(trackIdStr);
                        // Immediately update UI for double-tap like
                        const isLiked = likedTrackIds.has(trackIdStr);
                        if (likeBtn) {
                            const icon = likeBtn.querySelector('i');
                            if (icon) {
                                icon.className = isLiked ? 'fas fa-heart' : 'far fa-heart';
                            }
                            likeBtn.classList.toggle('liked', isLiked);
                        }
                    }
                } else {
                    try {
                        // Open stories tray for this single track (like stories behavior)
                        openStoriesTrayForTrack(track);
                    } catch (_) {
                        // Fallback to original behavior
                        var list = (feedState && Array.isArray(feedState.queueTracks) && feedState.queueTracks.length) ? feedState.queueTracks : [track];
                        if (typeof window.openTrackMediaViewer === 'function') {
                            window.openTrackMediaViewer(list, String(track.id));
                        } else {
                            playTrack(String(track.id));
                        }
                    }
                }
                lastTap = now;
            });
        }
        
        if (play && !play.dataset.bound) {
            play.dataset.bound = '1';
            play.addEventListener('click', function (e) {
                e.stopPropagation();
                playTrack(String(track.id));
            });
        }
        
        if (likeBtn && !likeBtn.dataset.bound) {
            likeBtn.dataset.bound = '1';
            likeBtn.addEventListener('click', function () {
                likeTrack(trackIdStr);
                // Immediately update this like button UI
                const isLiked = likedTrackIds.has(trackIdStr);
                const icon = likeBtn.querySelector('i');
                if (icon) {
                    icon.className = isLiked ? 'fas fa-heart' : 'far fa-heart';
                }
                likeBtn.classList.toggle('liked', isLiked);
            });
        }
        
        if (saveBtn && !saveBtn.dataset.bound) {
            saveBtn.dataset.bound = '1';
            saveBtn.addEventListener('click', function () {
                saveBtn.classList.toggle('saved');
                const icon = saveBtn.querySelector('i');
                if (icon) {
                    icon.className = saveBtn.classList.contains('saved') ? 'fas fa-bookmark' : 'far fa-bookmark';
                }
                addToPlaylist(String(track.id));
            });
        }
        
        if (shareBtn && !shareBtn.dataset.bound) {
            shareBtn.dataset.bound = '1';
            shareBtn.addEventListener('click', function () {
                try {
                    if (typeof window.shareTrackById === 'function') {
                        window.shareTrackById(String(track.id), { title: track.title, text: track.artist_name });
                    }
                } catch (_) {
                }
            });
        }
        
        const toggle = card.querySelector('.post-comment-toggle');
        const comments = card.querySelector('.post-comments');
        const commentsList = card.querySelector('.post-comments-list[data-track-id]');
        if (toggle && comments && !toggle.dataset.bound) {
            toggle.dataset.bound = '1';
            toggle.addEventListener('click', function () {
                const open = card.classList.contains('comments-open');
                card.classList.toggle('comments-open', !open);
                toggle.setAttribute('aria-expanded', open ? 'false' : 'true');
                if (!open) {
                    try {
                        if (commentsList) loadAndRenderTrackComments(trackIdStr, commentsList);
                    } catch (_) {
                    }
                }
            });
        }
        
        const commentInput = card.querySelector('.post-comment-input');
        const commentSend = card.querySelector('.post-comment-send');
        if (commentInput && commentSend && !commentSend.dataset.bound) {
            commentSend.dataset.bound = '1';
            commentSend.addEventListener('click', async function () {
                const text = commentInput.value.trim();
                if (!text) return;
                commentInput.value = '';
                try {
                    await createTrackComment(trackIdStr, text);
                } catch (_) {
                }
                try {
                    if (commentsList) loadAndRenderTrackComments(trackIdStr, commentsList);
                } catch (_) {
                }
            });
            commentInput.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') commentSend.click();
            });
        }

        const commentBtn = card.querySelector('.comment-btn[data-track-id]');
        if (commentBtn && !commentBtn.dataset.bound) {
            commentBtn.dataset.bound = '1';
            commentBtn.addEventListener('click', function (e) {
                try {
                    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
                } catch (_) {
                }
                try {
                    openTrackCommentsModal(String(track.id), { title: track.title || 'Comments' });
                } catch (_) {
                }
            });
        }
    } catch (_) {
    }

    return card;
}

function createCollectionTrackCard(track) {
    const card = document.createElement('div');
    card.className = 'track-card';

    const coverUrl = resolveAssetUrl(track.cover_image_url, '../images/juke.png');
    const artistName = track.artist_name || track.uploader_username || 'Unknown Artist';
    const isLiked = likedTrackIds.has(String(track.id));
    const currentUserId = getCurrentUserId();
    const canDelete = !!currentUserId && !!track.uploader_id && String(track.uploader_id) === String(currentUserId);
    const uploadedShort = formatTrackDateShort(track);
    const statsLeft = (track.genre || '') + (uploadedShort ? (' · ' + uploadedShort) : '');

    card.innerHTML = `
        <div class="track-cover">
            <img src="${coverUrl}" alt="${track.title}" onclick="playTrack('${track.id}')">
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
                <span>${statsLeft}</span>
                <div class="track-actions">
                    <button class="action-btn ${isLiked ? 'liked' : ''}" data-track-id="${track.id}" onclick="likeTrack('${track.id}')">
                        <i class="${isLiked ? 'fas' : 'far'} fa-heart"></i>
                        <span class="like-count" data-track-id="${track.id}">${(isLiked || (typeof track.like_count === 'number' && track.like_count > 0)) ? String(track.like_count || 0) : ''}</span>
                    </button>
                    <button class="action-btn comment-btn" data-track-id="${track.id}" type="button" aria-label="Comments">
                        <i class="far fa-comment"></i>
                    </button>
                    <button class="action-btn share-btn" data-track-id="${track.id}" type="button" aria-label="Share">
                        <i class="far fa-paper-plane"></i>
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

    try {
        const shareBtn = card.querySelector('.share-btn');
        if (shareBtn && !shareBtn.dataset.bound) {
            shareBtn.dataset.bound = '1';
            shareBtn.addEventListener('click', function (e) {
                try {
                    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
                } catch (_) {
                }
                try {
                    if (typeof window.shareTrackById === 'function') {
                        window.shareTrackById(String(track.id), { title: track.title, text: track.artist_name });
                    }
                } catch (_) {
                }
            });
        }
    } catch (_) {
    }

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

    // 🎯 Bessere Bestätigung mit Track-Info
    const trackElement = document.querySelector(`[data-track-id="${trackId}"]`);
    const trackTitle = trackElement ? trackElement.querySelector('.track-title')?.textContent : 'this track';
    
    const confirmed = window.confirm(`Are you sure you want to delete "${trackTitle}"?\n\nThis action cannot be undone and will permanently remove the track from all playlists and favorites.`);
    if (!confirmed) return;

    // 🎯 Loading State hinzufügen
    const deleteBtn = document.querySelector(`.delete-btn[data-track-id="${trackId}"]`);
    const originalContent = deleteBtn ? deleteBtn.innerHTML : '';
    
    if (deleteBtn) {
        deleteBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        deleteBtn.disabled = true;
    }

    try {
        const response = await fetchJson(`${window.JukeAPIBase.getApiBase()}/tracks/${encodeURIComponent(trackId)}`, {
            method: 'DELETE',
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        // 🎯 Optimiertes Update statt volles Reload
        if (trackElement) {
            trackElement.style.transition = 'opacity 0.3s, transform 0.3s';
            trackElement.style.opacity = '0';
            trackElement.style.transform = 'scale(0.9)';
            
            setTimeout(() => {
                trackElement.remove();
                // 🎯 Update track count
                updateTrackCount();
            }, 300);
        } else {
            await loadTracks();
        }

        // 🎯 Success Notification
        showNotification(`"${trackTitle}" deleted successfully`, 'success');

    } catch (e) {
        console.error('Deleting track failed:', e);
        
        // 🎯 Bessere Fehlermeldung
        let errorMessage = 'Delete failed. Please try again.';
        if (e.message.includes('404')) {
            errorMessage = 'Track not found or already deleted.';
        } else if (e.message.includes('403')) {
            errorMessage = 'You don\'t have permission to delete this track.';
        } else if (e.message.includes('network')) {
            errorMessage = 'Network error. Please check your connection.';
        }
        
        showNotification(errorMessage, 'error');
        
        // 🎯 Button-Status wiederherstellen
        if (deleteBtn) {
            deleteBtn.innerHTML = originalContent;
            deleteBtn.disabled = false;
        }
    }
}

// 🎯 Neue Helper-Funktionen
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 20px;
        border-radius: 8px;
        color: white;
        font-weight: 500;
        z-index: 10000;
        animation: slideIn 0.3s ease;
        background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

function updateTrackCount() {
    const grid = document.querySelector('.music-grid');
    if (grid) {
        const count = grid.children.length;
        const title = document.querySelector('.feed-title');
        if (title) {
            title.textContent = `Feed ${count > 0 ? `(${count})` : ''}`;
        }
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

    trackId = String(trackId);

    // Optimistically toggle local state before API
    const wasLiked = likedTrackIds.has(trackId);
    const newLiked = !wasLiked;
    if (newLiked) {
        likedTrackIds.add(trackId);
    } else {
        likedTrackIds.delete(trackId);
    }

    try {
        document.querySelectorAll(`.like-btn[data-track-id="${CSS.escape(String(trackId))}"], .action-btn[data-track-id="${CSS.escape(String(trackId))}"]`).forEach((btn) => {
            const icon = btn.querySelector('i');
            if (icon) {
                icon.className = newLiked ? 'fas fa-heart' : 'far fa-heart';
            }
            if (btn && btn.classList) {
                btn.classList.toggle('liked', !!newLiked);
            }
        });
    } catch (_) {
    }

    try {
        window.dispatchEvent(new CustomEvent('tracks:liked-changed', {
            detail: { trackId: trackId, liked: !!newLiked }
        }));
    } catch (_) {
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

        try {
            var nextCount = (data && typeof data.like_count === 'number') ? data.like_count : null;
            if (nextCount != null) {
                document.querySelectorAll(`.like-count[data-track-id="${CSS.escape(String(trackId))}"]`).forEach(function (el) {
                    try {
                        var show = !!(data && data.liked) || nextCount > 0;
                        el.textContent = show ? String(nextCount) : '';
                    } catch (_) {
                    }
                });
            }
        } catch (_) {
        }

        // Reconcile with server response if needed
        if (data && typeof data.liked === 'boolean') {
            if (data.liked) {
                likedTrackIds.add(trackId);
            } else {
                likedTrackIds.delete(trackId);
            }
        }

        try {
            window.dispatchEvent(new CustomEvent('tracks:liked-changed', {
                detail: { trackId: trackId, liked: !!(data && data.liked) }
            }));
        } catch (_) {
        }

        try {
            document.querySelectorAll(`.like-btn[data-track-id="${CSS.escape(String(trackId))}"], .action-btn[data-track-id="${CSS.escape(String(trackId))}"]`).forEach((btn) => {
                const icon = btn.querySelector('i');
                if (icon) {
                    icon.className = (data && data.liked) ? 'fas fa-heart' : 'far fa-heart';
                }
                if (btn && btn.classList) {
                    btn.classList.toggle('liked', !!(data && data.liked));
                }
            });
        } catch (_) {
        }
    } catch (e) {
        // Revert optimistic update on failure
        if (wasLiked) {
            likedTrackIds.add(trackId);
        } else {
            likedTrackIds.delete(trackId);
        }

        try {
            const revertedLiked = !!wasLiked;
            document.querySelectorAll(`.like-btn[data-track-id="${CSS.escape(String(trackId))}"], .action-btn[data-track-id="${CSS.escape(String(trackId))}"]`).forEach((btn) => {
                const icon = btn.querySelector('i');
                if (icon) {
                    icon.className = revertedLiked ? 'fas fa-heart' : 'far fa-heart';
                }
                if (btn && btn.classList) {
                    btn.classList.toggle('liked', revertedLiked);
                }
            });
        } catch (_) {
        }

        try {
            window.dispatchEvent(new CustomEvent('tracks:liked-changed', {
                detail: { trackId: trackId, liked: !!wasLiked }
            }));
        } catch (_) {
        }

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
    
    // Check if we're in user.html and redirect to SPA instead of loading
    if (window.location.pathname.includes('/html/user.html')) {
        console.log('Detected user.html, redirecting to SPA feed');
        window.location.replace('../index.html#/feed');
        return;
    }
    
    // Only legacy pages that still rely on loadTracks should trigger it here.
    // Avoid triggering on other legacy pages that also contain a .music-grid (e.g. disqo.html).
    if (document.getElementById('tracksGrid')) {
        loadTracks();
    }
});

function debounce(fn, waitMs) {
    var t = null;
    return function () {
        var ctx = this;
        var args = arguments;
        if (t) clearTimeout(t);
        t = setTimeout(function () {
            t = null;
            fn.apply(ctx, args);
        }, waitMs);
    };
}

function setupGlobalSearch() {
    var container = document.querySelector('.search-container');
    var input = document.querySelector('.search-bar');
    if (!container || !input) return;

    if (container.dataset.bound === 'true') return;
    container.dataset.bound = 'true';

    container.style.position = 'relative';

    var results = document.createElement('div');
    results.className = 'search-results';
    results.style.display = 'none';
    container.appendChild(results);

    function hide() {
        results.style.display = 'none';
        results.innerHTML = '';
    }

    function showLoading() {
        results.style.display = '';
        results.innerHTML = '<div class="search-results__item search-results__item--muted">Searching…</div>';
    }

    function renderTracks(tracks) {
        if (!Array.isArray(tracks) || tracks.length === 0) {
            results.style.display = '';
            results.innerHTML = '<div class="search-results__item search-results__item--muted">No results</div>';
            return;
        }

        results.style.display = '';
        results.innerHTML = tracks.slice(0, 10).map(function (t) {
            var coverFallback = isSpaMode() ? 'images/juke.png' : '../images/juke.png';
            var cover = resolveAssetUrl(t.cover_image_url, coverFallback);
            var title = (t && t.title) ? String(t.title) : 'Unknown';
            var artist = (t && t.artist_name) ? String(t.artist_name) : '';
            return (
                '<button type="button" class="search-results__item" data-track-id="' + String(t.id) + '">' +
                '  <img class="search-results__cover" src="' + cover + '" alt="">' +
                '  <span class="search-results__meta">' +
                '    <span class="search-results__title">' + title.replace(/</g, '&lt;') + '</span>' +
                '    <span class="search-results__subtitle">' + artist.replace(/</g, '&lt;') + '</span>' +
                '  </span>' +
                '  <span class="search-results__play"><i class="fas fa-play"></i></span>' +
                '</button>'
            );
        }).join('');
    }

    var doSearch = debounce(async function () {
        var q = String(input.value || '').trim();
        if (!q) {
            hide();
            return;
        }

        showLoading();
        try {
            var data = await apiFetchJson('/search?q=' + encodeURIComponent(q) + '&type=tracks&limit=10', {}, function (d) {
                return !!d && typeof d === 'object' && (Array.isArray(d.tracks) || Array.isArray(d));
            });

            var tracks = Array.isArray(data) ? data : (data && data.tracks ? data.tracks : []);
            renderTracks(tracks);
        } catch (e) {
            results.style.display = '';
            results.innerHTML = '<div class="search-results__item search-results__item--muted">Search failed</div>';
        }
    }, 200);

    input.addEventListener('input', function () {
        doSearch();
    });

    input.addEventListener('focus', function () {
        if (String(input.value || '').trim()) doSearch();
    });

    document.addEventListener('click', function (e) {
        try {
            if (!container.contains(e.target)) hide();
        } catch (_) {
            hide();
        }
    });

    results.addEventListener('click', function (e) {
        var btn = e.target && e.target.closest ? e.target.closest('.search-results__item[data-track-id]') : null;
        if (!btn) return;
        var id = btn.getAttribute('data-track-id');
        if (!id) return;
        try {
            input.blur();
        } catch (_) {
        }
        hide();
        playTrack(id);
    });
}

function setupMobileSearch() {
    var input = document.querySelector('.mobile-header .mobile-search');
    if (!input) return;
    if (input.dataset.bound === 'true') return;
    input.dataset.bound = 'true';

    var results = null;

    function ensureResults() {
        if (results && results.parentNode) return results;
        results = document.createElement('div');
        results.className = 'mobile-search-results';
        results.style.display = 'none';
        document.body.appendChild(results);
        return results;
    }

    function hide() {
        var r = ensureResults();
        r.style.display = 'none';
        r.innerHTML = '';
    }

    function showLoading() {
        var r = ensureResults();
        r.style.display = '';
        r.innerHTML = '<div class="search-results__item search-results__item--muted">Searching…</div>';
    }

    function renderTracks(tracks) {
        var r = ensureResults();
        if (!Array.isArray(tracks) || tracks.length === 0) {
            r.style.display = '';
            r.innerHTML = '<div class="search-results__item search-results__item--muted">No results</div>';
            return;
        }

        r.style.display = '';
        r.innerHTML = tracks.slice(0, 10).map(function (t) {
            var cover = resolveAssetUrl(t.cover_image_url, 'images/juke.png');
            var title = (t && t.title) ? String(t.title) : 'Unknown';
            var artist = (t && t.artist_name) ? String(t.artist_name) : '';
            return (
                '<button type="button" class="search-results__item" data-track-id="' + String(t.id) + '">' +
                '  <img class="search-results__cover" src="' + cover + '" alt="">' +
                '  <span class="search-results__meta">' +
                '    <span class="search-results__title">' + title.replace(/</g, '&lt;') + '</span>' +
                '    <span class="search-results__subtitle">' + artist.replace(/</g, '&lt;') + '</span>' +
                '  </span>' +
                '  <span class="search-results__play"><i class="fas fa-play"></i></span>' +
                '</button>'
            );
        }).join('');
    }

    var doSearch = debounce(async function () {
        var q = String(input.value || '').trim();
        if (!q) {
            hide();
            return;
        }
        showLoading();
        try {
            var data = await apiFetchJson('/search?q=' + encodeURIComponent(q) + '&type=tracks&limit=10', {}, function (d) {
                return !!d && typeof d === 'object' && (Array.isArray(d.tracks) || Array.isArray(d));
            });
            var tracks = Array.isArray(data) ? data : (data && data.tracks ? data.tracks : []);
            renderTracks(tracks);
        } catch (_) {
            var r = ensureResults();
            r.style.display = '';
            r.innerHTML = '<div class="search-results__item search-results__item--muted">Search failed</div>';
        }
    }, 200);

    input.addEventListener('input', function () {
        doSearch();
    });

    input.addEventListener('focus', function () {
        if (String(input.value || '').trim()) doSearch();
    });

    document.addEventListener('click', function (e) {
        try {
            var r = ensureResults();
            if (r.style.display === 'none') return;
            if (e && e.target && (r.contains(e.target) || input.contains(e.target))) return;
        } catch (_) {
        }
        hide();
    });

    ensureResults().addEventListener('click', function (e) {
        var btn = e.target && e.target.closest ? e.target.closest('.search-results__item[data-track-id]') : null;
        if (!btn) return;
        var id = btn.getAttribute('data-track-id');
        if (!id) return;
        try { input.blur(); } catch (_) {}
        hide();
        playTrack(id);
    });
}

document.addEventListener('DOMContentLoaded', function () {
    setupGlobalSearch();
    setupMobileSearch();
});

document.addEventListener('spa:navigate', function () {
    setupGlobalSearch();
    setupMobileSearch();
});

// Disqo page functions
async function loadDisqoPage() {
    try {
        await loadDisqoFeatured();
        await loadDisqoRecommendations();
        await loadDisqoNewReleases();
        bindGenreCards();
    } catch (e) {
        console.error('Disqo load failed:', e);
    }
}

async function loadDisqoFeatured() {
    const featured = document.getElementById('disqoFeatured');
    if (!featured) return;
    
    try {
        const tracks = await apiFetchJson('/tracks/new?limit=1&offset=0', {}, d => Array.isArray(d));
        if (!tracks || tracks.length === 0) {
            featured.style.display = 'none';
            return;
        }
        
        const track = tracks[0];
        const coverUrl = resolveAssetUrl(track.cover_image_url, 'images/juke.png');
        
        const dateTxt = formatTrackDateShort(track);
        featured.innerHTML = `
            <div class="disqo-featured-hero">
                <img class="disqo-featured-bg" src="${coverUrl}" alt="">
                <div class="disqo-featured-content">
                    <img class="disqo-featured-cover" src="${coverUrl}" alt="${track.title}">
                    <div class="disqo-featured-info">
                        <div class="disqo-featured-label">Featured Track</div>
                        <h1 class="disqo-featured-title">${track.title || 'Untitled'}</h1>
                        <div class="disqo-featured-artist">${(track.artist_name || track.uploader_username || 'Unknown Artist')}</div>
                        ${dateTxt ? `<div class="disqo-featured-date">${dateTxt}</div>` : ''}
                        <div class="disqo-featured-actions">
                            <button class="disqo-play-btn" data-track-id="${track.id}">
                                <i class="fas fa-play"></i> Play
                            </button>
                            <button class="disqo-save-btn" data-track-id="${track.id}">
                                <i class="far fa-bookmark"></i>
                            </button>
                            <button class="disqo-save-btn disqo-share-btn" data-track-id="${track.id}" type="button" aria-label="Share">
                                <i class="far fa-paper-plane"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        const playBtn = featured.querySelector('.disqo-play-btn');
        if (playBtn) {
            playBtn.addEventListener('click', () => playTrack(track.id));
        }
        
        const saveBtn = featured.querySelector('.disqo-save-btn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => addToPlaylist(track.id));
        }

        const shareBtn = featured.querySelector('.disqo-share-btn');
        if (shareBtn) {
            shareBtn.addEventListener('click', function (e) {
                try {
                    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
                } catch (_) {
                }
                try {
                    if (typeof window.shareTrackById === 'function') {
                        window.shareTrackById(String(track.id), { title: track.title, text: track.artist_name });
                    }
                } catch (_) {
                }
            });
        }
    } catch (e) {
        console.error('Featured load failed:', e);
    }
}

async function loadDisqoRecommendations() {
    const row = document.getElementById('recommendationsRow');
    if (!row) return;
    
    try {
        const tracks = await apiFetchJson('/tracks/new?limit=8&offset=1', {}, d => Array.isArray(d));
        if (!tracks || tracks.length === 0) {
            row.innerHTML = '<div class="empty-state">No recommendations yet</div>';
            return;
        }
        
        row.innerHTML = tracks.map(t => {
            const coverUrl = resolveAssetUrl(t.cover_image_url, 'images/juke.png');
            const dateTxt = formatTrackDateShort(t);
            return `
                <div class="recommendation-card" data-track-id="${t.id}">
                    <img class="recommendation-cover" src="${coverUrl}" alt="">
                    <div class="recommendation-info">
                        <div class="recommendation-title">${t.title || 'Untitled'}</div>
                        <div class="recommendation-artist">${t.artist_name || t.uploader_username || ''}</div>
                        ${dateTxt ? `<div class="recommendation-date">${dateTxt}</div>` : ''}
                        <button class="recommendation-play"><i class="fas fa-play"></i></button>
                        <button class="recommendation-share" type="button" aria-label="Share"><i class="far fa-paper-plane"></i></button>
                    </div>
                </div>
            `;
        }).join('');
        
        row.querySelectorAll('.recommendation-card').forEach(card => {
            card.addEventListener('click', (e) => {
                try {
                    if (e && e.target && e.target.closest && e.target.closest('button.recommendation-share')) return;
                } catch (_) {
                }
                const id = card.dataset.trackId;
                if (id) playTrack(id);
            });

            const shareBtn = card.querySelector('.recommendation-share');
            if (shareBtn && !shareBtn.dataset.bound) {
                shareBtn.dataset.bound = '1';
                shareBtn.addEventListener('click', function (e) {
                    try {
                        if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
                    } catch (_) {
                    }
                    const id = card.dataset.trackId;
                    if (!id) return;
                    try {
                        if (typeof window.shareTrackById === 'function') {
                            const t = (tracks || []).find(function (x) { return String(x.id) === String(id); });
                            window.shareTrackById(String(id), { title: t && t.title ? t.title : '', text: t && t.artist_name ? t.artist_name : '' });
                        }
                    } catch (_) {
                    }
                });
            }
        });
    } catch (e) {
        console.error('Recommendations load failed:', e);
    }
}

async function loadDisqoNewReleases() {
    const grid = document.getElementById('newReleasesGrid');
    if (!grid) return;
    
    try {
        const tracks = await apiFetchJson('/tracks/new?limit=12&offset=0', {}, d => Array.isArray(d));
        if (!tracks || tracks.length === 0) {
            grid.innerHTML = '<div class="empty-state">No new releases</div>';
            return;
        }
        
        grid.innerHTML = tracks.map(t => {
            const coverUrl = resolveAssetUrl(t.cover_image_url, 'images/juke.png');
            const dateTxt = formatTrackDateShort(t);
            return `
                <div class="album-card" data-track-id="${t.id}">
                    <button class="album-share" type="button" aria-label="Share"><i class="far fa-paper-plane"></i></button>
                    <img class="album-cover" src="${coverUrl}" alt="">
                    <div class="album-title">${t.title || 'Untitled'}</div>
                    <div class="album-artist">${t.artist_name || t.uploader_username || ''}</div>
                    ${dateTxt ? `<div class="album-date">${dateTxt}</div>` : ''}
                </div>
            `;
        }).join('');
        
        grid.querySelectorAll('.album-card').forEach(card => {
            card.addEventListener('click', (e) => {
                try {
                    if (e && e.target && e.target.closest && e.target.closest('button.album-share')) return;
                } catch (_) {
                }
                const id = card.dataset.trackId;
                if (id) playTrack(id);
            });

            const shareBtn = card.querySelector('.album-share');
            if (shareBtn && !shareBtn.dataset.bound) {
                shareBtn.dataset.bound = '1';
                shareBtn.addEventListener('click', function (e) {
                    try {
                        if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
                    } catch (_) {
                    }
                    const id = card.dataset.trackId;
                    if (!id) return;
                    try {
                        if (typeof window.shareTrackById === 'function') {
                            const t = (tracks || []).find(function (x) { return String(x.id) === String(id); });
                            window.shareTrackById(String(id), { title: t && t.title ? t.title : '', text: t && t.artist_name ? t.artist_name : '' });
                        }
                    } catch (_) {
                    }
                });
            }
        });
    } catch (e) {
        console.error('New releases load failed:', e);
    }
}

function bindGenreCards() {
    const cards = document.querySelectorAll('.genre-card');
    cards.forEach(card => {
        if (card.dataset.bound) return;
        card.dataset.bound = '1';
        card.addEventListener('click', () => {
            const genre = card.dataset.genre;
            if (genre) {
                window.location.hash = '#/feed?genre=' + genre;
            }
        });
    });
}

// Koleqtion tabs functionality
function setupKoleqtionTabs() {
    const tabs = document.querySelectorAll('.tabs .tab');
    const grid = document.getElementById('tracksGrid');
    if (!tabs.length || !grid) return;
    
    tabs.forEach((tab, idx) => {
        if (tab.dataset.bound) return;
        tab.dataset.bound = '1';
        
        tab.addEventListener('click', async () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            const tabName = tab.textContent.trim().toLowerCase();
            grid.innerHTML = '<div class="empty-state">Loading...</div>';
            
            try {
                const token = getAuthToken();
                if (!token) {
                    grid.innerHTML = '<div class="empty-state">Please log in</div>';
                    return;
                }
                
                if (tabName === 'tracks') {
                    await loadMyTracks();
                } else if (tabName === 'playlists') {
                    const playlists = await apiFetchJson('/playlists/my', {
                        headers: { Authorization: `Bearer ${token}` }
                    }, d => Array.isArray(d));
                    renderKoleqtionPlaylists(playlists, grid);
                } else if (tabName === 'likes') {
                    const profile = await apiFetchJson('/users/profile', {
                        headers: { Authorization: `Bearer ${token}` }
                    }, d => !!d && typeof d === 'object');
                    const favorites = (profile && profile.favorites) ? profile.favorites : [];
                    if (favorites.length === 0) {
                        grid.innerHTML = '<div class="empty-state">No liked tracks yet</div>';
                    } else {
                        displayCollectionTracks(favorites);
                    }
                } else if (tabName === 'albums') {
                    grid.innerHTML = '<div class="empty-state">Albums coming soon</div>';
                }
            } catch (e) {
                console.error('Tab load failed:', e);
                grid.innerHTML = '<div class="empty-state">Failed to load</div>';
            }
        });
    });
}

function renderKoleqtionPlaylists(playlists, grid) {
    if (!playlists || playlists.length === 0) {
        grid.innerHTML = '<div class="empty-state">No playlists yet</div>';
        return;
    }
    
    grid.innerHTML = playlists.map(p => {
        const coverUrl = p.cover_url || 'images/juke.png';
        return `
            <div class="music-card" style="cursor:pointer" data-playlist-id="${p.id}">
                <div class="post-header">
                    <div class="post-header-left">
                        <div class="post-title">${p.name || 'Untitled'}</div>
                        <div class="post-subtitle">${p.track_count || 0} tracks</div>
                    </div>
                </div>
                <div class="post-media-wrap">
                    <img class="post-media" src="${coverUrl}" alt="" style="max-height:200px">
                </div>
            </div>
        `;
    }).join('');
    
    grid.querySelectorAll('[data-playlist-id]').forEach(card => {
        card.addEventListener('click', () => {
            const id = card.dataset.playlistId;
            if (id) window.location.hash = '#/lists?playlist=' + id;
        });
    });
}

window.JukeApi = {
    loadTracks,
    loadMyTracks,
    loadUserTracks,
    loadDisqoPage,
    setupKoleqtionTabs
};

window.deleteTrack = deleteTrack;
window.loadDisqoPage = loadDisqoPage;
window.setupKoleqtionTabs = setupKoleqtionTabs;
window.openTrackMediaViewer = openTrackMediaViewer;
