// JUKE Authentication System
var API_BASE = (function () {
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

function getAuthApiBases() {
    var bases = [API_BASE, 'https://juke-api.onrender.com/api'];
    return bases.filter(function (v, i, a) {
        return !!v && a.indexOf(v) === i;
    });
}

async function postAuthJson(path, payload, validateOkData) {
    var bases = getAuthApiBases();
    var lastErr = null;

    for (var i = 0; i < bases.length; i++) {
        var base = bases[i];
        try {
            var response = await fetch(base + path, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            var data = null;
            try {
                data = await response.json();
            } catch (e) {
                var text = '';
                try {
                    text = await response.text();
                } catch (_) {
                }

                if (response.status === 404 || response.status === 405) {
                    lastErr = e;
                    continue;
                }

                data = text ? { error: text } : { error: 'Invalid response' };
            }

            if (response.ok) {
                if (typeof validateOkData === 'function' && !validateOkData(data)) {
                    lastErr = new Error('Invalid response');
                    continue;
                }
                return { ok: true, data: data };
            }

            if (response.status === 404 || response.status === 405) {
                lastErr = new Error((data && data.error) ? data.error : ('Request failed: ' + response.status));
                continue;
            }

            return { ok: false, data: data };
        } catch (e) {
            lastErr = e;
        }
    }

    throw lastErr || new Error('Network error');
}

// Store user session
let currentUser = null;

// Check if user is logged in
function isLoggedIn() {
    return localStorage.getItem('juke_token') !== null;
}

// Get current user
function getCurrentUser() {
    if (!currentUser) {
        const token = localStorage.getItem('juke_token');
        const user = localStorage.getItem('juke_user');
        if (token && user) {
            currentUser = JSON.parse(user);
        }
    }
    return currentUser;
}

// Logout user
function logout() {
    localStorage.removeItem('juke_token');
    localStorage.removeItem('juke_user');
    currentUser = null;

    if (document.body && document.body.dataset && document.body.dataset.spa) {
        window.location.hash = '#/login';
        return;
    }

    const base = getBasePath();
    window.location.href = `${base}/html/login.html`;
}

function getBasePath() {
    const path = window.location.pathname.replace(/\\/g, '/');
    return path.includes('/html/') ? '..' : '.';
}

function setFloatingButtonDestination() {
    const floatingButton = document.querySelector('a.floating-button');
    if (!floatingButton) return;

    if (document.body && document.body.dataset && document.body.dataset.spa) {
        floatingButton.href = getCurrentUser() ? '#/profile' : '#/login';
        return;
    }

    const base = getBasePath();
    if (getCurrentUser()) {
        floatingButton.href = `${base}/html/profile.html`;
    } else {
        floatingButton.href = `${base}/html/login.html`;
    }
}

function requireAuth() {
    if (getCurrentUser()) return;

    if (document.body && document.body.dataset && document.body.dataset.spa) {
        window.location.hash = '#/login';
        return;
    }

    const base = getBasePath();
    window.location.href = `${base}/html/login.html`;
}

// Login function
async function login(username, password) {
    try {
        const result = await postAuthJson(
            '/auth/login',
            { username, password },
            function (data) { return !!(data && data.token && data.user); }
        );
        const data = result.data;

        if (result.ok) {
            // Store token and user data
            localStorage.setItem('juke_token', data.token);
            localStorage.setItem('juke_user', JSON.stringify(data.user));
            currentUser = data.user;

            if (document.body && document.body.dataset && document.body.dataset.spa) {
                window.location.hash = '#/feed';
            } else {
                // Redirect to feed
                const base = getBasePath();
                window.location.href = `${base}/html/user.html`;
            }
            return { success: true };
        } else {
            return { success: false, error: data.error };
        }
    } catch (error) {
        console.error('Login error:', error);
        return { success: false, error: 'Network error. Please try again.' };
    }
}

function setupProfilePage() {
    const profileForm = document.getElementById('profileForm');
    const logoutBtn = document.getElementById('logoutBtn');
    if (!profileForm && !logoutBtn) return;

    if (profileForm && profileForm.dataset.bound === 'true') {
        return;
    }

    if (profileForm) profileForm.dataset.bound = 'true';
    if (logoutBtn) logoutBtn.dataset.bound = 'true';

    requireAuth();
    const user = getCurrentUser();
    if (!user) return;

    const emailEl = document.getElementById('profileEmail');
    const firstNameEl = document.getElementById('profileFirstName');
    const lastNameEl = document.getElementById('profileLastName');
    const bioEl = document.getElementById('profileBio');
    const avatarEl = document.getElementById('profileAvatar');
    const messageEl = document.getElementById('profileMessage');

    if (emailEl) emailEl.value = user.email || '';
    if (firstNameEl) firstNameEl.value = user.firstName || user.first_name || '';
    if (lastNameEl) lastNameEl.value = user.lastName || user.last_name || '';
    if (bioEl) bioEl.value = user.bio || '';
    if (avatarEl) avatarEl.value = user.avatarUrl || user.avatar_url || '';

    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => logout());
    }

    if (profileForm) {
        profileForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            if (messageEl) {
                messageEl.style.display = 'none';
                messageEl.className = 'profile-message';
                messageEl.textContent = '';
            }

            const updatedUser = {
                ...user,
                firstName: firstNameEl ? firstNameEl.value.trim() : user.firstName,
                lastName: lastNameEl ? lastNameEl.value.trim() : user.lastName,
                bio: bioEl ? bioEl.value.trim() : user.bio,
                avatarUrl: avatarEl ? avatarEl.value.trim() : user.avatarUrl,
            };

            localStorage.setItem('juke_user', JSON.stringify(updatedUser));
            currentUser = updatedUser;
            updateAuthUI();

            if (messageEl) {
                messageEl.textContent = 'Saved locally.';
                messageEl.className = 'profile-message success';
                messageEl.style.display = 'block';
            }
        });
    }
}

// Register function
async function register(username, email, password, firstName, lastName) {
    try {
        const result = await postAuthJson(
            '/auth/register',
            { username, email, password, firstName, lastName },
            function (data) { return !!(data && data.token && data.user); }
        );
        const data = result.data;

        if (result.ok) {
            // Store token and user data
            localStorage.setItem('juke_token', data.token);
            localStorage.setItem('juke_user', JSON.stringify(data.user));
            currentUser = data.user;

            if (document.body && document.body.dataset && document.body.dataset.spa) {
                window.location.hash = '#/feed';
            } else {
                // Redirect to feed
                const base = getBasePath();
                window.location.href = `${base}/html/user.html`;
            }
            return { success: true };
        } else {
            return { success: false, error: data.error };
        }
    } catch (error) {
        console.error('Register error:', error);
        return { success: false, error: 'Network error. Please try again.' };
    }
}

// Update UI based on auth state
function updateAuthUI() {
    const user = getCurrentUser();
    const loginLinks = document.querySelectorAll('.auth-login');
    const userLinks = document.querySelectorAll('.auth-user');
    const usernameDisplay = document.querySelector('.username-display');

    if (user) {
        // Show user-specific elements
        loginLinks.forEach(link => link.style.display = 'none');
        userLinks.forEach(link => link.style.display = '');
        
        if (usernameDisplay) {
            usernameDisplay.textContent = user.username || user.firstName || 'User';
        }
    } else {
        // Show login elements
        loginLinks.forEach(link => link.style.display = '');
        userLinks.forEach(link => link.style.display = 'none');
        
        if (usernameDisplay) {
            usernameDisplay.textContent = '';
        }
    }

    if (typeof setFloatingButtonDestination === 'function') {
        setFloatingButtonDestination();
    }
}

// Handle login form submission
function setupLoginForm() {
    const form = document.getElementById('loginForm');
    if (!form) return;

    if (form.dataset.bound === 'true') return;
    form.dataset.bound = 'true';

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value;
        const submitBtn = form.querySelector('button[type="submit"]');
        
        // Show loading state
        submitBtn.disabled = true;
        submitBtn.textContent = 'Logging in...';
        
        // Clear previous errors
        const errorDiv = document.getElementById('loginError');
        if (errorDiv) {
            errorDiv.remove();
        }
        
        // Attempt login
        const result = await login(username, password);
        
        if (!result.success) {
            // Show error
            const errorDiv = document.createElement('div');
            errorDiv.id = 'loginError';
            errorDiv.className = 'error-message';
            errorDiv.textContent = result.error;
            form.insertBefore(errorDiv, form.firstChild);
        }
        
        // Reset button
        submitBtn.disabled = false;
        submitBtn.textContent = 'Log In';
    });
}

// Handle register form submission
function setupRegisterForm() {
    const form = document.getElementById('registerForm');
    if (!form) return;

    if (form.dataset.bound === 'true') return;
    form.dataset.bound = 'true';

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const username = document.getElementById('username').value.trim();
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirm-password').value;
        const firstName = document.getElementById('firstName').value.trim();
        const lastName = document.getElementById('lastName').value.trim();
        const submitBtn = form.querySelector('button[type="submit"]');
        
        // Validate password confirmation
        if (password !== confirmPassword) {
            const errorDiv = document.createElement('div');
            errorDiv.id = 'registerError';
            errorDiv.className = 'error-message';
            errorDiv.textContent = 'Passwords do not match!';
            form.insertBefore(errorDiv, form.firstChild);
            return;
        }
        
        // Show loading state
        submitBtn.disabled = true;
        submitBtn.textContent = 'Creating account...';
        
        // Clear previous errors
        const errorDiv = document.getElementById('registerError');
        if (errorDiv) {
            errorDiv.remove();
        }
        
        // Attempt registration
        const result = await register(username, email, password, firstName, lastName);
        
        if (!result.success) {
            // Show error
            const errorDiv = document.createElement('div');
            errorDiv.id = 'registerError';
            errorDiv.className = 'error-message';
            errorDiv.textContent = result.error;
            form.insertBefore(errorDiv, form.firstChild);
        }
        
        // Reset button
        submitBtn.disabled = false;
        submitBtn.textContent = 'Sign Up';
    });
}

// Initialize auth on page load
document.addEventListener('DOMContentLoaded', () => {
    updateAuthUI();
    setupLoginForm();
    setupRegisterForm();
    setupProfilePage();
});
