/**
 * Discord Client Type Detector
 * Identifies and provides helpful diagnostics for Discord client type issues
 */

export const discordClientErrors = {
  WRONG_DISCORD_CLIENT: {
    type: 'WRONG_DISCORD_CLIENT',
    errorPatterns: ['ENOENT', 'pipe', 'IPC', 'Could not find Discord'],
    message: 'Discord Desktop app not detected',
    description: 'VLCord requires the Discord Desktop application with RPC support, not the Web version.',
    solutions: [
      'Install Discord Desktop from https://discord.com/download',
      'Make sure Discord Desktop is running before starting VLCord',
      'Disable browser Discord if you have it open, as it may interfere with IPC communication',
      'Check that Discord is not running in a sandboxed/restricted environment',
      'Try restarting both Discord and VLCord'
    ]
  }
};

/**
 * Detect if error is due to Discord client type mismatch
 * @param {Error} error - The error to analyze
 * @returns {Object|null} - Error info object or null if not a client type error
 */
export function detectDiscordClientError(error) {
  if (!error) return null;

  const errorMsg = (error.message || '').toLowerCase();
  const errorCode = error.code || '';

  // Check if error matches known Discord client type issues
  const matchesPattern = discordClientErrors.WRONG_DISCORD_CLIENT.errorPatterns.some(
    (pattern) => errorMsg.includes(pattern.toLowerCase()) || errorCode.includes(pattern)
  );

  if (matchesPattern) {
    return {
      type: discordClientErrors.WRONG_DISCORD_CLIENT.type,
      message: discordClientErrors.WRONG_DISCORD_CLIENT.message,
      description: discordClientErrors.WRONG_DISCORD_CLIENT.description,
      details: `IPC (Inter-Process Communication) connection failed. ${error.message}`,
      solutions: discordClientErrors.WRONG_DISCORD_CLIENT.solutions,
      originalError: error.message
    };
  }

  return null;
}

/**
 * Format error info for console output
 * @param {Object} errorInfo - The error info object from detectDiscordClientError
 * @returns {string} - Formatted error message
 */
export function formatDiscordClientErrorForConsole(errorInfo) {
  if (!errorInfo) return '';

  let output = '\n';
  output += '╔════════════════════════════════════════════════════════════════╗\n';
  output += '║           ⚠️  DISCORD CLIENT TYPE ERROR                         ║\n';
  output += '╚════════════════════════════════════════════════════════════════╝\n\n';

  output += `Issue: ${errorInfo.message}\n`;
  output += `Details: ${errorInfo.description}\n`;
  output += `Reason: ${errorInfo.details}\n\n`;

  output += 'Solutions:\n';
  errorInfo.solutions.forEach((solution, index) => {
    output += `  ${index + 1}. ${solution}\n`;
  });

  output += '\n';

  return output;
}

/**
 * Get Discord client type from system
 * Attempts to detect which Discord client variant is installed/running
 * @returns {Promise<Object>} - Discord client info
 */
export async function getDiscordClientInfo() {
  const info = {
    hasDesktop: false,
    hasWeb: false,
    runningOnWindows: process.platform === 'win32',
    runningOnMac: process.platform === 'darwin',
    runningOnLinux: process.platform === 'linux',
    recommendedDownloadUrl: 'https://discord.com/download'
  };

  // On Windows, check for Discord in AppData
  if (info.runningOnWindows) {
    try {
      const fs = (await import('fs')).promises;
      const discordAppPath = `${process.env.APPDATA}\\Discord`;
      try {
        await fs.access(discordAppPath);
        info.hasDesktop = true;
      } catch {
        info.hasDesktop = false;
      }
    } catch (e) {
      // Silently fail if check not possible
    }
  }

  // On macOS, check for Discord in Applications
  if (info.runningOnMac) {
    try {
      const fs = (await import('fs')).promises;
      try {
        await fs.access('/Applications/Discord.app');
        info.hasDesktop = true;
      } catch {
        info.hasDesktop = false;
      }
    } catch (e) {
      // Silently fail if check not possible
    }
  }

  // On Linux, check for discord binary
  if (info.runningOnLinux) {
    try {
      const { execSync } = await import('child_process');
      try {
        execSync('which Discord', { stdio: 'ignore' });
        info.hasDesktop = true;
      } catch {
        info.hasDesktop = false;
      }
    } catch (e) {
      // Silently fail if check not possible
    }
  }

  // Web version is assumed to be used if user is accessing from browser
  // This is just a flag indicating they should NOT use web Discord with VLCord
  info.canUseDesktop = !info.hasDesktop;

  return info;
}

export default {
  detectDiscordClientError,
  formatDiscordClientErrorForConsole,
  getDiscordClientInfo,
  discordClientErrors
};
