(function () {
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

    var STORAGE_KEY = 'juke_player_state';

    function getBasePath() {
        var p = (window.location && window.location.pathname) ? window.location.pathname.replace(/\\/g, '/') : '';
        return p.includes('/html/') ? '..' : '.';
    }

    function getImageUrl(relPathFromRoot) {
        return getBasePath() + '/' + relPathFromRoot.replace(/^\//, '');
    }

    function resolveAssetUrl(url) {
        if (!url) return null;
        if (url.startsWith('http://') || url.startsWith('https://')) return url;
        if (url.startsWith('/')) return getApiOrigin() + url;
        return url;
    }

    function isAuthed() {
        try {
            return !!localStorage.getItem('juke_token');
        } catch (_) {
            return false;
        }
    }

    function setPlayerVisible(visible) {
        var el = document.querySelector('.music-player');
        if (!el) return;
        el.style.display = visible ? '' : 'none';
        updateBodyPadding(el);
    }

    function updateBodyPadding(el) {
        try {
            if (!document.body) return;
            if (!el || el.style.display === 'none') {
                document.body.style.paddingBottom = '';
                return;
            }
            var rect = el.getBoundingClientRect();
            var h = Math.max(0, Math.ceil(rect.height || 0));
            document.body.style.paddingBottom = (h + 16) + 'px';
        } catch (_) {
        }
    }

    function formatTime(seconds) {
        if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
        var m = Math.floor(seconds / 60);
        var s = Math.floor(seconds % 60);
        return m + ':' + String(s).padStart(2, '0');
    }

    function safeParse(json) {
        try {
            return JSON.parse(json);
        } catch (_) {
            return null;
        }
    }

    var audio = new Audio();
    audio.preload = 'metadata';

    var history = [];
    var historyIndex = -1;

    var state = {
        trackId: null,
        title: 'Not Playing',
        artist: '-',
        coverUrl: null,
        audioUrl: null,
        videoUrl: null,
        isPlaying: false,
        currentTime: 0,
        volume: 0.7,
        muted: false,
        showVideo: false
    };

    function stopPlayback(resetState) {
        try {
            audio.pause();
        } catch (_) {
        }
        try {
            audio.currentTime = 0;
        } catch (_) {
        }
        if (resetState) {
            state.trackId = null;
            state.title = 'Not Playing';
            state.artist = '-';
            state.coverUrl = null;
            state.audioUrl = null;
            state.isPlaying = false;
            state.currentTime = 0;
            try {
                audio.removeAttribute('src');
                audio.load();
            } catch (_) {
            }
            try {
                localStorage.removeItem(STORAGE_KEY);
            } catch (_) {
            }
        } else {
            state.isPlaying = false;
            state.currentTime = 0;
            saveState();
        }

        try {
            if (typeof updateMobilePlayer === 'function') updateMobilePlayer();
        } catch (_) {
        }
    }

    function loadState() {
        var raw = localStorage.getItem(STORAGE_KEY);
        var parsed = raw ? safeParse(raw) : null;
        if (!parsed) return;

        // Merge into existing state so newer fields (e.g. videoUrl/showVideo) are preserved
        state.trackId = parsed.trackId || null;
        state.title = parsed.title || 'Not Playing';
        state.artist = parsed.artist || '-';
        state.coverUrl = parsed.coverUrl || null;
        state.audioUrl = parsed.audioUrl || null;
        state.isPlaying = !!parsed.isPlaying;
        state.currentTime = Number.isFinite(parsed.currentTime) ? parsed.currentTime : 0;
        state.volume = Number.isFinite(parsed.volume) ? parsed.volume : 0.7;
        state.muted = !!parsed.muted;

        audio.volume = state.volume;
        audio.muted = !!state.muted;
        if (state.audioUrl) {
            state.audioUrl = resolveAssetUrl(state.audioUrl);
            audio.src = state.audioUrl;
        }
    }

    function saveState() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            trackId: state.trackId,
            title: state.title,
            artist: state.artist,
            coverUrl: state.coverUrl,
            audioUrl: state.audioUrl,
            isPlaying: state.isPlaying,
            currentTime: audio.currentTime || state.currentTime || 0,
            volume: audio.volume,
            muted: !!audio.muted
        }));
    }

    function ensurePlayerElement() {
        var els = null;
        try {
            els = document.querySelectorAll('.music-player');
        } catch (_) {
            els = null;
        }

        var el = (els && els.length) ? els[0] : null;

        // Ensure we only ever have one desktop player element
        if (els && els.length > 1) {
            try {
                for (var i = 1; i < els.length; i++) {
                    if (els[i] && els[i].parentNode) {
                        els[i].parentNode.removeChild(els[i]);
                    }
                }
            } catch (_) {
            }
        }

        if (!el) {
            el = document.createElement('div');
            el.className = 'music-player';
            document.body.appendChild(el);
        }

        var hasControls = el.querySelector('#play') && el.querySelector('.progress-bar') && el.querySelector('.volume-slider');
        if (!hasControls) {
            el.innerHTML = `
                <div class="player-video-container" id="playerVideoContainer">
                    <video id="playerVideo" playsinline></video>
                    <button class="player-video-toggle" id="closeVideo" aria-label="Close video">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="now-playing">
                    <div class="track-info">
                        <img src="${getImageUrl('images/juke.png')}" alt="Now Playing" class="now-playing-cover">
                        <div class="track-details">
                            <h4 class="now-playing-title">Not Playing</h4>
                            <p class="now-playing-artist">-</p>
                        </div>
                        <button class="like-btn" aria-label="Like track" data-track-id="">
                            <i class="far fa-heart"></i>
                        </button>
                    </div>
                </div>

                <div class="player-controls">
                    <div class="control-buttons">
                        <button class="control-btn" id="shuffle" aria-label="Shuffle">
                            <i class="fas fa-random"></i>
                        </button>
                        <button class="control-btn" id="prev" aria-label="Previous track">
                            <i class="fas fa-step-backward"></i>
                        </button>
                        <button class="play-btn large" id="play" aria-label="Play/Pause">
                            <i class="fas fa-play"></i>
                        </button>
                        <button class="control-btn" id="next" aria-label="Next track">
                            <i class="fas fa-step-forward"></i>
                        </button>
                        <button class="control-btn" id="repeat" aria-label="Repeat">
                            <i class="fas fa-redo"></i>
                        </button>
                        <button class="control-btn" id="videoToggle" aria-label="Toggle video" style="display:none;">
                            <i class="fas fa-video"></i>
                        </button>
                    </div>
                    <div class="progress-container">
                        <span class="time current-time">0:00</span>
                        <div class="progress-bar">
                            <div class="progress"></div>
                        </div>
                        <span class="time duration">0:00</span>
                    </div>
                </div>

                <div class="volume-controls">
                    <button class="volume-btn" type="button" aria-label="Mute/Unmute">
                        <i class="fas fa-volume-up"></i>
                    </button>
                    <div class="volume-slider-container">
                        <input type="range" class="volume-slider" min="0" max="100" value="70">
                    </div>
                </div>
            `;
        }

        updateBodyPadding(el);
        return el;
    }

    function bindPlayer(el) {
        var alreadyBound = false;
        try {
            alreadyBound = !!(el && el.dataset && el.dataset.jukePlayerBound === 'true');
        } catch (_) {
            alreadyBound = false;
        }

        var coverEl = el.querySelector('.now-playing-cover');
        var titleEl = el.querySelector('.now-playing-title');
        var artistEl = el.querySelector('.now-playing-artist');
        var playBtn = el.querySelector('#play');
        var playIcon = playBtn ? playBtn.querySelector('i') : null;
        var prevBtn = el.querySelector('#prev');
        var nextBtn = el.querySelector('#next');
        var likeBtn = el.querySelector('.like-btn');
        var likeIcon = likeBtn ? likeBtn.querySelector('i') : null;
        var currentTimeEl = el.querySelector('.current-time');
        var durationEl = el.querySelector('.duration');
        var progressBar = el.querySelector('.progress-bar');
        var progressEl = el.querySelector('.progress');
        var volumeBtn = el.querySelector('.volume-btn');
        var volumeIcon = volumeBtn ? volumeBtn.querySelector('i') : null;
        var volumeSlider = el.querySelector('.volume-slider');

        function syncMuteUi() {
            if (volumeIcon) {
                volumeIcon.className = audio.muted ? 'fas fa-volume-xmark' : 'fas fa-volume-up';
            }
        }

        async function togglePlay() {
            if (!state.audioUrl) return;

            if (audio.paused) {
                try {
                    await audio.play();
                    state.isPlaying = true;
                    saveState();
                    render();
                } catch (_) {
                    state.isPlaying = false;
                    saveState();
                    render();
                }
            } else {
                audio.pause();
                state.isPlaying = false;
                saveState();
                render();
            }
        }

        function seekFromClientX(clientX) {
            if (!progressBar) return;
            if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
            var rect = progressBar.getBoundingClientRect();
            var x = clientX - rect.left;
            var pct = Math.max(0, Math.min(1, x / rect.width));
            audio.currentTime = pct * audio.duration;
            state.currentTime = audio.currentTime;
            saveState();
            render();
        }

        function render() {
            if (titleEl) titleEl.textContent = state.title || 'Not Playing';
            if (artistEl) artistEl.textContent = state.artist || '-';

            if (coverEl) {
                var cover = state.coverUrl || getImageUrl('images/juke.png');
                coverEl.src = cover;
            }

            if (volumeSlider) {
                volumeSlider.value = String(Math.round(audio.volume * 100));
            }

            syncMuteUi();

            try {
                if (likeIcon) {
                    var liked = false;
                    if (state.trackId && typeof window.isTrackLiked === 'function') {
                        liked = !!window.isTrackLiked(state.trackId);
                    }
                    likeIcon.className = liked ? 'fas fa-heart' : 'far fa-heart';
                    if (likeBtn && likeBtn.classList) {
                        likeBtn.classList.toggle('liked', !!liked);
                        likeBtn.setAttribute('data-track-id', state.trackId || '');
                    }
                }
            } catch (_) {
            }

            if (playIcon) {
                playIcon.className = state.isPlaying ? 'fas fa-pause' : 'fas fa-play';
            }

            if (currentTimeEl) currentTimeEl.textContent = formatTime(audio.currentTime || 0);
            if (durationEl) durationEl.textContent = formatTime(audio.duration || 0);

            if (progressEl && Number.isFinite(audio.duration) && audio.duration > 0) {
                var pct = Math.max(0, Math.min(1, (audio.currentTime || 0) / audio.duration)) * 100;
                progressEl.style.width = pct.toFixed(2) + '%';
            } else if (progressEl) {
                progressEl.style.width = '0%';
            }

            updateBodyPadding(el);
        }

        if (!alreadyBound) {
            if (playBtn) {
                playBtn.addEventListener('click', async function () {
                    togglePlay();
                });
            }

            if (prevBtn) {
                prevBtn.addEventListener('click', function () {
                    try {
                        // Use global track list first, then fall back to history
                        if (window.JukePlayer && typeof window.JukePlayer.playPrev === 'function') {
                            window.JukePlayer.playPrev();
                        } else if (historyIndex > 0) {
                            historyIndex -= 1;
                            playTrackById(history[historyIndex]);
                        }
                    } catch (_) {
                    }
                });
            }

            if (nextBtn) {
                nextBtn.addEventListener('click', function () {
                    try {
                        // Use global track list first, then fall back to history
                        if (window.JukePlayer && typeof window.JukePlayer.playNext === 'function') {
                            window.JukePlayer.playNext();
                        } else if (historyIndex >= 0 && historyIndex < history.length - 1) {
                            historyIndex += 1;
                            playTrackById(history[historyIndex]);
                        }
                    } catch (_) {
                    }
                });
            }

            if (likeBtn) {
                likeBtn.addEventListener('click', function () {
                    try {
                        if (!state.trackId) return;
                        if (typeof window.likeTrack === 'function') {
                            window.likeTrack(state.trackId);
                        }
                        // Immediately update player like button UI
                        if (likeIcon) {
                            var liked = false;
                            if (typeof window.isTrackLiked === 'function') {
                                liked = !!window.isTrackLiked(state.trackId);
                            }
                            likeIcon.className = liked ? 'fas fa-heart' : 'far fa-heart';
                            if (likeBtn && likeBtn.classList) {
                                likeBtn.classList.toggle('liked', !!liked);
                            }
                        }
                    } catch (_) {
                    }
                });
            }

            if (coverEl) {
                coverEl.addEventListener('click', function () {
                    togglePlay();
                });
            }

            if (progressBar) {
                progressBar.addEventListener('click', function (e) {
                    seekFromClientX(e.clientX);
                });

                progressBar.addEventListener('pointerdown', function (e) {
                    try {
                        if (e && typeof e.preventDefault === 'function') e.preventDefault();
                    } catch (_) {
                    }
                    seekFromClientX(e.clientX);
                });
            }

            if (volumeSlider) {
                volumeSlider.addEventListener('input', function () {
                    var v = Number(volumeSlider.value);
                    if (!Number.isFinite(v)) return;
                    audio.volume = Math.max(0, Math.min(1, v / 100));
                    state.volume = audio.volume;
                    if (audio.volume > 0) {
                        audio.muted = false;
                        state.muted = false;
                    }
                    saveState();
                    render();
                });
            }

            if (volumeBtn) {
                volumeBtn.addEventListener('click', function () {
                    audio.muted = !audio.muted;
                    state.muted = !!audio.muted;
                    saveState();
                    render();
                });
            }

            var videoToggleBtn = el.querySelector('#videoToggle');
            if (videoToggleBtn) {
                videoToggleBtn.addEventListener('click', function () {
                    toggleVideo();
                });
            }
            
            var closeVideoBtn = el.querySelector('#closeVideo');
            if (closeVideoBtn) {
                closeVideoBtn.addEventListener('click', function () {
                    state.showVideo = false;
                    updateVideoToggleVisibility();
                });
            }

            try {
                if (el && el.dataset) el.dataset.jukePlayerBound = 'true';
            } catch (_) {
            }
        }

        window.addEventListener('tracks:liked-changed', function (e) {
            try {
                if (!e || !e.detail) return;
                if (!state.trackId) return;
                if (String(e.detail.trackId) !== String(state.trackId)) return;
                render();
            } catch (_) {
            }
        });

        audio.addEventListener('loadedmetadata', function () {
            if (state.currentTime && state.currentTime > 0 && Number.isFinite(audio.duration)) {
                audio.currentTime = Math.min(state.currentTime, audio.duration);
            }
            render();
        });

        audio.addEventListener('timeupdate', function () {
            render();
        });

        audio.addEventListener('pause', function () {
            state.isPlaying = false;
            saveState();
            render();
        });

        audio.addEventListener('play', function () {
            state.isPlaying = true;
            saveState();
            render();
        });

        audio.addEventListener('ended', function () {
            state.isPlaying = false;
            saveState();
            render();
        });

        render();

        return { render: render };
    }

    async function fetchTrack(trackId) {
        var token = null;
        try {
            token = localStorage.getItem('juke_token');
        } catch (_) {
            token = null;
        }

        var bases = [];
        try {
            bases = [getApiBase(), 'https://juke-api.onrender.com/api'];
        } catch (_) {
            bases = ['https://juke-api.onrender.com/api'];
        }
        // de-dupe
        bases = bases.filter(function (v, i, a) {
            return !!v && a.indexOf(v) === i;
        });

        var lastErr = null;
        for (var i = 0; i < bases.length; i++) {
            var base = bases[i];
            try {
                var headers = {};
                if (token) headers.Authorization = 'Bearer ' + token;
                var res = await fetch(base + '/tracks/' + encodeURIComponent(trackId), {
                    headers: headers
                });
                if (!res.ok) {
                    lastErr = new Error('Failed to load track (' + res.status + ')');
                    continue;
                }
                var data = await res.json();
                try {
                    localStorage.setItem('juke_api_base', base);
                } catch (_) {
                }
                return data;
            } catch (e) {
                lastErr = e;
            }
        }

        throw lastErr || new Error('Failed to load track');
    }

    async function hydrateTrackMetaFromId(trackId) {
        if (!trackId) return;
        try {
            var track = await fetchTrack(trackId);
            if (!track || typeof track !== 'object') return;

            if (!state.title || state.title === 'Not Playing') {
                state.title = track.title || state.title || 'Unknown Title';
            }
            if (!state.artist || state.artist === '-') {
                state.artist = track.artist_name || state.artist || 'Unknown Artist';
            }
            if (!state.coverUrl) {
                state.coverUrl = resolveAssetUrl(track.cover_image_url) || state.coverUrl || getImageUrl('images/juke.png');
            }
            if (!state.audioUrl && track.audio_url) {
                state.audioUrl = resolveAssetUrl(track.audio_url) || null;
            }
            state.videoUrl = track.video_url ? resolveAssetUrl(track.video_url) : (state.videoUrl || null);

            saveState();

            try {
                if (window.JukePlayer && typeof window.JukePlayer.render === 'function') {
                    window.JukePlayer.render();
                }
            } catch (_) {
            }

            try {
                if (typeof updateMobilePlayer === 'function') updateMobilePlayer();
            } catch (_) {
            }
        } catch (_) {
        }
    }

    async function playTrackById(trackId) {
        var track = await fetchTrack(trackId);

        var audioUrl = resolveAssetUrl(track.audio_url);
        if (!audioUrl) return;

        state.trackId = track.id;
        state.title = track.title || 'Unknown Title';
        state.artist = track.artist_name || 'Unknown Artist';
        state.coverUrl = resolveAssetUrl(track.cover_image_url) || getImageUrl('images/juke.png');
        state.audioUrl = audioUrl;
        state.videoUrl = track.video_url ? resolveAssetUrl(track.video_url) : null;
        state.currentTime = 0;
        state.showVideo = false;
        
        updateVideoToggleVisibility();

        try {
            if (historyIndex >= 0 && historyIndex < history.length - 1) {
                history = history.slice(0, historyIndex + 1);
            }
            if (!history.length || String(history[history.length - 1]) !== String(track.id)) {
                history.push(track.id);
            }
            historyIndex = history.length - 1;
        } catch (_) {
        }

        audio.src = audioUrl;
        audio.currentTime = 0;
        audio.volume = state.volume;

        saveState();

        try {
            await audio.play();
            state.isPlaying = true;
            saveState();
        } catch (_) {
            state.isPlaying = false;
            saveState();
        }

        if (window.JukePlayer && typeof window.JukePlayer.render === 'function') {
            window.JukePlayer.render();
        }

        try {
            if (typeof updateMobilePlayer === 'function') updateMobilePlayer();
        } catch (_) {
        }
    }

    function updateVideoToggleVisibility() {
        var videoToggle = document.getElementById('videoToggle');
        var videoContainer = document.getElementById('playerVideoContainer');
        var videoEl = document.getElementById('playerVideo');
        var coverEl = document.querySelector('.now-playing-cover');
        
        if (videoToggle) {
            videoToggle.style.display = state.videoUrl ? '' : 'none';
        }
        
        if (videoContainer && videoEl) {
            if (state.showVideo && state.videoUrl) {
                videoContainer.classList.add('active');
                videoEl.src = state.videoUrl;
                videoEl.currentTime = audio.currentTime || 0;
                if (state.isPlaying) videoEl.play().catch(function(){});
            } else {
                videoContainer.classList.remove('active');
                videoEl.pause();
                videoEl.removeAttribute('src');
            }
        }
        
        if (coverEl) {
            coverEl.classList.toggle('has-video', !!state.videoUrl);
        }
    }
    
    function toggleVideo() {
        state.showVideo = !state.showVideo;
        updateVideoToggleVisibility();
    }
    
    function syncVideoWithAudio() {
        var videoEl = document.getElementById('playerVideo');
        if (!videoEl || !state.showVideo || !state.videoUrl) return;
        
        if (Math.abs(videoEl.currentTime - audio.currentTime) > 0.5) {
            videoEl.currentTime = audio.currentTime;
        }
        
        if (state.isPlaying && videoEl.paused) {
            videoEl.play().catch(function(){});
        } else if (!state.isPlaying && !videoEl.paused) {
            videoEl.pause();
        }
    }

    function initOrUpdatePlayer() {
        var el = document.querySelector('.music-player');
        if (!isAuthed()) {
            stopPlayback(true);
            setPlayerVisible(false);
            updateBodyPadding(null);
            return;
        }

        setPlayerVisible(true);
        loadState();
        el = ensurePlayerElement();
        var bound = bindPlayer(el);

        updateBodyPadding(el);

        audio.addEventListener('error', function () {
            try {
                console.error('Audio element error:', audio.error, 'src:', audio.currentSrc || audio.src);
            } catch (_) {
                console.error('Audio element error (unable to inspect src).');
            }
        });

        // Do not overwrite JukePlayer object (mobile + queue helpers attach onto it)
        window.JukePlayer = window.JukePlayer || {};
        window.JukePlayer.playTrackById = playTrackById;
        window.JukePlayer.stop = function () { stopPlayback(true); };
        window.JukePlayer.render = bound.render;

        window.playTrack = function (trackId) {
            return playTrackById(trackId);
        };

        if (state.audioUrl) {
            state.audioUrl = resolveAssetUrl(state.audioUrl);
            audio.src = state.audioUrl;
            audio.volume = state.volume;
            saveState();
            bound.render();
            try {
                if (typeof updateMobilePlayer === 'function') updateMobilePlayer();
            } catch (_) {
            }
            if (state.isPlaying) {
                audio.play().catch(function () {
                    state.isPlaying = false;
                    saveState();
                    bound.render();
                });
            }
        }

        try {
            if (typeof updateMobilePlayer === 'function') updateMobilePlayer();
        } catch (_) {
        }

        // If we restored playback but metadata is missing (older saved state), hydrate it
        try {
            if (state.trackId && (!state.title || state.title === 'Not Playing' || !state.artist || state.artist === '-' || !state.coverUrl)) {
                hydrateTrackMetaFromId(state.trackId);
            }
        } catch (_) {
        }

        return bound;
    }

    window.addEventListener('resize', function () {
        try {
            var el = document.querySelector('.music-player');
            updateBodyPadding(el);
        } catch (_) {
        }
    });

    // Global track list for prev/next functionality
    var globalTrackList = [];
    var globalTrackIndex = -1;

    function setGlobalTrackList(trackIds) {
        globalTrackList = trackIds || [];
    }

    function findCurrentTrackIndex() {
        if (!state.trackId || !globalTrackList.length) return -1;
        return globalTrackList.findIndex(function(id) {
            return String(id) === String(state.trackId);
        });
    }

    function playPrevTrack() {
        var idx = findCurrentTrackIndex();
        if (idx > 0) {
            playTrackById(globalTrackList[idx - 1]);
        } else if (historyIndex > 0) {
            historyIndex -= 1;
            playTrackById(history[historyIndex]);
        }
    }

    function playNextTrack() {
        var idx = findCurrentTrackIndex();
        if (idx >= 0 && idx < globalTrackList.length - 1) {
            playTrackById(globalTrackList[idx + 1]);
        } else if (historyIndex >= 0 && historyIndex < history.length - 1) {
            historyIndex += 1;
            playTrackById(history[historyIndex]);
        }
    }

    // Mobile player functions
    function updateMobilePlayer() {
        var miniPlayer = document.getElementById('mobileMiniPlayer');
        var miniCover = document.getElementById('miniCover');
        var miniTitle = document.getElementById('miniTitle');
        var miniArtist = document.getElementById('miniArtist');
        var miniProgress = document.getElementById('miniProgress');
        var miniPlay = document.getElementById('miniPlay');
        var miniLike = document.getElementById('miniLike');

        var fsPlayer = document.getElementById('fullscreenPlayer');
        var fsCover = document.getElementById('fsCover');
        var fsTitle = document.getElementById('fsTitle');
        var fsArtist = document.getElementById('fsArtist');
        var fsProgressFill = document.getElementById('fsProgressFill');
        var fsCurrentTime = document.getElementById('fsCurrentTime');
        var fsDuration = document.getElementById('fsDuration');
        var fsPlay = document.getElementById('fsPlay');

        if (!miniPlayer) return;

        // Show/hide mini player based on track state using class
        if (state.trackId && isAuthed()) {
            miniPlayer.classList.add('active');
        } else {
            miniPlayer.classList.remove('active');
            return;
        }

        // Update mini player
        if (miniCover) miniCover.src = state.coverUrl || getImageUrl('images/juke.png');
        if (miniTitle) miniTitle.textContent = state.title || 'Not Playing';
        if (miniArtist) miniArtist.textContent = state.artist || '-';

        // Progress
        if (miniProgress && Number.isFinite(audio.duration) && audio.duration > 0) {
            var pct = Math.max(0, Math.min(1, (audio.currentTime || 0) / audio.duration)) * 100;
            miniProgress.style.width = pct.toFixed(2) + '%';
        }

        // Play button
        if (miniPlay) {
            var icon = miniPlay.querySelector('i');
            if (icon) icon.className = state.isPlaying ? 'fas fa-pause' : 'fas fa-play';
        }

        // Like button
        if (miniLike) {
            var likeIcon = miniLike.querySelector('i');
            if (likeIcon && state.trackId && typeof window.isTrackLiked === 'function') {
                var liked = window.isTrackLiked(state.trackId);
                likeIcon.className = liked ? 'fas fa-heart' : 'far fa-heart';
            }
        }

        // Update fullscreen player
        if (fsCover) fsCover.src = state.coverUrl || getImageUrl('images/juke.png');
        if (fsTitle) fsTitle.textContent = state.title || 'Not Playing';
        if (fsArtist) fsArtist.textContent = state.artist || '-';
        if (fsCurrentTime) fsCurrentTime.textContent = formatTime(audio.currentTime || 0);
        if (fsDuration) fsDuration.textContent = formatTime(audio.duration || 0);

        if (fsProgressFill && Number.isFinite(audio.duration) && audio.duration > 0) {
            var pctFs = Math.max(0, Math.min(1, (audio.currentTime || 0) / audio.duration)) * 100;
            fsProgressFill.style.width = pctFs.toFixed(2) + '%';
        }

        if (fsPlay) {
            var fsIcon = fsPlay.querySelector('i');
            if (fsIcon) fsIcon.className = state.isPlaying ? 'fas fa-pause' : 'fas fa-play';
        }
    }

    function bindMobilePlayer() {
        var miniPlayer = document.getElementById('mobileMiniPlayer');
        var miniPlay = document.getElementById('miniPlay');
        var miniLike = document.getElementById('miniLike');
        var miniContent = miniPlayer ? miniPlayer.querySelector('.mini-content') : null;

        var fsPlayer = document.getElementById('fullscreenPlayer');
        var fsClose = document.getElementById('fsClose');
        var fsPlay = document.getElementById('fsPlay');
        var fsPrev = document.getElementById('fsPrev');
        var fsNext = document.getElementById('fsNext');
        var fsProgressBar = document.getElementById('fsProgressBar');

        if (miniPlay && !miniPlay.dataset.bound) {
            miniPlay.dataset.bound = '1';
            miniPlay.addEventListener('click', function(e) {
                e.stopPropagation();
                if (!state.audioUrl) return;
                if (audio.paused) {
                    audio.play().catch(function(){});
                } else {
                    audio.pause();
                }
            });
        }

        if (miniLike && !miniLike.dataset.bound) {
            miniLike.dataset.bound = '1';
            miniLike.addEventListener('click', function(e) {
                e.stopPropagation();
                if (state.trackId && typeof window.likeTrack === 'function') {
                    window.likeTrack(state.trackId);
                }
            });
        }

        // Click on mini player opens fullscreen
        if (miniContent && !miniContent.dataset.bound) {
            miniContent.dataset.bound = '1';
            miniContent.addEventListener('click', function(e) {
                if (e.target.closest('button')) return;
                if (fsPlayer) fsPlayer.classList.add('active');
            });
        }

        // Fullscreen player controls
        if (fsClose && !fsClose.dataset.bound) {
            fsClose.dataset.bound = '1';
            fsClose.addEventListener('click', function() {
                if (fsPlayer) fsPlayer.classList.remove('active');
            });
        }

        if (fsPlay && !fsPlay.dataset.bound) {
            fsPlay.dataset.bound = '1';
            fsPlay.addEventListener('click', function() {
                if (!state.audioUrl) return;
                if (audio.paused) {
                    audio.play().catch(function(){});
                } else {
                    audio.pause();
                }
            });
        }

        if (fsPrev && !fsPrev.dataset.bound) {
            fsPrev.dataset.bound = '1';
            fsPrev.addEventListener('click', function() {
                playPrevTrack();
            });
        }

        if (fsNext && !fsNext.dataset.bound) {
            fsNext.dataset.bound = '1';
            fsNext.addEventListener('click', function() {
                playNextTrack();
            });
        }

        if (fsProgressBar && !fsProgressBar.dataset.bound) {
            fsProgressBar.dataset.bound = '1';
            fsProgressBar.addEventListener('click', function(e) {
                if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
                var rect = fsProgressBar.getBoundingClientRect();
                var x = e.clientX - rect.left;
                var pct = Math.max(0, Math.min(1, x / rect.width));
                audio.currentTime = pct * audio.duration;
            });
        }
    }

    // Update mobile navigation active state
    function updateMobileNavActive() {
        var hash = window.location.hash || '#/feed';
        var navItems = document.querySelectorAll('.mobile-nav-item');
        navItems.forEach(function(item) {
            var nav = item.getAttribute('data-nav');
            if (hash.includes(nav)) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
    }

    document.addEventListener('DOMContentLoaded', function () {
        initOrUpdatePlayer();
        bindMobilePlayer();
        updateMobileNavActive();

        // Update mobile player on audio events
        audio.addEventListener('timeupdate', updateMobilePlayer);
        audio.addEventListener('play', updateMobilePlayer);
        audio.addEventListener('pause', updateMobilePlayer);
        audio.addEventListener('loadedmetadata', updateMobilePlayer);
    });

    document.addEventListener('auth:changed', function () {
        initOrUpdatePlayer();
        updateMobilePlayer();
    });

    window.addEventListener('hashchange', function() {
        updateMobileNavActive();
    });

    // Expose for external use
    window.JukePlayer = window.JukePlayer || {};
    window.JukePlayer.setTrackList = setGlobalTrackList;
    window.JukePlayer.playPrev = playPrevTrack;
    window.JukePlayer.playNext = playNextTrack;
    window.JukePlayer.updateMobile = updateMobilePlayer;
})();
