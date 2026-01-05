/**
 * Graceful degradation system
 * Buffers and retries Discord presence updates when service is unavailable
 */

export class PresenceBuffer {
  constructor(maxSize = 50) {
    this.buffer = [];
    this.maxSize = maxSize;
    this.isProcessing = false;
  }

  /**
   * Add activity to buffer (enqueue for later retry)
   */
  add(activity) {
    if (this.buffer.length >= this.maxSize) {
      // Remove oldest when buffer is full
      this.buffer.shift();
    }

    this.buffer.push({
      activity,
      addedAt: Date.now(),
      retryCount: 0
    });

    return this.buffer.length;
  }

  /**
   * Get next activity to retry
   */
  getNext() {
    if (this.buffer.length === 0) return null;
    return this.buffer[0];
  }

  /**
   * Mark activity as successfully sent (remove from buffer)
   */
  markSent() {
    this.buffer.shift();
  }

  /**
   * Increment retry count for current activity
   */
  incrementRetry() {
    if (this.buffer.length > 0) {
      this.buffer[0].retryCount++;
    }
  }

  /**
   * Check if activity is stale (older than max age)
   */
  isStale(maxAgeMs = 300000) { // 5 minutes default
    if (this.buffer.length === 0) return false;
    return Date.now() - this.buffer[0].addedAt > maxAgeMs;
  }

  /**
   * Clear buffer
   */
  clear() {
    this.buffer = [];
  }

  /**
   * Get buffer status
   */
  getStatus() {
    return {
      size: this.buffer.length,
      maxSize: this.maxSize,
      isProcessing: this.isProcessing,
      items: this.buffer.map(item => ({
        age: Date.now() - item.addedAt,
        retryCount: item.retryCount
      }))
    };
  }
}

/**
 * Basic activity when metadata unavailable
 */
export function createFallbackActivity(title = 'Media file') {
  return {
    details: title,
    state: 'Watching...',
    assets: {
      large_image: 'vlc',
      large_text: 'VLC Media Player'
    },
    timestamps: {}
  };
}

/**
 * Retry strategy with exponential backoff and jitter
 */
export async function retryWithExponentialBackoff(
  fn,
  maxRetries = 5,
  initialDelayMs = 1000,
  maxDelayMs = 30000
) {
  let lastError;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (attempt === maxRetries - 1) break; // Don't delay after last attempt

      // Calculate delay with exponential backoff and jitter
      const exponentialDelay = Math.min(
        initialDelayMs * Math.pow(2, attempt),
        maxDelayMs
      );

      // Add random jitter (±10% of delay)
      const jitter = exponentialDelay * (0.9 + Math.random() * 0.2);
      const actualDelay = Math.floor(jitter);

      await new Promise(resolve => setTimeout(resolve, actualDelay));
    }
  }

  throw lastError;
}
