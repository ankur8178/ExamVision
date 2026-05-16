import React, { useState } from 'react';
import api from '../../utils/api';
import toast from 'react-hot-toast';

const TYPES = [
  { value: 'mcq', label: 'MCQ', icon: '⊙' },
  { value: 'true_false', label: 'True/False', icon: '◑' },
  { value: 'one_word', label: 'One Word', icon: 'Aa' },
  { value: 'theory', label: 'Theory', icon: '📝' },
];

const emptyQuestion = (testId) => ({
  test: testId, type: 'mcq', questionText: '', marks: 1, negativeMarks: 0, timeLimit: 0,
  options: [{ text: '', isCorrect: false }, { text: '', isCorrect: false }, { text: '', isCorrect: false }, { text: '', isCorrect: false }],
  correctAnswer: '', modelAnswer: ''
});

export default function QuestionEditor({ testId, questions, setQuestions }) {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(emptyQuestion(testId));
  const [saving, setSaving] = useState(false);

  const openAdd = () => { setForm(emptyQuestion(testId)); setEditId(null); setShowForm(true); };
  const openEdit = (q) => {
    setForm({ ...q, options: q.options?.length ? q.options : emptyQuestion(testId).options });
    setEditId(q._id);
    setShowForm(true);
  };

  // Build a clean payload — strip fields that don't belong to this question type
  const buildPayload = () => {
    const payload = { ...form };

    if (payload.type === 'mcq') {
      const filled = payload.options.filter(o => o.text && o.text.trim() !== '');
      if (filled.length < 2) { toast.error('Add at least 2 options'); return null; }
      if (!filled.some(o => o.isCorrect)) { toast.error('Select the correct option'); return null; }
      payload.options = filled;
      payload.correctAnswer = '';
      payload.modelAnswer = '';
    } else {
      // For all non-MCQ types, send empty options array
      payload.options = [];
      if (payload.type === 'true_false' || payload.type === 'one_word') {
        if (!payload.correctAnswer || payload.correctAnswer.trim() === '') {
          toast.error('Please set the correct answer'); return null;
        }
        payload.modelAnswer = '';
      }
      if (payload.type === 'theory') {
        payload.correctAnswer = '';
      }
    }

    return payload;
  };

  const saveQuestion = async (e) => {
    e.preventDefault();
    const payload = buildPayload();
    if (!payload) return;
    setSaving(true);
    try {
      if (editId) {
        const res = await api.put(`/questions/${editId}`, payload);
        setQuestions(questions.map(q => q._id === editId ? res.data : q));
        toast.success('Question updated!');
      } else {
        const res = await api.post('/questions', payload);
        setQuestions([...questions, res.data]);
        toast.success('Question added!');
      }
      setShowForm(false);
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to save'); }
    finally { setSaving(false); }
  };

  const deleteQuestion = async (qId) => {
    if (!window.confirm('Delete this question?')) return;
    try {
      await api.delete(`/questions/${qId}`);
      setQuestions(questions.filter(q => q._id !== qId));
      toast.success('Deleted');
    } catch { toast.error('Failed'); }
  };

  const updateOption = (idx, field, val) => {
    const opts = [...form.options];
    opts[idx] = { ...opts[idx], [field]: val };
    setForm({ ...form, options: opts });
  };

  const setCorrectOption = (idx) => {
    const opts = form.options.map((o, i) => ({ ...o, isCorrect: i === idx }));
    setForm({ ...form, options: opts });
  };

  const addOption = () => setForm({ ...form, options: [...form.options, { text: '', isCorrect: false }] });
  const removeOption = (idx) => setForm({ ...form, options: form.options.filter((_, i) => i !== idx) });

  const typeColors = { mcq: 'var(--accent)', true_false: 'var(--blue)', one_word: 'var(--green)', theory: 'var(--yellow)' };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h3 style={{ fontSize: 16 }}>{questions.length} Questions</h3>
        <button className="btn btn-primary btn-sm" onClick={openAdd}>＋ Add Question</button>
      </div>

      {questions.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📝</div>
          <h3>No questions yet</h3>
          <p>Add your first question to get started</p>
          <button className="btn btn-primary" onClick={openAdd}>Add Question</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {questions.map((q, i) => (
            <div key={q._id} style={styles.qCard}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ ...styles.qNum, borderColor: typeColors[q.type] }}>{i + 1}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                    <span style={{ ...styles.typeTag, color: typeColors[q.type] }}>
                      {TYPES.find(t => t.value === q.type)?.icon} {TYPES.find(t => t.value === q.type)?.label}
                    </span>
                    <span style={{ color: 'var(--text3)', fontSize: 12 }}>· {q.marks} mark{q.marks !== 1 ? 's' : ''}</span>
                    {q.negativeMarks > 0 && <span style={{ color: 'var(--red)', fontSize: 12 }}>· -{q.negativeMarks} negative</span>}
                  </div>
                  <p style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.5 }}>{q.questionText}</p>
                  {q.type === 'mcq' && (
                    <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {q.options?.map((o, oi) => (
                        <span key={oi} style={{ ...styles.optTag, ...(o.isCorrect ? styles.optTagCorrect : {}) }}>
                          {o.isCorrect ? '✓ ' : ''}{o.text}
                        </span>
                      ))}
                    </div>
                  )}
                  {(q.type === 'true_false' || q.type === 'one_word') && (
                    <div style={{ marginTop: 6, fontSize: 13, color: 'var(--green)' }}>✓ {q.correctAnswer}</div>
                  )}
                  {q.type === 'theory' && q.modelAnswer && (
                    <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text3)' }}>Model answer provided</div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => openEdit(q)}>Edit</button>
                  <button className="btn btn-danger btn-sm" onClick={() => deleteQuestion(q._id)}>✕</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" style={{ maxWidth: 680 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{editId ? 'Edit Question' : 'Add Question'}</h3>
              <button style={styles.closeBtn} onClick={() => setShowForm(false)}>✕</button>
            </div>
            <form onSubmit={saveQuestion} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

              {/* Type selector */}
              <div className="input-group">
                <label className="input-label">Question Type</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
                  {TYPES.map(t => (
                    <button key={t.value} type="button"
                      style={{ ...styles.typeBtn, ...(form.type === t.value ? { background: 'var(--accent-dim)', borderColor: 'var(--accent)', color: 'var(--accent2)' } : {}) }}
                      onClick={() => setForm({ ...form, type: t.value, correctAnswer: '', options: emptyQuestion(testId).options })}>
                      <span style={{ fontSize: 18 }}>{t.icon}</span>
                      <span style={{ fontSize: 12, fontWeight: 600 }}>{t.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="input-group">
                <label className="input-label">Question Text *</label>
                <textarea className="input" style={{ minHeight: 80 }} placeholder="Enter your question here..."
                  value={form.questionText} onChange={e => setForm({ ...form, questionText: e.target.value })} required />
              </div>

              {/* MCQ options */}
              {form.type === 'mcq' && (
                <div className="input-group">
                  <label className="input-label">Options (select radio = correct answer)</label>
                  {form.options.map((opt, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                      <input type="radio" name="correctOpt" checked={opt.isCorrect} onChange={() => setCorrectOption(idx)}
                        style={{ width: 16, height: 16, accentColor: 'var(--accent)', flexShrink: 0 }} />
                      <input className="input" placeholder={`Option ${idx + 1}`} value={opt.text}
                        onChange={e => updateOption(idx, 'text', e.target.value)} style={{ flex: 1 }} />
                      {form.options.length > 2 && (
                        <button type="button" style={styles.removeOptBtn} onClick={() => removeOption(idx)}>✕</button>
                      )}
                    </div>
                  ))}
                  <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 8, alignSelf: 'flex-start' }}
                    onClick={addOption}>＋ Add Option</button>
                </div>
              )}

              {/* True / False */}
              {form.type === 'true_false' && (
                <div className="input-group">
                  <label className="input-label">Correct Answer *</label>
                  <div style={{ display: 'flex', gap: 10 }}>
                    {['True', 'False'].map(v => (
                      <button key={v} type="button"
                        style={{ ...styles.typeBtn, ...(form.correctAnswer === v ? { background: 'var(--green-dim)', borderColor: 'var(--green)', color: 'var(--green)' } : {}), flex: 1 }}
                        onClick={() => setForm({ ...form, correctAnswer: v })}>
                        {v === 'True' ? '✓ True' : '✗ False'}
                      </button>
                    ))}
                  </div>
                  {form.correctAnswer && (
                    <p style={{ fontSize: 12, color: 'var(--green)', marginTop: 6 }}>
                      ✓ Correct answer: <strong>{form.correctAnswer}</strong>
                    </p>
                  )}
                </div>
              )}

              {/* One Word */}
              {form.type === 'one_word' && (
                <div className="input-group">
                  <label className="input-label">Correct Answer *</label>
                  <input className="input" placeholder="e.g. Paris" value={form.correctAnswer}
                    onChange={e => setForm({ ...form, correctAnswer: e.target.value })} />
                  <span style={{ fontSize: 12, color: 'var(--text3)' }}>Answer matching is case-insensitive</span>
                </div>
              )}

              {/* Theory */}
              {form.type === 'theory' && (
                <div className="input-group">
                  <label className="input-label">Model Answer (teacher reference only)</label>
                  <textarea className="input" placeholder="Reference answer for manual grading..." value={form.modelAnswer}
                    onChange={e => setForm({ ...form, modelAnswer: e.target.value })} />
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div className="input-group">
                  <label className="input-label">Marks *</label>
                  <input className="input" type="number" min="0.5" step="0.5" value={form.marks}
                    onChange={e => setForm({ ...form, marks: parseFloat(e.target.value) })} required />
                </div>
                <div className="input-group">
                  <label className="input-label">Negative Marks</label>
                  <input className="input" type="number" min="0" step="0.25" value={form.negativeMarks}
                    onChange={e => setForm({ ...form, negativeMarks: parseFloat(e.target.value) })} />
                </div>
                <div className="input-group">
                  <label className="input-label">Time Limit (sec)</label>
                  <input className="input" type="number" min="0" value={form.timeLimit}
                    onChange={e => setForm({ ...form, timeLimit: parseInt(e.target.value) })}
                    placeholder="0 = no limit" />
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? <span className="spinner" /> : editId ? 'Update Question' : 'Add Question'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  qCard: { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '16px 20px' },
  qNum: { width: 30, height: 30, borderRadius: 8, border: '2px solid', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: 'var(--text2)', flexShrink: 0 },
  typeTag: { fontSize: 12, fontWeight: 700, background: 'var(--bg3)', padding: '2px 10px', borderRadius: 20 },
  optTag: { padding: '4px 10px', borderRadius: 6, background: 'var(--bg3)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text2)' },
  optTagCorrect: { background: 'var(--green-dim)', borderColor: 'var(--green)', color: 'var(--green)' },
  typeBtn: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '10px 6px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--text2)', transition: 'all 0.2s' },
  removeOptBtn: { background: 'var(--red-dim)', border: 'none', borderRadius: 6, color: 'var(--red)', cursor: 'pointer', padding: '8px', fontSize: 12, fontWeight: 700 },
  closeBtn: { background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6, width: 32, height: 32, color: 'var(--text2)', cursor: 'pointer', fontSize: 14 }
};
