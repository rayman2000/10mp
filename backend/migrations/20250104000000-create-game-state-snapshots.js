'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('game_state_snapshots', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      game_turn_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'game_turns',
          key: 'id'
        },
        onDelete: 'CASCADE',
        comment: 'Foreign key to game_turns table'
      },
      sequence_number: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: 'Order of snapshot within turn (0-indexed)'
      },
      captured_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
        comment: 'Real-world timestamp when snapshot was captured'
      },
      in_game_playtime: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'In-game playtime in seconds from game memory'
      },
      player_x: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'Player X coordinate from SaveBlock1'
      },
      player_y: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'Player Y coordinate from SaveBlock1'
      },
      location: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: 'Current map/location name'
      },
      money: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'Player money (decrypted)'
      },
      badge_count: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'Number of gym badges (0-8)'
      },
      is_in_battle: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'Whether player is currently in battle'
      },
      battle_type: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'Battle type flags from 0x02022B4C'
      },
      enemy_party: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'Enemy Pokemon party data (only when in battle)'
      },
      pokedex_seen_count: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'Number of Pokemon seen in Pokedex'
      },
      pokedex_caught_count: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'Number of Pokemon caught in Pokedex'
      },
      bag_items_count: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'Total count of items in bag (all pockets)'
      },
      party_data: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'Player party Pokemon snapshot'
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

    // Add index on game_turn_id for fast lookups
    await queryInterface.addIndex('game_state_snapshots', ['game_turn_id'], {
      name: 'idx_snapshots_turn_id'
    });

    // Add unique compound index on (game_turn_id, sequence_number)
    await queryInterface.addIndex('game_state_snapshots', ['game_turn_id', 'sequence_number'], {
      name: 'idx_snapshots_turn_seq',
      unique: true
    });

    // Add index on captured_at for chronological queries
    await queryInterface.addIndex('game_state_snapshots', ['captured_at'], {
      name: 'idx_snapshots_captured_at'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('game_state_snapshots');
  }
};
