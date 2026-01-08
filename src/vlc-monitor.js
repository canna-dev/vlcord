import { EventEmitter } from 'events';
import { TMDbClient } from './tmdb-client.js';
import * as animeHandler from './anime-titles.js';
import { LRUCache } from 'lru-cache';
import VLCPoller from './vlc-poller.js';
import { parseVLCStatus, extractMetadataLookupInfo } from './vlc-parser.js';
import { enhanceTmdbResult } from './tv-show-helper.js';
import logger from './logger.js';
import { vlcBreaker, executeWithProtection } from './http-client.js';
import { metadataDb } from './metadata-overrides-db.js';

/**
 * @typedef {Object} VLCStatus
 * @property {boolean} connected - Is VLC connected
 * @property {boolean} playing - Is media playing
 * @property {boolean} paused - Is media paused
 * @property {string} title - Current media title
 * @property {number} position - Current position in seconds
 * @property {number} length - Total length in seconds
 * @property {number} elapsed - Elapsed time in seconds
 * @property {number} remaining - Remaining time in seconds
 * @property {number} percentage - Progress percentage (0-100)
 * @property {Object} metadata - Fetched metadata from TMDb
 * @property {Date} lastUpdated - Last update timestamp
 */

/**
 * VLC Media Monitor
 * Polls VLC HTTP interface and fetches metadata from TMDb
 */
export class VLCMonitor extends EventEmitter {
  /**
   * @param {Object} config - Configuration
   * @param {string} config.host - VLC host
   * @param {number} config.port - VLC port
   * @param {string} config.password - VLC password
   * @param {string} config.tmdbApiKey - TMDb API key
   * @param {number} config.pollingInterval - Poll interval in ms (default 1000)
   * @param {number} config.cacheTTL - Cache TTL in ms (default 24h)
   * @param {number} config.cacheMaxEntries - Max cache entries (default 500)
   */
  constructor(config) {
    super();
    this.config = config;
    this.poller = new VLCPoller(config);
    this.currentStatus = {
      connected: false,
      playing: false,
      paused: false,
      title: null,
      originalTitle: null,
      position: 0,
      length: 0,
      elapsed: 0,
      remaining: 0,
      percentage: 0,
      mediaType: null,
      metadata: null,
      lastUpdated: Date.now(),
    };
    this.interval = null;
    this._inFlight = false;
    this.cacheTTL = (config.cacheTTL && Number(config.cacheTTL)) || 24 * 60 * 60 * 1000;
    this.tmdbClient = new TMDbClient(config.tmdbApiKey);
    this.lastMetadataLookup = '';
    this.metadataCache = new LRUCache({
      max: config.cacheMaxEntries || 500,
      ttl: this.cacheTTL,
    });
    this.lastLoggedConnected = false; // Track to avoid repeating connection logs
    this.isPaused = false; // Allow pausing monitoring without stopping VLC
  }

  updateConfig(config) {
    this.config = { ...this.config, ...config };
    this.tmdbClient.updateApiKey(config.tmdbApiKey);
    
    // Restart monitoring with new config
    this.stop();
    this.start();
  }

  /**
   * Start monitoring VLC
   */
  start() {
    if (this.interval) {
      clearTimeout(this.interval);
    }

    // Use non-overlapping polling loop via setTimeout to avoid concurrent polls
    const schedule = () => {
      this.interval = setTimeout(async () => {
        try {
          await this.pollVLC();
        } catch (e) {
          // swallow - pollVLC logs errors
        } finally {
          schedule();
        }
      }, this.config.pollingInterval);
    };

    logger.info(`VLC monitor started, polling every ${this.config.pollingInterval}ms`);
    // Start loop
    schedule();
    // Initial immediate poll
    this.pollVLC().catch(() => {});
  }

  /**
   * Stop monitoring
   */
  stop() {
    if (this.interval) {
      clearTimeout(this.interval);
      this.interval = null;
      
      // Update status to disconnected
      this.currentStatus.connected = false;
      this.emit('statusUpdate', this.getCurrentStatus());
      
      logger.info('VLC monitor stopped');
    }
  }

  /**
   * Get current VLC status
   * @returns {VLCStatus} Current status
   */
  getCurrentStatus() {
    return { ...this.currentStatus };
  }

  async pollVLC() {
    if (this._inFlight) return; // prevent overlap
    if (this.isPaused) return; // Skip poll if paused
    this._inFlight = true;
    try {
      const vlcData = await this.poller.fetchStatus();
      const wasConnected = this.currentStatus.connected;

      // Parse VLC status into standardized format
      const parsed = parseVLCStatus(vlcData);
      Object.assign(this.currentStatus, parsed);
      this.currentStatus.lastUpdated = Date.now();

      // If media stopped, clear metadata
      if (vlcData.state === 'stopped') {
        this.currentStatus.metadata = null;
        this.lastMetadataLookup = '';
      } else if (this.currentStatus.title) {
        // Fetch metadata for new titles
        const titleForLookup = this.currentStatus.title;
        if (titleForLookup !== this.lastMetadataLookup && this.currentStatus.playing) {
          this.lastMetadataLookup = titleForLookup;

          if (this.metadataCache.has(titleForLookup)) {
            this.currentStatus.metadata = this.metadataCache.get(titleForLookup);
          } else {
            try {
              const lookupInfo = extractMetadataLookupInfo(parsed);
              const metadata = await this.fetchMetadata(lookupInfo);
              if (metadata) {
                this.currentStatus.metadata = metadata;
                this.metadataCache.set(titleForLookup, metadata);
              }
            } catch (error) {
              console.error('Error fetching metadata:', error.message);
            }
          }
        }
        
        // Merge season/episode info from parsed status into metadata
        if (this.currentStatus.metadata && parsed.season !== undefined) {
          this.currentStatus.metadata.seasonNumber = parsed.season;
        }
        if (this.currentStatus.metadata && parsed.episode !== undefined) {
          this.currentStatus.metadata.episodeNumber = parsed.episode;
        }
        if (this.currentStatus.metadata && parsed.episodeTitle) {
          this.currentStatus.metadata.episodeTitle = parsed.episodeTitle;
        }
      }

      // Emit status update event
      this.emit('statusUpdate', this.getCurrentStatus());

      // Log connection state changes only once
      if (!this.lastLoggedConnected && this.currentStatus.connected) {
        logger.info('VLC connection established');
        this.lastLoggedConnected = true;
      }
    } catch (error) {
      // If we were previously connected, log the disconnect
      if (this.currentStatus.connected) {
        logger.error('VLC connection lost:', error.message);
        this.lastLoggedConnected = false;
        this.currentStatus.connected = false;
        this.currentStatus.playing = false;
        this.currentStatus.paused = false;
        this.emit('statusUpdate', this.getCurrentStatus());
      } else {
        // More detailed error messages for connection issues
        if (error.code === 'ECONNREFUSED') {
          logger.error(
            'VLC connection refused: Make sure VLC is running and the HTTP interface is enabled.'
          );
          logger.error('Run "npm run test-vlc" for a detailed connection diagnostic.');
        } else if (error.response && error.response.status === 401) {
          logger.error('VLC authentication failed: Check your password in .env file.');
          logger.error(
            'VLC password should match the value in Tools > Preferences > Interface > Main interfaces > Lua > Lua HTTP password'
          );
        } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
          logger.error('VLC connection timed out: VLC might be running but not responding.');
        } else {
          logger.error('VLC connection error:', error.message);
        }
      }
    } finally {
      this._inFlight = false;
    }
  }
  
  /**
   * Fetch metadata from TMDb for a title
   * @param {Object} lookupInfo - Lookup information
   * @param {string} lookupInfo.title - Media title
   * @param {string} lookupInfo.mediaType - 'movie', 'tv', 'anime', etc
   * @param {number} lookupInfo.year - Release year (optional)
   * @param {number} lookupInfo.season - Season number (optional)
   * @param {number} lookupInfo.episode - Episode number (optional)
   * @returns {Promise<Object|null>} Metadata or null if not found
   */
  async fetchMetadata(lookupInfo) {
    try {
      let metadata = null;
      const { mediaType, title, year, season, episode, episodeTitle } = lookupInfo;

      if (mediaType === 'movie') {
        metadata = await this.tmdbClient.searchMovie(title, year);
      } else if (mediaType === 'tv') {
        metadata = await this.tmdbClient.searchTvShow(title, season, episode);

        // Enhance with season/episode information
        if (metadata && season !== null && episode !== null) {
          metadata = enhanceTmdbResult(metadata, {
            season,
            episode,
            episodeTitle
          });
        }
      } else if (mediaType === 'anime') {
        // First try TV show search if we have season/episode
        if (season !== null && episode !== null) {
          metadata = await this.tmdbClient.searchTvShow(title, season, episode);
        } else {
          // Fall back to movie search
          metadata = await this.tmdbClient.searchMovie(title, year);
        }

        // Apply anime formatting
        if (metadata) {
          metadata = animeHandler.formatAnimeTitle(metadata);
        }
      } else {
        // Generic search
        metadata = await this.tmdbClient.searchGeneric(title);
      }

      return metadata;
    } catch (error) {
      logger.error('Error fetching metadata:', error.message);
      return null;
    }
  }
}
