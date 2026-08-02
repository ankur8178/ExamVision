import React, { useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Layout from '../components/shared/Layout';
import api from '../utils/api';
import toast from 'react-hot-toast';
import StudentMessaging from '../components/student/StudentMessaging';
import AnnouncementsFeed from '../components/student/AnnouncementsFeed';
import { CalendarView } from './TeacherDashboard';
import { useAuth } from '../context/AuthContext';
import SettingsPage from '../components/shared/SettingsPage'; // ← ADD THIS

const RECENT_KEY = 'student_recent_courses';

export default function StudentDashboard() {
  const { user } = useAuth();
  const [courses, setCourses] = useState([]);
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showJoin, setShowJoin] = useState(false);
  const [code, setCode] = useState('');
  const [search, setSearch] = useState('');
  const [searchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'courses';

  const [recentIds, setRecentIds] = useState(() => {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; }
  });

  useEffect(() => { fetchCourses(); }, []);

  const fetchCourses = async () => {
    try {
      const res = await api.get('/courses/my');
      setCourses(res.data);
      const testResults = await Promise.all(
        res.data.map(c => api.get(`/tests/course/${c._id}`).then(r => r.data.map(t => ({ ...t, courseName: c.name }))).catch(() => []))
      );
      setTests(testResults.flat());
    } catch { toast.error('Failed to load courses'); }
    finally { setLoading(false); }
  };

  const trackRecent = (courseId) => {
    const updated = [courseId, ...recentIds.filter(id => id !== courseId)].slice(0, 2);
    setRecentIds(updated);
    localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
  };

  const recentCourses = useMemo(() =>
    recentIds.map(id => courses.find(c => c._id === id)).filter(Boolean),
    [recentIds, courses]
  );

  const filteredCourses = useMemo(() =>
    courses.filter(c =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.code.toLowerCase().includes(search.toLowerCase()) ||
      c.teacher?.name?.toLowerCase().includes(search.toLowerCase())
    ), [courses, search]
  );

  const joinCourse = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/courses/join', { code: code.toUpperCase() });
      setCourses(prev => [...prev, res.data]);
      setCode(''); setShowJoin(false);
      toast.success('Joined course!');
    } catch (err) { toast.error(err.response?.data?.message || 'Invalid code'); }
  };

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  // ── Tab title mapping ─────────────────────────────────────────────
  const tabTitle = {
    messages: 'Messages',
    announcements: 'Announcements',
    calendar: 'Calendar',
    settings: 'Settings',
  };

  return (
    <Layout title={tabTitle[activeTab] || null}>

      {/* ── MESSAGES TAB ── */}
      {activeTab === 'messages' ? (
        loading
          ? <div className="empty-state"><div className="spinner" /></div>
          : <StudentMessaging courses={courses} />

      /* ── ANNOUNCEMENTS TAB ── */
      ) : activeTab === 'announcements' ? (
        loading
          ? <div className="empty-state"><div className="spinner" /></div>
          : <AnnouncementsFeed courses={courses} />

      /* ── CALENDAR TAB ── */
      ) : activeTab === 'calendar' ? (
        <CalendarView tests={tests} role="student" />

      /* ── SETTINGS TAB ── */
      ) : activeTab === 'settings' ? (
        <SettingsPage />

      /* ── COURSES TAB (default) ── */
      ) : (
        <>
          {/* ── Welcome banner ── */}
          <div style={S.welcome}>
            <div>
              <div style={S.greeting}>{greeting()},</div>
              <div style={S.userName}>{user?.name} 👋</div>
              <div style={S.userRole}>Student · Enrolled in {courses.length} course{courses.length !== 1 ? 's' : ''}</div>
            </div>
            <button className="btn btn-primary" onClick={() => setShowJoin(true)}>＋ Join Course</button>
          </div>

          {/* ── Recently accessed ── */}
          {recentCourses.length > 0 && (
            <div style={{ marginBottom: 28 }}>
              <div style={S.sectionLabel}>Recently accessed</div>
              <div style={S.recentRow}>
                {recentCourses.map(c => (
                  <Link key={c._id} to={`/student/course/${c._id}`} style={{ textDecoration: 'none', flex: 1, minWidth: 0 }}
                    onClick={() => trackRecent(c._id)}>
                    <div style={S.recentCard}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 24 }}>📘</span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                          <div style={{ color: 'var(--text3)', fontSize: 12 }}>👨‍🏫 {c.teacher?.name}</div>
                        </div>
                      </div>
                      <span className="badge badge-accent" style={{ flexShrink: 0 }}>{c.code}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* ── Search + All courses ── */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
            <div style={S.sectionLabel}>All courses</div>
            <input
              className="input"
              placeholder="🔍 Search by name, code or teacher..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ maxWidth: 300, fontSize: 13, padding: '7px 12px' }}
            />
          </div>

          {loading ? (
            <div style={S.grid}>
              {[1, 2, 3].map(n => (
                <div key={n} className="skeleton" style={{ height: 160, borderRadius: 14 }} />
              ))}
            </div>
          ) : courses.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📚</div>
              <h3>No courses yet</h3>
              <p>Ask your teacher for a course code to join</p>
              <button className="btn btn-primary" onClick={() => setShowJoin(true)}>Join Course</button>
            </div>
          ) : filteredCourses.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">🔍</div>
              <h3>No results for "{search}"</h3>
              <button className="btn btn-secondary btn-sm" onClick={() => setSearch('')}>Clear search</button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 18 }}>
              {filteredCourses.map(c => (
                <Link key={c._id} to={`/student/course/${c._id}`} style={{ textDecoration: 'none' }}
                  onClick={() => trackRecent(c._id)}>
                  <div style={S.card}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <span style={{ fontSize: 30 }}>📘</span>
                      <span className="badge badge-accent">{c.code}</span>
                    </div>
                    <h3 style={{ fontSize: 17, marginTop: 12 }}>{c.name}</h3>
                    <p style={{ color: 'var(--text3)', fontSize: 13, marginTop: 6 }}>{c.description || 'No description'}</p>
                    <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text3)', fontSize: 13 }}>👨‍🏫 {c.teacher?.name}</span>
                      <span style={{ color: 'var(--accent2)', fontSize: 13, fontWeight: 600 }}>View Tests →</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Join Course Modal ── */}
      {showJoin && (
        <div className="modal-overlay" onClick={() => setShowJoin(false)}>
          <div className="modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Join Course</h3>
              <button style={S.closeBtn} onClick={() => setShowJoin(false)}>✕</button>
            </div>
            <form onSubmit={joinCourse} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="input-group">
                <label className="input-label">Course Code</label>
                <input className="input" placeholder="e.g. ABC123" value={code}
                  onChange={e => setCode(e.target.value.toUpperCase())} maxLength={6} required
                  style={{ fontSize: 22, letterSpacing: 5, textAlign: 'center', fontWeight: 700 }} />
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowJoin(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Join</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}

const S = {
  welcome: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28, padding: '20px 24px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, flexWrap: 'wrap', gap: 12 },
  greeting: { fontSize: 14, color: 'var(--text3)', marginBottom: 2 },
  userName: { fontSize: 26, fontFamily: 'Syne,sans-serif', fontWeight: 800, color: 'var(--text)' },
  userRole: { fontSize: 13, color: 'var(--text3)', marginTop: 4 },
  sectionLabel: { fontSize: 12, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  recentRow: { display: 'flex', gap: 14, flexWrap: 'wrap' },
  recentCard: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 16px', background: 'var(--bg2)', border: '1px solid var(--accent-dim)', borderRadius: 10, transition: 'all 0.15s' },
  card: { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 22, cursor: 'pointer', transition: 'all 0.2s', height: '100%' },
  closeBtn: { background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6, width: 30, height: 30, color: 'var(--text2)', cursor: 'pointer' },
};