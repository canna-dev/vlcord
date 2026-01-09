/**
 * Metadata overrides database
 * Allows users to customize title mappings and metadata without code changes
 * Stored as JSON for easy editing
 */

import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OVERRIDES_FILE = process.env.VLCORD_METADATA_OVERRIDES_PATH || path.join(__dirname, '..', 'metadata-overrides.json');

const DEFAULT_OVERRIDES = {
  movies: {
    '[rec]': { tmdbId: 24282, title: '[REC]' },
    '[rec] 2': { tmdbId: 24283, title: '[REC] 2' },
    '[rec] 3': { tmdbId: 65179, title: '[REC] 3: Génesis' }
  },
  shows: {
    'attack on titan': { tmdbId: 37122, title: 'Attack on Titan' },
    'shingeki no kyojin': { tmdbId: 37122, title: 'Attack on Titan' },
    'demon slayer': { tmdbId: 78953, title: 'Demon Slayer' },
    'kimetsu no yaiba': { tmdbId: 78953, title: 'Demon Slayer' }
  },
  custom: {
    // User-defined mappings
  }
};

export class MetadataOverridesDb {
  constructor() {
    this.overrides = { ...DEFAULT_OVERRIDES };
    this._initialized = false;
  }

  /**
   * Load overrides from disk
   */
  async init() {
    if (this._initialized) return;

    try {
      if (fsSync.existsSync(OVERRIDES_FILE)) {
        const data = await fs.readFile(OVERRIDES_FILE, 'utf8');
        const loaded = JSON.parse(data);
        this.overrides = {
          ...DEFAULT_OVERRIDES,
          ...loaded
        };
        logger.info(`Loaded metadata overrides from ${OVERRIDES_FILE}`, 'MetadataOverridesDb');
      } else {
        // Create default file
        await this.save();
        logger.info(`Created default metadata overrides file at ${OVERRIDES_FILE}`, 'MetadataOverridesDb');
      }
    } catch (error) {
      logger.error(`Failed to load metadata overrides: ${error.message}`, 'MetadataOverridesDb');
      this.overrides = { ...DEFAULT_OVERRIDES };
    }

    this._initialized = true;
  }

  /**
   * Save overrides to disk
   */
  async save() {
    try {
      const tmpPath = `${OVERRIDES_FILE}.tmp`;
      await fs.writeFile(tmpPath, JSON.stringify(this.overrides, null, 2), 'utf8');
      await fs.rename(tmpPath, OVERRIDES_FILE);
      logger.info('Metadata overrides saved', 'MetadataOverridesDb');
    } catch (error) {
      logger.error(`Failed to save metadata overrides: ${error.message}`, 'MetadataOverridesDb');
    }
  }

  /**
   * Find movie override
   */
  findMovie(title) {
    const normalized = title.toLowerCase().trim();
    return this.overrides.movies?.[normalized] || null;
  }

  /**
   * Find show override
   */
  findShow(title) {
    const normalized = title.toLowerCase().trim();
    return this.overrides.shows?.[normalized] || null;
  }

  /**
   * Find custom override
   */
  findCustom(title) {
    const normalized = title.toLowerCase().trim();
    return this.overrides.custom?.[normalized] || null;
  }

  /**
   * Add or update override
   */
  async set(category, title, override) {
    if (!this.overrides[category]) {
      this.overrides[category] = {};
    }

    const normalized = title.toLowerCase().trim();
    this.overrides[category][normalized] = override;
    await this.save();
  }

  /**
   * Remove override
   */
  async remove(category, title) {
    if (!this.overrides[category]) return;

    const normalized = title.toLowerCase().trim();
    delete this.overrides[category][normalized];
    await this.save();
  }

  /**
   * Get all overrides
   */
  getAll() {
    return JSON.parse(JSON.stringify(this.overrides));
  }

  /**
   * Export current overrides for backup
   */
  export() {
    return JSON.stringify(this.overrides, null, 2);
  }
}

// Singleton instance
export const metadataDb = new MetadataOverridesDb();
