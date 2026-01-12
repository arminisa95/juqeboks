// Media Editor for Image/Video Uploads
class MediaEditor {
    constructor() {
        this.overlay = null;
        this.container = null;
        this.preview = null;
        this.video = null;
        this.audio = null;
        this.originalFile = null;
        this.originalUrl = null;
        this.trimStart = 0;
        this.trimEnd = 0;
        this.duration = 0;
        this.isPlaying = false;
        this.currentTime = 0;
        this.filters = {
            brightness: 100,
            contrast: 100,
            saturation: 100,
            blur: 0
        };
        this.init();
    }

    init() {
        this.createEditor();
        this.bindEvents();
    }

    createEditor() {
        // Create overlay
        this.overlay = document.createElement('div');
        this.overlay.className = 'media-editor-overlay';
        this.overlay.innerHTML = `
            <div class="media-editor-container">
                <div class="media-editor-header">
                    <div class="media-editor-title">
                        <i class="fas fa-edit"></i>
                        Media Editor
                    </div>
                    <button class="media-editor-close" type="button">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="media-editor-content">
                    <div class="media-editor-preview">
                        <div class="media-editor-loading">
                            <i class="fas fa-spinner"></i>
                            Loading media...
                        </div>
                    </div>
                    <div class="media-editor-controls">
                        <div class="media-editor-section">
                            <div class="media-editor-section-title">
                                <i class="fas fa-play"></i>
                                Playback
                            </div>
                            <div class="playback-controls">
                                <button class="playback-btn" type="button" disabled>
                                    <i class="fas fa-play"></i>
                                </button>
                                <div class="playback-time">00:00 / 00:00</div>
                            </div>
                        </div>

                        <div class="media-editor-section">
                            <div class="media-editor-section-title">
                                <i class="fas fa-cut"></i>
                                Trim
                            </div>
                            <div class="timeline-container">
                                <div class="timeline-tracks">
                                    <div class="timeline-track"></div>
                                    <div class="timeline-track-selection"></div>
                                </div>
                                <div class="timeline-controls">
                                    <div class="timeline-time">00:00</div>
                                    <div class="timeline-slider">
                                        <div class="timeline-slider-fill"></div>
                                        <div class="timeline-slider-handle" style="left: 0%"></div>
                                    </div>
                                    <div class="timeline-time">00:00</div>
                                </div>
                                <div class="trim-controls">
                                    <div class="trim-input-group">
                                        <input type="text" class="trim-input" placeholder="Start" value="00:00">
                                        <input type="text" class="trim-input" placeholder="End" value="00:00">
                                    </div>
                                    <button class="trim-btn" type="button">Reset</button>
                                </div>
                            </div>
                        </div>

                        <div class="media-editor-section">
                            <div class="media-editor-section-title">
                                <i class="fas fa-sliders-h"></i>
                                Filters
                            </div>
                            <div class="filter-controls">
                                <button class="filter-btn" data-filter="original">Original</button>
                                <button class="filter-btn" data-filter="vintage">Vintage</button>
                                <button class="filter-btn" data-filter="noir">Noir</button>
                                <button class="filter-btn" data-filter="vivid">Vivid</button>
                            </div>
                            <div class="filter-slider">
                                <div class="filter-slider-label">
                                    <span>Brightness</span>
                                    <span>100%</span>
                                </div>
                                <input type="range" min="0" max="200" value="100" data-filter="brightness">
                            </div>
                            <div class="filter-slider">
                                <div class="filter-slider-label">
                                    <span>Contrast</span>
                                    <span>100%</span>
                                </div>
                                <input type="range" min="0" max="200" value="100" data-filter="contrast">
                            </div>
                            <div class="filter-slider">
                                <div class="filter-slider-label">
                                    <span>Saturation</span>
                                    <span>100%</span>
                                </div>
                                <input type="range" min="0" max="200" value="100" data-filter="saturation">
                            </div>
                            <div class="filter-slider">
                                <div class="filter-slider-label">
                                    <span>Blur</span>
                                    <span>0px</span>
                                </div>
                                <input type="range" min="0" max="10" value="0" data-filter="blur">
                            </div>
                        </div>

                        <div class="action-buttons">
                            <button class="action-btn cancel" type="button">Cancel</button>
                            <button class="action-btn apply" type="button" disabled>Apply Changes</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(this.overlay);
        this.container = this.overlay.querySelector('.media-editor-container');
        this.preview = this.overlay.querySelector('.media-editor-preview');
    }

    bindEvents() {
        // Close button
        this.overlay.querySelector('.media-editor-close').addEventListener('click', () => {
            this.close();
        });

        // Cancel button
        this.overlay.querySelector('.action-btn.cancel').addEventListener('click', () => {
            this.close();
        });

        // Apply button
        this.overlay.querySelector('.action-btn.apply').addEventListener('click', () => {
            this.applyChanges();
        });

        // Playback controls
        const playbackBtn = this.overlay.querySelector('.playback-btn');
        playbackBtn.addEventListener('click', () => {
            this.togglePlayback();
        });

        // Timeline slider
        const timelineSlider = this.overlay.querySelector('.timeline-slider');
        const timelineHandle = this.overlay.querySelector('.timeline-slider-handle');
        
        let isDragging = false;
        
        const handleTimelineDrag = (e) => {
            if (!isDragging) return;
            
            const rect = timelineSlider.getBoundingClientRect();
            const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
            const percentage = (x / rect.width) * 100;
            
            timelineHandle.style.left = percentage + '%';
            this.overlay.querySelector('.timeline-slider-fill').style.width = percentage + '%';
            
            if (this.video || this.audio) {
                const time = (percentage / 100) * this.duration;
                this.setCurrentTime(time);
            }
        };

        timelineHandle.addEventListener('mousedown', () => {
            isDragging = true;
        });

        document.addEventListener('mousemove', handleTimelineDrag);
        document.addEventListener('mouseup', () => {
            isDragging = false;
        });

        timelineSlider.addEventListener('click', (e) => {
            if (e.target === timelineHandle) return;
            
            const rect = timelineSlider.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const percentage = (x / rect.width) * 100;
            
            timelineHandle.style.left = percentage + '%';
            this.overlay.querySelector('.timeline-slider-fill').style.width = percentage + '%';
            
            if (this.video || this.audio) {
                const time = (percentage / 100) * this.duration;
                this.setCurrentTime(time);
            }
        });

        // Trim inputs
        const trimInputs = this.overlay.querySelectorAll('.trim-input');
        trimInputs.forEach((input, index) => {
            input.addEventListener('input', () => {
                this.updateTrimFromInputs();
            });
        });

        // Reset trim button
        this.overlay.querySelector('.trim-btn').addEventListener('click', () => {
            this.resetTrim();
        });

        // Filter buttons
        const filterBtns = this.overlay.querySelectorAll('.filter-btn');
        filterBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.applyFilter(btn.dataset.filter);
                filterBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });

        // Filter sliders
        const filterSliders = this.overlay.querySelectorAll('.filter-slider input');
        filterSliders.forEach(slider => {
            slider.addEventListener('input', () => {
                this.updateFilter(slider.dataset.filter, slider.value);
            });
        });

        // Close on overlay click
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) {
                this.close();
            }
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (!this.overlay.classList.contains('active')) return;
            
            if (e.key === 'Escape') {
                this.close();
            } else if (e.key === ' ') {
                e.preventDefault();
                this.togglePlayback();
            }
        });
    }

    open(file) {
        this.originalFile = file;
        this.originalUrl = URL.createObjectURL(file);
        
        this.overlay.classList.add('active');
        this.loadMedia(file);
    }

    loadMedia(file) {
        const fileType = file.type.split('/')[0];
        
        if (fileType === 'image') {
            this.loadImage(file);
        } else if (fileType === 'video' || fileType === 'audio') {
            this.loadVideoAudio(file);
        } else {
            this.showError('Unsupported file type');
        }
    }

    loadImage(file) {
        const img = document.createElement('img');
        img.src = this.originalUrl;
        img.onload = () => {
            this.preview.innerHTML = '';
            this.preview.appendChild(img);
            this.setupImageControls();
            this.overlay.querySelector('.action-btn.apply').disabled = false;
        };
        img.onerror = () => {
            this.showError('Failed to load image');
        };
    }

    loadVideoAudio(file) {
        const fileType = file.type.split('/')[0];
        const element = document.createElement(fileType);
        element.src = this.originalUrl;
        element.controls = false;
        
        if (fileType === 'video') {
            this.video = element;
        } else {
            this.audio = element;
            // For audio, show a placeholder
            const audioPlaceholder = document.createElement('div');
            audioPlaceholder.style.cssText = `
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                color: white;
                text-align: center;
                padding: 40px;
            `;
            audioPlaceholder.innerHTML = `
                <i class="fas fa-music" style="font-size: 48px; margin-bottom: 16px; opacity: 0.6;"></i>
                <div style="margin-bottom: 8px;">${file.name}</div>
                <div style="font-size: 0.9rem; opacity: 0.6;">Audio File</div>
            `;
            this.preview.innerHTML = '';
            this.preview.appendChild(audioPlaceholder);
            this.preview.appendChild(element);
        }
        
        element.addEventListener('loadedmetadata', () => {
            this.duration = element.duration;
            this.trimEnd = this.duration;
            this.setupVideoAudioControls();
            this.updateTimeDisplay();
            this.overlay.querySelector('.action-btn.apply').disabled = false;
        });
        
        element.addEventListener('timeupdate', () => {
            this.currentTime = element.currentTime;
            this.updateTimeline();
            this.updateTimeDisplay();
        });
        
        element.addEventListener('ended', () => {
            this.isPlaying = false;
            this.updatePlaybackButton();
        });
    }

    setupImageControls() {
        // Hide playback controls for images
        this.overlay.querySelector('.playback-controls').style.display = 'none';
        this.overlay.querySelector('.timeline-container').style.display = 'none';
    }

    setupVideoAudioControls() {
        // Enable playback controls
        this.overlay.querySelector('.playback-btn').disabled = false;
        
        // Setup timeline
        const timelineTrack = this.overlay.querySelector('.timeline-track');
        const selection = this.overlay.querySelector('.timeline-track-selection');
        
        // Update trim inputs
        this.updateTrimInputs();
    }

    togglePlayback() {
        const element = this.video || this.audio;
        if (!element) return;
        
        if (this.isPlaying) {
            element.pause();
        } else {
            element.play();
        }
        
        this.isPlaying = !this.isPlaying;
        this.updatePlaybackButton();
    }

    updatePlaybackButton() {
        const btn = this.overlay.querySelector('.playback-btn i');
        btn.className = this.isPlaying ? 'fas fa-pause' : 'fas fa-play';
    }

    setCurrentTime(time) {
        const element = this.video || this.audio;
        if (!element) return;
        
        element.currentTime = time;
        this.currentTime = time;
        this.updateTimeDisplay();
    }

    updateTimeline() {
        if (this.duration === 0) return;
        
        const percentage = (this.currentTime / this.duration) * 100;
        this.overlay.querySelector('.timeline-slider-fill').style.width = percentage + '%';
        this.overlay.querySelector('.timeline-slider-handle').style.left = percentage + '%';
    }

    updateTimeDisplay() {
        const current = this.formatTime(this.currentTime);
        const total = this.formatTime(this.duration);
        this.overlay.querySelector('.playback-time').textContent = `${current} / ${total}`;
        
        this.overlay.querySelector('.timeline-controls .timeline-time:first-child').textContent = this.formatTime(this.trimStart);
        this.overlay.querySelector('.timeline-controls .timeline-time:last-child').textContent = this.formatTime(this.trimEnd);
    }

    updateTrimInputs() {
        const startInput = this.overlay.querySelectorAll('.trim-input')[0];
        const endInput = this.overlay.querySelectorAll('.trim-input')[1];
        
        startInput.value = this.formatTime(this.trimStart);
        endInput.value = this.formatTime(this.trimEnd);
    }

    updateTrimFromInputs() {
        const startInput = this.overlay.querySelectorAll('.trim-input')[0];
        const endInput = this.overlay.querySelectorAll('.trim-input')[1];
        
        const start = this.parseTime(startInput.value);
        const end = this.parseTime(endInput.value);
        
        if (start >= 0 && start < this.duration) {
            this.trimStart = start;
        }
        
        if (end > 0 && end <= this.duration && end > this.trimStart) {
            this.trimEnd = end;
        }
        
        this.updateTrimSelection();
        this.updateTimeDisplay();
    }

    updateTrimSelection() {
        const selection = this.overlay.querySelector('.timeline-track-selection');
        const track = this.overlay.querySelector('.timeline-track');
        
        if (this.duration === 0) return;
        
        const startPercent = (this.trimStart / this.duration) * 100;
        const widthPercent = ((this.trimEnd - this.trimStart) / this.duration) * 100;
        
        selection.style.left = startPercent + '%';
        selection.style.width = widthPercent + '%';
    }

    resetTrim() {
        this.trimStart = 0;
        this.trimEnd = this.duration || 0;
        this.updateTrimInputs();
        this.updateTrimSelection();
        this.updateTimeDisplay();
    }

    applyFilter(filterName) {
        const img = this.preview.querySelector('img');
        if (!img) return;
        
        // Remove existing filter classes
        img.style.filter = '';
        
        switch (filterName) {
            case 'original':
                this.filters = { brightness: 100, contrast: 100, saturation: 100, blur: 0 };
                break;
            case 'vintage':
                this.filters = { brightness: 110, contrast: 90, saturation: 60, blur: 0 };
                break;
            case 'noir':
                this.filters = { brightness: 100, contrast: 120, saturation: 0, blur: 0 };
                break;
            case 'vivid':
                this.filters = { brightness: 105, contrast: 110, saturation: 130, blur: 0 };
                break;
        }
        
        this.updateFilterSliders();
        this.applyFilters();
    }

    updateFilter(filterName, value) {
        this.filters[filterName] = parseFloat(value);
        this.applyFilters();
        
        // Update label
        const slider = this.overlay.querySelector(`[data-filter="${filterName}"]`);
        const label = slider.parentElement.querySelector('.filter-slider-label span:last-child');
        
        if (filterName === 'blur') {
            label.textContent = value + 'px';
        } else {
            label.textContent = value + '%';
        }
    }

    updateFilterSliders() {
        Object.keys(this.filters).forEach(filterName => {
            const slider = this.overlay.querySelector(`[data-filter="${filterName}"]`);
            if (slider) {
                slider.value = this.filters[filterName];
                
                const label = slider.parentElement.querySelector('.filter-slider-label span:last-child');
                if (filterName === 'blur') {
                    label.textContent = this.filters[filterName] + 'px';
                } else {
                    label.textContent = this.filters[filterName] + '%';
                }
            }
        });
    }

    applyFilters() {
        const img = this.preview.querySelector('img');
        if (!img) return;
        
        const filterString = `
            brightness(${this.filters.brightness}%)
            contrast(${this.filters.contrast}%)
            saturate(${this.filters.saturation}%)
            blur(${this.filters.blur}px)
        `;
        
        img.style.filter = filterString;
    }

    async applyChanges() {
        try {
            this.overlay.querySelector('.action-btn.apply').disabled = true;
            this.overlay.querySelector('.action-btn.apply').textContent = 'Processing...';
            
            const processedFile = await this.processMedia();
            
            // Call the callback with the processed file
            if (this.onApply) {
                this.onApply(processedFile);
            }
            
            this.close();
        } catch (error) {
            console.error('Error processing media:', error);
            this.showError('Failed to process media');
        } finally {
            this.overlay.querySelector('.action-btn.apply').disabled = false;
            this.overlay.querySelector('.action-btn.apply').textContent = 'Apply Changes';
        }
    }

    async processMedia() {
        const fileType = this.originalFile.type.split('/')[0];
        
        if (fileType === 'image') {
            return this.processImage();
        } else if (fileType === 'video' || fileType === 'audio') {
            return this.processVideoAudio();
        }
        
        return this.originalFile;
    }

    processImage() {
        return new Promise((resolve) => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const img = this.preview.querySelector('img');
            
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            
            // Apply filters
            ctx.filter = img.style.filter || 'none';
            ctx.drawImage(img, 0, 0);
            
            canvas.toBlob((blob) => {
                const processedFile = new File([blob], this.originalFile.name, {
                    type: this.originalFile.type,
                    lastModified: Date.now()
                });
                resolve(processedFile);
            }, this.originalFile.type);
        });
    }

    processVideoAudio() {
        // For video/audio trimming, we'll need to use FFmpeg.js or similar
        // For now, return the original file with trim metadata
        const metadata = {
            trimStart: this.trimStart,
            trimEnd: this.trimEnd,
            filters: this.filters
        };
        
        // In a real implementation, you would use a video processing library
        
        return Promise.resolve(this.originalFile);
    }

    formatTime(seconds) {
        if (isNaN(seconds) || !isFinite(seconds)) return '00:00';
        
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    parseTime(timeString) {
        const parts = timeString.split(':');
        if (parts.length !== 2) return 0;
        
        const mins = parseInt(parts[0], 10);
        const secs = parseInt(parts[1], 10);
        
        return (mins * 60) + secs;
    }

    showError(message) {
        this.preview.innerHTML = `
            <div style="color: #f44336; text-align: center; padding: 40px;">
                <i class="fas fa-exclamation-triangle" style="font-size: 48px; margin-bottom: 16px;"></i>
                <div>${message}</div>
            </div>
        `;
    }

    close() {
        this.overlay.classList.remove('active');
        
        // Clean up
        if (this.originalUrl) {
            URL.revokeObjectURL(this.originalUrl);
        }
        
        // Reset state
        this.video = null;
        this.audio = null;
        this.originalFile = null;
        this.originalUrl = null;
        this.trimStart = 0;
        this.trimEnd = 0;
        this.duration = 0;
        this.isPlaying = false;
        this.currentTime = 0;
        this.filters = {
            brightness: 100,
            contrast: 100,
            saturation: 100,
            blur: 0
        };
        
        // Reset UI
        this.preview.innerHTML = '<div class="media-editor-loading"><i class="fas fa-spinner"></i>Loading media...</div>';
        this.overlay.querySelector('.playback-btn').disabled = true;
        this.overlay.querySelector('.action-btn.apply').disabled = true;
        this.overlay.querySelector('.playback-btn i').className = 'fas fa-play';
        
        // Reset filters
        this.overlay.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        this.overlay.querySelector('.filter-btn[data-filter="original"]').classList.add('active');
        this.updateFilterSliders();
    }
}

// Initialize the media editor
let mediaEditor = null;

function openMediaEditor(file, onApply) {
    if (!mediaEditor) {
        mediaEditor = new MediaEditor();
    }
    
    mediaEditor.onApply = onApply;
    mediaEditor.open(file);
}

// Export for use in other files
window.openMediaEditor = openMediaEditor;
