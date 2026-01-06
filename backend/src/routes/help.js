const express = require('express');
const router = express.Router();
const helpContent = require('../services/helpContent');
const logger = require('../utils/logger');

/**
 * GET /api/help/categories
 * Get all help categories
 */
router.get('/categories', (req, res) => {
  try {
    const categories = helpContent.categories.sort((a, b) => a.order - b.order);
    res.json({
      success: true,
      categories
    });
  } catch (error) {
    logger.error('Error getting help categories:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/help/articles
 * Get all articles or filter by category
 */
router.get('/articles', (req, res) => {
  try {
    const { category, featured, search } = req.query;

    let articles = [...helpContent.articles];

    // Filter by category
    if (category) {
      articles = articles.filter(a => a.categoryId === category);
    }

    // Filter by featured
    if (featured === 'true') {
      articles = articles.filter(a => a.featured);
    }

    // Search in title, summary, and tags
    if (search) {
      const searchLower = search.toLowerCase();
      articles = articles.filter(a =>
        a.title.toLowerCase().includes(searchLower) ||
        a.summary.toLowerCase().includes(searchLower) ||
        a.tags.some(tag => tag.toLowerCase().includes(searchLower))
      );
    }

    // Sort by order
    articles.sort((a, b) => a.order - b.order);

    // Return summary only (without full content)
    const articleSummaries = articles.map(({ content, ...rest }) => rest);

    res.json({
      success: true,
      articles: articleSummaries,
      total: articles.length
    });
  } catch (error) {
    logger.error('Error getting help articles:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/help/articles/:slug
 * Get a specific article by slug
 */
router.get('/articles/:slug', (req, res) => {
  try {
    const { slug } = req.params;
    const article = helpContent.articles.find(a => a.slug === slug);

    if (!article) {
      return res.status(404).json({
        success: false,
        error: 'Article not found'
      });
    }

    // Get category info
    const category = helpContent.categories.find(c => c.id === article.categoryId);

    // Get related articles (same category, excluding current)
    const relatedArticles = helpContent.articles
      .filter(a => a.categoryId === article.categoryId && a.id !== article.id)
      .slice(0, 3)
      .map(({ content, ...rest }) => rest);

    res.json({
      success: true,
      article,
      category,
      relatedArticles
    });
  } catch (error) {
    logger.error('Error getting help article:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/help/faqs
 * Get all FAQs or filter by category
 */
router.get('/faqs', (req, res) => {
  try {
    const { category } = req.query;

    let faqs = [...helpContent.faqs];

    // Filter by category
    if (category) {
      faqs = faqs.filter(f => f.categoryId === category);
    }

    // Sort by order
    faqs.sort((a, b) => a.order - b.order);

    // Group by category
    const faqsByCategory = {};
    faqs.forEach(faq => {
      if (!faqsByCategory[faq.categoryId]) {
        faqsByCategory[faq.categoryId] = [];
      }
      faqsByCategory[faq.categoryId].push(faq);
    });

    res.json({
      success: true,
      faqs,
      faqsByCategory,
      total: faqs.length
    });
  } catch (error) {
    logger.error('Error getting FAQs:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/help/search
 * Search across all help content
 */
router.get('/search', (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Search query must be at least 2 characters'
      });
    }

    const searchLower = q.toLowerCase();
    const results = {
      articles: [],
      faqs: []
    };

    // Search articles
    results.articles = helpContent.articles
      .filter(a =>
        a.title.toLowerCase().includes(searchLower) ||
        a.summary.toLowerCase().includes(searchLower) ||
        a.content.toLowerCase().includes(searchLower) ||
        a.tags.some(tag => tag.toLowerCase().includes(searchLower))
      )
      .map(({ content, ...rest }) => ({
        ...rest,
        type: 'article'
      }));

    // Search FAQs
    results.faqs = helpContent.faqs
      .filter(f =>
        f.question.toLowerCase().includes(searchLower) ||
        f.answer.toLowerCase().includes(searchLower)
      )
      .map(faq => ({
        ...faq,
        type: 'faq'
      }));

    const totalResults = results.articles.length + results.faqs.length;

    res.json({
      success: true,
      query: q,
      results,
      totalResults
    });
  } catch (error) {
    logger.error('Error searching help content:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/help/quick-links
 * Get quick links for common actions
 */
router.get('/quick-links', (req, res) => {
  try {
    res.json({
      success: true,
      links: helpContent.quickLinks
    });
  } catch (error) {
    logger.error('Error getting quick links:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/help/overview
 * Get overview of all help content
 */
router.get('/overview', (req, res) => {
  try {
    const overview = {
      categories: helpContent.categories.sort((a, b) => a.order - b.order),
      featuredArticles: helpContent.articles
        .filter(a => a.featured)
        .map(({ content, ...rest }) => rest)
        .sort((a, b) => a.order - b.order),
      popularFaqs: helpContent.faqs
        .slice(0, 5)
        .sort((a, b) => a.order - b.order),
      quickLinks: helpContent.quickLinks,
      stats: {
        totalArticles: helpContent.articles.length,
        totalFaqs: helpContent.faqs.length,
        totalCategories: helpContent.categories.length
      }
    };

    res.json({
      success: true,
      overview
    });
  } catch (error) {
    logger.error('Error getting help overview:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
