'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Add new column for save state URL
    await queryInterface.addColumn('game_turns', 'save_state_url', {
      type: Sequelize.STRING,
      allowNull: true,
      comment: 'MinIO object key/URL for save state file'
    });

    // Drop old TEXT column (data loss acceptable for demo/kiosk setup)
    await queryInterface.removeColumn('game_turns', 'save_state');
  },

  down: async (queryInterface, Sequelize) => {
    // Restore old TEXT column
    await queryInterface.addColumn('game_turns', 'save_state', {
      type: Sequelize.TEXT,
      allowNull: true,
      comment: 'Base64 encoded save state data'
    });

    // Remove URL column
    await queryInterface.removeColumn('game_turns', 'save_state_url');
  }
};
