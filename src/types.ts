/**
 * Global TypeScript type definitions for VLCord
 */

// ============================================================================
// VLC Types
// ============================================================================

export interface VLCStatus {
  isRunning: boolean;
  isPlaying: boolean;
  filename: string | null;
  title: string | null;
  time: number;
  duration: number;
  percentage: number;
  state: 'playing' | 'paused' | 'stopped';
  errorMessage?: string;
}

export interface VLCConfig {
  port: number;
  host: string;
  password?: string;
}

// ============================================================================
// Discord Types
// ============================================================================

export interface DiscordPresenceData {
  state?: string;
  details?: string;
  startTimestamp?: number;
  endTimestamp?: number;
  largeImageKey?: string;
  largeImageText?: string;
  smallImageKey?: string;
  smallImageText?: string;
  partyId?: string;
  partySize?: number;
  partyMax?: number;
  matchSecret?: string;
  spectateSecret?: string;
  joinSecret?: string;
  instance?: boolean;
  buttons?: DiscordButton[];
}

export interface DiscordButton {
  label: string;
  url: string;
}

export interface DiscordConfig {
  clientId: string;
  enabled: boolean;
  updateInterval: number;
}

export interface ActivityUpdate {
  timestamp: number;
  activity: DiscordPresenceData;
  source: 'vlc' | 'manual' | 'override';
  status: 'success' | 'failed' | 'pending';
  metadata?: Record<string, unknown>;
  error?: string;
}

// ============================================================================
// TMDb Types
// ============================================================================

export interface MovieMetadata {
  id: number;
  title: string;
  releaseDate: string;
  posterPath: string | null;
  backdropPath: string | null;
  overview: string;
  voteAverage: number;
  genres: string[];
}

export interface TVShowMetadata {
  id: number;
  name: string;
  firstAirDate: string;
  posterPath: string | null;
  backdropPath: string | null;
  overview: string;
  voteAverage: number;
  genres: string[];
  numberOfSeasons: number;
  numberOfEpisodes: number;
}

export interface TVEpisodeMetadata {
  id: number;
  episodeNumber: number;
  seasonNumber: number;
  name: string;
  airDate: string;
  overview: string;
  voteAverage: number;
  stillPath: string | null;
}

export interface TMDbConfig {
  apiKey: string;
  enabled: boolean;
  useCache: boolean;
  cacheTTL: number;
}

// ============================================================================
// Metadata Override Types
// ============================================================================

export interface MetadataOverride {
  id: string;
  category: 'movie' | 'show' | 'custom';
  title: string;
  override: Partial<DiscordPresenceData>;
  createdAt: number;
  updatedAt: number;
}

export interface MetadataOverrideDb {
  version: string;
  overrides: MetadataOverride[];
  lastModified: number;
}

// ============================================================================
// Config Types
// ============================================================================

export interface AppConfig {
  vlc: VLCConfig;
  discord: DiscordConfig;
  tmdb: TMDbConfig;
  server: {
    port: number;
    host: string;
    adminToken: string;
  };
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
    format: 'text' | 'json';
    file?: string;
  };
  features: {
    metadataFetch: boolean;
    animeDetection: boolean;
    overrides: boolean;
  };
}

// ============================================================================
// Circuit Breaker Types
// ============================================================================

export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerStatus {
  service: string;
  state: CircuitBreakerState;
  failureCount: number;
  successCount: number;
  lastFailure: number | null;
  nextRetry: number | null;
}

export interface CircuitBreakerConfig {
  failureThreshold?: number;
  successThreshold?: number;
  timeout?: number;
  resetTimeout?: number;
}

// ============================================================================
// Activity History Types
// ============================================================================

export interface ActivityHistoryEntry {
  id: string;
  timestamp: number;
  activity: DiscordPresenceData;
  status: 'success' | 'failed' | 'pending';
  metadata?: Record<string, unknown>;
  error?: string;
}

export interface ActivityStats {
  totalUpdates: number;
  successfulUpdates: number;
  failedUpdates: number;
  averageUpdateTime: number;
  lastUpdate: number | null;
}

// ============================================================================
// API Request/Response Types
// ============================================================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number;
  connections: {
    discord: boolean;
    vlc: boolean;
    circuitBreakers: {
      [key: string]: CircuitBreakerStatus;
    };
  };
  metrics?: {
    averageUpdateTime: number;
    totalUpdates: number;
    failureRate: number;
  };
}

// ============================================================================
// Logger Types
// ============================================================================

export interface LogEntry {
  timestamp: number;
  level: 'debug' | 'info' | 'warn' | 'error';
  module: string;
  message: string;
  metadata?: Record<string, unknown>;
  error?: string;
}

// ============================================================================
// Webhook Types
// ============================================================================

export interface WebhookConfig {
  enabled: boolean;
  urls: string[];
  retryAttempts?: number;
  retryDelay?: number;
}

export interface WebhookEvent {
  type: 'presence_update' | 'error' | 'status_change' | 'config_update';
  timestamp: number;
  data: Record<string, unknown>;
}

// ============================================================================
// Validation Types
// ============================================================================

export interface ValidationError {
  field: string;
  message: string;
  value?: unknown;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings?: string[];
}

// ============================================================================
// Plugin Types (Future)
// ============================================================================

export interface PluginConfig {
  name: string;
  version: string;
  enabled: boolean;
  settings?: Record<string, unknown>;
}

export interface PluginHooks {
  onActivityUpdate?: (activity: DiscordPresenceData) => DiscordPresenceData;
  onMetadataFetch?: (metadata: MovieMetadata | TVShowMetadata) => MovieMetadata | TVShowMetadata;
  onError?: (error: Error) => void;
}

// ============================================================================
// Export utility types
// ============================================================================

export type Nullable<T> = T | null;
export type Optional<T> = T | undefined;
export type AsyncFunction<T = void> = () => Promise<T>;
export type ErrorHandler = (error: Error) => void;
