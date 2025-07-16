import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_FILE = path.join(__dirname, '..', 'vlcord-config.json');

export class ConfigManager {
  constructor() {
    this.defaultConfig = {
      vlcHost: 'localhost',
      vlcPort: 8080,
      vlcPassword: 'vlcpassword',
      discordClientId: '1392902149163319398',
      tmdbApiKey: 'ccc1fa36a0821299ae4d7a6c155b442d'
    };
    
    this.config = this.loadConfig();
  }
  
  loadConfig() {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        const data = fs.readFileSync(CONFIG_FILE, 'utf8');
        const savedConfig = JSON.parse(data);
        
        // Merge with defaults to ensure all keys exist
        return { ...this.defaultConfig, ...savedConfig };
      }
    } catch (error) {
      console.warn('Error loading config file, using defaults:', error.message);
    }
    
    return { ...this.defaultConfig };
  }
  
  saveConfig(newConfig) {
    try {
      // Merge with current config
      this.config = { ...this.config, ...newConfig };
      
      // Save to file
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(this.config, null, 2));
      
      return true;
    } catch (error) {
      console.error('Error saving config:', error.message);
      return false;
    }
  }
  
  getConfig() {
    return { ...this.config };
  }
  
  get(key) {
    return this.config[key];
  }
  
  set(key, value) {
    this.config[key] = value;
    return this.saveConfig({ [key]: value });
  }
}
