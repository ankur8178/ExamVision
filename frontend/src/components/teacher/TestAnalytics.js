import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import api from '../../utils/api';

const COLORS = ['#6c63ff', '#22c55e', '#f59e0b', '#ef4444', '#3b82f6', '#ec4899'];

export default function TestAnalytics({ testId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/analytics/test/${testId}`)
      .then(res => setData(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [testId]);

  if (loading) return <div className="empty-state"><div className="spinner" /></div>;
  if (!data || data.message) return (
    <div className="empty-state">
      <div className="empty-state-icon">📊</div>
      <h3>No Data Yet</h3>
      <p>Analytics will appear once students submit the exam</p>
    </div>
  );

  const distData = Object.entries(data.scoreDistribution).map(([range, count]) => ({ range, count }));
  const violData = Object.entries(data.violationStats || {}).map(([type, count]) => ({ type: type.replace(/_/g, ' '), count }));

  const statCards = [
    { label: 'Total Attempts', value: data.totalAttempts, color: 'var(--accent2)', icon: '👥' },
    { label: 'Average Score', value: `${data.averagePercentage?.toFixed(1)}%`, color: 'var(--green)', icon: '📊' },
    { label: 'Highest Score', value: `${data.highestScore}`, color: 'var(--blue)', icon: '🏆' },
    { label: 'Pass Count', value: `${data.passCount}/${data.totalAttempts}`, color: 'var(--yellow)', icon: '✅' },
    { label: 'Auto Submitted', value: data.autoSubmitted, color: 'var(--red)', icon: '⚡' },
    { label: 'Total Violations', value: data.totalViolations, color: 'var(--pink)', icon: '⚠️' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={styles.statsGrid}>
        {statCards.map((s, i) => (
          <div key={i} className="card" style={{ textAlign: 'center', borderTop: `3px solid ${s.color}` }}>
            <div style={{ fontSize: 24, marginBottom: 6 }}>{s.icon}</div>
            <div style={{ fontSize: 28, fontFamily: 'Syne, sans-serif', fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ color: 'var(--text3)', fontSize: 12, marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={styles.chartsGrid}>
        <div className="card">
          <h4 style={styles.chartTitle}>Score Distribution</h4>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={distData}>
              <XAxis dataKey="range" tick={{ fill: '#5a5a78', fontSize: 11 }} />
              <YAxis tick={{ fill: '#5a5a78', fontSize: 11 }} />
              <Tooltip contentStyle={{ background: '#1a1a24', border: '1px solid #2a2a38', borderRadius: 8 }} />
              <Bar dataKey="count" fill="var(--accent)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {violData.length > 0 && (
          <div className="card">
            <h4 style={styles.chartTitle}>Violations by Type</h4>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={violData} layout="vertical">
                <XAxis type="number" tick={{ fill: '#5a5a78', fontSize: 11 }} />
                <YAxis dataKey="type" type="category" tick={{ fill: '#9898b8', fontSize: 11 }} width={110} />
                <Tooltip contentStyle={{ background: '#1a1a24', border: '1px solid #2a2a38', borderRadius: 8 }} />
                <Bar dataKey="count" fill="var(--red)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Top Performers */}
      <div className="card">
        <h4 style={styles.chartTitle}>Top Performers</h4>
        <table className="table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Student</th>
              <th>Score</th>
              <th>Percentage</th>
              <th>Time Taken</th>
              <th>Violations</th>
            </tr>
          </thead>
          <tbody>
            {data.leaderboard?.map((entry, i) => (
              <tr key={i}>
                <td>
                  <span style={{ fontWeight: 700, color: i === 0 ? '#f59e0b' : i === 1 ? '#9ca3af' : i === 2 ? '#cd7c2f' : 'var(--text2)' }}>
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${entry.rank}`}
                  </span>
                </td>
                <td style={{ color: 'var(--text)' }}>{entry.student?.name}</td>
                <td style={{ color: 'var(--accent2)', fontWeight: 600 }}>{entry.score}</td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div className="progress-bar" style={{ width: 80 }}>
                      <div className="progress-fill" style={{ width: `${entry.percentage}%`, background: entry.percentage >= 70 ? 'var(--green)' : entry.percentage >= 40 ? 'var(--yellow)' : 'var(--red)' }} />
                    </div>
                    <span>{entry.percentage}%</span>
                  </div>
                </td>
                <td>{entry.timeTaken ? `${entry.timeTaken} min` : '--'}</td>
                <td>
                  {entry.violations > 0 ? (
                    <span style={{ color: 'var(--red)', fontSize: 13 }}>⚠️ {entry.violations}</span>
                  ) : (
                    <span style={{ color: 'var(--green)', fontSize: 13 }}>✓ Clean</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const styles = {
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14 },
  chartsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 },
  chartTitle: { fontSize: 14, marginBottom: 16, color: 'var(--text2)', fontFamily: 'Syne, sans-serif' }
};
