// JUKE SPA Router - Clean Architecture

(() => {
    'use strict';

    // ==================== CONFIGURATION ====================
    const ROUTES = {
        '#/feed': { templateId: 'tpl-feed', file: 'html/user.html', selector: 'section.music-feed' },
        '#/disqo': { templateId: 'tpl-disqo', file: 'html/disqo.html', selector: 'section.music-feed' },
        '#/koleqtion': { templateId: 'tpl-koleqtion', file: 'html/koleqtion.html', selector: 'main' },
        '#/lists': { templateId: 'tpl-lists', file: 'html/lists.html', selector: 'main' },
        '#/upload': { templateId: 'tpl-upload', file: 'html/upload.html', selector: 'main' },
        '#/login': { templateId: 'tpl-login', file: 'html/login.html', selector: 'main' },
        '#/register': { templateId: 'tpl-register', file: 'html/register.html', selector: 'main' }
    };

    const AUTH_ROUTES = new Set(['#/login', '#/register']);

    // ==================== ROUTER CLASS ====================
    class Router {
        constructor() {
            this.currentRoute = null;
            this.cache = new Map();
            this.init();
        }

        init() {
            this.bindEvents();
            this.handleRoute();
        }

        bindEvents() {
            window.addEventListener('hashchange', () => this.handleRoute());
            window.addEventListener('popstate', () => this.handleRoute());
        }

        getRoute() {
            const hash = window.location.hash || '#/feed';
            return hash.startsWith('#/') ? hash : '#/feed';
        }

        normalizeRoute(route) {
            if (!route || typeof route !== 'string') return '#/feed';
            const queryIndex = route.indexOf('?');
            return queryIndex === -1 ? route : route.slice(0, queryIndex) || '#/feed';
        }

        isAuthRoute(route) {
            return AUTH_ROUTES.has(this.normalizeRoute(route));
        }

        requiresAuth(route) {
            return !this.isAuthRoute(route);
        }

        parseUserKoleqtionRoute(route) {
            if (!route?.startsWith('#/koleqtion/')) return null;
            const id = route.slice('#/koleqtion/'.length);
            return id || null;
        }

        routeToTemplate(route) {
            const normalizedRoute = this.normalizeRoute(route);
            
            // Handle dynamic koleqtion routes
            if (this.parseUserKoleqtionRoute(route)) {
                return { 
                    templateId: 'tpl-koleqtion', 
                    file: 'html/koleqtion.html', 
                    selector: 'main' 
                };
            }

            return ROUTES[normalizedRoute] || ROUTES['#/feed'];
        }

        async loadTemplate(templateConfig) {
            const cacheKey = templateConfig.file;
            
            if (this.cache.has(cacheKey)) {
                return this.cache.get(cacheKey);
            }

            try {
                const response = await fetch(templateConfig.file);
                if (!response.ok) throw new Error(`Failed to load ${templateConfig.file}`);
                
                const html = await response.text();
                this.cache.set(cacheKey, html);
                return html;
            } catch (error) {
                console.error('Template loading error:', error);
                return null;
            }
        }

        async renderTemplate(templateConfig, targetElement) {
            const html = await this.loadTemplate(templateConfig);
            if (!html) return false;

            try {
                const container = document.querySelector(targetElement);
                if (!container) return false;

                container.innerHTML = html;
                return true;
            } catch (error) {
                console.error('Template rendering error:', error);
                return false;
            }
        }

        async handleRoute() {
            const route = this.getRoute();
            const normalizedRoute = this.normalizeRoute(route);
            
            // Skip if same route
            if (this.currentRoute === normalizedRoute) return;

            // Check authentication requirements
            if (this.requiresAuth(normalizedRoute) && !this.isAuthenticated()) {
                this.redirectToLogin();
                return;
            }

            const templateConfig = this.routeToTemplate(route);
            if (!templateConfig) return;

            const success = await this.renderTemplate(templateConfig, templateConfig.selector);
            
            if (success) {
                this.currentRoute = normalizedRoute;
                this.dispatchRouteChange(normalizedRoute);
                this.updatePageTitle(normalizedRoute);
                this.initializePageScripts(normalizedRoute);
            }
        }

        isAuthenticated() {
            try {
                return !!localStorage.getItem('juke_token');
            } catch {
                return false;
            }
        }

        redirectToLogin() {
            window.location.hash = '#/login';
        }

        dispatchRouteChange(route) {
            try {
                document.dispatchEvent(new CustomEvent('spa:navigate', { 
                    detail: { route } 
                }));
            } catch (error) {
                console.error('Route change dispatch error:', error);
            }
        }

        updatePageTitle(route) {
            try {
                const titles = {
                    '#/feed': 'Feed - JUKE',
                    '#/disqo': 'Discover - JUKE',
                    '#/koleqtion': 'Collection - JUKE',
                    '#/lists': 'Playlists - JUKE',
                    '#/upload': 'Upload - JUKE',
                    '#/login': 'Login - JUKE',
                    '#/register': 'Register - JUKE'
                };
                
                document.title = titles[route] || 'JUKE';
            } catch (error) {
                console.error('Title update error:', error);
            }
        }

        initializePageScripts(route) {
            try {
                // Dispatch event for page-specific initialization
                document.dispatchEvent(new CustomEvent('spa:page:init', { 
                    detail: { route } 
                }));
            } catch (error) {
                console.error('Page script initialization error:', error);
            }
        }

        // Navigation methods
        navigate(route) {
            window.location.hash = route;
        }

        back() {
            window.history.back();
        }

        forward() {
            window.history.forward();
        }

        // Cache management
        clearCache() {
            this.cache.clear();
        }

        preloadTemplate(route) {
            const templateConfig = this.routeToTemplate(route);
            if (templateConfig) {
                this.loadTemplate(templateConfig);
            }
        }
    }

    // ==================== INITIALIZATION ====================
    const router = new Router();

    // Global API
    window.JukeRouter = {
        navigate: (route) => router.navigate(route),
        back: () => router.back(),
        forward: () => router.forward(),
        getCurrentRoute: () => router.currentRoute,
        isAuthenticated: () => router.isAuthenticated(),
        preloadTemplate: (route) => router.preloadTemplate(route),
        clearCache: () => router.clearCache()
    };

    // Legacy global functions for backward compatibility
    window.getRoute = () => router.getRoute();
    window.normalizeRoute = (route) => router.normalizeRoute(route);
    window.isAuthRoute = (route) => router.isAuthRoute(route);
    window.requiresAuth = (route) => router.requiresAuth(route);
    window.parseUserKoleqtionRoute = (route) => router.parseUserKoleqtionRoute(route);
    window.routeToTemplate = (route) => router.routeToTemplate(route);

})();
