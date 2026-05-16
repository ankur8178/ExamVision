import React, { useState, useEffect, useRef } from 'react';
import api from '../../utils/api';
import { io } from 'socket.io-client';
import { useAuth } from '../../context/AuthContext';
import Avatar from '../shared/Avatar';
import toast from 'react-hot-toast';

export default function StudentMessaging({ courses, defaultCourseId, defaultTeacher }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [newMsg, setNewMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [teacher, setTeacher] = useState(defaultTeacher || null);
  const socketRef = useRef(null);
  const endRef = useRef(null);

  // Initialize selected course once courses are available
  useEffect(() => {
    if (!courses || courses.length === 0) return;
    const initial = defaultCourseId
      ? courses.find(c => c._id === defaultCourseId) || courses[0]
      : courses[0];
    setSelectedCourse(initial);
  }, [courses, defaultCourseId]);

  // Update teacher when course changes
  useEffect(() => {
    if (!selectedCourse) return;
    const t = selectedCourse.teacher;
    setTeacher(t);
  }, [selectedCourse]);

  // Socket setup
  useEffect(() => {
    socketRef.current = io('/', { transports: ['websocket'] });
    return () => socketRef.current?.disconnect();
  }, []);

  // Fetch messages & join socket room when course+teacher ready
  useEffect(() => {
    if (!selectedCourse || !teacher) return;
    const tId = teacher._id || teacher;
    fetchMessages(selectedCourse._id, tId);
    const roomId = `${selectedCourse._id}_${[user._id, tId].sort().join('_')}`;
    socketRef.current?.emit('join_room', roomId);
    socketRef.current?.on('receive_message', (msg) => {
      setMessages(prev => [...prev, msg]);
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    });
    return () => socketRef.current?.off('receive_message');
  }, [selectedCourse, teacher]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchMessages = async (courseId, teacherId) => {
    try {
      const res = await api.get(`/messages/conversation/${courseId}/${teacherId}`);
      setMessages(res.data);
    } catch { }
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!newMsg.trim() || !selectedCourse || !teacher || sending) return;
    setSending(true);
    const tId = teacher._id || teacher;
    try {
      const res = await api.post('/messages', {
        course: selectedCourse._id,
        receiver: tId,
        content: newMsg.trim()
      });
      setMessages(prev => [...prev, res.data]);
      setNewMsg('');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to send');
    } finally { setSending(false); }
  };

  if (!courses || courses.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">📚</div>
        <p>Join a course first to message your teacher</p>
      </div>
    );
  }

  const teacherObj = typeof teacher === 'object' ? teacher : null;

  return (
    <div style={S.container}>
      {/* Header */}
      <div style={S.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
          {teacherObj && <Avatar user={teacherObj} size={36} />}
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 700 }}>
              {teacherObj ? teacherObj.name : 'Select a course'}
            </h3>
            {teacherObj && <p style={{ color: 'var(--text3)', fontSize: 12 }}>Teacher</p>}
          </div>
        </div>
        {courses.length > 1 && (
          <select className="input" style={{ width: 'auto', maxWidth: 200 }} value={selectedCourse?._id || ''}
            onChange={e => {
              const c = courses.find(c => c._id === e.target.value);
              setSelectedCourse(c);
              setMessages([]);
            }}>
            {courses.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
          </select>
        )}
      </div>

      {/* Messages */}
      <div style={S.messages}>
        {messages.length === 0 && selectedCourse && (
          <div style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 13, marginTop: 60 }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>💬</div>
            No messages yet. Send a message to your teacher!
          </div>
        )}
        {messages.map((msg, i) => {
          const isMe = (msg.sender?._id || msg.sender) === user._id;
          const senderUser = isMe ? user : teacherObj;
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

      {/* Input */}
      {selectedCourse && teacher ? (
        <form onSubmit={sendMessage} style={S.inputRow}>
          <input className="input" style={{ flex: 1 }} placeholder="Message your teacher..."
            value={newMsg} onChange={e => setNewMsg(e.target.value)} />
          <button type="submit" className="btn btn-primary" disabled={!newMsg.trim() || sending}>
            {sending ? <span className="spinner" /> : 'Send ↑'}
          </button>
        </form>
      ) : (
        <div style={{ padding: 14, borderTop: '1px solid var(--border)', color: 'var(--text3)', fontSize: 13, textAlign: 'center' }}>
          Select a course to message the teacher
        </div>
      )}
    </div>
  );
}

const S = {
  container: { display: 'flex', flexDirection: 'column', height: 'calc(100vh - 160px)', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--border)', gap: 12 },
  messages: { flex: 1, overflow: 'auto', padding: '20px 18px', display: 'flex', flexDirection: 'column', gap: 12 },
  msgRow: { display: 'flex', alignItems: 'flex-end', gap: 8 },
  bubble: { maxWidth: '68%', padding: '10px 14px', borderRadius: 14 },
  bubbleMe: { background: 'var(--accent)', color: 'white', borderBottomRightRadius: 4 },
  bubbleOther: { background: 'var(--bg3)', color: 'var(--text)', borderBottomLeftRadius: 4 },
  inputRow: { display: 'flex', gap: 10, padding: '12px 16px', borderTop: '1px solid var(--border)' }
};
