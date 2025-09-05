'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
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
        allowNull: true
      },
      money: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      party_data: {
        type: Sequelize.JSONB,
        allowNull: true
      },
      turn_duration: {
        type: Sequelize.INTEGER,
        defaultValue: 600
      },
      turn_ended_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW
      },
      save_state: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW
      }
    });

    await queryInterface.addIndex('game_turns', ['player_name']);
    await queryInterface.addIndex('game_turns', ['turn_ended_at']);
    await queryInterface.addIndex('game_turns', ['created_at']);
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.dropTable('game_turns');
  }
};
