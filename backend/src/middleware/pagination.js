/**
 * Pagination Middleware
 * Provides consistent pagination across all API endpoints
 */

const logger = require('../utils/logger');

// Default pagination settings per resource
const PAGINATION_DEFAULTS = {
  transactions: { limit: 50, maxLimit: 200 },
  alerts: { limit: 100, maxLimit: 500 },
  dividends: { limit: 100, maxLimit: 500 },
  holdings: { limit: 100, maxLimit: 500 },
  watchlist: { limit: 50, maxLimit: 200 },
  search: { limit: 20, maxLimit: 100 },
  default: { limit: 50, maxLimit: 200 }
};

/**
 * Parse pagination parameters from query string
 * @param {Object} query - Request query object
 * @param {string} resource - Resource type for default limits
 * @returns {Object} Parsed pagination parameters
 */
function parsePaginationParams(query, resource = 'default') {
  const defaults = PAGINATION_DEFAULTS[resource] || PAGINATION_DEFAULTS.default;

  // Parse page (1-indexed for user-friendliness)
  let page = parseInt(query.page, 10);
  if (isNaN(page) || page < 1) page = 1;

  // Parse limit
  let limit = parseInt(query.limit, 10);
  if (isNaN(limit) || limit < 1) limit = defaults.limit;
  if (limit > defaults.maxLimit) limit = defaults.maxLimit;

  // Calculate offset
  const offset = (page - 1) * limit;

  // Parse sort parameters
  const sortBy = query.sortBy || query.sort_by || 'created_at';
  const sortOrder = (query.sortOrder || query.sort_order || 'desc').toLowerCase();
  const validSortOrder = ['asc', 'desc'].includes(sortOrder) ? sortOrder : 'desc';

  return {
    page,
    limit,
    offset,
    sortBy,
    sortOrder: validSortOrder
  };
}

/**
 * Build pagination response metadata
 * @param {number} total - Total number of records
 * @param {number} page - Current page
 * @param {number} limit - Records per page
 * @returns {Object} Pagination metadata
 */
function buildPaginationMeta(total, page, limit) {
  const totalPages = Math.ceil(total / limit);

  return {
    total,
    page,
    limit,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
    nextPage: page < totalPages ? page + 1 : null,
    prevPage: page > 1 ? page - 1 : null
  };
}

/**
 * Build pagination links for HATEOAS
 * @param {string} baseUrl - Base URL for the resource
 * @param {number} page - Current page
 * @param {number} totalPages - Total number of pages
 * @param {number} limit - Records per page
 * @returns {Object} Pagination links
 */
function buildPaginationLinks(baseUrl, page, totalPages, limit) {
  const links = {
    self: `${baseUrl}?page=${page}&limit=${limit}`
  };

  if (page > 1) {
    links.first = `${baseUrl}?page=1&limit=${limit}`;
    links.prev = `${baseUrl}?page=${page - 1}&limit=${limit}`;
  }

  if (page < totalPages) {
    links.next = `${baseUrl}?page=${page + 1}&limit=${limit}`;
    links.last = `${baseUrl}?page=${totalPages}&limit=${limit}`;
  }

  return links;
}

/**
 * Pagination middleware factory
 * @param {string} resource - Resource type for default limits
 * @returns {Function} Express middleware
 */
function paginationMiddleware(resource = 'default') {
  return (req, res, next) => {
    const pagination = parsePaginationParams(req.query, resource);

    // Attach pagination to request
    req.pagination = pagination;

    // Add pagination helper to response
    res.paginate = (data, total, baseUrl = req.originalUrl.split('?')[0]) => {
      const meta = buildPaginationMeta(total, pagination.page, pagination.limit);
      const links = buildPaginationLinks(baseUrl, pagination.page, meta.totalPages, pagination.limit);

      return res.json({
        success: true,
        data,
        pagination: meta,
        links
      });
    };

    next();
  };
}

/**
 * Build SQL pagination clause
 * @param {Object} pagination - Pagination object from request
 * @param {string[]} allowedSortColumns - Columns that can be sorted on
 * @returns {string} SQL clause for ORDER BY, LIMIT, OFFSET
 */
function buildSqlPagination(pagination, allowedSortColumns = []) {
  const { limit, offset, sortBy, sortOrder } = pagination;

  // Validate sort column to prevent SQL injection
  const safeColumn = allowedSortColumns.includes(sortBy) ? sortBy : 'created_at';
  const safeOrder = sortOrder === 'asc' ? 'ASC' : 'DESC';

  return `ORDER BY ${safeColumn} ${safeOrder} LIMIT ${limit} OFFSET ${offset}`;
}

/**
 * Paginate an array in memory
 * @param {Array} items - Array of items to paginate
 * @param {Object} pagination - Pagination parameters
 * @returns {Object} Paginated result with data and meta
 */
function paginateArray(items, pagination) {
  const { page, limit, offset } = pagination;
  const total = items.length;
  const paginatedItems = items.slice(offset, offset + limit);
  const meta = buildPaginationMeta(total, page, limit);

  return {
    data: paginatedItems,
    pagination: meta
  };
}

module.exports = {
  paginationMiddleware,
  parsePaginationParams,
  buildPaginationMeta,
  buildPaginationLinks,
  buildSqlPagination,
  paginateArray,
  PAGINATION_DEFAULTS
};
