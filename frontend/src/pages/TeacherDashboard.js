import React, { useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import Layout from '../components/shared/Layout';
import api from '../utils/api';
import socket from '../utils/socket';
import toast from 'react-hot-toast';
import MessagingPanel from '../components/teacher/MessagingPanel';
import AnnouncementPanel from '../components/teacher/AnnouncementPanel';
import { useAuth } from '../context/AuthContext';
import SettingsPage from '../components/shared/SettingsPage';

const RECENT_KEY = 'teacher_recent_courses';

export default function TeacherDashboard() {
  const { user } = useAuth();
  const [courses, setCourses] = useState([]);
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });
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
        res.data.map(c =>
          api.get(`/tests/course/${c._id}`)
            .then(r => r.data.map(t => ({ ...t, courseName: c.name })))
            .catch(() => [])
        )
      );
      setTests(testResults.flat());
    } catch { toast.error('Failed to load courses'); }
    finally { setLoading(false); }
  };

  // ── Helpers ────────────────────────────────────────────────────────
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
      c.code.toLowerCase().includes(search.toLowerCase())
    ), [courses, search]
  );

  const createCourse = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/courses', form);
      setCourses([res.data, ...courses]);
      setForm({ name: '', description: '' });
      setShowCreate(false);
      toast.success('Course created!');
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
  };

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <Layout title={
      activeTab === 'messages'      ? 'Messages'
      : activeTab === 'calendar'    ? 'Calendar'
      : activeTab === 'announcements' ? 'Announcements'
      : activeTab === 'settings'    ? 'Settings'
      : null
    }>
      {activeTab === 'messages' ? (
        loading ? <div className="empty-state"><div className="spinner" /></div>
          : <MessagingPanel courses={courses} />
      ) : activeTab === 'announcements' ? (
        loading ? <div className="empty-state"><div className="spinner" /></div>
          : <AnnouncementPanel courses={courses} />
      ) : activeTab === 'calendar' ? (
        <CalendarView tests={tests} role="teacher" />
      ) : activeTab === 'settings' ? (
        <SettingsPage />
      ) : (
        <>
          {/* ── Welcome banner ── */}
          <div style={S.welcome}>
            <div>
              <div style={S.greeting}>{greeting()},</div>
              <div style={S.userName}>{user?.name} 👋</div>
              <div style={S.userRole}>
                Teacher · {courses.length} course{courses.length !== 1 ? 's' : ''} · {tests.length} test{tests.length !== 1 ? 's' : ''}
              </div>
            </div>
            <button className="btn btn-primary" onClick={() => setShowCreate(true)}>＋ New Course</button>
          </div>

          {/* ── Recently accessed ── */}
          {recentCourses.length > 0 && (
            <div style={{ marginBottom: 28 }}>
              <div style={S.sectionLabel}>Recently accessed</div>
              <div style={S.recentRow}>
                {recentCourses.map(c => (
                  <Link key={c._id} to={`/teacher/course/${c._id}`} style={{ textDecoration: 'none', flex: 1, minWidth: 0 }}
                    onClick={() => trackRecent(c._id)}>
                    <div style={S.recentCard}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 24 }}>📘</span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                          <div style={{ color: 'var(--text3)', fontSize: 12 }}>👥 {c.students?.length || 0} students</div>
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
              placeholder="🔍 Search by name or code..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ maxWidth: 280, fontSize: 13, padding: '7px 12px' }}
            />
          </div>

          {loading ? (
            <div className="empty-state"><div className="spinner" /></div>
          ) : courses.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📚</div>
              <h3>No courses yet</h3>
              <button className="btn btn-primary" onClick={() => setShowCreate(true)}>Create Course</button>
            </div>
          ) : filteredCourses.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">🔍</div>
              <h3>No results for "{search}"</h3>
              <button className="btn btn-secondary btn-sm" onClick={() => setSearch('')}>Clear search</button>
            </div>
          ) : (
            <div style={S.grid}>
              {filteredCourses.map(c => (
                <Link key={c._id} to={`/teacher/course/${c._id}`} style={{ textDecoration: 'none' }}
                  onClick={() => trackRecent(c._id)}>
                  <div style={S.card}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <span style={{ fontSize: 30 }}>📘</span>
                      <span className="badge badge-accent">{c.code}</span>
                    </div>
                    <h3 style={{ fontSize: 17, marginTop: 12 }}>{c.name}</h3>
                    <p style={{ color: 'var(--text3)', fontSize: 13, marginTop: 6 }}>{c.description || 'No description'}</p>
                    <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text3)', fontSize: 13 }}>👥 {c.students?.length || 0}</span>
                      <span style={{ color: 'var(--accent2)', fontSize: 13, fontWeight: 600 }}>View →</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}

      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Create New Course</h3>
              <button style={S.closeBtn} onClick={() => setShowCreate(false)}>✕</button>
            </div>
            <form onSubmit={createCourse} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="input-group">
                <label className="input-label">Course Name *</label>
                <input className="input" placeholder="e.g. Advanced Mathematics" value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div className="input-group">
                <label className="input-label">Description</label>
                <textarea className="input" value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })} />
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}

const S = {
  welcome:      { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28, padding: '20px 24px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, flexWrap: 'wrap', gap: 12 },
  greeting:     { fontSize: 14, color: 'var(--text3)', marginBottom: 2 },
  userName:     { fontSize: 26, fontFamily: 'Syne,sans-serif', fontWeight: 800, color: 'var(--text)' },
  userRole:     { fontSize: 13, color: 'var(--text3)', marginTop: 4 },
  sectionLabel: { fontSize: 12, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  recentRow:    { display: 'flex', gap: 14, flexWrap: 'wrap' },
  recentCard:   { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 16px', background: 'var(--bg2)', border: '1px solid var(--accent-dim)', borderRadius: 10, transition: 'all 0.15s' },
  grid:         { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 18 },
  card:         { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 22, cursor: 'pointer', transition: 'all 0.2s', height: '100%' },
  closeBtn:     { background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6, width: 30, height: 30, color: 'var(--text2)', cursor: 'pointer' },
};

// ── Shared Calendar Component (exported for StudentDashboard) ─────────
export function CalendarView({ tests, role }) {
  const navigate = useNavigate();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [tooltip, setTooltip] = useState(null);

  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); };

  const firstDay = new Date(year, month, 1);
  const lastDay  = new Date(year, month + 1, 0);
  const startDow = (firstDay.getDay() + 6) % 7;
  const totalDays = lastDay.getDate();

  const eventsByDate = {};
  tests.forEach(t => {
    const d = t.startTime ? new Date(t.startTime) : null;
    if (!d) return;
    if (d.getFullYear() === year && d.getMonth() === month) {
      const key = d.getDate();
      if (!eventsByDate[key]) eventsByDate[key] = [];
      eventsByDate[key].push(t);
    }
  });

  const statusColor = (status) => {
    if (status === 'published') return 'var(--accent2)';
    if (status === 'closed')    return 'var(--red)';
    return 'var(--text3)';
  };

  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= totalDays; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const isToday = (d) =>
    d && d === today.getDate() && month === today.getMonth() && year === today.getFullYear();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }} onClick={() => setTooltip(null)}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <button className="btn btn-secondary btn-sm" onClick={prevMonth}>◀ {MONTHS[(month + 11) % 12].slice(0,3)}</button>
        <h2 style={{ fontFamily: 'Syne,sans-serif', fontSize: 20, fontWeight: 700 }}>{MONTHS[month]} {year}</h2>
        <button className="btn btn-secondary btn-sm" onClick={nextMonth}>{MONTHS[(month + 1) % 12].slice(0,3)} ▶</button>
      </div>

      <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', background: 'var(--bg3)' }}>
          {DAYS.map(d => (
            <div key={d} style={{ padding: '10px 0', textAlign: 'center', fontSize: 12, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {d}
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
          {cells.map((day, i) => {
            const events = day ? (eventsByDate[day] || []) : [];
            return (
              <div key={i} style={{
                minHeight: 90, padding: '8px 6px',
                borderTop: '1px solid var(--border)',
                borderRight: (i + 1) % 7 !== 0 ? '1px solid var(--border)' : 'none',
                background: day ? 'var(--bg2)' : 'var(--bg3)',
                position: 'relative',
              }}>
                {day && (
                  <>
                    <div style={{
                      width: 26, height: 26, borderRadius: '50%',
                      background: isToday(day) ? 'var(--accent)' : 'transparent',
                      color: isToday(day) ? 'white' : 'var(--text2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 13, fontWeight: isToday(day) ? 700 : 400, marginBottom: 4,
                    }}>{day}</div>
                    {events.slice(0, 3).map((t, ei) => (
                      <div key={ei}
                        onClick={(e) => {
                          e.stopPropagation();
                          setTooltip(prev => prev?.test._id === t._id ? null : { test: t, x: e.clientX, y: e.clientY });
                        }}
                        style={{
                          fontSize: 11, padding: '2px 6px', borderRadius: 4, marginBottom: 2, cursor: 'pointer',
                          color: statusColor(t.status),
                          background: t.status === 'published' ? 'var(--accent-dim)' : t.status === 'closed' ? 'var(--red-dim)' : 'var(--bg3)',
                          border: `1px solid ${t.status === 'published' ? 'var(--accent-dim)' : t.status === 'closed' ? 'rgba(239,68,68,0.2)' : 'var(--border)'}`,
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>
                        ● {t.title}
                      </div>
                    ))}
                    {events.length > 3 && (
                      <div style={{ fontSize: 10, color: 'var(--text3)', paddingLeft: 4 }}>+{events.length - 3} more</div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, marginTop: 14, flexWrap: 'wrap' }}>
        {[['var(--accent2)', 'var(--accent-dim)', 'Published'], ['var(--red)', 'var(--red-dim)', 'Closed'], ['var(--text3)', 'var(--bg3)', 'Draft']].map(([color, bg, label]) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text3)' }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: bg, border: `1px solid ${color}`, display: 'inline-block' }} />
            {label}
          </div>
        ))}
      </div>

      {tooltip && (
        <div onClick={e => e.stopPropagation()} style={{
          position: 'fixed',
          top:  Math.min(tooltip.y + 10, window.innerHeight - 220),
          left: Math.min(tooltip.x + 10, window.innerWidth  - 280),
          width: 260, background: 'var(--bg2)', border: '1px solid var(--border)',
          borderRadius: 12, padding: 16, zIndex: 9999, boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 14, flex: 1, marginRight: 8 }}>{tooltip.test.title}</div>
            <button onClick={() => setTooltip(null)} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 14 }}>✕</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: 'var(--text2)' }}>
            <div>📘 {tooltip.test.courseName}</div>
            <div>⏱ {tooltip.test.duration} min · 🎯 {tooltip.test.totalMarks} marks</div>
            <div style={{ color: statusColor(tooltip.test.status) }}>
              ● {tooltip.test.status?.charAt(0).toUpperCase() + tooltip.test.status?.slice(1)}
            </div>
            {tooltip.test.startTime && <div style={{ color: 'var(--text3)', fontSize: 12 }}>🕐 {new Date(tooltip.test.startTime).toLocaleString()}</div>}
            {tooltip.test.endTime   && <div style={{ color: 'var(--text3)', fontSize: 12 }}>🏁 {new Date(tooltip.test.endTime).toLocaleString()}</div>}
          </div>
          <button className="btn btn-primary btn-sm"
            style={{ width: '100%', justifyContent: 'center', marginTop: 12 }}
            onClick={() => navigate(role === 'teacher' ? `/teacher/test/${tooltip.test._id}` : `/exam/${tooltip.test._id}`)}>
            {role === 'teacher' ? 'Manage Test →' : 'Go to Exam →'}
          </button>
        </div>
      )}
    </div>
  );
}