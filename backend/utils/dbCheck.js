/**
 * Database verification utilities
 * Checks if required database tables exist
 */

const { sequelize } = require('../models');

/**
 * Check if a specific table exists in the database
 * @param {string} tableName - Name of the table to check
 * @returns {Promise<boolean>} - True if table exists
 */
async function tableExists(tableName) {
  try {
    const [results] = await sequelize.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = '${tableName}'
      );
    `);

    return results[0].exists;
  } catch (error) {
    console.error(`Error checking if table ${tableName} exists:`, error);
    return false;
  }
}

/**
 * Check if all required tables exist
 * @returns {Promise<{allExist: boolean, missing: string[]}>}
 */
async function checkRequiredTables() {
  const requiredTables = [
    'game_turns',
    'game_sessions',
    'kiosk_registrations'
  ];

  const missing = [];

  for (const tableName of requiredTables) {
    const exists = await tableExists(tableName);
    if (!exists) {
      missing.push(tableName);
    }
  }

  return {
    allExist: missing.length === 0,
    missing: missing,
    required: requiredTables
  };
}

/**
 * Verify database connection is working
 * @returns {Promise<boolean>} - True if connection successful
 */
async function verifyConnection() {
  try {
    await sequelize.authenticate();
    return true;
  } catch (error) {
    console.error('Database connection failed:', error);
    return false;
  }
}

/**
 * Run database migrations using Sequelize CLI
 * @returns {Promise<boolean>} - True if migrations successful
 */
async function runMigrations() {
  try {
    console.log('Running database migrations...');

    // Use child_process to run sequelize-cli
    const { execSync } = require('child_process');
    execSync('npx sequelize-cli db:migrate', {
      stdio: 'inherit',
      cwd: __dirname + '/..'
    });

    console.log('Migrations completed successfully');
    return true;
  } catch (error) {
    console.error('Failed to run migrations:', error);
    return false;
  }
}

/**
 * Initialize database - check tables and run migrations if needed
 * @param {boolean} autoMigrate - Whether to automatically run migrations
 * @returns {Promise<{success: boolean, ranMigrations: boolean, message: string}>}
 */
async function initializeDatabase(autoMigrate = true) {
  try {
    // First, verify connection
    const connected = await verifyConnection();
    if (!connected) {
      return {
        success: false,
        ranMigrations: false,
        message: 'Failed to connect to database. Check your DB_HOST, DB_PORT, DB_USERNAME, and DB_PASSWORD environment variables.'
      };
    }

    console.log('Database connection established successfully.');

    // Check if required tables exist
    const tableCheck = await checkRequiredTables();

    if (tableCheck.allExist) {
      console.log('All required database tables exist.');
      return {
        success: true,
        ranMigrations: false,
        message: 'Database already initialized'
      };
    }

    // Tables missing
    console.log(`Missing database tables: ${tableCheck.missing.join(', ')}`);

    if (!autoMigrate) {
      return {
        success: false,
        ranMigrations: false,
        message: `Database tables missing: ${tableCheck.missing.join(', ')}. Run: npm run db:migrate`
      };
    }

    // Auto-run migrations
    console.log('Auto-migrating database...');
    const migrated = await runMigrations();

    if (migrated) {
      return {
        success: true,
        ranMigrations: true,
        message: 'Database initialized successfully (migrations ran)'
      };
    } else {
      return {
        success: false,
        ranMigrations: false,
        message: 'Failed to run database migrations. Run manually: npm run db:migrate'
      };
    }
  } catch (error) {
    console.error('Database initialization error:', error);
    return {
      success: false,
      ranMigrations: false,
      message: `Database initialization failed: ${error.message}`
    };
  }
}

module.exports = {
  tableExists,
  checkRequiredTables,
  verifyConnection,
  runMigrations,
  initializeDatabase
};
