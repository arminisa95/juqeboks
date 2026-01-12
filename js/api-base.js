// Shared API Base Configuration
(function() {
    var DEFAULT_API_BASE = (function () {
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

    var API_BASE = (function () {
        try {
            return localStorage.getItem('juke_api_base') || DEFAULT_API_BASE;
        } catch (_) {
            return DEFAULT_API_BASE;
        }
    })();

    var API_ORIGIN = API_BASE.replace(/\/api$/, '');

    // Export to window for global access
    window.JukeAPIBase = {
        getApiBase: function() {
            try {
                return localStorage.getItem('juke_api_base') || DEFAULT_API_BASE;
            } catch (_) {
                return DEFAULT_API_BASE;
            }
        },

        getApiOrigin: function() {
            return window.JukeAPIBase.getApiBase().replace(/\/api$/, '');
        },

        getApiBases: function() {
            var bases = [window.JukeAPIBase.getApiBase(), 'https://juke-api.onrender.com/api'];
            return bases.filter(function (v, i, a) {
                return !!v && a.indexOf(v) === i;
            });
        }
    };
})();
