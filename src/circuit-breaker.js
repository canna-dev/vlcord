/**
 * Circuit Breaker pattern implementation
 * Prevents cascading failures by stopping requests to failing services
 */

export class CircuitBreaker {
  constructor(name, options = {}) {
    this.name = name;
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 60000; // 60 seconds
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.nextAttempt = null;
  }

  async execute(fn) {
    // If open, check if we should try half-open
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttempt) {
        throw new Error(`Circuit breaker "${this.name}" is OPEN. Retry after ${new Date(this.nextAttempt).toISOString()}`);
      }
      this.state = 'HALF_OPEN';
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess() {
    this.failureCount = 0;

    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= 2) {
        this.state = 'CLOSED';
        this.successCount = 0;
      }
    }
  }

  onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    this.successCount = 0;

    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      this.nextAttempt = Date.now() + this.resetTimeout;
    }
  }

  getState() {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
      nextAttemptAt: this.nextAttempt
    };
  }
}

/**
 * Circuit Breaker Manager - manage multiple breakers
 */
export class CircuitBreakerManager {
  constructor() {
    this.breakers = new Map();
  }

  create(name, options) {
    const breaker = new CircuitBreaker(name, options);
    this.breakers.set(name, breaker);
    return breaker;
  }

  get(name) {
    return this.breakers.get(name);
  }

  getAll() {
    return Array.from(this.breakers.values());
  }

  getStates() {
    return this.getAll().map(b => b.getState());
  }
}

// Global instance
export const circuitBreakerManager = new CircuitBreakerManager();
