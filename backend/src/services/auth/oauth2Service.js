/**
 * OAuth2 Service for Broker Authentication
 *
 * Handles OAuth2 flows for multiple brokers:
 * - Schwab (TD Ameritrade migrated)
 * - Robinhood
 * - Coinbase
 * - E*TRADE
 *
 * Features:
 * - Authorization code flow
 * - Token refresh
 * - Secure token storage
 * - State validation (CSRF protection)
 * - PKCE support
 */

const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const logger = require('../../utils/logger');
const redis = require('../redis/redisClient');

// OAuth2 Provider Configurations
const OAUTH_PROVIDERS = {
  schwab: {
    name: 'Charles Schwab',
    authUrl: 'https://api.schwabapi.com/v1/oauth/authorize',
    tokenUrl: 'https://api.schwabapi.com/v1/oauth/token',
    revokeUrl: 'https://api.schwabapi.com/v1/oauth/revoke',
    scopes: ['readonly', 'PlaceTrades', 'AccountAccess'],
    pkce: true,
    refreshSupported: true
  },
  etrade: {
    name: 'E*TRADE',
    authUrl: 'https://us.etrade.com/e/t/etws/authorize',
    tokenUrl: 'https://api.etrade.com/oauth/access_token',
    revokeUrl: 'https://api.etrade.com/oauth/revoke_access_token',
    scopes: [],
    pkce: false, // E*TRADE uses OAuth 1.0a
    refreshSupported: false
  },
  robinhood: {
    name: 'Robinhood',
    authUrl: 'https://api.robinhood.com/oauth2/authorize/',
    tokenUrl: 'https://api.robinhood.com/oauth2/token/',
    revokeUrl: 'https://api.robinhood.com/oauth2/revoke_token/',
    scopes: ['read', 'write'],
    pkce: false,
    refreshSupported: true
  },
  coinbase: {
    name: 'Coinbase',
    authUrl: 'https://www.coinbase.com/oauth/authorize',
    tokenUrl: 'https://api.coinbase.com/oauth/token',
    revokeUrl: 'https://api.coinbase.com/oauth/revoke',
    scopes: ['wallet:accounts:read', 'wallet:transactions:read', 'wallet:buys:create', 'wallet:sells:create'],
    pkce: true,
    refreshSupported: true
  },
  fidelity: {
    name: 'Fidelity',
    authUrl: 'https://digital.fidelity.com/prgw/digital/oauth2/authorize',
    tokenUrl: 'https://digital.fidelity.com/prgw/digital/oauth2/token',
    revokeUrl: null,
    scopes: ['openid', 'profile'],
    pkce: true,
    refreshSupported: true
  }
};

// Token encryption key (should be in env)
const ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
const IV_LENGTH = 16;

class OAuth2Service {
  constructor() {
    this.providers = OAUTH_PROVIDERS;
    this.stateCache = new Map(); // Fallback if Redis unavailable
  }

  /**
   * Get OAuth provider config
   */
  getProvider(providerId) {
    const provider = this.providers[providerId.toLowerCase()];
    if (!provider) {
      throw new Error(`Unknown OAuth provider: ${providerId}`);
    }
    return provider;
  }

  /**
   * Get all supported providers
   */
  getSupportedProviders() {
    return Object.entries(this.providers).map(([id, config]) => ({
      id,
      name: config.name,
      pkce: config.pkce,
      refreshSupported: config.refreshSupported
    }));
  }

  /**
   * Generate PKCE code verifier and challenge
   */
  generatePKCE() {
    // Code verifier: 43-128 characters, URL-safe
    const verifier = crypto.randomBytes(64)
      .toString('base64url')
      .slice(0, 128);

    // Code challenge: SHA256 hash of verifier, base64url encoded
    const challenge = crypto.createHash('sha256')
      .update(verifier)
      .digest('base64url');

    return { verifier, challenge };
  }

  /**
   * Generate secure state token
   */
  generateState() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Start OAuth authorization flow
   */
  async startAuthFlow(userId, providerId, options = {}) {
    const provider = this.getProvider(providerId);
    const clientId = process.env[`${providerId.toUpperCase()}_CLIENT_ID`];
    const redirectUri = options.redirectUri ||
      `${process.env.API_BASE_URL || 'http://localhost:3000'}/api/oauth/callback/${providerId}`;

    if (!clientId) {
      throw new Error(`Client ID not configured for ${provider.name}`);
    }

    // Generate state for CSRF protection
    const state = this.generateState();

    // Generate PKCE if supported
    let pkce = null;
    if (provider.pkce) {
      pkce = this.generatePKCE();
    }

    // Store state data (expires in 10 minutes)
    const stateData = {
      userId,
      providerId,
      redirectUri,
      codeVerifier: pkce?.verifier,
      createdAt: Date.now()
    };

    // Store in Redis or fallback
    if (redis.isAvailable()) {
      await redis.set(`oauth:state:${state}`, stateData, 600);
    } else {
      this.stateCache.set(state, stateData);
      setTimeout(() => this.stateCache.delete(state), 600000);
    }

    // Build authorization URL
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      state
    });

    // Add scopes
    if (provider.scopes.length > 0) {
      params.append('scope', provider.scopes.join(' '));
    }

    // Add PKCE challenge
    if (pkce) {
      params.append('code_challenge', pkce.challenge);
      params.append('code_challenge_method', 'S256');
    }

    const authUrl = `${provider.authUrl}?${params.toString()}`;

    logger.info(`OAuth flow started for user ${userId} with ${provider.name}`);

    return {
      authUrl,
      state,
      provider: provider.name,
      expiresIn: 600 // seconds
    };
  }

  /**
   * Handle OAuth callback and exchange code for tokens
   */
  async handleCallback(providerId, code, state) {
    const provider = this.getProvider(providerId);

    // Validate state
    let stateData;
    if (redis.isAvailable()) {
      stateData = await redis.get(`oauth:state:${state}`);
      await redis.del(`oauth:state:${state}`); // One-time use
    } else {
      stateData = this.stateCache.get(state);
      this.stateCache.delete(state);
    }

    if (!stateData) {
      throw new Error('Invalid or expired OAuth state');
    }

    // Check expiration (10 minutes)
    if (Date.now() - stateData.createdAt > 600000) {
      throw new Error('OAuth state expired');
    }

    const { userId, redirectUri, codeVerifier } = stateData;

    // Exchange code for tokens
    const tokens = await this.exchangeCodeForTokens(
      providerId,
      code,
      redirectUri,
      codeVerifier
    );

    // Store tokens securely
    await this.storeTokens(userId, providerId, tokens);

    logger.info(`OAuth tokens obtained for user ${userId} with ${provider.name}`);

    return {
      success: true,
      userId,
      provider: provider.name,
      expiresIn: tokens.expires_in
    };
  }

  /**
   * Exchange authorization code for access/refresh tokens
   */
  async exchangeCodeForTokens(providerId, code, redirectUri, codeVerifier = null) {
    const provider = this.getProvider(providerId);
    const clientId = process.env[`${providerId.toUpperCase()}_CLIENT_ID`];
    const clientSecret = process.env[`${providerId.toUpperCase()}_CLIENT_SECRET`];

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      code,
      redirect_uri: redirectUri
    });

    // Some providers require client secret in body
    if (clientSecret) {
      body.append('client_secret', clientSecret);
    }

    // Add PKCE verifier if used
    if (codeVerifier) {
      body.append('code_verifier', codeVerifier);
    }

    // Build auth header (some providers prefer Basic auth)
    const authHeader = clientSecret
      ? `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
      : null;

    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded'
    };
    if (authHeader) headers['Authorization'] = authHeader;

    const response = await fetch(provider.tokenUrl, {
      method: 'POST',
      headers,
      body: body.toString()
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`Token exchange failed: ${error.error_description || error.error || response.status}`);
    }

    return response.json();
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshTokens(userId, providerId) {
    const provider = this.getProvider(providerId);

    if (!provider.refreshSupported) {
      throw new Error(`Token refresh not supported for ${provider.name}`);
    }

    // Get stored refresh token
    const storedTokens = await this.getTokens(userId, providerId);
    if (!storedTokens?.refresh_token) {
      throw new Error('No refresh token available');
    }

    const clientId = process.env[`${providerId.toUpperCase()}_CLIENT_ID`];
    const clientSecret = process.env[`${providerId.toUpperCase()}_CLIENT_SECRET`];

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      refresh_token: storedTokens.refresh_token
    });

    if (clientSecret) {
      body.append('client_secret', clientSecret);
    }

    const response = await fetch(provider.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString()
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`Token refresh failed: ${error.error_description || response.status}`);
    }

    const newTokens = await response.json();

    // Some providers don't return a new refresh token
    if (!newTokens.refresh_token) {
      newTokens.refresh_token = storedTokens.refresh_token;
    }

    // Store updated tokens
    await this.storeTokens(userId, providerId, newTokens);

    logger.info(`OAuth tokens refreshed for user ${userId} with ${provider.name}`);

    return newTokens;
  }

  /**
   * Revoke tokens (disconnect broker)
   */
  async revokeTokens(userId, providerId) {
    const provider = this.getProvider(providerId);
    const storedTokens = await this.getTokens(userId, providerId);

    if (provider.revokeUrl && storedTokens?.access_token) {
      try {
        const clientId = process.env[`${providerId.toUpperCase()}_CLIENT_ID`];

        await fetch(provider.revokeUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: new URLSearchParams({
            client_id: clientId,
            token: storedTokens.access_token
          }).toString()
        });
      } catch (error) {
        logger.warn(`Failed to revoke tokens at provider: ${error.message}`);
      }
    }

    // Delete stored tokens
    await this.deleteTokens(userId, providerId);

    logger.info(`OAuth tokens revoked for user ${userId} with ${provider.name}`);

    return { success: true };
  }

  /**
   * Get valid access token (auto-refreshes if needed)
   */
  async getValidAccessToken(userId, providerId) {
    const storedTokens = await this.getTokens(userId, providerId);

    if (!storedTokens) {
      throw new Error(`No tokens found for ${providerId}`);
    }

    // Check if token is expired (with 5 minute buffer)
    const expiresAt = storedTokens.obtained_at + (storedTokens.expires_in * 1000) - 300000;

    if (Date.now() > expiresAt) {
      // Token expired, try to refresh
      const provider = this.getProvider(providerId);

      if (provider.refreshSupported && storedTokens.refresh_token) {
        const newTokens = await this.refreshTokens(userId, providerId);
        return newTokens.access_token;
      } else {
        throw new Error('Access token expired and cannot be refreshed');
      }
    }

    return storedTokens.access_token;
  }

  // ==================== TOKEN STORAGE ====================

  /**
   * Encrypt sensitive data
   */
  encrypt(text) {
    const iv = crypto.randomBytes(IV_LENGTH);
    const key = Buffer.from(ENCRYPTION_KEY.slice(0, 32), 'utf8');
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
  }

  /**
   * Decrypt sensitive data
   */
  decrypt(encrypted) {
    const [ivHex, encryptedText] = encrypted.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const key = Buffer.from(ENCRYPTION_KEY.slice(0, 32), 'utf8');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  /**
   * Store tokens securely in database
   */
  async storeTokens(userId, providerId, tokens) {
    const encryptedAccess = this.encrypt(tokens.access_token);
    const encryptedRefresh = tokens.refresh_token ? this.encrypt(tokens.refresh_token) : null;

    const tokenData = {
      userId,
      providerId,
      accessToken: encryptedAccess,
      refreshToken: encryptedRefresh,
      expiresIn: tokens.expires_in || 3600,
      tokenType: tokens.token_type || 'Bearer',
      scope: tokens.scope || '',
      obtainedAt: new Date()
    };

    // Upsert to database
    await prisma.oAuthToken.upsert({
      where: {
        userId_providerId: { userId, providerId }
      },
      update: tokenData,
      create: tokenData
    });

    // Also cache in Redis for fast access
    if (redis.isAvailable()) {
      await redis.set(`oauth:tokens:${userId}:${providerId}`, {
        ...tokenData,
        access_token: tokens.access_token, // Decrypted for use
        refresh_token: tokens.refresh_token,
        obtained_at: Date.now()
      }, tokens.expires_in || 3600);
    }

    return true;
  }

  /**
   * Retrieve stored tokens
   */
  async getTokens(userId, providerId) {
    // Try Redis cache first
    if (redis.isAvailable()) {
      const cached = await redis.get(`oauth:tokens:${userId}:${providerId}`);
      if (cached) return cached;
    }

    // Fall back to database
    const stored = await prisma.oAuthToken.findUnique({
      where: {
        userId_providerId: { userId, providerId }
      }
    });

    if (!stored) return null;

    return {
      access_token: this.decrypt(stored.accessToken),
      refresh_token: stored.refreshToken ? this.decrypt(stored.refreshToken) : null,
      expires_in: stored.expiresIn,
      token_type: stored.tokenType,
      scope: stored.scope,
      obtained_at: stored.obtainedAt.getTime()
    };
  }

  /**
   * Delete stored tokens
   */
  async deleteTokens(userId, providerId) {
    // Delete from Redis
    if (redis.isAvailable()) {
      await redis.del(`oauth:tokens:${userId}:${providerId}`);
    }

    // Delete from database
    await prisma.oAuthToken.delete({
      where: {
        userId_providerId: { userId, providerId }
      }
    }).catch(() => {}); // Ignore if not found

    return true;
  }

  /**
   * Get all connected providers for a user
   */
  async getConnectedProviders(userId) {
    const tokens = await prisma.oAuthToken.findMany({
      where: { userId },
      select: {
        providerId: true,
        obtainedAt: true,
        expiresIn: true
      }
    });

    return tokens.map(t => ({
      providerId: t.providerId,
      name: this.providers[t.providerId]?.name || t.providerId,
      connectedAt: t.obtainedAt,
      expiresAt: new Date(t.obtainedAt.getTime() + t.expiresIn * 1000)
    }));
  }
}

module.exports = new OAuth2Service();
