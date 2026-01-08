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
            var genreEl = document.getElementById('genre');

            formData.append('title', titleEl ? titleEl.value : '');
            formData.append('artist', artistEl ? artistEl.value : '');
            formData.append('genre', genreEl ? genreEl.value : '');

            var submitBtn = uploadForm.querySelector('button[type="submit"]');
            var originalText = submitBtn ? submitBtn.textContent : '';
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = 'Uploading...';
            }

            var apiBase = (typeof API_BASE !== 'undefined' && API_BASE) ? API_BASE : 'https://juke-api.onrender.com/api';
            fetch(apiBase + '/upload', {
                method: 'POST',
                headers: {
                    Authorization: 'Bearer ' + token
                },
                body: formData
            })
                .then(function (r) { return r.json(); })
                .then(function (data) {
                    if (data && data.success) {
                        alert('Upload successful! Track ID: ' + data.track.id);
                        uploadForm.reset();
                        fileInfo.textContent = 'No files selected';
                        if (coverInfo) coverInfo.textContent = 'No cover selected';
                    } else {
                        alert('Upload failed: ' + ((data && data.error) ? data.error : 'Unknown error'));
                    }
                })
                .catch(function () {
                    alert('Upload failed. Please try again.');
                })
                .finally(function () {
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
