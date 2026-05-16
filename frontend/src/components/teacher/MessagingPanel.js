import React, { useState, useEffect, useRef } from 'react';
import api from '../../utils/api';
import { io } from 'socket.io-client';
import { useAuth } from '../../context/AuthContext';
import Avatar from '../shared/Avatar';
import toast from 'react-hot-toast';

export default function MessagingPanel({ courses }) {
  const { user } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [selectedConv, setSelectedConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMsg, setNewMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const socketRef = useRef(null);
  const endRef = useRef(null);

  // Init course once courses load
  useEffect(() => {
    if (!courses || courses.length === 0) return;
    setSelectedCourse(courses[0]);
  }, [courses]);

  useEffect(() => {
    socketRef.current = io('/', { transports: ['websocket'] });
    return () => socketRef.current?.disconnect();
  }, []);

  useEffect(() => {
    if (!selectedCourse) return;
    fetchConversations(selectedCourse._id);
    setSelectedConv(null);
    setMessages([]);
  }, [selectedCourse]);

  useEffect(() => {
    if (!selectedConv || !selectedCourse) return;
    fetchMessages(selectedConv.student._id);
    const roomId = `${selectedCourse._id}_${[user._id, selectedConv.student._id].sort().join('_')}`;
    socketRef.current?.emit('join_room', roomId);
    socketRef.current?.on('receive_message', (msg) => {
      setMessages(prev => [...prev, msg]);
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    });
    return () => socketRef.current?.off('receive_message');
  }, [selectedConv]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const fetchConversations = async (courseId) => {
    try {
      const res = await api.get(`/messages/students/${courseId}`);
      setConversations(res.data);
    } catch { }
  };

  const fetchMessages = async (studentId) => {
    if (!selectedCourse) return;
    try {
      const res = await api.get(`/messages/conversation/${selectedCourse._id}/${studentId}`);
      setMessages(res.data);
    } catch { }
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!newMsg.trim() || !selectedConv || sending) return;
    setSending(true);
    try {
      const res = await api.post('/messages', {
        course: selectedCourse._id,
        receiver: selectedConv.student._id,
        content: newMsg.trim()
      });
      setMessages(prev => [...prev, res.data]);
      setNewMsg('');
      // Refresh conversation list to update lastMessage
      fetchConversations(selectedCourse._id);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to send');
    } finally { setSending(false); }
  };

  const canReply = selectedConv && messages.some(m =>
    (m.sender?._id || m.sender) === selectedConv.student._id
  );

  if (!courses || courses.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">📚</div>
        <p>Create a course first to receive messages</p>
      </div>
    );
  }

  return (
    <div style={S.container}>
      {/* Sidebar */}
      <div style={S.sidebar}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700 }}>Student Messages</h3>
          {courses.length > 1 && (
            <select className="input" value={selectedCourse?._id || ''}
              onChange={e => {
                const c = courses.find(c => c._id === e.target.value);
                setSelectedCourse(c);
              }}>
              {courses.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
            </select>
          )}
          <div style={S.infoBanner}>
            💬 Students message you first — you can reply to their messages.
          </div>
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>
          {conversations.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text3)', fontSize: 13, lineHeight: 1.6 }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
              No messages yet.<br />Students will appear here when they message you.
            </div>
          ) : (
            conversations.map((conv, i) => (
              <div key={i}
                style={{ ...S.convItem, ...(selectedConv?.student._id === conv.student._id ? S.convActive : {}) }}
                onClick={() => setSelectedConv(conv)}>
                <Avatar user={conv.student} size={36} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {conv.student.name}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {conv.lastMessage?.content}
                  </div>
                </div>
                {conv.unreadCount > 0 && (
                  <div style={S.unreadBadge}>{conv.unreadCount}</div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Chat */}
      <div style={S.chat}>
        {!selectedConv ? (
          <div className="empty-state" style={{ flex: 1 }}>
            <div style={{ fontSize: 48 }}>💬</div>
            <h3>Select a conversation</h3>
            <p style={{ color: 'var(--text3)', fontSize: 13, textAlign: 'center', maxWidth: 260 }}>
              Choose a student from the left panel to read and reply to their messages.
            </p>
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div style={S.chatHeader}>
              <Avatar user={selectedConv.student} size={38} />
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{selectedConv.student.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text3)' }}>{selectedConv.student.email}</div>
              </div>
            </div>

            {/* Messages */}
            <div style={S.messages}>
              {messages.length === 0 && (
                <div style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 13, marginTop: 40 }}>
                  No messages in this conversation yet.
                </div>
              )}
              {messages.map((msg, i) => {
                const isMe = (msg.sender?._id || msg.sender) === user._id;
                const senderUser = isMe ? user : selectedConv.student;
                return (
                  <div key={i} style={{ ...S.msgRow, justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
                    {!isMe && <Avatar user={senderUser} size={28} style={{ flexShrink: 0 }} />}
                    <div style={{ ...S.bubble, ...(isMe ? S.bubbleMe : S.bubbleOther) }}>
                      <p style={{ fontSize: 14, lineHeight: 1.5 }}>{msg.content}</p>
                      <div style={{ fontSize: 10, opacity: 0.6, marginTop: 4, textAlign: isMe ? 'right' : 'left' }}>
                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                    {isMe && <Avatar user={user} size={28} style={{ flexShrink: 0 }} />}
                  </div>
                );
              })}
              <div ref={endRef} />
            </div>

            {/* Reply input */}
            {canReply ? (
              <form onSubmit={sendMessage} style={S.inputRow}>
                <input className="input" style={{ flex: 1 }} placeholder="Type your reply..."
                  value={newMsg} onChange={e => setNewMsg(e.target.value)} />
                <button type="submit" className="btn btn-primary" disabled={!newMsg.trim() || sending}>
                  {sending ? <span className="spinner" /> : 'Reply ↑'}
                </button>
              </form>
            ) : (
              <div style={S.blockedMsg}>
                🔒 You can reply once the student sends a message first.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const S = {
  container: { display: 'flex', height: 'calc(100vh - 160px)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', background: 'var(--bg2)' },
  sidebar: { width: 280, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', flexShrink: 0 },
  infoBanner: { padding: '7px 10px', background: 'var(--blue-dim)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 8, fontSize: 11, color: 'var(--blue)', lineHeight: 1.5 },
  convItem: { display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)', transition: 'background 0.15s' },
  convActive: { background: 'var(--accent-dim)' },
  unreadBadge: { background: 'var(--accent)', color: 'white', borderRadius: '50%', width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 },
  chat: { flex: 1, display: 'flex', flexDirection: 'column' },
  chatHeader: { display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: '1px solid var(--border)' },
  messages: { flex: 1, overflow: 'auto', padding: '18px 16px', display: 'flex', flexDirection: 'column', gap: 10 },
  msgRow: { display: 'flex', alignItems: 'flex-end', gap: 8 },
  bubble: { maxWidth: '68%', padding: '10px 14px', borderRadius: 14 },
  bubbleMe: { background: 'var(--accent)', color: 'white', borderBottomRightRadius: 4 },
  bubbleOther: { background: 'var(--bg3)', color: 'var(--text)', borderBottomLeftRadius: 4 },
  inputRow: { display: 'flex', gap: 10, padding: '12px 14px', borderTop: '1px solid var(--border)' },
  blockedMsg: { padding: '12px 16px', borderTop: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text3)', fontSize: 12, textAlign: 'center' }
};
