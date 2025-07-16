import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { VLCMonitor } from './vlc-monitor.js';
import { DiscordPresence } from './discord-presence.js';
import { ConfigManager } from './config-manager.js';

import { VLCSetupHelper } from './vlc-setup-helper.js';

// Load environment variables
dotenv.config();

// Get directory path
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize configuration manager
const configManager = new ConfigManager();
const config = configManager.getConfig();

// Configuration with fallback to env vars
const PORT = process.env.PORT || 7100;
const VLC_HOST = process.env.VLC_HOST || config.vlcHost;
const VLC_PORT = process.env.VLC_PORT || config.vlcPort;
const VLC_PASSWORD = process.env.VLC_PASSWORD || config.vlcPassword;
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || config.discordClientId;
const TMDB_API_KEY = process.env.TMDB_API_KEY || config.tmdbApiKey;

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

// API endpoints for direct Discord control
app.get('/api/discord/status', (req, res) => {
  res.json(discordPresence.getConnectionStatus());
});

app.post('/api/discord/connect', (req, res) => {
  discordPresence.initialize();
  res.json({ message: 'Discord connection initiated' });
});

app.post('/api/discord/disconnect', (req, res) => {
  discordPresence.disconnect();
  res.json({ message: 'Discord disconnected' });
});

app.post('/api/discord/clear', (req, res) => {
  discordPresence.clearPresence();
  res.json({ message: 'Discord presence cleared' });
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

app.post('/api/config', (req, res) => {
  const saved = configManager.saveConfig(req.body);
  res.json({ success: saved });
});

// Test VLC Connection endpoint
app.get('/api/test-vlc-connection', async (req, res) => {
  try {
    const result = await vlcSetupHelper.testConnection();
    res.json(result);
  } catch (error) {
    res.status(500).json({ connected: false, message: error.message });
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
  pollingInterval: 1000 // Poll every second
});

// Initialize Discord Presence
const discordPresence = new DiscordPresence({
  clientId: DISCORD_CLIENT_ID
});

// Set up WebSocket communication
io.on('connection', (socket) => {
  console.log('Client connected');
  
  // Send current status on connection
  socket.emit('vlcStatus', vlcMonitor.getCurrentStatus());
  socket.emit('discordStatus', discordPresence.getConnectionStatus());
  socket.emit('config', {
    vlcHost: VLC_HOST,
    vlcPort: VLC_PORT,
    vlcPassword: VLC_PASSWORD,
    discordClientId: DISCORD_CLIENT_ID,
    tmdbApiKey: TMDB_API_KEY
  });
  
  // Handle configuration updates
  socket.on('updateConfig', (newConfig) => {
    console.log('Saving configuration...');
    
    // Save configuration
    const saved = configManager.saveConfig(newConfig);
    
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
    console.log('Client disconnected');
  });
});

// VLC status update events
vlcMonitor.on('statusUpdate', (status) => {
  io.emit('vlcStatus', status);
  
  // Update Discord presence based on VLC status
  if (status.connected) {
    discordPresence.updatePresence(status);
  } else {
    discordPresence.clearPresence();
  }
});

// Discord connection status events
discordPresence.on('connectionUpdate', (status) => {
  io.emit('discordStatus', status);
});

// Start server
server.listen(PORT, () => {
  console.log(`VLCord server running on http://localhost:${PORT}`);
  
  // Start VLC monitoring
  vlcMonitor.start();
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down...');
  vlcMonitor.stop();
  discordPresence.disconnect();
  process.exit(0);
});
