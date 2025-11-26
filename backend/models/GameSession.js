module.exports = (sequelize, DataTypes) => {
  const GameSession = sequelize.define('GameSession', {
    sessionId: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false,
      field: 'session_id',
      comment: 'Simple session identifier (e.g., "main-game")'
    },
    sessionCode: {
      type: DataTypes.STRING(6),
      allowNull: false,
      unique: true,
      field: 'session_code',
      comment: '6-digit code for kiosk connection'
    },
    currentSaveStateUrl: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'current_save_state_url',
      comment: 'MinIO object key for latest save state'
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_active',
      comment: 'Whether session is currently running'
    },
    lastActivityAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: 'last_activity_at'
    }
  }, {
    tableName: 'game_sessions',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        unique: true,
        fields: ['session_code']
      },
      {
        fields: ['is_active']
      }
    ]
  });

  return GameSession;
};
