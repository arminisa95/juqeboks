// JUKE API Integration - Cleaned Version

// ==================== CORE API ====================
async function apiFetchJson(path, options = {}, validateOkData) {
    const bases = window.JukeAPIBase.getApiBases();
    let lastErr = null;

    for (const base of bases) {
        try {
            const res = await fetch(base + path, options);
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
                localStorage.setItem('juke_api_base', base);
                return data;
            }

            if ([401, 403, 404, 405].includes(res.status)) {
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

// ==================== AUTH HELPERS ====================
function getAuthToken() {
    return localStorage.getItem('juke_token');
}

function getCurrentUserId() {
    try {
        if (typeof getCurrentUser === 'function') {
            const u = getCurrentUser();
            return u?.id;
        }
    } catch {
        // Fall through to localStorage
    }
    
    try {
        const raw = localStorage.getItem('juke_user');
        if (!raw) return null;
        const u = JSON.parse(raw);
        return u?.id;
    } catch {
        return null;
    }
}

function requireAuth() {
    const token = getAuthToken();
    if (!token) {
        if (isSpaMode()) {
            window.location.hash = '#/login';
        } else {
            window.location.href = 'login.html';
        }
        return false;
    }
    return true;
}

// ==================== UI HELPERS ====================
function isSpaMode() {
    return !!(document.body?.dataset?.spa);
}

function resolveAssetUrl(url, fallback) {
    if (!url) return fallback;
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    if (url.startsWith('/')) return `${window.JukeAPIBase.getApiOrigin()}${url}`;
    return url;
}

function resolveLocalAssetUrl(pathFromRoot) {
    const pathname = window.location?.pathname?.replace(/\\/g, '/') || '';
    const base = pathname.includes('/html/') ? '..' : '.';
    return `${base}/${String(pathFromRoot || '').replace(/^\//, '')}`;
}

function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ==================== TIME FORMATTING ====================
function parseTrackDate(track) {
    const dateStr = track?.created_at || track?.createdAt || track?.created;
    if (!dateStr) return null;
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? null : date;
}

function formatRelativeTime(value) {
    const date = value ? new Date(value) : null;
    if (!date || !isFinite(date.getTime())) return '';
    
    const diff = Date.now() - date.getTime();
    if (!isFinite(diff)) return '';
    
    const seconds = Math.max(0, Math.floor(diff / 1000));
    if (seconds < 10) return 'now';
    if (seconds < 60) return `${seconds}s`;
    
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d`;
    
    const weeks = Math.floor(days / 7);
    if (weeks < 5) return `${weeks}w`;
    
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo`;
    
    const years = Math.floor(days / 365);
    return `${years}y`;
}

function formatTrackDateShort(track) {
    const date = parseTrackDate(track);
    if (!date) return '';
    
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    if (!isFinite(diffMs)) return '';
    
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'now';
    if (diffMin < 60) return `${diffMin}m`;
    
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h`;
    
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 7) return `${diffDay}d`;
    
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ==================== LIKED TRACKS ====================
let likedTrackIds = new Set();

window.isTrackLiked = function(trackId) {
    return likedTrackIds.has(String(trackId));
};

async function loadLikedTrackIds() {
    if (!requireAuth()) {
        likedTrackIds.clear();
        return;
    }

    try {
        const profile = await apiFetchJson('/users/profile', {
            headers: { Authorization: `Bearer ${getAuthToken()}` }
        }, d => d && typeof d === 'object');
        
        const favorites = profile?.favorites || [];
        likedTrackIds = new Set(favorites.map(t => String(t.id)));
    } catch {
        likedTrackIds.clear();
    }
}

// ==================== COMMENTS ====================
async function fetchTrackComments(trackId) {
    if (!requireAuth()) return [];
    
    try {
        return await apiFetchJson(`/tracks/${encodeURIComponent(trackId)}/comments`, {
            headers: { Authorization: `Bearer ${getAuthToken()}` }
        }, d => Array.isArray(d));
    } catch {
        return [];
    }
}

async function createTrackComment(trackId, text) {
    if (!requireAuth()) return null;
    
    try {
        return await apiFetchJson(`/tracks/${encodeURIComponent(trackId)}/comments`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${getAuthToken()}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ body: String(text || '').trim() })
        }, d => d && typeof d === 'object');
    } catch {
        return null;
    }
}

async function deleteTrackComment(trackId, commentId) {
    if (!requireAuth()) return false;
    
    try {
        await apiFetchJson(`/tracks/${encodeURIComponent(trackId)}/comments/${encodeURIComponent(commentId)}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${getAuthToken()}` }
        });
        return true;
    } catch {
        return false;
    }
}

function renderTrackCommentsList(container, comments) {
    if (!container) return;
    
    if (!Array.isArray(comments) || comments.length === 0) {
        container.innerHTML = '<div class="post-comments-empty">No comments yet.</div>';
        return;
    }

    const currentUserId = getCurrentUserId();
    let isAdmin = false;
    try {
        const u = getCurrentUser();
        isAdmin = !!(u?.isAdmin || u?.is_admin);
    } catch {
        // isAdmin remains false
    }

    container.innerHTML = comments.map(comment => {
        const canDelete = isAdmin || (currentUserId && comment.user_id === currentUserId);
        const username = escapeHtml(comment.username || 'user');
        const body = escapeHtml(comment.body || '');
        const time = formatRelativeTime(comment.created_at);
        const initial = username.charAt(0).toUpperCase();
        
        return `
            <div class="comment-item">
                <div class="comment-avatar">${initial}</div>
                <div class="comment-content">
                    <div class="comment-username">
                        @${username}${time ? ` <span class="comment-time">${time}</span>` : ''}
                        ${canDelete ? ` <button type="button" class="comment-delete-btn" data-track-id="${comment.track_id}" data-comment-id="${comment.id}" aria-label="Delete">Delete</button>` : ''}
                    </div>
                    <div class="comment-text">${body}</div>
                </div>
            </div>
        `;
    }).join('');
}

// ==================== MEDIA VIEWER ====================
function openTrackMediaViewer(tracks, startTrackId) {
    if (!startTrackId) return;

    // Remove existing viewer
    const existing = document.getElementById('jukeMediaViewerRoot');
    existing?.remove();

    const root = document.createElement('div');
    root.id = 'jukeMediaViewerRoot';
    root.className = 'juke-media-viewer-root';
    
    root.innerHTML = `
        <div class="juke-media-backdrop" data-juke-media-close="1"></div>
        <div class="juke-media-viewer-sheet" role="dialog" aria-modal="true">
            <div class="juke-media-header">
                <div class="juke-media-title">Media</div>
                <button type="button" class="juke-media-close" data-juke-media-close="1" aria-label="Close">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="juke-media-container">
                <div class="juke-media-main">
                    <div class="juke-media-frame">
                        <button type="button" class="juke-media-nav juke-media-prev" data-juke-media-nav="prev" aria-label="Previous">
                            <i class="fas fa-chevron-left"></i>
                        </button>
                        <div class="juke-media-content"></div>
                        <button type="button" class="juke-media-nav juke-media-next" data-juke-media-nav="next" aria-label="Next">
                            <i class="fas fa-chevron-right"></i>
                        </button>
                    </div>
                    <div class="juke-media-info">
                        <div class="juke-media-title"></div>
                        <div class="juke-media-artist"></div>
                        <div class="juke-media-date"></div>
                    </div>
                    <div class="juke-media-actions">
                        <button class="juke-media-action like-btn" data-track-id="" type="button" aria-label="Like">
                            <i class="far fa-heart"></i>
                            <span class="like-count"></span>
                        </button>
                        <button class="juke-media-action comment-btn" type="button" aria-label="Comments" data-juke-media-comments-toggle="1">
                            <i class="far fa-comment"></i>
                        </button>
                        <button class="juke-media-action share-btn" type="button" aria-label="Share" data-share-track-id="">
                            <i class="far fa-paper-plane"></i>
                        </button>
                    </div>
                </div>
                <div class="juke-media-sidebar" id="jukeMediaSidebar">
                    <div class="juke-sidebar-header">
                        <h3>Comments</h3>
                        <button type="button" class="juke-sidebar-close" data-juke-sidebar-close="1" aria-label="Close sidebar">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="juke-comments-list" data-track-id=""></div>
                    <div class="juke-comment-compose">
                        <input type="text" class="juke-comment-input" placeholder="Add a comment…" data-track-id="">
                        <button type="button" class="juke-comment-send" data-track-id="">Post</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(root);

    // Animation
    requestAnimationFrame(() => root.classList.add('open'));

    let activeTrackId = String(startTrackId);

    function findTrack(id) {
        return tracks.find(t => String(t.id) === String(id));
    }

    function getActiveIndex() {
        return tracks.findIndex(t => String(t.id) === activeTrackId);
    }

    function setActiveTrack(track) {
        if (!track?.id == null) return;
        
        activeTrackId = String(track.id);
        const index = getActiveIndex();
        const hasPrev = index > 0;
        const hasNext = index >= 0 && index < tracks.length - 1;

        const cover = resolveAssetUrl(track.cover_image_url, resolveLocalAssetUrl('images/juke.png'));
        const videoUrl = track.video_url ? resolveAssetUrl(track.video_url, '') : '';
        const mediaEl = videoUrl 
            ? `<video src="${escapeHtml(videoUrl)}" playsinline muted autoplay loop controls></video>`
            : `<img src="${escapeHtml(cover)}" alt="">`;

        const liked = likedTrackIds.has(String(track.id));
        const likeCount = track.like_count || 0;
        const likeCountText = liked || likeCount > 0 ? String(likeCount) : '';

        // Update content
        root.querySelector('.juke-media-content').innerHTML = mediaEl;
        root.querySelector('.juke-media-title').textContent = track.title || 'Untitled';
        root.querySelector('.juke-media-artist').textContent = track.artist_name || track.uploader_username || '';
        root.querySelector('.juke-media-date').textContent = formatTrackDateShort(track) || '';
        
        // Update navigation
        root.querySelector('.juke-media-prev').disabled = !hasPrev;
        root.querySelector('.juke-media-next').disabled = !hasNext;

        // Update actions
        const likeBtn = root.querySelector('.like-btn');
        likeBtn.setAttribute('data-track-id', String(track.id));
        likeBtn.querySelector('i').className = liked ? 'fas fa-heart' : 'far fa-heart';
        likeBtn.classList.toggle('liked', liked);
        likeBtn.querySelector('.like-count').textContent = likeCountText;

        root.querySelector('.comment-btn').setAttribute('data-track-id', String(track.id));
        root.querySelector('.share-btn').setAttribute('data-share-track-id', String(track.id));

        // Update sidebar
        const sidebarElements = root.querySelectorAll('.juke-comments-list, .juke-comment-input, .juke-comment-send');
        sidebarElements.forEach(el => el.setAttribute('data-track-id', String(track.id)));

        // Play track
        if (window.JukePlayer?.playTrack) {
            window.JukePlayer.playTrack(track, { autoShowVideo: !!track.video_url });
        } else if (typeof playTrack === 'function') {
            playTrack(String(track.id));
        }
    }

    function close() {
        const video = root.querySelector('video');
        video?.pause();
        root.classList.remove('open');
        root.remove();
    }

    // Event handlers
    root.addEventListener('click', e => {
        const target = e.target;

        // Close button
        if (target.getAttribute('data-juke-media-close') === '1') {
            close();
            return;
        }

        // Navigation
        const navBtn = target.closest('[data-juke-media-nav]');
        if (navBtn) {
            const dir = navBtn.getAttribute('data-juke-media-nav');
            const index = getActiveIndex();
            
            if (dir === 'prev' && index > 0) {
                setActiveTrack(tracks[index - 1]);
            } else if (dir === 'next' && index < tracks.length - 1) {
                setActiveTrack(tracks[index + 1]);
            }
            return;
        }

        // Comments toggle
        if (target.closest('[data-juke-media-comments-toggle="1"]')) {
            e.stopPropagation();
            const sidebar = root.querySelector('.juke-media-sidebar');
            const isOpen = !sidebar.classList.contains('open');
            sidebar.classList.toggle('open', isOpen);
            
            if (isOpen) {
                const listEl = root.querySelector('.juke-comments-list[data-track-id]');
                const trackId = listEl?.getAttribute('data-track-id');
                if (trackId) loadAndRenderTrackComments(trackId, listEl);
            }
            return;
        }

        // Send comment
        const sendBtn = target.closest('.post-comment-send[data-track-id]');
        if (sendBtn) {
            const trackId = sendBtn.getAttribute('data-track-id');
            const input = root.querySelector(`.juke-comment-input[data-track-id="${trackId}"]`);
            const list = root.querySelector(`.juke-comments-list[data-track-id="${trackId}"]`);
            const text = input?.value?.trim();
            
            if (text) {
                input.value = '';
                createTrackComment(trackId, text).then(() => {
                    loadAndRenderTrackComments(trackId, list);
                });
            }
            return;
        }

        // Delete comment
        const delBtn = target.closest('.comment-delete-btn[data-track-id][data-comment-id]');
        if (delBtn) {
            const trackId = delBtn.getAttribute('data-track-id');
            const commentId = delBtn.getAttribute('data-comment-id');
            
            if (confirm('Delete this comment?')) {
                const list = root.querySelector('.juke-comments-list[data-track-id]');
                deleteTrackComment(trackId, commentId).then(() => {
                    loadAndRenderTrackComments(trackId, list);
                });
            }
            return;
        }

        // Like track
        const likeBtn = target.closest('.like-btn[data-track-id]');
        if (likeBtn) {
            const trackId = likeBtn.getAttribute('data-track-id');
            likeTrack(trackId);
            const track = findTrack(trackId);
            if (track) setActiveTrack(track);
            return;
        }

        // Share track
        const shareBtn = target.closest('[data-share-track-id]');
        if (shareBtn) {
            const trackId = shareBtn.getAttribute('data-share-track-id');
            const track = findTrack(trackId);
            if (track && typeof window.shareTrackById === 'function') {
                window.shareTrackById(trackId, {
                    title: track.title || '',
                    text: track.artist_name || track.uploader_username || ''
                });
            }
            return;
        }
    });

    // Initialize with first track
    const initialTrack = findTrack(startTrackId);
    if (initialTrack) setActiveTrack(initialTrack);
}

// ==================== SEARCH ====================
function createSearchRenderer(inputSelector, resultsContainerSelector, options = {}) {
    const input = document.querySelector(inputSelector);
    if (!input || input.dataset.bound === 'true') return;

    input.dataset.bound = 'true';
    let resultsContainer = null;

    function ensureResults() {
        if (resultsContainer?.parentNode) return resultsContainer;
        
        resultsContainer = document.createElement('div');
        resultsContainer.className = options.resultsClass || 'search-results';
        resultsContainer.style.display = 'none';
        document.body.appendChild(resultsContainer);
        return resultsContainer;
    }

    function hide() {
        const container = ensureResults();
        container.style.display = 'none';
        container.innerHTML = '';
    }

    function showLoading() {
        const container = ensureResults();
        container.style.display = '';
        container.innerHTML = '<div class="search-results__item search-results__item--muted">Searching…</div>';
    }

    function renderTracks(tracks) {
        const container = ensureResults();
        if (!Array.isArray(tracks) || tracks.length === 0) {
            container.style.display = '';
            container.innerHTML = '<div class="search-results__item search-results__item--muted">No results</div>';
            return;
        }

        container.style.display = '';
        container.innerHTML = tracks.slice(0, 10).map(track => {
            const cover = resolveAssetUrl(track.cover_image_url, options.coverFallback || 'images/juke.png');
            const title = escapeHtml(track.title || 'Unknown');
            const artist = escapeHtml(track.artist_name || '');
            
            return `
                <button type="button" class="search-results__item" data-track-id="${track.id}">
                    <img class="search-results__cover" src="${cover}" alt="">
                    <span class="search-results__meta">
                        <span class="search-results__title">${title}</span>
                        <span class="search-results__subtitle">${artist}</span>
                    </span>
                    <span class="search-results__play"><i class="fas fa-play"></i></span>
                </button>
            `;
        }).join('');
    }

    const doSearch = debounce(async () => {
        const query = input.value?.trim();
        if (!query) {
            hide();
            return;
        }

        showLoading();
        try {
            const data = await apiFetchJson(`/search?q=${encodeURIComponent(query)}&type=tracks&limit=10`, {}, 
                d => d && typeof d === 'object' && (Array.isArray(d.tracks) || Array.isArray(d)));
            
            const tracks = Array.isArray(data) ? data : (data?.tracks || []);
            renderTracks(tracks);
        } catch {
            const container = ensureResults();
            container.style.display = '';
            container.innerHTML = '<div class="search-results__item search-results__item--muted">Search failed</div>';
        }
    }, 200);

    // Event listeners
    input.addEventListener('input', doSearch);
    input.addEventListener('focus', () => input.value?.trim() && doSearch());

    document.addEventListener('click', e => {
        try {
            if (!ensureResults().contains(e.target)) hide();
        } catch {
            hide();
        }
    });

    ensureResults().addEventListener('click', e => {
        const btn = e.target.closest('.search-results__item[data-track-id]');
        if (!btn) return;
        
        const trackId = btn.getAttribute('data-track-id');
        if (trackId) {
            input.blur();
            hide();
            playTrack(trackId);
        }
    });
}

function setupGlobalSearch() {
    createSearchRenderer('.search-input', '.search-results', {
        resultsClass: 'search-results',
        coverFallback: isSpaMode() ? 'images/juke.png' : '../images/juke.png'
    });
}

function setupMobileSearch() {
    createSearchRenderer('.mobile-header .mobile-search', '.mobile-search-results', {
        resultsClass: 'mobile-search-results',
        coverFallback: 'images/juke.png'
    });
}

// ==================== UTILITY FUNCTIONS ====================
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function loadAndRenderTrackComments(trackId, container) {
    if (!container) return;
    
    container.innerHTML = '<div class="post-comments-empty">Loading...</div>';
    fetchTrackComments(trackId).then(comments => {
        renderTrackCommentsList(container, comments);
    });
}

// ==================== EXPOSURES ====================
try {
    window.JukeUi = window.JukeUi || {};
    window.JukeUi.formatTrackDateShort = formatTrackDateShort;
} catch {}

try {
    window.openTrackCommentsModal = openTrackCommentsModal;
} catch {}

// Initialize search when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    setupGlobalSearch();
    setupMobileSearch();
});

document.addEventListener('spa:navigate', () => {
    setupGlobalSearch();
    setupMobileSearch();
});

// Export main API functions
window.JukeApi = {
    loadTracks: () => {}, // Implementation depends on context
    loadMyTracks: () => {}, // Implementation depends on context
    loadUserTracks: () => {}, // Implementation depends on context
    loadDisqoPage: () => {}, // Implementation depends on context
    setupKoleqtionTabs: () => {} // Implementation depends on context
};

window.openTrackMediaViewer = openTrackMediaViewer;
