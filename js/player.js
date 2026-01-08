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

    var state = {
        trackId: null,
        title: 'Not Playing',
        artist: '-',
        coverUrl: null,
        audioUrl: null,
        isPlaying: false,
        currentTime: 0,
        volume: 0.7
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
    }

    function loadState() {
        var raw = localStorage.getItem(STORAGE_KEY);
        var parsed = raw ? safeParse(raw) : null;
        if (!parsed) return;

        state = {
            trackId: parsed.trackId || null,
            title: parsed.title || 'Not Playing',
            artist: parsed.artist || '-',
            coverUrl: parsed.coverUrl || null,
            audioUrl: parsed.audioUrl || null,
            isPlaying: !!parsed.isPlaying,
            currentTime: Number.isFinite(parsed.currentTime) ? parsed.currentTime : 0,
            volume: Number.isFinite(parsed.volume) ? parsed.volume : 0.7
        };

        audio.volume = state.volume;
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
            volume: audio.volume
        }));
    }

    function ensurePlayerElement() {
        var el = document.querySelector('.music-player');
        if (!el) {
            el = document.createElement('div');
            el.className = 'music-player';
            document.body.appendChild(el);
        }

        var hasControls = el.querySelector('#play') && el.querySelector('.progress-bar') && el.querySelector('.volume-slider');
        if (!hasControls) {
            el.innerHTML = `
                <div class="now-playing">
                    <div class="track-info">
                        <img src="${getImageUrl('images/juke.png')}" alt="Now Playing" class="now-playing-cover">
                        <div class="track-details">
                            <h4 class="now-playing-title">Not Playing</h4>
                            <p class="now-playing-artist">-</p>
                        </div>
                        <button class="like-btn" aria-label="Like track">
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
                    <i class="fas fa-volume-up"></i>
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
        var currentTimeEl = el.querySelector('.current-time');
        var durationEl = el.querySelector('.duration');
        var progressBar = el.querySelector('.progress-bar');
        var progressEl = el.querySelector('.progress');
        var volumeSlider = el.querySelector('.volume-slider');

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
                    saveState();
                });
            }

            try {
                if (el && el.dataset) el.dataset.jukePlayerBound = 'true';
            } catch (_) {
            }
        }

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
        var res = await fetch(getApiBase() + '/tracks/' + encodeURIComponent(trackId));
        if (!res.ok) {
            throw new Error('Failed to load track');
        }
        return res.json();
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
        state.currentTime = 0;

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

        window.JukePlayer = {
            playTrackById: playTrackById,
            stop: function () { stopPlayback(true); },
            render: bound.render
        };

        window.playTrack = function (trackId) {
            return playTrackById(trackId);
        };

        if (state.audioUrl) {
            state.audioUrl = resolveAssetUrl(state.audioUrl);
            audio.src = state.audioUrl;
            audio.volume = state.volume;
            saveState();
            bound.render();
            if (state.isPlaying) {
                audio.play().catch(function () {
                    state.isPlaying = false;
                    saveState();
                    bound.render();
                });
            }
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

    document.addEventListener('DOMContentLoaded', function () {
        initOrUpdatePlayer();
    });

    document.addEventListener('auth:changed', function () {
        initOrUpdatePlayer();
    });
})();
