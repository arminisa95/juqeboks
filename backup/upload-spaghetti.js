document.addEventListener('DOMContentLoaded', function() {
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const fileInfo = document.getElementById('fileInfo');
    const coverInput = document.getElementById('coverInput');
    const coverInfo = document.getElementById('coverInfo');
    const uploadForm = document.getElementById('uploadForm');
    const openEditorBtn = document.getElementById('openEditorBtn');
    
    // Debug: Check if media editor is available
    console.log('Checking media editor availability...');
    console.log('typeof openMediaEditor:', typeof openMediaEditor);
    console.log('window.openMediaEditor:', window.openMediaEditor);
    
    // Wait a bit for scripts to load
    setTimeout(() => {
        console.log('After timeout - typeof openMediaEditor:', typeof openMediaEditor);
        console.log('After timeout - window.openMediaEditor:', window.openMediaEditor);
    }, 1000);
    
    // Handle manual media editor button
    if (openEditorBtn) {
        openEditorBtn.addEventListener('click', () => {
            console.log('Manual editor button clicked');
            
            // Create a sample file for testing
            const canvas = document.createElement('canvas');
            canvas.width = 400;
            canvas.height = 300;
            const ctx = canvas.getContext('2d');
            
            // Create a simple test image
            ctx.fillStyle = '#1db954';
            ctx.fillRect(0, 0, 400, 300);
            ctx.fillStyle = '#fff';
            ctx.font = '30px Arial';
            ctx.fillText('Test Image', 100, 150);
            
            canvas.toBlob((blob) => {
                const testFile = new File([blob], 'test-image.jpg', { type: 'image/jpeg' });
                console.log('Opening media editor with test file:', testFile);
                
                if (typeof openMediaEditor === 'function') {
                    openMediaEditor(testFile, (processedFile) => {
                        console.log('Media editor processed file:', processedFile);
                        alert('Media editor test completed! File processed: ' + processedFile.name);
                    });
                } else {
                    alert('Media editor not available');
                }
            });
        });
    }
    
    // File drop handling
    if (dropZone) {
        dropZone.addEventListener('click', () => fileInput.click());
        
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('dragover');
        });
        
        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('dragover');
        });
        
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                handleFileSelect(files[0]);
            }
        });
    }
    
    // File input handling
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                handleFileSelect(e.target.files[0]);
            }
        });
    }
    
    // Cover image handling
    if (coverInput) {
        coverInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                handleCoverSelect(e.target.files[0]);
            }
        });
    }
    
    // Form submission
    if (uploadForm) {
        uploadForm.addEventListener('submit', (e) => {
            e.preventDefault();
            // Handle upload logic here
            alert('Upload functionality would be implemented here');
        });
    }
    
    function handleFileSelect(file) {
        if (fileInfo) {
            fileInfo.textContent = `Selected: ${file.name} (${formatFileSize(file.size)})`;
        }
    }
    
    function handleCoverSelect(file) {
        if (coverInfo) {
            coverInfo.textContent = `Cover: ${file.name} (${formatFileSize(file.size)})`;
        }
    }
    
    function formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
});
