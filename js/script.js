// Add click event listeners to all navigation buttons
document.addEventListener('DOMContentLoaded', function() {
    // Juke button functionality
    const jukeButton = document.getElementById('jukeButton');
    if (jukeButton) {
        jukeButton.addEventListener('click', function() {
            alert('Juke button clicked!');
            // Add your Juke button functionality here
        });
    }

    // Register button functionality
    const registerButton = document.getElementById('registerButton');
    if (registerButton) {
        registerButton.addEventListener('click', function() {
            alert('Register button clicked!');
            // Add your Register button functionality here
        });
    }

    // Login button functionality
    const loginButton = document.getElementById('loginButton');
    if (loginButton) {
        loginButton.addEventListener('click', function() {
            alert('Login button clicked!');
            // Add your Login button functionality here
        });
    }
});

// Music player functionality
document.querySelectorAll('.play-btn').forEach(btn => {
    btn.addEventListener('click', function(e) {
        e.stopPropagation();
        const card = this.closest('.music-card');
        card.classList.toggle('playing');
        
        // Toggle play/pause icon
        const icon = this.querySelector('i');
        if (icon.classList.contains('fa-play')) {
            icon.classList.remove('fa-play');
            icon.classList.add('fa-pause');
            // Add your play logic here
        } else {
            icon.classList.remove('fa-pause');
            icon.classList.add('fa-play');
            // Add your pause logic here
        }
    });
});

// Like button functionality
document.querySelectorAll('.like-btn').forEach(btn => {
    btn.addEventListener('click', function(e) {
        e.stopPropagation();
        this.classList.toggle('liked');
        this.querySelector('i').classList.toggle('far');
        this.querySelector('i').classList.toggle('fas');
    });
});


