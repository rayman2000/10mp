'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('game_sessions', {
      session_id: {
        type: Sequelize.STRING,
        primaryKey: true,
        allowNull: false,
        comment: 'Simple session identifier (e.g., "main-game")'
      },
      session_code: {
        type: Sequelize.STRING(6),
        allowNull: false,
        unique: true,
        comment: '6-digit code for kiosk connection'
      },
      current_save_state_url: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: 'MinIO object key for latest save state'
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        comment: 'Whether session is currently running'
      },
      last_activity_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      }
    });

    // Add indexes
    await queryInterface.addIndex('game_sessions', ['session_code'], {
      unique: true,
      name: 'game_sessions_session_code_unique'
    });

    await queryInterface.addIndex('game_sessions', ['is_active'], {
      name: 'game_sessions_is_active_idx'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('game_sessions');
  }
};
