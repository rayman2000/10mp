'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('game_turns', 'message', {
      type: Sequelize.STRING(500),
      allowNull: true,
      comment: 'Message left by player for the next player'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('game_turns', 'message');
  }
};
