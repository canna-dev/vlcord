/**
 * Configuration Hot-Reload System
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { AppConfig } from './types.js';
import { getLogger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logger = getLogger();

interface ConfigChangeListener {
  key: string;
  callback: (oldValue: unknown, newValue: unknown) => Promise<void>;
}

/**
 * Configuration Hot-Reload Manager
 */
export class ConfigHotReloadManager {
  private watchers: Map<string, fs.FSWatcher> = new Map();
  private changeListeners: ConfigChangeListener[] = [];
  private lastLoadTime: number = 0;
  private debounceTimer: NodeJS.Timeout | null = null;
  private debounceDelay: number = 1000; // 1 second to allow multiple file writes to batch

  constructor(
    private configPath: string,
    private validator?: (config: any) => boolean
  ) {}

  /**
   * Start watching configuration file
   */
  watchConfig(onReload?: (config: AppConfig) => Promise<void>): void {
    try {
      const dir = path.dirname(this.configPath);

      const watcher = fs.watch(dir, (eventType, filename) => {
        if (!filename || !filename.includes('config')) return;

        // Debounce to prevent multiple rapid reloads
        if (this.debounceTimer) {
          clearTimeout(this.debounceTimer);
        }

        this.debounceTimer = setTimeout(async () => {
          try {
            await this.reloadConfig(onReload);
          } catch (error) {
            logger.error('ConfigHotReload', 'Failed to reload config', error as Error);
          }
        }, this.debounceDelay);
      });

      this.watchers.set(this.configPath, watcher);
      logger.info('ConfigHotReload', 'Started watching config file', { path: this.configPath });
    } catch (error) {
      logger.error('ConfigHotReload', 'Failed to watch config file', error as Error);
    }
  }

  /**
   * Reload and validate configuration
   */
  async reloadConfig(onReload?: (config: AppConfig) => Promise<void>): Promise<AppConfig | null> {
    try {
      // Prevent rapid consecutive reloads
      const now = Date.now();
      if (now - this.lastLoadTime < 500) {
        return null;
      }

      this.lastLoadTime = now;

      // Read file
      const content = fs.readFileSync(this.configPath, 'utf-8');
      const newConfig = JSON.parse(content) as AppConfig;

      // Validate if validator provided
      if (this.validator && !this.validator(newConfig)) {
        throw new Error('Configuration validation failed');
      }

      // Trigger change listeners
      await this.notifyListeners(newConfig);

      // Call reload callback if provided
      if (onReload) {
        await onReload(newConfig);
      }

      logger.info('ConfigHotReload', 'Configuration reloaded successfully');
      return newConfig;
    } catch (error) {
      logger.error('ConfigHotReload', 'Failed to reload configuration', error as Error);
      return null;
    }
  }

  /**
   * Register change listener for specific config key
   */
  onChange(key: string, callback: (oldValue: unknown, newValue: unknown) => Promise<void>): void {
    this.changeListeners.push({ key, callback });
    logger.debug('ConfigHotReload', 'Listener registered', { key });
  }

  /**
   * Notify listeners of changes
   */
  private async notifyListeners(newConfig: AppConfig): Promise<void> {
    for (const listener of this.changeListeners) {
      try {
        // Get nested property value
        const getValue = (obj: any, path: string): unknown => {
          return path.split('.').reduce((current, prop) => current?.[prop], obj);
        };

        const oldValue = getValue(this.getCurrentConfig(), listener.key);
        const newValue = getValue(newConfig, listener.key);

        // Only call if value changed
        if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
          await listener.callback(oldValue, newValue);
          logger.info('ConfigHotReload', 'Config change notified', {
            key: listener.key,
            oldValue,
            newValue
          });
        }
      } catch (error) {
        logger.error('ConfigHotReload', 'Listener callback failed', error as Error, {
          key: listener.key
        });
      }
    }
  }

  /**
   * Get current configuration (must be implemented by consumer)
   */
  private getCurrentConfig(): AppConfig {
    // This should be overridden or provided externally
    try {
      const content = fs.readFileSync(this.configPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return {} as AppConfig;
    }
  }

  /**
   * Stop watching configuration
   */
  stopWatching(): void {
    for (const watcher of this.watchers.values()) {
      watcher.close();
    }
    this.watchers.clear();

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    logger.info('ConfigHotReload', 'Stopped watching configuration files');
  }

  /**
   * Validate configuration before reload
   */
  static validateConfig(config: AppConfig): boolean {
    try {
      // Check required fields
      if (!config.discord?.clientId) return false;
      if (!config.vlc?.host) return false;
      if (!config.server?.port) return false;

      // Check value ranges
      if (config.vlc.port < 1 || config.vlc.port > 65535) return false;
      if (config.server.port < 1 || config.server.port > 65535) return false;

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get diff between two configs
   */
  static getConfigDiff(
    oldConfig: AppConfig,
    newConfig: AppConfig
  ): Record<string, { before: unknown; after: unknown }> {
    const diff: Record<string, { before: unknown; after: unknown }> = {};

    const flattenObj = (obj: any, prefix = ''): Record<string, unknown> => {
      const flattened: Record<string, unknown> = {};

      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          const value = obj[key];
          const newKey = prefix ? `${prefix}.${key}` : key;

          if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
            Object.assign(flattened, flattenObj(value, newKey));
          } else {
            flattened[newKey] = value;
          }
        }
      }

      return flattened;
    };

    const oldFlat = flattenObj(oldConfig);
    const newFlat = flattenObj(newConfig);

    // Find differences
    for (const key in newFlat) {
      if (JSON.stringify(oldFlat[key]) !== JSON.stringify(newFlat[key])) {
        diff[key] = {
          before: oldFlat[key],
          after: newFlat[key]
        };
      }
    }

    return diff;
  }
}

/**
 * Convenient setup for common config changes
 */
export const ConfigChangeHandlers = {
  /**
   * Handle Discord client ID change
   */
  onDiscordClientIdChange: async (
    oldId: unknown,
    newId: unknown,
    onChangeCallback: () => Promise<void>
  ): Promise<void> => {
    if (oldId !== newId) {
      logger.info('ConfigHotReload', 'Discord client ID changed', { oldId, newId });
      await onChangeCallback();
    }
  },

  /**
   * Handle VLC endpoint change
   */
  onVlcEndpointChange: async (
    oldHost: unknown,
    newHost: unknown,
    onChangeCallback: () => Promise<void>
  ): Promise<void> => {
    if (oldHost !== newHost) {
      logger.info('ConfigHotReload', 'VLC endpoint changed', { oldHost, newHost });
      await onChangeCallback();
    }
  },

  /**
   * Handle TMDb API key change
   */
  onTmdbApiKeyChange: async (
    oldKey: unknown,
    newKey: unknown,
    onChangeCallback: () => Promise<void>
  ): Promise<void> => {
    if (oldKey !== newKey) {
      logger.info('ConfigHotReload', 'TMDb API key changed');
      // Clear metadata cache when API key changes
      await onChangeCallback();
    }
  },

  /**
   * Handle logging level change
   */
  onLoggingLevelChange: async (
    oldLevel: unknown,
    newLevel: unknown,
    onChangeCallback: () => Promise<void>
  ): Promise<void> => {
    if (oldLevel !== newLevel) {
      logger.info('ConfigHotReload', 'Logging level changed', { oldLevel, newLevel });
      await onChangeCallback();
    }
  },

  /**
   * Handle rate limit change
   */
  onRateLimitChange: async (
    oldLimit: unknown,
    newLimit: unknown,
    onChangeCallback: () => Promise<void>
  ): Promise<void> => {
    if (JSON.stringify(oldLimit) !== JSON.stringify(newLimit)) {
      logger.info('ConfigHotReload', 'Rate limit settings changed', { oldLimit, newLimit });
      await onChangeCallback();
    }
  }
};

// Singleton instance
let configReloadManager: ConfigHotReloadManager | null = null;

export function initializeConfigHotReload(
  configPath: string = path.join(__dirname, '..', 'config.json'),
  validator?: (config: any) => boolean
): ConfigHotReloadManager {
  configReloadManager = new ConfigHotReloadManager(
    configPath,
    validator || ConfigHotReloadManager.validateConfig
  );
  return configReloadManager;
}

export function getConfigHotReloadManager(): ConfigHotReloadManager {
  if (!configReloadManager) {
    configReloadManager = initializeConfigHotReload();
  }
  return configReloadManager;
}

export default getConfigHotReloadManager();
