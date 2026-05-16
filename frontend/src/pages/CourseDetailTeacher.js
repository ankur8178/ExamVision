import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import Layout from '../components/shared/Layout';
import Avatar from '../components/shared/Avatar';
import api from '../utils/api';
import toast from 'react-hot-toast';

const styleSheet = `
  @keyframes fadeSlideIn {
    from { opacity: 0; transform: translateY(16px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .anim-card {
    animation: fadeSlideIn 0.4s ease both;
  }
  .anim-card:nth-child(1) { animation-delay: 0.05s; }
  .anim-card:nth-child(2) { animation-delay: 0.10s; }
  .anim-card:nth-child(3) { animation-delay: 0.15s; }
  .anim-card:nth-child(4) { animation-delay: 0.20s; }
  .anim-card:nth-child(5) { animation-delay: 0.25s; }
  .anim-card:nth-child(6) { animation-delay: 0.30s; }

  .btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(0,0,0,0.18);
    transition: transform 0.18s ease, box-shadow 0.18s ease;
  }
  .btn:active {
    transform: translateY(0px);
    box-shadow: none;
    transition: transform 0.08s ease;
  }
  .btn {
    transition: transform 0.18s ease, box-shadow 0.18s ease;
  }
`;

export default function CourseDetailTeacher() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [course, setCourse] = useState(null);
  const [tests, setTests] = useState([]);
  const [allStudents, setAllStudents] = useState([]);
  const [activeTab, setActiveTab] = useState('overview');
  const [showAdmit, setShowAdmit] = useState(false);
  const [showCreateTest, setShowCreateTest] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState('');
  const [testForm, setTestForm] = useState({ title: '', description: '', duration: 60, startTime: '', endTime: '' });

  useEffect(() => { fetchCourse(); fetchTests(); fetchAllStudents(); }, [id]);

  const fetchCourse = async () => {
    try { const res = await api.get(`/courses/${id}`); setCourse(res.data); }
    catch { toast.error('Course not found'); navigate('/teacher'); }
  };
  const fetchTests = async () => {
    try { const res = await api.get(`/tests/course/${id}`); setTests(res.data); } catch { }
  };
  const fetchAllStudents = async () => {
    try { const res = await api.get('/auth/students'); setAllStudents(res.data); } catch { }
  };

  const admitStudent = async () => {
    if (!selectedStudent) return;
    try {
      const res = await api.post(`/courses/${id}/admit`, { studentId: selectedStudent });
      setCourse(res.data);
      setShowAdmit(false); setSelectedStudent('');
      toast.success('Student admitted!');
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
  };

  const removeStudent = async (studentId) => {
    if (!window.confirm('Remove this student from the course?')) return;
    try {
      await api.delete(`/courses/${id}/students/${studentId}`);
      setCourse(prev => ({ ...prev, students: prev.students.filter(s => s._id !== studentId) }));
      toast.success('Student removed');
    } catch { toast.error('Failed'); }
  };

  const createTest = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/tests', { ...testForm, course: id });
      setTests(prev => [res.data, ...prev]);
      setShowCreateTest(false);
      setTestForm({ title: '', description: '', duration: 60, startTime: '', endTime: '' });
      toast.success('Test created!');
      navigate(`/teacher/test/${res.data._id}`);
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
  };

  const deleteTest = async (testId) => {
    if (!window.confirm('Delete this test and all its data?')) return;
    try { await api.delete(`/tests/${testId}`); setTests(tests.filter(t => t._id !== testId)); toast.success('Deleted'); }
    catch { toast.error('Failed'); }
  };

  if (!course) return <Layout title="Loading..."><div className="empty-state"><div className="spinner" /></div></Layout>;

  const unadmitted = allStudents.filter(s => !course.students?.some(cs => cs._id === s._id));

  return (
    <Layout>
      <style>{styleSheet}</style>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 24, flexWrap: 'wrap' }}>
        <button className="btn btn-secondary btn-sm" onClick={() => navigate('/teacher')}>← Back</button>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: 22, fontFamily: 'Syne,sans-serif' }}>{course.name}</h1>
            <span className="badge badge-accent">{course.code}</span>
          </div>
          <p style={{ color: 'var(--text3)', fontSize: 13, marginTop: 4 }}>{course.description}</p>
        </div>
      </div>

      <div className="tabs">
        {['overview', 'students', 'tests'].map(t => (
          <button key={t} className={`tab${activeTab === t ? ' active' : ''}`} onClick={() => setActiveTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 14 }}>
          {[
            ['👥', course.students?.length || 0, 'Students'],
            ['📝', tests.length, 'Tests'],
            ['✅', tests.filter(t => t.status === 'published').length, 'Active Tests'],
            ['🔑', course.code, 'Course Code'],
          ].map(([icon, val, lbl]) => (
            <div key={lbl} className="card anim-card" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 26 }}>{icon}</div>
              <div style={{
                fontSize: lbl === 'Course Code' ? 15 : 28,
                fontFamily: 'Syne,sans-serif',
                fontWeight: 800,
                color: 'var(--accent2)',
                marginTop: 6,
                wordBreak: 'break-word',
                letterSpacing: lbl === 'Course Code' ? 2 : 0
              }}>{val}</div>
              <div style={{ color: 'var(--text3)', fontSize: 12, marginTop: 4 }}>{lbl}</div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'students' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <h3 style={{ fontSize: 15 }}>{course.students?.length || 0} Students Enrolled</h3>
            <button className="btn btn-primary btn-sm" onClick={() => setShowAdmit(true)}>＋ Admit Student</button>
          </div>
          {course.students?.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">👥</div>
              <p>No students admitted yet</p>
              <button className="btn btn-primary" onClick={() => setShowAdmit(true)}>Admit First Student</button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {course.students.map((s, i) => (
                <div key={s._id} className="anim-card" style={{ ...S.studentRow, animationDelay: `${i * 0.06}s` }}>
                  <Avatar user={s} size={38} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{s.name}</div>
                    <div style={{ color: 'var(--text3)', fontSize: 12 }}>{s.email}</div>
                  </div>
                  <button className="btn btn-danger btn-sm" onClick={() => removeStudent(s._id)}>Remove</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'tests' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <h3 style={{ fontSize: 15 }}>{tests.length} Tests</h3>
            <button className="btn btn-primary btn-sm" onClick={() => setShowCreateTest(true)}>＋ Create Test</button>
          </div>
          {tests.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📝</div>
              <p>No tests yet</p>
              <button className="btn btn-primary" onClick={() => setShowCreateTest(true)}>Create First Test</button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {tests.map((t, i) => (
                <div key={t._id} className="anim-card" style={{ ...S.testRow, animationDelay: `${i * 0.06}s` }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <h4 style={{ fontSize: 15 }}>{t.title}</h4>
                      <span className={`badge ${t.status === 'published' ? 'badge-green' : t.status === 'closed' ? 'badge-red' : 'badge-yellow'}`}>
                        {t.status}
                      </span>
                      {t.allowReattempt && <span className="badge badge-blue">🔄 Reattempt</span>}
                    </div>
                    <p style={{ color: 'var(--text3)', fontSize: 12, marginTop: 4 }}>
                      ⏱ {t.duration} min · 🎯 {t.totalMarks} marks · 📝 {t.questions?.length || 0} questions
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Link to={`/teacher/test/${t._id}`} className="btn btn-secondary btn-sm">Manage</Link>
                    <button className="btn btn-danger btn-sm" onClick={() => deleteTest(t._id)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Admit Modal */}
      {showAdmit && (
        <div className="modal-overlay" onClick={() => setShowAdmit(false)}>
          <div className="modal" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Admit Student</h3>
              <button style={S.closeBtn} onClick={() => setShowAdmit(false)}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="input-group">
                <label className="input-label">Select Student</label>
                <select className="input" value={selectedStudent} onChange={e => setSelectedStudent(e.target.value)}>
                  <option value="">-- Choose student --</option>
                  {unadmitted.map(s => <option key={s._id} value={s._id}>{s.name} ({s.email})</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary" onClick={() => setShowAdmit(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={admitStudent} disabled={!selectedStudent}>Admit</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Test Modal */}
      {showCreateTest && (
        <div className="modal-overlay" onClick={() => setShowCreateTest(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Create New Test</h3>
              <button style={S.closeBtn} onClick={() => setShowCreateTest(false)}>✕</button>
            </div>
            <form onSubmit={createTest} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="input-group">
                <label className="input-label">Test Title *</label>
                <input className="input" placeholder="e.g. Midterm Exam" value={testForm.title}
                  onChange={e => setTestForm(f => ({ ...f, title: e.target.value }))} required />
              </div>
              <div className="input-group">
                <label className="input-label">Description</label>
                <textarea className="input" value={testForm.description}
                  onChange={e => setTestForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div className="input-group">
                <label className="input-label">Duration (minutes) *</label>
                <input className="input" type="number" min="5" max="300" value={testForm.duration}
                  onChange={e => setTestForm(f => ({ ...f, duration: e.target.value }))} required />
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreateTest(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create & Configure →</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}

const S = {
  studentRow: { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10 },
  testRow: { display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, flexWrap: 'wrap' },
  closeBtn: { background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6, width: 30, height: 30, color: 'var(--text2)', cursor: 'pointer' }
};