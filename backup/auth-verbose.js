// JUKE Authentication System - Ultra Clean Architecture

// ==================== CORE AUTH MANAGER ====================
class AuthManager {
    constructor() {
        this.currentUser = null;
    }

    // Core auth state
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

    // Session management
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

    // Navigation helpers
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

// ==================== AUTH API SERVICE ====================
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

    async postAuthJson(path, payload, validateOkData) {
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
                    if (typeof validateOkData === 'function' && !validateOkData(data)) {
                        lastErr = new Error('Invalid response');
                        continue;
                    }
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
            this.hideElements(loginLinks);
            this.showElements(userLinks);
            
            if (usernameDisplay) {
                usernameDisplay.textContent = user.username || user.firstName || 'User';
            }
        } else {
            this.showElements(loginLinks);
            this.hideElements(userLinks);
            
            if (usernameDisplay) {
                usernameDisplay.textContent = '';
            }
        }

        this.setFloatingButtonDestination();
    }

    hideElements(elements) {
        elements.forEach(el => el.style.display = 'none');
    }

    showElements(elements) {
        elements.forEach(el => el.style.display = '');
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

        this.uiManager.setButtonLoading(submitBtn, 'Logging in...');
        this.uiManager.clearFormErrors(form);
        
        const result = await this.authService.login(username, password);
        
        if (!result.success) {
            const errorDiv = this.uiManager.createErrorElement(result.error, 'loginError');
            form.insertBefore(errorDiv, form.firstChild);
        }
        
        this.uiManager.resetButton(submitBtn, 'Log In');
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
        
        this.uiManager.setButtonLoading(submitBtn, 'Creating account...');
        this.uiManager.clearFormErrors(form);
        
        const result = await this.authService.register(username, email, password, firstName, lastName);
        
        if (!result.success) {
            const errorDiv = this.uiManager.createErrorElement(result.error, 'registerError');
            form.insertBefore(errorDiv, form.firstChild);
        }
        
        this.uiManager.resetButton(submitBtn, 'Sign Up');
    }
}

// ==================== PROFILE MANAGER ====================
class ProfileManager {
    constructor(authManager, authService, uiManager) {
        this.authManager = authManager;
        this.authService = authService;
        this.uiManager = uiManager;
        this.avatarHandler = null;
    }

    setupProfilePage() {
        const elements = this.getProfileElements();
        if (!elements.hasAny) return;

        if (elements.profileForm?.dataset.bound === 'true') return;

        this.markElementsAsBound(elements);
        this.authManager.requireAuth();
        
        const token = this.authManager.getToken();
        if (!token) return;

        const user = this.authManager.parseTokenPayload(token);
        if (!user) return;

        this.setupFormFields(user);
        this.avatarHandler = new AvatarHandler(user, this.uiManager);
        this.avatarHandler.setup();
        
        this.bindEvents(token, user);
    }

    getProfileElements() {
        return {
            profileForm: document.getElementById('profileForm'),
            logoutBtn: document.getElementById('logoutBtn'),
            deleteProfileBtn: document.getElementById('deleteProfileBtn'),
            get hasAny() {
                return !!(this.profileForm || this.logoutBtn || this.deleteProfileBtn);
            }
        };
    }

    markElementsAsBound(elements) {
        Object.values(elements).forEach(el => {
            if (el && el.tagName) el.dataset.bound = 'true';
        });
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

    bindEvents(token, user) {
        const elements = this.getProfileElements();

        if (elements.logoutBtn) {
            elements.logoutBtn.addEventListener('click', () => this.authManager.logout());
        }

        if (elements.deleteProfileBtn) {
            elements.deleteProfileBtn.addEventListener('click', () => this.deleteProfile());
        }

        if (elements.profileForm) {
            elements.profileForm.addEventListener('submit', (e) => this.handleProfileSubmit(e, token, user));
        }
    }

    async handleProfileSubmit(e, token, user) {
        e.preventDefault();

        const messageEl = document.getElementById('profileMessage');
        this.resetMessageElement(messageEl);

        // Handle avatar upload first
        if (this.avatarHandler?.hasNewAvatar()) {
            const avatarSuccess = await this.avatarHandler.uploadAvatar(token);
            if (!avatarSuccess) {
                this.uiManager.showMessage(messageEl, 'Failed to upload avatar. Please try again.', 'error');
                return;
            }
        }

        // Update profile data
        const success = await this.updateProfileData(token, user);
        
        if (success) {
            this.uiManager.showMessage(messageEl, 'Profile updated successfully!', 'success');
            this.uiManager.updateAuthUI();
            
            if (this.avatarHandler) {
                this.avatarHandler.clearNewAvatarFlag();
            }
        } else {
            this.uiManager.showMessage(messageEl, 'Failed to update profile. Please try again.', 'error');
        }
    }

    resetMessageElement(messageEl) {
        if (messageEl) {
            messageEl.style.display = 'none';
            messageEl.className = 'profile-message';
            messageEl.textContent = '';
        }
    }

    async updateProfileData(token, user) {
        try {
            const formData = this.getProfileFormData(user);
            
            const response = await this.authService.makeAuthenticatedRequest('/api/users/profile', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            if (response.ok) {
                const result = await response.json();
                
                // Update token with new data
                if (result.token) {
                    localStorage.setItem('juke_token', result.token);
                }

                return true;
            }
            
            return false;
        } catch (error) {
            console.error('Profile update error:', error);
            return false;
        }
    }

    getProfileFormData(user) {
        const firstNameEl = document.getElementById('profileFirstName');
        const lastNameEl = document.getElementById('profileLastName');
        const bioEl = document.getElementById('profileBio');
        const avatarEl = document.getElementById('profileAvatar');

        return {
            first_name: firstNameEl?.value?.trim() || user.firstName,
            last_name: lastNameEl?.value?.trim() || user.lastName,
            bio: bioEl?.value?.trim() || user.bio,
            avatar_url: avatarEl?.value?.trim() || user.avatarUrl
        };
    }

    async deleteProfile() {
        const token = this.authManager.getToken();
        if (!token) {
            this.authManager.logout();
            return;
        }

        if (!this.confirmProfileDeletion()) return;

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

    confirmProfileDeletion() {
        const confirmed = confirm('Are you sure you want to delete your profile? This action cannot be undone and will permanently delete all your data including tracks, playlists, and account information.');
        if (!confirmed) return false;

        const doubleConfirmed = confirm('This is your last chance! Are you absolutely sure you want to permanently delete your JUKE profile?');
        return doubleConfirmed;
    }
}

// ==================== AVATAR HANDLER ====================
class AvatarHandler {
    constructor(user, uiManager) {
        this.user = user;
        this.uiManager = uiManager;
        this.elements = this.getElements();
    }

    getElements() {
        return {
            preview: document.getElementById('avatarPreview'),
            previewImg: document.getElementById('avatarPreviewImg'),
            fileInput: document.getElementById('profileAvatarFile'),
            uploadBtn: document.getElementById('avatarUploadBtn'),
            removeBtn: document.getElementById('avatarRemoveBtn'),
            avatarField: document.getElementById('profileAvatar'),
            messageEl: document.getElementById('profileMessage')
        };
    }

    setup() {
        if (!this.elements.preview || !this.elements.fileInput) return;

        this.loadCurrentAvatar();
        this.bindEvents();
    }

    loadCurrentAvatar() {
        if (!this.user.avatarUrl || !this.elements.previewImg) return;

        this.elements.previewImg.src = this.user.avatarUrl;
        this.elements.preview.classList.add('has-image');
        if (this.elements.removeBtn) this.elements.removeBtn.style.display = 'inline-block';
        if (this.elements.uploadBtn) this.elements.uploadBtn.textContent = 'Change Picture';
    }

    bindEvents() {
        this.elements.preview.addEventListener('click', () => this.elements.fileInput.click());
        if (this.elements.uploadBtn) {
            this.elements.uploadBtn.addEventListener('click', () => this.elements.fileInput.click());
        }
        
        if (this.elements.removeBtn) {
            this.elements.removeBtn.addEventListener('click', () => this.removeAvatar());
        }

        this.elements.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
    }

    handleFileSelect(e) {
        const file = e.target.files[0];
        if (!file) return;

        if (!this.validateFile(file)) return;

        this.previewFile(file);
    }

    validateFile(file) {
        if (!file.type.startsWith('image/')) {
            this.uiManager.showMessage(this.elements.messageEl, 'Please select an image file.', 'error');
            return false;
        }

        if (file.size > 5 * 1024 * 1024) {
            this.uiManager.showMessage(this.elements.messageEl, 'Image size must be less than 5MB.', 'error');
            return false;
        }

        return true;
    }

    previewFile(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            this.elements.previewImg.src = e.target.result;
            this.elements.preview.classList.add('has-image');
            if (this.elements.removeBtn) this.elements.removeBtn.style.display = 'inline-block';
            if (this.elements.uploadBtn) this.elements.uploadBtn.textContent = 'Change Picture';
            this.elements.preview.dataset.newAvatar = 'true';
        };
        reader.readAsDataURL(file);
    }

    removeAvatar() {
        if (this.elements.previewImg) {
            this.elements.previewImg.src = 'images/juke.png';
        }
        this.elements.preview.classList.remove('has-image');
        if (this.elements.avatarField) this.elements.avatarField.value = '';
        if (this.elements.fileInput) this.elements.fileInput.value = '';
        if (this.elements.removeBtn) this.elements.removeBtn.style.display = 'none';
        if (this.elements.uploadBtn) this.elements.uploadBtn.textContent = 'Upload Picture';
        this.elements.preview.dataset.newAvatar = 'true';
    }

    hasNewAvatar() {
        return this.elements.preview?.dataset.newAvatar === 'true' && this.elements.fileInput?.files[0];
    }

    async uploadAvatar(token) {
        if (!this.hasNewAvatar()) return true;

        try {
            const formData = new FormData();
            formData.append('avatar', this.elements.fileInput.files[0]);
            
            const response = await fetch('/api/users/avatar', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });
            
            if (response.ok) {
                const result = await response.json();
                if (this.elements.avatarField) {
                    this.elements.avatarField.value = result.avatar_url;
                }
                return true;
            }
            
            return false;
        } catch (error) {
            console.error('Avatar upload error:', error);
            return false;
        }
    }

    clearNewAvatarFlag() {
        if (this.elements.preview) {
            delete this.elements.preview.dataset.newAvatar;
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
