import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import fs from 'fs';
import logger from './logger.js';
import { VLCMonitor } from './vlc-monitor.js';
import { DiscordPresence } from './discord-presence.js';
import { ConfigManager } from './config-manager.js';
import client from 'prom-client';
import { getDiscordClientInfo } from './discord-client-detector.js';
import { VLCSetupHelper } from './vlc-setup-helper.js';
import { validateEnvironment, validateConfig } from './env-validator.js';
import { validateDiscordClientId, validateTmdbApiKey } from './input-validator.js';
import { circuitBreakerManager } from './circuit-breaker.js';
import { activityHistory } from './activity-history.js';
import { metadataDb } from './metadata-overrides-db.js';
import { HealthCheckManager } from './health-check-enhanced.ts';
import { RedisCacheManager } from './redis-cache.ts';
import { ConfigHotReloadManager } from './config-hot-reload.ts';

// Load environment variables
dotenv.config();

// Validate environment BEFORE doing anything else
validateEnvironment();

// Get directory path
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Main async function
async function main() {
  // Initialize metadata overrides database
  await metadataDb.init();

// Initialize health check manager
const healthCheckManager = new HealthCheckManager();

// Initialize Redis cache manager (optional - graceful degradation if Redis unavailable)
const cacheManager = new RedisCacheManager();
if (process.env.REDIS_ENABLED === 'true' || process.env.REDIS_ENABLED === '1') {
  try {
    await cacheManager.connect();
    logger.info('Redis cache connected successfully');
  } catch (error) {
    logger.warn('Redis cache initialization failed, continuing without caching:', error.message);
  }
}

// Initialize configuration manager
const configManager = new ConfigManager();
await configManager.init();
const config = configManager.getConfig();

// Validate config
if (!validateConfig(config)) {
  process.exit(1);
}

// Initialize config hot-reload manager with explicit config path
const CONFIG_PATH = process.env.VLCORD_CONFIG_PATH || path.join(__dirname, '..', 'vlcord-config.json');
const configHotReload = new ConfigHotReloadManager(CONFIG_PATH);

// Configuration with fallback to env vars
const PORT = process.env.WEB_PORT || process.env.PORT || 7100;
const VLC_HOST = process.env.VLC_HOST || config.vlcHost;
const VLC_PORT = process.env.VLC_PORT || config.vlcPort;
const VLC_PASSWORD = process.env.VLC_PASSWORD || config.vlcPassword;
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || config.discordClientId;
const TMDB_API_KEY = process.env.TMDB_API_KEY || config.tmdbApiKey;
// NOTE: admin token can be edited in vlcord-config.json; env var takes precedence.

function normalizeToken(value: unknown): string {
  return String(value ?? '').trim();
}

function getExpectedAdminToken(): string {
  const envToken = normalizeToken(process.env.VLCORD_ADMIN_TOKEN);
  if (envToken) return envToken;

  // Prefer in-memory config, but fall back to reading from disk in case the file
  // was edited outside of the app (common during setup).
  const configToken = normalizeToken(configManager.getConfig()?.adminToken);
  if (configToken) return configToken;

  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return normalizeToken(parsed?.adminToken);
  } catch {
    return '';
  }
}

// Validate critical IDs
try {
  validateDiscordClientId(DISCORD_CLIENT_ID);
  validateTmdbApiKey(TMDB_API_KEY);
} catch (error) {
  logger.error(error.message);
  process.exit(1);
}

// Initialize Express app
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Enable CORS
app.use(cors());
app.use(express.json());

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '../public')));

// Initialize VLC setup helper
const vlcSetupHelper = new VLCSetupHelper();

// Simple admin auth middleware for sensitive endpoints
function requireAdmin(req, res, next) {
  const authHeader = req.header('Authorization') || '';
  const bearer = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7) : '';
  const token = normalizeToken(req.header('X-VLCORD-ADMIN-TOKEN') || bearer || req.query.adminToken || req.body?.adminToken);
  const expected = getExpectedAdminToken();

  if (!expected) {
    return res.status(500).json({ error: 'admin_token_not_configured' });
  }

  if (!token || token !== expected) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

// API endpoints for direct Discord control
app.get('/api/discord/status', (req, res) => {
  res.json(discordPresence.getConnectionStatus());
});

app.post('/api/discord/connect', requireAdmin, (req, res) => {
  discordPresence.initialize();
  res.json({ message: 'Discord connection initiated' });
});

app.post('/api/discord/disconnect', requireAdmin, (req, res) => {
  discordPresence.disconnect();
  res.json({ message: 'Discord disconnected' });
});

app.post('/api/discord/clear', requireAdmin, (req, res) => {
  discordPresence.clearPresence();
  res.json({ message: 'Discord presence cleared' });
});

app.get('/api/discord/client-info', async (req, res) => {
  try {
    const clientInfo = await getDiscordClientInfo();
    res.json(clientInfo);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/discord/last-payload', requireAdmin, (req, res) => {
  try {
    const payload = discordPresence.lastSentPayload || null;
    res.json({ lastPayload: payload });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Activity history endpoint
app.get('/api/discord/activity-history', requireAdmin, (req, res) => {
  try {
    const count = Math.min(parseInt(req.query.count || 20), 100);
    const history = activityHistory.getRecent(count);
    const stats = activityHistory.getStats();
    res.json({ history, stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Monitor pause/resume endpoint
app.post('/api/monitor/pause', requireAdmin, (req, res) => {
  if (vlcMonitor) {
    vlcMonitor.isPaused = true;
    res.json({ message: 'Monitoring paused', isPaused: true });
  } else {
    res.status(500).json({ error: 'Monitor not initialized' });
  }
});

app.post('/api/monitor/resume', requireAdmin, (req, res) => {
  if (vlcMonitor) {
    vlcMonitor.isPaused = false;
    res.json({ message: 'Monitoring resumed', isPaused: false });
  } else {
    res.status(500).json({ error: 'Monitor not initialized' });
  }
});

// Metadata overrides management
app.get('/api/metadata/overrides', requireAdmin, (req, res) => {
  try {
    const overrides = metadataDb.getAll();
    res.json(overrides);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/metadata/overrides', requireAdmin, async (req, res) => {
  try {
    const { category, title, override } = req.body;
    if (!category || !title || !override) {
      return res.status(400).json({ error: 'category, title, and override are required' });
    }
    await metadataDb.set(category, title, override);
    res.json({ message: 'Override added', override });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/metadata/overrides', requireAdmin, async (req, res) => {
  try {
    const { category, title } = req.body;
    if (!category || !title) {
      return res.status(400).json({ error: 'category and title are required' });
    }
    await metadataDb.remove(category, title);
    res.json({ message: 'Override removed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Circuit breaker status endpoint
app.get('/api/system/circuit-breakers', requireAdmin, (req, res) => {
  try {
    const states = circuitBreakerManager.getStates();
    res.json({ breakers: states });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Circuit breaker reset endpoint
app.post('/api/system/circuit-breakers/:service/reset', requireAdmin, (req, res) => {
  try {
    const { service } = req.params;
    const breaker = circuitBreakerManager.get(service);
    
    if (!breaker) {
      return res.status(404).json({ error: `Circuit breaker for service "${service}" not found` });
    }
    
    breaker.reset();
    logger.info(`Circuit breaker reset for service: ${service}`);
    
    res.json({
      message: `Circuit breaker reset for ${service}`,
      service,
      state: breaker.getState()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Enhanced health diagnostics endpoint
app.get('/api/system/health/diagnostics', requireAdmin, (req, res) => {
  try {
    const diagnostics = healthCheckManager.getDiagnostics();
    const services = (diagnostics as any)?.services || {};
    const serviceNames = Object.keys(services);
    const totals = serviceNames.reduce(
      (acc, name) => {
        const item = services[name] || {};
        acc.failures += Number(item.failures || 0);
        acc.successes += Number(item.successes || 0);
        return acc;
      },
      { failures: 0, successes: 0 }
    );

    res.json({
      status: 'ok',
      summary: {
        uptimeMs: (diagnostics as any)?.uptime ?? null,
        services: serviceNames,
        totalFailures: totals.failures,
        totalSuccesses: totals.successes,
      },
      diagnostics,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Service-specific health endpoint
app.get('/api/system/health/:service', requireAdmin, (req, res) => {
  try {
    const { service } = req.params;
    const health = healthCheckManager.getServiceHealth(service);
    
    if (!health) {
      return res.status(404).json({ error: `Service "${service}" not found` });
    }
    
    res.json(health);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// System logs endpoint (for dashboard live log viewer)
app.get('/api/system/logs', requireAdmin, (req, res) => {
  try {
    const count = Math.min(parseInt(req.query.count || 50), 200);
    
    // Return system logs - in production this would come from a structured log store
    // For now, return activity history as proxy for system activity
    const logs = activityHistory.getRecent(count).map(entry => ({
      timestamp: entry.timestamp,
      level: entry.status === 'success' ? 'info' : 'error',
      message: `Discord: ${entry.title} (${entry.status})`,
      details: entry.error || 'Update successful'
    }));
    
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Cache status endpoint (if Redis enabled)
app.get('/api/system/cache/status', requireAdmin, (req, res) => {
  try {
    if (!cacheManager.getConnectionStatus()) {
      return res.json({
        enabled: false,
        connected: false,
        message: 'Redis cache not enabled or not connected'
      });
    }
    
    const stats = cacheManager.getStats();
    res.json({
      enabled: true,
      connected: true,
      ...stats
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// VLC setup and diagnostic endpoints
app.post('/api/vlc/test', async (req, res) => {
  const { host, port, password } = req.body;
  const result = await vlcSetupHelper.testVLCConnection(host, port, password);
  res.json(result);
});

app.get('/api/vlc/setup-info', async (req, res) => {
  const systemInfo = await vlcSetupHelper.getSystemInfo();
  res.json(systemInfo);
});

app.get('/api/config', (req, res) => {
  res.json(configManager.getConfig());
});

app.post('/api/config', requireAdmin, async (req, res) => {
  const saved = await configManager.saveConfig(req.body);
  res.json({ success: saved });
});

// Health endpoint - enhanced with connection status and diagnostics
app.get('/health', (req, res) => {
  try {
    const health = healthCheckManager.getHealth(
      circuitBreakerManager.getStates(),
      activityHistory.getStats()
    );
    res.status(health.status === 'healthy' ? 200 : 503).json(health);
  } catch (error) {
    logger.error('Health check error:', error.message);
    res.status(500).json({
      status: 'unhealthy',
      error: 'Health check failed',
      timestamp: new Date().toISOString()
    });
  }
});

// Prometheus metrics
const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics({ timeout: 5000 });

app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', client.register.contentType);
    res.end(await client.register.metrics());
  } catch (err) {
    res.status(500).end(err.message);
  }
});

// Download VLC Shortcut endpoint
app.get('/api/download-vlc-shortcut', (req, res) => {
  try {
    const shortcutPath = vlcSetupHelper.createVLCShortcut();
    res.download(shortcutPath, 'VLC_Web_Interface.lnk');
  } catch (error) {
    res.status(500).json({ error: 'Failed to create VLC shortcut', message: error.message });
  }
});

// Initialize VLC Monitor
const vlcMonitor = new VLCMonitor({
  host: VLC_HOST,
  port: VLC_PORT,
  password: VLC_PASSWORD,
  tmdbApiKey: TMDB_API_KEY,
  pollingInterval: process.env.VLC_POLL_INTERVAL ? parseInt(process.env.VLC_POLL_INTERVAL, 10) : 1000 // Poll every second by default
});

// Initialize Discord Presence (skip if disabled)
const discordPresence = process.env.DISABLE_DISCORD === 'true' 
  ? { 
      initialize: () => {}, 
      disconnect: () => {}, 
      clearPresence: () => {}, 
      updatePresence: () => {}, 
      updateConfig: () => {},
      on: () => {},
      getConnectionStatus: () => ({ connected: false, clientConnected: false })
    }
  : new DiscordPresence({
      clientId: DISCORD_CLIENT_ID
    });

// Start watching config only after core services are initialized
configHotReload.watchConfig(async (newConfig) => {
  logger.info('Configuration hot-reloaded:', Object.keys(newConfig || {}).join(', '));

  // Notify dashboard clients
  io.emit('configHotReload', {
    timestamp: new Date().toISOString(),
    keys: Object.keys(newConfig || {}),
    changedKeys: Object.keys(newConfig || {}),
  });

  // Update VLC monitor if VLC settings changed
  if (newConfig.vlcHost || newConfig.vlcPort || newConfig.vlcPassword || newConfig.tmdbApiKey) {
    vlcMonitor.updateConfig({
      host: newConfig.vlcHost || VLC_HOST,
      port: newConfig.vlcPort || VLC_PORT,
      password: newConfig.vlcPassword || VLC_PASSWORD,
      tmdbApiKey: newConfig.tmdbApiKey || TMDB_API_KEY
    });
  }

  // Update Discord presence if client ID changed
  if (newConfig.discordClientId) {
    discordPresence.updateConfig({
      clientId: newConfig.discordClientId
    });
  }

  // Clear cache if config changed (helps with consistency)
  if (cacheManager.getConnectionStatus()) {
    await cacheManager.clear('*');
  }
});

// Set up WebSocket communication
io.on('connection', (socket) => {
  logger.info('Client connected');
  
  // Send current status on connection
  socket.emit('vlcStatus', vlcMonitor.getCurrentStatus());
  socket.emit('discordStatus', discordPresence.getConnectionStatus());
  socket.emit('config', {
    vlcHost: VLC_HOST,
    vlcPort: VLC_PORT,
    vlcPassword: VLC_PASSWORD,
    discordClientId: DISCORD_CLIENT_ID,
    tmdbApiKey: TMDB_API_KEY,
    // Prefill for single-machine installs (env token takes precedence)
    adminToken: getExpectedAdminToken()
  });

  // Listen for Discord client type errors
  discordPresence.on('discordClientTypeError', (errorInfo) => {
    socket.emit('discordClientTypeError', errorInfo);
  });
  
  // Listen for general Discord connection updates
  discordPresence.on('connectionUpdate', (status) => {
    socket.emit('discordStatus', status);
  });
  
  // Handle configuration updates
  socket.on('updateConfig', async (newConfig) => {
    logger.info('Saving configuration...');
    
    // Save configuration
    const saved = await configManager.saveConfig(newConfig);
    
    if (saved) {
      // Update VLC monitor
      if (newConfig.vlcHost || newConfig.vlcPort || newConfig.vlcPassword || newConfig.tmdbApiKey) {
        vlcMonitor.updateConfig({
          host: newConfig.vlcHost || VLC_HOST,
          port: newConfig.vlcPort || VLC_PORT,
          password: newConfig.vlcPassword || VLC_PASSWORD,
          tmdbApiKey: newConfig.tmdbApiKey || TMDB_API_KEY
        });
      }
      
      // Update Discord presence
      if (newConfig.discordClientId) {
        discordPresence.updateConfig({
          clientId: newConfig.discordClientId
        });
      }
      
      socket.emit('configUpdated', { success: true, message: 'Configuration saved successfully!' });
    } else {
      socket.emit('configUpdated', { success: false, message: 'Failed to save configuration' });
    }
  });
  
  socket.on('disconnect', () => {
    logger.info('Client disconnected');
  });
});

// VLC status update events
vlcMonitor.on('statusUpdate', (status) => {
  io.emit('vlcStatus', status);
  
  // Update health check manager
  if (status.connected && status.file) {
    healthCheckManager.recordSuccess('vlc');
  } else if (!status.connected) {
    healthCheckManager.recordFailure('vlc');
  }
  
  // Update Discord presence based on VLC status
  if (status.connected) {
    discordPresence.updatePresence(status);
    healthCheckManager.recordSuccess('discord');
  } else {
    discordPresence.clearPresence();
    healthCheckManager.recordFailure('discord');
  }
});

// Discord connection status events
discordPresence.on('connectionUpdate', (status) => {
  io.emit('discordStatus', status);
});

// Start server
server.listen(PORT, () => {
  logger.info(`VLCord server running on http://localhost:${PORT}`);
  
  // Start VLC monitoring
  vlcMonitor.start();
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  logger.info('Shutting down...');
  vlcMonitor.stop();
  discordPresence.disconnect();
  if (cacheManager.getConnectionStatus()) {
    cacheManager.disconnect().catch(err => logger.warn('Error disconnecting cache:', err.message));
  }
  process.exit(0);
});
}

// Start the app
main().catch(err => {
  logger.error('Fatal error:', err);
  process.exit(1);
});
