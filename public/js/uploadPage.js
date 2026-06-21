(function () {
    function initUploadPage() {
        var dropZone = document.getElementById('dropZone');
        var fileInput = document.getElementById('fileInput');
        var fileInfo = document.getElementById('fileInfo');
        var coverInput = document.getElementById('coverInput');
        var coverInfo = document.getElementById('coverInfo');
        var videoInput = document.getElementById('videoInput');
        var videoInfo = document.getElementById('videoInfo');
        var uploadForm = document.getElementById('uploadForm');

        if (!dropZone || !fileInput || !fileInfo || !uploadForm) return;
        if (uploadForm.dataset.bound === 'true') return;
        uploadForm.dataset.bound = 'true';

        try {
            if (window.location && String(window.location.hostname || '').includes('github.io')) {
                var existingNote = document.getElementById('uploadEphemeralNote');
                if (!existingNote) {
                    var note = document.createElement('div');
                    note.id = 'uploadEphemeralNote';
                    note.style.margin = '0 0 1rem';
                    note.style.padding = '0.75rem 1rem';
                    note.style.border = '1px solid rgba(255,255,255,0.15)';
                    note.style.borderRadius = '10px';
                    note.style.background = 'rgba(0,0,0,0.15)';
                    note.style.color = '#dbd8d8';
                    note.style.fontSize = '0.95rem';
                    note.innerHTML = 'Note: uploads are currently stored on the server and may not be permanent. If a track disappears later, please re-upload it.';
                    uploadForm.parentNode.insertBefore(note, uploadForm);
                }
            }
        } catch (_) {
        }

        dropZone.addEventListener('click', function () {
            fileInput.click();
        });

        try {
            var artistElPrefill = document.getElementById('artistName');
            if (artistElPrefill && !String(artistElPrefill.value || '').trim()) {
                var u = null;
                try {
                    if (typeof getCurrentUser === 'function') u = getCurrentUser();
                } catch (_) {
                    u = null;
                }
                var uname = (u && u.username) ? String(u.username) : '';
                if (uname) artistElPrefill.value = uname;
            }
        } catch (_) {
        }

        fileInput.addEventListener('change', function (e) {
            const files = e.target.files;
            if (files && files.length > 0) {
                const file = files[0];
                const fileType = file.type.split('/')[0];
                
                // Check if file is an image, video, or audio that can be edited
                if (['image', 'video', 'audio'].includes(fileType)) {
                    // Open media editor for the file
                    if (typeof openMediaEditor === 'function') {
                        openMediaEditor(file, function(processedFile) {
                            // Update file input with processed file
                            const dataTransfer = new DataTransfer();
                            dataTransfer.items.add(processedFile);
                            fileInput.files = dataTransfer.files;
                            updateFileInfo(dataTransfer.files);
                        });
                    } else {
                        // Fallback to original behavior if media editor not available
                        updateFileInfo(files);
                    }
                } else {
                    // For other file types, use original behavior
                    updateFileInfo(files);
                }
            } else {
                updateFileInfo([]);
            }
        });

        if (coverInput && coverInfo) {
            coverInput.addEventListener('change', function (e) {
                var files = e.target.files;
                if (!files || files.length === 0) {
                    coverInfo.textContent = 'No cover selected';
                    return;
                }
                
                const file = files[0];
                const fileType = file.type.split('/')[0];
                
                // If it's an image, open media editor
                if (fileType === 'image' && typeof openMediaEditor === 'function') {
                    openMediaEditor(file, function(processedFile) {
                        const dataTransfer = new DataTransfer();
                        dataTransfer.items.add(processedFile);
                        coverInput.files = dataTransfer.files;
                        coverInfo.textContent = 'Selected: ' + processedFile.name;
                    });
                } else {
                    // Fallback for non-images or if editor not available
                    coverInfo.textContent = 'Selected: ' + file.name;
                }
            });
        }

        if (videoInput && videoInfo) {
            videoInput.addEventListener('change', function (e) {
                var files = e.target.files;
                if (!files || files.length === 0) {
                    videoInfo.textContent = 'No video selected';
                    return;
                }
                
                const file = files[0];
                const fileType = file.type.split('/')[0];
                
                // If it's a video, open media editor
                if (fileType === 'video' && typeof openMediaEditor === 'function') {
                    openMediaEditor(file, function(processedFile) {
                        const dataTransfer = new DataTransfer();
                        dataTransfer.items.add(processedFile);
                        videoInput.files = dataTransfer.files;
                        videoInfo.textContent = 'Selected: ' + processedFile.name + ' (' + Math.round(processedFile.size / 1024 / 1024) + ' MB)';
                    });
                } else {
                    // Fallback for non-videos or if editor not available
                    videoInfo.textContent = 'Selected: ' + file.name + ' (' + Math.round(file.size / 1024 / 1024) + ' MB)';
                }
            });
        }

        dropZone.addEventListener('dragover', function (e) {
            e.preventDefault();
            dropZone.style.borderColor = '#00ffd0';
            dropZone.style.background = 'rgba(0, 255, 208, 0.1)';
        });

        dropZone.addEventListener('dragleave', function () {
            dropZone.style.borderColor = '#4a4a8a';
            dropZone.style.background = 'transparent';
        });

        dropZone.addEventListener('drop', function (e) {
            e.preventDefault();
            dropZone.style.borderColor = '#4a4a8a';
            dropZone.style.background = 'transparent';

            if (e.dataTransfer.files.length) {
                const files = e.dataTransfer.files;
                if (files.length === 1) {
                    const file = files[0];
                    const fileType = file.type.split('/')[0];
                    
                    // Check if file can be edited
                    if (['image', 'video', 'audio'].includes(fileType) && typeof openMediaEditor === 'function') {
                        openMediaEditor(file, function(processedFile) {
                            const dataTransfer = new DataTransfer();
                            dataTransfer.items.add(processedFile);
                            fileInput.files = dataTransfer.files;
                            updateFileInfo(dataTransfer.files);
                        });
                    } else {
                        // Fallback for non-editable files
                        fileInput.files = files;
                        updateFileInfo(files);
                    }
                } else {
                    // For multiple files, use original behavior
                    fileInput.files = files;
                    updateFileInfo(files);
                }
            }
        });

        function updateFileInfo(files) {
            if (!files || files.length === 0) {
                fileInfo.textContent = 'No files selected';
            } else if (files.length === 1) {
                fileInfo.textContent = 'Selected: ' + files[0].name;
            } else {
                fileInfo.textContent = 'Selected ' + files.length + ' files';
            }
        }

        uploadForm.addEventListener('submit', function (e) {
            e.preventDefault();

            var token = localStorage.getItem('juke_token');
            if (!token) {
                showUploadNotification('Please log in first.', 'error');
                window.location.hash = '#/login';
                return;
            }

            var formData = new FormData();
            var files = fileInput.files;

            if (!files || files.length === 0) {
                showUploadNotification('Please select at least one file to upload', 'error');
                return;
            }

            formData.append('audioFile', files[0]);

            if (coverInput && coverInput.files && coverInput.files[0]) {
                formData.append('coverImage', coverInput.files[0]);
            }

            if (videoInput && videoInput.files && videoInput.files[0]) {
                formData.append('videoFile', videoInput.files[0]);
            }

            var titleEl = document.getElementById('trackTitle');
            var artistEl = document.getElementById('artistName');
            var albumEl = document.getElementById('albumTitle');
            var genreEl = document.getElementById('genre');

            var u2 = null;
            try {
                if (typeof getCurrentUser === 'function') u2 = getCurrentUser();
            } catch (_) {
                u2 = null;
            }
            var uname2 = (u2 && u2.username) ? String(u2.username) : '';
            var artistVal = artistEl ? String(artistEl.value || '').trim() : '';
            if (!artistVal && uname2) {
                artistVal = uname2;
                try {
                    if (artistEl) artistEl.value = uname2;
                } catch (_) {
                }
            }

            // Validierung
            var titleVal = titleEl ? titleEl.value.trim() : '';
            if (!titleVal) {
                showUploadNotification('Please enter a track title', 'error');
                titleEl && titleEl.focus();
                return;
            }

            formData.append('title', titleVal);
            formData.append('artist', artistVal);
            formData.append('album', albumEl ? albumEl.value : '');
            formData.append('genre', genreEl ? genreEl.value : '');

            var submitBtn = uploadForm.querySelector('button[type="submit"]');
            var originalText = submitBtn ? submitBtn.textContent : '';
            
            // 🎯 Progress Container erstellen
            var progressContainer = document.getElementById('uploadProgress');
            if (!progressContainer) {
                progressContainer = document.createElement('div');
                progressContainer.id = 'uploadProgress';
                progressContainer.style.cssText = 'margin: 1rem 0; display: none;';
                progressContainer.innerHTML = `
                    <div style="background: rgba(255,255,255,0.1); border-radius: 10px; overflow: hidden; height: 8px;">
                        <div id="uploadProgressBar" style="width: 0%; height: 100%; background: linear-gradient(90deg, #00ffd0, #00b894); transition: width 0.3s ease;"></div>
                    </div>
                    <div id="uploadProgressText" style="text-align: center; margin-top: 0.5rem; color: #aaa; font-size: 0.9rem;">Preparing upload...</div>
                `;
                submitBtn.parentNode.insertBefore(progressContainer, submitBtn);
            }
            
            var progressBar = document.getElementById('uploadProgressBar');
            var progressText = document.getElementById('uploadProgressText');
            
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';
            }
            progressContainer.style.display = 'block';

            var storedBase = null;
            try {
                storedBase = localStorage.getItem('juke_api_base');
            } catch (_) {
            }
            var primaryBase = storedBase || ((typeof API_BASE !== 'undefined' && API_BASE) ? API_BASE : null);
            var fallbackBase = 'https://juke-api.onrender.com/api';
            var bases = [primaryBase, fallbackBase].filter(Boolean);
            bases = bases.filter(function (v, i, a) { return a.indexOf(v) === i; });

            function safeJson(res) {
                return res.json().catch(function () { return null; });
            }

            function tryUpload(baseIndex) {
                if (baseIndex >= bases.length) {
                    showUploadNotification('Upload failed. Please check your connection and try again.', 'error');
                    return Promise.resolve();
                }

                var apiBase = bases[baseIndex];
                
                // 🎯 XMLHttpRequest für Progress Tracking
                return new Promise(function(resolve) {
                    var xhr = new XMLHttpRequest();
                    
                    xhr.upload.addEventListener('progress', function(e) {
                        if (e.lengthComputable) {
                            var percent = Math.round((e.loaded / e.total) * 100);
                            if (progressBar) progressBar.style.width = percent + '%';
                            if (progressText) {
                                var loaded = (e.loaded / 1024 / 1024).toFixed(1);
                                var total = (e.total / 1024 / 1024).toFixed(1);
                                progressText.textContent = 'Uploading: ' + percent + '% (' + loaded + ' / ' + total + ' MB)';
                            }
                        }
                    });
                    
                    xhr.addEventListener('load', function() {
                        if (xhr.status >= 200 && xhr.status < 300) {
                            try {
                                var data = JSON.parse(xhr.responseText);
                                if (data && data.success) {
                                    try {
                                        localStorage.setItem('juke_api_base', apiBase);
                                    } catch (_) {}
                                    
                                    if (progressBar) progressBar.style.width = '100%';
                                    if (progressText) progressText.textContent = 'Upload complete!';
                                    
                                    showUploadNotification('Track "' + titleVal + '" uploaded successfully!', 'success');
                                    
                                    // Form zurücksetzen nach kurzer Verzögerung
                                    setTimeout(function() {
                                        uploadForm.reset();
                                        fileInfo.textContent = 'No files selected';
                                        if (coverInfo) coverInfo.textContent = 'No cover selected';
                                        if (videoInfo) videoInfo.textContent = 'No video selected';
                                        progressContainer.style.display = 'none';
                                        if (progressBar) progressBar.style.width = '0%';
                                        
                                        // Redirect zum Feed
                                        window.location.hash = '#/feed';
                                    }, 1500);
                                    
                                    resolve();
                                    return;
                                }
                                
                                var msg = (data && data.error) ? data.error : 'Upload failed';
                                showUploadNotification(msg, 'error');
                                resolve();
                            } catch (_) {
                                tryUpload(baseIndex + 1).then(resolve);
                            }
                        } else if (xhr.status === 401 || xhr.status === 403 || xhr.status === 404) {
                            tryUpload(baseIndex + 1).then(resolve);
                        } else {
                            try {
                                var errData = JSON.parse(xhr.responseText);
                                showUploadNotification(errData.error || 'Upload failed', 'error');
                            } catch (_) {
                                showUploadNotification('Upload failed: ' + xhr.status, 'error');
                            }
                            resolve();
                        }
                    });
                    
                    xhr.addEventListener('error', function() {
                        tryUpload(baseIndex + 1).then(resolve);
                    });
                    
                    xhr.addEventListener('timeout', function() {
                        showUploadNotification('Upload timed out. Please try again.', 'error');
                        resolve();
                    });
                    
                    xhr.open('POST', apiBase + '/upload');
                    xhr.setRequestHeader('Authorization', 'Bearer ' + token);
                    xhr.timeout = 300000; // 5 Minuten Timeout
                    xhr.send(formData);
                });
            }

            tryUpload(0).finally(function () {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = originalText;
                }
            });
        });
        
        // 🎯 Notification Helper
        function showUploadNotification(message, type) {
            var existing = document.getElementById('uploadNotification');
            if (existing) existing.remove();
            
            var notification = document.createElement('div');
            notification.id = 'uploadNotification';
            notification.textContent = message;
            notification.style.cssText = 
                'position: fixed; top: 20px; right: 20px; padding: 12px 20px; border-radius: 8px; ' +
                'color: white; font-weight: 500; z-index: 10000; animation: slideIn 0.3s ease; ' +
                'background: ' + (type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6') + ';';
            
            document.body.appendChild(notification);
            
            setTimeout(function() {
                notification.style.opacity = '0';
                notification.style.transition = 'opacity 0.3s ease';
                setTimeout(function() { notification.remove(); }, 300);
            }, 4000);
        }
    }

    window.JukeUpload = {
        init: initUploadPage
    };
})();
