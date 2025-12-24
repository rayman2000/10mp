'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('game_turns', 'invalidated_at', {
      type: Sequelize.DATE,
      allowNull: true,
      defaultValue: null
    });

    await queryInterface.addColumn('game_turns', 'invalidated_by_restore_to_turn_id', {
      type: Sequelize.UUID,
      allowNull: true,
      defaultValue: null,
      references: {
        model: 'game_turns',
        key: 'id'
      }
    });

    // Add index for faster queries on non-invalidated turns
    await queryInterface.addIndex('game_turns', ['invalidated_at'], {
      name: 'idx_game_turns_invalidated_at'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeIndex('game_turns', 'idx_game_turns_invalidated_at');
    await queryInterface.removeColumn('game_turns', 'invalidated_by_restore_to_turn_id');
    await queryInterface.removeColumn('game_turns', 'invalidated_at');
  }
};
