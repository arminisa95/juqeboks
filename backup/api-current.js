// JUKE API Integration - Clean Architecture

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

// ==================== AUTH & STATE ====================
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

// ==================== LIKED TRACKS STATE ====================
class LikedTracksManager {
    constructor() {
        this.likedTrackIds = new Set();
        window.isTrackLiked = (trackId) => this.likedTrackIds.has(String(trackId));
    }

    async load() {
        if (!requireAuth()) {
            this.likedTrackIds.clear();
            return;
        }

        try {
            const profile = await apiFetchJson('/users/profile', {
                headers: { Authorization: `Bearer ${getAuthToken()}` }
            }, d => d && typeof d === 'object');
            
            const favorites = profile?.favorites || [];
            this.likedTrackIds = new Set(favorites.map(t => String(t.id)));
        } catch {
            this.likedTrackIds.clear();
        }
    }

    async toggleLike(trackId) {
        if (!requireAuth()) return;
        
        try {
            const data = await apiFetchJson(`/tracks/${encodeURIComponent(trackId)}/like`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${getAuthToken()}` }
            }, d => d && typeof d === 'object' && typeof d.liked === 'boolean');
            
            if (data.liked) {
                this.likedTrackIds.add(String(trackId));
            } else {
                this.likedTrackIds.delete(String(trackId));
            }
            
            return data;
        } catch {
            // Error handled by caller
        }
    }
}

const likedTracksManager = new LikedTracksManager();

// ==================== COMMENTS SERVICE ====================
class CommentsService {
    async fetchComments(trackId) {
        if (!requireAuth()) return [];
        
        try {
            return await apiFetchJson(`/tracks/${encodeURIComponent(trackId)}/comments`, {
                headers: { Authorization: `Bearer ${getAuthToken()}` }
            }, d => Array.isArray(d));
        } catch {
            return [];
        }
    }

    async createComment(trackId, text) {
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

    async deleteComment(trackId, commentId) {
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

    renderComments(container, comments) {
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

    async loadAndRender(trackId, container) {
        if (!container) return;
        
        container.innerHTML = '<div class="post-comments-empty">Loading...</div>';
        const comments = await this.fetchComments(trackId);
        this.renderComments(container, comments);
    }
}

const commentsService = new CommentsService();

// ==================== MEDIA VIEWER ====================
class MediaViewer {
    constructor(tracks, startTrackId) {
        this.tracks = tracks || [];
        this.activeTrackId = String(startTrackId);
        this.root = null;
        this.init();
    }

    init() {
        if (!this.activeTrackId) return;

        // Remove existing viewer
        const existing = document.getElementById('jukeMediaViewerRoot');
        existing?.remove();

        this.root = document.createElement('div');
        this.root.id = 'jukeMediaViewerRoot';
        this.root.className = 'juke-media-viewer-root';
        
        this.root.innerHTML = this.getTemplate();
        document.body.appendChild(this.root);

        // Animation
        requestAnimationFrame(() => this.root.classList.add('open'));

        this.bindEvents();
        this.setActiveTrack(this.findTrack(this.activeTrackId));
    }

    getTemplate() {
        return `
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
    }

    bindEvents() {
        this.root.addEventListener('click', e => this.handleClick(e));
    }

    handleClick(e) {
        const target = e.target;

        // Close button
        if (target.getAttribute('data-juke-media-close') === '1') {
            this.close();
            return;
        }

        // Navigation
        const navBtn = target.closest('[data-juke-media-nav]');
        if (navBtn) {
            const dir = navBtn.getAttribute('data-juke-media-nav');
            const index = this.getActiveIndex();
            
            if (dir === 'prev' && index > 0) {
                this.setActiveTrack(this.tracks[index - 1]);
            } else if (dir === 'next' && index < this.tracks.length - 1) {
                this.setActiveTrack(this.tracks[index + 1]);
            }
            return;
        }

        // Comments toggle
        if (target.closest('[data-juke-media-comments-toggle="1"]')) {
            e.stopPropagation();
            this.toggleComments();
            return;
        }

        // Send comment
        const sendBtn = target.closest('.post-comment-send[data-track-id]');
        if (sendBtn) {
            this.handleSendComment(sendBtn);
            return;
        }

        // Delete comment
        const delBtn = target.closest('.comment-delete-btn[data-track-id][data-comment-id]');
        if (delBtn) {
            this.handleDeleteComment(delBtn);
            return;
        }

        // Like track
        const likeBtn = target.closest('.like-btn[data-track-id]');
        if (likeBtn) {
            this.handleLikeTrack(likeBtn);
            return;
        }

        // Share track
        const shareBtn = target.closest('[data-share-track-id]');
        if (shareBtn) {
            this.handleShareTrack(shareBtn);
            return;
        }
    }

    toggleComments() {
        const sidebar = this.root.querySelector('.juke-media-sidebar');
        const isOpen = !sidebar.classList.contains('open');
        sidebar.classList.toggle('open', isOpen);
        
        if (isOpen) {
            const listEl = this.root.querySelector('.juke-comments-list[data-track-id]');
            const trackId = listEl?.getAttribute('data-track-id');
            if (trackId) commentsService.loadAndRender(trackId, listEl);
        }
    }

    async handleSendComment(sendBtn) {
        const trackId = sendBtn.getAttribute('data-track-id');
        const input = this.root.querySelector(`.juke-comment-input[data-track-id="${trackId}"]`);
        const list = this.root.querySelector(`.juke-comments-list[data-track-id="${trackId}"]`);
        const text = input?.value?.trim();
        
        if (text) {
            input.value = '';
            await commentsService.createComment(trackId, text);
            commentsService.loadAndRender(trackId, list);
        }
    }

    async handleDeleteComment(delBtn) {
        const trackId = delBtn.getAttribute('data-track-id');
        const commentId = delBtn.getAttribute('data-comment-id');
        
        if (confirm('Delete this comment?')) {
            const list = this.root.querySelector('.juke-comments-list[data-track-id]');
            await commentsService.deleteComment(trackId, commentId);
            commentsService.loadAndRender(trackId, list);
        }
    }

    async handleLikeTrack(likeBtn) {
        const trackId = likeBtn.getAttribute('data-track-id');
        await likedTracksManager.toggleLike(trackId);
        const track = this.findTrack(trackId);
        if (track) this.setActiveTrack(track);
    }

    handleShareTrack(shareBtn) {
        const trackId = shareBtn.getAttribute('data-share-track-id');
        const track = this.findTrack(trackId);
        if (track && typeof window.shareTrackById === 'function') {
            window.shareTrackById(trackId, {
                title: track.title || '',
                text: track.artist_name || track.uploader_username || ''
            });
        }
    }

    findTrack(id) {
        return this.tracks.find(t => String(t.id) === String(id));
    }

    getActiveIndex() {
        return this.tracks.findIndex(t => String(t.id) === this.activeTrackId);
    }

    setActiveTrack(track) {
        if (!track?.id == null) return;
        
        this.activeTrackId = String(track.id);
        const index = this.getActiveIndex();
        const hasPrev = index > 0;
        const hasNext = index >= 0 && index < this.tracks.length - 1;

        const cover = resolveAssetUrl(track.cover_image_url, resolveLocalAssetUrl('images/juke.png'));
        const videoUrl = track.video_url ? resolveAssetUrl(track.video_url, '') : '';
        const mediaEl = videoUrl 
            ? `<video src="${escapeHtml(videoUrl)}" playsinline muted autoplay loop controls></video>`
            : `<img src="${escapeHtml(cover)}" alt="">`;

        const liked = likedTracksManager.likedTrackIds.has(String(track.id));
        const likeCount = track.like_count || 0;
        const likeCountText = liked || likeCount > 0 ? String(likeCount) : '';

        // Update content
        this.root.querySelector('.juke-media-content').innerHTML = mediaEl;
        this.root.querySelector('.juke-media-title').textContent = track.title || 'Untitled';
        this.root.querySelector('.juke-media-artist').textContent = track.artist_name || track.uploader_username || '';
        this.root.querySelector('.juke-media-date').textContent = formatTrackDateShort(track) || '';
        
        // Update navigation
        this.root.querySelector('.juke-media-prev').disabled = !hasPrev;
        this.root.querySelector('.juke-media-next').disabled = !hasNext;

        // Update actions
        const likeBtn = this.root.querySelector('.like-btn');
        likeBtn.setAttribute('data-track-id', String(track.id));
        likeBtn.querySelector('i').className = liked ? 'fas fa-heart' : 'far fa-heart';
        likeBtn.classList.toggle('liked', liked);
        likeBtn.querySelector('.like-count').textContent = likeCountText;

        this.root.querySelector('.comment-btn').setAttribute('data-track-id', String(track.id));
        this.root.querySelector('.share-btn').setAttribute('data-share-track-id', String(track.id));

        // Update sidebar
        const sidebarElements = this.root.querySelectorAll('.juke-comments-list, .juke-comment-input, .juke-comment-send');
        sidebarElements.forEach(el => el.setAttribute('data-track-id', String(track.id)));

        // Play track
        if (window.JukePlayer?.playTrack) {
            window.JukePlayer.playTrack(track, { autoShowVideo: !!track.video_url });
        } else if (typeof playTrack === 'function') {
            playTrack(String(track.id));
        }
    }

    close() {
        const video = this.root.querySelector('video');
        video?.pause();
        this.root.classList.remove('open');
        this.root.remove();
    }
}

// ==================== SEARCH SERVICE ====================
class SearchService {
    constructor() {
        this.instances = new Map();
    }

    createRenderer(inputSelector, options = {}) {
        const input = document.querySelector(inputSelector);
        if (!input || input.dataset.bound === 'true') return;

        input.dataset.bound = 'true';
        const instance = new SearchRenderer(input, options);
        this.instances.set(inputSelector, instance);
        return instance;
    }
}

class SearchRenderer {
    constructor(input, options = {}) {
        this.input = input;
        this.options = options;
        this.resultsContainer = null;
        this.init();
    }

    init() {
        this.doSearch = debounce(async () => {
            const query = this.input.value?.trim();
            if (!query) {
                this.hide();
                return;
            }

            this.showLoading();
            try {
                const data = await apiFetchJson(`/search?q=${encodeURIComponent(query)}&type=tracks&limit=10`, {}, 
                    d => d && typeof d === 'object' && (Array.isArray(d.tracks) || Array.isArray(d)));
                
                const tracks = Array.isArray(data) ? data : (data?.tracks || []);
                this.renderTracks(tracks);
            } catch {
                const container = this.ensureResults();
                container.style.display = '';
                container.innerHTML = '<div class="search-results__item search-results__item--muted">Search failed</div>';
            }
        }, 200);

        this.bindEvents();
    }

    bindEvents() {
        this.input.addEventListener('input', this.doSearch);
        this.input.addEventListener('focus', () => this.input.value?.trim() && this.doSearch());

        document.addEventListener('click', e => {
            if (!this.ensureResults().contains(e.target)) this.hide();
        });

        this.ensureResults().addEventListener('click', e => {
            const btn = e.target.closest('.search-results__item[data-track-id]');
            if (!btn) return;
            
            const trackId = btn.getAttribute('data-track-id');
            if (trackId) {
                this.input.blur();
                this.hide();
                playTrack(trackId);
            }
        });
    }

    ensureResults() {
        if (this.resultsContainer?.parentNode) return this.resultsContainer;
        
        this.resultsContainer = document.createElement('div');
        this.resultsContainer.className = this.options.resultsClass || 'search-results';
        this.resultsContainer.style.display = 'none';
        document.body.appendChild(this.resultsContainer);
        return this.resultsContainer;
    }

    hide() {
        const container = this.ensureResults();
        container.style.display = 'none';
        container.innerHTML = '';
    }

    showLoading() {
        const container = this.ensureResults();
        container.style.display = '';
        container.innerHTML = '<div class="search-results__item search-results__item--muted">Searching…</div>';
    }

    renderTracks(tracks) {
        const container = this.ensureResults();
        if (!Array.isArray(tracks) || tracks.length === 0) {
            container.style.display = '';
            container.innerHTML = '<div class="search-results__item search-results__item--muted">No results</div>';
            return;
        }

        container.style.display = '';
        container.innerHTML = tracks.slice(0, 10).map(track => {
            const cover = resolveAssetUrl(track.cover_image_url, this.options.coverFallback || 'images/juke.png');
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
}

const searchService = new SearchService();

// ==================== UTILITIES ====================
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

// ==================== PUBLIC API ====================
function openTrackMediaViewer(tracks, startTrackId) {
    return new MediaViewer(tracks, startTrackId);
}

function openTrackCommentsModal(trackId, meta) {
    // Simple modal implementation - can be enhanced
    const container = document.createElement('div');
    container.className = 'comments-modal-overlay';
    container.innerHTML = `
        <div class="comments-modal">
            <div class="comments-modal-header">
                <h3>${escapeHtml(meta?.title || 'Comments')}</h3>
                <button class="comments-modal-close">&times;</button>
            </div>
            <div class="comments-modal-body" data-track-id="${trackId}"></div>
        </div>
    `;
    
    document.body.appendChild(container);
    
    const commentsContainer = container.querySelector('.comments-modal-body');
    commentsService.loadAndRender(trackId, commentsContainer);
    
    container.addEventListener('click', e => {
        if (e.target === container || e.target.classList.contains('comments-modal-close')) {
            container.remove();
        }
    });
}

function setupGlobalSearch() {
    searchService.createRenderer('.search-input', {
        resultsClass: 'search-results',
        coverFallback: isSpaMode() ? 'images/juke.png' : '../images/juke.png'
    });
}

function setupMobileSearch() {
    searchService.createRenderer('.mobile-header .mobile-search', {
        resultsClass: 'mobile-search-results',
        coverFallback: 'images/juke.png'
    });
}

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', () => {
    setupGlobalSearch();
    setupMobileSearch();
    likedTracksManager.load();
});

document.addEventListener('spa:navigate', () => {
    setupGlobalSearch();
    setupMobileSearch();
});

// ==================== EXPOSURES ====================
try {
    window.JukeUi = window.JukeUi || {};
    window.JukeUi.formatTrackDateShort = formatTrackDateShort;
} catch {}

// Export functions
window.openTrackMediaViewer = openTrackMediaViewer;
window.openTrackCommentsModal = openTrackCommentsModal;

// Legacy API compatibility
window.JukeApi = {
    loadTracks: () => {}, // Implementation depends on context
    loadMyTracks: () => {}, // Implementation depends on context
    loadUserTracks: () => {}, // Implementation depends on context
    loadDisqoPage: () => {}, // Implementation depends on context
    setupKoleqtionTabs: () => {} // Implementation depends on context
};

// Expose services for advanced usage
window.JukeServices = {
    likedTracks: likedTracksManager,
    comments: commentsService,
    search: searchService
};
