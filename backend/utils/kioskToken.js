/**
 * Kiosk token generation utilities
 * Generates cryptographically secure tokens for kiosk registration
 */

const crypto = require('crypto');

/**
 * Generate a cryptographically secure random token for kiosk registration
 * @param {number} length - Token length (default: 16 characters)
 * @returns {string} - Alphanumeric token
 */
function generateKioskToken(length = 16) {
  // Generate random bytes
  const bytes = crypto.randomBytes(Math.ceil(length * 3 / 4));

  // Convert to base64 and remove non-alphanumeric characters
  const token = bytes
    .toString('base64')
    .replace(/[^a-zA-Z0-9]/g, '')
    .substring(0, length);

  // Ensure we have enough characters (fallback if base64 conversion was too short)
  if (token.length < length) {
    return generateKioskToken(length); // Recursive call to get full length
  }

  return token;
}

/**
 * Generate a kiosk ID based on browser fingerprint or random
 * In production, this should use device-specific identifiers
 * @returns {string} - Unique kiosk identifier
 */
function generateKioskId() {
  // For now, generate a random ID
  // In production, use MAC address, device ID, or browser fingerprint
  const timestamp = Date.now();
  const random = generateKioskToken(8);
  return `kiosk-${timestamp}-${random}`;
}

/**
 * Validate kiosk token format
 * @param {string} token - Token to validate
 * @returns {boolean} - True if valid format
 */
function isValidKioskToken(token) {
  if (typeof token !== 'string') {
    return false;
  }

  // Must be at least 12 characters, alphanumeric only
  return /^[a-zA-Z0-9]{12,32}$/.test(token);
}

/**
 * Generate a display-friendly token (with dashes for readability)
 * @param {string} token - Original token
 * @returns {string} - Formatted token (e.g., "ABCD-EFGH-IJKL-MNOP")
 */
function formatTokenForDisplay(token) {
  if (!token) return '';

  // Convert to uppercase and add dashes every 4 characters
  return token
    .toUpperCase()
    .match(/.{1,4}/g)
    .join('-');
}

/**
 * Remove formatting from display token
 * @param {string} formattedToken - Token with dashes
 * @returns {string} - Plain token
 */
function unformatToken(formattedToken) {
  if (!formattedToken) return '';
  return formattedToken.replace(/[^a-zA-Z0-9]/g, '');
}

module.exports = {
  generateKioskToken,
  generateKioskId,
  isValidKioskToken,
  formatTokenForDisplay,
  unformatToken
};
