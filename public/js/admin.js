(function () {
    'use strict';

    function getToken() {
        return localStorage.getItem('juke_token') || '';
    }

    function getApiBase() {
        return window.JukeAPIBase && window.JukeAPIBase.getApiBase ? window.JukeAPIBase.getApiBase() : '';
    }

    function apiPost(path, body) {
        return fetch(getApiBase() + path, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + getToken()
            },
            body: JSON.stringify(body)
        }).then(function (res) { return res.json(); });
    }

    function apiGet(path) {
        return fetch(getApiBase() + path, {
            headers: { 'Authorization': 'Bearer ' + getToken() }
        }).then(function (res) { return res.json(); });
    }

    function formatCents(cents) {
        return (cents / 100).toFixed(2) + '€';
    }

    function setStatus(id, text) {
        var el = document.getElementById(id);
        if (!el) return;
        el.textContent = text;
        el.style.display = 'block';
    }

    function init() {
        var now = new Date();
        document.getElementById('calcYear').value = now.getFullYear();
        document.getElementById('calcMonth').value = now.getMonth() + 1;
        document.getElementById('reportYear').value = now.getFullYear();
        document.getElementById('reportMonth').value = now.getMonth() + 1;

        document.getElementById('calcBtn').addEventListener('click', function () {
            var year = parseInt(document.getElementById('calcYear').value, 10);
            var month = parseInt(document.getElementById('calcMonth').value, 10);
            setStatus('calcStatus', 'Calculating...');
            apiPost('/admin/royalties/calculate', { year: year, month: month }).then(function (data) {
                if (data.error) {
                    setStatus('calcStatus', 'Error: ' + data.error);
                    return;
                }
                setStatus('calcStatus', 'Total: ' + formatCents(data.totalCollectedCents) +
                    ' | Platform fee: ' + formatCents(data.platformFeeCents) +
                    ' | Artist pool: ' + formatCents(data.artistPoolCents));
            }).catch(function () {
                setStatus('calcStatus', 'Request failed');
            });
        });

        document.getElementById('reportBtn').addEventListener('click', function () {
            var year = parseInt(document.getElementById('reportYear').value, 10);
            var month = parseInt(document.getElementById('reportMonth').value, 10);
            setStatus('reportStatus', 'Loading...');
            apiGet('/admin/royalties?year=' + year + '&month=' + month).then(function (data) {
                if (data.error) {
                    setStatus('reportStatus', 'Error: ' + data.error);
                    return;
                }
                var tbody = document.querySelector('#reportTable tbody');
                tbody.innerHTML = '';
                (data.artists || []).forEach(function (a) {
                    var tr = document.createElement('tr');
                    tr.innerHTML = '<td>' + (a.artist_name || '-') + '</td>' +
                        '<td>' + (a.listeners || 0) + '</td>' +
                        '<td>' + (a.total_seconds || 0) + '</td>' +
                        '<td>' + formatCents(a.total_payout_cents || 0) + '</td>';
                    tbody.appendChild(tr);
                });
                document.getElementById('reportTable').style.display = 'table';
                var pool = data.pool || {};
                setStatus('reportStatus', 'Pool total: ' + formatCents(pool.total_collected_cents || 0) +
                    ' | artist pool: ' + formatCents(pool.artist_pool_cents || 0));
            }).catch(function () {
                setStatus('reportStatus', 'Request failed');
            });
        });

        document.getElementById('balancesBtn').addEventListener('click', loadBalances);
    }

    function loadBalances() {
        setStatus('balancesStatus', 'Loading...');
        apiGet('/admin/artist-balances').then(function (data) {
            if (data.error) {
                setStatus('balancesStatus', 'Error: ' + data.error);
                return;
            }
            var tbody = document.querySelector('#balancesTable tbody');
            tbody.innerHTML = '';
            (data.balances || []).forEach(function (b) {
                var tr = document.createElement('tr');
                var owner = b.owner_email || b.owner_username || '-';
                var btn = document.createElement('button');
                btn.className = 'admin-btn';
                btn.textContent = 'Mark paid';
                btn.addEventListener('click', function () {
                    markPaid(b.artist_id, b.last_year, b.last_month, btn);
                });
                tr.innerHTML = '<td>' + (b.artist_name || '-') + '</td>' +
                    '<td>' + owner + '</td>' +
                    '<td>' + formatCents(b.unpaid_cents || 0) + '</td>' +
                    '<td>' + (b.periods || 0) + '</td>';
                var td = document.createElement('td');
                td.appendChild(btn);
                tr.appendChild(td);
                tbody.appendChild(tr);
            });
            document.getElementById('balancesTable').style.display = 'table';
            setStatus('balancesStatus', (data.balances || []).length + ' artist(s) with unpaid balance');
        }).catch(function () {
            setStatus('balancesStatus', 'Request failed');
        });
    }

    function markPaid(artistId, year, month, btn) {
        btn.textContent = '...';
        apiPost('/admin/payouts/mark-paid', { artistId: artistId, year: year, month: month }).then(function (data) {
            if (data.error) {
                btn.textContent = 'Error';
                return;
            }
            btn.textContent = 'Paid';
            btn.disabled = true;
            loadBalances();
        }).catch(function () {
            btn.textContent = 'Error';
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
