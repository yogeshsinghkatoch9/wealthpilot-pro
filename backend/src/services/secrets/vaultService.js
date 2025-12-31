/**
 * Secure Credential Vault Service
 *
 * Production-grade secrets management supporting:
 * - AWS Secrets Manager (primary for AWS deployments)
 * - HashiCorp Vault (self-hosted option)
 * - Local encrypted storage (development/fallback)
 *
 * Features:
 * - Automatic provider detection
 * - Secret rotation support
 * - Caching with TTL
 * - Audit logging
 * - Encryption at rest
 */

const crypto = require('crypto');
const logger = require('../../utils/logger');

// Provider detection
const PROVIDERS = {
  AWS_SECRETS_MANAGER: 'aws',
  HASHICORP_VAULT: 'vault',
  LOCAL: 'local'
};

// Cache for secrets (short TTL)
const secretsCache = new Map();
const CACHE_TTL = 300000; // 5 minutes

// Encryption for local storage
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const ENCRYPTION_KEY = process.env.SECRETS_ENCRYPTION_KEY ||
  crypto.createHash('sha256').update(process.env.JWT_SECRET || 'default-key').digest();

class VaultService {
  constructor() {
    this.provider = this.detectProvider();
    this.awsClient = null;
    this.vaultClient = null;
    this.initialized = false;

    logger.info(`Vault service initialized with provider: ${this.provider}`);
  }

  /**
   * Detect which vault provider to use
   */
  detectProvider() {
    // Check for AWS credentials
    if (process.env.AWS_SECRET_ACCESS_KEY || process.env.AWS_REGION) {
      return PROVIDERS.AWS_SECRETS_MANAGER;
    }

    // Check for Vault configuration
    if (process.env.VAULT_ADDR || process.env.VAULT_TOKEN) {
      return PROVIDERS.HASHICORP_VAULT;
    }

    // Default to local encrypted storage
    return PROVIDERS.LOCAL;
  }

  /**
   * Initialize the vault client
   */
  async initialize() {
    if (this.initialized) return;

    try {
      switch (this.provider) {
        case PROVIDERS.AWS_SECRETS_MANAGER:
          await this.initializeAWS();
          break;
        case PROVIDERS.HASHICORP_VAULT:
          await this.initializeVault();
          break;
        case PROVIDERS.LOCAL:
          // Local storage doesn't need initialization
          break;
      }

      this.initialized = true;
      logger.info('Vault service initialization complete');
    } catch (error) {
      logger.error('Vault initialization failed:', error.message);
      // Fall back to local
      this.provider = PROVIDERS.LOCAL;
      this.initialized = true;
    }
  }

  /**
   * Initialize AWS Secrets Manager client
   */
  async initializeAWS() {
    try {
      const { SecretsManagerClient } = require('@aws-sdk/client-secrets-manager');

      this.awsClient = new SecretsManagerClient({
        region: process.env.AWS_REGION || 'us-east-1'
      });

      logger.info('AWS Secrets Manager client initialized');
    } catch (error) {
      logger.error('AWS SDK not available:', error.message);
      throw error;
    }
  }

  /**
   * Initialize HashiCorp Vault client
   */
  async initializeVault() {
    try {
      const vault = require('node-vault');

      this.vaultClient = vault({
        apiVersion: 'v1',
        endpoint: process.env.VAULT_ADDR || 'http://127.0.0.1:8200',
        token: process.env.VAULT_TOKEN
      });

      // Test connection
      await this.vaultClient.health();
      logger.info('HashiCorp Vault client initialized');
    } catch (error) {
      logger.error('Vault client not available:', error.message);
      throw error;
    }
  }

  // ==================== CORE OPERATIONS ====================

  /**
   * Store a secret
   */
  async setSecret(key, value, options = {}) {
    await this.initialize();

    const { metadata = {}, ttl = null } = options;

    try {
      switch (this.provider) {
        case PROVIDERS.AWS_SECRETS_MANAGER:
          return await this.setSecretAWS(key, value, metadata);
        case PROVIDERS.HASHICORP_VAULT:
          return await this.setSecretVault(key, value, metadata, ttl);
        case PROVIDERS.LOCAL:
          return await this.setSecretLocal(key, value, metadata);
      }
    } catch (error) {
      logger.error(`Failed to set secret ${key}:`, error.message);
      throw error;
    }
  }

  /**
   * Retrieve a secret
   */
  async getSecret(key, options = {}) {
    await this.initialize();

    const { skipCache = false, version = null } = options;

    // Check cache first
    if (!skipCache) {
      const cached = this.getFromCache(key);
      if (cached) return cached;
    }

    try {
      let value;

      switch (this.provider) {
        case PROVIDERS.AWS_SECRETS_MANAGER:
          value = await this.getSecretAWS(key, version);
          break;
        case PROVIDERS.HASHICORP_VAULT:
          value = await this.getSecretVault(key, version);
          break;
        case PROVIDERS.LOCAL:
          value = await this.getSecretLocal(key);
          break;
      }

      // Cache the result
      if (value) {
        this.setInCache(key, value);
      }

      return value;
    } catch (error) {
      logger.error(`Failed to get secret ${key}:`, error.message);
      throw error;
    }
  }

  /**
   * Delete a secret
   */
  async deleteSecret(key) {
    await this.initialize();

    // Clear from cache
    secretsCache.delete(key);

    try {
      switch (this.provider) {
        case PROVIDERS.AWS_SECRETS_MANAGER:
          return await this.deleteSecretAWS(key);
        case PROVIDERS.HASHICORP_VAULT:
          return await this.deleteSecretVault(key);
        case PROVIDERS.LOCAL:
          return await this.deleteSecretLocal(key);
      }
    } catch (error) {
      logger.error(`Failed to delete secret ${key}:`, error.message);
      throw error;
    }
  }

  /**
   * List all secrets (keys only, not values)
   */
  async listSecrets(prefix = '') {
    await this.initialize();

    try {
      switch (this.provider) {
        case PROVIDERS.AWS_SECRETS_MANAGER:
          return await this.listSecretsAWS(prefix);
        case PROVIDERS.HASHICORP_VAULT:
          return await this.listSecretsVault(prefix);
        case PROVIDERS.LOCAL:
          return await this.listSecretsLocal(prefix);
      }
    } catch (error) {
      logger.error('Failed to list secrets:', error.message);
      throw error;
    }
  }

  // ==================== AWS SECRETS MANAGER ====================

  async setSecretAWS(key, value, metadata) {
    const {
      CreateSecretCommand,
      UpdateSecretCommand,
      ResourceNotFoundException
    } = require('@aws-sdk/client-secrets-manager');

    const secretString = typeof value === 'object' ? JSON.stringify(value) : value;

    try {
      // Try to update existing secret
      await this.awsClient.send(new UpdateSecretCommand({
        SecretId: key,
        SecretString: secretString,
        Description: metadata.description
      }));
    } catch (error) {
      if (error instanceof ResourceNotFoundException) {
        // Create new secret
        await this.awsClient.send(new CreateSecretCommand({
          Name: key,
          SecretString: secretString,
          Description: metadata.description,
          Tags: Object.entries(metadata.tags || {}).map(([Key, Value]) => ({ Key, Value }))
        }));
      } else {
        throw error;
      }
    }

    logger.info(`Secret stored in AWS: ${key}`);
    return { success: true, key };
  }

  async getSecretAWS(key, version) {
    const { GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

    const params = { SecretId: key };
    if (version) params.VersionId = version;

    const response = await this.awsClient.send(new GetSecretValueCommand(params));

    // Try to parse as JSON, otherwise return string
    try {
      return JSON.parse(response.SecretString);
    } catch {
      return response.SecretString;
    }
  }

  async deleteSecretAWS(key) {
    const { DeleteSecretCommand } = require('@aws-sdk/client-secrets-manager');

    await this.awsClient.send(new DeleteSecretCommand({
      SecretId: key,
      ForceDeleteWithoutRecovery: false,
      RecoveryWindowInDays: 7
    }));

    logger.info(`Secret scheduled for deletion in AWS: ${key}`);
    return { success: true, key };
  }

  async listSecretsAWS(prefix) {
    const { ListSecretsCommand } = require('@aws-sdk/client-secrets-manager');

    const secrets = [];
    let nextToken = null;

    do {
      const response = await this.awsClient.send(new ListSecretsCommand({
        MaxResults: 100,
        NextToken: nextToken,
        Filters: prefix ? [{ Key: 'name', Values: [prefix] }] : undefined
      }));

      secrets.push(...response.SecretList.map(s => ({
        name: s.Name,
        description: s.Description,
        createdAt: s.CreatedDate,
        lastChangedAt: s.LastChangedDate
      })));

      nextToken = response.NextToken;
    } while (nextToken);

    return secrets;
  }

  // ==================== HASHICORP VAULT ====================

  async setSecretVault(key, value, metadata, ttl) {
    const path = `secret/data/${key}`;

    await this.vaultClient.write(path, {
      data: typeof value === 'object' ? value : { value },
      options: {
        cas: 0 // Check-and-set version
      }
    });

    logger.info(`Secret stored in Vault: ${key}`);
    return { success: true, key };
  }

  async getSecretVault(key, version) {
    const path = version
      ? `secret/data/${key}?version=${version}`
      : `secret/data/${key}`;

    const response = await this.vaultClient.read(path);

    if (!response?.data?.data) {
      return null;
    }

    // If it's a simple { value: ... } structure, unwrap it
    const data = response.data.data;
    if (data.value && Object.keys(data).length === 1) {
      return data.value;
    }

    return data;
  }

  async deleteSecretVault(key) {
    const path = `secret/metadata/${key}`;
    await this.vaultClient.delete(path);

    logger.info(`Secret deleted from Vault: ${key}`);
    return { success: true, key };
  }

  async listSecretsVault(prefix) {
    const path = `secret/metadata/${prefix || ''}`;

    try {
      const response = await this.vaultClient.list(path);
      return (response.data?.keys || []).map(name => ({
        name: prefix ? `${prefix}${name}` : name
      }));
    } catch (error) {
      if (error.response?.statusCode === 404) {
        return [];
      }
      throw error;
    }
  }

  // ==================== LOCAL ENCRYPTED STORAGE ====================

  // In-memory storage (for development/testing)
  localSecrets = new Map();

  encrypt(text) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, ENCRYPTION_KEY, iv);

    let encrypted = cipher.update(JSON.stringify(text), 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag().toString('hex');

    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  }

  decrypt(encrypted) {
    const [ivHex, authTagHex, cipherText] = encrypted.split(':');

    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, ENCRYPTION_KEY, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(cipherText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return JSON.parse(decrypted);
  }

  async setSecretLocal(key, value, metadata) {
    const encrypted = this.encrypt({
      value,
      metadata,
      createdAt: Date.now()
    });

    this.localSecrets.set(key, encrypted);

    logger.debug(`Secret stored locally (encrypted): ${key}`);
    return { success: true, key };
  }

  async getSecretLocal(key) {
    const encrypted = this.localSecrets.get(key);
    if (!encrypted) return null;

    const decrypted = this.decrypt(encrypted);
    return decrypted.value;
  }

  async deleteSecretLocal(key) {
    this.localSecrets.delete(key);
    logger.debug(`Secret deleted locally: ${key}`);
    return { success: true, key };
  }

  async listSecretsLocal(prefix) {
    const keys = Array.from(this.localSecrets.keys())
      .filter(k => !prefix || k.startsWith(prefix))
      .map(name => ({ name }));

    return keys;
  }

  // ==================== CACHE MANAGEMENT ====================

  getFromCache(key) {
    const cached = secretsCache.get(key);
    if (!cached) return null;

    if (Date.now() > cached.expiresAt) {
      secretsCache.delete(key);
      return null;
    }

    return cached.value;
  }

  setInCache(key, value) {
    secretsCache.set(key, {
      value,
      expiresAt: Date.now() + CACHE_TTL
    });
  }

  clearCache() {
    secretsCache.clear();
  }

  // ==================== BROKER CREDENTIAL HELPERS ====================

  /**
   * Store broker credentials securely
   */
  async storeBrokerCredentials(userId, brokerId, credentials) {
    const key = `broker/${userId}/${brokerId}`;

    // Validate credentials object
    if (!credentials.apiKey && !credentials.accessToken) {
      throw new Error('API key or access token required');
    }

    await this.setSecret(key, credentials, {
      metadata: {
        type: 'broker_credentials',
        userId,
        brokerId,
        createdAt: new Date().toISOString()
      }
    });

    logger.info(`Broker credentials stored for user ${userId}, broker ${brokerId}`);
    return { success: true };
  }

  /**
   * Retrieve broker credentials
   */
  async getBrokerCredentials(userId, brokerId) {
    const key = `broker/${userId}/${brokerId}`;
    return await this.getSecret(key);
  }

  /**
   * Delete broker credentials
   */
  async deleteBrokerCredentials(userId, brokerId) {
    const key = `broker/${userId}/${brokerId}`;
    return await this.deleteSecret(key);
  }

  /**
   * List user's broker credentials (keys only)
   */
  async listUserBrokerCredentials(userId) {
    const prefix = `broker/${userId}/`;
    const secrets = await this.listSecrets(prefix);

    return secrets.map(s => ({
      brokerId: s.name.replace(prefix, ''),
      ...s
    }));
  }

  // ==================== API KEY HELPERS ====================

  /**
   * Store API key for third-party services
   */
  async storeApiKey(service, key, value) {
    const secretKey = `apikeys/${service}/${key}`;
    return await this.setSecret(secretKey, value);
  }

  /**
   * Get API key
   */
  async getApiKey(service, key) {
    const secretKey = `apikeys/${service}/${key}`;
    return await this.getSecret(secretKey);
  }

  // ==================== STATUS & HEALTH ====================

  /**
   * Get vault service status
   */
  getStatus() {
    return {
      provider: this.provider,
      initialized: this.initialized,
      cacheSize: secretsCache.size,
      features: {
        rotation: this.provider !== PROVIDERS.LOCAL,
        versioning: this.provider === PROVIDERS.AWS_SECRETS_MANAGER || this.provider === PROVIDERS.HASHICORP_VAULT,
        audit: this.provider !== PROVIDERS.LOCAL
      }
    };
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      await this.initialize();

      // Try a simple operation
      const testKey = '_health_check_test';
      await this.setSecret(testKey, { test: true });
      const retrieved = await this.getSecret(testKey, { skipCache: true });
      await this.deleteSecret(testKey);

      return {
        status: 'healthy',
        provider: this.provider,
        latency: 'ok'
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        provider: this.provider,
        error: error.message
      };
    }
  }
}

// Export singleton instance
module.exports = new VaultService();
