// Initialize charts and data
let playsChart, genreChart;

document.addEventListener('DOMContentLoaded', function() {
    initializeCharts();
    loadAnalyticsData();
    
    // Date range change handler
    document.getElementById('dateRange').addEventListener('change', loadAnalyticsData);
});

function initializeCharts() {
    // Plays Over Time Chart
    const playsCtx = document.getElementById('playsChart').getContext('2d');
    playsChart = new Chart(playsCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Plays',
                data: [],
                borderColor: '#00ffd0',
                backgroundColor: 'rgba(0, 255, 208, 0.1)',
                borderWidth: 2,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.7)'
                    }
                },
                y: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.7)'
                    }
                }
            }
        }
    });

    // Genre Distribution Chart
    const genreCtx = document.getElementById('genreChart').getContext('2d');
    genreChart = new Chart(genreCtx, {
        type: 'doughnut',
        data: {
            labels: [],
            datasets: [{
                data: [],
                backgroundColor: [
                    '#00ffd0',
                    '#8b5cf6',
                    '#f59e0b',
                    '#ef4444',
                    '#10b981',
                    '#3b82f6'
                ],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        color: 'rgba(255, 255, 255, 0.7)'
                    }
                }
            }
        }
    });
}

function loadAnalyticsData() {
    const dateRange = document.getElementById('dateRange').value;
    
    // Simulate API call with demo data
    setTimeout(() => {
        updateMetrics();
        updateCharts(dateRange);
        updateUserInfo();
        updateTopArtists();
    }, 500);
}

function updateMetrics() {
    // Generate random metrics for demo
    document.getElementById('totalPlays').textContent = Math.floor(Math.random() * 10000) + 1000;
    document.getElementById('totalMinutes').textContent = Math.floor(Math.random() * 50000) + 5000;
    document.getElementById('totalUploads').textContent = Math.floor(Math.random() * 50) + 5;
    document.getElementById('totalFollowers').textContent = Math.floor(Math.random() * 500) + 50;
    
    // Business metrics
    document.getElementById('totalUsers').textContent = (Math.floor(Math.random() * 50000) + 10000).toLocaleString();
    document.getElementById('monthlyRevenue').textContent = '€' + (Math.floor(Math.random() * 50000) + 10000).toLocaleString();
    document.getElementById('artistPayouts').textContent = '€' + (Math.floor(Math.random() * 30000) + 5000).toLocaleString();
    document.getElementById('activeArtists').textContent = (Math.floor(Math.random() * 2000) + 500).toLocaleString();
}

function updateCharts(dateRange) {
    const days = parseInt(dateRange);
    const labels = [];
    const playsData = [];

    // Generate date labels
    for (let i = days - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        labels.push(date.toLocaleDateString());
        playsData.push(Math.floor(Math.random() * 200) + 50);
    }

    // Update plays chart
    playsChart.data.labels = labels;
    playsChart.data.datasets[0].data = playsData;
    playsChart.update();

    // Update genre chart
    const genres = ['Electronic', 'Hip Hop', 'Rock', 'Pop', 'Jazz', 'R&B'];
    const genreData = genres.map(() => Math.floor(Math.random() * 100) + 20);
    
    genreChart.data.labels = genres;
    genreChart.data.datasets[0].data = genreData;
    genreChart.update();
}

function updateUserInfo() {
    // Simulate user data
    document.getElementById('userName').textContent = 'JUKE Artist';
    document.getElementById('userTier').textContent = 'Premium Plan';
    document.getElementById('uploadCredits').textContent = '∞';
}

function updateTopArtists() {
    // Generate demo data for top listened artists
    const listenedArtists = [
        { name: 'Electronic Dreams', plays: 45234, tracks: 12 },
        { name: 'Hip Hop Kings', plays: 38921, tracks: 8 },
        { name: 'Rock Legends', plays: 35678, tracks: 15 },
        { name: 'Pop Sensation', plays: 32145, tracks: 6 },
        { name: 'Jazz Masters', plays: 28934, tracks: 10 },
        { name: 'R&B Stars', plays: 26789, tracks: 9 },
        { name: 'Indie Vibes', plays: 24567, tracks: 11 },
        { name: 'Classical Works', plays: 22345, tracks: 7 },
        { name: 'Folk Stories', plays: 20123, tracks: 13 },
        { name: 'Metal Force', plays: 18976, tracks: 5 }
    ];

    const listenedContainer = document.getElementById('topListenedArtists');
    listenedContainer.innerHTML = listenedArtists.map((artist, index) => `
        <div class="artist-rank-item">
            <div class="artist-rank-number ${index < 3 ? 'top-3' : ''}">${index + 1}</div>
            <div class="artist-info">
                <div class="artist-name">${artist.name}</div>
                <div class="artist-stats">${artist.tracks} tracks</div>
            </div>
            <div class="artist-metric plays">${artist.plays.toLocaleString()} plays</div>
        </div>
    `).join('');

    // Generate demo data for top paid artists
    const paidArtists = [
        { name: 'Electronic Dreams', revenue: 12456, plays: 45234 },
        { name: 'Hip Hop Kings', revenue: 11234, plays: 38921 },
        { name: 'Rock Legends', revenue: 9876, plays: 35678 },
        { name: 'Pop Sensation', revenue: 8901, plays: 32145 },
        { name: 'Jazz Masters', revenue: 7654, plays: 28934 },
        { name: 'R&B Stars', revenue: 6789, plays: 26789 },
        { name: 'Indie Vibes', revenue: 5678, plays: 24567 },
        { name: 'Classical Works', revenue: 4567, plays: 22345 },
        { name: 'Folk Stories', revenue: 3456, plays: 20123 },
        { name: 'Metal Force', revenue: 2890, plays: 18976 }
    ];

    const paidContainer = document.getElementById('topPaidArtists');
    paidContainer.innerHTML = paidArtists.map((artist, index) => `
        <div class="artist-rank-item">
            <div class="artist-rank-number ${index < 3 ? 'top-3' : ''}">${index + 1}</div>
            <div class="artist-info">
                <div class="artist-name">${artist.name}</div>
                <div class="artist-stats">${artist.plays.toLocaleString()} plays</div>
            </div>
            <div class="artist-metric revenue">€${artist.revenue.toLocaleString()}</div>
        </div>
    `).join('');
}

function refreshData() {
    // Show loading state
    const refreshBtn = document.querySelector('.refresh-btn');
    const originalContent = refreshBtn.innerHTML;
    refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
    
    // Reload data
    loadAnalyticsData();
    
    // Reset button after 1 second
    setTimeout(() => {
        refreshBtn.innerHTML = originalContent;
    }, 1000);
}

// Show upgrade prompt for free users (demo)
function showUpgradePrompt() {
    const upgradeCard = document.createElement('div');
    upgradeCard.className = 'upgrade-prompt';
    upgradeCard.innerHTML = `
        <h3 class="upgrade-title">Upgrade to Premium</h3>
        <p class="upgrade-text">Get detailed analytics, unlimited uploads, and more!</p>
        <a href="subscription-plans.html" class="upgrade-btn">Upgrade Now</a>
    `;
    document.body.appendChild(upgradeCard);

    // Auto-remove after 10 seconds
    setTimeout(() => {
        if (upgradeCard.parentNode) {
            upgradeCard.parentNode.removeChild(upgradeCard);
        }
    }, 10000);
}

// Show upgrade prompt after 5 seconds for demo
setTimeout(showUpgradePrompt, 5000);
