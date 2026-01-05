/**
 * Input validation and sanitization utilities
 */

export function validateString(value, options = {}) {
  const { minLength = 1, maxLength = 1000, pattern = null, required = true } = options;

  if (required && (!value || typeof value !== 'string')) {
    throw new Error('String is required');
  }

  if (!value) return true;

  if (value.length < minLength) {
    throw new Error(`String must be at least ${minLength} characters`);
  }

  if (value.length > maxLength) {
    throw new Error(`String must not exceed ${maxLength} characters`);
  }

  if (pattern && !pattern.test(value)) {
    throw new Error(`String does not match required pattern`);
  }

  return true;
}

export function validateNumber(value, options = {}) {
  const { min = null, max = null, required = true, integer = false } = options;

  if (required && (value === null || value === undefined)) {
    throw new Error('Number is required');
  }

  if (value === null || value === undefined) return true;

  const num = Number(value);
  if (isNaN(num)) {
    throw new Error('Value must be a valid number');
  }

  if (integer && !Number.isInteger(num)) {
    throw new Error('Value must be an integer');
  }

  if (min !== null && num < min) {
    throw new Error(`Number must be at least ${min}`);
  }

  if (max !== null && num > max) {
    throw new Error(`Number must not exceed ${max}`);
  }

  return true;
}

export function validateDiscordClientId(clientId) {
  if (!clientId || typeof clientId !== 'string') {
    throw new Error('Discord Client ID is required');
  }

  if (!/^\d{15,}$/.test(clientId)) {
    throw new Error('Invalid Discord Client ID format (must be numeric, 15+ digits)');
  }

  return true;
}

export function validateTmdbApiKey(apiKey) {
  if (!apiKey || typeof apiKey !== 'string') {
    throw new Error('TMDb API key is required');
  }

  if (apiKey.length < 20) {
    throw new Error('Invalid TMDb API key format');
  }

  return true;
}

/**
 * Express middleware for request validation
 */
export function validateJsonBody(schema) {
  return (req, res, next) => {
    try {
      if (!req.body) {
        return res.status(400).json({ error: 'Request body is required' });
      }

      for (const [key, rules] of Object.entries(schema)) {
        const value = req.body[key];
        
        if (rules.required && (value === null || value === undefined)) {
          return res.status(400).json({ error: `${key} is required` });
        }

        if (value !== null && value !== undefined) {
          switch (rules.type) {
            case 'string':
              validateString(value, rules);
              break;
            case 'number':
              validateNumber(value, rules);
              break;
          }
        }
      }

      next();
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  };
}

/**
 * Sanitize string inputs to prevent injection attacks
 */
export function sanitizeString(str) {
  if (typeof str !== 'string') return str;
  
  // Remove control characters
  return str
    .replace(/[\x00-\x1F\x7F]/g, '')
    .trim();
}

export function sanitizeFilename(filename) {
  if (typeof filename !== 'string') return filename;
  
  // Remove path traversal and dangerous characters
  return filename
    .replace(/\.\./g, '')
    .replace(/[\/\\:*?"<>|]/g, '')
    .substring(0, 255);
}
