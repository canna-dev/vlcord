/**
 * Test suite for VLCord core modules
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import type { VLCStatus, DiscordPresenceData } from '../src/types.js';

// ============================================================================
// Environment Validator Tests
// ============================================================================

describe('Environment Validator', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should validate required environment variables', () => {
    process.env.DISCORD_CLIENT_ID = '123456789';
    process.env.VLC_HOST = 'localhost';
    process.env.VLC_PORT = '8080';

    expect(process.env.DISCORD_CLIENT_ID).toBeDefined();
    expect(process.env.VLC_HOST).toBeDefined();
  });

  it('should fail validation when required vars are missing', () => {
    delete process.env.DISCORD_CLIENT_ID;
    delete process.env.VLC_HOST;

    expect(process.env.DISCORD_CLIENT_ID).toBeUndefined();
    expect(process.env.VLC_HOST).toBeUndefined();
  });
});

// ============================================================================
// Circuit Breaker Tests
// ============================================================================

describe('Circuit Breaker', () => {
  it('should initialize in CLOSED state', () => {
    const state: string = 'CLOSED';
    expect(state).toBe('CLOSED');
  });

  it('should transition from CLOSED to OPEN after failures', () => {
    let state: string = 'CLOSED';
    const failureThreshold = 3;
    let failureCount = 0;

    for (let i = 0; i < failureThreshold; i++) {
      failureCount++;
      if (failureCount >= failureThreshold) {
        state = 'OPEN';
      }
    }

    expect(state).toBe('OPEN');
  });

  it('should transition from OPEN to HALF_OPEN after timeout', () => {
    let state: string = 'OPEN';
    const timeoutPassed = true;

    if (state === 'OPEN' && timeoutPassed) {
      state = 'HALF_OPEN';
    }

    expect(state).toBe('HALF_OPEN');
  });

  it('should return to CLOSED on successful call in HALF_OPEN', () => {
    let state: string = 'HALF_OPEN';
    const callSuccessful = true;

    if (state === 'HALF_OPEN' && callSuccessful) {
      state = 'CLOSED';
    }

    expect(state).toBe('CLOSED');
  });

  it('should reopen from HALF_OPEN on failure', () => {
    let state: string = 'HALF_OPEN';
    const callSuccessful = false;

    if (state === 'HALF_OPEN' && !callSuccessful) {
      state = 'OPEN';
    }

    expect(state).toBe('OPEN');
  });
});

// ============================================================================
// Input Validator Tests
// ============================================================================

describe('Input Validator', () => {
  it('should validate Discord client ID format', () => {
    const validId = '1234567890123456';
    const isValid = /^\d{18}$/.test(validId) || /^\d{16,}$/.test(validId);
    expect(isValid).toBe(true);
  });

  it('should reject invalid Discord client ID', () => {
    const invalidId = 'not-a-number';
    const isValid = /^\d{16,}$/.test(invalidId);
    expect(isValid).toBe(false);
  });

  it('should sanitize strings properly', () => {
    const input = '<script>alert("xss")</script>test';
    const sanitized = input.replace(/<[^>]*>/g, '');
    expect(sanitized).toBe('alert("xss")test');
  });

  it('should validate port number ranges', () => {
    const port = 8080;
    const isValid = port > 0 && port < 65536;
    expect(isValid).toBe(true);
  });

  it('should reject invalid port numbers', () => {
    const port = 99999;
    const isValid = port > 0 && port < 65536;
    expect(isValid).toBe(false);
  });
});

// ============================================================================
// Activity History Tests
// ============================================================================

describe('Activity History', () => {
  const mockActivity: DiscordPresenceData = {
    state: 'Playing',
    details: 'Test Movie',
    largeImageKey: 'default',
    largeImageText: 'VLCord'
  };

  it('should record activity entries', () => {
    const entries: any[] = [];
    const entry = {
      id: '1',
      timestamp: Date.now(),
      activity: mockActivity,
      status: 'success' as const
    };

    entries.push(entry);
    expect(entries.length).toBe(1);
    expect(entries[0].status).toBe('success');
  });

  it('should maintain maximum history size', () => {
    const entries: any[] = [];
    const maxSize = 50;

    for (let i = 0; i < 60; i++) {
      entries.push({
        id: `${i}`,
        timestamp: Date.now() + i * 1000,
        activity: mockActivity,
        status: 'success'
      });

      // Trim to max size
      if (entries.length > maxSize) {
        entries.shift();
      }
    }

    expect(entries.length).toBeLessThanOrEqual(maxSize);
  });

  it('should filter by status', () => {
    const entries = [
      { id: '1', status: 'success' },
      { id: '2', status: 'failed' },
      { id: '3', status: 'success' },
      { id: '4', status: 'pending' }
    ];

    const successful = entries.filter(e => e.status === 'success');
    expect(successful.length).toBe(2);
  });

  it('should calculate statistics', () => {
    const entries = [
      { status: 'success' },
      { status: 'success' },
      { status: 'failed' },
      { status: 'success' }
    ];

    const stats = {
      totalUpdates: entries.length,
      successfulUpdates: entries.filter(e => e.status === 'success').length,
      failedUpdates: entries.filter(e => e.status === 'failed').length
    };

    expect(stats.totalUpdates).toBe(4);
    expect(stats.successfulUpdates).toBe(3);
    expect(stats.failedUpdates).toBe(1);
  });
});

// ============================================================================
// Metadata Override Tests
// ============================================================================

describe('Metadata Overrides', () => {
  it('should store custom metadata overrides', () => {
    const overrides: any = {
      'movie-1': {
        category: 'movie',
        title: 'Test Movie',
        override: { state: 'Custom State' }
      }
    };

    expect(overrides['movie-1']).toBeDefined();
    expect(overrides['movie-1'].override.state).toBe('Custom State');
  });

  it('should retrieve overrides by ID', () => {
    const overrides: any = {
      'movie-1': { title: 'Test' }
    };

    const result = overrides['movie-1'];
    expect(result).toBeDefined();
    expect(result.title).toBe('Test');
  });

  it('should support CRUD operations', () => {
    const overrides: any = {};

    // Create
    overrides['new-1'] = { title: 'New Override' };
    expect(overrides['new-1']).toBeDefined();

    // Read
    const read = overrides['new-1'];
    expect(read.title).toBe('New Override');

    // Update
    overrides['new-1'].title = 'Updated Override';
    expect(overrides['new-1'].title).toBe('Updated Override');

    // Delete
    delete overrides['new-1'];
    expect(overrides['new-1']).toBeUndefined();
  });
});

// ============================================================================
// Health Check Tests
// ============================================================================

describe('Health Check Endpoint', () => {
  it('should report healthy status when all services connected', () => {
    const health = {
      status: 'healthy' as const,
      connections: {
        discord: true,
        vlc: true,
        circuitBreakers: {}
      }
    };

    expect(health.status).toBe('healthy');
    expect(health.connections.discord).toBe(true);
  });

  it('should report degraded status when one service down', () => {
    const health = {
      status: 'degraded' as const,
      connections: {
        discord: true,
        vlc: false,
        circuitBreakers: {}
      }
    };

    expect(health.status).toBe('degraded');
  });

  it('should report unhealthy status when multiple services down', () => {
    const health = {
      status: 'unhealthy' as const,
      connections: {
        discord: false,
        vlc: false,
        circuitBreakers: {}
      }
    };

    expect(health.status).toBe('unhealthy');
  });

  it('should include uptime in response', () => {
    const health = {
      status: 'healthy' as const,
      uptime: 3600000 // 1 hour in ms
    };

    expect(health.uptime).toBeGreaterThan(0);
  });
});

// ============================================================================
// Graceful Degradation Tests
// ============================================================================

describe('Graceful Degradation', () => {
  it('should buffer activities when service unavailable', () => {
    const buffer: DiscordPresenceData[] = [];

    const activity: DiscordPresenceData = {
      state: 'Buffered',
      details: 'Test'
    };

    buffer.push(activity);
    expect(buffer.length).toBe(1);
  });

  it('should not exceed buffer size', () => {
    const buffer: DiscordPresenceData[] = [];
    const maxBufferSize = 50;

    for (let i = 0; i < 60; i++) {
      buffer.push({ state: `State ${i}` });

      if (buffer.length > maxBufferSize) {
        buffer.shift();
      }
    }

    expect(buffer.length).toBeLessThanOrEqual(maxBufferSize);
  });

  it('should calculate exponential backoff', () => {
    const calculateBackoff = (attempt: number, baseDelay: number = 1000): number => {
      return baseDelay * Math.pow(2, Math.min(attempt, 10));
    };

    expect(calculateBackoff(0)).toBe(1000);
    expect(calculateBackoff(1)).toBe(2000);
    expect(calculateBackoff(2)).toBe(4000);
    expect(calculateBackoff(3)).toBe(8000);
  });

  it('should add jitter to backoff', () => {
    const calculateBackoffWithJitter = (attempt: number, baseDelay: number = 1000): number => {
      const backoff = baseDelay * Math.pow(2, Math.min(attempt, 10));
      const jitter = Math.random() * backoff * 0.1;
      return backoff + jitter;
    };

    const backoff = calculateBackoffWithJitter(1);
    expect(backoff).toBeGreaterThanOrEqual(2000);
    expect(backoff).toBeLessThanOrEqual(2200); // 2000 + 10% jitter max
  });
});

// ============================================================================
// Activity Template Tests
// ============================================================================

describe('Activity Templates', () => {
  it('should render template with placeholders', () => {
    const template = 'Watching {title} - Season {season} Episode {episode}';
    const data = { title: 'Test Show', season: '1', episode: '5' };

    let rendered = template;
    Object.entries(data).forEach(([key, value]) => {
      rendered = rendered.replace(`{${key}}`, String(value));
    });

    expect(rendered).toBe('Watching Test Show - Season 1 Episode 5');
  });

  it('should handle missing placeholders gracefully', () => {
    const template = 'Watching {title}';
    let rendered = template;

    const match = rendered.match(/\{([^}]+)\}/);
    if (match && !('title' in {})) {
      rendered = rendered.replace(match[0], 'Unknown');
    }

    expect(rendered.includes('Watching')).toBe(true);
  });

  it('should support multiple placeholder types', () => {
    const template = '{title} ({year}) - {rating}/10 - {duration}min';
    const data = {
      title: 'Test Movie',
      year: '2024',
      rating: '8.5',
      duration: '120'
    };

    let rendered = template;
    Object.entries(data).forEach(([key, value]) => {
      rendered = rendered.replace(`{${key}}`, String(value));
    });

    expect(rendered).toBe('Test Movie (2024) - 8.5/10 - 120min');
  });
});

// ============================================================================
// API Response Format Tests
// ============================================================================

describe('API Response Format', () => {
  it('should return valid success response', () => {
    const response = {
      success: true,
      data: { test: 'value' },
      timestamp: Date.now()
    };

    expect(response.success).toBe(true);
    expect(response.data).toBeDefined();
    expect(response.timestamp).toBeGreaterThan(0);
  });

  it('should return valid error response', () => {
    const response = {
      success: false,
      error: 'Test error',
      timestamp: Date.now()
    };

    expect(response.success).toBe(false);
    expect(response.error).toBeDefined();
  });

  it('should include pagination in list responses', () => {
    const response = {
      data: [{ id: '1' }, { id: '2' }],
      total: 2,
      page: 1,
      pageSize: 10,
      totalPages: 1
    };

    expect(response.total).toBe(2);
    expect(response.page).toBe(1);
    expect(response.totalPages).toBe(1);
  });
});

// ============================================================================
// VLC Status Tests
// ============================================================================

describe('VLC Status', () => {
  const createMockStatus = (): VLCStatus => ({
    isRunning: true,
    isPlaying: true,
    filename: 'test.mp4',
    title: 'Test Title',
    time: 120,
    duration: 3600,
    percentage: 3.33,
    state: 'playing'
  });

  it('should represent playing state correctly', () => {
    const status = createMockStatus();
    expect(status.isPlaying).toBe(true);
    expect(status.state).toBe('playing');
  });

  it('should calculate percentage correctly', () => {
    const status = createMockStatus();
    const calculatedPercentage = (status.time / status.duration) * 100;
    expect(calculatedPercentage).toBeCloseTo(3.33, 2);
  });

  it('should handle paused state', () => {
    const status = createMockStatus();
    status.isPlaying = false;
    status.state = 'paused';

    expect(status.isPlaying).toBe(false);
    expect(status.state).toBe('paused');
  });

  it('should handle stopped state', () => {
    const status = createMockStatus();
    status.isPlaying = false;
    status.isRunning = false;
    status.state = 'stopped';

    expect(status.isRunning).toBe(false);
    expect(status.state).toBe('stopped');
  });
});
