import React from 'react';

const HOURS = Array.from({ length: 24 }, (_, i) => i);

const ActivityHeatmap = ({ data }) => {
  if (!data) return null;

  const { heatmap, peakTime } = data;

  // Aggregate by hour only (ignore day of week)
  const hourlyTotals = HOURS.map(hour => {
    let total = 0;
    heatmap.forEach(cell => {
      if (cell.hour === hour) {
        total += cell.count;
      }
    });
    return total;
  });

  const maxHourTotal = Math.max(...hourlyTotals, 1);
  const totalTurns = hourlyTotals.reduce((sum, count) => sum + count, 0);

  // Find peak hour
  let peakHour = 0;
  let peakCount = 0;
  hourlyTotals.forEach((count, hour) => {
    if (count > peakCount) {
      peakCount = count;
      peakHour = hour;
    }
  });

  const formatHour = (hour) => {
    if (hour === 0) return '12am';
    if (hour === 12) return '12pm';
    if (hour < 12) return `${hour}am`;
    return `${hour - 12}pm`;
  };

  const formatHourShort = (hour) => {
    if (hour === 0) return '12a';
    if (hour === 12) return '12p';
    if (hour < 12) return `${hour}a`;
    return `${hour - 12}p`;
  };

  // Get color based on intensity
  const getBarColor = (count) => {
    if (count === 0) return 'rgba(59, 130, 246, 0.2)';
    const intensity = Math.pow(count / maxHourTotal, 0.6);
    return `rgba(59, 130, 246, ${0.3 + intensity * 0.7})`;
  };

  return (
    <div className="activity-heatmap">
      {/* Peak time highlight */}
      <div className="peak-time-banner">
        <span className="peak-label">Peak Hour:</span>
        <span className="peak-value">{formatHour(peakHour)}</span>
        <span className="peak-count">({peakCount} turns)</span>
      </div>

      {/* Hourly bar chart */}
      <div className="hourly-chart">
        <div className="hourly-bars">
          {HOURS.map(hour => {
            const count = hourlyTotals[hour];
            const height = maxHourTotal > 0 ? (count / maxHourTotal) * 100 : 0;
            const isPeak = hour === peakHour && count > 0;

            return (
              <div
                key={hour}
                className={`hourly-bar-container ${isPeak ? 'peak' : ''}`}
                title={`${formatHour(hour)}: ${count} turns`}
              >
                <div className="hourly-bar-wrapper">
                  <div
                    className="hourly-bar"
                    style={{
                      height: `${height}%`,
                      backgroundColor: isPeak ? '#8B5CF6' : getBarColor(count)
                    }}
                  />
                  {count > 0 && height > 20 && (
                    <span className="hourly-count">{count}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Hour labels */}
        <div className="hourly-labels">
          {HOURS.filter(h => h % 3 === 0).map(hour => (
            <span key={hour} className="hourly-label">
              {formatHourShort(hour)}
            </span>
          ))}
        </div>
      </div>

      {/* Time period summary */}
      <div className="time-periods">
        <div className="time-period">
          <span className="period-label">Morning</span>
          <span className="period-sublabel">6am - 12pm</span>
          <span className="period-count">
            {hourlyTotals.slice(6, 12).reduce((a, b) => a + b, 0)} turns
          </span>
        </div>
        <div className="time-period">
          <span className="period-label">Afternoon</span>
          <span className="period-sublabel">12pm - 6pm</span>
          <span className="period-count">
            {hourlyTotals.slice(12, 18).reduce((a, b) => a + b, 0)} turns
          </span>
        </div>
        <div className="time-period">
          <span className="period-label">Evening</span>
          <span className="period-sublabel">6pm - 12am</span>
          <span className="period-count">
            {hourlyTotals.slice(18, 24).reduce((a, b) => a + b, 0)} turns
          </span>
        </div>
        <div className="time-period">
          <span className="period-label">Night</span>
          <span className="period-sublabel">12am - 6am</span>
          <span className="period-count">
            {hourlyTotals.slice(0, 6).reduce((a, b) => a + b, 0)} turns
          </span>
        </div>
      </div>
    </div>
  );
};

export default ActivityHeatmap;
