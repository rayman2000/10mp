'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Create game_turns table
    await queryInterface.createTable('game_turns', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      player_name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      location: {
        type: Sequelize.STRING,
        allowNull: true
      },
      badge_count: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      playtime: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'Playtime in seconds'
      },
      money: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      party_data: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'JSON data containing Pokemon party information'
      },
      turn_duration: {
        type: Sequelize.INTEGER,
        defaultValue: 600,
        comment: 'Turn duration in seconds (default 10 minutes)'
      },
      turn_ended_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW
      },
      save_state_url: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: 'MinIO object key/URL for save state file'
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
    await queryInterface.addIndex('game_turns', ['player_name'], {
      name: 'game_turns_player_name_idx'
    });

    await queryInterface.addIndex('game_turns', ['turn_ended_at'], {
      name: 'game_turns_turn_ended_at_idx'
    });

    await queryInterface.addIndex('game_turns', ['created_at'], {
      name: 'game_turns_created_at_idx'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('game_turns');
  }
};
