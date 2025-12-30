import React from 'react';

const OverviewPanel = ({ data }) => {
  if (!data) return null;

  const formatPlaytime = (minutes) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  const stats = [
    {
      label: 'Total Turns',
      value: data.totalTurns?.toLocaleString() || '0',
      icon: '🎮'
    },
    {
      label: 'Unique Players',
      value: data.uniquePlayers?.toLocaleString() || '0',
      icon: '👥'
    },
    {
      label: 'Current Badges',
      value: `${data.currentBadgeCount || 0}/8`,
      icon: '🏅'
    },
    {
      label: 'Total Playtime',
      value: formatPlaytime(data.totalPlaytimeMinutes || 0),
      icon: '⏱️'
    },
    {
      label: 'Messages Left',
      value: data.totalMessagesWithContent?.toLocaleString() || '0',
      icon: '💬'
    },
    {
      label: 'Avg Turn',
      value: `${Math.round((data.averageTurnDurationSeconds || 600) / 60)}m`,
      icon: '📊'
    }
  ];

  return (
    <div className="overview-panel">
      {stats.map((stat, index) => (
        <div key={index} className="stat-card">
          <span className="stat-icon">{stat.icon}</span>
          <span className="stat-value">{stat.value}</span>
          <span className="stat-label">{stat.label}</span>
        </div>
      ))}
    </div>
  );
};

export default OverviewPanel;
