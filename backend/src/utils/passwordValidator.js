/**
 * Password Validation Utility
 * Enforces strong password requirements
 */

const PasswordValidator = require('password-validator');

// Create password schema
const schema = new PasswordValidator();

// Define password requirements
schema
  .is().min(8) // Minimum length 8
  .is().max(128) // Maximum length 128
  .has().uppercase() // Must have uppercase letters
  .has().lowercase() // Must have lowercase letters
  .has().digits(1) // Must have at least 1 digit
  .has().symbols() // Must have symbols
  .has().not().spaces() // Should not have spaces
  .is().not().oneOf([ // Blacklist common passwords
    'Password123!',
    'Admin123!',
    'Welcome123!',
    'P@ssw0rd',
    'Password1!',
    'Qwerty123!',
    '12345678!',
    'Abc123456!',
    'P@ssword1',
    'Welcome1!'
  ]);

/**
 * Validate password against security requirements
 * @param {string} password - Password to validate
 * @returns {object} - { valid: boolean, errors: array }
 */
function validatePassword(password) {
  if (!password) {
    return {
      valid: false,
      errors: ['Password is required']
    };
  }

  const validationErrors = schema.validate(password, { details: true });

  if (validationErrors.length === 0) {
    return { valid: true, errors: [] };
  }

  // Convert validation errors to user-friendly messages
  const errors = validationErrors.map(err => {
    switch (err.validation) {
      case 'min':
        return 'Password must be at least 8 characters long';
      case 'max':
        return 'Password must not exceed 128 characters';
      case 'uppercase':
        return 'Password must contain at least one uppercase letter';
      case 'lowercase':
        return 'Password must contain at least one lowercase letter';
      case 'digits':
        return 'Password must contain at least one number';
      case 'symbols':
        return 'Password must contain at least one special character (!@#$%^&*)';
      case 'spaces':
        return 'Password must not contain spaces';
      case 'oneOf':
        return 'This password is too common. Please choose a more secure password';
      default:
        return err.message;
    }
  });

  return {
    valid: false,
    errors
  };
}

/**
 * Get password strength score (0-100)
 * @param {string} password - Password to score
 * @returns {object} - { score: number, strength: string, feedback: array }
 */
function getPasswordStrength(password) {
  if (!password) {
    return { score: 0, strength: 'None', feedback: ['Please enter a password'] };
  }

  let score = 0;
  const feedback = [];

  // Length scoring (0-30 points)
  if (password.length >= 8) score += 10;
  if (password.length >= 12) score += 10;
  if (password.length >= 16) score += 10;

  // Complexity scoring (0-40 points)
  if (/[a-z]/.test(password)) score += 10;
  if (/[A-Z]/.test(password)) score += 10;
  if (/\d/.test(password)) score += 10;
  if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) score += 10;

  // Variety scoring (0-20 points)
  const uniqueChars = new Set(password.split('')).size;
  if (uniqueChars >= 8) score += 10;
  if (uniqueChars >= 12) score += 10;

  // Pattern detection (penalties)
  if (/(.)\1{2,}/.test(password)) {
    score -= 10;
    feedback.push('Avoid repeating characters');
  }

  if (/012|123|234|345|456|567|678|789/.test(password)) {
    score -= 10;
    feedback.push('Avoid sequential numbers');
  }

  if (/abc|bcd|cde|def|efg|fgh|ghi|hij/i.test(password)) {
    score -= 10;
    feedback.push('Avoid sequential letters');
  }

  // Ensure score is between 0-100
  score = Math.max(0, Math.min(100, score));

  // Determine strength category
  let strength;
  if (score < 30) {
    strength = 'Weak';
    feedback.push('Password is too weak. Add more characters and variety.');
  } else if (score < 60) {
    strength = 'Fair';
    feedback.push('Password could be stronger. Consider adding more characters.');
  } else if (score < 80) {
    strength = 'Good';
    feedback.push('Password is good but could be stronger.');
  } else {
    strength = 'Strong';
    feedback.push('Password is strong!');
  }

  return {
    score,
    strength,
    feedback
  };
}

/**
 * Check if password has been compromised (check against common breaches)
 * In production, this would integrate with Have I Been Pwned API
 * @param {string} password - Password to check
 * @returns {Promise<boolean>} - true if compromised
 */
async function isPasswordCompromised(password) {
  // For now, just check against our blacklist
  const blacklist = schema.validate(password, { list: true });
  return blacklist.includes('oneOf');
}

module.exports = {
  validatePassword,
  getPasswordStrength,
  isPasswordCompromised
};
