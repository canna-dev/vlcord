import axios from 'axios';
import { retryWithBackoff } from './retry-helper.js';
import os from 'os';
import path from 'path';

export class VLCSetupHelper {
  constructor() {
    this.defaultSettings = {
      host: 'localhost',
      port: 8080,
      password: 'vlcpassword'
    };
  }

  async testVLCConnection(host = 'localhost', port = 8080, password = 'vlcpassword') {
    try {
      const response = await retryWithBackoff(async () => {
        return await axios.get(`http://${host}:${port}/requests/status.json`, {
          auth: { username: '', password },
          timeout: 3000
        });
      }, 3, 300, 3000);

      return {
        success: true,
        message: 'VLC HTTP interface is working!',
        data: response.data
      };
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        return {
          success: false,
          error: 'connection_refused',
          message: 'VLC is not running or HTTP interface is not enabled',
          solution: this.getConnectionRefusedSolution()
        };
      } else if (error.response && error.response.status === 401) {
        return {
          success: false,
          error: 'auth_failed',
          message: 'Incorrect VLC password',
          solution: this.getAuthFailedSolution()
        };
      } else if (error.code === 'ETIMEDOUT') {
        return {
          success: false,
          error: 'timeout',
          message: 'VLC is not responding',
          solution: this.getTimeoutSolution()
        };
      } else {
        return {
          success: false,
          error: 'unknown',
          message: error.message,
          solution: 'Check VLC setup and try again'
        };
      }
    }
  }

  getVLCPaths() {
    const platform = os.platform();
    const paths = [];

    if (platform === 'win32') {
      paths.push(
        'C:\\Program Files\\VideoLAN\\VLC\\vlc.exe',
        'C:\\Program Files (x86)\\VideoLAN\\VLC\\vlc.exe',
        path.join(os.homedir(), 'AppData\\Local\\Programs\\VLC\\vlc.exe')
      );
    } else if (platform === 'darwin') {
      paths.push(
        '/Applications/VLC.app/Contents/MacOS/VLC',
        path.join(os.homedir(), 'Applications/VLC.app/Contents/MacOS/VLC')
      );
    } else {
      paths.push('/usr/bin/vlc', '/snap/bin/vlc');
    }

    return paths;
  }

  generateVLCShortcut() {
    const platform = os.platform();
    const args = '--intf http --http-host localhost --http-port 8080 --http-password vlcpassword';
    
    if (platform === 'win32') {
      return {
        type: 'batch',
        filename: 'VLCord-VLC.bat',
        content: `@echo off
echo Starting VLC with HTTP interface for VLCord...
"C:\\Program Files\\VideoLAN\\VLC\\vlc.exe" ${args}
pause`
      };
    } else if (platform === 'darwin') {
      return {
        type: 'script',
        filename: 'VLCord-VLC.command',
        content: `#!/bin/bash
echo "Starting VLC with HTTP interface for VLCord..."
/Applications/VLC.app/Contents/MacOS/VLC ${args}
read -p "Press Enter to exit..."`
      };
    } else {
      return {
        type: 'script',
        filename: 'VLCord-VLC.sh',
        content: `#!/bin/bash
echo "Starting VLC with HTTP interface for VLCord..."
vlc ${args}
read -p "Press Enter to exit..."`
      };
    }
  }

  getConnectionRefusedSolution() {
    return {
      title: 'Enable VLC HTTP Interface',
      steps: [
        '1. Open VLC Media Player',
        '2. Go to Tools → Preferences (or press Ctrl+P)',
        '3. In the bottom left, select "All" to show all settings',
        '4. Navigate to Interface → Main interfaces',
        '5. Check the "Web" checkbox',
        '6. Go to Interface → Main interfaces → Lua',
        '7. Set "Lua HTTP" password to: vlcpassword',
        '8. Restart VLC',
        '9. Alternatively, start VLC with command line: vlc --intf http --http-password vlcpassword'
      ],
      shortcut: this.generateVLCShortcut()
    };
  }

  getAuthFailedSolution() {
    return {
      title: 'Fix VLC Password',
      steps: [
        '1. Open VLC Media Player',
        '2. Go to Tools → Preferences (or press Ctrl+P)',
        '3. In the bottom left, select "All" to show all settings',
        '4. Navigate to Interface → Main interfaces → Lua',
        '5. Set "Lua HTTP" password to: vlcpassword',
        '6. Restart VLC'
      ]
    };
  }

  getTimeoutSolution() {
    return {
      title: 'Fix VLC Timeout',
      steps: [
        '1. Make sure VLC is fully loaded (not just starting up)',
        '2. Check if any firewall is blocking port 8080',
        '3. Try restarting VLC',
        '4. Verify the HTTP interface is enabled in VLC preferences'
      ]
    };
  }

  createVLCShortcut() {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    
    const shortcutInfo = this.generateVLCShortcut();
    const tempDir = os.tmpdir();
    const shortcutPath = path.join(tempDir, shortcutInfo.filename);
    
    try {
      fs.writeFileSync(shortcutPath, shortcutInfo.content);
      return shortcutPath;
    } catch (error) {
      throw new Error(`Failed to create VLC shortcut: ${error.message}`);
    }
  }

  async getSystemInfo() {
    const platform = os.platform();
    const arch = os.arch();
    const vlcPaths = this.getVLCPaths();
    
    return {
      platform,
      arch,
      vlcPaths,
      node: process.version,
      shortcut: this.generateVLCShortcut()
    };
  }
}
