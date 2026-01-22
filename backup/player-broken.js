// JUKE Music Player - Clean Architecture

(() => {
    'use strict';

    // ==================== CONFIGURATION ====================
    const CONFIG = {
        STORAGE_KEY: 'juke_player_state',
        BODY_PADDING_OFFSET: 16
    };

    // ==================== UTILITIES ====================
    const Utils = {
        getBasePath() {
            const path = window.location?.pathname?.replace(/\\/g, '/') || '';
            return path.includes('/html/') ? '..' : '.';
        },

        getImageUrl(relPathFromRoot) {
            return Utils.getBasePath() + '/' + relPathFromRoot.replace(/^\//, '');
        },

        resolveAssetUrl(url) {
            if (!url) return null;
            if (url.startsWith('http://') || url.startsWith('https://')) return url;
            if (url.startsWith('/')) return window.JukeAPIBase.getApiOrigin() + url;
            return url;
        },

        isAuthed() {
            try {
                return !!localStorage.getItem('juke_token');
            } catch {
                return false;
            }
        },

        formatTime(seconds) {
            if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
            const minutes = Math.floor(seconds / 60);
            const secs = Math.floor(seconds % 60);
            return `${minutes}:${String(secs).padStart(2, '0')}`;
        },

        safeParse(json) {
            try {
                return JSON.parse(json);
            } catch {
                return null;
            }
        },

        buildShareUrl(trackId) {
            try {
                const origin = window.location?.origin || '';
                return `${origin.replace(/\/$/, '')}/#/feed?track=${encodeURIComponent(String(trackId))}`;
            } catch {
                return `#/feed?track=${encodeURIComponent(String(trackId))}`;
            }
        }
    };

    // ==================== UI MANAGER ====================
    class UIManager {
        static setPlayerVisible(visible) {
            const player = document.querySelector('.music-player');
            if (!player) return;
            
            player.style.display = visible ? '' : 'none';
            UIManager.updateBodyPadding(player);
        }

        static updateBodyPadding(player) {
            try {
                if (!document.body) return;
                
                if (!player || player.style.display === 'none') {
                    document.body.style.paddingBottom = '';
                    return;
                }
                
                const rect = player.getBoundingClientRect();
                const height = Math.max(0, Math.ceil(rect.height || 0));
                document.body.style.paddingBottom = `${height + CONFIG.BODY_PADDING_OFFSET}px`;
            } catch {}
        }

        static ensureShareSheetStyles() {
            if (document.getElementById('jukeShareSheetStyles')) return;

            const style = document.createElement('style');
            style.id = 'jukeShareSheetStyles';
            style.textContent = `
                .juke-share-root{position:fixed;inset:0;z-index:2000;}
                .juke-share-backdrop{position:absolute;inset:0;background:rgba(0,0,0,0.5);}
                .juke-share-sheet{position:absolute;bottom:0;left:0;right:0;background:#fff;border-radius:12px 12px 0 0;padding:20px;transform:translateY(100%);transition:transform 0.3s;}
                .juke-share-sheet.open{transform:translateY(0);}
                .juke-share-title{font-size:18px;font-weight:600;margin-bottom:16px;}
                .juke-share-url{font-size:14px;color:#666;margin-bottom:16px;word-break:break-all;}
                .juke-share-actions{display:flex;gap:12px;}
                .juke-share-btn{flex:1;padding:12px;border:1px solid #ddd;border-radius:8px;background:#fff;cursor:pointer;font-size:14px;}
                .juke-share-btn:hover{background:#f5f5f5;}
                .juke-share-close{position:absolute;top:12px;right:12px;background:none;border:none;font-size:20px;cursor:pointer;}
            `;
            document.head.appendChild(style);
        }

        static openShareFallback(opts) {
            UIManager.ensureShareSheetStyles();
            
            // Remove existing share sheet
            const existing = document.getElementById('jukeShareRoot');
            existing?.remove();

            const root = document.createElement('div');
            root.id = 'jukeShareRoot';
            root.className = 'juke-share-root';

            const title = opts?.title || 'Share';
            const text = opts?.text || '';
            const url = opts?.url || '';
            const fullTitle = text ? `${title} • ${text}` : title;

            root.innerHTML = `
                <div class="juke-share-backdrop" data-juke-share-close="1"></div>
                <div class="juke-share-sheet">
                    <button class="juke-share-close" data-juke-share-close="1">&times;</button>
                    <div class="juke-share-title">${Utils.escapeHtml(fullTitle)}</div>
                    <div class="juke-share-url">${Utils.escapeHtml(url)}</div>
                    <div class="juke-share-actions">
                        <button class="juke-share-btn" data-share-action="copy">Copy Link</button>
                        <button class="juke-share-btn" data-share-action="native">Share</button>
                    </div>
                </div>
            `;

            document.body.appendChild(root);

            // Animate in
            requestAnimationFrame(() => {
                root.querySelector('.juke-share-sheet').classList.add('open');
            });

            const close = () => {
                root.querySelector('.juke-share-sheet').classList.remove('open');
                setTimeout(() => root.remove(), 300);
            };

            root.addEventListener('click', (e) => {
                const target = e.target;
                
                if (target.getAttribute('data-juke-share-close') === '1') {
                    close();
                    return;
                }

                const btn = target.closest('[data-share-action]');
                if (!btn) return;

                const action = btn.getAttribute('data-share-action');
                const payload = `${title} ${text} ${url}`.trim();

                if (action === 'copy') {
                    if (navigator.clipboard?.writeText) {
                        navigator.clipboard.writeText(url).then(close).catch(() => {
                            window.prompt('Copy this link:', url);
                            close();
                        });
                    } else {
                        window.prompt('Copy this link:', url);
                        close();
                    }
                } else if (action === 'native') {
                    if (navigator.share) {
                        navigator.share({ title, text, url }).catch(close);
                    } else {
                        close();
                    }
                }
            });
        }

        static escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
    }

    // ==================== PLAYER STATE ====================
    class PlayerState {
        constructor() {
            this.state = {
                trackId: null,
                title: 'Not Playing',
                artist: '-',
                coverUrl: null,
                audioUrl: null,
                videoUrl: null,
                duration: 0,
                currentTime: 0,
                isPlaying: false,
                volume: 1,
                isMuted: false,
                isRepeat: false,
                isShuffle: false,
                showVideo: false
            };
            
            this.history = [];
            this.historyIndex = -1;
            this.audio = new Audio();
            this.audio.preload = 'metadata';
        }

        loadState() {
            try {
                const saved = localStorage.getItem(CONFIG.STORAGE_KEY);
                if (saved) {
                    const parsed = Utils.safeParse(saved);
                    if (parsed) {
                        Object.assign(this.state, parsed);
                        this.audio.volume = this.state.volume;
                        this.audio.muted = this.state.isMuted;
                    }
                }
            } catch {}
        }

        saveState() {
            try {
                localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(this.state));
            } catch {}
        }

        resetState() {
            this.state = {
                trackId: null,
                title: 'Not Playing',
                artist: '-',
                coverUrl: null,
                audioUrl: null,
                videoUrl: null,
                duration: 0,
                currentTime: 0,
                isPlaying: false,
                volume: 1,
                isMuted: false,
                isRepeat: false,
                isShuffle: false,
                showVideo: false
            };
            this.saveState();
        }

        addToHistory(track) {
            // Remove any future history if we're not at the end
            if (this.historyIndex < this.history.length - 1) {
                this.history = this.history.slice(0, this.historyIndex + 1);
            }
            
            this.history.push(track);
            this.historyIndex = this.history.length - 1;
            
            // Limit history size
            if (this.history.length > 50) {
                this.history = this.history.slice(-50);
                this.historyIndex = this.history.length - 1;
            }
        }
    }

    // ==================== PLAYER CONTROLLER ====================
    class PlayerController {
        constructor(state) {
            this.state = state;
            this.setupAudioEvents();
        }

        setupAudioEvents() {
            const audio = this.state.audio;

            audio.addEventListener('timeupdate', () => {
                this.state.currentTime = audio.currentTime;
                this.render();
            });

            audio.addEventListener('loadedmetadata', () => {
                this.state.duration = audio.duration;
                this.render();
            });

            audio.addEventListener('ended', () => {
                this.handleTrackEnd();
            });

            audio.addEventListener('error', () => {
                console.error('Audio error:', audio.error);
                this.stop();
            });

            audio.addEventListener('volumechange', () => {
                this.state.volume = audio.volume;
                this.state.isMuted = audio.muted;
                this.saveState();
            });
        }

        playTrack(track, opts = {}) {
            if (!track || typeof track !== 'object') return;

            const autoShowVideo = opts === true || opts?.autoShowVideo;
            const audioUrl = track.audio_url ? Utils.resolveAssetUrl(track.audio_url) : null;
            
            if (!audioUrl) return;

            // Add to history
            this.state.addToHistory(track);

            // Update state
            this.state.trackId = track.id != null ? track.id : this.state.trackId;
            this.state.title = track.title || 'Unknown';
            this.state.artist = track.artist_name || track.uploader_username || '-';
            this.state.coverUrl = track.cover_image_url ? Utils.resolveAssetUrl(track.cover_image_url) : null;
            this.state.audioUrl = audioUrl;
            this.state.videoUrl = track.video_url ? Utils.resolveAssetUrl(track.video_url) : null;
            this.state.showVideo = autoShowVideo && !!this.state.videoUrl;
            this.state.isPlaying = true;

            this.saveState();

            // Load and play
            this.state.audio.src = audioUrl;
            
            const playPromise = this.state.audio.play();
            
            if (playPromise?.then) {
                playPromise.then(() => {
                    this.state.isPlaying = true;
                    this.saveState();
                    this.render();
                    this.updateMobilePlayer();
                }).catch(() => {
                    this.state.isPlaying = false;
                    this.saveState();
                    this.render();
                    this.updateMobilePlayer();
                });
            }

            this.render();
            this.updateMobilePlayer();
        }

        stop(resetState = false) {
            try {
                this.state.audio.pause();
                this.state.audio.src = '';
            } catch {}

            if (resetState) {
                this.state.resetState();
            } else {
                this.state.isPlaying = false;
                this.state.currentTime = 0;
                this.saveState();
            }

            this.render();
            this.updateMobilePlayer();
        }

        pause() {
            this.state.audio.pause();
            this.state.isPlaying = false;
            this.saveState();
            this.render();
            this.updateMobilePlayer();
        }

        resume() {
            this.state.audio.play().then(() => {
                this.state.isPlaying = true;
                this.saveState();
                this.render();
                this.updateMobilePlayer();
            }).catch(() => {
                this.state.isPlaying = false;
                this.saveState();
                this.render();
                this.updateMobilePlayer();
            });
        }

        togglePlay() {
            if (this.state.isPlaying) {
                this.pause();
            } else {
                this.resume();
            }
        }

        seek(time) {
            if (typeof time === 'number' && isFinite(time)) {
                this.state.audio.currentTime = Math.max(0, Math.min(time, this.state.duration));
            }
        }

        setVolume(volume) {
            if (typeof volume === 'number' && volume >= 0 && volume <= 1) {
                this.state.audio.volume = volume;
            }
        }

        toggleMute() {
            this.state.audio.muted = !this.state.audio.muted;
        }

        toggleRepeat() {
            this.state.isRepeat = !this.state.isRepeat;
            this.saveState();
            this.render();
        }

        toggleShuffle() {
            this.state.isShuffle = !this.state.isShuffle;
            this.saveState();
            this.render();
        }

        handleTrackEnd() {
            if (this.state.isRepeat) {
                this.state.audio.currentTime = 0;
                this.state.audio.play();
            } else {
                this.playNext();
            }
        }

        playNext() {
            // This would integrate with track list logic
            // For now, just stop
            this.stop();
        }

        playPrevious() {
            // This would integrate with track list logic
            // For now, just restart current track
            this.seek(0);
        }

        saveState() {
            this.state.saveState();
        }

        render() {
            try {
                if (typeof window.JukePlayer?.render === 'function') {
                    window.JukePlayer.render();
                }
            } catch {}
        }

        updateMobilePlayer() {
            try {
                if (typeof updateMobilePlayer === 'function') {
                    updateMobilePlayer();
                }
            } catch {}
        }
    }

    // ==================== SHARE MANAGER ====================
    class ShareManager {
        static shareTrack(trackId, options = {}) {
            const url = Utils.buildShareUrl(trackId);
            const title = options.title || 'Track';
            const text = options.text || '';

            if (navigator.share) {
                navigator.share({ title, text, url }).catch(() => {
                    UIManager.openShareFallback({ title, text, url });
                });
            } else {
                UIManager.openShareFallback({ title, text, url });
            }
        }
    }

    // ==================== INITIALIZATION ====================
    const playerState = new PlayerState();
    const playerController = new PlayerController(playerState);

    // Load saved state
    playerState.loadState();

    // Global API
    window.JukePlayer = {
        // State
        getState: () => playerState.state,
        getHistory: () => playerState.history,
        
        // Playback controls
        playTrack: (track, opts) => playerController.playTrack(track, opts),
        stop: (reset) => playerController.stop(reset),
        pause: () => playerController.pause(),
        resume: () => playerController.resume(),
        togglePlay: () => playerController.togglePlay(),
        
        // Navigation
        playNext: () => playerController.playNext(),
        playPrevious: () => playerController.playPrevious(),
        
        // Controls
        seek: (time) => playerController.seek(time),
        setVolume: (volume) => playerController.setVolume(volume),
        toggleMute: () => playerController.toggleMute(),
        toggleRepeat: () => playerController.toggleRepeat(),
        toggleShuffle: () => playerController.toggleShuffle(),
        
        // UI
        setVisible: (visible) => UIManager.setPlayerVisible(visible),
        render: () => playerController.render(),
        
        // Share
        shareTrack: (trackId, opts) => ShareManager.shareTrack(trackId, opts),
        
        // Utilities
        formatTime: (seconds) => Utils.formatTime(seconds),
        isAuthed: () => Utils.isAuthed(),
        
        // Advanced
        setTrackList: (trackIds) => {
            // Store track list for navigation
            playerState.trackList = Array.isArray(trackIds) ? trackIds : [];
        },
        
        setQueueTracks: (tracks) => {
            // Store queue tracks
            playerState.queueTracks = Array.isArray(tracks) ? tracks : [];
        }
    };

    // Legacy global functions for backward compatibility
    window.playTrack = (track, opts) => window.JukePlayer.playTrack(track, opts);
    window.stopTrack = (reset) => window.JukePlayer.stop(reset);
    window.pauseTrack = () => window.JukePlayer.pause();
    window.resumeTrack = () => window.JukePlayer.resume();
    window.togglePlay = () => window.JukePlayer.togglePlay();
    window.seekTrack = (time) => window.JukePlayer.seek(time);
    window.setVolume = (volume) => window.JukePlayer.setVolume(volume);
    window.toggleMute = () => window.JukePlayer.toggleMute();
    window.toggleRepeat = () => window.JukePlayer.toggleRepeat();
    window.toggleShuffle = () => window.JukePlayer.toggleShuffle();
    window.shareTrack = (trackId, opts) => window.JukePlayer.shareTrack(trackId, opts);

    // Initialize UI
    UIManager.setPlayerVisible(true);

    // Auto-save state periodically
    setInterval(() => {
        playerState.saveState();
    }, 5000);

})();
