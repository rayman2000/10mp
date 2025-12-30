import React, { useState } from 'react';

const BADGE_COLORS = [
  '#8B8B83', // Boulder
  '#3B82F6', // Cascade
  '#F59E0B', // Thunder
  '#10B981', // Rainbow
  '#EC4899', // Soul
  '#8B5CF6', // Marsh
  '#EF4444', // Volcano
  '#22C55E'  // Earth
];

const PlayerLeaderboard = ({ data }) => {
  const [showAll, setShowAll] = useState(false);

  if (!data) return null;

  const { players, topContributors } = data;

  const formatPlaytime = (seconds) => {
    if (!seconds) return '0m';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const displayPlayers = showAll ? players : players.slice(0, 10);

  return (
    <div className="player-leaderboard">
      {/* Top Contributors Summary */}
      <div className="top-contributors">
        <div className="contributor-section">
          <h4>Most Turns Played</h4>
          <div className="contributor-list">
            {topContributors.byTurns?.slice(0, 5).map((player, index) => (
              <div key={player.playerName} className="contributor-item">
                <span className="rank">#{index + 1}</span>
                <span className="name">{player.playerName}</span>
                <span className="count">{player.count} turns</span>
              </div>
            ))}
          </div>
        </div>

        <div className="contributor-section">
          <h4>Badge Earners</h4>
          <div className="contributor-list">
            {topContributors.byBadges?.slice(0, 5).map((player, index) => (
              <div key={player.playerName} className="contributor-item badge-earner">
                <span className="rank">#{index + 1}</span>
                <span className="name">{player.playerName}</span>
                <span className="badges">
                  {player.badges?.map(badgeNum => (
                    <span
                      key={badgeNum}
                      className="mini-badge"
                      style={{ backgroundColor: BADGE_COLORS[badgeNum - 1] }}
                      title={`Badge ${badgeNum}`}
                    >
                      {badgeNum}
                    </span>
                  ))}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Full Player Table */}
      <div className="player-table-container">
        <h4>All Players ({players.length})</h4>
        <table className="player-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Player</th>
              <th>Turns</th>
              <th>Playtime</th>
              <th>Max Badges</th>
              <th>Messages</th>
              <th>Badges Earned</th>
            </tr>
          </thead>
          <tbody>
            {displayPlayers.map((player, index) => (
              <tr key={player.playerName}>
                <td className="rank-cell">{index + 1}</td>
                <td className="name-cell">{player.playerName}</td>
                <td>{player.turnCount}</td>
                <td>{formatPlaytime(player.totalPlaytime)}</td>
                <td>{player.maxBadges}/8</td>
                <td>{player.messagesLeft}</td>
                <td className="badges-cell">
                  {player.badgesEarned?.length > 0 ? (
                    player.badgesEarned.map(badgeNum => (
                      <span
                        key={badgeNum}
                        className="mini-badge"
                        style={{ backgroundColor: BADGE_COLORS[badgeNum - 1] }}
                        title={`Badge ${badgeNum}`}
                      >
                        {badgeNum}
                      </span>
                    ))
                  ) : (
                    <span className="no-badges">-</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {players.length > 10 && (
          <button
            className="show-more-btn"
            onClick={() => setShowAll(!showAll)}
          >
            {showAll ? 'Show Less' : `Show All (${players.length})`}
          </button>
        )}
      </div>

      {players.length === 0 && (
        <div className="no-players">
          <p>No players yet. Be the first to play!</p>
        </div>
      )}
    </div>
  );
};

export default PlayerLeaderboard;
