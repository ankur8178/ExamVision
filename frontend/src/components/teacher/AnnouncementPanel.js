import React, { useState, useEffect, useRef } from 'react';
import api from '../../utils/api';
import socket from '../../utils/socket';
import toast from 'react-hot-toast';

export default function AnnouncementPanel({ courses }) {
  const [announcements,       setAnnouncements]       = useState([]);
  const [globalAnnouncements, setGlobalAnnouncements] = useState([]);
  const [loading,             setLoading]             = useState(true);
  const [showCreate,          setShowCreate]          = useState(false);
  const [form,                setForm]                = useState({ course: '', title: '', content: '' });
  const [submitting,          setSubmitting]          = useState(false);

  // ref so socket handler always sees latest global list
  const globalRef = useRef(globalAnnouncements);
  useEffect(() => { globalRef.current = globalAnnouncements; }, [globalAnnouncements]);

  useEffect(() => {
    fetchAll();
    fetchGlobal();
  }, [courses]);

  // live socket listener — new global announcement from admin
  useEffect(() => {
    const handler = (ann) => {
      setGlobalAnnouncements(prev =>
        prev.some(a => a._id === ann._id) ? prev : [ann, ...prev]
      );
      toast('📢 New admin announcement!', { icon: '🌐' });
    };
    socket.on('new_global_announcement', handler);
    return () => socket.off('new_global_announcement', handler);
  }, []);

  const fetchAll = async () => {
    try {
      const results = await Promise.all(
        courses.map(c =>
          api.get(`/announcements/course/${c._id}`)
            .then(r => r.data)
            .catch(() => [])
        )
      );
      const all = results.flat().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setAnnouncements(all);
    } catch {}
    setLoading(false);
  };

  const fetchGlobal = async () => {
    try {
      const res = await api.get('/announcements/global');
      setGlobalAnnouncements(res.data);
    } catch {}
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await api.post('/announcements', form);
      setAnnouncements(prev => [res.data, ...prev]);
      setForm({ course: '', title: '', content: '' });
      setShowCreate(false);
      toast.success('Announcement posted! All students notified.');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to post');
    }
    setSubmitting(false);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this announcement?')) return;
    try {
      await api.delete(`/announcements/${id}`);
      setAnnouncements(prev => prev.filter(a => a._id !== id));
      toast.success('Announcement deleted');
    } catch {
      toast.error('Failed to delete');
    }
  };

  const timeAgo = (date) => {
    const seconds = Math.floor((Date.now() - new Date(date)) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7)  return `${days}d ago`;
    return new Date(date).toLocaleDateString();
  };

  const totalCount = announcements.length + globalAnnouncements.length;

  return (
    <div>
      {/* ── Header ── */}
      <div style={S.header}>
        <div>
          <h2 style={S.title}>📢 Announcements</h2>
          <p style={S.subtitle}>Post updates to your students across all courses</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
          ＋ New Announcement
        </button>
      </div>

      {/* ── Content ── */}
      {loading ? (
        <div className="empty-state"><div className="spinner" /></div>
      ) : totalCount === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📢</div>
          <h3>No announcements yet</h3>
          <p style={{ color: 'var(--text3)', fontSize: 14 }}>
            Post an announcement to notify all students in a course.
          </p>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            Post Announcement
          </button>
        </div>
      ) : (
        <div style={S.list}>

          {/* ── Global / admin announcements — always on top ── */}
          {globalAnnouncements.length > 0 && (
            <>
              <div style={S.sectionLabel}>📌 Platform-wide (from Admin)</div>
              {globalAnnouncements.map(a => (
                <div key={a._id} style={{ ...S.card, borderLeft: '3px solid #10b981' }}>
                  <div style={S.cardTop}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <span style={S.globalBadge}>🌐 Global — Admin</span>
                      </div>
                      {a.title && <h3 style={S.cardTitle}>{a.title}</h3>}
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--text3)', whiteSpace: 'nowrap', marginLeft: 12 }}>
                      🕐 {timeAgo(a.createdAt)}
                    </span>
                  </div>
                  <p style={S.cardContent}>{a.content}</p>
                  <div style={S.cardMeta}>
                    <span>🔐 {a.postedBy || 'Admin'}</span>
                    <span>{new Date(a.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                  </div>
                </div>
              ))}
            </>
          )}

          {/* ── Course announcements ── */}
          {announcements.length > 0 && (
            <>
              {globalAnnouncements.length > 0 && (
                <div style={S.sectionLabel}>📘 Your Course Announcements</div>
              )}
              {announcements.map(a => (
                <div key={a._id} style={S.card}>
                  <div style={S.cardTop}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={S.cardCourseBadge}>
                        📘 {a.course?.name || 'Unknown Course'}
                      </div>
                      <h3 style={S.cardTitle}>{a.title}</h3>
                    </div>
                    <button
                      style={S.deleteBtn}
                      onClick={() => handleDelete(a._id)}
                      title="Delete announcement"
                    >
                      🗑
                    </button>
                  </div>
                  <p style={S.cardContent}>{a.content}</p>
                  <div style={S.cardMeta}>
                    <span>✍️ {a.teacher?.name}</span>
                    <span>🕐 {timeAgo(a.createdAt)}</span>
                  </div>
                </div>
              ))}
            </>
          )}

        </div>
      )}

      {/* ── Create modal ── */}
      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">📢 New Announcement</h3>
              <button style={S.closeBtn} onClick={() => setShowCreate(false)}>✕</button>
            </div>
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="input-group">
                <label className="input-label">Course *</label>
                <select
                  className="input"
                  value={form.course}
                  onChange={e => setForm({ ...form, course: e.target.value })}
                  required
                  style={{ cursor: 'pointer' }}
                >
                  <option value="">Select a course...</option>
                  {courses.map(c => (
                    <option key={c._id} value={c._id}>
                      {c.name} ({c.code})
                    </option>
                  ))}
                </select>
              </div>
              <div className="input-group">
                <label className="input-label">Title *</label>
                <input
                  className="input"
                  placeholder="e.g. Exam Schedule Update"
                  value={form.title}
                  onChange={e => setForm({ ...form, title: e.target.value })}
                  required
                />
              </div>
              <div className="input-group">
                <label className="input-label">Message *</label>
                <textarea
                  className="input"
                  placeholder="Write your announcement here..."
                  value={form.content}
                  onChange={e => setForm({ ...form, content: e.target.value })}
                  required
                  rows={4}
                  style={{ resize: 'vertical', minHeight: 100 }}
                />
              </div>
              {form.course && (
                <div style={S.previewNote}>
                  📣 This will notify all students enrolled in{' '}
                  <strong>{courses.find(c => c._id === form.course)?.name}</strong>
                  {' '}({courses.find(c => c._id === form.course)?.students?.length || 0} students)
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Posting...' : 'Post Announcement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const S = {
  header: {
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
    marginBottom: 24, flexWrap: 'wrap', gap: 12,
  },
  title: {
    fontSize: 22, fontFamily: 'Syne,sans-serif', fontWeight: 700, margin: 0,
  },
  subtitle: {
    fontSize: 13, color: 'var(--text3)', marginTop: 4,
  },
  sectionLabel: {
    fontSize: 12, fontWeight: 700, color: 'var(--text3)',
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginBottom: 10, marginTop: 8,
  },
  list: {
    display: 'flex', flexDirection: 'column', gap: 14,
  },
  card: {
    background: 'var(--bg2)', border: '1px solid var(--border)',
    borderRadius: 12, padding: '18px 20px',
    transition: 'all 0.15s',
  },
  cardTop: {
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
  },
  globalBadge: {
    background: '#10b98122', color: '#10b981',
    padding: '2px 10px', borderRadius: 99,
    fontSize: 11, fontWeight: 600,
  },
  cardCourseBadge: {
    fontSize: 12, color: 'var(--accent2)', fontWeight: 600, marginBottom: 6,
  },
  cardTitle: {
    fontSize: 16, fontWeight: 700, margin: 0,
  },
  cardContent: {
    fontSize: 14, color: 'var(--text2)', lineHeight: 1.6,
    marginTop: 10, whiteSpace: 'pre-wrap',
  },
  cardMeta: {
    display: 'flex', gap: 16, fontSize: 12, color: 'var(--text3)',
    marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)',
  },
  deleteBtn: {
    background: 'var(--red-dim)', border: '1px solid rgba(239,68,68,0.2)',
    borderRadius: 6, width: 32, height: 32, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 14, flexShrink: 0,
  },
  closeBtn: {
    background: 'var(--bg3)', border: '1px solid var(--border)',
    borderRadius: 6, width: 30, height: 30,
    color: 'var(--text2)', cursor: 'pointer',
  },
  previewNote: {
    padding: '10px 14px', background: 'var(--accent-dim)',
    border: '1px solid var(--accent)', borderRadius: 8,
    fontSize: 13, color: 'var(--accent2)',
  },
};