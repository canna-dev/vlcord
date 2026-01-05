/**
 * Configuration Encryption at Rest
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getLogger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logger = getLogger();

const ENCRYPTION_VERSION = '1';
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const SALT_LENGTH = 16;
const _TAG_LENGTH = 16;
const IV_LENGTH = 12; // GCM recommended IV size

interface EncryptedData {
  version: string;
  algorithm: string;
  salt: string;
  iv: string;
  tag: string;
  encrypted: string;
}

/**
 * Configuration encryption and decryption
 */
export class ConfigEncryption {
  private masterKey: Buffer;

  constructor(masterPassword: string) {
    // Derive a master key from the password
    this.masterKey = crypto
      .createHash('sha256')
      .update(masterPassword)
      .digest();
  }

  /**
   * Encrypt configuration object
   */
  encryptConfig(config: Record<string, unknown>): EncryptedData {
    try {
      const plaintext = JSON.stringify(config);
      const salt = crypto.randomBytes(SALT_LENGTH);
      const iv = crypto.randomBytes(IV_LENGTH);

      // Derive key from master key and salt
      const key = crypto.pbkdf2Sync(this.masterKey, salt, 100000, KEY_LENGTH, 'sha256');

      const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
      let encrypted = cipher.update(plaintext, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      const tag = cipher.getAuthTag();

      return {
        version: ENCRYPTION_VERSION,
        algorithm: ALGORITHM,
        salt: salt.toString('hex'),
        iv: iv.toString('hex'),
        tag: tag.toString('hex'),
        encrypted
      };
    } catch (error) {
      logger.error('ConfigEncryption', 'Failed to encrypt config', error as Error);
      throw error;
    }
  }

  /**
   * Decrypt configuration object
   */
  decryptConfig(data: EncryptedData): Record<string, unknown> {
    try {
      if (data.version !== ENCRYPTION_VERSION) {
        throw new Error(`Unsupported encryption version: ${data.version}`);
      }

      if (data.algorithm !== ALGORITHM) {
        throw new Error(`Unsupported algorithm: ${data.algorithm}`);
      }

      const salt = Buffer.from(data.salt, 'hex');
      const iv = Buffer.from(data.iv, 'hex');
      const tag = Buffer.from(data.tag, 'hex');

      // Derive key using same parameters
      const key = crypto.pbkdf2Sync(this.masterKey, salt, 100000, KEY_LENGTH, 'sha256');

      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(tag);

      let decrypted = decipher.update(data.encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return JSON.parse(decrypted);
    } catch (error) {
      logger.error('ConfigEncryption', 'Failed to decrypt config', error as Error);
      throw error;
    }
  }

  /**
   * Encrypt specific fields in config
   */
  encryptSensitiveFields(
    config: Record<string, unknown>,
    fieldsToEncrypt: string[]
  ): Record<string, unknown> {
    const encrypted = { ...config };

    for (const field of fieldsToEncrypt) {
      if (field in encrypted) {
        const value = encrypted[field];
        const salt = crypto.randomBytes(SALT_LENGTH);
        const iv = crypto.randomBytes(IV_LENGTH);

        const key = crypto.pbkdf2Sync(this.masterKey, salt, 100000, KEY_LENGTH, 'sha256');
        const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

        let encryptedValue = cipher.update(String(value), 'utf8', 'hex');
        encryptedValue += cipher.final('hex');
        const tag = cipher.getAuthTag();

        encrypted[field] = {
          _encrypted: true,
          version: ENCRYPTION_VERSION,
          salt: salt.toString('hex'),
          iv: iv.toString('hex'),
          tag: tag.toString('hex'),
          value: encryptedValue
        };
      }
    }

    return encrypted;
  }

  /**
   * Decrypt specific fields in config
   */
  decryptSensitiveFields(config: Record<string, unknown>): Record<string, unknown> {
    const decrypted = { ...config };

    for (const [key, value] of Object.entries(decrypted)) {
      if (value && typeof value === 'object' && (value as any)._encrypted) {
        const encData = value as any;
        const salt = Buffer.from(encData.salt, 'hex');
        const iv = Buffer.from(encData.iv, 'hex');
        const tag = Buffer.from(encData.tag, 'hex');

        const key_derived = crypto.pbkdf2Sync(
          this.masterKey,
          salt,
          100000,
          KEY_LENGTH,
          'sha256'
        );

        const decipher = crypto.createDecipheriv(ALGORITHM, key_derived, iv);
        decipher.setAuthTag(tag);

        let decryptedValue = decipher.update(encData.value, 'hex', 'utf8');
        decryptedValue += decipher.final('utf8');

        decrypted[key] = decryptedValue;
      }
    }

    return decrypted;
  }

  /**
   * Change master password
   */
  changeMasterPassword(newPassword: string): Buffer {
    this.masterKey = crypto
      .createHash('sha256')
      .update(newPassword)
      .digest();
    logger.info('ConfigEncryption', 'Master password changed');
    return this.masterKey;
  }
}

/**
 * Utility to encrypt/decrypt config files
 */
export class ConfigFileEncryption {
  private encryption: ConfigEncryption;

  constructor(masterPassword: string) {
    this.encryption = new ConfigEncryption(masterPassword);
  }

  /**
   * Read and decrypt config file
   */
  readConfigFile(filePath: string): Record<string, unknown> {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(content) as EncryptedData;
      return this.encryption.decryptConfig(data);
    } catch (error) {
      logger.error('ConfigFileEncryption', 'Failed to read config file', error as Error);
      throw error;
    }
  }

  /**
   * Encrypt and write config file
   */
  writeConfigFile(filePath: string, config: Record<string, unknown>): void {
    try {
      const encrypted = this.encryption.encryptConfig(config);
      const dir = path.dirname(filePath);

      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(filePath, JSON.stringify(encrypted, null, 2), 'utf-8');
      logger.info('ConfigFileEncryption', 'Config file encrypted and saved');
    } catch (error) {
      logger.error('ConfigFileEncryption', 'Failed to write config file', error as Error);
      throw error;
    }
  }

  /**
   * Backup config file (unencrypted - use securely!)
   */
  backupConfigFile(filePath: string, backupPath: string): void {
    try {
      const config = this.readConfigFile(filePath);
      fs.writeFileSync(backupPath, JSON.stringify(config, null, 2), 'utf-8');
      // Set restrictive permissions
      fs.chmodSync(backupPath, 0o600);
      logger.info('ConfigFileEncryption', 'Config backup created', { backupPath });
    } catch (error) {
      logger.error('ConfigFileEncryption', 'Failed to backup config', error as Error);
      throw error;
    }
  }

  /**
   * Restore config from backup
   */
  restoreConfigFile(backupPath: string, filePath: string): void {
    try {
      const content = fs.readFileSync(backupPath, 'utf-8');
      const config = JSON.parse(content);
      this.writeConfigFile(filePath, config);
      logger.info('ConfigFileEncryption', 'Config restored from backup');
    } catch (error) {
      logger.error('ConfigFileEncryption', 'Failed to restore config', error as Error);
      throw error;
    }
  }

  /**
   * Rotate encryption key
   */
  rotateEncryption(
    oldFilePath: string,
    newFilePath: string,
    newPassword: string
  ): void {
    try {
      // Read with old encryption
      const config = this.readConfigFile(oldFilePath);

      // Create new encryption with new password
      const newEncryption = new ConfigFileEncryption(newPassword);

      // Write with new encryption
      newEncryption.writeConfigFile(newFilePath, config);

      logger.info('ConfigFileEncryption', 'Encryption key rotated successfully');
    } catch (error) {
      logger.error('ConfigFileEncryption', 'Failed to rotate encryption', error as Error);
      throw error;
    }
  }
}

/**
 * Generate secure master password
 */
export function generateMasterPassword(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Hash password for verification
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const hash = crypto.pbkdf2Sync(password, salt, 100000, KEY_LENGTH, 'sha256');
  return salt.toString('hex') + ':' + hash.toString('hex');
}

/**
 * Verify password
 */
export function verifyPassword(password: string, hash: string): boolean {
  const [salt, storedHash] = hash.split(':');
  const saltBuffer = Buffer.from(salt, 'hex');
  const derived = crypto.pbkdf2Sync(password, saltBuffer, 100000, KEY_LENGTH, 'sha256');
  return derived.toString('hex') === storedHash;
}

export default {
  ConfigEncryption,
  ConfigFileEncryption,
  generateMasterPassword,
  hashPassword,
  verifyPassword
};
