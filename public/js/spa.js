(function () {
    function getRoute() {
        var hash = window.location.hash || '#/feed';
        if (!hash.startsWith('#/')) return '#/feed';
        return hash;
    }

    function normalizeRoute(route) {
        if (!route || typeof route !== 'string') return '#/feed';
        var idx = route.indexOf('?');
        if (idx === -1) return route;
        return route.slice(0, idx) || '#/feed';
    }

    function isAuthRoute(route) {
        return route === '#/login' || route === '#/register';
    }

    function requiresAuth(route) {
        return !isAuthRoute(route);
    }

    function parseUserKoleqtionRoute(route) {
        if (!route || typeof route !== 'string') return null;
        if (!route.startsWith('#/koleqtion/')) return null;
        var id = route.slice('#/koleqtion/'.length);
        if (!id) return null;
        return id;
    }

    function routeToTemplate(route) {
        route = normalizeRoute(route);
        if (parseUserKoleqtionRoute(route)) {
            return { templateId: 'tpl-koleqtion', file: 'views/koleqtion.html', selector: 'main' };
        }
        switch (route) {
            case '#/feed':
                return { templateId: 'tpl-feed', file: 'views/user.html', selector: 'section.music-feed' };
            case '#/disqo':
                return { templateId: 'tpl-disqo', file: 'views/disqo.html', selector: 'section.music-feed' };
            case '#/koleqtion':
                return { templateId: 'tpl-koleqtion', file: 'views/koleqtion.html', selector: 'main' };
            case '#/lists':
                return { templateId: 'tpl-lists', file: 'views/lists.html', selector: '.lists-shell' };
            case '#/queue':
                return { templateId: 'tpl-queue', file: 'views/queue.html', selector: '.queue-container' };
            case '#/upload':
                return { templateId: 'tpl-upload', file: 'views/upload.html', selector: '.upload-container' };
            case '#/login':
                return { templateId: 'tpl-login', file: 'views/login.html', selector: 'main' };
            case '#/register':
                return { templateId: 'tpl-register', file: 'views/register.html', selector: 'main' };
            case '#/profile':
                return { templateId: 'tpl-profile', file: 'views/profile.html', selector: 'main' };
            case '#/impressum':
                return { templateId: 'tpl-impressum', file: 'views/impressum.html', selector: 'main' };
            default:
                return { templateId: 'tpl-feed', file: 'views/user.html', selector: 'section.music-feed' };
        }
    }

    function normalizeLinks(container) {
        if (!container) return;

        var map = {
            'user.html': '#/feed',
            'disqo.html': '#/disqo',
            'koleqtion.html': '#/koleqtion',
            'lists.html': '#/lists',
            'upload.html': '#/upload',
            'login.html': '#/login',
            'register.html': '#/register',
            'profile.html': '#/profile'
        };

        container.querySelectorAll('a[href]').forEach(function (a) {
            var href = a.getAttribute('href');
            if (!href) return;

            Object.keys(map).forEach(function (k) {
                if (href === k || href.endsWith('/' + k) || href.endsWith('views/' + k)) {
                    a.setAttribute('href', map[k]);
                }
            });
        });
    }

    function setActiveNav(route) {
        document.querySelectorAll('nav .nav-buttons a').forEach(function (a) {
            a.classList.remove('active');
        });

        if (route === '#/profile' || route === '#/login' || route === '#/register') {
            return;
        }

        var link = document.querySelector('nav .nav-buttons a[href="' + route + '"]');
        if (link) link.classList.add('active');
    }

    function initRouteHandlers(baseRoute, fullRoute) {
        if (typeof updateAuthUI === 'function') updateAuthUI();

        // Reset feed initialization when navigating away from feed
        if (baseRoute !== '#/feed' && window.isFeedInitialized) {
            window.isFeedInitialized = false;
        }

        var userK = parseUserKoleqtionRoute(baseRoute);
        if (userK && window.JukeApi && typeof window.JukeApi.loadUserTracks === 'function') {
            window.JukeApi.loadUserTracks(userK);
        }

        switch (baseRoute) {
            case '#/feed':
                console.log('SPA: handling feed route, JukeApi exists:', !!(window.JukeApi && typeof window.JukeApi.loadTracks === 'function'));
                if (window.JukeApi && typeof window.JukeApi.loadTracks === 'function') {
                    console.log('SPA: calling window.JukeApi.loadTracks()');
                    window.JukeApi.loadTracks();
                } else if (typeof loadTracks === 'function') {
                    console.log('SPA: calling loadTracks() fallback');
                    loadTracks();
                }
                break;

            case '#/disqo':
                if (window.JukeApi && typeof window.JukeApi.loadDisqoPage === 'function') {
                    window.JukeApi.loadDisqoPage();
                } else if (typeof loadDisqoPage === 'function') {
                    loadDisqoPage();
                }
                break;

            case '#/koleqtion':
                if (window.JukeApi && typeof window.JukeApi.loadMyTracks === 'function') {
                    window.JukeApi.loadMyTracks();
                } else if (window.JukeApi && typeof window.JukeApi.loadTracks === 'function') {
                    window.JukeApi.loadTracks();
                } else if (typeof loadTracks === 'function') {
                    loadTracks();
                }
                if (window.JukeApi && typeof window.JukeApi.setupKoleqtionTabs === 'function') {
                    window.JukeApi.setupKoleqtionTabs();
                } else if (typeof setupKoleqtionTabs === 'function') {
                    setupKoleqtionTabs();
                }
                break;

            case '#/lists':
                if (window.JukeLists && typeof window.JukeLists.initHistory === 'function') {
                    window.JukeLists.initHistory();
                }
                if (window.JukeLists && typeof window.JukeLists.loadLists === 'function') {
                    window.JukeLists.loadLists();
                } else if (typeof loadLists === 'function') {
                    loadLists();
                }
                // Render history on initial load
                if (window.JukeHistory && typeof window.JukeHistory.render === 'function') {
                    window.JukeHistory.render();
                }
                break;

            case '#/upload':
                if (window.JukeUpload && typeof window.JukeUpload.init === 'function') {
                    window.JukeUpload.init();
                }
                break;

            case '#/profile':
                if (typeof setupProfilePage === 'function') setupProfilePage();
                break;

            case '#/login':
                if (typeof setupLoginForm === 'function') setupLoginForm();
                break;

            case '#/register':
                if (typeof setupRegisterForm === 'function') setupRegisterForm();
                break;
        }
    }

    async function loadTemplateIntoApp(route) {
        var app = document.getElementById('app');
        if (!app) return;

        var baseRoute = normalizeRoute(route);

        var authed = (typeof isLoggedIn === 'function')
            ? isLoggedIn()
            : !!localStorage.getItem('juke_token');
        if (requiresAuth(baseRoute) && !authed) {
            window.location.hash = '#/login';
            return;
        }

        var tpl = routeToTemplate(baseRoute);

        if (tpl.templateId) {
            var templateEl = document.getElementById(tpl.templateId);
            if (templateEl && templateEl.content) {
                app.innerHTML = '';
                app.appendChild(templateEl.content.cloneNode(true));
                normalizeLinks(app);
                setActiveNav(baseRoute);
                document.dispatchEvent(new CustomEvent('spa:navigate', { detail: { route: baseRoute, fullRoute: route } }));
                initRouteHandlers(baseRoute, route);
                return;
            }
        }

        var res = await fetch(tpl.file, { cache: 'no-cache' });
        if (!res.ok) {
            app.innerHTML = '<div style="color:white; padding: 2rem;">Failed to load view.</div>';
            return;
        }

        var html = await res.text();
        var doc = new DOMParser().parseFromString(html, 'text/html');
        var node = doc.querySelector(tpl.selector);

        if (!node) {
            app.innerHTML = '<div style="color:white; padding: 2rem;">View template missing.</div>';
            return;
        }

        app.innerHTML = node.outerHTML;
        normalizeLinks(app);
        setActiveNav(baseRoute);
        document.dispatchEvent(new CustomEvent('spa:navigate', { detail: { route: baseRoute, fullRoute: route } }));
        initRouteHandlers(baseRoute, route);
    }

    async function onRouteChange() {
        var route = getRoute();
        try {
            await loadTemplateIntoApp(route);
        } catch (e) {
            var app = document.getElementById('app');
            if (app) {
                app.innerHTML = '<div style="color:white; padding: 2rem;">' + (e && e.message ? e.message : 'Navigation error') + '</div>';
            }
        }
    }

    window.addEventListener('hashchange', onRouteChange);
    document.addEventListener('DOMContentLoaded', function () {
        if (!window.location.hash) {
            window.location.hash = '#/feed';
            return;
        }
        onRouteChange();
    });
})();
