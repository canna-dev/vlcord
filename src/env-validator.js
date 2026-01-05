import logger from './logger.js';

/**
 * Validate all required environment variables and configuration at startup
 * Fail fast with helpful error messages
 */
export function validateEnvironment() {
  const required = {
    DISCORD_CLIENT_ID: 'Discord Client ID (get from Discord Developer Portal)',
    TMDB_API_KEY: 'TMDb API Key (get from https://www.themoviedb.org/settings/api)',
    VLC_HOST: 'VLC host (usually localhost)',
    VLC_PORT: 'VLC port (usually 8080)',
    VLC_PASSWORD: 'VLC HTTP interface password'
  };

  const missing = [];
  const invalid = [];

  for (const [key, description] of Object.entries(required)) {
    const value = process.env[key];
    
    if (!value || value.trim() === '') {
      missing.push(`${key}: ${description}`);
      continue;
    }

    // Additional validation for specific vars
    if (key === 'DISCORD_CLIENT_ID' && !/^\d{15,}$/.test(value)) {
      invalid.push(`${key}: Must be a valid Discord Client ID (numeric, 15+ digits)`);
    }
    if (key === 'TMDB_API_KEY' && value.length < 20) {
      invalid.push(`${key}: TMDb API key looks too short`);
    }
    if (key === 'VLC_PORT' && (isNaN(parseInt(value)) || parseInt(value) < 1 || parseInt(value) > 65535)) {
      invalid.push(`${key}: Must be a valid port number (1-65535)`);
    }
  }

  if (missing.length > 0 || invalid.length > 0) {
    logger.error('🚨 Configuration Error: Missing or invalid environment variables\n');
    
    if (missing.length > 0) {
      logger.error('Missing required environment variables:');
      missing.forEach(m => logger.error(`  • ${m}`));
    }
    
    if (invalid.length > 0) {
      logger.error('\nInvalid environment variables:');
      invalid.forEach(i => logger.error(`  • ${i}`));
    }

    logger.error('\nPlease set these variables in your .env file and restart.');
    process.exit(1);
  }

  logger.info('✓ Environment validation passed');
}

/**
 * Validate configuration values
 */
export function validateConfig(config) {
  const errors = [];

  if (config.vlcPort < 1 || config.vlcPort > 65535) {
    errors.push('VLC port must be between 1 and 65535');
  }

  if (!config.vlcHost || typeof config.vlcHost !== 'string') {
    errors.push('VLC host must be a non-empty string');
  }

  if (!config.discordClientId || !/^\d{15,}$/.test(config.discordClientId)) {
    errors.push('Discord Client ID must be a valid numeric ID');
  }

  if (!config.tmdbApiKey || config.tmdbApiKey.length < 20) {
    errors.push('TMDb API key is invalid or missing');
  }

  if (config.pollingInterval && (config.pollingInterval < 100 || config.pollingInterval > 60000)) {
    errors.push('Polling interval must be between 100ms and 60000ms');
  }

  if (errors.length > 0) {
    logger.error('Configuration validation errors:');
    errors.forEach(e => logger.error(`  • ${e}`));
    return false;
  }

  return true;
}
