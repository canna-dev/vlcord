import axios from 'axios';
import { EventEmitter } from 'events';
import cleanTitle from './title-cleaner.js'; // Using the new pattern-based cleaner
import { isTvShow, extractTvInfo, enhanceTmdbResult } from './tv-show-helper.js';
import { TMDbClient } from './tmdb-client.js';
import * as animeHandler from './anime-titles.js';

export class VLCMonitor extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.currentStatus = {
      connected: false,
      playing: false,
      paused: false,
      title: null,
      originalTitle: null,  // Store the original filename
      position: 0,
      length: 0,
      elapsed: 0,
      remaining: 0,
      percentage: 0,
      mediaType: null,
      metadata: null,
      lastUpdated: Date.now()
    };
    this.interval = null;
    this.tmdbClient = new TMDbClient(config.tmdbApiKey);
    this.lastMetadataLookup = '';
    this.metadataCache = new Map();
  }

  updateConfig(config) {
    this.config = { ...this.config, ...config };
    this.tmdbClient.updateApiKey(config.tmdbApiKey);
    
    // Restart monitoring with new config
    this.stop();
    this.start();
  }

  start() {
    if (this.interval) {
      clearInterval(this.interval);
    }
    
    this.interval = setInterval(() => this.pollVLC(), this.config.pollingInterval);
    console.log(`VLC monitor started, polling every ${this.config.pollingInterval}ms`);
    
    // Poll immediately on start
    this.pollVLC();
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      
      // Update status to disconnected
      this.currentStatus.connected = false;
      this.emit('statusUpdate', this.getCurrentStatus());
      
      console.log('VLC monitor stopped');
    }
  }

  getCurrentStatus() {
    return { ...this.currentStatus };
  }

  async pollVLC() {
    try {
      const response = await axios.get(
        `http://${this.config.host}:${this.config.port}/requests/status.json`,
        {
          auth: {
            username: '',
            password: this.config.password
          },
          timeout: 2000 // 2 second timeout
        }
      );
      
      // Process VLC status data
      const vlcData = response.data;
      const wasConnected = this.currentStatus.connected;
      
      this.currentStatus.connected = true;
      this.currentStatus.playing = vlcData.state === 'playing';
      this.currentStatus.paused = vlcData.state === 'paused';
      this.currentStatus.position = vlcData.position;
      this.currentStatus.length = vlcData.length;
      this.currentStatus.elapsed = Math.floor(vlcData.time);
      this.currentStatus.remaining = Math.floor(vlcData.length - vlcData.time);
      this.currentStatus.percentage = Math.floor(vlcData.position * 100);
      this.currentStatus.lastUpdated = Date.now();
      
      // Extract media information
      let mediaTitle = '';
      let filename = '';
      let filePath = '';
      
      if (vlcData.information && vlcData.information.category && vlcData.information.category.meta) {
        const meta = vlcData.information.category.meta;
        
        // Collect all possible title sources
        const possibleTitles = [];
        
        // Try to get title from metadata
        if (meta.title) {
          possibleTitles.push(meta.title);
        }
        
        // Get filename and filepath for better title extraction
        if (meta.filename) {
          filename = meta.filename;
          possibleTitles.push(filename);
        }
        
        if (meta.filepath || meta.url) {
          filePath = meta.filepath || meta.url;
          // Extract filename from path
          const pathFilename = filePath.split(/[\\/]/).pop();
          if (pathFilename) {
            possibleTitles.push(pathFilename);
          }
        }
        
        // Choose the best title source (prioritize actual title over filename)
        mediaTitle = possibleTitles[0] || '';
      }
      
      // If no media is playing or title is empty
      if (!mediaTitle || vlcData.state === 'stopped') {
        this.currentStatus.title = null;
        this.currentStatus.originalTitle = null;
        this.currentStatus.mediaType = null;
        this.currentStatus.metadata = null;
      } else {
        // Collect all possible title sources for best detection
        const possibleTitles = [mediaTitle];
        if (filename) possibleTitles.push(filename);
        
        // Store the original filename for Discord preview matching
        this.currentStatus.originalTitle = filename || mediaTitle;
        if (filePath) {
          const fileNameFromPath = filePath.split(/[\\/]/).pop();
          if (fileNameFromPath) possibleTitles.push(fileNameFromPath);
          
          // Try parent folder as a possible source for TV show name
          const pathParts = filePath.split(/[\\/]/);
          if (pathParts.length > 2) {
            // Folder name might contain show name
            possibleTitles.push(pathParts[pathParts.length - 2]);
          }
        }
        
        // Use all possible titles to determine media type
        let mediaType = 'unknown';
        for (const title of possibleTitles) {
          // Use the enhanced TV show detection and isTvShow function
          if (isTvShow(title)) {
            mediaType = 'tv';
            break;
          } else if (title.toLowerCase().includes('anime') || 
                    /\[(?:subsplease|erai-raws|horriblesubs|judas|mtbb)\]/i.test(title)) {
            mediaType = 'anime';
            break;
          }
        }
        
        // If no media type detected yet, use the cleanTitle function to detect
        if (mediaType === 'unknown') {
          for (const title of possibleTitles) {
            const cleanInfo = cleanTitle(title);
            if (cleanInfo && cleanInfo.type) {
              mediaType = cleanInfo.type;
              break;
            }
          }
        }
        
        this.currentStatus.mediaType = mediaType || 'movie';  // Default to movie if still unknown
        
        // Clean the title based on media type using the enhanced cleaner
        let titleForLookup;
        let cleanInfo = null;
        
        // First try the best filename with most information
        for (const title of possibleTitles) {
          cleanInfo = cleanTitle(title);
          if (cleanInfo && cleanInfo.title && cleanInfo.title !== 'Unknown') {
            break;
          }
        }
        
        // If we couldn't get good info, fall back to the first title
        if (!cleanInfo || !cleanInfo.title || cleanInfo.title === 'Unknown') {
          cleanInfo = cleanTitle(mediaTitle);
        }
        
        // Set the title and other info based on media type
        if (mediaType === 'tv' || cleanInfo.type === 'tv') {
          // Use showTitle for TV shows
          titleForLookup = cleanInfo.showTitle || cleanInfo.title;
          this.currentStatus.title = titleForLookup;
          
          if (cleanInfo.season !== null && cleanInfo.episode !== null) {
            // Found TV show with season/episode info
            
            // Add season/episode info to status
            this.currentStatus.season = cleanInfo.season;
            this.currentStatus.episode = cleanInfo.episode;
            this.currentStatus.episodeTitle = cleanInfo.episodeTitle;
          } else {
            // Found TV show
          }
        } else if (mediaType === 'anime' || cleanInfo.type === 'anime') {
          // Use title for anime
          titleForLookup = cleanInfo.title;
          this.currentStatus.title = titleForLookup;
          
          if (cleanInfo.season !== null && cleanInfo.episode !== null) {
            // Found anime with season/episode info
            
            // Add season/episode info to status
            this.currentStatus.season = cleanInfo.season;
            this.currentStatus.episode = cleanInfo.episode;
            this.currentStatus.episodeTitle = cleanInfo.episodeTitle;
          } else {
            // Found anime
          }
        } else {
          // Default to movie
          titleForLookup = cleanInfo.title;
          this.currentStatus.title = titleForLookup;
          
          if (cleanInfo.year) {
            // Found movie with year
            this.currentStatus.year = cleanInfo.year;
          } else {
            // Found movie
          }
        }
        
        // If we have a new title, fetch metadata from TMDb
        if (titleForLookup !== this.lastMetadataLookup && this.currentStatus.playing) {
          this.lastMetadataLookup = titleForLookup;
          
          // Check cache first
          if (this.metadataCache.has(titleForLookup)) {
            // Using cached metadata
            this.currentStatus.metadata = this.metadataCache.get(titleForLookup);
          } else {
            try {
              // Fetching new metadata
              const metadata = await this.fetchMetadata(mediaTitle, mediaType);
              if (metadata) {
                this.currentStatus.metadata = metadata;
                this.metadataCache.set(titleForLookup, metadata);
              }
            } catch (error) {
              console.error('Error fetching metadata:', error.message);
            }
          }
        }
      }
      
      // Emit status update event
      this.emit('statusUpdate', this.getCurrentStatus());
      
      // Log connection established
      if (!wasConnected) {
        console.log('VLC connection established');
      }
      
    } catch (error) {
      // If we were previously connected, log the disconnect
      if (this.currentStatus.connected) {
        console.error('VLC connection lost:', error.message);
        this.currentStatus.connected = false;
        this.currentStatus.playing = false;
        this.currentStatus.paused = false;
        this.emit('statusUpdate', this.getCurrentStatus());
      } else {
        // More detailed error messages for connection issues
        if (error.code === 'ECONNREFUSED') {
          console.error('VLC connection refused: Make sure VLC is running and the HTTP interface is enabled.');
          console.error('Run "npm run test-vlc" for a detailed connection diagnostic.');
        } else if (error.response && error.response.status === 401) {
          console.error('VLC authentication failed: Check your password in .env file.');
          console.error('VLC password should match the value in Tools > Preferences > Interface > Main interfaces > Lua > Lua HTTP password');
        } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
          console.error('VLC connection timed out: VLC might be running but not responding.');
        } else {
          console.error('VLC connection error:', error.message);
        }
      }
    }
  }
  
  async fetchMetadata(title, mediaType) {
    try {
      let metadata = null;
      
      // Use the enhanced title cleaner
      const cleanInfo = cleanTitle(title);
      
      if (mediaType === 'movie' || cleanInfo.type === 'movie') {
        // Movie lookup
        // Looking up movie
        metadata = await this.tmdbClient.searchMovie(cleanInfo.title, cleanInfo.year);
      } else if (mediaType === 'tv' || cleanInfo.type === 'tv') {
        // TV show lookup with enhanced TV show support
        // Looking up TV show
        
        // Get metadata from TMDb with original filename for better extraction
        metadata = await this.tmdbClient.searchTvShow(
          cleanInfo.showTitle || cleanInfo.title,
          cleanInfo.season,
          cleanInfo.episode,
          title // Pass original filename for enhanced extraction
        );
        
        // Use the enhanced TV show information
        if (metadata && cleanInfo.season !== null && cleanInfo.episode !== null) {
          metadata = enhanceTmdbResult(metadata, {
            season: cleanInfo.season,
            episode: cleanInfo.episode,
            episodeTitle: cleanInfo.episodeTitle
          });
        }
      } else if (mediaType === 'anime' || cleanInfo.type === 'anime') {
        // Anime lookup
        // Looking up anime
        
        // First try TV show search
        if (cleanInfo.season !== null && cleanInfo.episode !== null) {
          metadata = await this.tmdbClient.searchTvShow(
            cleanInfo.showTitle || cleanInfo.title,
            cleanInfo.season,
            cleanInfo.episode,
            title
          );
        } else {
          // Fall back to movie search for anime films
          metadata = await this.tmdbClient.searchMovie(cleanInfo.title, cleanInfo.year);
        }
        
        // Apply anime formatting if applicable
        if (metadata) {
          console.log(`Applying anime formatting to "${metadata.title}"`);
          metadata = animeHandler.formatAnimeTitle(metadata);
        }
      } else {
        // Generic search as fallback
        console.log(`Generic media lookup for: "${cleanInfo.title}"`);
        metadata = await this.tmdbClient.searchGeneric(cleanInfo.title);
      }
      
      if (metadata) {
        // Found metadata
        // No metadata found
      }
      
      return metadata;
    } catch (error) {
      console.error('Error fetching metadata:', error.message);
      return null;
    }
  }
}
