'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Add 'denied' to the status ENUM
    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_kiosk_registrations_status" ADD VALUE IF NOT EXISTS 'denied';
    `);

    // Add deniedAt column
    await queryInterface.addColumn('kiosk_registrations', 'denied_at', {
      type: Sequelize.DATE,
      allowNull: true,
      comment: 'When admin denied this kiosk'
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Remove deniedAt column
    await queryInterface.removeColumn('kiosk_registrations', 'denied_at');

    // Note: PostgreSQL doesn't support removing values from ENUM types easily
    // If rollback is needed, the ENUM type would need to be recreated
    console.log('Warning: Cannot remove "denied" from ENUM without recreating the type');
  }
};
