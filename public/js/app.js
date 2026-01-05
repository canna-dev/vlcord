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

    // Tab functionality
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    
    // Initialize tabs
    function initTabs() {
        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const targetTab = button.getAttribute('data-tab');
                
                // Remove active class from all buttons and contents
                tabButtons.forEach(btn => btn.classList.remove('active'));
                tabContents.forEach(content => content.classList.remove('active'));
                
                // Add active class to clicked button and corresponding content
                button.classList.add('active');
                const targetContent = document.getElementById(`${targetTab}-tab`);
                if (targetContent) {
                    targetContent.classList.add('active');
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
    
    socket.on('vlcStatus', (status) => {
        updateVLCStatus(status);
    });
    
    socket.on('discordStatus', (status) => {
        updateDiscordStatus(status);
    });
    
    socket.on('config', (config) => {
        // Update form values with current config
        vlcHostInput.value = config.vlcHost || 'localhost';
        vlcPortInput.value = config.vlcPort || '8080';
        vlcPasswordInput.value = config.vlcPassword || 'vlcpassword';
        discordClientIdInput.value = config.discordClientId || '1392902149163319398';
        tmdbApiKeyInput.value = config.tmdbApiKey || 'ccc1fa36a0821299ae4d7a6c155b442d';
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
                const response = await fetch('/api/test-vlc-connection');
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
        
        // Style the notification
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 20px;
            border-radius: 6px;
            color: white;
            font-weight: 500;
            z-index: 10000;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            max-width: 400px;
            word-wrap: break-word;
        `;
        
        // Set background color based on type
        switch(type) {
            case 'success':
                notification.style.backgroundColor = '#28a745';
                break;
            case 'error':
                notification.style.backgroundColor = '#dc3545';
                break;
            case 'warning':
                notification.style.backgroundColor = '#ffc107';
                notification.style.color = '#212529';
                break;
            default:
                notification.style.backgroundColor = '#17a2b8';
        }
        
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
