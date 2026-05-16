import React, { useState, useEffect } from 'react';
import api from '../../utils/api';

export default function Leaderboard({ testId, resultHidden }) {
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAttempts();
  }, [testId]);

  const fetchAttempts = () => {
    api.get(`/attempts/test/${testId}`)
      .then(res => setAttempts(res.data.filter(a => a.status !== 'in_progress').slice(0, 10)))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  const resumeAttempt = async (attemptId) => {
    try {
      await api.put(`/attempts/${attemptId}/resume`);
      fetchAttempts();
    } catch {}
  };

  if (loading) return <div className="empty-state"><div className="spinner" /></div>;

  if (attempts.length === 0) return (
    <div className="empty-state">
      <div className="empty-state-icon">🏆</div>
      <h3>No submissions yet</h3>
      <p>Leaderboard will appear once students submit the exam</p>
    </div>
  );

  const rankColors = ['#f59e0b', '#9ca3af', '#cd7c2f'];
  const rankEmojis = ['🥇', '🥈', '🥉'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ fontSize: 18, fontFamily: 'Syne, sans-serif' }}>🏆 Leaderboard</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          {resultHidden && <span className="badge badge-yellow">⚠️ Results Hidden from Students</span>}
          <span className="badge badge-accent">Top {attempts.length} students</span>
        </div>
      </div>

      {/* Top 3 podium */}
      {attempts.length >= 3 && (
        <div style={styles.podium}>
          {[attempts[1], attempts[0], attempts[2]].map((a, i) => {
            const actualRank = i === 0 ? 2 : i === 1 ? 1 : 3;
            if (!a) return <div key={i} />;
            return (
              <div key={a._id} style={{ ...styles.podiumItem, order: i === 1 ? -1 : undefined }}>
                <div style={styles.podiumAvatar}>
                  {a.student?.name?.[0]?.toUpperCase()}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginTop: 8 }}>
                  {a.student?.name}
                </div>
                <div style={{ fontSize: 20, fontFamily: 'Syne, sans-serif', fontWeight: 800, color: rankColors[actualRank - 1] }}>
                  {a.percentage}%
                </div>
                <div style={{ ...styles.podiumBlock, height: [100, 140, 80][actualRank - 1], background: rankColors[actualRank - 1] }}>
                  <span style={{ fontSize: 24 }}>{rankEmojis[actualRank - 1]}</span>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>#{actualRank}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Full table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="table">
          <thead>
            <tr>
              <th style={{ paddingLeft: 20 }}>Rank</th>
              <th>Student</th>
              <th>Score</th>
              <th>Percentage</th>
              <th>Time</th>
              <th>Violations</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {attempts.map((a, i) => (
              <tr key={a._id}>
                <td style={{ paddingLeft: 20 }}>
                  <span style={{ fontWeight: 700, color: rankColors[i] || 'var(--text3)', fontSize: 16 }}>
                    {rankEmojis[i] || `#${i + 1}`}
                  </span>
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={styles.tableAvatar}>{a.student?.name?.[0]?.toUpperCase()}</div>
                    <div>
                      <div style={{ color: 'var(--text)', fontWeight: 500, fontSize: 14 }}>{a.student?.name}</div>
                      <div style={{ color: 'var(--text3)', fontSize: 11 }}>{a.student?.email}</div>
                    </div>
                  </div>
                </td>
                <td>
                  <span style={{ color: 'var(--accent2)', fontWeight: 700, fontSize: 15 }}>{a.totalScore}</span>
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div className="progress-bar" style={{ width: 70 }}>
                      <div className="progress-fill" style={{
                        width: `${a.percentage}%`,
                        background: a.percentage >= 70 ? 'var(--green)' : a.percentage >= 40 ? 'var(--yellow)' : 'var(--red)'
                      }} />
                    </div>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{a.percentage}%</span>
                  </div>
                </td>
                <td style={{ color: 'var(--text2)', fontSize: 13 }}>
                  {a.submittedAt
                    ? `${Math.round((new Date(a.submittedAt) - new Date(a.startTime)) / 60000)} min`
                    : '--'}
                </td>
                <td>
                  {a.violationCount > 0
                    ? <span style={{ color: 'var(--red)', fontSize: 13 }}>⚠️ {a.violationCount}</span>
                    : <span style={{ color: 'var(--green)', fontSize: 13 }}>✓</span>}
                </td>
                <td>
                  {a.status === 'paused' ? (
                    <button className="btn btn-sm" style={{ background: 'var(--red)', color: 'white', border: 'none' }} onClick={() => resumeAttempt(a._id)}>
                      ▶ Resume
                    </button>
                  ) : (
                    <span className={`badge ${a.autoSubmitted ? 'badge-red' : a.status === 'evaluated' ? 'badge-blue' : 'badge-green'}`}>
                      {a.autoSubmitted ? 'Auto' : a.status}
                    </span>
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
  podium: { display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 20, padding: '20px 0' },
  podiumItem: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 },
  podiumAvatar: { width: 52, height: 52, borderRadius: '50%', background: 'var(--accent-dim)', color: 'var(--accent2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 22 },
  podiumBlock: { width: 80, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderRadius: '8px 8px 0 0', marginTop: 8, gap: 4 },
  tableAvatar: { width: 32, height: 32, borderRadius: '50%', background: 'var(--bg4)', color: 'var(--text2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, flexShrink: 0 }
};