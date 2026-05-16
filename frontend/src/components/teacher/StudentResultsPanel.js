import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import Avatar from '../shared/Avatar';

export default function StudentResultsPanel({ testId }) {
  const [attempts, setAttempts]       = useState([]);
  const [loading, setLoading]         = useState(true);
  const [selected, setSelected]       = useState(null);   // selected student's latest attempt
  const [allAttempts, setAllAttempts] = useState([]);     // all attempts for selected student
  const [attemptIdx, setAttemptIdx]   = useState(0);      // which attempt is being viewed
  const [innerTab, setInnerTab]       = useState('answers');
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => { loadAttempts(); }, [testId]);

  const loadAttempts = async () => {
    try {
      const res = await api.get(`/attempts/test/${testId}`);
      // One entry per student (latest/best) for the sidebar list
      const byStudent = new Map();
      res.data.forEach(a => {
        const sid = a.student?._id;
        if (!byStudent.has(sid)) byStudent.set(sid, a);
      });
      setAttempts([...byStudent.values()]);
    } catch { }
    finally { setLoading(false); }
  };

  const openStudent = async (attempt) => {
    setLoadingDetail(true);
    setInnerTab('answers');
    try {
      // Fetch ALL attempts for this student for this test
      const res = await api.get(`/attempts/my/${testId}/all`, {
        headers: { 'x-student-id': attempt.student?._id }
      });
      // The /my/:testId/all route uses req.user — so we instead fetch from
      // the teacher's all-attempts endpoint and filter by student
      const allRes = await api.get(`/attempts/test/${testId}`);
      const studentAttempts = allRes.data.filter(
        a => a.student?._id === attempt.student?._id &&
             ['submitted', 'evaluated'].includes(a.status)
      ).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

      setAllAttempts(studentAttempts.length > 0 ? studentAttempts : [attempt]);
      setAttemptIdx(studentAttempts.length > 0 ? studentAttempts.length - 1 : 0);
      setSelected(attempt);
    } catch {
      setAllAttempts([attempt]);
      setAttemptIdx(0);
      setSelected(attempt);
    } finally { setLoadingDetail(false); }
  };

  // Deduplicate answers for an attempt
  const getDedupedAnswers = (attempt) => {
    const seen = new Set();
    const out  = [];
    const answers = [...(attempt.answers || [])];
    for (let i = answers.length - 1; i >= 0; i--) {
      const ans = answers[i];
      const q   = ans.question;
      const qId = typeof q === 'object' ? q?._id?.toString() : q?.toString();
      if (!qId || seen.has(qId)) continue;
      seen.add(qId);
      out.unshift(ans);
    }
    return out;
  };

  if (loading) return <div className="empty-state"><div className="spinner" /></div>;

  if (attempts.length === 0) return (
    <div className="empty-state">
      <div className="empty-state-icon">📭</div>
      <h3>No submissions yet</h3>
    </div>
  );

  const viewingAttempt = allAttempts[attemptIdx];
  const dedupedAnswers = viewingAttempt ? getDedupedAnswers(viewingAttempt) : [];

  return (
    <div style={{ display: 'flex', gap: 18, height: 'calc(100vh - 230px)', overflow: 'hidden' }}>

      {/* ── Sidebar: student list ── */}
      <div style={S.sidebar}>
        <div style={S.sideHead}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>Students</span>
          <span className="badge badge-accent">{attempts.length}</span>
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {attempts.map(a => {
            const pct    = a.percentage ?? 0;
            const passed = pct >= 50;
            const isSel  = selected?.student?._id === a.student?._id;
            return (
              <div key={a._id}
                style={{ ...S.studentItem, ...(isSel ? S.studentSel : {}) }}
                onClick={() => openStudent(a)}>
                <Avatar user={a.student} size={32} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.student?.name}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.student?.email}
                  </div>
                  <div style={{ fontSize: 11, marginTop: 3 }}>
                    <span style={{ color: passed ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>
                      {pct}%
                    </span>
                    <span style={{ color: 'var(--text3)', marginLeft: 6 }}>
                      {a.totalScore ?? 0} pts
                    </span>
                    {a.violationCount > 0 && (
                      <span style={{ color: 'var(--red)', marginLeft: 6 }}>⚠️ {a.violationCount}</span>
                    )}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: passed ? 'var(--green)' : 'var(--red)', fontWeight: 700, flexShrink: 0 }}>
                  {passed ? '✓' : '✗'}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Main panel ── */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {!selected ? (
          <div className="empty-state" style={{ height: '100%' }}>
            <div style={{ fontSize: 48 }}>👈</div>
            <p style={{ color: 'var(--text3)' }}>Select a student to view their full result</p>
          </div>
        ) : loadingDetail ? (
          <div className="empty-state" style={{ height: '100%' }}><div className="spinner" /></div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* ── Student header ── */}
            <div style={S.studentHeader}>
              <Avatar user={selected.student} size={44} />
              <div style={{ flex: 1 }}>
                <h3 style={{ fontSize: 17 }}>{selected.student?.name}</h3>
                <p style={{ color: 'var(--text3)', fontSize: 13 }}>{selected.student?.email}</p>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <div style={S.statPill}>
                  <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--accent2)' }}>
                    {viewingAttempt?.totalScore ?? 0}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text3)' }}>Score</span>
                </div>
                <div style={S.statPill}>
                  <span style={{ fontSize: 18, fontWeight: 800, color: viewingAttempt?.percentage >= 50 ? 'var(--green)' : 'var(--red)' }}>
                    {viewingAttempt?.percentage ?? 0}%
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text3)' }}>Percent</span>
                </div>
                <div style={S.statPill}>
                  <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--red)' }}>
                    {viewingAttempt?.violationCount ?? 0}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text3)' }}>Violations</span>
                </div>
                <div style={S.statPill}>
                  <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--text2)' }}>
                    {allAttempts.length}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text3)' }}>Attempts</span>
                </div>
              </div>
            </div>

            {/* ── Attempt selector (only if multiple attempts) ── */}
            {allAttempts.length > 1 && (
              <div style={{ padding: '12px 16px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
                  🔄 {allAttempts.length} Attempts — Click to compare:
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {allAttempts.map((a, i) => {
                    const apct    = a.percentage ?? 0;
                    const isActive = i === attemptIdx;
                    return (
                      <button key={a._id}
                        onClick={() => { setAttemptIdx(i); setInnerTab('answers'); }}
                        style={{
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                          padding: '8px 14px', borderRadius: 10, cursor: 'pointer', minWidth: 80,
                          background: isActive ? 'var(--accent)' : 'var(--bg3)',
                          color: isActive ? '#fff' : 'var(--text)',
                          border: isActive ? '1.5px solid var(--accent)' : '1.5px solid var(--border)',
                          transition: 'all 0.15s',
                        }}>
                        <span style={{ fontWeight: 700, fontSize: 12 }}>Attempt {i + 1}</span>
                        {i === allAttempts.length - 1 && (
                          <span style={{ fontSize: 9, padding: '1px 5px', background: isActive ? 'rgba(255,255,255,0.2)' : 'var(--bg4)', borderRadius: 20, color: isActive ? '#fff' : 'var(--text3)' }}>
                            Latest
                          </span>
                        )}
                        <span style={{ fontSize: 14, fontWeight: 800, fontFamily: 'Syne,sans-serif', color: isActive ? '#fff' : (apct >= 70 ? 'var(--green)' : apct >= 40 ? 'var(--yellow)' : 'var(--red)') }}>
                          {apct}%
                        </span>
                        <span style={{ fontSize: 10, color: isActive ? 'rgba(255,255,255,0.7)' : 'var(--text3)' }}>
                          {new Date(a.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </span>
                        {a.violationCount > 0 && (
                          <span style={{ fontSize: 10, color: isActive ? '#fca5a5' : 'var(--red)' }}>
                            ⚠️ {a.violationCount}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Inner tabs ── */}
            <div className="tabs">
              <button className={`tab${innerTab === 'answers'    ? ' active' : ''}`} onClick={() => setInnerTab('answers')}>📝 Answers</button>
              <button className={`tab${innerTab === 'violations' ? ' active' : ''}`} onClick={() => setInnerTab('violations')}>
                ⚠️ Violations {viewingAttempt?.violations?.length > 0 && `(${viewingAttempt.violations.length})`}
              </button>
              <button className={`tab${innerTab === 'recordings' ? ' active' : ''}`} onClick={() => setInnerTab('recordings')}>📹 Recordings</button>
              <button className={`tab${innerTab === 'timing'     ? ' active' : ''}`} onClick={() => setInnerTab('timing')}>⏱ Timing</button>
            </div>

            {/* ── Answers tab ── */}
            {innerTab === 'answers' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {dedupedAnswers.length === 0
                  ? <p style={{ color: 'var(--text3)' }}>No answers recorded.</p>
                  : dedupedAnswers.map((ans, i) => {
                    const q = ans.question;
                    if (!q || typeof q !== 'object') return null;

                    const isTheory    = q.type === 'theory';
                    const skipped     = !ans.answer?.trim();
                    const hasBeenGraded = isTheory
                      ? ans.marksAwarded !== null && ans.marksAwarded !== undefined
                      : true;
                    const correct = isTheory
                      ? hasBeenGraded && ans.marksAwarded > 0
                      : ans.isCorrect;

                    const borderColor = isTheory
                      ? !hasBeenGraded ? 'var(--yellow)' : ans.marksAwarded > 0 ? 'var(--green)' : 'var(--red)'
                      : skipped ? 'var(--border)' : correct ? 'var(--green)' : 'var(--red)';

                    const marksDisplay = ans.marksAwarded !== null && ans.marksAwarded !== undefined
                      ? `${ans.marksAwarded > 0 ? '+' : ''}${ans.marksAwarded}`
                      : isTheory ? '?' : '0';

                    return (
                      <div key={i} style={{ padding: '14px 16px', background: 'var(--bg2)', border: '1px solid var(--border)', borderLeft: `3px solid ${borderColor}`, borderRadius: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontWeight: 700, color: 'var(--text3)', fontSize: 13 }}>Q{i + 1}</span>
                            <span style={{ fontSize: 11, padding: '2px 8px', background: 'var(--bg3)', borderRadius: 20, color: 'var(--text3)' }}>
                              {q.type?.replace('_', ' ')}
                            </span>
                          </div>
                          <span style={{ fontSize: 12, color: 'var(--text3)' }}>
                            {marksDisplay} / {q.marks} marks
                            {!isTheory && !skipped && (correct ? ' ✅' : ' ❌')}
                            {isTheory && !hasBeenGraded && ' ⏳'}
                          </span>
                        </div>
                        <p style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.6, marginBottom: 8 }}>{q.questionText}</p>
                        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                          <div style={{ fontSize: 13 }}>
                            <span style={{ color: 'var(--text3)' }}>Answer: </span>
                            <span style={{ fontWeight: 600, color: skipped ? 'var(--text3)' : isTheory ? 'var(--text)' : correct ? 'var(--green)' : 'var(--red)' }}>
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
                            <p style={{ fontSize: 12, color: 'var(--blue)', fontWeight: 600 }}>💬 Your Feedback</p>
                            <p style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4 }}>{ans.teacherComment}</p>
                          </div>
                        )}
                        {ans.timeSpent > 0 && (
                          <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>⏱ {ans.timeSpent}s spent</p>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}

            {/* ── Violations tab ── */}
            {innerTab === 'violations' && (
              !viewingAttempt?.violations?.length ? (
                <div className="empty-state">
                  <div className="empty-state-icon">✅</div>
                  <h3>No violations</h3>
                  <p>This student had a clean exam session</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {viewingAttempt.violations.map((v, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', background: 'var(--red-dim)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10 }}>
                      <span>⚠️</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--red)' }}>
                          {v.type?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                        </div>
                        <div style={{ color: 'var(--text3)', fontSize: 12 }}>{v.details}</div>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text3)', flexShrink: 0 }}>
                        {v.timestamp ? new Date(v.timestamp).toLocaleTimeString() : ''}
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}

            {/* ── Recordings tab ── */}
            {innerTab === 'recordings' && (() => {
              const screenUrl = viewingAttempt?.screenRecordingUrl;
              const cameraUrl = viewingAttempt?.cameraRecordingUrl;
              const hasScreen = !!screenUrl;
              const hasCamera = !!cameraUrl;

              const isDrive = (url) => url && (url.includes('drive.google.com') || url.includes('googleapis.com'));
              const embedUrl = (url) => {
                if (!url) return null;
                const m = url.match(/\/d\/([^/]+)/);
                if (m) return `https://drive.google.com/file/d/${m[1]}/preview`;
                return url;
              };

              if (!hasScreen && !hasCamera) return (
                <div className="empty-state">
                  <div className="empty-state-icon">📹</div>
                  <h3>No recordings</h3>
                  <p>No screen or camera recordings were uploaded for this attempt</p>
                </div>
              );

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {[{ label: '🖥️ Screen Recording', url: screenUrl }, { label: '📷 Camera Recording', url: cameraUrl }]
                    .filter(r => r.url)
                    .map(({ label, url }) => (
                      <div key={label} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 600, fontSize: 14 }}>{label}</span>
                          <a href={url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm">⬇️ Download</a>
                        </div>
                        {isDrive(url) ? (
                          <iframe src={embedUrl(url)} style={{ width: '100%', height: 380, border: 'none', background: '#000', display: 'block' }} allow="autoplay" title={label} />
                        ) : (
                          <video src={url} controls style={{ width: '100%', maxHeight: 380, background: '#000', display: 'block' }} />
                        )}
                      </div>
                    ))}
                </div>
              );
            })()}

            {/* ── Timing tab ── */}
            {innerTab === 'timing' && (() => {
              const timed = dedupedAnswers.filter(a => a.timeSpent > 0);
              if (!timed.length) return <p style={{ color: 'var(--text3)' }}>No time tracking data available.</p>;
              const maxTime = Math.max(...timed.map(a => a.timeSpent));
              return (
                <div className="card">
                  <h4 style={{ fontSize: 15, marginBottom: 16 }}>Time per Question</h4>
                  {timed.map((ans, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                      <span style={{ fontSize: 12, color: 'var(--text3)', width: 32, textAlign: 'right', flexShrink: 0 }}>Q{i + 1}</span>
                      <div style={{ flex: 1, height: 8, background: 'var(--bg4)', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${maxTime > 0 ? (ans.timeSpent / maxTime) * 100 : 0}%`, background: ans.isCorrect ? 'var(--green)' : 'var(--accent)', borderRadius: 4 }} />
                      </div>
                      <span style={{ fontSize: 12, color: 'var(--text2)', width: 42, flexShrink: 0 }}>{ans.timeSpent}s</span>
                    </div>
                  ))}
                </div>
              );
            })()}

          </div>
        )}
      </div>
    </div>
  );
}

const S = {
  sidebar:       { width: 240, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'hidden' },
  sideHead:      { padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 },
  studentItem:   { display: 'flex', alignItems: 'center', gap: 10, padding: '11px 13px', cursor: 'pointer', borderBottom: '1px solid var(--border)', transition: 'background 0.15s' },
  studentSel:    { background: 'var(--accent-dim)' },
  studentHeader: { display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, flexWrap: 'wrap' },
  statPill:      { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 14px', background: 'var(--bg3)', borderRadius: 10, minWidth: 56 },
};