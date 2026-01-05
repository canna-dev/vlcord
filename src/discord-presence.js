import { EventEmitter } from 'events';
import DiscordClient from './discord-client.js';
import * as presenceBuilder from './presence-builder.js';
import { detectDiscordClientError, formatDiscordClientErrorForConsole } from './discord-client-detector.js';
import logger from './logger.js';

export class DiscordPresence extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.discordClient = new DiscordClient();
    this.discordRpc = null;
    this.lastSentPayload = null; // store last payload sent to Discord for diagnostics
    this.connected = false;
    this.lastActivity = null;
    this.presenceInterval = null;
    this.lastUpdateTime = 0;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectTimeout = null;
    this.buttonWarningShown = false;  // Track if we've shown the button warning
    
    // Track last logged values to prevent duplicate logs
    this.lastLogged = {
      buttons: null,
      title: null,
      mediaType: null
    };
    
    // Rate limiting configuration
    this.rateLimit = {
      standard: 10000,    // 10 seconds for standard updates
      important: 2000,    // 2 seconds for important changes
      jumpDetection: 0.05 // 5% position change threshold
    };
    
    // Initialize on next tick to ensure all event handlers are registered
    setTimeout(() => this.initialize(), 0);
  }
  
  async initialize() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    try {
      logger.debug('Initializing Discord RPC with client ID:', this.config.clientId);
      await this.discordClient.init(this.config.clientId);
      this.connected = true;
      // Keep a direct reference to the underlying RPC client for quick checks
      this.discordRpc = this.discordClient.client;
      this.reconnectAttempts = 0;
      this.emit('connectionUpdate', this.getConnectionStatus());

      this.discordClient.on('ready', (user) => {
        logger.info(`Discord RPC connected as ${user ? user.username : 'Unknown'}`);
      });

      this.discordClient.on('discordClientError', (errorInfo) => {
        logger.error(formatDiscordClientErrorForConsole(errorInfo));
        this.emit('discordClientTypeError', errorInfo);
        this.handleDisconnect(new Error(errorInfo.message));
      });

      this.discordClient.on('error', (err) => {
        // Check if this is a Discord client type error
        const detectedError = detectDiscordClientError(err);
        if (detectedError) {
          logger.error(formatDiscordClientErrorForConsole(detectedError));
          this.emit('discordClientTypeError', detectedError);
        } else {
          logger.error('Discord client error:', err);
        }
        this.handleDisconnect(err);
      });
    } catch (error) {
      logger.error('Discord RPC initialization error:', error);
      this.handleDisconnect(error);
    }
  }
  
  handleDisconnect(error) {
    if (this.connected) {
      logger.info('Discord connection lost:', error?.message || 'Unknown reason');
    }
    
    this.connected = false;
    this.emit('connectionUpdate', this.getConnectionStatus());
    
    // Implement exponential backoff for reconnection
    this.reconnectAttempts++;
    const reconnectDelay = Math.min(
      5000 * Math.pow(1.5, this.reconnectAttempts - 1), // Exponential backoff
      300000 // Max 5 minutes
    );
    
    // Track reconnection attempts with exponential backoff
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      logger.debug(`Attempting to reconnect to Discord in ${Math.round(reconnectDelay/1000)}s (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
      this.reconnectTimeout = setTimeout(() => {
        this.initialize();
      }, reconnectDelay);
    } else {
      logger.error(`Failed to reconnect to Discord after ${this.maxReconnectAttempts} attempts. Please check your Discord client.`);
      this.emit('connectionError', {
        error: error?.message || 'Maximum reconnection attempts reached',
        attempts: this.reconnectAttempts,
        maxAttempts: this.maxReconnectAttempts
      });
    }
  }
  
  updateConfig(config) {
    const newClientId = config.clientId;
    
    // Only reinitialize if client ID changed
    if (newClientId && newClientId !== this.config.clientId) {
      logger.info(`Discord client ID changed from ${this.config.clientId} to ${newClientId}`);
      this.config.clientId = newClientId;
      this.disconnect();
      this.reconnectAttempts = 0; // Reset reconnect counter when manually changing config
      this.initialize();
    }
    
    // Update other configs
    Object.assign(this.config, config);
  }
  
  getConnectionStatus() {
    return {
      connected: this.connected,
      clientId: this.config.clientId,
      reconnectAttempts: this.reconnectAttempts,
      maxReconnectAttempts: this.maxReconnectAttempts
    };
  }
  
  async updatePresence(vlcStatus) {
    // Don't update if not connected
    if (!this.connected || !this.discordRpc) {
      return;
    }
    
    // Don't update if nothing is playing
    if (!vlcStatus.title) {
      this.clearPresence();
      return;
    }
    
    // Improved rate limiting with smart bypasses
    const now = Date.now();
    const timeSinceLastUpdate = now - this.lastUpdateTime;
    
    // Define important changes that bypass rate limits
    const playStateChanged = !this.lastActivity || (this.lastActivity.playing !== vlcStatus.playing);
    const titleChanged = !this.lastActivity || (this.lastActivity.title !== vlcStatus.title);
    const metadataChanged = !this.lastActivity || (
      (vlcStatus.metadata?.id !== this.lastActivity.metadataId) || 
      (vlcStatus.metadata?.type !== this.lastActivity.metadataType)
    );
    
    // Reset logged values on significant changes to allow re-logging
    if (titleChanged || metadataChanged) {
      this.lastLogged.title = null;
      this.lastLogged.buttons = null;
    }
    
    // Track significant position changes (e.g., skipping through video)
    const positionJumped = this.lastActivity && 
      Math.abs(vlcStatus.position - this.lastActivity.position) > 0.05; // 5% position change
    
    // Adaptive rate limiting:
    // - 2 seconds for play state, title or metadata changes (important updates)
    // - 5 seconds for position jumps (user skipped forward/backward)
    // - 10 seconds for normal position updates (standard rate limit)
    // - 60 seconds for paused content (very slow updates when paused)
    
    const minUpdateInterval = playStateChanged || titleChanged || metadataChanged ? 2000 :
                              positionJumped ? 5000 :
                              !vlcStatus.playing ? 60000 : 10000;
    
    if (timeSinceLastUpdate < minUpdateInterval) {
      // Rate limited - skip this update silently
      return;
    }
    
    // Store metadata IDs for change detection
    if (vlcStatus.metadata) {
      vlcStatus.metadataId = vlcStatus.metadata.id;
      vlcStatus.metadataType = vlcStatus.metadata.type;
    }
    
    this.lastUpdateTime = now;
    
    try {
      // Calculate timestamps for the progress bar (in milliseconds for discord-rpc)
      let startTimestamp = null;
      let endTimestamp = null;
      
      if (vlcStatus.playing && vlcStatus.length > 0) {
        try {
          const currentTime = Date.now();
          // Convert to milliseconds for discord-rpc
          // Handle elapsed time properly (never negative)
          const elapsed = Math.max(0, vlcStatus.elapsed);
          startTimestamp = (Math.floor(currentTime / 1000) - elapsed) * 1000;
          
          // Make sure length is valid and greater than elapsed time
          if (vlcStatus.length > elapsed) {
            endTimestamp = (startTimestamp / 1000 + vlcStatus.length) * 1000;
          }
        } catch (timeError) {
          logger.error('Error calculating timestamps:', timeError);
          // Continue without timestamps if calculation fails
        }
      }
      
      // Create activity object based on available data
      let activity = {};
      
      if (vlcStatus.metadata) {
        if (vlcStatus.metadata.type === 'movie') {
          activity = presenceBuilder.createMovieActivity(vlcStatus.metadata, vlcStatus, startTimestamp, endTimestamp);
        } else if (vlcStatus.metadata.type === 'tv') {
          activity = presenceBuilder.createTvShowActivity(vlcStatus.metadata, vlcStatus, startTimestamp, endTimestamp);
        } else {
          activity = presenceBuilder.createBasicActivity(vlcStatus, startTimestamp, endTimestamp);
          if (vlcStatus.metadata.title) activity.details = vlcStatus.metadata.title;
        }
      } else {
        activity = presenceBuilder.createBasicActivity(vlcStatus, startTimestamp, endTimestamp);
      }
      
      // IMPORTANT: For Discord's RPC, we need to structure this correctly for a "Watching" activity
      const rpcActivity = {
        // Details and state
        details: activity.details || 'Watching a video',
        state: activity.state || '',
        
        // Images
        assets: {
          large_image: activity.largeImageKey || 'vlc',
          large_text: activity.largeImageText || 'VLC Media Player',
          small_image: activity.smallImageKey || 'play',
          small_text: activity.smallImageText || 'Watching'
        },
        
        // Timestamps
        timestamps: {},
        
        instance: false
      };
      
      // Add timestamps if they exist and are valid
      if (startTimestamp && !isNaN(startTimestamp) && startTimestamp > 0) {
        rpcActivity.timestamps.start = startTimestamp;
      }
      
      if (endTimestamp && !isNaN(endTimestamp) && endTimestamp > startTimestamp) {
        rpcActivity.timestamps.end = endTimestamp;
      }
      
      // Add buttons if available and valid
      if (activity.buttons && Array.isArray(activity.buttons)) {
        // Validate button structure
        const validButtons = activity.buttons.filter(btn => 
          btn && typeof btn === 'object' && btn.label && typeof btn.label === 'string' && 
          btn.url && typeof btn.url === 'string' && btn.url.startsWith('http')
        );
        
        if (validButtons.length > 0) {
          // Limit to 2 buttons max (Discord limitation)
          rpcActivity.buttons = validButtons.slice(0, 2);
          
          // Only log if buttons changed
          const buttonsString = JSON.stringify(rpcActivity.buttons);
          if (this.lastLogged.buttons !== buttonsString) {
            logger.debug('Adding buttons to rich presence:', buttonsString);
            this.lastLogged.buttons = buttonsString;
          }
        } else if (activity.buttons.length > 0) {
          logger.warn('Buttons were provided but none were valid:', JSON.stringify(activity.buttons));
        }
      } else if (vlcStatus.metadata?.tmdbUrl) {
        // Fallback for TMDb URL if no buttons were set but metadata has URL
        rpcActivity.buttons = [
          { label: 'View on TMDb', url: vlcStatus.metadata.tmdbUrl }
        ];
        logger.debug('Adding fallback TMDb button:', vlcStatus.metadata.tmdbUrl);
      }
      
      // Add note about buttons if they're not showing
      if (rpcActivity.buttons && rpcActivity.buttons.length > 0 && !this.buttonWarningShown) {
        logger.debug('Note: Discord buttons may not appear if the Discord application is not verified.');
        this.buttonWarningShown = true;
      }

      // Set activity silently

      // WATCHING FIX: Use the raw RPC request method instead of setActivity
      // This forces Discord to properly show "Watching" instead of "Playing"

      // NEW FORMAT: Show "Watching [Movie Title]" instead of "Watching VLCord"
      // For this format, we'll use the movie title as the app name instead of "VLCord"
      // This will make Discord show "Watching [Movie Title]"

      // Get the actual media title for the "Watching" display
      // Always use the actual media title instead of "VLCord"
      // Get the actual media title for the "Watching" display
      // For TV shows, use the show title, not the episode title
      let mediaTitle = null;
      
      // CRITICAL: Ensure we have a valid title for the app name
      // This is what will show after "Watching" in Discord
      if (vlcStatus.metadata?.type === 'tv' && vlcStatus.metadata?.title) {
        // For TV shows, use the show title from metadata
        mediaTitle = vlcStatus.metadata.title;
        const logKey = `tv:${mediaTitle}`;
        if (this.lastLogged.title !== logKey) {
          logger.debug(`Using TV show title: "${mediaTitle}"`);
          this.lastLogged.title = logKey;
        }
      } else if (vlcStatus.metadata?.type === 'movie' && vlcStatus.metadata?.title) {
        // For movies, use the movie title from metadata
        mediaTitle = vlcStatus.metadata.title;
        const logKey = `movie:${mediaTitle}`;
        if (this.lastLogged.title !== logKey) {
          logger.debug(`Using movie title: "${mediaTitle}"`);
          this.lastLogged.title = logKey;
        }
      } else if (vlcStatus.cleanTitle) {
        // If no metadata but we have a cleaned title, use that
        mediaTitle = vlcStatus.cleanTitle;
        const logKey = `clean:${mediaTitle}`;
        if (this.lastLogged.title !== logKey) {
          logger.debug(`Using cleaned title: "${mediaTitle}"`);
          this.lastLogged.title = logKey;
        }
      } else if (rpcActivity.details && typeof rpcActivity.details === 'string' && rpcActivity.details !== 'Media file') {
        // Last resort, try to get a title from the activity details
        mediaTitle = rpcActivity.details;
        const logKey = `details:${mediaTitle}`;
        if (this.lastLogged.title !== logKey) {
          logger.debug(`Using details as title: "${mediaTitle}"`);
          this.lastLogged.title = logKey;
        }
      } else {
        // Absolute fallback
        mediaTitle = "Media Player";
        const logKey = `fallback:${mediaTitle}`;
        if (this.lastLogged.title !== logKey) {
          logger.debug(`Using fallback title: "${mediaTitle}"`);
          this.lastLogged.title = logKey;
        }
      }
      
      // Setting activity with WATCHING type
      
      // CRITICAL FIX: We MUST use the raw request method with specific format
      // SIMPLIFIED BUTTON APPROACH: Discord is extremely picky about buttons
      // Let's construct the activity in the most direct way possible
      const directActivity = {
        // Standard rich presence data
        details: rpcActivity.details,
        state: rpcActivity.state,
        timestamps: rpcActivity.timestamps || {},
        assets: rpcActivity.assets || {},
        instance: false,
        
        // Activity type (3 = Watching)
        type: 3,
      };
      
      // Add buttons in the correct format
      // Only one format works reliably with Discord RPC for buttons
      if (activity.buttons && Array.isArray(activity.buttons) && activity.buttons.length > 0) {
        // Only log if buttons changed
        const buttonsString = JSON.stringify(activity.buttons);
        if (this.lastLogged.buttons !== buttonsString) {
          logger.debug('Adding buttons to activity:', buttonsString);
          this.lastLogged.buttons = buttonsString;
        }
        directActivity.buttons = activity.buttons.map(btn => ({
          label: btn.label,
          url: btn.url
        })).slice(0, 2); // Maximum 2 buttons allowed by Discord
      } 
      // Special fallback for TMDb links
      else if (vlcStatus.metadata?.tmdbUrl) {
        directActivity.buttons = [
          { 
            label: 'View on TMDb', 
            url: vlcStatus.metadata.tmdbUrl 
          }
        ];
        logger.debug('Using fallback TMDb button:', vlcStatus.metadata.tmdbUrl);
      }
      
      // Use the Discord client wrapper to set activity
      const setPayload = {
        pid: process.pid,
        activity: {
          details: directActivity.details,
          state: directActivity.state,
          timestamps: directActivity.timestamps,
          assets: directActivity.assets,
          buttons: directActivity.buttons,
          instance: true,
          application_id: this.config.clientId,
          flags: 1 << 0,
          type: 3,
        }
      };

      // Send activity to Discord and log the payload for diagnostics
      await this.discordClient.request('SET_ACTIVITY', setPayload);

      try {
        // Store a redacted copy of the payload (no sensitive data expected, but keep safe)
        const redacted = JSON.parse(JSON.stringify(setPayload));
        if (redacted.activity && redacted.activity.assets) {
          // Keep image keys only
          redacted.activity.assets = {
            large_image: redacted.activity.assets.large_image,
            small_image: redacted.activity.assets.small_image
          };
        }
        this.lastSentPayload = redacted;
        logger.info('Discord presence payload sent:', JSON.stringify(redacted));
      } catch (logErr) {
        // If logging fails, don't interrupt normal flow
        logger.warn('Failed to log Discord payload:', logErr);
      }
      
      // Store last activity state with additional tracking for rate limiting
      this.lastActivity = {
        ...activity,
        playing: vlcStatus.playing,
        title: vlcStatus.title,
        position: vlcStatus.position,
        metadataId: vlcStatus.metadata?.id,
        metadataType: vlcStatus.metadata?.type,
      };
      // Activity updated successfully
      
    } catch (error) {
    logger.error('Error updating Discord presence:', error);
      
      // Check for specific connection errors
      if (error.message && (
          error.message.includes('connection closed') || 
          error.message.includes('not connected') ||
          error.message.includes('connection timeout') ||
          error.message.includes('invalid client id') ||
          error.message.includes('RPC_CONNECTION_TIMEOUT') ||
          error.message.includes('RPC_CLOSED')
      )) {
        logger.warn('Discord connection issue detected:', error.message);
        this.connected = false;
        this.emit('connectionUpdate', this.getConnectionStatus());
        
        // Try to reconnect with exponential backoff
        this.handleDisconnect(error);
      }
      // Other errors we can just log but don't need to disconnect
    }
  }
  // activity creation moved to presence-builder.js
  
  async clearPresence() {
    if (this.connected && this.discordClient) {
      try {
        await this.discordClient.setActivity({});
        this.lastActivity = null;
        this.lastUpdateTime = 0;
      } catch (error) {
        logger.error('Error clearing Discord presence:', error);
        if (error.message && (error.message.includes('connection closed') || error.message.includes('not connected'))) {
          this.handleDisconnect(error);
        }
      }
    }
  }
  
  async disconnect() {
    try {
      if (this.reconnectTimeout) {
        clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = null;
      }
      
      if (this.connected && this.discordClient) {
        await this.clearPresence();
        await this.discordClient.destroy();
      }
    } catch (error) {
      logger.error('Error disconnecting from Discord:', error);
    } finally {
      this.connected = false;
      this.discordRpc = null;
      this.discordClient = null;
      this.lastSentPayload = null;
      this.emit('connectionUpdate', this.getConnectionStatus());
      logger.info('Discord RPC disconnected');
    }
  }
  
  /**
   * Extract a clean title from a filename by removing common media naming patterns
   * @param {string} title - The title to clean
   * @param {string} filename - Original filename (optional, for additional context)
   * @returns {string} Cleaned title
   */
  extractCleanTitle(title, filename = '') {
    // Use presence-builder implementation
    return presenceBuilder.extractCleanTitle(title, filename);
  }
}
