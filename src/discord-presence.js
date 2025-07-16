import { EventEmitter } from 'events';
// Use Discord RPC instead of SDK for better compatibility
import DiscordRPC from 'discord-rpc';
import * as animeHandler from './anime-titles.js';

// Register the application with Discord - this is critical for RPC to work
DiscordRPC.register(process.env.DISCORD_CLIENT_ID || '1392902149163319398');

export class DiscordPresence extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.discordRpc = null;
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
    // Clear any existing reconnect timeout
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    try {
      console.log('Initializing Discord RPC with client ID:', this.config.clientId);
      
      // CRITICAL FIX: Register the client ID with Discord RPC
      // This step is REQUIRED for activity type (Watching) to work correctly
      DiscordRPC.register(this.config.clientId);
      
      // Create a new Discord RPC client
      this.discordRpc = new DiscordRPC.Client({ transport: 'ipc' });
      
      // Set up event handlers with proper binding to this instance
      this.discordRpc.on('ready', () => {
        console.log(`Discord RPC connected as ${this.discordRpc.user ? this.discordRpc.user.username : 'Unknown'}`);
        this.connected = true;
        this.reconnectAttempts = 0; // Reset reconnect counter on successful connection
        this.emit('connectionUpdate', this.getConnectionStatus());
      });
      
      this.discordRpc.on('disconnected', () => {
        console.log('Discord RPC disconnected');
        this.handleDisconnect(new Error('Discord RPC disconnected'));
      });
      
      this.discordRpc.on('error', (error) => {
        console.error('Discord RPC error:', error);
        this.handleDisconnect(error);
      });
      
      // Login to Discord with the client ID
      console.log('Attempting to login to Discord RPC...');
      await this.discordRpc.login({ clientId: this.config.clientId });
      console.log('Discord RPC ready');
    } catch (error) {
      console.error('Discord RPC initialization error:', error);
      this.handleDisconnect(error);
    }
  }
  
  handleDisconnect(error) {
    if (this.connected) {
      console.log('Discord connection lost:', error?.message || 'Unknown reason');
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
      console.log(`Attempting to reconnect to Discord in ${Math.round(reconnectDelay/1000)}s (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
      this.reconnectTimeout = setTimeout(() => {
        this.initialize();
      }, reconnectDelay);
    } else {
      console.error(`Failed to reconnect to Discord after ${this.maxReconnectAttempts} attempts. Please check your Discord client.`);
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
      console.log(`Discord client ID changed from ${this.config.clientId} to ${newClientId}`);
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
          console.error('Error calculating timestamps:', timeError);
          // Continue without timestamps if calculation fails
        }
      }
      
      // Create activity object based on available data
      let activity = {};
      
      if (vlcStatus.metadata) {
        // Rich presence with TMDb metadata
        if (vlcStatus.metadata.type === 'movie') {
          activity = this.createMovieActivity(vlcStatus, startTimestamp, endTimestamp);
        } else if (vlcStatus.metadata.type === 'tv') {
          activity = this.createTvShowActivity(vlcStatus, startTimestamp, endTimestamp);
        } else {
          // Unknown media type with metadata
          activity = this.createBasicActivity(vlcStatus, startTimestamp, endTimestamp);
          // Add metadata to basic activity if available
          if (vlcStatus.metadata.title) {
            activity.details = vlcStatus.metadata.title;
          }
        }
      } else {
        // Fallback presence with basic information
        activity = this.createBasicActivity(vlcStatus, startTimestamp, endTimestamp);
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
            console.log('Adding buttons to rich presence:', buttonsString);
            this.lastLogged.buttons = buttonsString;
          }
        } else if (activity.buttons.length > 0) {
          console.warn('Buttons were provided but none were valid:', JSON.stringify(activity.buttons));
        }
      } else if (vlcStatus.metadata?.tmdbUrl) {
        // Fallback for TMDb URL if no buttons were set but metadata has URL
        rpcActivity.buttons = [
          { label: 'View on TMDb', url: vlcStatus.metadata.tmdbUrl }
        ];
        console.log('Adding fallback TMDb button:', vlcStatus.metadata.tmdbUrl);
      }
      
      // Add note about buttons if they're not showing
      if (rpcActivity.buttons && rpcActivity.buttons.length > 0 && !this.buttonWarningShown) {
        console.log('📝 Note: Discord buttons may not appear if the Discord application is not verified.');
        console.log('   This is a Discord limitation, not a VLCord issue.');
        console.log('   The TMDb links are still being sent to Discord correctly.');
        this.buttonWarningShown = true;
      }
      
      // Set activity silently
      
      // WATCHING FIX: Use the raw RPC request method instead of setActivity
      // This forces Discord to properly show "Watching" instead of "Playing"
      
      // Always use "VLCord" as the application name shown in Discord
      const appName = "VLCord";
      
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
          console.log(`Using TV show title: "${mediaTitle}"`);
          this.lastLogged.title = logKey;
        }
      } else if (vlcStatus.metadata?.type === 'movie' && vlcStatus.metadata?.title) {
        // For movies, use the movie title from metadata
        mediaTitle = vlcStatus.metadata.title;
        const logKey = `movie:${mediaTitle}`;
        if (this.lastLogged.title !== logKey) {
          console.log(`Using movie title: "${mediaTitle}"`);
          this.lastLogged.title = logKey;
        }
      } else if (vlcStatus.cleanTitle) {
        // If no metadata but we have a cleaned title, use that
        mediaTitle = vlcStatus.cleanTitle;
        const logKey = `clean:${mediaTitle}`;
        if (this.lastLogged.title !== logKey) {
          console.log(`Using cleaned title: "${mediaTitle}"`);
          this.lastLogged.title = logKey;
        }
      } else if (rpcActivity.details && typeof rpcActivity.details === 'string' && rpcActivity.details !== 'Media file') {
        // Last resort, try to get a title from the activity details
        mediaTitle = rpcActivity.details;
        const logKey = `details:${mediaTitle}`;
        if (this.lastLogged.title !== logKey) {
          console.log(`Using details as title: "${mediaTitle}"`);
          this.lastLogged.title = logKey;
        }
      } else {
        // Absolute fallback
        mediaTitle = "Media Player";
        const logKey = `fallback:${mediaTitle}`;
        if (this.lastLogged.title !== logKey) {
          console.log(`Using fallback title: "${mediaTitle}"`);
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
          console.log('Adding buttons to activity:', buttonsString);
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
        console.log('Using fallback TMDb button:', vlcStatus.metadata.tmdbUrl);
      }
      
      await this.discordRpc.request('SET_ACTIVITY', {
        pid: process.pid,
        activity: {
          // Basic activity properties
          details: directActivity.details,
          state: directActivity.state,
          timestamps: directActivity.timestamps,
          assets: directActivity.assets,
          
          // CRITICAL: Include buttons directly in this format
          buttons: directActivity.buttons,
          
          // Required settings for proper activity type
          instance: true,
          
          // CRITICAL: These properties are REQUIRED together to make Discord show "Watching"
          // NOTE: The application name shown in Discord (what appears after "Watching") 
          // is controlled by your Discord Application's name in the Developer Portal.
          // To change this from "Watching VLCord" to something else:
          // 1. Go to https://discord.com/developers/applications
          // 2. Select your VLCord application
          // 3. Change the name to something generic like "Media" or "Now Watching"
          // 4. Save your changes
          // Discord will then show "Watching Media" instead of "Watching VLCord"
          // See APP_NAME_SOLUTION.md for more details
          
          application_id: this.config.clientId,
          flags: 1 << 0,  // ACTIVITY_FLAG_INSTANCE
          type: 3,        // 3 = Watching activity type
          
          // Note: This doesn't change what shows after "Watching" - that's controlled by your app name
          // in the Discord Developer Portal, not by this code.
          instance: true
        }
      });
      
      // Store last activity state with additional tracking for rate limiting
      this.lastActivity = { 
        ...activity, 
        playing: vlcStatus.playing,
        title: vlcStatus.title,
        position: vlcStatus.position,
        metadataId: vlcStatus.metadata?.id,
        metadataType: vlcStatus.metadata?.type
      };
      // Activity updated successfully
      
    } catch (error) {
      console.error('Error updating Discord presence:', error);
      
      // Check for specific connection errors
      if (error.message && (
          error.message.includes('connection closed') || 
          error.message.includes('not connected') ||
          error.message.includes('connection timeout') ||
          error.message.includes('invalid client id') ||
          error.message.includes('RPC_CONNECTION_TIMEOUT') ||
          error.message.includes('RPC_CLOSED')
      )) {
        console.warn('Discord connection issue detected:', error.message);
        this.connected = false;
        this.emit('connectionUpdate', this.getConnectionStatus());
        
        // Try to reconnect with exponential backoff
        this.handleDisconnect(error);
      }
      // Other errors we can just log but don't need to disconnect
    }
  }
  
  createMovieActivity(vlcStatus, startTimestamp, endTimestamp) {
    const movie = vlcStatus.metadata;
    const isPlaying = vlcStatus.playing;
    
    // NEW FORMAT: Create activity for "Watching [Movie Title]" format
    // Format: "Watching [Movie Title]" (at top - set by name property)
    // Then "[Year]" or "[Year] • movie" (details line)
    // Then "Movie Description" (state line - from TMDb)
    
    // Create the state string with year and genres
    let state = '';
    let description = '';
    let details = '';
    
    // For details line, show the title and year
    if (movie.title && movie.year) {
      details = `${movie.title} (${movie.year})`;
    } else if (movie.title) {
      details = movie.title;
    } else if (movie.year) {
      details = `Movie (${movie.year})`;
    } else {
      details = 'Movie';
    }
    
    // For state line, use the movie description from TMDb
    if (movie.overview) {
      // Truncate description to fit Discord's limits (128 characters)
      state = movie.overview.length > 125 ? 
        movie.overview.substring(0, 122) + '...' : 
        movie.overview;
    } else if (movie.genres && movie.genres.length > 0) {
      // Use genres as description if no overview
      state = movie.genres.slice(0, 3).join(', ');
    } else {
      state = 'No description available';
    }
    
    // Keep movie description for hover text
    description = movie.overview || (movie.genres ? movie.genres.join(', ') : 'No description available');
    
    // Create the activity object with discord-rpc structure
    // Exactly like the format in the screenshot
    return {
      // Just like the screenshot:
      // Year and type as main details line (e.g. "2010 • movie") 
      details: details,
      
      // Movie description as secondary line (from TMDb)
      state: state, 
      
      // Use movie poster as large image
      largeImageKey: movie.posterUrl || 'vlc',
      
      // Just use the movie title as hover text for simplicity
      largeImageText: movie.title || 'Movie',
      smallImageKey: isPlaying ? 'play' : 'pause',
      smallImageText: isPlaying ? 'Watching' : 'Paused',
      startTimestamp: isPlaying ? startTimestamp : undefined,
      endTimestamp: isPlaying ? endTimestamp : undefined,
      buttons: movie.tmdbUrl ? [
        { label: 'View on TMDb', url: movie.tmdbUrl }
      ] : undefined
    };
  }
  
  createTvShowActivity(vlcStatus, startTimestamp, endTimestamp) {
    const show = vlcStatus.metadata;
    const isPlaying = vlcStatus.playing;
    const hasEpisode = show.episodeNumber !== undefined;
    const hasSeason = show.seasonNumber !== undefined;
    
    // Check if this is an anime and apply special formatting if so
    const isAnimeShow = animeHandler.isAnime(show.title || '', vlcStatus.filename || '');
    
    // Create a copy of the show data to avoid modifying the original
    let formattedShow = { ...show };
    
    if (isAnimeShow) {
      console.log('Detected anime show:', show.title);
      formattedShow = animeHandler.formatAnimeTitle(show);
      console.log('Formatted anime title:', formattedShow.title);
    }
    
    // NEW FORMAT: Create activity for "Watching [Show Title]" format
    // Format: "Watching [Show Title]" (at top - set by name property)
    // Then episode info (e.g., "S1E3 • Episode Title") (details line)
    // Then episode description (state line - from TMDb)
    
    let showName = formattedShow.title; // The show name (e.g., "The Umbrella Academy")
    let episodeTitle = ''; // Episode title (e.g., "Extra Ordinary")
    let seasonEpText = ''; // S1E3 format text
    let description = ''; // Episode description/plot
    
    // Format episode info properly - exactly like the screenshot
    if (hasEpisode) {
      // Format season/episode differently based on whether it's an anime and has special season naming
      if (isAnimeShow && formattedShow.noSeasonDisplay) {
        // For anime that don't use seasons (like One Piece), just show the episode number
        seasonEpText = `E${formattedShow.episodeNumber}`;
      } else if (isAnimeShow && formattedShow.seasonName) {
        // Use special season name for anime (like "Entertainment District Arc")
        seasonEpText = `${formattedShow.seasonName} E${formattedShow.episodeNumber}`;
      } else if (hasSeason) {
        // Standard format: S01E01
        seasonEpText = `S${String(formattedShow.seasonNumber).padStart(2, '0')}E${String(formattedShow.episodeNumber).padStart(2, '0')}`;
      } else {
        // Just episode number without season
        seasonEpText = `E${formattedShow.episodeNumber}`;
      }
      
      // Use episode title if available, otherwise fallback
      if (formattedShow.episodeTitle) {
        episodeTitle = formattedShow.episodeTitle;
      } else {
        episodeTitle = `Episode ${formattedShow.episodeNumber}`;
      }
      
      // Add description if available (truncated to fit Discord's limits)
      if (formattedShow.overview) {
        description = formattedShow.overview.length > 80 ? 
          formattedShow.overview.substring(0, 77) + '...' : 
          formattedShow.overview;
      }
    } else {
      // Fallback if no episode info
      episodeTitle = showName;
      if (formattedShow.overview) {
        description = formattedShow.overview.length > 80 ? 
          formattedShow.overview.substring(0, 77) + '...' : 
          formattedShow.overview;
      } else if (formattedShow.year) {
        description = `(${formattedShow.year})`;
        if (formattedShow.genres && formattedShow.genres.length > 0) {
          description += ` • ${formattedShow.genres.slice(0, 2).join(', ')}`;
        }
      }
    }
    
    // Format the details line based on anime or standard TV show
    let detailsLine;
    if (hasEpisode) {
      // Special anime formatting for detail line
      if (isAnimeShow) {
        detailsLine = `${formattedShow.title} - ${seasonEpText}`;
        console.log('Using anime details format:', detailsLine);
      } else {
        detailsLine = `${formattedShow.title} - ${seasonEpText}`;
      }
    } else {
      detailsLine = formattedShow.title ? 
        `${formattedShow.title}${formattedShow.year ? ` (${formattedShow.year})` : ''}` : 
        (formattedShow.year ? `TV Show (${formattedShow.year})` : 'TV Show');
    }
    
    // Update the episode title for the state line if this is an anime with a special season
    if (isAnimeShow && formattedShow.seasonName && episodeTitle === `Episode ${formattedShow.episodeNumber}`) {
      episodeTitle = `${formattedShow.seasonName} - ${episodeTitle}`;
    }
    
    // State line now combines episode title with description
    // Format: "Episode Title (Description)"
    let stateLine = '';
    if (episodeTitle) {
      stateLine = episodeTitle;
      if (description) {
        stateLine += ` (${description.length > 60 ? description.substring(0, 57) + '...' : description})`;
      }
    } else if (description) {
      stateLine = description;
    } else if (show.genres && show.genres.length > 0) {
      stateLine = show.genres.slice(0, 3).join(', ');
    } else {
      stateLine = 'No description available';
    }
    
    // Truncate state line to fit Discord's limits (128 characters)
    if (stateLine.length > 125) {
      stateLine = stateLine.substring(0, 122) + '...';
    }
    
    // For anime shows, specifically handle the format to ensure it shows both titles
    // and handles special seasons correctly
    if (isAnimeShow) {
      console.log('Formatting anime activity for:', formattedShow.title);
      
      // Special handling for anime shows
      let animeDetailsLine = detailsLine;
      
      // For anime with special seasons, ensure we show it correctly
      if (formattedShow.seasonName) {
        animeDetailsLine = `${formattedShow.title} - ${formattedShow.seasonName} E${formattedShow.episodeNumber}`;
        console.log('Using special season format:', animeDetailsLine);
      } 
      // For anime without seasons (like One Piece)
      else if (formattedShow.noSeasonDisplay && hasEpisode) {
        animeDetailsLine = `${formattedShow.title} - E${formattedShow.episodeNumber}`;
        console.log('Using episodic anime format:', animeDetailsLine);
      }
      
      return {
        // Top line format: "Demon Slayer (Kimetsu no Yaiba) - S01E01"
        details: animeDetailsLine,
        
        // Episode description as state line: "Episode Title (Description)"
        state: stateLine,
        
        // Use show poster as large image
        largeImageKey: show.posterUrl || 'vlc',
        
        // For anime, show both Japanese and English titles in hover if different than the main title
        largeImageText: show.originalTitle && show.originalTitle !== show.title ? 
          `${show.title} (${show.originalTitle})` : 
          (show.title || episodeTitle || 'Anime'),
        smallImageKey: isPlaying ? 'play' : 'pause',
        smallImageText: isPlaying ? 'Watching' : 'Paused',
        startTimestamp: isPlaying ? startTimestamp : undefined,
        endTimestamp: isPlaying ? endTimestamp : undefined,
        buttons: show.tmdbUrl ? [
          { label: 'View on TMDb', url: show.tmdbUrl }
        ] : undefined
      };
    }
    
    // Standard TV show format
    return {
      // Episode/season info as details line (e.g. "Show Title - S01E01")
      details: detailsLine,
      
      // Episode description as state line
      state: stateLine,
      
      // Use show poster as large image
      largeImageKey: show.posterUrl || 'vlc',
      
      // Show title as hover text
      largeImageText: show.title || episodeTitle || 'TV Show',
      smallImageKey: isPlaying ? 'play' : 'pause',
      smallImageText: isPlaying ? 'Watching' : 'Paused',
      startTimestamp: isPlaying ? startTimestamp : undefined,
      endTimestamp: isPlaying ? endTimestamp : undefined,
      buttons: show.tmdbUrl ? [
        { label: 'View on TMDb', url: show.tmdbUrl }
      ] : undefined
    };
  }
  
  createBasicActivity(vlcStatus, startTimestamp, endTimestamp) {
    const isPlaying = vlcStatus.playing;
    const title = vlcStatus.title || 'Unknown';
    const filename = vlcStatus.filename || title;
    
    // Clean the title to make it more presentable
    let cleanTitle = title;
    if (title.includes('/') || title.includes('\\')) {
      cleanTitle = title.split(/[\\/]/).pop(); // Get filename from path
      cleanTitle = cleanTitle.replace(/\.[^/.]+$/, ''); // Remove file extension
    }
    
    // Extract movie name by removing known patterns
    cleanTitle = this.extractCleanTitle(cleanTitle, filename);
    
    // Add the clean title to vlcStatus for use in the activity name
    vlcStatus.cleanTitle = cleanTitle;
    
    return {
      details: cleanTitle, // Show the clean title as the main details line
      state: vlcStatus.mediaType || "Media file", // Show the media type on state line
      largeImageKey: 'vlc',
      largeImageText: cleanTitle || "VLC Media Player",
      smallImageKey: isPlaying ? 'play' : 'pause',
      smallImageText: isPlaying ? 'Watching' : 'Paused',
      startTimestamp: isPlaying ? startTimestamp : undefined,
      endTimestamp: isPlaying ? endTimestamp : undefined,
      buttons: vlcStatus.metadata?.tmdbUrl ? [
        { label: 'View on TMDb', url: vlcStatus.metadata.tmdbUrl }
      ] : undefined
    };
  }
  
  async clearPresence() {
    if (this.connected && this.discordRpc) {
      try {
        // Discord RPC clears activity by setting an empty activity
        await this.discordRpc.setActivity({});
        
        // Reset all tracking variables
        this.lastActivity = null;
        this.lastUpdateTime = 0; // Reset rate limit timer
        
        // Presence cleared
      } catch (error) {
        console.error('Error clearing Discord presence:', error);
        
        // Check if we should attempt reconnection
        if (error.message && (
          error.message.includes('connection closed') || 
          error.message.includes('not connected')
        )) {
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
      
      if (this.connected && this.discordRpc) {
        await this.clearPresence();
        this.discordRpc.destroy();
      }
    } catch (error) {
      console.error('Error disconnecting from Discord:', error);
    } finally {
      this.connected = false;
      this.discordRpc = null;
      this.emit('connectionUpdate', this.getConnectionStatus());
      console.log('Discord RPC disconnected');
    }
  }
  
  /**
   * Extract a clean title from a filename by removing common media naming patterns
   * @param {string} title - The title to clean
   * @param {string} filename - Original filename (optional, for additional context)
   * @returns {string} Cleaned title
   */
  extractCleanTitle(title, filename = '') {
    if (!title) return 'Unknown';
    
    console.log('Cleaning title:', title);
    let cleanTitle = title;
    
    // Remove file extension first
    cleanTitle = cleanTitle.replace(/\.(mkv|mp4|avi|mov|wmv|flv|webm|m4v|mpg|mpeg|ts)$/i, '');
    
    // Remove common release tags and quality indicators
    const patternsToRemove = [
      // Resolution and quality tags
      /\b(720p|1080p|2160p|4K|UHD|HD|HDTV|Full\s*HD)\b/gi,
      
      // Source tags
      /\b(BluRay|Blu-Ray|BRRip|BDRip|WEB-?DL|WebRip|HDRip|DVDRip|DVD-Rip|DVDScr|WEBCap|WEB)\b/gi,
      
      // Streaming service tags
      /\b(NF|AMZN|HMAX|DSNP|HULU|iPlayer|IPLAYER)\b/gi,
      
      // Audio and encoding tags
      /\b(AAC|MP3|AC3|DTS|DD5\.1|DDP5\.1|H\.?264|H\.?265|x\.?264|x\.?265|HEVC|XVID|DivX|Atmos)\b/gi,
      
      // Common file extensions that might remain in the title
      /\b(mkv|mp4|avi|mov|wmv|flv|webm|m4v)\b/gi,
      
      // Release group and scene tags
      /-([A-Za-z0-9._]+)$/i,  // Release group at end (e.g., -RARBG, -YTS)
      /\b(YIFY|YTS|RARBG|EZTV|ETTV|TGx|ION10|NTG|EtHD|CMRG|FLUX)\b/gi,
      
      // Year patterns at the end (when not part of actual title)
      /\s\(?(\d{4})\)?$/i,
      
      // Format and special tags
      /\b(PROPER|REPACK|EXTENDED|Directors\.?Cut|Unrated|DC)\b/gi,
      
      // Any brackets and their content
      /\[[^\]]+\]/g,
      /\([^)]+\)/g,
      /\{[^}]+\}/g,
      
      // Common separators when not part of the actual title
      /\s-\s.*$/,  // Everything after a " - " if it's likely a separator
      
      // Special characters and dots used as separators
      /\./g,      // Replace dots with spaces
    ];
    
    // Apply each pattern
    patternsToRemove.forEach(pattern => {
      cleanTitle = cleanTitle.replace(pattern, ' ');
    });
    
    // Replace remaining separators
    cleanTitle = cleanTitle
      .replace(/_/g, ' ')     // Replace underscores with spaces
      .replace(/-/g, ' ')     // Replace hyphens with spaces
      .replace(/\s{2,}/g, ' ') // Remove multiple spaces
      .trim();                // Remove leading/trailing spaces
    
    // Look for word boundaries to identify actual movie/show title
    // This helps with files like "Title.2020.1080p.WEB-DL.x264" -> "Title"
    
    // Special handling for movies with years in the title that should be preserved
    const knownTitlesWithYears = [
      'Blade Runner 2049',
      '2001 A Space Odyssey',
      '2012',
      '1917',
      '2046',
      '300'
    ];
    
    // Check if the title matches any known title with year
    const matchesKnownTitle = knownTitlesWithYears.some(knownTitle => 
      cleanTitle.toLowerCase().includes(knownTitle.toLowerCase())
    );
    
    if (!matchesKnownTitle) {
      const firstQualityTag = cleanTitle.match(/\b(19\d{2}|20\d{2}|480p|720p|1080p|2160p)\b/i);
      if (firstQualityTag && firstQualityTag.index > 3) {
        cleanTitle = cleanTitle.substring(0, firstQualityTag.index).trim();
      }
    } else {
      // For known titles with years, we keep them intact
      console.log('Found known title with year, preserving:', cleanTitle);
    }
    
    // Handle case where title is just numbers (unlikely to be correct)
    if (/^\d+$/.test(cleanTitle)) {
      // Try to extract something more meaningful
      const possibleTitle = filename.split('.')[0].replace(/[._-]/g, ' ').trim();
      if (possibleTitle && possibleTitle.length > cleanTitle.length) {
        cleanTitle = possibleTitle;
      }
    }
    
    console.log('Cleaned title result:', cleanTitle);
    return cleanTitle;
  }
}
