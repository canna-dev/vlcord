import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_FILE = path.join(__dirname, '..', 'vlcord-config.json');

export class ConfigManager {
  constructor() {
    this.defaultConfig = {
      vlcHost: 'localhost',
      vlcPort: 8080,
      vlcPassword: 'vlcpassword',
      discordClientId: '1392902149163319398',
      tmdbApiKey: 'ccc1fa36a0821299ae4d7a6c155b442d',
      // Admin token default (kept as default for local installs)
      adminToken: 'vlcord_default_admin_token'
    };

    this.config = { ...this.defaultConfig };
    this._initialized = false;
  }

  // Initialize by loading config from disk (async)
  async init() {
    if (this._initialized) return;

    try {
      if (fsSync.existsSync(CONFIG_FILE)) {
        // If a directory exists with the expected file name, warn and skip reading
        if (fsSync.lstatSync(CONFIG_FILE).isDirectory()) {
          logger.warn(
            'Config path points to a directory but should be a file:',
            CONFIG_FILE
          );
          this.config = { ...this.defaultConfig };
        } else {
          const data = await fs.readFile(CONFIG_FILE, 'utf8');
          const savedConfig = JSON.parse(data);
          this.config = { ...this.defaultConfig, ...savedConfig };
        }
      } else {
        this.config = { ...this.defaultConfig };
      }
    } catch (error) {
      // Fall back to defaults on any error
      logger.warn('Error loading config file, using defaults:', error.message);
      this.config = { ...this.defaultConfig };
    }

    this._initialized = true;
  }

  // Async save with atomic write (write to temp then rename)
  async saveConfig(newConfig) {
    try {
      // Merge with current config
      this.config = { ...this.config, ...newConfig };

      const tmpPath = `${CONFIG_FILE}.tmp`;
      await fs.writeFile(tmpPath, JSON.stringify(this.config, null, 2), 'utf8');
      await fs.rename(tmpPath, CONFIG_FILE);

      return true;
    } catch (error) {
      logger.error('Error saving config:', error.message);
      return false;
    }
  }

  getConfig() {
    return { ...this.config };
  }

  get(key) {
    return this.config[key];
  }

  async set(key, value) {
    this.config[key] = value;
    return await this.saveConfig({ [key]: value });
  }
}
