/**
 * Audit Logging System
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Request } from 'express';
import { getLogger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logger = getLogger();

const AUDIT_LOG_DIR = path.join(__dirname, '..', 'data', 'audit-logs');

export interface AuditLogEntry {
  timestamp: number;
  userId?: string;
  action: string;
  resource: string;
  method: string;
  path: string;
  statusCode?: number;
  ip: string;
  userAgent?: string;
  changes?: Record<string, { before: unknown; after: unknown }>;
  metadata?: Record<string, unknown>;
  error?: string;
}

/**
 * Audit Logger
 */
export class AuditLogger {
  private logStream?: fs.WriteStream;
  private entries: AuditLogEntry[] = [];
  private maxEntriesInMemory = 1000;

  constructor(private logDir: string = AUDIT_LOG_DIR) {
    this.ensureLogDir();
    this.createLogStream();
  }

  /**
   * Ensure log directory exists
   */
  private ensureLogDir(): void {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  /**
   * Create or rotate log file
   */
  private createLogStream(): void {
    const date = new Date();
    const logFile = path.join(
      this.logDir,
      `audit-${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}.log`
    );

    this.logStream = fs.createWriteStream(logFile, { flags: 'a' });
  }

  /**
   * Log an action
   */
  log(entry: AuditLogEntry): void {
    entry.timestamp = Date.now();

    // Write to file
    if (this.logStream) {
      this.logStream.write(JSON.stringify(entry) + '\n');
    }

    // Keep in memory
    this.entries.push(entry);
    if (this.entries.length > this.maxEntriesInMemory) {
      this.entries.shift();
    }

    // Log important actions
    if (['delete', 'update', 'config_change'].includes(entry.action)) {
      logger.info('AuditLog', `${entry.action} on ${entry.resource}`, {
        userId: entry.userId,
        ip: entry.ip
      });
    }
  }

  /**
   * Log metadata update
   */
  logMetadataUpdate(
    req: Request,
    resourceId: string,
    changes: Record<string, { before: unknown; after: unknown }>
  ): void {
    const user = (req as any).user;
    this.log({
      userId: user?.id,
      action: 'metadata_update',
      resource: 'metadata',
      method: req.method,
      path: req.path,
      ip: req.ip || 'unknown',
      userAgent: req.get('user-agent'),
      changes,
      metadata: { resourceId }
    });
  }

  /**
   * Log configuration change
   */
  logConfigChange(
    userId: string,
    changes: Record<string, { before: unknown; after: unknown }>,
    metadata?: Record<string, unknown>
  ): void {
    this.log({
      userId,
      action: 'config_change',
      resource: 'configuration',
      method: 'UPDATE',
      path: '/config',
      ip: 'internal',
      changes,
      metadata
    });
  }

  /**
   * Log API call
   */
  logApiCall(
    req: Request,
    statusCode: number,
    error?: string
  ): void {
    const user = (req as any).user;
    this.log({
      userId: user?.id,
      action: 'api_call',
      resource: req.path.split('/')[1] || 'root',
      method: req.method,
      path: req.path,
      statusCode,
      ip: req.ip || 'unknown',
      userAgent: req.get('user-agent'),
      error
    });
  }

  /**
   * Log permission denial
   */
  logPermissionDenied(
    req: Request,
    reason: string
  ): void {
    const user = (req as any).user;
    this.log({
      userId: user?.id,
      action: 'permission_denied',
      resource: req.path,
      method: req.method,
      path: req.path,
      ip: req.ip || 'unknown',
      userAgent: req.get('user-agent'),
      error: reason
    });
  }

  /**
   * Log security event
   */
  logSecurityEvent(
    event: string,
    severity: 'low' | 'medium' | 'high' | 'critical',
    metadata: Record<string, unknown>
  ): void {
    this.log({
      action: `security_event_${severity}`,
      resource: event,
      method: 'SECURITY',
      path: '/security',
      ip: metadata.ip as string || 'unknown',
      metadata
    });

    if (severity === 'critical') {
      logger.error('AuditLog', `CRITICAL SECURITY EVENT: ${event}`, new Error(event), metadata);
    }
  }

  /**
   * Query audit logs
   */
  query(options: {
    userId?: string;
    action?: string;
    resource?: string;
    startTime?: number;
    endTime?: number;
    limit?: number;
  }): AuditLogEntry[] {
    let results = [...this.entries];

    if (options.userId) {
      results = results.filter(e => e.userId === options.userId);
    }

    if (options.action) {
      results = results.filter(e => e.action === options.action);
    }

    if (options.resource) {
      results = results.filter(e => e.resource === options.resource);
    }

    if (options.startTime) {
      results = results.filter(e => e.timestamp >= options.startTime!);
    }

    if (options.endTime) {
      results = results.filter(e => e.timestamp <= options.endTime!);
    }

    // Sort by timestamp descending
    results.sort((a, b) => b.timestamp - a.timestamp);

    if (options.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  /**
   * Get audit logs by date range
   */
  getByDateRange(startDate: Date, endDate: Date): AuditLogEntry[] {
    const startTime = startDate.getTime();
    const endTime = endDate.getTime();
    return this.query({ startTime, endTime });
  }

  /**
   * Get activity by user
   */
  getUserActivity(userId: string, limit: number = 100): AuditLogEntry[] {
    return this.query({ userId, limit });
  }

  /**
   * Get critical events
   */
  getCriticalEvents(limit: number = 50): AuditLogEntry[] {
    const critical = this.entries.filter(
      e => e.action.includes('security') || e.action === 'permission_denied'
    );

    return critical
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  /**
   * Export logs to file
   */
  exportLogs(outputPath: string, options?: any): void {
    try {
      const entries = this.query(options || {});
      fs.writeFileSync(outputPath, JSON.stringify(entries, null, 2), 'utf-8');
      logger.info('AuditLogger', 'Logs exported', { outputPath, count: entries.length });
    } catch (error) {
      logger.error('AuditLogger', 'Failed to export logs', error as Error);
      throw error;
    }
  }

  /**
   * Cleanup old logs (retention policy)
   */
  cleanupOldLogs(daysToKeep: number = 90): void {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      const files = fs.readdirSync(this.logDir);
      let deletedCount = 0;

      for (const file of files) {
        if (file.startsWith('audit-') && file.endsWith('.log')) {
          const filePath = path.join(this.logDir, file);
          const stats = fs.statSync(filePath);

          if (stats.mtimeMs < cutoffDate.getTime()) {
            fs.unlinkSync(filePath);
            deletedCount++;
          }
        }
      }

      logger.info('AuditLogger', 'Old logs cleaned up', { deletedCount, daysToKeep });
    } catch (error) {
      logger.error('AuditLogger', 'Failed to cleanup old logs', error as Error);
    }
  }

  /**
   * Close log stream
   */
  close(): void {
    if (this.logStream) {
      this.logStream.end();
    }
  }

  /**
   * Get statistics
   */
  getStatistics(): {
    totalEntries: number;
    entriesByAction: Record<string, number>;
    entriesByResource: Record<string, number>;
  } {
    const stats = {
      totalEntries: this.entries.length,
      entriesByAction: {} as Record<string, number>,
      entriesByResource: {} as Record<string, number>
    };

    for (const entry of this.entries) {
      stats.entriesByAction[entry.action] = (stats.entriesByAction[entry.action] || 0) + 1;
      stats.entriesByResource[entry.resource] = (stats.entriesByResource[entry.resource] || 0) + 1;
    }

    return stats;
  }
}

// Singleton instance
let auditLoggerInstance: AuditLogger | null = null;

export function initializeAuditLogger(logDir?: string): AuditLogger {
  auditLoggerInstance = new AuditLogger(logDir);
  return auditLoggerInstance;
}

export function getAuditLogger(): AuditLogger {
  if (!auditLoggerInstance) {
    auditLoggerInstance = initializeAuditLogger();
  }
  return auditLoggerInstance;
}

export default getAuditLogger();
