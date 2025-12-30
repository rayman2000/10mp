import React, { useState, useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell
} from 'recharts';

const LocationStats = ({ data }) => {
  const [showAll, setShowAll] = useState(false);

  if (!data || !data.locations || data.locations.length === 0) {
    return (
      <div className="location-stats empty">
        <p>No location data available yet.</p>
      </div>
    );
  }

  const { locations, totalVisits, uniqueLocations } = data;

  // Show top 15 by default, or all if toggled
  const displayedLocations = showAll ? locations : locations.slice(0, 15);

  // Color gradient based on visit count
  const maxVisits = locations[0]?.visitCount || 1;
  const getBarColor = (visitCount) => {
    const intensity = Math.pow(visitCount / maxVisits, 0.5);
    // Gradient from light blue to deep purple
    const r = Math.round(99 - intensity * 40);
    const g = Math.round(102 + intensity * 20);
    const b = Math.round(241 + intensity * 15);
    return `rgb(${r}, ${g}, ${Math.min(b, 255)})`;
  };

  // Format location name for display
  const formatLocation = (name) => {
    if (!name) return 'Unknown';
    // Truncate long names
    if (name.length > 25) {
      return name.substring(0, 22) + '...';
    }
    return name;
  };

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const loc = payload[0].payload;
      return (
        <div className="location-tooltip">
          <p className="location-name">{loc.location}</p>
          <p className="visit-count">{loc.visitCount} visits ({loc.percentage}%)</p>
          {loc.firstVisitor && (
            <p className="first-visitor">First visited by: {loc.firstVisitor}</p>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="location-stats">
      {/* Summary stats */}
      <div className="location-summary">
        <div className="summary-stat">
          <span className="stat-value">{uniqueLocations}</span>
          <span className="stat-label">Unique Locations</span>
        </div>
        <div className="summary-stat">
          <span className="stat-value">{totalVisits}</span>
          <span className="stat-label">Total Visits</span>
        </div>
        <div className="summary-stat">
          <span className="stat-value">{locations[0]?.location || 'N/A'}</span>
          <span className="stat-label">Most Visited</span>
        </div>
      </div>

      {/* Horizontal bar chart */}
      <div className="location-chart">
        <ResponsiveContainer width="100%" height={Math.max(400, displayedLocations.length * 28)}>
          <BarChart
            data={displayedLocations}
            layout="vertical"
            margin={{ top: 5, right: 30, left: 120, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
            <XAxis type="number" stroke="#9CA3AF" />
            <YAxis
              type="category"
              dataKey="location"
              stroke="#9CA3AF"
              width={110}
              tickFormatter={formatLocation}
              tick={{ fontSize: 12 }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="visitCount" radius={[0, 4, 4, 0]}>
              {displayedLocations.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={getBarColor(entry.visitCount)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Toggle to show all */}
      {locations.length > 15 && (
        <button
          className="show-all-toggle"
          onClick={() => setShowAll(!showAll)}
        >
          {showAll ? `Show Top 15` : `Show All ${locations.length} Locations`}
        </button>
      )}

      {/* First visitors highlight */}
      <div className="first-visitors">
        <h4>Discovery Leaders</h4>
        <div className="discovery-grid">
          {locations.slice(0, 6).map((loc, index) => (
            <div key={loc.location} className="discovery-card">
              <span className="discovery-location">{formatLocation(loc.location)}</span>
              <span className="discovery-visitor">{loc.firstVisitor || 'Unknown'}</span>
              <span className="discovery-badge">First to visit</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default LocationStats;
