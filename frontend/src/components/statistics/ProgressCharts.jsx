import React, { useState, useMemo } from 'react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine
} from 'recharts';

const CustomTooltip = ({ active, payload, type, isRelative }) => {
  if (!active || !payload || !payload.length) return null;

  const data = payload[0].payload;

  if (type === 'level') {
    if (isRelative) {
      const delta = data.levelDelta;
      const sign = delta >= 0 ? '+' : '';
      return (
        <div className="chart-tooltip">
          <p className="tooltip-label">Turn #{data.turnNumber}</p>
          <p>Player: {data.playerName}</p>
          <p>Level Change: <span className={delta >= 0 ? 'positive' : 'negative'}>{sign}{delta}</span></p>
          <p>Total Levels: {data.totalLevels}</p>
        </div>
      );
    }
    return (
      <div className="chart-tooltip">
        <p className="tooltip-label">Turn #{data.turnNumber}</p>
        <p>Player: {data.playerName}</p>
        <p>Total Levels: {data.totalLevels}</p>
        <p>Party Size: {data.partySize}</p>
      </div>
    );
  }

  if (type === 'money') {
    if (isRelative) {
      const delta = data.moneyDelta;
      const sign = delta >= 0 ? '+' : '';
      return (
        <div className="chart-tooltip">
          <p className="tooltip-label">Turn #{data.turnNumber}</p>
          <p>Player: {data.playerName}</p>
          <p>Money Change: <span className={delta >= 0 ? 'positive' : 'negative'}>{sign}${delta?.toLocaleString()}</span></p>
          <p>Total Money: ${data.money?.toLocaleString()}</p>
        </div>
      );
    }
    return (
      <div className="chart-tooltip">
        <p className="tooltip-label">Turn #{data.turnNumber}</p>
        <p>Player: {data.playerName}</p>
        <p>Money: ${data.money?.toLocaleString()}</p>
      </div>
    );
  }

  return null;
};

const ViewToggle = ({ isRelative, onChange }) => (
  <div className="view-toggle">
    <button
      className={`toggle-btn ${!isRelative ? 'active' : ''}`}
      onClick={() => onChange(false)}
    >
      Absolute
    </button>
    <button
      className={`toggle-btn ${isRelative ? 'active' : ''}`}
      onClick={() => onChange(true)}
    >
      Per Turn
    </button>
  </div>
);

const ProgressCharts = ({ data }) => {
  const [levelViewRelative, setLevelViewRelative] = useState(false);
  const [moneyViewRelative, setMoneyViewRelative] = useState(false);

  // Compute relative/delta data
  const levelDataWithDelta = useMemo(() => {
    if (!data?.levelProgression) return [];
    return data.levelProgression.map((item, index) => {
      const prevLevels = index > 0 ? data.levelProgression[index - 1].totalLevels : item.totalLevels;
      return {
        ...item,
        levelDelta: item.totalLevels - prevLevels
      };
    });
  }, [data?.levelProgression]);

  const moneyDataWithDelta = useMemo(() => {
    if (!data?.moneyProgression?.moneyOverTime) return [];
    return data.moneyProgression.moneyOverTime.map((item, index) => {
      const prevMoney = index > 0 ? data.moneyProgression.moneyOverTime[index - 1].money : item.money;
      return {
        ...item,
        moneyDelta: item.money - prevMoney
      };
    });
  }, [data?.moneyProgression?.moneyOverTime]);

  if (!data) return null;

  const { levelProgression, moneyProgression, partyAnalysis } = data;

  // Capitalize first letter of species name
  const formatSpecies = (species) => {
    if (!species) return 'Unknown';
    return species.charAt(0).toUpperCase() + species.slice(1);
  };

  return (
    <div className="progress-charts">
      {/* Party Level Progression */}
      <div className="chart-container">
        <div className="chart-header">
          <h3>Party Level Progress</h3>
          {levelProgression.length > 0 && (
            <ViewToggle isRelative={levelViewRelative} onChange={setLevelViewRelative} />
          )}
        </div>
        {levelProgression.length > 0 ? (
          levelViewRelative ? (
            // Relative view - Bar chart showing delta per turn
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={levelDataWithDelta}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis
                  dataKey="turnNumber"
                  stroke="#9CA3AF"
                  tick={{ fill: '#9CA3AF' }}
                  label={{ value: 'Turn #', position: 'bottom', fill: '#9CA3AF', offset: -5 }}
                />
                <YAxis
                  stroke="#9CA3AF"
                  tick={{ fill: '#9CA3AF' }}
                  label={{ value: 'Level Change', angle: -90, position: 'insideLeft', fill: '#9CA3AF' }}
                />
                <ReferenceLine y={0} stroke="#6B7280" />
                <Tooltip content={<CustomTooltip type="level" isRelative={true} />} />
                <Bar
                  dataKey="levelDelta"
                  fill="#8B5CF6"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            // Absolute view - Area chart showing cumulative levels
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={levelProgression}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis
                  dataKey="turnNumber"
                  stroke="#9CA3AF"
                  tick={{ fill: '#9CA3AF' }}
                  label={{ value: 'Turn #', position: 'bottom', fill: '#9CA3AF', offset: -5 }}
                />
                <YAxis
                  stroke="#9CA3AF"
                  tick={{ fill: '#9CA3AF' }}
                  label={{ value: 'Total Levels', angle: -90, position: 'insideLeft', fill: '#9CA3AF' }}
                />
                <Tooltip content={<CustomTooltip type="level" isRelative={false} />} />
                <Area
                  type="monotone"
                  dataKey="totalLevels"
                  stroke="#8B5CF6"
                  fill="#8B5CF6"
                  fillOpacity={0.3}
                />
              </AreaChart>
            </ResponsiveContainer>
          )
        ) : (
          <div className="no-data">No level data available yet</div>
        )}
      </div>

      {/* Money Progression */}
      <div className="chart-container">
        <div className="chart-header">
          <h3>Money Over Time</h3>
          {moneyProgression.moneyOverTime?.length > 0 && (
            <ViewToggle isRelative={moneyViewRelative} onChange={setMoneyViewRelative} />
          )}
        </div>
        {moneyProgression.moneyOverTime?.length > 0 ? (
          moneyViewRelative ? (
            // Relative view - Bar chart showing delta per turn
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={moneyDataWithDelta}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis
                  dataKey="turnNumber"
                  stroke="#9CA3AF"
                  tick={{ fill: '#9CA3AF' }}
                  label={{ value: 'Turn #', position: 'bottom', fill: '#9CA3AF', offset: -5 }}
                />
                <YAxis
                  stroke="#9CA3AF"
                  tick={{ fill: '#9CA3AF' }}
                  tickFormatter={(value) => {
                    if (Math.abs(value) >= 1000) {
                      return `${value >= 0 ? '+' : ''}$${(value / 1000).toFixed(0)}k`;
                    }
                    return `${value >= 0 ? '+' : ''}$${value}`;
                  }}
                />
                <ReferenceLine y={0} stroke="#6B7280" />
                <Tooltip content={<CustomTooltip type="money" isRelative={true} />} />
                <Bar
                  dataKey="moneyDelta"
                  fill="#10B981"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            // Absolute view - Line chart showing cumulative money
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={moneyProgression.moneyOverTime}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis
                  dataKey="turnNumber"
                  stroke="#9CA3AF"
                  tick={{ fill: '#9CA3AF' }}
                  label={{ value: 'Turn #', position: 'bottom', fill: '#9CA3AF', offset: -5 }}
                />
                <YAxis
                  stroke="#9CA3AF"
                  tick={{ fill: '#9CA3AF' }}
                  tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                />
                <Tooltip content={<CustomTooltip type="money" isRelative={false} />} />
                <Line
                  type="monotone"
                  dataKey="money"
                  stroke="#10B981"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )
        ) : (
          <div className="no-data">No money data available yet</div>
        )}
      </div>

      {/* Party Stats Summary */}
      <div className="party-summary">
        <h3>Party Analysis</h3>
        <div className="summary-grid">
          <div className="summary-item">
            <span className="summary-value">{partyAnalysis.averagePartySize}</span>
            <span className="summary-label">Avg Party Size</span>
          </div>
          <div className="summary-item">
            <span className="summary-value">{partyAnalysis.averageTotalLevels}</span>
            <span className="summary-label">Avg Total Levels</span>
          </div>
          <div className="summary-item">
            <span className="summary-value">{partyAnalysis.averagePartyHP}%</span>
            <span className="summary-label">Avg Party HP</span>
          </div>
          <div className="summary-item highlight">
            <span className="summary-value">
              Lv.{partyAnalysis.highestLevelPokemon?.level || 0}
            </span>
            <span className="summary-label">
              {formatSpecies(partyAnalysis.highestLevelPokemon?.species)}
              {partyAnalysis.highestLevelPokemon?.playerName &&
                ` (${partyAnalysis.highestLevelPokemon.playerName})`}
            </span>
          </div>
        </div>

        {/* Most Common Species */}
        {partyAnalysis.mostCommonSpecies?.length > 0 && (
          <div className="species-list">
            <h4>Most Used Pokemon</h4>
            <div className="species-grid">
              {partyAnalysis.mostCommonSpecies.slice(0, 6).map((item, index) => (
                <div key={item.species} className="species-item">
                  <span className="species-rank">#{index + 1}</span>
                  <span className="species-name">{formatSpecies(item.species)}</span>
                  <span className="species-count">{item.count}x</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Money Summary */}
        <div className="money-summary">
          <h4>Money Stats</h4>
          <div className="money-grid">
            <div className="money-item">
              <span className="money-label">Current</span>
              <span className="money-value">${moneyProgression.currentMoney?.toLocaleString() || 0}</span>
            </div>
            <div className="money-item">
              <span className="money-label">Peak</span>
              <span className="money-value">${moneyProgression.peakMoney?.toLocaleString() || 0}</span>
            </div>
            <div className="money-item">
              <span className="money-label">Average</span>
              <span className="money-value">${moneyProgression.averageMoney?.toLocaleString() || 0}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProgressCharts;
