// JUKE Authentication System - Minimal & Clean

// ==================== CORE AUTH ====================
class AuthManager {
    constructor() {
        this.currentUser = null;
    }

    isLoggedIn() {
        return localStorage.getItem('juke_token') !== null;
    }

    getCurrentUser() {
        if (!this.currentUser) {
            const token = localStorage.getItem('juke_token');
            const user = localStorage.getItem('juke_user');
            if (token && user) {
                try {
                    this.currentUser = JSON.parse(user);
                } catch {
                    this.currentUser = null;
                }
            }
        }
        return this.currentUser;
    }

    getToken() {
        return localStorage.getItem('juke_token');
    }

    setSession(token, user) {
        localStorage.setItem('juke_token', token);
        localStorage.setItem('juke_user', JSON.stringify(user));
        this.currentUser = user;
        this.dispatchAuthChange();
    }

    clearSession() {
        localStorage.removeItem('juke_token');
        localStorage.removeItem('juke_user');
        this.currentUser = null;
        this.dispatchAuthChange();
    }

    dispatchAuthChange() {
        try {
            document.dispatchEvent(new Event('auth:changed'));
        } catch {}
    }

    getBasePath() {
        const path = window.location.pathname.replace(/\\/g, '/');
        return path.includes('/html/') ? '..' : '.';
    }

    isSpaMode() {
        return !!(document.body?.dataset?.spa);
    }

    requireAuth() {
        if (this.isLoggedIn()) return true;

        if (this.isSpaMode()) {
            window.location.hash = '#/login';
        } else {
            const base = this.getBasePath();
            window.location.href = `${base}/html/login.html`;
        }
        return false;
    }

    logout() {
        this.clearSession();

        try {
            if (window.JukePlayer?.stop) {
                window.JukePlayer.stop();
            }
        } catch {}

        if (this.isSpaMode()) {
            window.location.hash = '#/login';
        } else {
            const base = this.getBasePath();
            window.location.href = `${base}/html/login.html`;
        }
    }

    parseTokenPayload(token) {
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            return {
                id: payload.id,
                username: payload.username,
                email: payload.email,
                firstName: payload.first_name,
                lastName: payload.last_name,
                avatarUrl: payload.avatar_url,
                bio: payload.bio
            };
        } catch {
            return null;
        }
    }
}

// ==================== AUTH SERVICE ====================
class AuthService {
    constructor(authManager) {
        this.authManager = authManager;
    }

    async login(username, password) {
        try {
            const result = await this.postAuthJson('/auth/login', { username, password });
            
            if (result.ok) {
                this.authManager.setSession(result.data.token, result.data.user);
                this.redirectAfterAuth();
                return { success: true };
            } else {
                return { success: false, error: result.data.error };
            }
        } catch (error) {
            console.error('Login error:', error);
            return { success: false, error: 'Network error. Please try again.' };
        }
    }

    async register(username, email, password, firstName, lastName) {
        try {
            const result = await this.postAuthJson('/auth/register', {
                username, email, password, firstName, lastName
            });
            
            if (result.ok) {
                this.authManager.setSession(result.data.token, result.data.user);
                this.redirectAfterAuth();
                return { success: true };
            } else {
                return { success: false, error: result.data.error };
            }
        } catch (error) {
            console.error('Register error:', error);
            return { success: false, error: 'Network error. Please try again.' };
        }
    }

    redirectAfterAuth() {
        if (this.authManager.isSpaMode()) {
            window.location.hash = '#/feed';
        } else {
            const base = this.authManager.getBasePath();
            window.location.href = `${base}/html/user.html`;
        }
    }

    async postAuthJson(path, payload) {
        const bases = this.getAuthApiBases();
        let lastErr = null;

        for (const base of bases) {
            try {
                const response = await fetch(base + path, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                let data = null;
                try {
                    data = await response.json();
                } catch {
                    const text = await response.text().catch(() => '');
                    if (response.status === 404 || response.status === 405) {
                        lastErr = new Error('Endpoint not found');
                        continue;
                    }
                    data = text ? { error: text } : { error: 'Invalid response' };
                }

                if (response.ok) {
                    try {
                        localStorage.setItem('juke_api_base', base);
                    } catch {}
                    return { ok: true, data };
                }

                if (response.status === 404 || response.status === 405) {
                    lastErr = new Error(data?.error || `Request failed: ${response.status}`);
                    continue;
                }

                return { ok: false, data };
            } catch (e) {
                lastErr = e;
            }
        }

        throw lastErr || new Error('Network error');
    }

    getAuthApiBases() {
        const bases = [this.getApiBase(), 'https://juke-api.onrender.com/api'];
        return [...new Set(bases.filter(Boolean))];
    }

    getApiBase() {
        try {
            if (window.location?.origin) {
                const host = window.location.hostname || '';
                if (host.endsWith('github.io')) return 'https://juke-api.onrender.com/api';
                return window.location.origin.replace(/\/$/, '') + '/api';
            }
        } catch {}
        return 'https://juke-api.onrender.com/api';
    }

    async makeAuthenticatedRequest(url, options = {}) {
        const token = this.authManager.getToken();
        if (!token) throw new Error('No authentication token');

        return await fetch(url, {
            ...options,
            headers: {
                'Authorization': `Bearer ${token}`,
                ...options.headers
            }
        });
    }
}

// ==================== UI MANAGER ====================
class UIManager {
    constructor(authManager) {
        this.authManager = authManager;
    }

    updateAuthUI() {
        const user = this.authManager.getCurrentUser();
        const loginLinks = document.querySelectorAll('.auth-login');
        const userLinks = document.querySelectorAll('.auth-user');
        const usernameDisplay = document.querySelector('.username-display');

        if (user) {
            loginLinks.forEach(el => el.style.display = 'none');
            userLinks.forEach(el => el.style.display = '');
            if (usernameDisplay) {
                usernameDisplay.textContent = user.username || user.firstName || 'User';
            }
        } else {
            loginLinks.forEach(el => el.style.display = '');
            userLinks.forEach(el => el.style.display = 'none');
            if (usernameDisplay) {
                usernameDisplay.textContent = '';
            }
        }

        this.setFloatingButtonDestination();
    }

    setFloatingButtonDestination() {
        const floatingButton = document.querySelector('a.floating-button');
        if (!floatingButton) return;

        const user = this.authManager.getCurrentUser();
        
        if (this.authManager.isSpaMode()) {
            floatingButton.href = user ? '#/profile' : '#/login';
        } else {
            const base = this.authManager.getBasePath();
            floatingButton.href = user ? `${base}/html/profile.html` : `${base}/html/login.html`;
        }
    }

    showMessage(element, message, type = 'error') {
        if (!element) return;
        
        element.textContent = message;
        element.className = `profile-message ${type}`;
        element.style.display = 'block';
        
        setTimeout(() => {
            element.style.display = 'none';
        }, 5000);
    }

    createErrorElement(message, id = 'error') {
        const errorDiv = document.createElement('div');
        errorDiv.id = id;
        errorDiv.className = 'error-message';
        errorDiv.textContent = message;
        return errorDiv;
    }
}

// ==================== FORM HANDLER ====================
class FormHandler {
    constructor(authManager, authService, uiManager) {
        this.authManager = authManager;
        this.authService = authService;
        this.uiManager = uiManager;
    }

    setupLoginForm() {
        const form = document.getElementById('loginForm');
        if (!form || form.dataset.bound === 'true') return;

        form.dataset.bound = 'true';
        form.addEventListener('submit', (e) => this.handleLoginSubmit(e));
    }

    setupRegisterForm() {
        const form = document.getElementById('registerForm');
        if (!form || form.dataset.bound === 'true') return;

        form.dataset.bound = 'true';
        form.addEventListener('submit', (e) => this.handleRegisterSubmit(e));
    }

    async handleLoginSubmit(e) {
        e.preventDefault();
        
        const form = e.target;
        const username = document.getElementById('username')?.value?.trim();
        const password = document.getElementById('password')?.value;
        const submitBtn = form.querySelector('button[type="submit"]');
        
        if (!username || !password) return;

        this.setButtonLoading(submitBtn, 'Logging in...');
        this.clearFormErrors(form);
        
        const result = await this.authService.login(username, password);
        
        if (!result.success) {
            const errorDiv = this.uiManager.createErrorElement(result.error, 'loginError');
            form.insertBefore(errorDiv, form.firstChild);
        }
        
        this.resetButton(submitBtn, 'Log In');
    }

    async handleRegisterSubmit(e) {
        e.preventDefault();
        
        const form = e.target;
        const username = document.getElementById('username')?.value?.trim();
        const email = document.getElementById('email')?.value?.trim();
        const password = document.getElementById('password')?.value;
        const confirmPassword = document.getElementById('confirm-password')?.value;
        const firstName = document.getElementById('firstName')?.value?.trim();
        const lastName = document.getElementById('lastName')?.value?.trim();
        const submitBtn = form.querySelector('button[type="submit"]');
        
        if (password !== confirmPassword) {
            const errorDiv = this.uiManager.createErrorElement('Passwords do not match!', 'registerError');
            form.insertBefore(errorDiv, form.firstChild);
            return;
        }
        
        this.setButtonLoading(submitBtn, 'Creating account...');
        this.clearFormErrors(form);
        
        const result = await this.authService.register(username, email, password, firstName, lastName);
        
        if (!result.success) {
            const errorDiv = this.uiManager.createErrorElement(result.error, 'registerError');
            form.insertBefore(errorDiv, form.firstChild);
        }
        
        this.resetButton(submitBtn, 'Sign Up');
    }

    setButtonLoading(button, text) {
        button.disabled = true;
        button.textContent = text;
    }

    resetButton(button, text) {
        button.disabled = false;
        button.textContent = text;
    }

    clearFormErrors(form) {
        const errorDiv = form.querySelector('.error-message');
        if (errorDiv) errorDiv.remove();
    }
}

// ==================== PROFILE MANAGER ====================
class ProfileManager {
    constructor(authManager, authService, uiManager) {
        this.authManager = authManager;
        this.authService = authService;
        this.uiManager = uiManager;
    }

    setupProfilePage() {
        const profileForm = document.getElementById('profileForm');
        const logoutBtn = document.getElementById('logoutBtn');
        const deleteProfileBtn = document.getElementById('deleteProfileBtn');
        
        if (!profileForm && !logoutBtn && !deleteProfileBtn) return;

        if (profileForm?.dataset.bound === 'true') return;

        // Mark as bound
        if (profileForm) profileForm.dataset.bound = 'true';
        if (logoutBtn) logoutBtn.dataset.bound = 'true';
        if (deleteProfileBtn) deleteProfileBtn.dataset.bound = 'true';

        this.authManager.requireAuth();
        const token = this.authManager.getToken();
        if (!token) return;

        const user = this.authManager.parseTokenPayload(token);
        if (!user) return;

        this.setupFormFields(user);
        this.setupAvatar(user);
        this.bindEvents(token, user);
    }

    setupFormFields(user) {
        const fields = {
            profileEmail: user.email || '',
            profileFirstName: user.firstName || '',
            profileLastName: user.lastName || '',
            profileBio: user.bio || '',
            profileAvatar: user.avatarUrl || ''
        };

        Object.entries(fields).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) element.value = value;
        });
    }

    setupAvatar(user) {
        const avatarPreview = document.getElementById('avatarPreview');
        const avatarPreviewImg = document.getElementById('avatarPreviewImg');
        const avatarFileInput = document.getElementById('profileAvatarFile');
        const uploadBtn = document.getElementById('avatarUploadBtn');
        const removeBtn = document.getElementById('avatarRemoveBtn');

        if (!avatarPreview || !avatarFileInput) return;

        // Load current avatar
        if (user.avatarUrl && avatarPreviewImg) {
            avatarPreviewImg.src = user.avatarUrl;
            avatarPreview.classList.add('has-image');
            if (removeBtn) removeBtn.style.display = 'inline-block';
            if (uploadBtn) uploadBtn.textContent = 'Change Picture';
        }

        // Setup events
        avatarPreview.addEventListener('click', () => avatarFileInput.click());
        if (uploadBtn) uploadBtn.addEventListener('click', () => avatarFileInput.click());
        
        if (removeBtn) {
            removeBtn.addEventListener('click', () => {
                avatarPreviewImg.src = 'images/juke.png';
                avatarPreview.classList.remove('has-image');
                document.getElementById('profileAvatar').value = '';
                avatarFileInput.value = '';
                removeBtn.style.display = 'none';
                if (uploadBtn) uploadBtn.textContent = 'Upload Picture';
                avatarPreview.dataset.newAvatar = 'true';
            });
        }

        avatarFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            if (!file.type.startsWith('image/')) {
                this.uiManager.showMessage(document.getElementById('profileMessage'), 'Please select an image file.', 'error');
                return;
            }

            if (file.size > 5 * 1024 * 1024) {
                this.uiManager.showMessage(document.getElementById('profileMessage'), 'Image size must be less than 5MB.', 'error');
                return;
            }

            const reader = new FileReader();
            reader.onload = (e) => {
                avatarPreviewImg.src = e.target.result;
                avatarPreview.classList.add('has-image');
                if (removeBtn) removeBtn.style.display = 'inline-block';
                if (uploadBtn) uploadBtn.textContent = 'Change Picture';
                avatarPreview.dataset.newAvatar = 'true';
            };
            reader.readAsDataURL(file);
        });
    }

    bindEvents(token, user) {
        const profileForm = document.getElementById('profileForm');
        const logoutBtn = document.getElementById('logoutBtn');
        const deleteProfileBtn = document.getElementById('deleteProfileBtn');

        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => this.authManager.logout());
        }

        if (deleteProfileBtn) {
            deleteProfileBtn.addEventListener('click', () => this.deleteProfile());
        }

        if (profileForm) {
            profileForm.addEventListener('submit', (e) => this.handleProfileSubmit(e, token, user));
        }
    }

    async handleProfileSubmit(e, token, user) {
        e.preventDefault();

        const messageEl = document.getElementById('profileMessage');
        if (messageEl) {
            messageEl.style.display = 'none';
            messageEl.className = 'profile-message';
            messageEl.textContent = '';
        }

        // Handle avatar upload first
        const avatarPreview = document.getElementById('avatarPreview');
        const avatarFileInput = document.getElementById('profileAvatarFile');
        if (avatarPreview?.dataset.newAvatar === 'true' && avatarFileInput?.files[0]) {
            try {
                const formData = new FormData();
                formData.append('avatar', avatarFileInput.files[0]);
                
                const response = await fetch('/api/users/avatar', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: formData
                });
                
                if (response.ok) {
                    const result = await response.json();
                    document.getElementById('profileAvatar').value = result.avatar_url;
                } else {
                    throw new Error('Avatar upload failed');
                }
            } catch (error) {
                this.uiManager.showMessage(messageEl, 'Failed to upload avatar. Please try again.', 'error');
                return;
            }
        }

        // Update profile data
        try {
            const firstNameEl = document.getElementById('profileFirstName');
            const lastNameEl = document.getElementById('profileLastName');
            const bioEl = document.getElementById('profileBio');
            const avatarEl = document.getElementById('profileAvatar');

            const response = await this.authService.makeAuthenticatedRequest('/api/users/profile', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    first_name: firstNameEl?.value?.trim() || user.firstName,
                    last_name: lastNameEl?.value?.trim() || user.lastName,
                    bio: bioEl?.value?.trim() || user.bio,
                    avatar_url: avatarEl?.value?.trim() || user.avatarUrl
                })
            });

            if (response.ok) {
                const result = await response.json();
                
                if (result.token) {
                    localStorage.setItem('juke_token', result.token);
                }

                this.uiManager.updateAuthUI();
                
                if (avatarPreview) delete avatarPreview.dataset.newAvatar;

                this.uiManager.showMessage(messageEl, 'Profile updated successfully!', 'success');
            } else {
                throw new Error('Profile update failed');
            }
        } catch (error) {
            console.error('Profile update error:', error);
            this.uiManager.showMessage(messageEl, 'Failed to update profile. Please try again.', 'error');
        }
    }

    async deleteProfile() {
        const token = this.authManager.getToken();
        if (!token) {
            this.authManager.logout();
            return;
        }

        const confirmed = confirm('Are you sure you want to delete your profile? This action cannot be undone and will permanently delete all your data including tracks, playlists, and account information.');
        if (!confirmed) return;

        const doubleConfirmed = confirm('This is your last chance! Are you absolutely sure you want to permanently delete your JUKE profile?');
        if (!doubleConfirmed) return;

        try {
            const response = await this.authService.makeAuthenticatedRequest('/api/users/profile', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' }
            });

            if (response.ok) {
                alert('Your profile has been successfully deleted. You will be redirected to the home page.');
                this.authManager.clearSession();
                window.location.hash = '#/feed';
                window.location.reload();
            } else {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to delete profile');
            }
        } catch (error) {
            console.error('Delete profile error:', error);
            alert(`Failed to delete profile: ${error.message}. Please try again or contact support.`);
        }
    }
}

// ==================== INITIALIZATION ====================
const authManager = new AuthManager();
const authService = new AuthService(authManager);
const uiManager = new UIManager(authManager);
const formHandler = new FormHandler(authManager, authService, uiManager);
const profileManager = new ProfileManager(authManager, authService, uiManager);

// Expose main instances for advanced usage
window.JukeAuth = {
    authManager,
    authService,
    uiManager,
    formHandler,
    profileManager
};

// Expose legacy functions for backward compatibility
window.isLoggedIn = () => authManager.isLoggedIn();
window.getCurrentUser = () => authManager.getCurrentUser();
window.logout = () => authManager.logout();
window.requireAuth = () => authManager.requireAuth();
window.login = (username, password) => authService.login(username, password);
window.register = (username, email, password, firstName, lastName) => authService.register(username, email, password, firstName, lastName);
window.updateAuthUI = () => uiManager.updateAuthUI();
window.setupLoginForm = () => formHandler.setupLoginForm();
window.setupRegisterForm = () => formHandler.setupRegisterForm();
window.setupProfilePage = () => profileManager.setupProfilePage();

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    uiManager.updateAuthUI();
    formHandler.setupLoginForm();
    formHandler.setupRegisterForm();
    profileManager.setupProfilePage();
});
