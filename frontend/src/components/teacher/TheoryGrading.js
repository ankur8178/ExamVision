import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import Avatar from '../shared/Avatar';
import toast from 'react-hot-toast';

export default function TheoryGrading({ testId }) {
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [grades, setGrades] = useState({});
  const [comments, setComments] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadAttempts(); }, [testId]);

  const loadAttempts = async () => {
    try {
      const res = await api.get(`/attempts/test/${testId}`);
      const done = res.data.filter(a => a.status !== 'in_progress');
      setAttempts(done);
    } catch { }
    finally { setLoading(false); }
  };

  const getTheoryAnswers = (att) => {
    const seen = new Set();
    const deduped = [];
    const answers = [...(att.answers || [])].reverse();
    for (const ans of answers) {
      const q = ans.question;
      if (!q || typeof q !== 'object' || q.type !== 'theory') continue;
      const qId = q._id?.toString();
      if (!qId || seen.has(qId)) continue;
      seen.add(qId);
      deduped.push(ans);
    }
    return deduped.reverse();
  };

  const openAttempt = (att) => {
    setSelected(att);
    const g = {}, c = {};
    getTheoryAnswers(att).forEach(ans => {
      g[ans.question._id] = ans.marksAwarded ?? '';
      c[ans.question._id] = ans.teacherComment ?? '';
    });
    setGrades(g);
    setComments(c);
  };

  const saveGrades = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const theoryAnswers = getTheoryAnswers(selected);
      for (const ans of theoryAnswers) {
        const qId = ans.question._id;
        await api.put(`/attempts/${selected._id}/grade`, {
          questionId: qId,
          marksAwarded: Number(grades[qId] || 0),
          teacherComment: comments[qId] || ''
        });
      }
      toast.success('Grades saved successfully!');
      await loadAttempts();
      const res = await api.get(`/attempts/test/${testId}`);
      const updated = res.data.find(a => a._id === selected._id);
      if (updated) openAttempt(updated);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save grades');
    } finally { setSaving(false); }
  };

  if (loading) return <div className="empty-state"><div className="spinner" /></div>;

  const hasTheoryQuestions = attempts.some(a => getTheoryAnswers(a).length > 0);

  if (attempts.length === 0) return (
    <div className="empty-state">
      <div className="empty-state-icon">📭</div>
      <h3>No submissions yet</h3>
    </div>
  );

  if (!hasTheoryQuestions) return (
    <div className="empty-state">
      <div className="empty-state-icon">✏️</div>
      <h3>No theory questions</h3>
      <p>This test has no theory questions that need manual grading</p>
    </div>
  );

  return (
    <div style={{ display: 'flex', gap: 18, height: 'calc(100vh - 230px)', overflow: 'hidden' }}>
      {/* Student list sidebar */}
      <div style={S.sidebar}>
        <div style={S.sideHead}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>Students</span>
          <span className="badge badge-accent">{attempts.length}</span>
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {attempts.map(a => {
            const theoryAns = getTheoryAnswers(a);
            const gradedCount = theoryAns.filter(ans => ans.marksAwarded !== null && ans.marksAwarded !== undefined && ans.marksAwarded !== '').length;
            const isSel = selected?._id === a._id;
            return (
              <div key={a._id}
                style={{ ...S.studentItem, ...(isSel ? S.studentSel : {}) }}
                onClick={() => openAttempt(a)}>
                <Avatar user={a.student} size={32} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.student?.name}
                  </div>
                  <div style={{ fontSize: 11, marginTop: 2 }}>
                    {a.status === 'evaluated'
                      ? <span style={{ color: 'var(--green)' }}>✓ Graded · {a.percentage}%</span>
                      : theoryAns.length > 0
                        ? <span style={{ color: 'var(--yellow)' }}>⏳ {gradedCount}/{theoryAns.length} graded</span>
                        : <span style={{ color: 'var(--text3)' }}>No theory answers</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Grading panel */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {!selected ? (
          <div className="empty-state" style={{ height: '100%' }}>
            <div style={{ fontSize: 48 }}>👈</div>
            <p style={{ color: 'var(--text3)' }}>Select a student to grade their theory answers</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* Student header */}
            <div style={S.studentHeader}>
              <Avatar user={selected.student} size={42} />
              <div style={{ flex: 1 }}>
                <h3 style={{ fontSize: 17 }}>{selected.student?.name}</h3>
                <p style={{ color: 'var(--text3)', fontSize: 13 }}>
                  Current total: {selected.totalScore} pts · {selected.percentage}% · {selected.violationCount} violations
                </p>
              </div>
              <button className="btn btn-primary" onClick={saveGrades} disabled={saving}>
                {saving ? <><span className="spinner" /> Saving...</> : '💾 Save All Grades'}
              </button>
            </div>

            {/* Theory answers */}
            {getTheoryAnswers(selected).length === 0 ? (
              <div className="card">
                <p style={{ color: 'var(--text3)' }}>This student has no theory answers to grade.</p>
              </div>
            ) : (
              getTheoryAnswers(selected).map((ans, i) => {
                const q = ans.question;
                const qId = q._id;
                return (
                  <div key={i} className="card" style={{ borderLeft: `3px solid var(--yellow)` }}>
                    {/* Question */}
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <span className="badge badge-yellow">Theory · {q.marks} marks max</span>
                        {ans.marksAwarded !== null && ans.marksAwarded !== undefined && ans.marksAwarded !== ''
                          ? <span className="badge badge-green">✓ Graded: {ans.marksAwarded}/{q.marks}</span>
                          : <span className="badge badge-red">⏳ Not graded</span>}
                      </div>
                      <p style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.5 }}>{q.questionText}</p>
                    </div>

                    {/* Model answer */}
                    {q.modelAnswer && (
                      <div style={{ padding: '10px 14px', background: 'var(--blue-dim)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 8, marginBottom: 14 }}>
                        <p style={{ fontSize: 12, color: 'var(--blue)', fontWeight: 600, marginBottom: 4 }}>📖 Model Answer</p>
                        <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>{q.modelAnswer}</p>
                      </div>
                    )}

                    {/* Student answer */}
                    <div style={{ padding: '12px 14px', background: 'var(--bg3)', borderRadius: 8, marginBottom: 14, border: '1px solid var(--border)' }}>
                      <p style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 600, marginBottom: 6 }}>✏️ Student's Answer</p>
                      {ans.answer?.trim() ? (
                        <p style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{ans.answer}</p>
                      ) : (
                        <p style={{ color: 'var(--red)', fontStyle: 'italic', fontSize: 13 }}>⚠️ No answer provided</p>
                      )}
                    </div>

                    {/* Grading input */}
                    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                      <div className="input-group" style={{ flex: '0 0 180px' }}>
                        <label className="input-label">Marks Awarded (0–{q.marks})</label>
                        <input className="input" type="number" min="0" max={q.marks} step="0.5"
                          value={grades[qId] ?? ''}
                          onChange={e => setGrades(g => ({ ...g, [qId]: e.target.value }))}
                          placeholder={`0 to ${q.marks}`} />
                      </div>
                      <div className="input-group" style={{ flex: 1, minWidth: 200 }}>
                        <label className="input-label">Feedback for Student (optional)</label>
                        <input className="input" placeholder="e.g. Good attempt, missed key points..."
                          value={comments[qId] || ''}
                          onChange={e => setComments(c => ({ ...c, [qId]: e.target.value }))} />
                      </div>
                      {/* Quick grade buttons — deduplicated */}
                      <div style={{ display: 'flex', gap: 6 }}>
                        {[...new Set([0, Math.ceil(q.marks / 2), q.marks])].map(v => (
                          <button key={v} type="button" className="btn btn-secondary btn-sm"
                            style={{ minWidth: 40, ...(Number(grades[qId]) === v ? { background: 'var(--accent-dim)', borderColor: 'var(--accent)', color: 'var(--accent2)' } : {}) }}
                            onClick={() => setGrades(g => ({ ...g, [qId]: v }))}>
                            {v}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })
            )}

            <button className="btn btn-primary btn-lg" onClick={saveGrades} disabled={saving} style={{ alignSelf: 'flex-start', marginBottom: 20 }}>
              {saving ? <><span className="spinner" /> Saving...</> : '💾 Save All Grades'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const S = {
  sidebar: { width: 240, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'hidden' },
  sideHead: { padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 },
  studentItem: { display: 'flex', alignItems: 'center', gap: 10, padding: '11px 13px', cursor: 'pointer', borderBottom: '1px solid var(--border)', transition: 'background 0.15s' },
  studentSel: { background: 'var(--accent-dim)' },
  studentHeader: { display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, flexWrap: 'wrap' }
};