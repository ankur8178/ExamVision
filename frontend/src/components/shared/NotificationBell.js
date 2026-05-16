import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../../utils/api';
import socket from '../../utils/socket';
import { useAuth } from '../../context/AuthContext';

export default function NotificationBell({ collapsed }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0 });
  const bellRef = useRef(null);
  const panelRef = useRef(null);

  // Fetch unread count on mount + periodically
  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await api.get('/notifications/unread-count');
      setUnreadCount(res.data.count);
    } catch {}
  }, []);

  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  // Listen for real-time notifications
  useEffect(() => {
    if (!user) return;

    const token = localStorage.getItem('token');
    if (!socket.connected) {
      socket.auth = { token };
      socket.connect();
    }

    const handleNew = (notification) => {
      setNotifications(prev => [notification, ...prev]);
      setUnreadCount(prev => prev + 1);

      // Check user preferences for in-app toasts
      try {
        const notifs = JSON.parse(localStorage.getItem('notif_prefs') || '{}');
        const defaultNotifs = {
          emailOnMessage: true, emailOnResult: true,
          inAppMessage: true, inAppViolation: true,
        };
        const prefs = { ...defaultNotifs, ...notifs };

        if (notification.type === 'message' && prefs.inAppMessage) {
          toast.success(`Message: ${notification.title}`, { icon: '💬' });
        } else if (notification.type === 'violation' && prefs.inAppViolation) {
          toast.error(`Violation: ${notification.title}`, { icon: '⚠️' });
        } else if (notification.type === 'submission') {
          toast.success(`Submission: ${notification.title}`, { icon: '✅' });
        } else if (notification.type === 'announcement') {
          toast(`Announcement: ${notification.title}`, { icon: '📢' });
        } else if (notification.type === 'test_published') {
          toast(`New Test: ${notification.title}`, { icon: '📝' });
        } else if (notification.type === 'test_paused') {
          // Max violations lockout — needs teacher action
          toast.error(`Student Locked Out: ${notification.title}`, { icon: '🔒', duration: 6000 });
        } else if (notification.type === 'student_paused') {
          // Voluntary pause — informational only, no action needed
          toast(`${notification.title}`, { icon: '⏸', duration: 4000 });
        }
      } catch {}
    };

    socket.on('new_notification', handleNew);
    return () => {
      socket.off('new_notification', handleNew);
    };
  }, [user]);

  // Fetch full list when panel opens  +  compute fixed position
  const handleOpen = async () => {
    if (!open && bellRef.current) {
      const rect = bellRef.current.getBoundingClientRect();
      const panelHeight = Math.min(window.innerHeight * 0.7, 500);
      let top = rect.top - panelHeight + rect.height;
      if (top < 10) top = 10;
      setPanelPos({ top, left: rect.right + 8 });
    }
    setOpen(!open);
    if (!open) {
      setLoading(true);
      try {
        const res = await api.get('/notifications');
        setNotifications(res.data);
      } catch {}
      setLoading(false);
    }
  };

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target) &&
        bellRef.current && !bellRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const markAsRead = async (id) => {
    try {
      await api.put(`/notifications/${id}/read`);
      setNotifications(prev => prev.filter(n => n._id !== id));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch {}
  };

  const markAllAsRead = async () => {
    try {
      await api.put('/notifications/read-all');
      setNotifications([]);
      setUnreadCount(0);
    } catch {}
  };

  const handleClick = (notification) => {
    if (!notification.read) markAsRead(notification._id);
    if (notification.link) {
      navigate(notification.link);
      setOpen(false);
    }
  };

  // ── FIXED: handleAction is ONLY called for test_paused (max violations).
  // student_paused (voluntary) never shows these buttons so never calls this.
  const handleAction = async (notifId, attemptId, action) => {
    if (!attemptId) return;
    try {
      if (action === 'resume') {
        await api.put(`/attempts/${attemptId}/resume`);
        toast.success('Test resumed — student has been unlocked.');
      } else {
        await api.post(`/attempts/${attemptId}/teacher-submit`);
        toast.success('Test auto-submitted on behalf of student.');
      }
      markAsRead(notifId);
    } catch {
      toast.error('Action failed. Please try again.');
    }
  };

  const typeIcon = (type) => {
    switch (type) {
      case 'message':       return '💬';
      case 'announcement':  return '📢';
      case 'test_published':return '📝';
      case 'test_paused':   return '🔒';   // max violations — needs action
      case 'student_paused':return '⏸';   // voluntary — info only
      case 'violation':     return '⚠️';
      case 'submission':    return '✅';
      default:              return '🔔';
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
    return `${days}d ago`;
  };

  return (
    <>
      {/* Bell button */}
      <button
        ref={bellRef}
        onClick={handleOpen}
        style={{
          ...S.bellBtn,
          ...(open ? S.bellBtnActive : {}),
          justifyContent: collapsed ? 'center' : 'flex-start',
        }}
        title="Notifications"
      >
        <span style={{ fontSize: 18, flexShrink: 0, position: 'relative' }}>
          🔔
          {unreadCount > 0 && (
            <span style={S.bellBadge}>
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </span>
        {!collapsed && <span style={{ flex: 1 }}>Notifications</span>}
        {!collapsed && unreadCount > 0 && (
          <span style={S.countBadge}>{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
      </button>

      {/* Notification panel — fixed position so it escapes sidebar overflow:hidden */}
      {open && (
        <div
          ref={panelRef}
          style={{
            ...S.panel,
            top: panelPos.top,
            left: panelPos.left,
          }}
        >
          <div style={S.panelHeader}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>Notifications</span>
            {unreadCount > 0 && (
              <button style={S.markAllBtn} onClick={markAllAsRead}>
                Mark all read
              </button>
            )}
          </div>

          <div style={S.panelBody}>
            {loading ? (
              <div style={S.emptyState}>
                <div className="spinner" />
              </div>
            ) : notifications.length === 0 ? (
              <div style={S.emptyState}>
                <span style={{ fontSize: 32 }}>🔕</span>
                <span style={{ color: 'var(--text3)', fontSize: 13 }}>No notifications yet</span>
              </div>
            ) : (
              notifications.map(n => (
                <div
                  key={n._id}
                  style={{
                    ...S.notifItem,
                    background: n.read ? 'transparent' : 'var(--accent-dim)',
                    borderLeft: n.read ? '3px solid transparent' : '3px solid var(--accent)',
                  }}
                  onClick={() => handleClick(n)}
                >
                  <span style={{ fontSize: 20, flexShrink: 0 }}>{typeIcon(n.type)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 13,
                      fontWeight: n.read ? 400 : 600,
                      color: 'var(--text)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {n.title}
                    </div>
                    <div style={{
                      fontSize: 12,
                      color: 'var(--text3)',
                      marginTop: 2,
                    }}>
                      {n.body}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>
                      {timeAgo(n.createdAt)}
                    </div>

                    {/*
                      ── FIXED: Action buttons ONLY for test_paused (max violations lockout).
                      ── student_paused is a voluntary pause — teacher is just informed,
                      ── no action is required or shown.
                    */}
                    {(n.type === 'test_paused' && !n.read) && (
                      <div style={S.actionRow} onClick={e => e.stopPropagation()}>
                        <div style={S.actionLabel}>
                          🔒 Student locked out — choose an action:
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleAction(n._id, n.attemptId, 'resume')}
                          >
                            ▶ Resume Test
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => handleAction(n._id, n.attemptId, 'submit')}
                          >
                            ⏹ Auto Submit
                          </button>
                        </div>
                      </div>
                    )}

                    {/* student_paused: informational only — no action buttons */}
                    {(n.type === 'student_paused' && !n.read) && (
                      <div style={S.infoLabel}>
                        ℹ️ Student paused voluntarily — they can resume themselves.
                      </div>
                    )}
                  </div>
                  {!n.read && <span style={S.unreadDot} />}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </>
  );
}

const S = {
  bellBtn: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '10px 10px', borderRadius: 8,
    color: 'var(--text2)', fontSize: 14, fontWeight: 500,
    background: 'none', border: 'none', cursor: 'pointer',
    transition: 'all 0.15s', whiteSpace: 'nowrap',
    width: '100%', textAlign: 'left',
  },
  bellBtnActive: {
    background: 'var(--accent-dim)', color: 'var(--accent2)',
  },
  bellBadge: {
    position: 'absolute', top: -6, right: -8,
    background: 'var(--red)', color: 'white', borderRadius: '50%',
    minWidth: 16, height: 16,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 9, fontWeight: 700, padding: '0 3px',
  },
  countBadge: {
    background: 'var(--red)', color: 'white', borderRadius: '50%',
    minWidth: 18, height: 18,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 10, fontWeight: 700, padding: '0 3px',
  },
  panel: {
    position: 'fixed', width: 380,
    background: 'var(--bg2)', border: '1px solid var(--border)',
    borderRadius: 14, boxShadow: '0 12px 40px rgba(0,0,0,0.4)',
    zIndex: 99999, overflow: 'hidden',
    display: 'flex', flexDirection: 'column',
    maxHeight: '70vh',
  },
  panelHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 16px', borderBottom: '1px solid var(--border)',
  },
  markAllBtn: {
    background: 'var(--accent-dim)', color: 'var(--accent2)',
    border: '1px solid var(--accent)', borderRadius: 6,
    padding: '4px 10px', fontSize: 11, fontWeight: 600,
    cursor: 'pointer',
  },
  panelBody: {
    overflowY: 'auto', maxHeight: '60vh',
  },
  emptyState: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', gap: 8, padding: '40px 20px',
  },
  notifItem: {
    display: 'flex', alignItems: 'flex-start', gap: 10,
    padding: '12px 16px', cursor: 'pointer',
    borderBottom: '1px solid var(--border)',
    transition: 'background 0.15s',
  },
  unreadDot: {
    width: 8, height: 8, borderRadius: '50%',
    background: 'var(--accent)', flexShrink: 0,
    marginTop: 6,
  },
  actionRow: {
    marginTop: 10,
    padding: '10px 12px',
    background: 'rgba(239,68,68,0.08)',
    border: '1px solid rgba(239,68,68,0.2)',
    borderRadius: 8,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  actionLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: 'var(--red)',
  },
  infoLabel: {
    marginTop: 8,
    padding: '6px 10px',
    background: 'var(--bg3)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    fontSize: 11,
    color: 'var(--text3)',
  },
};