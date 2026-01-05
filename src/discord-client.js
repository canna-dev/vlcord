import { EventEmitter } from 'events';
import DiscordRPC from 'discord-rpc';

export class DiscordClient extends EventEmitter {
  constructor() {
    super();
    this.client = null;
    this.connected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectTimeout = null;
  }

  async init(clientId) {
    try {
      if (!clientId) throw new Error('Missing Discord clientId');
      DiscordRPC.register(clientId);
      this.client = new DiscordRPC.Client({ transport: 'ipc' });

      this.client.on('ready', () => {
        this.connected = true;
        this.reconnectAttempts = 0;
        this.emit('ready', this.client.user);
      });

      this.client.on('disconnected', () => {
        this.connected = false;
        this.emit('disconnected');
      });

      this.client.on('error', (err) => {
        this.connected = false;
        // Check if this is a Discord client type error
        const errorMsg = err.message || '';
        if (errorMsg.includes('ENOENT') || errorMsg.includes('pipe') || errorMsg.includes('IPC')) {
          this.emit('discordClientError', {
            type: 'WRONG_DISCORD_CLIENT',
            message: 'Discord Desktop app not detected. VLCord requires the Discord Desktop application with RPC support, not the Web version.',
            details: 'IPC (Inter-Process Communication) connection failed. Make sure you have Discord Desktop installed and running.',
            solutions: [
              'Install Discord Desktop from https://discord.com/download',
              'Make sure Discord Desktop is running before starting VLCord',
              'Disable browser Discord if you have it open, as it may interfere with IPC communication',
              'Check that Discord is not running in a sandboxed/restricted environment'
            ]
          });
        }
        this.emit('error', err);
      });

      await this.client.login({ clientId });
      return this.client;
    } catch (err) {
      this.connected = false;
      // Detect Discord client type issues
      const errorMsg = err.message || '';
      if (errorMsg.includes('ENOENT') || errorMsg.includes('pipe') || errorMsg.includes('Could not find Discord') || errorMsg.includes('IPC')) {
        this.emit('discordClientError', {
          type: 'WRONG_DISCORD_CLIENT',
          message: 'Discord Desktop app not detected. VLCord requires the Discord Desktop application with RPC support, not the Web version.',
          details: 'Unable to connect via IPC. Discord Desktop may not be installed or running.',
          solutions: [
            'Install Discord Desktop from https://discord.com/download',
            'Make sure Discord Desktop is running before starting VLCord',
            'Disable browser Discord if you have it open, as it may interfere with IPC communication',
            'Check that Discord is not running in a sandboxed/restricted environment',
            'Try restarting both Discord and VLCord'
          ]
        });
      }
      this.emit('error', err);
      throw err;
    }
  }

  async request(method, payload) {
    if (!this.client) throw new Error('Discord client not initialized');
    return this.client.request(method, payload);
  }

  async setActivity(activity) {
    if (!this.client) throw new Error('Discord client not initialized');
    // Provide compatibility: prefer request SET_ACTIVITY, fallback to setActivity
    try {
      await this.client.request('SET_ACTIVITY', { pid: process.pid, activity });
    } catch (e) {
      await this.client.setActivity(activity);
    }
  }

  async destroy() {
    if (this.client) {
      try {
        await this.client.destroy();
      } catch (e) {
        // ignore
      }
    }
    this.client = null;
    this.connected = false;
  }
}

export default DiscordClient;
