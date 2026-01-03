const rateLimit = new Map();
const blacklist = new Map();

const CONFIG = {
  WINDOW_MS: 60 * 1000,
  MAX_REQUESTS_PER_WINDOW: 1000,
  BLACKLIST_DURATION_MS: 60 * 1000, // 1 minute only
  BLACKLIST_THRESHOLD: 2000,
  BYPASS_PATHS: new Set(['/health', '/api/health', '/favicon.ico', '/api/auth/register', '/api/auth/login']),
};

setInterval(() => {
  const now = Date.now();
  for (const [ip, exp] of blacklist.entries()) {
    if (now > exp) blacklist.delete(ip);
  }
  for (const [ip, data] of rateLimit.entries()) {
    if (now - data.windowStart > CONFIG.WINDOW_MS * 2) rateLimit.delete(ip);
  }
}, 60000);

function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
         req.headers['x-real-ip'] ||
         req.connection?.remoteAddress || 'unknown';
}

function ddosProtection(req, res, next) {
  if (CONFIG.BYPASS_PATHS.has(req.path)) return next();

  const ip = getClientIP(req);
  const now = Date.now();
  const whitelist = (process.env.WHITELIST_IPS || '').split(',');
  if (whitelist.includes(ip)) return next();

  if (blacklist.has(ip) && now < blacklist.get(ip)) {
    const retry = Math.ceil((blacklist.get(ip) - now) / 1000);
    return res.status(403).json({ success: false, error: 'Access denied', retryAfter: retry });
  }
  blacklist.delete(ip);

  if (!rateLimit.has(ip)) rateLimit.set(ip, { count: 0, windowStart: now });
  const data = rateLimit.get(ip);
  if (now - data.windowStart > CONFIG.WINDOW_MS) { data.count = 0; data.windowStart = now; }
  data.count++;

  if (data.count > CONFIG.BLACKLIST_THRESHOLD) {
    blacklist.set(ip, now + CONFIG.BLACKLIST_DURATION_MS);
    return res.status(403).json({ success: false, error: 'Access denied' });
  }
  if (data.count > CONFIG.MAX_REQUESTS_PER_WINDOW) {
    return res.status(429).json({ success: false, error: 'Too many requests' });
  }
  next();
}

// Dummy middleware for compatibility
function requestSizeLimiter(req, res, next) { next(); }
function slowlorisProtection(req, res, next) { next(); }

module.exports = { ddosProtection, requestSizeLimiter, slowlorisProtection };
