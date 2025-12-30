import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import OverviewPanel from '../components/statistics/OverviewPanel';
import MessageAnalysis from '../components/statistics/MessageAnalysis';
import ProgressCharts from '../components/statistics/ProgressCharts';
import MilestoneTimeline from '../components/statistics/MilestoneTimeline';
import PlayerLeaderboard from '../components/statistics/PlayerLeaderboard';
import ActivityHeatmap from '../components/statistics/ActivityHeatmap';
import LocationStats from '../components/statistics/LocationStats';
import { statisticsApi } from '../services/api';
import './StatisticsPage.css';

const StatisticsPage = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [overview, setOverview] = useState(null);
  const [messages, setMessages] = useState(null);
  const [progress, setProgress] = useState(null);
  const [milestones, setMilestones] = useState(null);
  const [players, setPlayers] = useState(null);
  const [activity, setActivity] = useState(null);
  const [locations, setLocations] = useState(null);

  useEffect(() => {
    const fetchAllStatistics = async () => {
      try {
        setLoading(true);
        setError(null);

        const [overviewData, messagesData, progressData, milestonesData, playersData, activityData, locationsData] =
          await Promise.all([
            statisticsApi.getOverview(),
            statisticsApi.getMessages(),
            statisticsApi.getProgress(),
            statisticsApi.getMilestones(),
            statisticsApi.getPlayers(),
            statisticsApi.getActivity(),
            statisticsApi.getLocations()
          ]);

        setOverview(overviewData);
        setMessages(messagesData);
        setProgress(progressData);
        setMilestones(milestonesData);
        setPlayers(playersData);
        setActivity(activityData);
        setLocations(locationsData);
      } catch (err) {
        console.error('Failed to fetch statistics:', err);
        setError('Failed to load statistics. Please try again later.');
      } finally {
        setLoading(false);
      }
    };

    fetchAllStatistics();
  }, []);

  if (loading) {
    return (
      <div className="statistics-page loading">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading statistics...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="statistics-page error">
        <div className="error-container">
          <h2>Error</h2>
          <p className="error-message">{error}</p>
          <Link to="/" className="back-link">Back to Game</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="statistics-page">
      <header className="stats-header">
        <h1>10 Minute Pokemon Statistics</h1>
        <Link to="/" className="play-link">Play Now</Link>
      </header>

      <div className="stats-content">
        <OverviewPanel data={overview} />

        <section className="stats-section">
          <h2>Badge Milestones</h2>
          <MilestoneTimeline data={milestones} />
        </section>

        <section className="stats-section">
          <h2>Progress Over Time</h2>
          <ProgressCharts data={progress} />
        </section>

        <section className="stats-section">
          <h2>Message Analysis</h2>
          <MessageAnalysis data={messages} />
        </section>

        <section className="stats-section">
          <h2>Top Players</h2>
          <PlayerLeaderboard data={players} />
        </section>

        <section className="stats-section">
          <h2>When Do People Play?</h2>
          <ActivityHeatmap data={activity} />
        </section>

        <section className="stats-section">
          <h2>Locations Visited</h2>
          <LocationStats data={locations} />
        </section>
      </div>

      <footer className="stats-footer">
        <p>Data updates in real-time as players complete turns.</p>
      </footer>
    </div>
  );
};

export default StatisticsPage;
