
module.exports = (sequelize, DataTypes) => {
  const GameTurn = sequelize.define('GameTurn', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  playerName: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'player_name'
  },
  location: {
    type: DataTypes.STRING,
    allowNull: true
  },
  badgeCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'badge_count'
  },
  playtime: {
    type: DataTypes.INTEGER,
    comment: 'Playtime in seconds',
    allowNull: true
  },
  money: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  partyData: {
    type: DataTypes.JSONB,
    allowNull: true,
    field: 'party_data',
    comment: 'JSON data containing Pokemon party information'
  },
  turnDuration: {
    type: DataTypes.INTEGER,
    defaultValue: 600,
    field: 'turn_duration',
    comment: 'Turn duration in seconds (default 10 minutes)'
  },
  turnEndedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'turn_ended_at'
  },
  saveStateUrl: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'save_state_url',
    comment: 'MinIO object key/URL for save state file'
  }
}, {
  tableName: 'game_turns',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      fields: ['player_name']
    },
    {
      fields: ['turn_ended_at']
    },
    {
      fields: ['created_at']
    }
  ]
});

  return GameTurn;
};