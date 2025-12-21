#!/usr/bin/env node

/**
 * WealthPilot Pro - Postman Sync Script
 *
 * Uploads collection and environments to your Postman workspace
 *
 * Usage:
 *   node sync-to-postman.js
 *
 * Or set POSTMAN_API_KEY environment variable:
 *   POSTMAN_API_KEY=your-key node sync-to-postman.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// Configuration
const POSTMAN_API_KEY = process.env.POSTMAN_API_KEY || 'PMAK-694416f850655b0001fccd5f-0c5d0567281afe84b65c77555240f1883d';
const POSTMAN_API_BASE = 'api.getpostman.com';

// Files to sync
const FILES = {
  collection: 'WealthPilot-Pro-API.postman_collection.json',
  devEnv: 'WealthPilot-Pro.postman_environment.json',
  prodEnv: 'WealthPilot-Pro-Production.postman_environment.json'
};

/**
 * Make HTTPS request to Postman API
 */
function postmanRequest(method, endpoint, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: POSTMAN_API_BASE,
      port: 443,
      path: endpoint,
      method: method,
      headers: {
        'X-Api-Key': POSTMAN_API_KEY,
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject(new Error(`API Error: ${res.statusCode} - ${JSON.stringify(parsed)}`));
          }
        } catch (e) {
          reject(new Error(`Parse Error: ${body}`));
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

/**
 * Get all collections in workspace
 */
async function getCollections() {
  console.log('📋 Fetching existing collections...');
  const response = await postmanRequest('GET', '/collections');
  return response.collections || [];
}

/**
 * Get all environments in workspace
 */
async function getEnvironments() {
  console.log('🌍 Fetching existing environments...');
  const response = await postmanRequest('GET', '/environments');
  return response.environments || [];
}

/**
 * Create or update collection
 */
async function syncCollection(filePath) {
  const fileName = path.basename(filePath);
  console.log(`\n📦 Syncing collection: ${fileName}`);

  const collection = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const collectionName = collection.info?.name || 'WealthPilot Pro API';

  // Fix: Remove invalid _postman_id or set to valid UUID format
  if (collection.info && collection.info._postman_id) {
    // Generate a proper UUID if needed
    const uuid = require('crypto').randomUUID();
    collection.info._postman_id = uuid;
  }

  // Check if collection exists
  const collections = await getCollections();
  const existing = collections.find(c => c.name === collectionName);

  if (existing) {
    console.log(`   ♻️  Updating existing collection (ID: ${existing.uid})...`);
    await postmanRequest('PUT', `/collections/${existing.uid}`, { collection });
    console.log(`   ✅ Collection updated successfully!`);
    return existing.uid;
  } else {
    console.log(`   ➕ Creating new collection...`);
    const response = await postmanRequest('POST', '/collections', { collection });
    console.log(`   ✅ Collection created! ID: ${response.collection?.uid}`);
    return response.collection?.uid;
  }
}

/**
 * Create or update environment
 */
async function syncEnvironment(filePath) {
  const fileName = path.basename(filePath);
  console.log(`\n🌍 Syncing environment: ${fileName}`);

  const environment = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const envName = environment.name || 'WealthPilot Pro';

  // Fix: Generate proper UUID for id field
  if (environment.id && !isValidUUID(environment.id)) {
    environment.id = require('crypto').randomUUID();
  }

  // Check if environment exists
  const environments = await getEnvironments();
  const existing = environments.find(e => e.name === envName);

  if (existing) {
    console.log(`   ♻️  Updating existing environment (ID: ${existing.uid})...`);
    await postmanRequest('PUT', `/environments/${existing.uid}`, { environment });
    console.log(`   ✅ Environment updated successfully!`);
    return existing.uid;
  } else {
    console.log(`   ➕ Creating new environment...`);
    const response = await postmanRequest('POST', '/environments', { environment });
    console.log(`   ✅ Environment created! ID: ${response.environment?.uid}`);
    return response.environment?.uid;
  }
}

/**
 * Check if string is valid UUID
 */
function isValidUUID(str) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

/**
 * Main sync function
 */
async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║       WealthPilot Pro - Postman Sync                       ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');

  const dir = __dirname;

  try {
    // Verify API key
    console.log('🔑 Verifying API key...');
    const me = await postmanRequest('GET', '/me');
    console.log(`   ✅ Authenticated as: ${me.user?.username || 'Unknown'}`);

    // Sync collection
    const collectionPath = path.join(dir, FILES.collection);
    if (fs.existsSync(collectionPath)) {
      await syncCollection(collectionPath);
    } else {
      console.log(`   ⚠️  Collection file not found: ${FILES.collection}`);
    }

    // Sync development environment
    const devEnvPath = path.join(dir, FILES.devEnv);
    if (fs.existsSync(devEnvPath)) {
      await syncEnvironment(devEnvPath);
    } else {
      console.log(`   ⚠️  Dev environment file not found: ${FILES.devEnv}`);
    }

    // Sync production environment
    const prodEnvPath = path.join(dir, FILES.prodEnv);
    if (fs.existsSync(prodEnvPath)) {
      await syncEnvironment(prodEnvPath);
    } else {
      console.log(`   ⚠️  Prod environment file not found: ${FILES.prodEnv}`);
    }

    console.log('\n════════════════════════════════════════════════════════════');
    console.log('✅ Sync completed successfully!');
    console.log('');
    console.log('Open Postman to view your synced collection:');
    console.log('https://web.postman.co/workspace');
    console.log('════════════════════════════════════════════════════════════');

  } catch (error) {
    console.error('\n❌ Sync failed:', error.message);
    process.exit(1);
  }
}

// Run
main();
