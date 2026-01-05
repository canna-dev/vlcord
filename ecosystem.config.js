/**
 * PM2 Ecosystem Configuration for VLCord
 * 
 * Usage:
 *   pm2 start ecosystem.config.js
 *   pm2 restart vlcord
 *   pm2 logs vlcord
 *   pm2 stop vlcord
 */

module.exports = {
  apps: [
    {
      name: 'vlcord',
      script: './src/main.ts',
      instances: 1,
      exec_mode: 'fork',
      
      // Environment variables
      env: {
        NODE_ENV: 'production',
        WEB_PORT: 7100
      },
      
      // File watching (auto-restart on changes)
      watch: false,
      ignore_watch: ['node_modules', 'logs', 'data', '.git', 'public'],
      
      // Logging
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_file: './logs/combined.log',
      time_format: 'YYYY-MM-DD HH:mm:ss Z',
      
      // Restart policies
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      max_memory_restart: '500M',
      
      // Graceful shutdown
      kill_timeout: 5000,
      listen_timeout: 3000,
      
      // Cluster mode (optional - use if running multiple instances)
      // instances: 2,
      // exec_mode: 'cluster',
      // Note: Requires shared Redis cache for state consistency
    }
  ],

  /**
   * Deployment configuration
   * Usage: pm2 deploy ecosystem.config.js production
   */
  deploy: {
    production: {
      user: 'vlcord',
      host: 'your-server.com',
      ref: 'origin/main',
      repo: 'git@github.com:your-username/vlcord.git',
      path: '/var/www/vlcord',
      
      // Pre-deployment commands
      'pre-deploy-local': '',
      
      // Post-deployment commands
      'post-deploy': 'npm install && npm start',
      
      // Pre-deployment on remote
      'pre-deploy': 'git fetch --all',
    },
    
    staging: {
      user: 'vlcord',
      host: 'staging.your-server.com',
      ref: 'origin/develop',
      repo: 'git@github.com:your-username/vlcord.git',
      path: '/var/www/vlcord-staging',
      'post-deploy': 'npm install && npm start',
    }
  }
};
