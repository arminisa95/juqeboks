async function postAuthJson(path, payload, validateOkData) {
    var bases = window.JukeAPIBase.getApiBases();
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

            var data;
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
                try {
                    localStorage.setItem('juke_api_base', base);
                } catch (_) {
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

    try {
        if (window.JukePlayer && typeof window.JukePlayer.stop === 'function') {
            window.JukePlayer.stop();
        }
    } catch (_) {
    }

    try {
        document.dispatchEvent(new Event('auth:changed'));
    } catch (_) {
    }

    if (document.body && document.body.dataset && document.body.dataset.spa) {
        window.location.hash = '#/login';
        return;
    }

    const base = getBasePath();
    window.location.href = `${base}/views/login.html`;
}

function getBasePath() {
    const path = window.location.pathname.replace(/\\/g, '/');
    return path.includes('/views/') ? '..' : '.';
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
        floatingButton.href = `${base}/views/profile.html`;
    } else {
        floatingButton.href = `${base}/views/login.html`;
    }
}

function requireAuth() {
    if (getCurrentUser()) return;

    if (document.body && document.body.dataset && document.body.dataset.spa) {
        window.location.hash = '#/login';
        return;
    }

    const base = getBasePath();
    window.location.href = `${base}/views/login.html`;
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
                try {
                    document.dispatchEvent(new Event('auth:changed'));
                } catch (_) {
                }
                window.location.hash = '#/feed';
            } else {
                // Redirect to feed
                const base = getBasePath();
                window.location.href = `${base}/views/user.html`;
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
    const deleteProfileBtn = document.getElementById('deleteProfileBtn');
    if (!profileForm && !logoutBtn && !deleteProfileBtn) return;

    if (profileForm && profileForm.dataset.bound === 'true') {
        return;
    }

    if (profileForm) profileForm.dataset.bound = 'true';
    if (logoutBtn) logoutBtn.dataset.bound = 'true';
    if (deleteProfileBtn) deleteProfileBtn.dataset.bound = 'true';

    requireAuth();
    const token = localStorage.getItem('juke_token');
    if (!token) return;

    // Parse user data from token
    let user = null;
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        user = {
            id: payload.id,
            username: payload.username,
            email: payload.email,
            firstName: payload.first_name,
            lastName: payload.last_name,
            avatarUrl: payload.avatar_url,
            bio: payload.bio
        };
    } catch (error) {
        console.error('Error parsing token:', error);
        return;
    }

    // Get form elements
    const usernameEl = document.getElementById('profileUsername');
    const emailEl = document.getElementById('profileEmail');
    const firstNameEl = document.getElementById('profileFirstName');
    const lastNameEl = document.getElementById('profileLastName');
    const bioEl = document.getElementById('profileBio');
    const avatarEl = document.getElementById('profileAvatar');
    const messageEl = document.getElementById('profileMessage');

    // Password change elements
    const currentPasswordEl = document.getElementById('currentPassword');
    const newPasswordEl = document.getElementById('newPassword');
    const confirmPasswordEl = document.getElementById('confirmPassword');

    // Avatar upload elements
    const avatarPreview = document.getElementById('avatarPreview');
    const avatarPreviewImg = document.getElementById('avatarPreviewImg');
    const avatarFileInput = document.getElementById('profileAvatarFile');
    const uploadBtn = document.getElementById('avatarUploadBtn');
    const removeBtn = document.getElementById('avatarRemoveBtn');

    // Populate form fields
    if (usernameEl) usernameEl.value = user.username || '';
    if (emailEl) emailEl.value = user.email || '';
    if (firstNameEl) firstNameEl.value = user.firstName || '';
    if (lastNameEl) lastNameEl.value = user.lastName || '';
    if (bioEl) bioEl.value = user.bio || '';
    if (avatarEl) avatarEl.value = user.avatarUrl || '';

    // Load current avatar
    if (avatarPreview && avatarPreviewImg && user.avatarUrl) {
        avatarPreviewImg.src = user.avatarUrl;
        avatarPreview.classList.add('has-image');
        if (removeBtn) removeBtn.style.display = 'inline-block';
        if (uploadBtn) uploadBtn.textContent = 'Change Picture';
    }

    // Setup avatar upload handlers
    if (avatarPreview && avatarFileInput) {
        avatarPreview.addEventListener('click', () => avatarFileInput.click());
        if (uploadBtn) uploadBtn.addEventListener('click', () => avatarFileInput.click());
        if (removeBtn) removeBtn.addEventListener('click', () => {
            avatarPreviewImg.src = 'images/juqe.png';
            avatarPreview.classList.remove('has-image');
            avatarEl.value = '';
            avatarFileInput.value = '';
            if (removeBtn) removeBtn.style.display = 'none';
            if (uploadBtn) uploadBtn.textContent = 'Upload Picture';
            avatarPreview.dataset.newAvatar = 'true';
        });

        avatarFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            if (!file.type.startsWith('image/')) {
                showMessage(messageEl, 'Please select an image file.', 'error');
                return;
            }

            if (file.size > 5 * 1024 * 1024) {
                showMessage(messageEl, 'Image size must be less than 5MB.', 'error');
                return;
            }

            const reader = new FileReader();
            reader.onload = function(e) {
                avatarPreviewImg.src = e.target.result;
                avatarPreview.classList.add('has-image');
                if (removeBtn) removeBtn.style.display = 'inline-block';
                if (uploadBtn) uploadBtn.textContent = 'Change Picture';
                avatarPreview.dataset.newAvatar = 'true';
            };
            reader.readAsDataURL(file);
        });
    }

    // Logout button handler
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => logout());
    }

    // Delete profile button handler
    if (deleteProfileBtn) {
        deleteProfileBtn.addEventListener('click', () => deleteProfile());
    }

    // Form submission handler
    if (profileForm) {
        profileForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            if (messageEl) {
                messageEl.style.display = 'none';
                messageEl.className = 'profile-message';
                messageEl.textContent = '';
            }

            // Handle avatar upload first
            if (avatarPreview && avatarPreview.dataset.newAvatar === 'true' && avatarFileInput.files[0]) {
                try {
                    const avatarFormData = new FormData();
                    avatarFormData.append('avatar', avatarFileInput.files[0]);

                    const result = await apiFetchJson('/users/avatar', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token}`
                        },
                        body: avatarFormData
                    }, function (d) {
                        return !!d && typeof d === 'object' && !Array.isArray(d);
                    });

                    if (avatarEl) {
                        avatarEl.value = result.avatar_url || '';
                    }
                    avatarPreview.dataset.newAvatar = 'false';
                } catch (error) {
                    console.error('Avatar upload error:', error);
                    showMessage(messageEl, 'Failed to upload avatar: ' + (error.message || 'Please try again.'), 'error');
                    return;
                }
            }

            // Update profile data
            try {
                // Handle password change if provided
                if (currentPasswordEl && newPasswordEl && confirmPasswordEl) {
                    const currentPassword = currentPasswordEl.value.trim();
                    const newPassword = newPasswordEl.value.trim();
                    const confirmPassword = confirmPasswordEl.value.trim();

                    if (currentPassword && newPassword && confirmPassword) {
                        if (newPassword !== confirmPassword) {
                            showMessage(messageEl, 'New passwords do not match.', 'error');
                            return;
                        }

                        if (newPassword.length < 8) {
                            showMessage(messageEl, 'New password must be at least 8 characters.', 'error');
                            return;
                        }

                        try {
                            await apiFetchJson('/auth/change-password', {
                                method: 'POST',
                                headers: {
                                    'Authorization': `Bearer ${token}`,
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({
                                    currentPassword: currentPassword,
                                    newPassword: newPassword
                                })
                            });

                            // Clear password fields
                            currentPasswordEl.value = '';
                            newPasswordEl.value = '';
                            confirmPasswordEl.value = '';

                            showMessage(messageEl, 'Password changed successfully!', 'success');
                        } catch (error) {
                            showMessage(messageEl, 'Failed to change password. Please check your current password.', 'error');
                            return;
                        }
                    }
                }

                // Handle username change
                const newUsername = usernameEl ? usernameEl.value.trim() : user.username;
                if (newUsername && newUsername !== user.username) {
                    try {
                        await apiFetchJson('/auth/change-username', {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${token}`,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                newUsername: newUsername
                            })
                        });
                    } catch (error) {
                        showMessage(messageEl, 'Username already taken or invalid.', 'error');
                        return;
                    }
                }

                const result = await apiFetchJson('/users/profile', {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        username: newUsername,
                        first_name: firstNameEl ? firstNameEl.value.trim() : user.firstName,
                        last_name: lastNameEl ? lastNameEl.value.trim() : user.lastName,
                        bio: bioEl ? bioEl.value.trim() : user.bio,
                        avatar_url: avatarEl ? avatarEl.value.trim() : user.avatarUrl
                    })
                }, function (d) {
                    return !!d && typeof d === 'object' && !Array.isArray(d);
                });

                if (result) {
                    // Update token with new data
                    if (result.token) {
                        localStorage.setItem('juke_token', result.token);
                    }

                    // Update local user data
                    const updatedUser = {
                        ...user,
                        username: newUsername,
                        firstName: firstNameEl ? firstNameEl.value.trim() : user.firstName,
                        lastName: lastNameEl ? lastNameEl.value.trim() : user.lastName,
                        bio: bioEl ? bioEl.value.trim() : user.bio,
                        avatarUrl: avatarEl ? avatarEl.value.trim() : user.avatarUrl,
                    };

                    // Update currentUser
                    currentUser = updatedUser;

                    // Update UI
                    updateAuthUI();
                    
                    // Clear avatar upload flag
                    if (avatarPreview) delete avatarPreview.dataset.newAvatar;

                    showMessage(messageEl, 'Profile updated successfully!', 'success');
                }
            } catch (error) {
                console.error('Profile update error:', error);
                showMessage(messageEl, 'Failed to update profile. Please try again.', 'error');
            }
        });
    }
}

function showMessage(messageEl, message, type) {
    if (messageEl) {
        messageEl.textContent = message;
        messageEl.className = `profile-message ${type}`;
        messageEl.style.display = 'block';
        
        setTimeout(() => {
            messageEl.style.display = 'none';
        }, 5000);
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
                try {
                    document.dispatchEvent(new Event('auth:changed'));
                } catch (_) {
                }
                window.location.hash = '#/feed';
            } else {
                // Redirect to feed
                const base = getBasePath();
                window.location.href = `${base}/views/user.html`;
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
        userLinks.forEach(link => {
            link.style.display = '';
            // Keep auth-user links as "_U" (don't show username in top nav)
            if (link.textContent.startsWith('_') && link.textContent !== '_U') {
                link.textContent = '_U';
                link.style.color = '';
            }
        });
        
        if (usernameDisplay) {
            usernameDisplay.textContent = user.username || user.firstName || 'User';
        }
        
        // Update koleqtion text with username
        updateKoleqtionText(user.username || user.firstName || 'User');
    } else {
        // Show login elements
        loginLinks.forEach(link => link.style.display = '');
        userLinks.forEach(link => {
            link.style.display = 'none';
        });
        
        if (usernameDisplay) {
            usernameDisplay.textContent = '';
        }
        
        // Reset koleqtion text
        updateKoleqtionText(null);
    }

    if (typeof setFloatingButtonDestination === 'function') {
        setFloatingButtonDestination();
    }
}

// Update koleqtion text to show username with underscore
function updateKoleqtionText(username) {
    const koleqtionElements = document.querySelectorAll('.library-nav-title');
    const koleqtionLinks = document.querySelectorAll('a[href*="koleqtion"], a[href="#/koleqtion"]');
    const mobileKoleqtion = document.querySelector('.mobile-nav-item[data-nav="koleqtion"] span');
    
    const displayText = username ? `_${username}` : '_koleqtion';
    const isUserLoggedIn = !!username;
    
    // Update library nav titles
    koleqtionElements.forEach(element => {
        if (element.textContent.includes('_koleqtion') || element.textContent.startsWith('_')) {
            element.textContent = displayText;
            element.style.color = isUserLoggedIn ? '#00ffd0' : '';
        }
    });
    
    // Update koleqtion links
    koleqtionLinks.forEach(link => {
        if (link.textContent.includes('_koleqtion') || link.textContent.startsWith('_')) {
            link.textContent = displayText;
            link.style.color = isUserLoggedIn ? '#00ffd0' : '';
        }
    });
    
    // Update mobile navigation
    if (mobileKoleqtion) {
        mobileKoleqtion.textContent = displayText;
        mobileKoleqtion.style.color = isUserLoggedIn ? '#00ffd0' : '';
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

// Delete profile function
async function deleteProfile() {
    const token = getAuthToken();
    if (!token) {
        logout();
        return;
    }

    // Show confirmation dialog
    const confirmed = confirm('Are you sure you want to delete your profile? This action cannot be undone and will permanently delete all your data including tracks, playlists, and account information.');
    
    if (!confirmed) {
        return;
    }

    // Second confirmation for safety
    const doubleConfirmed = confirm('This is your last chance! Are you absolutely sure you want to permanently delete your JUKE profile?');
    
    if (!doubleConfirmed) {
        return;
    }

    try {

        await apiFetchJson('/users/profile', {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        }, function (d) {
            return !d || (typeof d === 'object');
        });

        {
            // Show success message
            alert('Your profile has been successfully deleted. You will be redirected to the home page.');
            
            // Clear local storage and logout
            localStorage.removeItem('juke_token');
            localStorage.removeItem('juke_user');
            
            // Redirect to home page
            window.location.hash = '#/feed';
            window.location.reload();
        }
    } catch (error) {
        console.error('Delete profile error:', error);
        alert(`Failed to delete profile: ${error.message}. Please try again or contact support.`);
    }
}

// Initialize auth on page load
document.addEventListener('DOMContentLoaded', () => {
    updateAuthUI();
    setupLoginForm();
    setupRegisterForm();
    setupProfilePage();
});
