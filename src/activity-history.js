/**
 * Activity history tracker and analyzer
 * Keeps track of last N Discord presence updates for debugging
 */

export class ActivityHistory {
  constructor(maxSize = 50) {
    this.history = [];
    this.maxSize = maxSize;
  }

  /**
   * Record an activity update
   */
  record(activity, metadata = null, status = 'sent') {
    if (this.history.length >= this.maxSize) {
      this.history.shift();
    }

    this.history.push({
      timestamp: Date.now(),
      activity,
      metadata,
      status, // 'sent', 'failed', 'buffered', etc.
      age: 0
    });
  }

  /**
   * Get recent activities
   */
  getRecent(count = 10) {
    return this.history
      .slice(-count)
      .reverse()
      .map(item => ({
        ...item,
        age: Date.now() - item.timestamp,
        relativeTime: this.formatRelativeTime(Date.now() - item.timestamp)
      }));
  }

  /**
   * Get all activities
   */
  getAll() {
    return this.getRecent(this.maxSize);
  }

  /**
   * Filter by status
   */
  filterByStatus(status) {
    return this.history
      .filter(item => item.status === status)
      .map(item => ({
        ...item,
        age: Date.now() - item.timestamp
      }));
  }

  /**
   * Get statistics
   */
  getStats() {
    const statuses = {};
    const startTimes = {};

    this.history.forEach(item => {
      statuses[item.status] = (statuses[item.status] || 0) + 1;

      if (item.activity?.timestamps?.start) {
        const key = item.activity.timestamps.start;
        if (!startTimes[key]) {
          startTimes[key] = 0;
        }
        startTimes[key]++;
      }
    });

    return {
      totalRecorded: this.history.length,
      byStatus: statuses,
      mostFrequentStartTime: Object.entries(startTimes)
        .sort(([,a], [,b]) => b - a)[0]?.[0]
    };
  }

  /**
   * Clear history
   */
  clear() {
    this.history = [];
  }

  /**
   * Format milliseconds as relative time string
   */
  formatRelativeTime(ms) {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }
}

// Global instance
export const activityHistory = new ActivityHistory();
