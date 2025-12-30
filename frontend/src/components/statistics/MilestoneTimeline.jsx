import React from 'react';

const BADGE_COLORS = [
  '#8B8B83', // Boulder - gray
  '#3B82F6', // Cascade - blue
  '#F59E0B', // Thunder - yellow
  '#10B981', // Rainbow - green
  '#EC4899', // Soul - pink
  '#8B5CF6', // Marsh - purple
  '#EF4444', // Volcano - red
  '#22C55E'  // Earth - bright green
];

const MilestoneTimeline = ({ data }) => {
  if (!data) return null;

  const { badgeMilestones, currentProgress } = data;

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatPlaytime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  return (
    <div className="milestone-timeline">
      {/* Current Progress Summary */}
      <div className="current-progress">
        <div className="badge-display">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className={`badge-slot ${i < currentProgress.badgeCount ? 'earned' : 'empty'}`}
              style={{
                backgroundColor: i < currentProgress.badgeCount ? BADGE_COLORS[i] : '#374151'
              }}
              title={`Badge ${i + 1}`}
            >
              {i + 1}
            </div>
          ))}
        </div>
        <div className="progress-stats">
          <span>{currentProgress.badgeCount}/8 Badges</span>
          {currentProgress.pokedexCaught > 0 && (
            <span>{currentProgress.pokedexCaught} Caught</span>
          )}
          {currentProgress.pokedexSeen > 0 && (
            <span>{currentProgress.pokedexSeen} Seen</span>
          )}
          <span>{formatPlaytime(currentProgress.totalPlaytime)} Played</span>
        </div>
      </div>

      {/* Timeline */}
      {badgeMilestones.length > 0 ? (
        <div className="timeline">
          {badgeMilestones.map((milestone) => (
            <div
              key={milestone.badgeNumber}
              className="timeline-item"
              style={{ '--badge-color': BADGE_COLORS[milestone.badgeNumber - 1] }}
            >
              <div
                className="timeline-badge"
                style={{ backgroundColor: BADGE_COLORS[milestone.badgeNumber - 1] }}
              >
                <span className="badge-number">{milestone.badgeNumber}</span>
              </div>
              <div className="timeline-content">
                <h4>{milestone.badgeName}</h4>
                <p className="player-name">Earned by: <strong>{milestone.playerName}</strong></p>
                <p className="date">{formatDate(milestone.achievedAt)}</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="no-milestones">
          <p>No badges earned yet. Be the first!</p>
        </div>
      )}
    </div>
  );
};

export default MilestoneTimeline;
