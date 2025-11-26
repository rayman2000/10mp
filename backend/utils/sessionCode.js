/**
 * Generate a random 6-digit session code
 * @returns {string} - 6-digit numeric code (e.g., "123456")
 */
function generateSessionCode() {
  // Generate a random number between 100000 and 999999
  const code = Math.floor(100000 + Math.random() * 900000);
  return code.toString();
}

/**
 * Validate a session code format
 * @param {string} code - Code to validate
 * @returns {boolean} - True if code is valid 6-digit format
 */
function isValidSessionCode(code) {
  if (!code || typeof code !== 'string') {
    return false;
  }

  // Must be exactly 6 digits
  return /^\d{6}$/.test(code);
}

module.exports = {
  generateSessionCode,
  isValidSessionCode
};
