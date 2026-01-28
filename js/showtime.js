// Showtime Modal functionality
document.addEventListener('DOMContentLoaded', function() {
    // Get elements
    const showtimeBtn = document.getElementById('showtimeBtn');
    const showtimeModal = document.getElementById('showtimeModal');
    const showtimeCloseBtn = document.getElementById('showtimeCloseBtn');
    const openShowtimeBtn = document.getElementById('openShowtimeBtn');
    const openRegFlowBtn = document.getElementById('openRegFlowBtn');
    const openUpdateBodyBtn = document.getElementById('openUpdateBodyBtn');

    // Show modal when _showtime button is clicked
    if (showtimeBtn) {
        showtimeBtn.addEventListener('click', function(e) {
            e.preventDefault();
            showShowtimeModal();
        });
    }

    // Close modal when close button is clicked
    if (showtimeCloseBtn) {
        showtimeCloseBtn.addEventListener('click', function() {
            hideShowtimeModal();
        });
    }

    // Close modal when clicking outside
    if (showtimeModal) {
        showtimeModal.addEventListener('click', function(e) {
            if (e.target === showtimeModal) {
                hideShowtimeModal();
            }
        });
    }

    // Open JUQE Showtime
    if (openShowtimeBtn) {
        openShowtimeBtn.addEventListener('click', function() {
            window.open('showtime/JUKE-SHOWTIME.html', '_blank');
            hideShowtimeModal();
        });
    }

    // Open User Registration Flow
    if (openRegFlowBtn) {
        openRegFlowBtn.addEventListener('click', function() {
            // Open register page in new tab
            window.open('#/register', '_blank');
            hideShowtimeModal();
        });
    }

    // Open UpdateBodyPadding explanation
    if (openUpdateBodyBtn) {
        openUpdateBodyBtn.addEventListener('click', function() {
            window.open('showtime/updateBodyPadding-EXPLAINED.md', '_blank');
            hideShowtimeModal();
        });
    }

    // Keyboard navigation
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && showtimeModal && showtimeModal.style.display !== 'none') {
            hideShowtimeModal();
        }
    });
});

// Functions to show/hide modal
function showShowtimeModal() {
    const modal = document.getElementById('showtimeModal');
    if (modal) {
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden'; // Prevent background scrolling
        
        // Focus the first button for accessibility
        setTimeout(() => {
            const firstBtn = modal.querySelector('.showtime-option-btn');
            if (firstBtn) firstBtn.focus();
        }, 100);
    }
}

function hideShowtimeModal() {
    const modal = document.getElementById('showtimeModal');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = ''; // Restore scrolling
    }
}

// Export functions for global access
window.ShowtimeModal = {
    show: showShowtimeModal,
    hide: hideShowtimeModal
};
