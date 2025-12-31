/**
 * AWS Secrets Manager Service
 * Securely retrieves and caches secrets from AWS Secrets Manager
 * Falls back to environment variables when AWS is not configured
 */

const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const logger = require('../../utils/logger');

class SecretsManagerService {
  constructor() {
    this.client = null;
    this.cache = new Map();
    this.cacheTTL = 5 * 60 * 1000; // 5 minutes cache
    this.isConfigured = false;

    this.initialize();
  }

  initialize() {
    const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;

    if (!region) {
      logger.info('[SecretsManager] AWS not configured, using environment variables');
      return;
    }

    try {
      this.client = new SecretsManagerClient({
        region,
        // Credentials loaded automatically from:
        // - Environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
        // - IAM role (EC2, ECS, Lambda)
        // - AWS credentials file
      });
      this.isConfigured = true;
      logger.info('[SecretsManager] Initialized with region:', region);
    } catch (error) {
      logger.error('[SecretsManager] Failed to initialize:', error.message);
    }
  }

  /**
   * Get a secret value from AWS Secrets Manager
   * @param {string} secretName - The name or ARN of the secret
   * @param {boolean} useCache - Whether to use cached value (default: true)
   * @returns {Promise<object|string>} The secret value
   */
  async getSecret(secretName, useCache = true) {
    // Check cache first
    if (useCache && this.cache.has(secretName)) {
      const cached = this.cache.get(secretName);
      if (Date.now() - cached.timestamp < this.cacheTTL) {
        return cached.value;
      }
      this.cache.delete(secretName);
    }

    // Fall back to environment variables if AWS not configured
    if (!this.isConfigured) {
      return this.getFromEnv(secretName);
    }

    try {
      const command = new GetSecretValueCommand({
        SecretId: secretName,
      });

      const response = await this.client.send(command);
      let secretValue;

      if (response.SecretString) {
        // Try to parse as JSON, otherwise return as string
        try {
          secretValue = JSON.parse(response.SecretString);
        } catch {
          secretValue = response.SecretString;
        }
      } else if (response.SecretBinary) {
        secretValue = Buffer.from(response.SecretBinary, 'base64').toString('utf-8');
      }

      // Cache the result
      this.cache.set(secretName, {
        value: secretValue,
        timestamp: Date.now()
      });

      logger.debug('[SecretsManager] Retrieved secret:', secretName);
      return secretValue;

    } catch (error) {
      logger.error('[SecretsManager] Error retrieving secret:', secretName, error.message);

      // Fall back to environment variables
      return this.getFromEnv(secretName);
    }
  }

  /**
   * Get a specific key from a JSON secret
   * @param {string} secretName - The secret name
   * @param {string} key - The key to extract
   * @returns {Promise<string>} The value
   */
  async getSecretKey(secretName, key) {
    const secret = await this.getSecret(secretName);

    if (typeof secret === 'object' && secret !== null) {
      return secret[key];
    }

    return secret;
  }

  /**
   * Get secret from environment variable (fallback)
   * Maps secret names to env var names
   */
  getFromEnv(secretName) {
    // Map common secret names to environment variables
    const envMappings = {
      'wealthpilot/jwt-secret': 'JWT_SECRET',
      'wealthpilot/database-url': 'DATABASE_URL',
      'wealthpilot/postgres-url': 'POSTGRES_URL',
      'wealthpilot/alpha-vantage-key': 'ALPHA_VANTAGE_API_KEY',
      'wealthpilot/openai-key': 'OPENAI_API_KEY',
      'wealthpilot/anthropic-key': 'ANTHROPIC_API_KEY',
      'wealthpilot/sendgrid-key': 'SENDGRID_API_KEY',
      'wealthpilot/sentry-dsn': 'SENTRY_DSN',
      'wealthpilot/redis-url': 'REDIS_URL',
      'wealthpilot/smtp-password': 'SMTP_PASS',
    };

    // Check if there's a direct mapping
    if (envMappings[secretName]) {
      return process.env[envMappings[secretName]];
    }

    // Try converting secret name to env var format
    // e.g., "wealthpilot/api-key" -> "API_KEY"
    const parts = secretName.split('/');
    const envName = parts[parts.length - 1]
      .toUpperCase()
      .replace(/-/g, '_');

    return process.env[envName];
  }

  /**
   * Load all application secrets at startup
   * @returns {Promise<object>} Object containing all secrets
   */
  async loadAllSecrets() {
    const secrets = {};

    const secretNames = [
      'wealthpilot/jwt-secret',
      'wealthpilot/database-url',
      'wealthpilot/alpha-vantage-key',
      'wealthpilot/openai-key',
      'wealthpilot/anthropic-key',
      'wealthpilot/sendgrid-key',
    ];

    for (const name of secretNames) {
      try {
        secrets[name] = await this.getSecret(name);
      } catch (error) {
        logger.warn(`[SecretsManager] Could not load secret: ${name}`);
      }
    }

    return secrets;
  }

  /**
   * Clear the secret cache
   */
  clearCache() {
    this.cache.clear();
    logger.info('[SecretsManager] Cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      isConfigured: this.isConfigured,
      cacheTTL: this.cacheTTL
    };
  }
}

// Singleton instance
const secretsManager = new SecretsManagerService();

module.exports = secretsManager;
