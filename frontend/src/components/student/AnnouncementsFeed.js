import React, { useState, useEffect, useRef } from 'react';
import api from '../../utils/api';
import socket from '../../utils/socket';

export default function AnnouncementsFeed({ courses }) {
  const [announcements,       setAnnouncements]       = useState([]);
  const [globalAnnouncements, setGlobalAnnouncements] = useState([]);
  const [loading,             setLoading]             = useState(true);
  const [filter,              setFilter]              = useState('all');

  // keep a ref so the socket listener always sees latest state
  const globalRef = useRef(globalAnnouncements);
  useEffect(() => { globalRef.current = globalAnnouncements; }, [globalAnnouncements]);

  // ── Fetch on mount / course change ────────────────────────────
  useEffect(() => {
    fetchAll();
    fetchGlobal();
  }, [courses]);

  // ── Live socket listener for new global announcements ─────────
  useEffect(() => {
    const handler = (ann) => {
      // prepend only if not already in list (guard against duplicates)
      setGlobalAnnouncements(prev =>
        prev.some(a => a._id === ann._id) ? prev : [ann, ...prev]
      );
    };
    socket.on('new_global_announcement', handler);
    return () => socket.off('new_global_announcement', handler);
  }, []);

  const fetchAll = async () => {
    try {
      const results = await Promise.all(
        courses.map(c =>
          api.get(`/announcements/course/${c._id}`)
            .then(r => r.data.map(a => ({ ...a, _courseName: c.name })))
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

  // Global announcements only show when filter is 'all'
  const filteredCourse  = filter === 'all'
    ? announcements
    : announcements.filter(a => (a.course?._id || a.course) === filter);
  const visibleGlobals  = filter === 'all' ? globalAnnouncements : [];
  const totalVisible    = filteredCourse.length + visibleGlobals.length;

  // ── Helpers ───────────────────────────────────────────────────
  const timeAgo = (date) => {
    const seconds = Math.floor((Date.now() - new Date(date)) / 1000);
    if (seconds < 60)  return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60)  return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24)    return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7)      return `${days}d ago`;
    return new Date(date).toLocaleDateString();
  };

  const formatDate = (date) => {
    const d         = new Date(date);
    const today     = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === today.toDateString())     return 'Today';
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Group course announcements by date
  const grouped = {};
  filteredCourse.forEach(a => {
    const key = formatDate(a.createdAt);
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(a);
  });

  // ── Render ────────────────────────────────────────────────────
  return (
    <div>
      {/* Header */}
      <div style={S.header}>
        <div>
          <h2 style={S.title}>📢 Announcements</h2>
          <p style={S.subtitle}>Updates from your teachers and admin</p>
        </div>
        {courses.length > 1 && (
          <select
            className="input"
            style={{ maxWidth: 220, fontSize: 13, padding: '7px 12px' }}
            value={filter}
            onChange={e => setFilter(e.target.value)}
          >
            <option value="all">All courses</option>
            {courses.map(c => (
              <option key={c._id} value={c._id}>{c.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="empty-state"><div className="spinner" /></div>
      ) : totalVisible === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📢</div>
          <h3>No announcements yet</h3>
          <p style={{ color: 'var(--text3)', fontSize: 14 }}>
            Your teachers will post updates here. Check back soon!
          </p>
        </div>
      ) : (
        <div style={S.timeline}>

          {/* ── Global / admin announcements — always on top ── */}
          {visibleGlobals.length > 0 && (
            <div>
              <div style={S.dateLabel}>📌 Platform Announcements</div>
              {visibleGlobals.map(a => (
                <div key={a._id} style={S.card}>
                  <div style={S.cardLeft}>
                    <div style={{ ...S.dot, background: '#10b981', borderColor: '#10b98133' }} />
                    <div style={S.line} />
                  </div>
                  <div style={{ ...S.cardBody, borderLeft: '3px solid #10b981' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                      <span style={S.globalBadge}>🌐 Global — Admin</span>
                      <span style={{ fontSize: 12, color: 'var(--text3)', marginLeft: 'auto' }}>
                        🕐 {timeAgo(a.createdAt)}
                      </span>
                    </div>
                    {a.title && <h3 style={S.cardTitle}>{a.title}</h3>}
                    <p style={S.cardContent}>{a.content}</p>
                    <div style={S.cardMeta}>
                      <span>🔐 {a.postedBy || 'Admin'}</span>
                      <span>
                        {new Date(a.createdAt).toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric', year: 'numeric',
                        })}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Course announcements grouped by date ── */}
          {Object.entries(grouped).map(([date, items]) => (
            <div key={date}>
              <div style={S.dateLabel}>{date}</div>
              {items.map(a => (
                <div key={a._id} style={S.card}>
                  <div style={S.cardLeft}>
                    <div style={S.dot} />
                    <div style={S.line} />
                  </div>
                  <div style={S.cardBody}>
                    <div style={S.courseBadge}>
                      📘 {a.course?.name || a._courseName}
                    </div>
                    <h3 style={S.cardTitle}>{a.title}</h3>
                    <p style={S.cardContent}>{a.content}</p>
                    <div style={S.cardMeta}>
                      <span>👨‍🏫 {a.teacher?.name || 'Teacher'}</span>
                      <span>🕐 {timeAgo(a.createdAt)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))}

        </div>
      )}
    </div>
  );
}

const S = {
  header:      { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 },
  title:       { fontSize: 22, fontFamily: 'Syne,sans-serif', fontWeight: 700, margin: 0 },
  subtitle:    { fontSize: 13, color: 'var(--text3)', marginTop: 4 },
  timeline:    { display: 'flex', flexDirection: 'column', gap: 0 },
  dateLabel:   { fontSize: 12, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, margin: '20px 0 12px', paddingLeft: 28 },
  card:        { display: 'flex', gap: 0, marginBottom: 2 },
  cardLeft:    { display: 'flex', flexDirection: 'column', alignItems: 'center', width: 28, flexShrink: 0, paddingTop: 6 },
  dot:         { width: 10, height: 10, borderRadius: '50%', background: 'var(--accent)', border: '2px solid var(--accent-dim)', flexShrink: 0 },
  line:        { flex: 1, width: 2, background: 'var(--border)', marginTop: 4 },
  cardBody:    { flex: 1, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px', marginBottom: 8 },
  globalBadge: { background: '#10b98122', color: '#10b981', padding: '2px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600 },
  courseBadge: { fontSize: 12, color: 'var(--accent2)', fontWeight: 600, marginBottom: 6 },
  cardTitle:   { fontSize: 16, fontWeight: 700, margin: 0 },
  cardContent: { fontSize: 14, color: 'var(--text2)', lineHeight: 1.6, marginTop: 8, whiteSpace: 'pre-wrap' },
  cardMeta:    { display: 'flex', gap: 16, fontSize: 12, color: 'var(--text3)', marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)' },
};