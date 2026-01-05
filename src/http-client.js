/**
 * Enhanced axios instances with timeout, circuit breaker, retry logic
 */

import axios from 'axios';
import { circuitBreakerManager } from './circuit-breaker.js';
import { retryWithExponentialBackoff } from './graceful-degradation.js';
import logger from './logger.js';

/**
 * Create configured axios instance with timeout and error handling
 */
function createAxiosInstance(name, timeout = 10000) {
  const instance = axios.create({
    timeout,
    headers: {
      'User-Agent': 'VLCord/1.0'
    }
  });

  // Add response interceptor for error logging
  instance.interceptors.response.use(
    response => response,
    error => {
      logger.debug(`Request failed: ${name}`, 'axios', {
        status: error.response?.status,
        message: error.message
      });
      throw error;
    }
  );

  return instance;
}

/**
 * VLC poller with circuit breaker
 */
export const vlcClient = createAxiosInstance('vlc', 15000);
export const vlcBreaker = circuitBreakerManager.create('vlc', {
  failureThreshold: 5,
  resetTimeout: 60000
});

/**
 * TMDb API client with circuit breaker
 */
export const tmdbClient = createAxiosInstance('tmdb', 10000);
export const tmdbBreaker = circuitBreakerManager.create('tmdb', {
  failureThreshold: 10,
  resetTimeout: 120000
});

/**
 * Discord client with circuit breaker
 */
export const discordBreaker = circuitBreakerManager.create('discord', {
  failureThreshold: 3,
  resetTimeout: 30000
});

/**
 * Wrap function with circuit breaker and retry logic
 */
export async function executeWithProtection(breaker, fn, options = {}) {
  const {
    maxRetries = 3,
    initialDelayMs = 1000,
    maxDelayMs = 10000
  } = options;

  return breaker.execute(() => 
    retryWithExponentialBackoff(
      fn,
      maxRetries,
      initialDelayMs,
      maxDelayMs
    )
  );
}
