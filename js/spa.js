(function () {
    function getRoute() {
        var hash = window.location.hash || '#/feed';
        if (!hash.startsWith('#/')) return '#/feed';
        return hash;
    }

    function isAuthRoute(route) {
        return route === '#/login' || route === '#/register';
    }

    function requiresAuth(route) {
        return !isAuthRoute(route);
    }

    function routeToTemplate(route) {
        switch (route) {
            case '#/feed':
                return { templateId: 'tpl-feed', file: 'html/user.html', selector: 'section.music-feed' };
            case '#/disqo':
                return { templateId: 'tpl-disqo', file: 'html/disqo.html', selector: 'section.music-feed' };
            case '#/koleqtion':
                return { templateId: 'tpl-koleqtion', file: 'html/koleqtion.html', selector: 'main' };
            case '#/lists':
                return { templateId: 'tpl-lists', file: 'html/lists.html', selector: 'main' };
            case '#/upload':
                return { templateId: 'tpl-upload', file: 'html/upload.html', selector: 'main' };
            case '#/login':
                return { templateId: 'tpl-login', file: 'html/login.html', selector: 'main' };
            case '#/register':
                return { templateId: 'tpl-register', file: 'html/register.html', selector: 'main' };
            case '#/profile':
                return { templateId: 'tpl-profile', file: 'html/profile.html', selector: 'main' };
            default:
                return { templateId: 'tpl-feed', file: 'html/user.html', selector: 'section.music-feed' };
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
                if (href === k || href.endsWith('/' + k) || href.endsWith('html/' + k)) {
                    a.setAttribute('href', map[k]);
                }
            });
        });
    }

    function setActiveNav(route) {
        document.querySelectorAll('nav .nav-buttons a').forEach(function (a) {
            a.classList.remove('active');
        });

        var key = route;
        if (route === '#/profile' || route === '#/login' || route === '#/register') {
            return;
        }

        var link = document.querySelector('nav .nav-buttons a[href="' + key + '"]');
        if (link) link.classList.add('active');
    }

    async function loadTemplateIntoApp(route) {
        var app = document.getElementById('app');
        if (!app) return;

        var authed = (typeof isLoggedIn === 'function')
            ? isLoggedIn()
            : !!localStorage.getItem('juke_token');
        if (requiresAuth(route) && !authed) {
            window.location.hash = '#/login';
            return;
        }

        var tpl = routeToTemplate(route);

        if (tpl.templateId) {
            var templateEl = document.getElementById(tpl.templateId);
            if (templateEl && templateEl.content) {
                app.innerHTML = '';
                app.appendChild(templateEl.content.cloneNode(true));
                normalizeLinks(app);
                setActiveNav(route);

                document.dispatchEvent(new CustomEvent('spa:navigate', { detail: { route: route } }));

                if (typeof updateAuthUI === 'function') updateAuthUI();

                if (route === '#/koleqtion') {
                    if (window.JukeApi && typeof window.JukeApi.loadMyTracks === 'function') {
                        window.JukeApi.loadMyTracks();
                    } else if (window.JukeApi && typeof window.JukeApi.loadTracks === 'function') {
                        window.JukeApi.loadTracks();
                    } else if (typeof loadTracks === 'function') {
                        loadTracks();
                    }
                }

                if (route === '#/feed' || route === '#/disqo') {
                    if (window.JukeApi && typeof window.JukeApi.loadTracks === 'function') {
                        window.JukeApi.loadTracks();
                    } else if (typeof loadTracks === 'function') {
                        loadTracks();
                    }
                }

                if (route === '#/lists') {
                    if (window.JukeLists && typeof window.JukeLists.loadLists === 'function') {
                        window.JukeLists.loadLists();
                    } else if (typeof loadLists === 'function') {
                        loadLists();
                    }
                }

                if (route === '#/upload') {
                    if (window.JukeUpload && typeof window.JukeUpload.init === 'function') {
                        window.JukeUpload.init();
                    }
                }

                if (route === '#/profile') {
                    if (typeof setupProfilePage === 'function') setupProfilePage();
                }

                if (route === '#/login') {
                    if (typeof setupLoginForm === 'function') setupLoginForm();
                }

                if (route === '#/register') {
                    if (typeof setupRegisterForm === 'function') setupRegisterForm();
                }

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
        setActiveNav(route);

        document.dispatchEvent(new CustomEvent('spa:navigate', { detail: { route: route } }));

        if (typeof updateAuthUI === 'function') updateAuthUI();

        if (route === '#/koleqtion') {
            if (window.JukeApi && typeof window.JukeApi.loadMyTracks === 'function') {
                window.JukeApi.loadMyTracks();
            } else if (window.JukeApi && typeof window.JukeApi.loadTracks === 'function') {
                window.JukeApi.loadTracks();
            } else if (typeof loadTracks === 'function') {
                loadTracks();
            }
        }

        if (route === '#/feed' || route === '#/disqo') {
            if (window.JukeApi && typeof window.JukeApi.loadTracks === 'function') {
                window.JukeApi.loadTracks();
            } else if (typeof loadTracks === 'function') {
                loadTracks();
            }
        }

        if (route === '#/lists') {
            if (window.JukeLists && typeof window.JukeLists.loadLists === 'function') {
                window.JukeLists.loadLists();
            } else if (typeof loadLists === 'function') {
                loadLists();
            }
        }

        if (route === '#/upload') {
            if (window.JukeUpload && typeof window.JukeUpload.init === 'function') {
                window.JukeUpload.init();
            }
        }

        if (route === '#/profile') {
            if (typeof setupProfilePage === 'function') setupProfilePage();
        }

        if (route === '#/login') {
            if (typeof setupLoginForm === 'function') setupLoginForm();
        }

        if (route === '#/register') {
            if (typeof setupRegisterForm === 'function') setupRegisterForm();
        }
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
        }
        onRouteChange();
    });
})();
