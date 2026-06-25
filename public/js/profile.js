// JUKE Profile: my uploads, reposts, bio, repost from others
(function () {
    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function requireAuth() {
        const token = localStorage.getItem('juke_token');
        if (!token) {
            window.location.hash = '#/login';
            return null;
        }
        return token;
    }

    function getUser() {
        try {
            const token = localStorage.getItem('juke_token');
            if (!token) return null;
            const payload = JSON.parse(atob(token.split('.')[1]));
            return payload;
        } catch (_) {
            return null;
        }
    }

    function authHeaders() {
        const token = localStorage.getItem('juke_token');
        return token ? { 'Authorization': 'Bearer ' + token } : {};
    }

    function safeText(text) {
        return escapeHtml(text || '');
    }

    function formatDuration(seconds) {
        if (!seconds || isNaN(seconds)) return '0:00';
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return m + ':' + String(s).padStart(2, '0');
    }

    function createTrackCard(track, options) {
        options = options || {};
        const card = document.createElement('div');
        card.className = 'profile-track-card';
        const cover = track.cover_image_url || track.cover_url || 'images/juqe.png';
        const title = safeText(track.title || 'Untitled');
        const artist = safeText(track.artist_name || track.artist || 'Unknown artist');
        const duration = formatDuration(track.duration_seconds || track.duration);
        const uploader = safeText(track.uploader_name || track.username || '');
        const trackId = escapeHtml(track.id || '');

        let actions = '';
        if (options.canDelete) {
            actions += `<button class="profile-track-btn delete" data-repost-id="${escapeHtml(track.repost_id || '')}" data-track-id="${trackId}" title="Remove">×</button>`;
        }
        if (options.canRepost) {
            actions += `<button class="profile-track-btn repost" data-track-id="${trackId}" title="Repost">↻</button>`;
        }
        if (options.canPlay) {
            actions += `<button class="profile-track-btn play" data-track-id="${trackId}" title="Play">▶</button>`;
        }

        card.innerHTML = `
            <div class="profile-track-cover">
                <img src="${escapeHtml(cover)}" alt="${title}" loading="lazy">
            </div>
            <div class="profile-track-info">
                <div class="profile-track-title">${title}</div>
                <div class="profile-track-artist">${artist}</div>
                ${uploader ? `<div class="profile-track-uploader">by ${uploader}</div>` : ''}
                <div class="profile-track-meta">${duration}</div>
            </div>
            <div class="profile-track-actions">${actions}</div>
        `;

        const playBtn = card.querySelector('.play');
        if (playBtn) {
            playBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                if (window.JukePlayer && typeof window.JukePlayer.playTrackById === 'function') {
                    window.JukePlayer.playTrackById(String(track.id));
                } else {
                    window.location.hash = '#/feed?track=' + encodeURIComponent(track.id);
                }
            });
        }

        const repostBtn = card.querySelector('.repost');
        if (repostBtn) {
            repostBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                repostTrack(track.id, repostBtn);
            });
        }

        const deleteBtn = card.querySelector('.delete');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                const repostId = deleteBtn.getAttribute('data-repost-id');
                if (repostId) deleteRepost(repostId);
            });
        }

        return card;
    }

    async function api(path, options) {
        if (typeof apiFetchJson === 'function') {
            return await apiFetchJson(path, options || {});
        }
        const bases = (window.JukeAPIBase && typeof window.JukeAPIBase.getApiBases === 'function')
            ? window.JukeAPIBase.getApiBases()
            : ['https://juke-api.onrender.com/api', 'http://localhost:3000/api', '/api'];
        let lastErr = null;
        for (const base of bases) {
            try {
                const res = await fetch(base + path, options || {});
                const data = await res.json().catch(() => null);
                if (res.ok) return data;
                lastErr = new Error((data && data.error) || ('HTTP ' + res.status));
            } catch (e) {
                lastErr = e;
            }
        }
        throw lastErr || new Error('Network error');
    }

    async function loadPublicProfile() {
        const user = getUser();
        if (!user) return;
        const avatar = document.getElementById('publicAvatarImg');
        const bio = document.getElementById('publicBioText');
        const usernameEls = document.querySelectorAll('.username-display');
        if (avatar) {
            avatar.src = user.avatar_url || 'images/juqe.png';
        }
        if (bio) {
            bio.textContent = user.bio || 'No bio yet.';
        }
        usernameEls.forEach(el => el.textContent = user.username || '');
    }

    async function loadMyUploads() {
        const grid = document.getElementById('postsGrid');
        const countEl = document.getElementById('publicPostsCount');
        if (!grid) return;
        try {
            const data = await api('/tracks/my', { headers: authHeaders() });
            const tracks = Array.isArray(data) ? data : (data && data.tracks ? data.tracks : []);
            if (countEl) countEl.textContent = tracks.length;
            grid.innerHTML = '';
            if (tracks.length === 0) {
                grid.innerHTML = '<p class="profile-empty">No uploads yet. Go to <a href="#/upload">_uqload</a> to upload tracks.</p>';
                return;
            }
            tracks.forEach(track => {
                grid.appendChild(createTrackCard(track, { canPlay: true }));
            });
        } catch (e) {
            console.error('My uploads error:', e);
            grid.innerHTML = '<p class="profile-empty">Failed to load uploads.</p>';
        }
    }

    async function loadReposts() {
        const grid = document.getElementById('repostsGrid');
        const countEl = document.getElementById('publicRepostsCount');
        if (!grid) return;
        try {
            const data = await api('/reposts', { headers: authHeaders() });
            const reposts = data && data.reposts ? data.reposts : [];
            if (countEl) countEl.textContent = reposts.length;
            grid.innerHTML = '';
            if (reposts.length === 0) {
                grid.innerHTML = '<p class="profile-empty">No reposts yet. Use the Repost tab to add tracks.</p>';
                return;
            }
            reposts.forEach(item => {
                const track = {
                    ...item,
                    id: item.track_id,
                    repost_id: item.id
                };
                grid.appendChild(createTrackCard(track, { canPlay: true, canDelete: true }));
            });
        } catch (e) {
            console.error('Reposts error:', e);
            grid.innerHTML = '<p class="profile-empty">Failed to load reposts.</p>';
        }
    }

    async function searchRepostTracks(query) {
        const grid = document.getElementById('repostSearchResults');
        if (!grid) return;
        grid.innerHTML = '<p class="profile-empty">Searching...</p>';
        try {
            const data = await api('/search?q=' + encodeURIComponent(query) + '&type=tracks&limit=20', { headers: authHeaders() });
            const tracks = Array.isArray(data) ? data : (data && data.tracks ? data.tracks : []);
            grid.innerHTML = '';
            if (tracks.length === 0) {
                grid.innerHTML = '<p class="profile-empty">No tracks found.</p>';
                return;
            }
            tracks.forEach(track => {
                grid.appendChild(createTrackCard(track, { canPlay: true, canRepost: true }));
            });
        } catch (e) {
            console.error('Search repost error:', e);
            grid.innerHTML = '<p class="profile-empty">Search failed.</p>';
        }
    }

    async function repostTrack(trackId, btn) {
        try {
            btn.disabled = true;
            await api('/reposts', {
                method: 'POST',
                headers: { ...authHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify({ trackId: trackId })
            });
            btn.textContent = '✓';
            btn.classList.add('done');
            setTimeout(() => {
                switchTab('reposts');
                loadReposts();
            }, 400);
        } catch (e) {
            console.error('Repost error:', e);
            alert(e.message || 'Failed to repost');
            btn.disabled = false;
        }
    }

    async function deleteRepost(repostId) {
        if (!confirm('Remove this repost from your profile?')) return;
        try {
            await api('/reposts/' + repostId, {
                method: 'DELETE',
                headers: authHeaders()
            });
            loadReposts();
        } catch (e) {
            console.error('Delete repost error:', e);
            alert(e.message || 'Failed to remove repost');
        }
    }

    function switchTab(tabId) {
        document.querySelectorAll('.profile-tab').forEach(tab => {
            tab.classList.toggle('active', tab.getAttribute('data-tab') === tabId);
        });
        document.querySelectorAll('.profile-tab-content').forEach(content => {
            content.classList.toggle('active', content.id === 'tab-' + tabId);
        });
        if (tabId === 'posts') loadMyUploads();
        if (tabId === 'reposts') loadReposts();
    }

    function bindTabs() {
        document.querySelectorAll('.profile-tab').forEach(tab => {
            tab.addEventListener('click', function () {
                switchTab(tab.getAttribute('data-tab'));
            });
        });
    }

    function bindRepostSearch() {
        const btn = document.getElementById('repostSearchBtn');
        const input = document.getElementById('repostSearch');
        if (btn) {
            btn.addEventListener('click', function () {
                const q = input ? input.value.trim() : '';
                if (q) searchRepostTracks(q);
            });
        }
        if (input) {
            input.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') {
                    const q = input.value.trim();
                    if (q) searchRepostTracks(q);
                }
            });
        }
    }

    function init() {
        if (!requireAuth()) return;
        loadPublicProfile();
        bindTabs();
        loadMyUploads();
    }

    window.JukeProfile = window.JukeProfile || {};
    window.JukeProfile.init = init;
})();
