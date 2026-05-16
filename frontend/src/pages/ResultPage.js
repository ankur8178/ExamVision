import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import Layout from '../components/shared/Layout';

export default function ResultPage() {
  const { testId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [allAttempts, setAllAttempts] = useState([]);  // all submitted attempts
  const [selectedIdx, setSelectedIdx] = useState(0);   // which attempt is shown
  const [test, setTest] = useState(null);
  const [analyticsData, setAnalyticsData] = useState(null); // rank/totalStudents from latest
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    const load = async () => {
      try {
        const [testRes, allAttemptsRes, analyticsRes] = await Promise.all([
          api.get(`/tests/${testId}`),
          api.get(`/attempts/my/${testId}/all`),   // NEW endpoint — all submitted attempts
          api.get(`/analytics/student/test/${testId}`)
        ]);
        setTest(testRes.data);
        setAnalyticsData(analyticsRes.data);

        const attempts = allAttemptsRes.data || [];
        setAllAttempts(attempts);
        // Default to the latest attempt (last in array since sorted oldest-first)
        setSelectedIdx(attempts.length > 0 ? attempts.length - 1 : 0);
      } catch { }
      finally { setLoading(false); }
    };
    load();
  }, [testId]);

  // Reset inner tab when switching attempts
  const handleSelectAttempt = (idx) => {
    setSelectedIdx(idx);
    setActiveTab('overview');
  };

  if (loading) return <Layout title="Result"><div className="empty-state"><div className="spinner" /></div></Layout>;

  // If results are hidden (check via analyticsData)
  if (analyticsData?.hidden) return (
    <Layout title="Result">
      <div className="empty-state">
        <div className="empty-state-icon">🔒</div>
        <h3>Results Hidden</h3>
        <p>Your teacher hasn't released the results yet</p>
        <button className="btn btn-secondary" onClick={() => navigate(-1)}>← Go Back</button>
      </div>
    </Layout>
  );

  if (!allAttempts.length) return (
    <Layout title="Result">
      <div className="empty-state">
        <div className="empty-state-icon">📝</div>
        <h3>No submission found</h3>
        <button className="btn btn-secondary" onClick={() => navigate('/student')}>← Dashboard</button>
      </div>
    </Layout>
  );

  // The attempt currently being viewed
  const attempt = allAttempts[selectedIdx];
  const isLatest = selectedIdx === allAttempts.length - 1;

  // Rank/totalStudents only meaningful for latest attempt
  const rank = isLatest ? analyticsData?.rank : null;
  const totalStudents = isLatest ? analyticsData?.totalStudents : null;

  const pct = attempt.percentage || 0;
  const passed = pct >= 50;
  const isEvaluated = attempt.status === 'evaluated';

  // Deduplicate answers — keep last entry per question
  const seen = new Set();
  const dedupedAnswers = [];
  for (let i = (attempt.answers?.length || 0) - 1; i >= 0; i--) {
    const ans = attempt.answers[i];
    const qId = typeof ans.question === 'object' ? ans.question?._id?.toString() : ans.question?.toString();
    if (!qId || seen.has(qId)) continue;
    seen.add(qId);
    dedupedAnswers.unshift(ans);
  }

  const theoryPendingCount = dedupedAnswers.filter(ans => {
    const q = ans.question;
    if (!q || typeof q !== 'object' || q.type !== 'theory') return false;
    return ans.marksAwarded === null || ans.marksAwarded === undefined;
  }).length;

  return (
    <Layout>
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24, flexWrap: 'wrap' }}>
        <button className="btn btn-secondary btn-sm" onClick={() => navigate(-1)}>← Back</button>
        <div>
          <h1 style={{ fontSize: 22, fontFamily: 'Syne,sans-serif' }}>Exam Result</h1>
          <p style={{ color: 'var(--text3)', fontSize: 13 }}>{test?.title}</p>
        </div>
        {theoryPendingCount > 0 && !isEvaluated && (
          <span className="badge badge-yellow" style={{ marginLeft: 'auto' }}>
            ⏳ {theoryPendingCount} theory question{theoryPendingCount > 1 ? 's' : ''} pending grading
          </span>
        )}
        {isEvaluated && (
          <span className="badge badge-green" style={{ marginLeft: 'auto' }}>✅ Fully evaluated</span>
        )}
      </div>

      {/* ── Attempt Selector (only shown when student has more than 1 attempt) ── */}
      {allAttempts.length > 1 && (
        <div style={S.attemptSelectorWrap}>
          <span style={S.attemptSelectorLabel}>
            🔄 {allAttempts.length} Attempts
          </span>
          <div style={S.attemptTabsRow}>
            {allAttempts.map((a, i) => {
              const apct = a.percentage || 0;
              const isActive = i === selectedIdx;
              return (
                <button
                  key={a._id}
                  onClick={() => handleSelectAttempt(i)}
                  style={{
                    ...S.attemptTab,
                    background: isActive ? 'var(--accent)' : 'var(--bg3)',
                    color: isActive ? '#fff' : 'var(--text)',
                    border: isActive ? '1.5px solid var(--accent)' : '1.5px solid var(--border)',
                  }}
                >
                  <span style={{ fontWeight: 700, fontSize: 13 }}>Attempt {i + 1}</span>
                  {i === allAttempts.length - 1 && (
                    <span style={{
                      fontSize: 10,
                      padding: '1px 6px',
                      background: isActive ? 'rgba(255,255,255,0.2)' : 'var(--bg4)',
                      borderRadius: 20,
                      color: isActive ? '#fff' : 'var(--text3)',
                    }}>Latest</span>
                  )}
                  <span style={{
                    fontSize: 15,
                    fontWeight: 800,
                    fontFamily: 'Syne,sans-serif',
                    color: isActive ? '#fff' : (apct >= 70 ? 'var(--green)' : apct >= 40 ? 'var(--yellow)' : 'var(--red)')
                  }}>
                    {apct}%
                  </span>
                  <span style={{ fontSize: 11, color: isActive ? 'rgba(255,255,255,0.7)' : 'var(--text3)' }}>
                    {new Date(a.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Score Hero ── */}
      <div style={S.hero}>
        <div style={S.circleWrap}>
          <svg width="130" height="130" viewBox="0 0 130 130" style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }}>
            <circle cx="65" cy="65" r="56" fill="none" stroke="var(--bg4)" strokeWidth="10" />
            <circle cx="65" cy="65" r="56" fill="none"
              stroke={pct >= 70 ? 'var(--green)' : pct >= 40 ? 'var(--yellow)' : 'var(--red)'}
              strokeWidth="10"
              strokeDasharray={`${2 * Math.PI * 56}`}
              strokeDashoffset={`${2 * Math.PI * 56 * (1 - pct / 100)}`}
              strokeLinecap="round" />
          </svg>
          <div style={{ position: 'relative', textAlign: 'center' }}>
            <div style={{ fontSize: 30, fontFamily: 'Syne,sans-serif', fontWeight: 800, color: pct >= 70 ? 'var(--green)' : pct >= 40 ? 'var(--yellow)' : 'var(--red)' }}>
              {pct}%
            </div>
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>{passed ? 'PASSED' : 'FAILED'}</div>
          </div>
        </div>

        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: 20, marginBottom: 4 }}>
            {allAttempts.length > 1 ? `Attempt ${selectedIdx + 1} — ` : ''}
            {passed ? '🎉 Congratulations!' : '📚 Keep Studying!'}
          </h2>
          <p style={{ color: 'var(--text3)', fontSize: 13, marginBottom: 16 }}>
            {passed ? 'You have passed this exam.' : 'You did not meet the passing criteria.'}
            {allAttempts.length > 1 && !isLatest && (
              <span style={{ color: 'var(--yellow)', marginLeft: 8 }}>
                · Viewing a previous attempt
              </span>
            )}
          </p>
          <div style={S.statRow}>
            {[
              ['Score', attempt.totalScore],
              ['Total', test?.totalMarks],
              ...(rank ? [['Rank', `#${rank}`]] : []),
              ...(totalStudents ? [['Students', totalStudents]] : []),
              ['Violations', attempt.violationCount],
            ].map(([lbl, val]) => (
              <div key={lbl} style={S.statBox}>
                <div style={{ fontSize: 22, fontFamily: 'Syne,sans-serif', fontWeight: 800, color: 'var(--accent2)' }}>{val}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{lbl}</div>
              </div>
            ))}
          </div>
          {attempt.autoSubmitted && (
            <div style={{ marginTop: 10, padding: '8px 14px', background: 'var(--red-dim)', borderRadius: 8, color: 'var(--red)', fontSize: 13 }}>
              ⚡ Auto-submitted due to max violations
            </div>
          )}
        </div>
      </div>

      {/* ── Inner Tabs ── */}
      <div className="tabs">
        <button className={`tab${activeTab === 'overview' ? ' active' : ''}`} onClick={() => setActiveTab('overview')}>Answer Review</button>
        <button className={`tab${activeTab === 'violations' ? ' active' : ''}`} onClick={() => setActiveTab('violations')}>
          Violations {attempt.violations?.length > 0 && `(${attempt.violations.length})`}
        </button>
        <button className={`tab${activeTab === 'timing' ? ' active' : ''}`} onClick={() => setActiveTab('timing')}>Time Analysis</button>
      </div>

      {/* ── Answer Review Tab ── */}
      {activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {dedupedAnswers.map((ans, i) => {
            const q = ans.question;
            if (!q || typeof q !== 'object') return null;

            const isTheory = q.type === 'theory';
            const skipped = !ans.answer?.trim();

            const hasBeenGraded = isTheory
              ? (ans.marksAwarded !== null && ans.marksAwarded !== undefined)
              : true;

            const correct = isTheory
              ? (hasBeenGraded && ans.marksAwarded > 0)
              : ans.isCorrect;

            const borderColor = isTheory
              ? !hasBeenGraded
                ? 'var(--yellow)'
                : ans.marksAwarded > 0
                  ? 'var(--green)'
                  : 'var(--red)'
              : skipped
                ? 'var(--border)'
                : correct
                  ? 'var(--green)'
                  : 'var(--red)';

            const marksDisplay = (ans.marksAwarded !== null && ans.marksAwarded !== undefined)
              ? `${ans.marksAwarded > 0 ? '+' : ''}${ans.marksAwarded}`
              : isTheory ? '?' : '0';

            let statusIcon;
            if (isTheory) {
              if (!hasBeenGraded) statusIcon = <span title="Pending grading">⏳</span>;
              else if (ans.marksAwarded > 0) statusIcon = <span>✅</span>;
              else statusIcon = <span>❌</span>;
            } else {
              if (skipped) statusIcon = '⬜';
              else if (correct) statusIcon = '✅';
              else statusIcon = '❌';
            }

            return (
              <div key={i} style={{ ...S.ansCard, borderLeft: `3px solid ${borderColor}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 700, color: 'var(--text3)', fontSize: 13 }}>Q{i + 1}</span>
                    <span style={{ fontSize: 11, padding: '2px 8px', background: 'var(--bg3)', borderRadius: 20, color: 'var(--text3)' }}>
                      {q.type?.replace('_', ' ')}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 12, color: 'var(--text3)' }}>
                      {marksDisplay} / {q.marks} marks
                    </span>
                    {statusIcon}
                  </div>
                </div>

                <p style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.6, marginBottom: 10 }}>{q.questionText}</p>

                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 13 }}>
                    <span style={{ color: 'var(--text3)' }}>Your answer: </span>
                    <span style={{
                      fontWeight: 600,
                      color: skipped
                        ? 'var(--text3)'
                        : isTheory
                          ? 'var(--text)'
                          : correct ? 'var(--green)' : 'var(--red)'
                    }}>
                      {ans.answer?.trim() || '(not answered)'}
                    </span>
                  </div>
                  {!isTheory && !correct && !skipped && q.correctAnswer && (
                    <div style={{ fontSize: 13 }}>
                      <span style={{ color: 'var(--text3)' }}>Correct: </span>
                      <span style={{ color: 'var(--green)', fontWeight: 600 }}>{q.correctAnswer}</span>
                    </div>
                  )}
                </div>

                {isTheory && ans.teacherComment && (
                  <div style={{ marginTop: 10, padding: '8px 12px', background: 'var(--blue-dim)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 8 }}>
                    <p style={{ fontSize: 12, color: 'var(--blue)', fontWeight: 600 }}>💬 Teacher Feedback</p>
                    <p style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4 }}>{ans.teacherComment}</p>
                  </div>
                )}

                {isTheory && !hasBeenGraded && (
                  <p style={{ fontSize: 12, color: 'var(--yellow)', marginTop: 8 }}>
                    ⏳ Pending teacher grading
                  </p>
                )}

                {isTheory && hasBeenGraded && (
                  <p style={{ fontSize: 12, color: ans.marksAwarded > 0 ? 'var(--green)' : 'var(--text3)', marginTop: 8 }}>
                    ✓ Graded by teacher — {ans.marksAwarded} / {q.marks} marks
                  </p>
                )}

                {ans.timeSpent > 0 && (
                  <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>⏱ Time spent: {ans.timeSpent}s</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Violations Tab ── */}
      {activeTab === 'violations' && (
        attempt.violations?.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">✅</div>
            <h3>No violations!</h3>
            <p>You completed this exam without any security violations</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {attempt.violations?.map((v, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', background: 'var(--red-dim)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10 }}>
                <span>⚠️</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--red)' }}>
                    {v.type?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                  </div>
                  <div style={{ color: 'var(--text3)', fontSize: 12 }}>{v.details}</div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                  {v.timestamp ? new Date(v.timestamp).toLocaleTimeString() : ''}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* ── Time Analysis Tab ── */}
      {activeTab === 'timing' && (
        <div className="card">
          <h4 style={{ fontSize: 15, marginBottom: 16 }}>Time per Question</h4>
          {dedupedAnswers.filter(a => a.timeSpent > 0).length === 0
            ? <p style={{ color: 'var(--text3)' }}>No time tracking data available</p>
            : (() => {
              const maxTime = Math.max(...dedupedAnswers.map(a => a.timeSpent || 0));
              return dedupedAnswers.filter(a => a.timeSpent > 0).map((ans, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                  <span style={{ fontSize: 12, color: 'var(--text3)', width: 32, textAlign: 'right', flexShrink: 0 }}>Q{i + 1}</span>
                  <div style={{ flex: 1, height: 8, background: 'var(--bg4)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${maxTime > 0 ? (ans.timeSpent / maxTime) * 100 : 0}%`, background: ans.isCorrect ? 'var(--green)' : 'var(--accent)', borderRadius: 4 }} />
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--text2)', width: 42, flexShrink: 0 }}>{ans.timeSpent}s</span>
                </div>
              ));
            })()}
        </div>
      )}
    </Layout>
  );
}

const S = {
  // Attempt selector strip
  attemptSelectorWrap: {
    marginBottom: 20,
    padding: '14px 18px',
    background: 'var(--bg2)',
    border: '1px solid var(--border)',
    borderRadius: 12,
  },
  attemptSelectorLabel: {
    display: 'block',
    fontSize: 12,
    fontWeight: 700,
    color: 'var(--text3)',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  attemptTabsRow: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
  },
  attemptTab: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    padding: '10px 16px',
    borderRadius: 10,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    minWidth: 90,
  },
  // Score hero
  hero: { display: 'flex', alignItems: 'center', gap: 28, padding: 24, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, marginBottom: 24, flexWrap: 'wrap' },
  circleWrap: { position: 'relative', width: 130, height: 130, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  statRow: { display: 'flex', gap: 12, flexWrap: 'wrap' },
  statBox: { padding: '10px 18px', background: 'var(--bg3)', borderRadius: 10, textAlign: 'center', minWidth: 60 },
  ansCard: { padding: '16px 18px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10 },
};