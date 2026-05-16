import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../components/shared/Layout';
import api from '../utils/api';
import toast from 'react-hot-toast';
import SecuritySettings from '../components/teacher/SecuritySettings';
import QuestionEditor from '../components/teacher/QuestionEditor';
import TestAnalytics from '../components/teacher/TestAnalytics';
import Leaderboard from '../components/teacher/Leaderboard';
import TheoryGrading from '../components/teacher/TheoryGrading';
import LiveMonitorDashboard from '../components/teacher/LiveMonitorDashboard';
import StudentResultsPanel from '../components/teacher/StudentResultsPanel';

const toLocalDT = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function TestDetailTeacher() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [test, setTest] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [activeTab, setActiveTab] = useState('questions');
  const [courseStudents, setCourseStudents] = useState([]);
  const [showMonitor, setShowMonitor] = useState(false);

  useEffect(() => { fetchTest(); }, [id]);

  const fetchTest = async () => {
    try {
      const res = await api.get(`/tests/${id}`);
      setTest(res.data);
      setQuestions(res.data.questions || []);
      if (res.data.course?._id) {
        const cRes = await api.get(`/courses/${res.data.course._id}`);
        setCourseStudents(cRes.data.students || []);
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to load test';
      toast.error(msg);
      navigate('/teacher');
    }
  };

  const updateStatus = async (status) => {
    try {
      const res = await api.put(`/tests/${id}/status`, { status });
      setTest(prev => ({ ...prev, ...res.data }));
      toast.success(`Test ${status}!`);
    } catch { toast.error('Failed'); }
  };

  const releaseResults = async () => {
    try {
      await api.put(`/attempts/test/${id}/release-results`);
      setTest(prev => ({ ...prev, resultHidden: false }));
      toast.success('Results released to students!');
    } catch { toast.error('Failed'); }
  };

  const hideResults = async () => {
    try {
      await api.put(`/tests/${id}/visibility`, {
        visibleToAll: test.visibleToAll,
        visibleToStudents: test.visibleToStudents?.map(s => s._id || s) || [],
        resultHidden: true
      });
      setTest(prev => ({ ...prev, resultHidden: true }));
      toast.success('Results hidden');
    } catch { toast.error('Failed'); }
  };

  if (!test) return <Layout title="Loading..."><div className="empty-state"><div className="spinner" /></div></Layout>;

  const tabs = [
    { key: 'questions',   label: '📝 Questions' },
    { key: 'settings',    label: '⚙️ Settings' },
    { key: 'security',    label: '🛡️ Security' },
    { key: 'visibility',  label: '👁 Visibility' },
    { key: 'grading',     label: '✏️ Grade Theory' },
    { key: 'analytics',   label: '📊 Analytics' },
    { key: 'leaderboard', label: '🏆 Leaderboard' },
    { key: 'results',     label: '📋 Results' },
  ];

  return (
  <>
    {showMonitor && (
      <LiveMonitorDashboard
        testId={id}
        onClose={() => setShowMonitor(false)}
      />
    )}
    <Layout>
      <div style={S.header}>
        <button className="btn btn-secondary btn-sm" onClick={() => navigate(-1)}>← Back</button>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: 20, fontFamily: 'Syne,sans-serif' }}>{test.title}</h1>
            <span className={`badge ${test.status === 'published' ? 'badge-green' : test.status === 'closed' ? 'badge-red' : 'badge-yellow'}`}>{test.status}</span>
            <span className={`badge ${test.visibleToAll ? 'badge-blue' : 'badge-accent'}`}>
              {test.visibleToAll ? '👁 All' : `👁 ${test.visibleToStudents?.length || 0}`}
            </span>
            <span className={`badge ${test.resultHidden ? 'badge-red' : 'badge-green'}`}>
              {test.resultHidden ? '🔒 Results Hidden' : '✅ Results Visible'}
            </span>
          </div>
          <p style={{ color: 'var(--text3)', fontSize: 12, marginTop: 4 }}>
            ⏱ {test.duration} min · 🎯 {test.totalMarks} marks · 📝 {questions.length} Q
            {test.allowReattempt && ` · 🔄 ${test.maxAttempts === 0 ? 'Unlimited' : test.maxAttempts} attempts`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>

          {/* 🔴 Live Monitor — only shown when test is published */}
          {test.status === 'published' && (
            <button onClick={() => setShowMonitor(true)} style={S.liveBtn}>
              <span style={S.liveDot} />
              Live Monitor
            </button>
          )}

          {test.status !== 'draft' && (
            test.resultHidden
              ? <button className="btn btn-success btn-sm" onClick={releaseResults}>🔓 Release Results</button>
              : <button className="btn btn-secondary btn-sm" onClick={hideResults}>🔒 Hide Results</button>
          )}
          {test.status === 'draft'     && <button className="btn btn-success"        onClick={() => updateStatus('published')}>🚀 Publish</button>}
          {test.status === 'published' && <button className="btn btn-danger btn-sm"  onClick={() => updateStatus('closed')}>🔒 Close</button>}
          {test.status === 'closed'    && <button className="btn btn-secondary btn-sm" onClick={() => updateStatus('published')}>↩ Reopen</button>}
        </div>
      </div>

      <div className="tabs" style={{ overflowX: 'auto' }}>
        {tabs.map(t => (
          <button key={t.key} className={`tab${activeTab === t.key ? ' active' : ''}`} onClick={() => setActiveTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'questions'   && <QuestionEditor testId={id} questions={questions} setQuestions={setQuestions} />}
      {activeTab === 'settings'    && <TestSettings test={test} setTest={setTest} />}
      {activeTab === 'security'    && <SecuritySettings test={test} setTest={setTest} />}
      {activeTab === 'visibility'  && <VisibilitySettings test={test} setTest={setTest} courseStudents={courseStudents} />}
      {activeTab === 'grading'     && <TheoryGrading testId={id} />}
      {activeTab === 'analytics'   && <TestAnalytics testId={id} />}
      {activeTab === 'leaderboard' && <Leaderboard testId={id} resultHidden={test.resultHidden} />}
      {activeTab === 'results'     && <StudentResultsPanel testId={id} />}
    </Layout>
    </>
  );
}

// ── Test Settings ─────────────────────────────────────────────────────
function TestSettings({ test, setTest }) {
  const [form, setForm] = useState({
    title:          test.title || '',
    description:    test.description || '',
    duration:       test.duration || 60,
    passingMarks:   test.passingMarks || 0,
    startTime:      toLocalDT(test.startTime),
    endTime:        toLocalDT(test.endTime),
    allowReattempt: test.allowReattempt || false,
    maxAttempts:    test.maxAttempts ?? 1,
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.title.trim()) { toast.error('Title is required'); return; }
    if (form.duration < 1)  { toast.error('Duration must be at least 1 minute'); return; }
    if (form.startTime && form.endTime && new Date(form.startTime) >= new Date(form.endTime)) {
      toast.error('End time must be after start time'); return;
    }
    setSaving(true);
    try {
      const payload = {
        title:          form.title,
        description:    form.description,
        duration:       Number(form.duration),
        passingMarks:   Number(form.passingMarks),
        startTime:      form.startTime ? new Date(form.startTime).toISOString() : null,
        endTime:        form.endTime   ? new Date(form.endTime).toISOString()   : null,
        allowReattempt: form.allowReattempt,
        maxAttempts:    form.allowReattempt ? Number(form.maxAttempts) : 1,
      };
      const res = await api.put(`/tests/${test._id}`, payload);
      setTest(prev => ({ ...prev, ...res.data }));
      toast.success('Settings saved!');
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="card">
        <h3 style={{ fontSize: 15, marginBottom: 18 }}>General Settings</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="input-group">
            <label className="input-label">Test Title *</label>
            <input className="input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          </div>
          <div className="input-group">
            <label className="input-label">Description / Instructions</label>
            <textarea className="input" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="input-group">
              <label className="input-label">Duration (minutes) *</label>
              <input className="input" type="number" min="1" max="300" value={form.duration}
                onChange={e => setForm(f => ({ ...f, duration: e.target.value }))} />
            </div>
            <div className="input-group">
              <label className="input-label">Passing Marks</label>
              <input className="input" type="number" min="0" value={form.passingMarks}
                onChange={e => setForm(f => ({ ...f, passingMarks: e.target.value }))} />
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ fontSize: 15, marginBottom: 18 }}>Schedule (optional)</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div className="input-group">
            <label className="input-label">Start Date & Time</label>
            <input className="input" type="datetime-local" value={form.startTime}
              onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))} />
          </div>
          <div className="input-group">
            <label className="input-label">End Date & Time</label>
            <input className="input" type="datetime-local" value={form.endTime}
              onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))} />
          </div>
        </div>
        {(form.startTime || form.endTime) && (
          <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--blue-dim)', borderRadius: 8, fontSize: 13, color: 'var(--blue)' }}>
            ℹ️ Students can only access the test within this window. Leave blank for no time restriction.
          </div>
        )}
        <button className="btn btn-secondary btn-sm" style={{ marginTop: 12 }}
          onClick={() => setForm(f => ({ ...f, startTime: '', endTime: '' }))}>
          Clear Schedule
        </button>
      </div>

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: form.allowReattempt ? 18 : 0 }}>
          <div>
            <h3 style={{ fontSize: 15 }}>🔄 Reattempt Settings</h3>
            <p style={{ color: 'var(--text3)', fontSize: 13, marginTop: 4 }}>Allow students to retake this test after submission</p>
          </div>
          <label className="toggle">
            <input type="checkbox" checked={form.allowReattempt}
              onChange={e => setForm(f => ({ ...f, allowReattempt: e.target.checked }))} />
            <span className="toggle-slider" />
          </label>
        </div>
        {form.allowReattempt && (
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
            <div className="input-group" style={{ maxWidth: 260 }}>
              <label className="input-label">Maximum Attempts Allowed</label>
              <input className="input" type="number" min="0" max="100" value={form.maxAttempts}
                onChange={e => setForm(f => ({ ...f, maxAttempts: e.target.value }))} />
            </div>
            <p style={{ color: 'var(--text3)', fontSize: 12, marginTop: 8 }}>
              {Number(form.maxAttempts) === 0
                ? '♾️ Unlimited attempts — students can retake as many times as they want'
                : `Students can attempt this test up to ${form.maxAttempts} time${Number(form.maxAttempts) > 1 ? 's' : ''} total`}
            </p>
          </div>
        )}
      </div>

      <button className="btn btn-primary" onClick={save} disabled={saving} style={{ alignSelf: 'flex-start' }}>
        {saving ? <><span className="spinner" /> Saving...</> : '💾 Save Settings'}
      </button>
    </div>
  );
}

// ── Visibility Settings ───────────────────────────────────────────────
function VisibilitySettings({ test, setTest, courseStudents }) {
  const [form, setForm] = useState({
    visibleToAll:      test.visibleToAll ?? true,
    visibleToStudents: test.visibleToStudents?.map(s => s._id || s) || [],
    resultHidden:      test.resultHidden ?? false
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.visibleToAll && form.visibleToStudents.length === 0) {
      toast.error('Select at least one student, or enable "Visible to All"'); return;
    }
    setSaving(true);
    try {
      const res = await api.put(`/tests/${test._id}/visibility`, form);
      setTest(prev => ({ ...prev, ...res.data }));
      toast.success('Saved!');
    } catch { toast.error('Failed'); }
    finally { setSaving(false); }
  };

  const toggleStudent = (sid) => setForm(f => ({
    ...f,
    visibleToStudents: f.visibleToStudents.includes(sid)
      ? f.visibleToStudents.filter(x => x !== sid)
      : [...f.visibleToStudents, sid]
  }));

  const statusColor = form.visibleToAll ? 'var(--green)' : form.visibleToStudents.length > 0 ? 'var(--blue)' : 'var(--red)';
  const statusMsg   = form.visibleToAll
    ? '✅ Visible to all enrolled students'
    : form.visibleToStudents.length > 0
      ? `👁 Visible to ${form.visibleToStudents.length} selected student(s)`
      : '⚠️ Not visible to anyone';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ padding: '12px 16px', background: 'var(--bg3)', border: `1px solid ${statusColor}40`, borderRadius: 10, color: statusColor, fontSize: 13 }}>
        {statusMsg}
      </div>
      <div className="card">
        <h3 style={{ fontSize: 15, marginBottom: 16 }}>Visibility</h3>
        <div style={S.row}>
          <div>
            <div style={{ fontWeight: 600 }}>Visible to All Course Students</div>
            <div style={{ color: 'var(--text3)', fontSize: 13, marginTop: 2 }}>All enrolled students can see this test</div>
          </div>
          <label className="toggle">
            <input type="checkbox" checked={form.visibleToAll} onChange={e => setForm(f => ({ ...f, visibleToAll: e.target.checked }))} />
            <span className="toggle-slider" />
          </label>
        </div>
        <div style={S.row}>
          <div>
            <div style={{ fontWeight: 600 }}>Hide Results</div>
            <div style={{ color: 'var(--text3)', fontSize: 13, marginTop: 2 }}>Students can't see scores until you release them</div>
          </div>
          <label className="toggle">
            <input type="checkbox" checked={form.resultHidden} onChange={e => setForm(f => ({ ...f, resultHidden: e.target.checked }))} />
            <span className="toggle-slider" />
          </label>
        </div>
      </div>

      {!form.visibleToAll && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ fontSize: 15 }}>Specific Students</h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setForm(f => ({ ...f, visibleToStudents: courseStudents.map(s => s._id) }))}>All</button>
              <button className="btn btn-secondary btn-sm" onClick={() => setForm(f => ({ ...f, visibleToStudents: [] }))}>None</button>
            </div>
          </div>
          {courseStudents.length === 0
            ? <p style={{ color: 'var(--text3)' }}>No students enrolled yet</p>
            : courseStudents.map(s => (
              <label key={s._id} style={S.studentRow} onClick={() => toggleStudent(s._id)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={S.av}>{s.name[0].toUpperCase()}</div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{s.name}</div>
                    <div style={{ color: 'var(--text3)', fontSize: 12 }}>{s.email}</div>
                  </div>
                </div>
                <input type="checkbox" checked={form.visibleToStudents.includes(s._id)}
                  onChange={() => {}} onClick={e => e.stopPropagation()}
                  style={{ width: 18, height: 18, accentColor: 'var(--accent)' }} />
              </label>
            ))}
        </div>
      )}

      <button className="btn btn-primary" onClick={save} disabled={saving} style={{ alignSelf: 'flex-start' }}>
        {saving ? <><span className="spinner" /> Saving...</> : '💾 Save Visibility'}
      </button>
    </div>
  );
}

const S = {
  header: { display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 22, flexWrap: 'wrap' },
  row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: '1px solid var(--border)', gap: 16 },
  studentRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 8, cursor: 'pointer' },
  av: { width: 32, height: 32, borderRadius: '50%', background: 'var(--accent-dim)', color: 'var(--accent2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, flexShrink: 0 },
  liveBtn: {
    display: 'flex', alignItems: 'center', gap: 7,
    padding: '7px 14px',
    background: 'rgba(239,68,68,0.12)',
    color: '#ef4444',
    border: '1px solid rgba(239,68,68,0.35)',
    borderRadius: 8, cursor: 'pointer',
    fontWeight: 700, fontSize: 13,
  },
  liveDot: {
    width: 7, height: 7, borderRadius: '50%',
    background: '#ef4444',
    boxShadow: '0 0 6px #ef4444',
    flexShrink: 0,
  },
};