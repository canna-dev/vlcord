/**
 * Enhanced Health Check & Status Monitoring
 */

import type { Request, Response } from 'express';
import type { CircuitBreakerStatus, ActivityStats } from './types.js';
import { getLogger } from './logger.js';

const logger = getLogger();

interface ServiceMetrics {
  name: string;
  isHealthy: boolean;
  lastSuccessfulUpdate: number | null;
  failureCount: number;
  successCount: number;
  lastCheckTime: number;
  recommendedAction?: string;
}

interface EnhancedHealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: number;
  uptime: number;
  version: string;
  connections: {
    discord: ServiceMetrics;
    vlc: ServiceMetrics;
    tmdb: ServiceMetrics;
    database: ServiceMetrics;
  };
  circuitBreakers: {
    [key: string]: CircuitBreakerStatus & {
      estimatedRecoveryTime: number;
      actionRequired: boolean;
    };
  };
  metrics: {
    totalUpdates: number;
    successfulUpdates: number;
    failedUpdates: number;
    successRate: number;
    averageUpdateTime: number;
    lastUpdate: number | null;
    updatesLastHour: number;
    failureRate: number;
  };
  systemResources?: {
    uptime: number;
    memoryUsage: NodeJS.MemoryUsage;
    cpuUsage: NodeJS.CpuUsage;
  };
  recommendations: string[];
}

/**
 * Enhanced Health Check Manager
 */
export class HealthCheckManager {
  private startTime: number = Date.now();
  private lastSuccessfulUpdates: Map<string, number> = new Map();
  private failureCounts: Map<string, number> = new Map();
  private successCounts: Map<string, number> = new Map();
  private hourlyUpdateCounts: number[] = []; // Track updates per hour
  private services: string[] = ['discord', 'vlc', 'tmdb', 'database'];

  constructor(private version: string = '1.0.0') {
    this.services.forEach(s => {
      this.lastSuccessfulUpdates.set(s, Date.now());
      this.failureCounts.set(s, 0);
      this.successCounts.set(s, 0);
    });

    // Track hourly updates
    setInterval(() => {
      this.hourlyUpdateCounts.push(0);
      if (this.hourlyUpdateCounts.length > 24) {
        this.hourlyUpdateCounts.shift();
      }
    }, 60 * 60 * 1000);
  }

  /**
   * Record successful update
   */
  recordSuccess(service: string, metadata?: Record<string, unknown>): void {
    this.lastSuccessfulUpdates.set(service, Date.now());
    const current = this.successCounts.get(service) || 0;
    this.successCounts.set(service, current + 1);

    if (this.hourlyUpdateCounts.length === 0) {
      this.hourlyUpdateCounts.push(1);
    } else {
      this.hourlyUpdateCounts[this.hourlyUpdateCounts.length - 1]++;
    }

    logger.debug('HealthCheck', `Service ${service} reported success`, metadata);
  }

  /**
   * Record failed update
   */
  recordFailure(service: string, error?: string): void {
    const current = this.failureCounts.get(service) || 0;
    this.failureCounts.set(service, current + 1);
    logger.warn('HealthCheck', `Service ${service} reported failure`, { error });
  }

  /**
   * Get current system health
   */
  getHealth(
    circuitBreakers?: Record<string, CircuitBreakerStatus>,
    activityStats?: ActivityStats
  ): EnhancedHealthResponse {
    const uptime = Date.now() - this.startTime;
    const recommendations: string[] = [];
    const connections: Record<string, ServiceMetrics> = {};

    // Calculate service health metrics
    for (const service of this.services) {
      const failures = this.failureCounts.get(service) || 0;
      const successes = this.successCounts.get(service) || 0;
      const total = failures + successes;
      const failureRate = total > 0 ? (failures / total) * 100 : 0;

      const lastSuccess = this.lastSuccessfulUpdates.get(service) || Date.now();
      const timeSinceSuccess = Date.now() - lastSuccess;
      const isHealthy = failures === 0 || failureRate < 5; // Healthy if <5% failures

      let recommendedAction: string | undefined;
      if (!isHealthy) {
        if (failureRate > 50) {
          recommendedAction = `High failure rate (${failureRate.toFixed(1)}%) - check service connection`;
          recommendations.push(`⚠️ ${service}: ${recommendedAction}`);
        } else if (timeSinceSuccess > 5 * 60 * 1000) {
          recommendedAction = `No successful update for ${Math.round(timeSinceSuccess / 1000)}s - may be offline`;
          recommendations.push(`⚠️ ${service}: ${recommendedAction}`);
        }
      }

      connections[service] = {
        name: service,
        isHealthy,
        lastSuccessfulUpdate: lastSuccess,
        failureCount: failures,
        successCount: successes,
        lastCheckTime: Date.now(),
        ...(recommendedAction && { recommendedAction })
      };
    }

    // Calculate overall metrics
    const totalUpdates = (activityStats?.totalUpdates || 0);
    const successfulUpdates = (activityStats?.successfulUpdates || 0);
    const failedUpdates = (activityStats?.failedUpdates || 0);
    const successRate = totalUpdates > 0 ? (successfulUpdates / totalUpdates) * 100 : 100;
    const failureRate = totalUpdates > 0 ? (failedUpdates / totalUpdates) * 100 : 0;
    const updatesLastHour = this.hourlyUpdateCounts.length > 0 
      ? this.hourlyUpdateCounts[this.hourlyUpdateCounts.length - 1]
      : 0;

    // Determine overall health status
    const healthyServices = Object.values(connections).filter(c => c.isHealthy).length;
    let status: 'healthy' | 'degraded' | 'unhealthy';

    if (healthyServices === this.services.length) {
      status = 'healthy';
    } else if (healthyServices >= this.services.length * 0.5) {
      status = 'degraded';
      recommendations.push('⚠️ System in degraded mode - some services offline');
    } else {
      status = 'unhealthy';
      recommendations.push('🚨 System unhealthy - majority of services offline');
    }

    // Add recommendations based on metrics
    if (failureRate > 10) {
      recommendations.push(`📊 High failure rate (${failureRate.toFixed(1)}%) - investigate recent errors`);
    }

    if ((activityStats?.averageUpdateTime || 0) > 5000) {
      recommendations.push(`⏱️ Slow updates (${activityStats?.averageUpdateTime || 0}ms avg) - check network/API performance`);
    }

    if (updatesLastHour === 0) {
      recommendations.push('⏸️ No updates in last hour - monitoring may be paused');
    }

    // Circuit breaker health
    if (circuitBreakers) {
      const enhancedCircuitBreakers: Record<string, any> = {};

      for (const [name, breaker] of Object.entries(circuitBreakers)) {
        const isOpen = breaker.state === 'OPEN';
        const estimatedRecoveryTime = isOpen && breaker.nextRetry
          ? Math.max(0, breaker.nextRetry - Date.now())
          : 0;

        enhancedCircuitBreakers[name] = {
          ...breaker,
          estimatedRecoveryTime,
          actionRequired: isOpen && breaker.failureCount > 5
        };

        if (isOpen) {
          recommendations.push(`🔴 Circuit breaker '${name}' is OPEN - service will recover in ${Math.round(estimatedRecoveryTime / 1000)}s`);
        }
      }

      return {
        status,
        timestamp: Date.now(),
        uptime,
        version: this.version,
        connections: connections as any,
        circuitBreakers: enhancedCircuitBreakers,
        metrics: {
          totalUpdates,
          successfulUpdates,
          failedUpdates,
          successRate: Math.round(successRate * 100) / 100,
          averageUpdateTime: Math.round((activityStats?.averageUpdateTime || 0) * 100) / 100,
          lastUpdate: activityStats?.lastUpdate || null,
          updatesLastHour,
          failureRate: Math.round(failureRate * 100) / 100
        },
        systemResources: {
          uptime: process.uptime(),
          memoryUsage: process.memoryUsage(),
          cpuUsage: process.cpuUsage()
        },
        recommendations: [...new Set(recommendations)] // Remove duplicates
      };
    }

    return {
      status,
      timestamp: Date.now(),
      uptime,
      version: this.version,
      connections: connections as any,
      circuitBreakers: {},
      metrics: {
        totalUpdates,
        successfulUpdates,
        failedUpdates,
        successRate: Math.round(successRate * 100) / 100,
        averageUpdateTime: Math.round((activityStats?.averageUpdateTime || 0) * 100) / 100,
        lastUpdate: activityStats?.lastUpdate || null,
        updatesLastHour,
        failureRate: Math.round(failureRate * 100) / 100
      },
      systemResources: {
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage()
      },
      recommendations
    };
  }

  /**
   * Get service-specific health
   */
  getServiceHealth(service: string): ServiceMetrics | null {
    if (!this.services.includes(service)) return null;

    const failures = this.failureCounts.get(service) || 0;
    const successes = this.successCounts.get(service) || 0;
    const total = failures + successes;
    const failureRate = total > 0 ? (failures / total) * 100 : 0;
    const lastSuccess = this.lastSuccessfulUpdates.get(service) || Date.now();

    return {
      name: service,
      isHealthy: failures === 0 || failureRate < 5,
      lastSuccessfulUpdate: lastSuccess,
      failureCount: failures,
      successCount: successes,
      lastCheckTime: Date.now()
    };
  }

  /**
   * Reset service counters
   */
  resetService(service: string): void {
    if (this.services.includes(service)) {
      this.failureCounts.set(service, 0);
      this.successCounts.set(service, 0);
      this.lastSuccessfulUpdates.set(service, Date.now());
      logger.info('HealthCheck', `Service ${service} metrics reset`);
    }
  }

  /**
   * Get detailed diagnostics
   */
  getDiagnostics(): Record<string, unknown> {
    return {
      startTime: this.startTime,
      uptime: Date.now() - this.startTime,
      services: Object.fromEntries(
        this.services.map(s => [
          s,
          {
            failures: this.failureCounts.get(s),
            successes: this.successCounts.get(s),
            lastSuccess: this.lastSuccessfulUpdates.get(s)
          }
        ])
      ),
      hourlyUpdates: this.hourlyUpdateCounts,
      nodeProcess: {
        uptime: process.uptime(),
        pid: process.pid,
        version: process.version,
        platform: process.platform,
        arch: process.arch
      }
    };
  }
}

// Singleton instance
let healthCheckManager: HealthCheckManager | null = null;

export function initializeHealthCheck(version?: string): HealthCheckManager {
  healthCheckManager = new HealthCheckManager(version);
  return healthCheckManager;
}

export function getHealthCheckManager(): HealthCheckManager {
  if (!healthCheckManager) {
    healthCheckManager = initializeHealthCheck();
  }
  return healthCheckManager;
}

export default getHealthCheckManager();
