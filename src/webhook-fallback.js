/**
 * Discord Webhook fallback for Rich Presence
 * Used when IPC-based RPC fails
 */

import fetch from 'node-fetch';
import logger from './logger.js';

export class DiscordWebhookFallback {
  constructor(webhookUrl) {
    this.webhookUrl = webhookUrl;
    this.enabled = this.validateWebhookUrl(webhookUrl);
  }

  /**
   * Validate webhook URL format
   */
  validateWebhookUrl(url) {
    if (!url) return false;
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.includes('discord.com') && url.includes('webhooks');
    } catch {
      return false;
    }
  }

  /**
   * Send activity as Discord embed to webhook
   */
  async sendActivity(activity, metadata) {
    if (!this.enabled) {
      throw new Error('Webhook fallback not configured or invalid');
    }

    try {
      const embed = this.buildEmbed(activity, metadata);
      
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          embeds: [embed],
          username: 'VLCord',
          avatar_url: 'https://www.videolan.org/images/vlc128.png'
        })
      });

      if (!response.ok) {
        throw new Error(`Webhook failed: ${response.status} ${response.statusText}`);
      }

      logger.debug('Activity sent via Discord webhook', 'WebhookFallback');
      return true;
    } catch (error) {
      logger.error(`Webhook send failed: ${error.message}`, 'WebhookFallback');
      throw error;
    }
  }

  /**
   * Build Discord embed from activity
   */
  buildEmbed(activity, metadata) {
    const embed = {
      title: activity.details || 'Now Watching',
      description: activity.state || '',
      color: 0xFF6600, // VLC orange
      timestamp: new Date().toISOString(),
      fields: [],
      thumbnail: activity.assets?.large_image ? {
        url: activity.assets.large_image
      } : undefined
    };

    // Add metadata fields
    if (metadata) {
      if (metadata.year) {
        embed.fields.push({ name: 'Year', value: String(metadata.year), inline: true });
      }
      if (metadata.season && metadata.episode) {
        embed.fields.push({
          name: 'Episode',
          value: `S${metadata.season}E${metadata.episode}`,
          inline: true
        });
      }
      if (metadata.tmdbUrl) {
        embed.fields.push({
          name: 'More Info',
          value: `[View on TMDb](${metadata.tmdbUrl})`,
          inline: false
        });
      }
    }

    // Add buttons as fields if available
    if (activity.buttons && Array.isArray(activity.buttons)) {
      const buttonLinks = activity.buttons
        .map(btn => `[${btn.label}](${btn.url})`)
        .join(' • ');
      
      if (buttonLinks) {
        embed.fields.push({
          name: 'Links',
          value: buttonLinks,
          inline: false
        });
      }
    }

    return embed;
  }

  /**
   * Get fallback status
   */
  getStatus() {
    return {
      enabled: this.enabled,
      configured: !!this.webhookUrl
    };
  }
}
