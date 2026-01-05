/**
 * SQLite-based persistent activity history storage
 */

import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';
import type { ActivityHistoryEntry, ActivityStats, DiscordPresenceData } from './types.js';
import { getLogger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logger = getLogger();

const DB_PATH = path.join(__dirname, '..', 'data', 'activity-history.db');

interface QueryOptions {
  limit?: number;
  offset?: number;
  status?: 'success' | 'failed' | 'pending';
  startTime?: number;
  endTime?: number;
}

export class ActivityHistoryDatabase {
  private db: sqlite3.Database;
  private isReady: boolean = false;

  constructor(dbPath: string = DB_PATH) {
    this.db = new sqlite3.Database(dbPath, (err: Error | null) => {
      if (err) {
        logger.error('ActivityHistoryDb', 'Failed to open database', err);
      }
    });

    // Enable foreign keys and WAL mode for better concurrency
    this.db.run('PRAGMA foreign_keys = ON');
    this.db.run('PRAGMA journal_mode = WAL');
  }

  /**
   * Initialize database schema
   */
  async initialize(): Promise<void> {
    const run = promisify(this.db.run.bind(this.db));

    try {
      // Activity history table
      await run(`
        CREATE TABLE IF NOT EXISTS activity_history (
          id TEXT PRIMARY KEY,
          timestamp INTEGER NOT NULL,
          activity_state TEXT,
          activity_details TEXT,
          activity_large_image TEXT,
          activity_large_text TEXT,
          activity_small_image TEXT,
          activity_small_text TEXT,
          status TEXT NOT NULL CHECK(status IN ('success', 'failed', 'pending')),
          metadata TEXT,
          error_message TEXT,
          created_at INTEGER NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create index for faster queries
      await run(`
        CREATE INDEX IF NOT EXISTS idx_activity_timestamp 
        ON activity_history(timestamp DESC)
      `);

      await run(`
        CREATE INDEX IF NOT EXISTS idx_activity_status 
        ON activity_history(status)
      `);

      // Statistics summary table (denormalized for faster queries)
      await run(`
        CREATE TABLE IF NOT EXISTS activity_statistics (
          id INTEGER PRIMARY KEY,
          total_updates INTEGER DEFAULT 0,
          successful_updates INTEGER DEFAULT 0,
          failed_updates INTEGER DEFAULT 0,
          average_update_time REAL DEFAULT 0,
          last_update INTEGER,
          updated_at INTEGER NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Initialize statistics record if not exists
      await run(`
        INSERT OR IGNORE INTO activity_statistics (id) VALUES (1)
      `);

      this.isReady = true;
      logger.info('ActivityHistoryDb', 'Database initialized successfully');
    } catch (error) {
      logger.error('ActivityHistoryDb', 'Failed to initialize database', error as Error);
      throw error;
    }
  }

  /**
   * Record a new activity update
   */
  async recordActivity(entry: ActivityHistoryEntry): Promise<void> {
    const run = promisify(this.db.run.bind(this.db));

    if (!this.isReady) await this.initialize();

    try {
      const activity = entry.activity;
      const metadata = entry.metadata ? JSON.stringify(entry.metadata) : null;

      await run(
        `INSERT INTO activity_history (
          id, timestamp, activity_state, activity_details, 
          activity_large_image, activity_large_text, 
          activity_small_image, activity_small_text, 
          status, metadata, error_message
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entry.id,
          entry.timestamp,
          activity.state || null,
          activity.details || null,
          activity.largeImageKey || null,
          activity.largeImageText || null,
          activity.smallImageKey || null,
          activity.smallImageText || null,
          entry.status,
          metadata,
          entry.error || null
        ]
      );

      // Update statistics
      await this.updateStatistics();
    } catch (error) {
      logger.error('ActivityHistoryDb', 'Failed to record activity', error as Error);
      throw error;
    }
  }

  /**
   * Get recent activities
   */
  async getRecent(count: number = 50): Promise<ActivityHistoryEntry[]> {
    const all = promisify(this.db.all.bind(this.db));

    if (!this.isReady) await this.initialize();

    try {
      const rows: any[] = await all(
        `SELECT * FROM activity_history 
         ORDER BY timestamp DESC 
         LIMIT ?`,
        [count]
      );

      return rows.map(this.rowToEntry);
    } catch (error) {
      logger.error('ActivityHistoryDb', 'Failed to get recent activities', error as Error);
      return [];
    }
  }

  /**
   * Get activities with filtering and pagination
   */
  async query(options: QueryOptions = {}): Promise<ActivityHistoryEntry[]> {
    const all = promisify(this.db.all.bind(this.db));

    if (!this.isReady) await this.initialize();

    try {
      let sql = 'SELECT * FROM activity_history WHERE 1=1';
      const params: any[] = [];

      if (options.status) {
        sql += ' AND status = ?';
        params.push(options.status);
      }

      if (options.startTime) {
        sql += ' AND timestamp >= ?';
        params.push(options.startTime);
      }

      if (options.endTime) {
        sql += ' AND timestamp <= ?';
        params.push(options.endTime);
      }

      sql += ' ORDER BY timestamp DESC';

      if (options.limit) {
        sql += ' LIMIT ?';
        params.push(options.limit);
      }

      if (options.offset) {
        sql += ' OFFSET ?';
        params.push(options.offset);
      }

      const rows: any[] = await all(sql, params);
      return rows.map(this.rowToEntry);
    } catch (error) {
      logger.error('ActivityHistoryDb', 'Failed to query activities', error as Error);
      return [];
    }
  }

  /**
   * Get statistics
   */
  async getStatistics(): Promise<ActivityStats> {
    const get = promisify(this.db.get.bind(this.db));

    if (!this.isReady) await this.initialize();

    try {
      const row: any = await get(
        `SELECT * FROM activity_statistics WHERE id = 1`
      );

      return {
        totalUpdates: row?.total_updates || 0,
        successfulUpdates: row?.successful_updates || 0,
        failedUpdates: row?.failed_updates || 0,
        averageUpdateTime: row?.average_update_time || 0,
        lastUpdate: row?.last_update || null
      };
    } catch (error) {
      logger.error('ActivityHistoryDb', 'Failed to get statistics', error as Error);
      return {
        totalUpdates: 0,
        successfulUpdates: 0,
        failedUpdates: 0,
        averageUpdateTime: 0,
        lastUpdate: null
      };
    }
  }

  /**
   * Delete old entries (retention policy)
   */
  async deleteOlderThan(days: number): Promise<number> {
    const run = promisify(this.db.run.bind(this.db));

    if (!this.isReady) await this.initialize();

    try {
      const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000;

      const result: any = await new Promise((resolve, reject) => {
        this.db.run(
          'DELETE FROM activity_history WHERE timestamp < ?',
          [cutoffTime],
          function(err: Error | null) {
            if (err) reject(err);
            else resolve({ changes: this.changes });
          }
        );
      });

      await this.updateStatistics();
      return result.changes;
    } catch (error) {
      logger.error('ActivityHistoryDb', 'Failed to delete old entries', error as Error);
      return 0;
    }
  }

  /**
   * Clear all history
   */
  async clear(): Promise<void> {
    const run = promisify(this.db.run.bind(this.db));

    if (!this.isReady) await this.initialize();

    try {
      await run('DELETE FROM activity_history');
      await run('DELETE FROM activity_statistics');
      await run('INSERT INTO activity_statistics (id) VALUES (1)');
      logger.info('ActivityHistoryDb', 'Activity history cleared');
    } catch (error) {
      logger.error('ActivityHistoryDb', 'Failed to clear history', error as Error);
      throw error;
    }
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.close((err: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Private helper methods
   */
  private async updateStatistics(): Promise<void> {
    const all = promisify(this.db.all.bind(this.db));
    const run = promisify(this.db.run.bind(this.db));

    try {
      const stats: any = await all(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
          AVG(CAST((SELECT CAST(metadata AS JSON)->>'processingTime' AS INTEGER) AS INTEGER)) as avg_time,
          MAX(timestamp) as last_ts
        FROM activity_history
      `);

      if (stats && stats[0]) {
        const row = stats[0];
        await run(
          `UPDATE activity_statistics 
           SET total_updates = ?, successful_updates = ?, failed_updates = ?, 
               average_update_time = ?, last_update = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = 1`,
          [
            row.total || 0,
            row.successful || 0,
            row.failed || 0,
            row.avg_time || 0,
            row.last_ts || null
          ]
        );
      }
    } catch (error) {
      logger.error('ActivityHistoryDb', 'Failed to update statistics', error as Error);
    }
  }

  private rowToEntry(row: any): ActivityHistoryEntry {
    return {
      id: row.id,
      timestamp: row.timestamp,
      activity: {
        state: row.activity_state,
        details: row.activity_details,
        largeImageKey: row.activity_large_image,
        largeImageText: row.activity_large_text,
        smallImageKey: row.activity_small_image,
        smallImageText: row.activity_small_text
      },
      status: row.status,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      error: row.error_message || undefined
    };
  }
}

// Singleton instance
let historyDbInstance: ActivityHistoryDatabase | null = null;

export function getActivityHistoryDb(): ActivityHistoryDatabase {
  if (!historyDbInstance) {
    historyDbInstance = new ActivityHistoryDatabase();
  }
  return historyDbInstance;
}

export default getActivityHistoryDb();
