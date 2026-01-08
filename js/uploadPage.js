(function () {
    function initUploadPage() {
        var dropZone = document.getElementById('dropZone');
        var fileInput = document.getElementById('fileInput');
        var fileInfo = document.getElementById('fileInfo');
        var coverInput = document.getElementById('coverInput');
        var coverInfo = document.getElementById('coverInfo');
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

        fileInput.addEventListener('change', function (e) {
            updateFileInfo(e.target.files);
        });

        if (coverInput && coverInfo) {
            coverInput.addEventListener('change', function (e) {
                var files = e.target.files;
                if (!files || files.length === 0) {
                    coverInfo.textContent = 'No cover selected';
                    return;
                }
                coverInfo.textContent = 'Selected: ' + files[0].name;
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
                fileInput.files = e.dataTransfer.files;
                updateFileInfo(e.dataTransfer.files);
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
                alert('Please log in first.');
                window.location.hash = '#/login';
                return;
            }

            var formData = new FormData();
            var files = fileInput.files;

            if (!files || files.length === 0) {
                alert('Please select at least one file to upload');
                return;
            }

            formData.append('audioFile', files[0]);

            if (coverInput && coverInput.files && coverInput.files[0]) {
                formData.append('coverImage', coverInput.files[0]);
            }

            var titleEl = document.getElementById('trackTitle');
            var artistEl = document.getElementById('artistName');
            var albumEl = document.getElementById('albumTitle');
            var genreEl = document.getElementById('genre');

            formData.append('title', titleEl ? titleEl.value : '');
            formData.append('artist', artistEl ? artistEl.value : '');
            formData.append('album', albumEl ? albumEl.value : '');
            formData.append('genre', genreEl ? genreEl.value : '');

            var submitBtn = uploadForm.querySelector('button[type="submit"]');
            var originalText = submitBtn ? submitBtn.textContent : '';
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = 'Uploading...';
            }

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
                    alert('Upload failed. Please try again.');
                    return Promise.resolve();
                }

                var apiBase = bases[baseIndex];
                return fetch(apiBase + '/upload', {
                    method: 'POST',
                    headers: {
                        Authorization: 'Bearer ' + token
                    },
                    body: formData
                }).then(function (res) {
                    if (!res.ok) {
                        if (res.status === 401 || res.status === 403 || res.status === 404) {
                            return tryUpload(baseIndex + 1);
                        }
                    }

                    return safeJson(res).then(function (data) {
                        if (res.ok && data && data.success) {
                            try {
                                localStorage.setItem('juke_api_base', apiBase);
                            } catch (_) {
                            }
                            alert('Upload successful! Track ID: ' + data.track.id);
                            uploadForm.reset();
                            fileInfo.textContent = 'No files selected';
                            if (coverInfo) coverInfo.textContent = 'No cover selected';
                            return;
                        }

                        var msg = (data && data.error) ? data.error : ('Request failed: ' + res.status);
                        if (res.status === 401 || res.status === 403 || res.status === 404) {
                            return tryUpload(baseIndex + 1);
                        }
                        alert('Upload failed: ' + msg);
                    });
                }).catch(function () {
                    return tryUpload(baseIndex + 1);
                });
            }

            tryUpload(0).finally(function () {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = originalText;
                }
            });
        });
    }

    window.JukeUpload = {
        init: initUploadPage
    };
})();
