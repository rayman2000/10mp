import React, { useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import WordCloud from './WordCloud';

const ViewToggle = ({ view, onChange }) => (
  <div className="view-toggle">
    <button
      className={`toggle-btn ${view === 'cloud' ? 'active' : ''}`}
      onClick={() => onChange('cloud')}
    >
      Word Cloud
    </button>
    <button
      className={`toggle-btn ${view === 'chart' ? 'active' : ''}`}
      onClick={() => onChange('chart')}
    >
      Bar Chart
    </button>
  </div>
);

const MessageAnalysis = ({ data }) => {
  const [wordView, setWordView] = useState('cloud');

  if (!data) return null;

  const {
    wordFrequency,
    longestMessage,
    shortestMessage,
    averageLength,
    messagesWithContent,
    emptyOrDefaultCount
  } = data;

  // Take top 15 words for the chart
  const topWords = wordFrequency?.slice(0, 15) || [];

  return (
    <div className="message-analysis">
      {/* Message Stats */}
      <div className="message-stats-grid">
        <div className="stat-box">
          <span className="stat-number">{messagesWithContent || 0}</span>
          <span className="stat-desc">Custom Messages</span>
        </div>
        <div className="stat-box">
          <span className="stat-number">{emptyOrDefaultCount || 0}</span>
          <span className="stat-desc">Default/Empty</span>
        </div>
        <div className="stat-box">
          <span className="stat-number">{Math.round(averageLength || 0)}</span>
          <span className="stat-desc">Avg Length (chars)</span>
        </div>
      </div>

      {/* Word Frequency Visualization */}
      {wordFrequency?.length > 0 && (
        <div className="chart-container word-chart">
          <div className="chart-header">
            <h3>Most Common Words</h3>
            <ViewToggle view={wordView} onChange={setWordView} />
          </div>

          {wordView === 'cloud' ? (
            <WordCloud words={wordFrequency} maxWords={40} />
          ) : (
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={topWords} layout="vertical" margin={{ left: 60 }}>
                <XAxis type="number" stroke="#9CA3AF" tick={{ fill: '#9CA3AF' }} />
                <YAxis
                  type="category"
                  dataKey="word"
                  stroke="#9CA3AF"
                  tick={{ fill: '#9CA3AF' }}
                  width={80}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1F2937',
                    border: '1px solid #374151',
                    borderRadius: '8px'
                  }}
                  labelStyle={{ color: '#F3F4F6' }}
                  itemStyle={{ color: '#3B82F6' }}
                />
                <Bar dataKey="count" fill="#3B82F6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      )}

      {/* Extreme Messages */}
      <div className="extreme-messages">
        {longestMessage?.message && (
          <div className="message-highlight longest">
            <h4>Longest Message ({longestMessage.message.length} chars)</h4>
            <blockquote>"{longestMessage.message}"</blockquote>
            <cite>- {longestMessage.playerName}</cite>
          </div>
        )}

        {shortestMessage?.message && shortestMessage.message !== longestMessage?.message && (
          <div className="message-highlight shortest">
            <h4>Shortest Message ({shortestMessage.message.length} chars)</h4>
            <blockquote>"{shortestMessage.message}"</blockquote>
            <cite>- {shortestMessage.playerName}</cite>
          </div>
        )}
      </div>

      {/* No messages state */}
      {messagesWithContent === 0 && (
        <div className="no-messages">
          <p>No custom messages yet. Players can leave messages for the next trainer!</p>
        </div>
      )}
    </div>
  );
};

export default MessageAnalysis;
