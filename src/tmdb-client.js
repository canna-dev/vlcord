import fetch from 'node-fetch';
import { retryWithBackoff } from './retry-helper.js';
import { titleOverrides } from './tmdb-overrides.js';
import { tvShowOverrides } from './tv-show-overrides.js';
import { extractTvInfo, enhanceTmdbResult } from './tv-show-helper.js';
import { formatMovieData as fmtMovie, formatTvShowData as fmtTv, formatEpisodeNumber as fmtEpisode, formatRuntime as fmtRuntime } from './tmdb-format.js';
import logger from './logger.js';

/**
 * @typedef {Object} MovieMetadata
 * @property {number} id - TMDb movie ID
 * @property {string} title - Movie title
 * @property {number} year - Release year
 * @property {string} plot - Plot summary
 * @property {string} posterUrl - Poster image URL
 * @property {number} rating - IMDB rating (0-10)
 * @property {string} tmdbUrl - Link to TMDb page
 * @property {Array} credits - Cast and crew
 */

/**
 * @typedef {Object} TVShowMetadata
 * @property {number} id - TMDb show ID
 * @property {string} title - Show title
 * @property {number} season - Season number
 * @property {number} episode - Episode number
 * @property {string} episodeTitle - Episode name
 * @property {string} posterUrl - Show poster URL
 * @property {string} tmdbUrl - Link to TMDb page
 */

/**
 * TMDb API client with caching and retry logic
 */
export class TMDbClient {
  /**
   * @param {string} apiKey - TMDb API key
   */
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.themoviedb.org/3';
    this.imageBaseUrl = 'https://image.tmdb.org/t/p';
    
    // Use the imported title overrides maps
    this.titleOverrides = titleOverrides;
    this.tvShowOverrides = tvShowOverrides;
  }

  /**
   * Update API key at runtime
   * @param {string} apiKey - New TMDb API key
   */
  updateApiKey(apiKey) {
    this.apiKey = apiKey;
  }

  /**
   * Fetch from TMDb API with retry logic
   * @param {string} endpoint - API endpoint path
   * @param {Object} params - Query parameters
   * @returns {Promise<Object>} API response
   */
  async fetchFromApi(endpoint, params = {}) {
    const queryParams = new URLSearchParams({
      api_key: this.apiKey,
      ...params
    });

    const url = `${this.baseUrl}${endpoint}?${queryParams}`;
    
    try {
      const response = await retryWithBackoff(async () => {
        const r = await fetch(url);
        if (!r.ok) {
          const err = new Error(`TMDb API error: ${r.status} ${r.statusText}`);
          err.status = r.status;
          throw err;
        }
        return r;
      }, 3, 500);

      return await response.json();
    } catch (error) {
      logger.error('Error fetching from TMDb:', error.message);
      throw error;
    }
  }

  /**
   * Search for a movie on TMDb
   * @param {string} title - Movie title to search
   * @param {number|null} year - Optional release year
   * @returns {Promise<MovieMetadata|null>} Movie metadata or null if not found
   */
  async searchMovie(title, year = null) {
    try {
      // If year wasn't provided as a parameter, try to extract it from title
      if (!year) {
        // Extract year from title if present (format: "Title 2020" or "Title (2020)")
        const yearMatch = title.match(/\s(19\d{2}|20\d{2})$/) || title.match(/\((\d{4})\)/);
        if (yearMatch) {
          year = yearMatch[1];
          // Clean the title by removing the year
          title = title.replace(/\s(19\d{2}|20\d{2})$/, '').replace(/\(\d{4}\)/, '').trim();
        }
      }
      
      // Check for title overrides first (for special cases like [REC])
      const overrideId = this.checkTitleOverrides(title, year);
      if (overrideId) {
        logger.debug(`Using title override for "${title}" → ID: ${overrideId}`);
        try {
          const movieDetails = await this.fetchFromApi(`/movie/${overrideId}`, {
            append_to_response: 'credits,videos,external_ids'
          });
          return this.formatMovieData(movieDetails);
        } catch (overrideError) {
          logger.error(`Error fetching override movie ${overrideId}:`, overrideError.message);
          // Continue with normal search if override fails
        }
      }
      
      // Clean up the title further for better matching
      const searchTitle = this.cleanupTitleForSearch(title);
      
      // Special handling for bracketed titles like [REC]
      const hasBrackets = title.includes('[') && title.includes(']');
      if (hasBrackets) {
        // Try to extract content from brackets
        const bracketMatch = title.match(/\[([^\]]+)\]/);
          if (bracketMatch) {
          const bracketContent = bracketMatch[1];
          logger.debug(`Found bracketed title: [${bracketContent}], trying direct search`);
          
          // Search with just the bracketed content
          const bracketResults = await this.fetchFromApi('/search/movie', { 
            query: bracketContent,
            include_adult: false
          });
          
            if (bracketResults?.results?.length > 0) {
            logger.debug(`Found match with bracketed content: "${bracketResults.results[0].title}"`);
            const movieId = bracketResults.results[0].id;
            const movieDetails = await this.fetchFromApi(`/movie/${movieId}`, {
              append_to_response: 'credits,videos'
            });
            return this.formatMovieData(movieDetails);
          }
        }
      }
      
      // Normal search process
      // First attempt: Search with both title and year
      let searchResults = null;
      if (year) {
        searchResults = await this.fetchFromApi('/search/movie', { 
          query: searchTitle, 
          year: year,
          include_adult: false
        });
      }
      
      // Second attempt: If no results or very low confidence, try without year constraint
      if (!searchResults?.results?.length || 
          (searchResults.results.length && searchResults.results[0].popularity < 1.0)) {
        searchResults = await this.fetchFromApi('/search/movie', { 
          query: searchTitle,
          include_adult: false
        });
      }
      
      // Third attempt: Try with the first few words of the title
      if (!searchResults?.results?.length) {
        const simplifiedTitle = searchTitle.split(' ').slice(0, 3).join(' ');
        searchResults = await this.fetchFromApi('/search/movie', { 
          query: simplifiedTitle,
          include_adult: false
        });
      }
      
      // Process search results
      if (searchResults?.results?.length > 0) {
        // Get detailed movie information
        const movieId = searchResults.results[0].id;
        const movieDetails = await this.fetchFromApi(`/movie/${movieId}`, {
          append_to_response: 'credits,videos,external_ids'
        });
        
        return this.formatMovieData(movieDetails);
      }
      
      return null;
    } catch (error) {
      logger.error('Error searching movie:', error.message);
      return null;
    }
  }
  
  // Helper method to clean up titles for better TMDb searching
  cleanupTitleForSearch(title) {
    // Special handling for bracketed titles like [REC]
    // If the entire title is in brackets, preserve it
    const bracketMatch = title.match(/^\s*\[([^\]]+)\]\s*$/);
    if (bracketMatch) {
      return bracketMatch[1]; // Return the content inside brackets
    }
    
    // Remove common problematic patterns
    let cleaned = title
      .replace(/\.[a-z0-9]{2,4}$/i, '') // Remove file extension
      .replace(/\b(AVC|MA|DTS|DD|AAC|AC3|REMUX|HEVC|x264|x265)\b/gi, '') // Remove audio/video codecs
      .replace(/\b\d+p\b/gi, '') // Remove resolution (1080p, etc)
      .replace(/\s+-\s+.*$/i, '') // Remove everything after a dash with spaces
      .replace(/\s{2,}/g, ' ') // Replace multiple spaces with a single space
      .trim();
      
    // If title became too short, revert to original but still do basic cleanup
    if (cleaned.length < 3 && title.length > 3) {
      cleaned = title.replace(/\.[a-z0-9]{2,4}$/i, '').trim();
    }
    
    return cleaned;
  }
  
  // Check if a title matches any of our override entries
  checkTitleOverrides(title, year) {
    // Normalize the title for comparison
    const normalizedTitle = title.toLowerCase()
      .replace(/[^\w\s\[\]]/g, '') // Remove special chars except brackets
      .trim();
    
    // Try exact match
    if (this.titleOverrides[normalizedTitle]) {
      console.log(`Found title override match for "${title}" → ID: ${this.titleOverrides[normalizedTitle]}`);
      return this.titleOverrides[normalizedTitle];
    }
    
    // Try with year
    if (year && this.titleOverrides[`${normalizedTitle} ${year}`]) {
      console.log(`Found title+year override match for "${title} ${year}" → ID: ${this.titleOverrides[`${normalizedTitle} ${year}`]}`);
      return this.titleOverrides[`${normalizedTitle} ${year}`];
    }
    
    // Try partial matches for the beginning of titles
    for (const [key, id] of Object.entries(this.titleOverrides)) {
      // Check if normalized title starts with any override key
      if (normalizedTitle.startsWith(key) || key.startsWith(normalizedTitle)) {
        console.log(`Found partial title override match: "${normalizedTitle}" ~ "${key}" → ID: ${id}`);
        return id;
      }
    }
    
    return null;
  }

  /**
   * Search for a TV show on TMDb
   * @param {string} title - Show title to search
   * @param {number|null} season - Optional season number
   * @param {number|null} episode - Optional episode number
   * @param {string} originalFilename - Original filename for additional context
   * @returns {Promise<TVShowMetadata|null>} Show metadata or null if not found
   */
  async searchTvShow(title, season = null, episode = null, originalFilename = '') {
    try {
      // If we have an original filename, try to extract more accurate TV show info
      let extractedTvInfo = { season, episode, episodeTitle: null, showTitle: null };
      
      if (originalFilename) {
        const extractedInfo = extractTvInfo(originalFilename);
        
        // Use extracted info if available
        if (extractedInfo.showTitle) {
          title = extractedInfo.showTitle;
        }
        
        // If we have season/episode from filename but not from params, use the extracted ones
        if (extractedInfo.season !== null && season === null) {
          season = extractedInfo.season;
        }
        
        if (extractedInfo.episode !== null && episode === null) {
          episode = extractedInfo.episode;
        }
        
        // Save for later use
        extractedTvInfo = extractedInfo;
      }
      
      // Clean up the title for better matching
      const searchTitle = this.cleanupTitleForSearch(title);
      // Check for TV show override first
      const normalizedTitle = searchTitle.toLowerCase().trim();
      if (this.tvShowOverrides && this.tvShowOverrides[normalizedTitle]) {
        const overrideId = this.tvShowOverrides[normalizedTitle];
        try {
          // Get show details using the override ID
          const showDetails = await this.fetchFromApi(`/tv/${overrideId}`, { append_to_response: 'external_ids' });
          
          // If season and episode are provided, get episode details
          let episodeDetails = null;
          if (season !== null && episode !== null) {
              try {
              episodeDetails = await this.fetchFromApi(
                `/tv/${overrideId}/season/${season}/episode/${episode}`
              );
              logger.debug(`Found episode details for S${season}E${episode}: "${episodeDetails.name}"`);
            } catch (error) {
              logger.warn(`Episode details not found for ${title} S${season}E${episode}`);
            }
          }
          
          // Format the TV show data with enhanced episode info
          const result = this.formatTvShowData(showDetails, episodeDetails, season, episode);
          
          // Enhance with any additional info from filename
          return enhanceTmdbResult(result, extractedTvInfo);
        } catch (error) {
          logger.error(`Error fetching TV show details for override ID ${overrideId}:`, error);
          // Fall back to standard search
        }
      }
      
      // Search for the TV show with cleaned title
      const searchResults = await this.fetchFromApi('/search/tv', { 
        query: searchTitle,
        include_adult: false
      });
      
      // If no results, try alternate search strategies
      let finalResults = searchResults;
      if (!searchResults?.results?.length) {
        // Strategy 1: Try with the first word only (often the show name)
        if (searchTitle.includes(' ')) {
          const showNameOnly = searchTitle.split(' ')[0];
          finalResults = await this.fetchFromApi('/search/tv', { 
            query: showNameOnly,
            include_adult: false
          });
          
          // If that didn't work, try with first two words
            if (!finalResults?.results?.length && searchTitle.split(' ').length > 2) {
            const firstTwoWords = searchTitle.split(' ').slice(0, 2).join(' ');
            
            finalResults = await this.fetchFromApi('/search/tv', { 
              query: firstTwoWords,
              include_adult: false
            });
          }
        }
        
        // Strategy 2: Try without articles (the, a, an) at the beginning
        if (!finalResults?.results?.length) {
          const withoutArticle = searchTitle.replace(/^(the|a|an)\s+/i, '');
          if (withoutArticle !== searchTitle) {
            finalResults = await this.fetchFromApi('/search/tv', { 
              query: withoutArticle,
              include_adult: false
            });
          }
        }
      }
      
      if (finalResults?.results?.length > 0) {
        const showId = finalResults.results[0].id;
        
        // Get basic show details
        const showDetails = await this.fetchFromApi(`/tv/${showId}`, { append_to_response: 'external_ids' });
        
        // If season and episode are provided, get episode details
        let episodeDetails = null;
        if (season !== null && episode !== null) {
            try {
            episodeDetails = await this.fetchFromApi(
              `/tv/${showId}/season/${season}/episode/${episode}`
            );
            logger.debug(`Found episode details for S${season}E${episode}: "${episodeDetails.name}"`);
          } catch (error) {
            logger.warn(`Episode details not found for ${title} S${season}E${episode}`);
          }
        }
        
        // Format the TV show data with enhanced episode info
        const result = this.formatTvShowData(showDetails, episodeDetails, season, episode);
        
        // Enhance with any additional info from filename
        return enhanceTmdbResult(result, extractedTvInfo);
      }
      
      return null;
    } catch (error) {
      logger.error('Error searching TV show:', error.message);
      return null;
    }
  }

  async searchGeneric(title) {
    try {
      // Check for title overrides first (for special cases like [REC])
      const overrideId = this.checkTitleOverrides(title);
      if (overrideId) {
        try {
          const movieDetails = await this.fetchFromApi(`/movie/${overrideId}`, {
            append_to_response: 'credits,videos'
          });
          return this.formatMovieData(movieDetails);
        } catch (overrideError) {
          logger.error(`Error fetching override movie ${overrideId}:`, overrideError.message);
          // Continue with normal search if override fails
        }
      }
      
      // Special handling for bracketed titles like [REC]
      if (title.includes('[') && title.includes(']')) {
        const bracketMatch = title.match(/\[([^\]]+)\]/);
        if (bracketMatch) {
          const bracketContent = bracketMatch[1];
          console.log(`Found bracketed title in generic search: [${bracketContent}]`);
          
          // Search with just the bracketed content
          const bracketResults = await this.fetchFromApi('/search/movie', { 
            query: bracketContent,
            include_adult: false
          });
          
          if (bracketResults?.results?.length > 0) {
            logger.debug(`Found movie match with bracketed content: "${bracketResults.results[0].title}"`);
            const movieId = bracketResults.results[0].id;
            const movieDetails = await this.fetchFromApi(`/movie/${movieId}`, {
              append_to_response: 'credits,videos'
            });
            return this.formatMovieData(movieDetails);
          }
        }
      }
      
      // Clean up the title for better searching
      const cleanedTitle = this.cleanupTitleForSearch(title);
      
      // Extract year if present
      const yearMatch = cleanedTitle.match(/\s(19\d{2}|20\d{2})$/) || cleanedTitle.match(/\((\d{4})\)/);
      let year = null;
      let searchTitle = cleanedTitle;
      
      if (yearMatch) {
        year = yearMatch[1];
        searchTitle = cleanedTitle.replace(/\s(19\d{2}|20\d{2})$/, '').replace(/\(\d{4}\)/, '').trim();
      }
      
      // Try movie first with year constraint if available
      let movieResults = null;
      if (year) {
        movieResults = await this.fetchFromApi('/search/movie', { 
          query: searchTitle, 
          year: year,
          include_adult: false 
        });
      } else {
        movieResults = await this.fetchFromApi('/search/movie', { 
          query: searchTitle,
          include_adult: false
        });
      }
      
      // If movie results are good, use them
      if (movieResults?.results?.length > 0) {
        return this.searchMovie(searchTitle, year);
      }
      
      // Try TV show
      const tvResults = await this.fetchFromApi('/search/tv', { 
        query: searchTitle,
        include_adult: false
      });
      
      if (tvResults?.results?.length > 0) {
        return this.searchTvShow(searchTitle);
      }
      
      // Try one more time with simplified title (first few words only)
      if (searchTitle.includes(' ')) {
        const simplifiedTitle = searchTitle.split(' ').slice(0, 2).join(' ');
        // Try movie
        const simpleMovieResults = await this.fetchFromApi('/search/movie', { 
          query: simplifiedTitle,
          include_adult: false
        });
        
        if (simpleMovieResults?.results?.length > 0) {
          return this.searchMovie(simplifiedTitle);
        }
        
        // Try TV
        const simpleTvResults = await this.fetchFromApi('/search/tv', { 
          query: simplifiedTitle,
          include_adult: false 
        });
        
        if (simpleTvResults?.results?.length > 0) {
          return this.searchTvShow(simplifiedTitle);
        }
      }
      
      return null;
    } catch (error) {
      logger.error('Error with generic search:', error.message);
      return null;
    }
  }

  formatMovieData(movie) {
    return fmtMovie(movie, this.imageBaseUrl);
  }

  formatTvShowData(show, episode = null, seasonNumber = null, episodeNumber = null) {
    return fmtTv(show, episode, seasonNumber, episodeNumber, this.imageBaseUrl);
  }
  
  /**
   * Format season and episode numbers into a standard string
   * @param {number} season - The season number
   * @param {number} episode - The episode number
   * @returns {string} - Formatted episode info
   */
  formatEpisodeNumber(season, episode) {
    return fmtEpisode(season, episode);
  }

  formatRuntime(minutes) {
    return fmtRuntime(minutes);
  }
}
