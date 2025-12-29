module.exports = (sequelize, DataTypes) => {
  const GameStateSnapshot = sequelize.define('GameStateSnapshot', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    gameTurnId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'game_turn_id'
    },
    sequenceNumber: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'sequence_number'
    },
    capturedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'captured_at'
    },
    inGamePlaytime: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'in_game_playtime'
    },
    playerX: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'player_x'
    },
    playerY: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'player_y'
    },
    location: {
      type: DataTypes.STRING,
      allowNull: true
    },
    money: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    badgeCount: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'badge_count'
    },
    isInBattle: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_in_battle'
    },
    battleType: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'battle_type'
    },
    enemyParty: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: 'enemy_party'
    },
    pokedexSeenCount: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'pokedex_seen_count'
    },
    pokedexCaughtCount: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'pokedex_caught_count'
    },
    bagItemsCount: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'bag_items_count'
    },
    partyData: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: 'party_data'
    }
  }, {
    tableName: 'game_state_snapshots',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  GameStateSnapshot.associate = function(models) {
    GameStateSnapshot.belongsTo(models.GameTurn, {
      foreignKey: 'gameTurnId',
      as: 'gameTurn'
    });
  };

  return GameStateSnapshot;
};
