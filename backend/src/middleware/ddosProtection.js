/**
 * DDoS Protection - DISABLED FOR TESTING
 * Re-enable in production by uncommenting the rate limiting logic
 */

function ddosProtection(req, res, next) {
  // Disabled for testing - all requests pass through
  next();
}

function requestSizeLimiter(req, res, next) {
  next();
}

function slowlorisProtection(req, res, next) {
  next();
}

module.exports = { ddosProtection, requestSizeLimiter, slowlorisProtection };
