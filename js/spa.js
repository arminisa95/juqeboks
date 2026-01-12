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
            return { templateId: 'tpl-koleqtion', file: 'html/koleqtion.html', selector: 'main' };
        }
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

                if (typeof updateAuthUI === 'function') updateAuthUI();

                if (baseRoute === '#/koleqtion') {
                    if (window.JukeApi && typeof window.JukeApi.loadMyTracks === 'function') {
                        window.JukeApi.loadMyTracks();
                    } else if (window.JukeApi && typeof window.JukeApi.loadTracks === 'function') {
                        window.JukeApi.loadTracks();
                    } else if (typeof loadTracks === 'function') {
                        loadTracks();
                    }
                }

                var userK = parseUserKoleqtionRoute(baseRoute);
                if (userK) {
                    if (window.JukeApi && typeof window.JukeApi.loadUserTracks === 'function') {
                        window.JukeApi.loadUserTracks(userK);
                    }
                }

                if (baseRoute === '#/feed') {
                    if (window.JukeApi && typeof window.JukeApi.loadTracks === 'function') {
                        window.JukeApi.loadTracks();
                    } else if (typeof loadTracks === 'function') {
                        loadTracks();
                    }
                }
                
                if (baseRoute === '#/disqo') {
                    if (window.JukeApi && typeof window.JukeApi.loadDisqoPage === 'function') {
                        window.JukeApi.loadDisqoPage();
                    } else if (typeof loadDisqoPage === 'function') {
                        loadDisqoPage();
                    }
                }
                
                if (baseRoute === '#/koleqtion') {
                    if (window.JukeApi && typeof window.JukeApi.setupKoleqtionTabs === 'function') {
                        window.JukeApi.setupKoleqtionTabs();
                    } else if (typeof setupKoleqtionTabs === 'function') {
                        setupKoleqtionTabs();
                    }
                }

                if (baseRoute === '#/lists') {
                    if (window.JukeLists && typeof window.JukeLists.loadLists === 'function') {
                        window.JukeLists.loadLists();
                    } else if (typeof loadLists === 'function') {
                        loadLists();
                    }
                }

                if (baseRoute === '#/upload') {
                    if (window.JukeUpload && typeof window.JukeUpload.init === 'function') {
                        window.JukeUpload.init();
                    }
                }

                if (baseRoute === '#/profile') {
                    if (typeof setupProfilePage === 'function') setupProfilePage();
                }

                if (baseRoute === '#/login') {
                    if (typeof setupLoginForm === 'function') setupLoginForm();
                }

                if (baseRoute === '#/register') {
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
        setActiveNav(baseRoute);

        document.dispatchEvent(new CustomEvent('spa:navigate', { detail: { route: baseRoute, fullRoute: route } }));

        if (typeof updateAuthUI === 'function') updateAuthUI();

        if (baseRoute === '#/koleqtion') {
            if (window.JukeApi && typeof window.JukeApi.loadMyTracks === 'function') {
                window.JukeApi.loadMyTracks();
            } else if (window.JukeApi && typeof window.JukeApi.loadTracks === 'function') {
                window.JukeApi.loadTracks();
            } else if (typeof loadTracks === 'function') {
                loadTracks();
            }
        }

        var userK = parseUserKoleqtionRoute(baseRoute);
        if (userK) {
            if (window.JukeApi && typeof window.JukeApi.loadUserTracks === 'function') {
                window.JukeApi.loadUserTracks(userK);
            }
        }

        if (baseRoute === '#/feed') {
            if (window.JukeApi && typeof window.JukeApi.loadTracks === 'function') {
                window.JukeApi.loadTracks();
            } else if (typeof loadTracks === 'function') {
                loadTracks();
            }
        }
        
        if (baseRoute === '#/disqo') {
            if (window.JukeApi && typeof window.JukeApi.loadDisqoPage === 'function') {
                window.JukeApi.loadDisqoPage();
            } else if (typeof loadDisqoPage === 'function') {
                loadDisqoPage();
            }
        }
        
        if (baseRoute === '#/koleqtion') {
            if (window.JukeApi && typeof window.JukeApi.setupKoleqtionTabs === 'function') {
                window.JukeApi.setupKoleqtionTabs();
            } else if (typeof setupKoleqtionTabs === 'function') {
                setupKoleqtionTabs();
            }
        }

        if (baseRoute === '#/lists') {
            if (window.JukeLists && typeof window.JukeLists.loadLists === 'function') {
                window.JukeLists.loadLists();
            } else if (typeof loadLists === 'function') {
                loadLists();
            }
            
            // Add event listener for add playlist button in SPA mode with robust binding
            setTimeout(() => {
                const bindAddButton = () => {
                    const addPlaylistBtn = document.getElementById('addPlaylistBtn');
                    if (addPlaylistBtn) {
                        console.log('SPA: Add playlist button found, binding click event');
                        
                        // Remove any existing listeners to prevent duplicates
                        addPlaylistBtn.removeEventListener('click', handleAddPlaylist);
                        
                        // Add the event listener
                        addPlaylistBtn.addEventListener('click', handleAddPlaylist);
                        
                        console.log('SPA: Add playlist button click event bound successfully');
                        return true;
                    }
                    return false;
                };
                
                // Handler function
                const handleAddPlaylist = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('SPA: Add playlist button clicked');
                    const name = prompt('Enter playlist name (will be prefixed with "_"):');
                    if (!name || !name.trim()) return;
                    
                    console.log('SPA: Creating playlist:', name.trim());
                    if (typeof createPlaylist === 'function') {
                        createPlaylist(name.trim());
                    } else if (typeof window.createPlaylist === 'function') {
                        window.createPlaylist(name.trim());
                    } else {
                        console.error('SPA: createPlaylist function not found');
                        alert('Error: createPlaylist function not available');
                    }
                };
                
                // Try to bind immediately and retry multiple times if needed
                let attempts = 0;
                const maxAttempts = 10;
                
                const tryBind = () => {
                    attempts++;
                    console.log(`SPA: Attempt ${attempts} to bind add button`);
                    
                    if (bindAddButton()) {
                        console.log('SPA: Add button bound successfully');
                        return;
                    }
                    
                    if (attempts < maxAttempts) {
                        setTimeout(tryBind, 200 * attempts); // Exponential backoff
                    } else {
                        console.error('SPA: Failed to bind add button after multiple attempts');
                    }
                };
                
                tryBind();
                
                // Ensure lists panel is shown by default
                const listsPanel = document.getElementById('listsPanelLists');
                const likedPanel = document.getElementById('listsPanelLiked');
                if (listsPanel && likedPanel) {
                    listsPanel.classList.remove('active');
                    likedPanel.classList.add('active');
                }
            }, 100);
        }

        if (baseRoute === '#/upload') {
            if (window.JukeUpload && typeof window.JukeUpload.init === 'function') {
                window.JukeUpload.init();
            }
        }

        if (baseRoute === '#/profile') {
            if (typeof setupProfilePage === 'function') setupProfilePage();
        }

        if (baseRoute === '#/login') {
            if (typeof setupLoginForm === 'function') setupLoginForm();
        }

        if (baseRoute === '#/register') {
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

    // Profile page setup function
    window.setupProfilePage = function() {
        // Avatar upload functionality
        const avatarPreview = document.getElementById('avatarPreview');
        const avatarPreviewImg = document.getElementById('avatarPreviewImg');
        const avatarFileInput = document.getElementById('profileAvatarFile');
        const avatarUrlInput = document.getElementById('profileAvatar');
        const uploadBtn = document.getElementById('avatarUploadBtn');
        const removeBtn = document.getElementById('avatarRemoveBtn');

        if (!avatarPreview || !avatarFileInput) return;

        // Load current avatar
        loadCurrentAvatar();

        // Click handlers
        avatarPreview.addEventListener('click', () => avatarFileInput.click());
        if (uploadBtn) uploadBtn.addEventListener('click', () => avatarFileInput.click());
        if (removeBtn) removeBtn.addEventListener('click', removeAvatar);

        // File input change handler
        avatarFileInput.addEventListener('change', handleFileSelect);

        function loadCurrentAvatar() {
            const token = localStorage.getItem('juke_token');
            if (!token) return;

            try {
                const payload = JSON.parse(atob(token.split('.')[1]));
                const currentAvatar = payload.avatar_url;
                
                if (currentAvatar) {
                    avatarPreviewImg.src = currentAvatar;
                    avatarPreview.classList.add('has-image');
                    avatarUrlInput.value = currentAvatar;
                    if (removeBtn) removeBtn.style.display = 'inline-block';
                    if (uploadBtn) uploadBtn.textContent = 'Change Picture';
                }
            } catch (error) {
                console.error('Error loading current avatar:', error);
            }
        }

        function handleFileSelect(e) {
            const file = e.target.files[0];
            if (!file) return;

            // Validate file type
            if (!file.type.startsWith('image/')) {
                showMessage('Please select an image file.', 'error');
                return;
            }

            // Validate file size (max 5MB)
            if (file.size > 5 * 1024 * 1024) {
                showMessage('Image size must be less than 5MB.', 'error');
                return;
            }

            // Preview the image
            const reader = new FileReader();
            reader.onload = function(e) {
                avatarPreviewImg.src = e.target.result;
                avatarPreview.classList.add('has-image');
                if (removeBtn) removeBtn.style.display = 'inline-block';
                if (uploadBtn) uploadBtn.textContent = 'Change Picture';
                
                // Store the file for upload
                avatarPreview.dataset.newAvatar = 'true';
            };
            reader.readAsDataURL(file);
        }

        function removeAvatar() {
            avatarPreviewImg.src = 'images/juke.png';
            avatarPreview.classList.remove('has-image');
            avatarUrlInput.value = '';
            avatarFileInput.value = '';
            if (removeBtn) removeBtn.style.display = 'none';
            if (uploadBtn) uploadBtn.textContent = 'Upload Picture';
            delete avatarPreview.dataset.newAvatar;
        }

        function showMessage(message, type) {
            const messageEl = document.getElementById('profileMessage');
            if (messageEl) {
                messageEl.textContent = message;
                messageEl.className = `profile-message ${type}`;
                messageEl.style.display = 'block';
                
                setTimeout(() => {
                    messageEl.style.display = 'none';
                }, 5000);
            }
        }

        // Handle form submission with avatar upload
        const profileForm = document.getElementById('profileForm');
        if (profileForm) {
            profileForm.addEventListener('submit', async function(e) {
                e.preventDefault();
                
                const formData = new FormData(profileForm);
                const token = localStorage.getItem('juke_token');
                
                if (!token) {
                    showMessage('Please log in first.', 'error');
                    return;
                }

                // Handle avatar upload if new image selected
                if (avatarPreview.dataset.newAvatar === 'true' && avatarFileInput.files[0]) {
                    try {
                        const avatarFormData = new FormData();
                        avatarFormData.append('avatar', avatarFileInput.files[0]);
                        
                        const response = await fetch('/api/users/avatar', {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${token}`
                            },
                            body: avatarFormData
                        });
                        
                        if (response.ok) {
                            const result = await response.json();
                            formData.set('profileAvatar', result.avatar_url);
                        } else {
                            throw new Error('Avatar upload failed');
                        }
                    } catch (error) {
                        showMessage('Failed to upload avatar. Please try again.', 'error');
                        return;
                    }
                }

                // Update profile data
                try {
                    const response = await fetch('/api/users/profile', {
                        method: 'PUT',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            first_name: formData.get('profileFirstName'),
                            last_name: formData.get('profileLastName'),
                            bio: formData.get('profileBio'),
                            avatar_url: formData.get('profileAvatar')
                        })
                    });

                    if (response.ok) {
                        showMessage('Profile updated successfully!', 'success');
                        
                        // Update token with new avatar
                        const result = await response.json();
                        if (result.token) {
                            localStorage.setItem('juke_token', result.token);
                        }
                        
                        // Remove new avatar flag
                        delete avatarPreview.dataset.newAvatar;
                    } else {
                        throw new Error('Profile update failed');
                    }
                } catch (error) {
                    showMessage('Failed to update profile. Please try again.', 'error');
                }
            });
        }
    };
})();
