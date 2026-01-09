// VLCord Web Interface JavaScript

document.addEventListener('DOMContentLoaded', function() {
    // Initialize Socket.io connection
    const socket = io();
    
    // DOM Elements
    const vlcStatusText = document.getElementById('vlc-status-text');
    const discordStatusText = document.getElementById('discord-status-text');
    const mediaTitle = document.getElementById('media-title');
    const mediaMetadata = document.getElementById('media-metadata');
    const mediaPoster = document.getElementById('media-poster');
    const progressFill = document.getElementById('progress-fill');
    const progressTime = document.getElementById('progress-time');
    const progressPercentage = document.getElementById('progress-percentage');
    const tmdbLink = document.getElementById('tmdb-link');
    
    const settingsForm = document.getElementById('settings-form');
    const vlcHostInput = document.getElementById('vlc-host');
    const vlcPortInput = document.getElementById('vlc-port');
    const vlcPasswordInput = document.getElementById('vlc-password');
    const discordClientIdInput = document.getElementById('discord-client-id');
    const tmdbApiKeyInput = document.getElementById('tmdb-api-key');
    const showApiKeyButton = document.getElementById('show-api-key');
    
    const setupInstructionsButton = document.getElementById('setup-instructions');
    const instructionsModal = document.getElementById('instructions-modal');
    const vlcSetupModal = document.getElementById('vlc-setup-modal');
    const testVlcButton = document.getElementById('test-vlc-connection');
    const downloadShortcutButton = document.getElementById('download-vlc-shortcut');
    const closeModalButtons = document.querySelectorAll('.close-btn, .modal-close-btn');

    // Diagnostics elements
    const vlcStatusJson = document.getElementById('vlc-status-json');
    const discordStatusJson = document.getElementById('discord-status-json');
    const healthDiagnostics = document.getElementById('health-diagnostics');
    const lastDiscordPayload = document.getElementById('last-discord-payload');
    const refreshDiagnosticsBtn = document.getElementById('refresh-diagnostics');
    const copyDiagnosticsBtn = document.getElementById('copy-diagnostics');

    // Logs elements
    const logsList = document.getElementById('logs-list');
    const logsPauseBtn = document.getElementById('logs-pause');
    const logsClearBtn = document.getElementById('logs-clear');
    const logsRefreshBtn = document.getElementById('logs-refresh');

    // Activity elements
    const activityList = document.getElementById('activity-list');
    const activityStats = document.getElementById('activity-stats');
    const activityRefreshBtn = document.getElementById('activity-refresh');

    // Overrides elements
    const overridesRefreshBtn = document.getElementById('overrides-refresh');
    const overridesTable = document.getElementById('overrides-table');
    const overrideCategoryInput = document.getElementById('override-category');
    const overrideTitleInput = document.getElementById('override-title');
    const overrideJsonInput = document.getElementById('override-json');
    const overrideAddBtn = document.getElementById('override-add');

    // Wizard elements
    const wizardTestVlcBtn = document.getElementById('wizard-test-vlc');
    const wizardCheckDiscordBtn = document.getElementById('wizard-check-discord');
    const wizardCheckAdminBtn = document.getElementById('wizard-check-admin');
    const wizardVlcResult = document.getElementById('wizard-vlc-result');
    const wizardDiscordResult = document.getElementById('wizard-discord-result');
    const wizardAdminResult = document.getElementById('wizard-admin-result');

    // Theme
    const themeToggle = document.getElementById('theme-toggle');

    // Admin token input
    const adminTokenInput = document.getElementById('admin-token');

    // Tab functionality
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    let activeTab = 'overview';
    
    // Initialize tabs
    function initTabs() {
        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const targetTab = button.getAttribute('data-tab');
                activeTab = targetTab;
                
                // Remove active class from all buttons and contents
                tabButtons.forEach(btn => btn.classList.remove('active'));
                tabContents.forEach(content => content.classList.remove('active'));
                
                // Add active class to clicked button and corresponding content
                button.classList.add('active');
                const targetContent = document.getElementById(`${targetTab}-tab`);
                if (targetContent) {
                    targetContent.classList.add('active');
                }

                // If diagnostics tab is opened, refresh immediately
                if (targetTab === 'diagnostics') {
                    refreshDiagnostics();
                }

                if (targetTab === 'logs') {
                    refreshLogs(true);
                }

                if (targetTab === 'activity') {
                    refreshActivity(true);
                }

                if (targetTab === 'overrides') {
                    refreshOverrides(true);
                }
            });
        });
    }
    
    // Initialize tabs on page load
    initTabs();

    // Socket.io event handlers
    socket.on('connect', () => {
        console.log('Connected to VLCord server');
    });
    
    socket.on('disconnect', () => {
        console.log('Disconnected from VLCord server');
        setVLCStatus(false);
        setDiscordStatus(false);
    });
    
    let lastVlcStatus = null;
    let lastDiscordStatus = null;

    socket.on('vlcStatus', (status) => {
        lastVlcStatus = status;
        updateVLCStatus(status);
        if (vlcStatusJson) {
            vlcStatusJson.textContent = safeJSONStringify(status, 2);
        }
    });
    
    socket.on('discordStatus', (status) => {
        lastDiscordStatus = status;
        updateDiscordStatus(status);
        if (discordStatusJson) {
            discordStatusJson.textContent = safeJSONStringify(status, 2);
        }
    });

    socket.on('configHotReload', (payload) => {
        const keys = (payload && (payload.keys || payload.changedKeys)) ? (payload.keys || payload.changedKeys) : [];
        showNotification(`Config reloaded${keys.length ? ': ' + keys.join(', ') : ''}`, 'success');
        if (activeTab === 'diagnostics') {
            refreshDiagnostics();
        }
    });
    
    socket.on('config', (config) => {
        // Update form values with current config
        vlcHostInput.value = config.vlcHost || 'localhost';
        vlcPortInput.value = config.vlcPort || '8080';
        vlcPasswordInput.value = config.vlcPassword || 'vlcpassword';
        discordClientIdInput.value = config.discordClientId || '1392902149163319398';
        tmdbApiKeyInput.value = config.tmdbApiKey || 'ccc1fa36a0821299ae4d7a6c155b442d';

        // Admin token: default to server-provided (env/config) for single-machine installs.
        // If user already saved one locally, keep that as the override.
        const savedTokenRaw = localStorage.getItem('vlcord_admin_token') || '';
        const savedToken = (savedTokenRaw || '').trim();
        const serverToken = ((config && config.adminToken) || '').trim();

        const tokenToUse = savedToken || serverToken;
        if (adminTokenInput) adminTokenInput.value = tokenToUse;

        // If nothing was saved yet, persist the server token for convenience.
        if (!savedToken && serverToken) {
            localStorage.setItem('vlcord_admin_token', serverToken);
        }
    });
    
    // Settings save button
    const saveSettingsButton = document.getElementById('save-settings');
    if (saveSettingsButton) {
        saveSettingsButton.addEventListener('click', function() {
            const config = {
                vlcHost: vlcHostInput.value,
                vlcPort: parseInt(vlcPortInput.value, 10),
                vlcPassword: vlcPasswordInput.value,
                discordClientId: discordClientIdInput.value,
                tmdbApiKey: tmdbApiKeyInput.value
            };
            
            socket.emit('updateConfig', config);

            // Save admin token locally for diagnostics
            if (adminTokenInput && adminTokenInput.value) {
                localStorage.setItem('vlcord_admin_token', adminTokenInput.value);
            }
            
            // Show a temporary save confirmation
            const originalText = saveSettingsButton.textContent;
            saveSettingsButton.textContent = 'Saved!';
            setTimeout(() => {
                saveSettingsButton.textContent = originalText;
            }, 2000);
        });
    }
    
    // Show/Hide API Key button
    if (showApiKeyButton) {
        showApiKeyButton.addEventListener('click', function() {
            if (tmdbApiKeyInput.type === 'password') {
                tmdbApiKeyInput.type = 'text';
                showApiKeyButton.textContent = 'Hide';
            } else {
                tmdbApiKeyInput.type = 'password';
                showApiKeyButton.textContent = 'Show';
            }
        });
    }
    
    // Setup Instructions Modal
    if (setupInstructionsButton && instructionsModal) {
        setupInstructionsButton.addEventListener('click', function(e) {
            e.preventDefault();
            instructionsModal.style.display = 'block';
        });
    }

    // VLC Setup Wizard Button
    const vlcSetupButton = document.getElementById('vlc-setup-wizard');
    if (vlcSetupButton && vlcSetupModal) {
        vlcSetupButton.addEventListener('click', function() {
            vlcSetupModal.style.display = 'flex';
        });
    }

    // Test VLC Connection
    if (testVlcButton) {
        testVlcButton.addEventListener('click', async function() {
            const button = this;
            const originalText = button.textContent;
            button.textContent = 'Testing...';
            button.disabled = true;

            try {
                const host = vlcHostInput?.value || 'localhost';
                const port = parseInt(vlcPortInput?.value || '8080', 10);
                const password = vlcPasswordInput?.value || '';

                const response = await fetch('/api/vlc/test', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ host, port, password })
                });
                const result = await response.json();
                
                if (result.connected) {
                    showNotification('VLC connection successful!', 'success');
                } else {
                    showNotification('VLC connection failed: ' + (result.message || 'Unknown error'), 'error');
                }
            } catch (error) {
                showNotification('Error testing VLC connection', 'error');
            } finally {
                button.textContent = originalText;
                button.disabled = false;
            }
        });
    }

    // Download VLC Shortcut
    if (downloadShortcutButton) {
        downloadShortcutButton.addEventListener('click', function() {
            window.open('/api/download-vlc-shortcut', '_blank');
        });
    }
    
    // Close modal buttons
    closeModalButtons.forEach(button => {
        button.addEventListener('click', function() {
            if (instructionsModal) {
                instructionsModal.style.display = 'none';
            }
            if (vlcSetupModal) {
                vlcSetupModal.style.display = 'none';
            }
        });
    });

    // ---------------------------------
    // Admin + JSON helpers
    // ---------------------------------
    function safeParseOrNull(text) {
        try { return JSON.parse(text || '{}'); } catch { return null; }
    }

    function safeJSONStringify(obj, space = 0) {
        try { return JSON.stringify(obj ?? {}, null, space); } catch { return '{}'; }
    }

    function getAdminToken() {
        return ((adminTokenInput && adminTokenInput.value) || localStorage.getItem('vlcord_admin_token') || '').trim();
    }

    async function fetchJsonWithAdmin(url, options = {}) {
        const headers = options.headers ? { ...options.headers } : {};
        const token = getAdminToken();
        if (token) headers['X-VLCORD-ADMIN-TOKEN'] = token;
        const res = await fetch(url, { ...options, headers });
        if (!res.ok) {
            throw new Error(`Request failed: ${res.status}`);
        }
        return res.json();
    }

    // ---------------------------------
    // Diagnostics
    // ---------------------------------
    async function refreshDiagnostics() {
        try {
            const diag = await fetchJsonWithAdmin('/api/system/health/diagnostics');
            if (healthDiagnostics) healthDiagnostics.textContent = safeJSONStringify(diag, 2);
        } catch (e) {
            if (healthDiagnostics) healthDiagnostics.textContent = `Error: ${e.message} (set Admin Token in Settings)`;
        }

        try {
            const lp = await fetchJsonWithAdmin('/api/discord/last-payload');
            if (lastDiscordPayload) lastDiscordPayload.textContent = safeJSONStringify(lp, 2);
        } catch (e) {
            if (lastDiscordPayload) lastDiscordPayload.textContent = `Error: ${e.message} (set Admin Token in Settings)`;
        }
    }

    if (refreshDiagnosticsBtn) refreshDiagnosticsBtn.addEventListener('click', () => refreshDiagnostics());

    if (copyDiagnosticsBtn) {
        copyDiagnosticsBtn.addEventListener('click', async () => {
            const payload = {
                vlcStatus: lastVlcStatus,
                discordStatus: lastDiscordStatus,
                diagnostics: safeParseOrNull(healthDiagnostics?.textContent),
                lastPayload: safeParseOrNull(lastDiscordPayload?.textContent)
            };
            try {
                await navigator.clipboard.writeText(safeJSONStringify(payload, 2));
                showNotification('Diagnostics copied to clipboard', 'success');
            } catch {
                showNotification('Failed to copy diagnostics', 'error');
            }
        });
    }

    // ---------------------------------
    // Appearance (theme)
    // ---------------------------------
    function applyTheme(theme) {
        document.body.setAttribute('data-theme', theme);
        if (themeToggle) themeToggle.checked = theme === 'light';
    }

    const savedTheme = localStorage.getItem('vlcord_theme') || 'dark';
    applyTheme(savedTheme);
    if (themeToggle) {
        themeToggle.addEventListener('change', () => {
            const next = themeToggle.checked ? 'light' : 'dark';
            localStorage.setItem('vlcord_theme', next);
            applyTheme(next);
        });
    }

    // ---------------------------------
    // Logs
    // ---------------------------------
    let logsPaused = false;
    let logsTimer = null;
    let lastLogsFingerprint = '';

    function renderLogLine(entry) {
        const el = document.createElement('div');
        el.className = `log-line log-${(entry.level || 'info').toLowerCase()}`;
        const ts = entry.timestamp || '';
        const msg = entry.message || '';
        const details = entry.details || '';
        el.textContent = `${ts} [${String(entry.level || 'info').toUpperCase()}] ${msg}${details ? ' — ' + details : ''}`;
        return el;
    }

    function setLogsPaused(pause) {
        logsPaused = pause;
        if (logsPauseBtn) logsPauseBtn.textContent = logsPaused ? 'Resume' : 'Pause';
    }

    async function refreshLogs(force = false) {
        if (!logsList) return;
        if (logsPaused && !force) return;

        try {
            const data = await fetchJsonWithAdmin('/api/system/logs?count=200');
            const logs = data.logs || [];
            const fingerprint = safeJSONStringify(logs.map(l => `${l.timestamp}|${l.level}|${l.message}`).slice(-50));
            if (!force && fingerprint === lastLogsFingerprint) return;
            lastLogsFingerprint = fingerprint;

            logsList.innerHTML = '';
            logs.forEach(l => logsList.appendChild(renderLogLine(l)));
        } catch (e) {
            logsList.textContent = `Error: ${e.message} (set Admin Token in Settings)`;
        }
    }

    function startLogsPolling() {
        if (logsTimer) clearInterval(logsTimer);
        logsTimer = setInterval(() => {
            if (activeTab === 'logs') refreshLogs(false);
        }, 2000);
    }
    startLogsPolling();

    if (logsPauseBtn) logsPauseBtn.addEventListener('click', () => setLogsPaused(!logsPaused));
    if (logsClearBtn) logsClearBtn.addEventListener('click', () => { if (logsList) logsList.innerHTML = ''; });
    if (logsRefreshBtn) logsRefreshBtn.addEventListener('click', () => refreshLogs(true));

    // ---------------------------------
    // Activity history
    // ---------------------------------
    let activityTimer = null;

    function renderActivityLine(entry) {
        const el = document.createElement('div');
        const status = entry.status || 'unknown';
        el.className = `log-line log-${status === 'success' ? 'info' : 'error'}`;
        const ts = entry.timestamp || '';
        const title = entry.title || '';
        const error = entry.error || '';
        el.textContent = `${ts} [${String(status).toUpperCase()}] ${title}${error ? ' — ' + error : ''}`;
        return el;
    }

    function renderStats(stats) {
        if (!activityStats) return;
        activityStats.innerHTML = '';
        const pairs = [
            ['total', stats?.total ?? '-'],
            ['success', stats?.success ?? '-'],
            ['failure', stats?.failure ?? '-'],
            ['lastUpdate', stats?.lastUpdate ?? '-'],
        ];
        pairs.forEach(([k, v]) => {
            const row = document.createElement('div');
            row.className = 'kv-row';
            row.innerHTML = `<div class="kv-key">${k}</div><div class="kv-value">${String(v)}</div>`;
            activityStats.appendChild(row);
        });
    }

    async function refreshActivity(force = false) {
        if (!activityList) return;
        try {
            const data = await fetchJsonWithAdmin('/api/discord/activity-history?count=100');
            renderStats(data.stats);
            const history = data.history || [];
            activityList.innerHTML = '';
            history.forEach(h => activityList.appendChild(renderActivityLine(h)));
        } catch (e) {
            activityList.textContent = `Error: ${e.message} (set Admin Token in Settings)`;
        }
    }

    function startActivityPolling() {
        if (activityTimer) clearInterval(activityTimer);
        activityTimer = setInterval(() => {
            if (activeTab === 'activity') refreshActivity(false);
        }, 3000);
    }
    startActivityPolling();

    if (activityRefreshBtn) activityRefreshBtn.addEventListener('click', () => refreshActivity(true));

    // ---------------------------------
    // Metadata overrides
    // ---------------------------------
    let overridesTimer = null;

    function buildOverridesRows(overridesObj) {
        if (!overridesTable) return;
        const tbody = overridesTable.querySelector('tbody');
        if (!tbody) return;
        tbody.innerHTML = '';

        const categories = Object.keys(overridesObj || {});
        categories.sort();
        categories.forEach(category => {
            const titles = overridesObj[category] || {};
            const keys = Object.keys(titles);
            keys.sort();
            keys.forEach(title => {
                const override = titles[title];
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${category}</td>
                    <td>${title}</td>
                    <td><code class="inline-code">${safeJSONStringify(override, 0)}</code></td>
                    <td><button class="btn btn-secondary btn-sm" data-action="delete" data-category="${category}" data-title="${title}">Delete</button></td>
                `;
                tbody.appendChild(tr);
            });
        });
    }

    async function refreshOverrides(force = false) {
        if (!overridesTable) return;
        try {
            const data = await fetchJsonWithAdmin('/api/metadata/overrides');
            buildOverridesRows(data);
        } catch (e) {
            const tbody = overridesTable.querySelector('tbody');
            if (tbody) tbody.innerHTML = `<tr><td colspan="4">Error: ${e.message} (set Admin Token in Settings)</td></tr>`;
        }
    }

    function startOverridesPolling() {
        if (overridesTimer) clearInterval(overridesTimer);
        overridesTimer = setInterval(() => {
            if (activeTab === 'overrides') refreshOverrides(false);
        }, 5000);
    }
    startOverridesPolling();

    if (overridesRefreshBtn) overridesRefreshBtn.addEventListener('click', () => refreshOverrides(true));

    if (overrideAddBtn) {
        overrideAddBtn.addEventListener('click', async () => {
            const category = (overrideCategoryInput?.value || '').trim();
            const title = (overrideTitleInput?.value || '').trim();
            const overrideText = (overrideJsonInput?.value || '').trim();
            if (!category || !title || !overrideText) {
                showNotification('Category, title, and override JSON are required', 'warning');
                return;
            }

            let override;
            try {
                override = JSON.parse(overrideText);
            } catch {
                showNotification('Override JSON is not valid JSON', 'error');
                return;
            }

            try {
                await fetchJsonWithAdmin('/api/metadata/overrides', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ category, title, override })
                });
                showNotification('Override saved', 'success');
                refreshOverrides(true);
            } catch (e) {
                showNotification(`Failed to save override: ${e.message}`, 'error');
            }
        });
    }

    if (overridesTable) {
        overridesTable.addEventListener('click', async (e) => {
            const btn = e.target.closest('button');
            if (!btn || btn.dataset.action !== 'delete') return;

            const category = btn.dataset.category;
            const title = btn.dataset.title;
            try {
                await fetchJsonWithAdmin('/api/metadata/overrides', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ category, title })
                });
                showNotification('Override deleted', 'success');
                refreshOverrides(true);
            } catch (err) {
                showNotification(`Failed to delete override: ${err.message}`, 'error');
            }
        });
    }

    // ---------------------------------
    // Connection wizard
    // ---------------------------------
    if (wizardTestVlcBtn) {
        wizardTestVlcBtn.addEventListener('click', async () => {
            if (wizardVlcResult) wizardVlcResult.textContent = 'Loading...';
            try {
                const host = vlcHostInput?.value || 'localhost';
                const port = parseInt(vlcPortInput?.value || '8080', 10);
                const password = vlcPasswordInput?.value || '';
                const res = await fetch('/api/vlc/test', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ host, port, password })
                });
                const data = await res.json();
                if (wizardVlcResult) wizardVlcResult.textContent = safeJSONStringify(data, 2);
                showNotification(data.connected ? 'VLC test successful' : 'VLC test failed', data.connected ? 'success' : 'error');
            } catch (e) {
                if (wizardVlcResult) wizardVlcResult.textContent = `Error: ${e.message}`;
            }
        });
    }

    if (wizardCheckDiscordBtn) {
        wizardCheckDiscordBtn.addEventListener('click', async () => {
            if (wizardDiscordResult) wizardDiscordResult.textContent = 'Loading...';
            try {
                const data = await fetch('/api/discord/status').then(r => r.json());
                if (wizardDiscordResult) wizardDiscordResult.textContent = safeJSONStringify(data, 2);
            } catch (e) {
                if (wizardDiscordResult) wizardDiscordResult.textContent = `Error: ${e.message}`;
            }
        });
    }

    if (wizardCheckAdminBtn) {
        wizardCheckAdminBtn.addEventListener('click', async () => {
            if (wizardAdminResult) wizardAdminResult.textContent = 'Loading...';
            try {
                const data = await fetchJsonWithAdmin('/api/system/health/diagnostics');
                if (wizardAdminResult) wizardAdminResult.textContent = safeJSONStringify({ ok: true, sample: data?.summary || null }, 2);
            } catch (e) {
                if (wizardAdminResult) wizardAdminResult.textContent = safeJSONStringify({ ok: false, error: e.message }, 2);
            }
        });
    }
    
    // Close modals when clicking outside
    window.addEventListener('click', function(e) {
        if (e.target === instructionsModal) {
            instructionsModal.style.display = 'none';
        }
        if (e.target === vlcSetupModal) {
            vlcSetupModal.style.display = 'none';
        }
    });

    // Helper Functions
    function showNotification(message, type = 'info') {
        // Remove existing notifications
        const existingNotifications = document.querySelectorAll('.notification');
        existingNotifications.forEach(notif => notif.remove());

        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        
        // Styling handled by CSS (.notification + variants)
        
        document.body.appendChild(notification);
        
        // Auto-remove after 4 seconds
        setTimeout(() => {
            notification.remove();
        }, 4000);
    }

    function updateVLCStatus(status) {
        setVLCStatus(status.connected);
        
        if (status.connected) {
            if (status.title) {
                // Media is available
                mediaTitle.textContent = status.title;
                
                // Update metadata display
                if (status.metadata) {
                    // Enhanced metadata from TMDb
                    const meta = status.metadata;
                    if (meta.type === 'movie') {
                        mediaMetadata.textContent = `${meta.year ? `(${meta.year}) • ` : ''}${meta.genres.slice(0, 3).join(', ')}`;
                        mediaPoster.src = meta.posterUrl || 'assets/vlc.png';
                    } else if (meta.type === 'tv') {
                        const episodeInfo = meta.formattedEpisode ? ` • ${meta.formattedEpisode}` : '';
                        mediaMetadata.textContent = `${meta.episodeTitle || ''}${episodeInfo} • ${meta.genres.slice(0, 2).join(', ')}`;
                        mediaPoster.src = meta.posterUrl || 'assets/vlc.png';
                    }
                    
                    // Update TMDb link
                    if (meta.tmdbUrl && tmdbLink) {
                        tmdbLink.href = meta.tmdbUrl;
                        tmdbLink.style.display = 'inline-block';
                    } else if (tmdbLink) {
                        tmdbLink.style.display = 'none';
                    }
                } else {
                    // Basic media info
                    mediaMetadata.textContent = status.mediaType || 'Unknown type';
                    mediaPoster.src = 'assets/vlc.png';
                    if (tmdbLink) {
                        tmdbLink.style.display = 'none';
                    }
                }
                
                // Update progress
                const position = status.position || 0;
                progressFill.style.width = `${position * 100}%`;
                
                // Format time display
                const elapsed = formatTime(status.elapsed || 0);
                const total = formatTime(status.length || 0);
                progressTime.textContent = `${elapsed} / ${total}`;
                
                // Format percentage
                progressPercentage.textContent = `${Math.round(position * 100)}%`;
                
            } else {
                // No media playing
                resetMediaDisplay();
            }
        } else {
            // Not connected to VLC
            resetMediaDisplay();
        }
    }
    
    function updateDiscordStatus(status) {
        setDiscordStatus(status.connected);
    }
    
    function setVLCStatus(connected) {
        if (vlcStatusText) {
            vlcStatusText.textContent = connected ? 'Connected' : 'Disconnected';
            vlcStatusText.className = connected ? 'status-connected' : 'status-disconnected';
        }
    }
    
    function setDiscordStatus(connected) {
        if (discordStatusText) {
            discordStatusText.textContent = connected ? 'Connected' : 'Disconnected';
            discordStatusText.className = connected ? 'status-connected' : 'status-disconnected';
        }
    }
    
    function resetMediaDisplay() {
        // Reset main media display
        if (mediaTitle) mediaTitle.textContent = 'Not playing';
        if (mediaMetadata) mediaMetadata.textContent = '-';
        if (mediaPoster) mediaPoster.src = 'assets/vlc.png';
        
        if (progressFill) progressFill.style.width = '0%';
        if (progressTime) progressTime.textContent = '0:00 / 0:00';
        if (progressPercentage) progressPercentage.textContent = '0%';
        
        if (tmdbLink) {
            tmdbLink.style.display = 'none';
        }
    }
    
    // Helper function for time formatting
    function formatTime(seconds) {
        if (!seconds || isNaN(seconds)) return '0:00';
        
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        
        if (hrs > 0) {
            return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
});
