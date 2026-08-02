import React, { useEffect, useRef, useState, useCallback } from 'react';
import socket from '../../utils/socket';
import toast from 'react-hot-toast';

const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
  iceTransportPolicy: 'all',
};

const getApiBaseUrl = () => {
  if (process.env.REACT_APP_API_URL) {
    return process.env.REACT_APP_API_URL.replace(/\/api\/?$/, '');
  }
  return 'http://localhost:5001';
};
const API_BASE = getApiBaseUrl();

// ─────────────────────────────────────────────────────────────────────
// ExpandedView — fullscreen view of one student
// ─────────────────────────────────────────────────────────────────────
function ExpandedView({ student, onClose }) {
  return (
    <div style={S.expandedOverlay}>
      <div style={S.expandedHeader}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ ...S.onlineDot, background: '#22c55e', boxShadow: '0 0 5px #22c55e' }} />
          <span style={{ fontWeight: 800, fontSize: 16, color: 'var(--text)' }}>{student.studentName}</span>
          <span style={S.liveChip}>
            <span style={S.livePulse} />
            LIVE
          </span>
        </div>
        <button style={S.closeBtn} onClick={onClose}>✕ Close Fullscreen</button>
      </div>
      <div style={S.expandedBody}>
        <div style={S.expandedFeed}>
          <div style={S.feedLabel}><span>🖥</span><span>Screen</span></div>
          <div style={{ flex: 1, background: '#080c14', borderRadius: 12, overflow: 'hidden' }}>
            <video
              autoPlay playsInline muted
              style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
              ref={el => { if (el && student._screenStreamRef?.current) el.srcObject = student._screenStreamRef.current; }}
            />
          </div>
        </div>
        <div style={S.expandedFeed}>
          <div style={S.feedLabel}><span>📷</span><span>Camera</span></div>
          <div style={{ flex: 1, background: '#080c14', borderRadius: 12, overflow: 'hidden' }}>
            <video
              autoPlay playsInline muted
              style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
              ref={el => { if (el && student._cameraStreamRef?.current) el.srcObject = student._cameraStreamRef.current; }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// StudentTile
// ─────────────────────────────────────────────────────────────────────
function StudentTile({ student, onDismiss, isRecording, onToggleRecord, onExpand }) {
  const screenRef = useRef(null);
  const cameraRef = useRef(null);
  const peerRef   = useRef(null); // single peer per student (combined stream)
  const mountedRef     = useRef(true);
  const retryTimerRef  = useRef(null);

  const [screenActive, setScreenActive] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);

  const screenStreamRef = useRef(null);
  const cameraStreamRef = useRef(null);

  useEffect(() => {
    student._screenStreamRef = screenStreamRef;
    student._cameraStreamRef = cameraStreamRef;
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    // ─────────────────────────────────────────────────────────────────
    // makeReceiver: creates ONE peer that receives BOTH streams.
    // The student sends screen tracks in a MediaStream with id='screen'
    // and camera tracks in a MediaStream with id='camera'.
    // We identify which is which via stream.id in ontrack.
    // ─────────────────────────────────────────────────────────────────
    const makeReceiver = () => {
      // Null handlers before closing old peer — prevents stale events
      if (peerRef.current) {
        peerRef.current.ontrack                 = null;
        peerRef.current.onicecandidate          = null;
        peerRef.current.onconnectionstatechange = null;
        peerRef.current.close();
        peerRef.current = null;
      }

      const peer = new RTCPeerConnection(ICE_CONFIG);
      peerRef.current = peer;

      peer.ontrack = ({ streams }) => {
        if (!mountedRef.current) return;
        streams.forEach(stream => {
          console.log('[LiveMonitor] ontrack stream.id:', stream.id, 'tracks:', stream.getTracks().map(t => t.kind));

          // ── Identify by stream.id set on the student side ────────────
          if (stream.id === 'screen') {
            if (screenRef.current) screenRef.current.srcObject = stream;
            screenStreamRef.current = stream;
            setScreenActive(true);
            console.log('[LiveMonitor] Screen stream received ✅');
          } else if (stream.id === 'camera') {
            if (cameraRef.current) cameraRef.current.srcObject = stream;
            cameraStreamRef.current = stream;
            setCameraActive(true);
            console.log('[LiveMonitor] Camera stream received ✅');
          } else {
            // Fallback: identify by track type if id didn't come through
            const hasVideo = stream.getVideoTracks().length > 0;
            const hasAudio = stream.getAudioTracks().length > 0;

            // Screen share = video only (no audio track in our setup)
            // Camera = has audio tracks OR multiple track types
            if (hasVideo && !hasAudio && !screenStreamRef.current) {
              if (screenRef.current) screenRef.current.srcObject = stream;
              screenStreamRef.current = stream;
              setScreenActive(true);
              console.log('[LiveMonitor] Screen stream received (fallback) ✅');
            } else {
              if (cameraRef.current) cameraRef.current.srcObject = stream;
              cameraStreamRef.current = stream;
              setCameraActive(true);
              console.log('[LiveMonitor] Camera stream received (fallback) ✅');
            }
          }
        });
      };

      peer.onicecandidate = ({ candidate }) => {
        if (candidate)
          socket.emit('webrtc:ice', { to: student.socketId, candidate });
      };

      peer.onconnectionstatechange = () => {
        if (!mountedRef.current) return;
        console.log('[LiveMonitor] peer state:', peer.connectionState, student.studentName);

        const dead = ['disconnected', 'failed', 'closed'];
        if (dead.includes(peer.connectionState)) {
          if (!mountedRef.current) return;
          if (peer.connectionState !== 'closed') {
            setScreenActive(false);
            setCameraActive(false);
          }
          if (peer.connectionState === 'closed') return;

          // Re-request stream from student
          if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
          retryTimerRef.current = setTimeout(() => {
            if (!mountedRef.current) return;
            console.log('[LiveMonitor] Re-requesting stream after peer failure:', student.studentName);
            socket.emit('teacher:watch', { studentSocketId: student.socketId });
          }, 2000);
        }
      };

      return peer;
    };

    // ── Handle incoming offer from student ────────────────────────────────
    const onOffer = async ({ from, offer, streamType }) => {
      if (from !== student.socketId) return;
      console.log('[LiveMonitor] Offer received from student, streamType:', streamType);

      const peer = makeReceiver();
      try {
        await peer.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        // No streamType needed in answer since it's now always combined
        socket.emit('webrtc:answer', { to: from, answer, streamType });
        console.log('[LiveMonitor] Answer sent to student');
      } catch (e) {
        console.warn('[LiveMonitor] Answer error:', e);
      }
    };

    const onIce = async ({ from, candidate }) => {
      if (from !== student.socketId) return;
      if (!peerRef.current) return;
      try {
        await peerRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (_) {}
    };

    socket.on('webrtc:offer', onOffer);
    socket.on('webrtc:ice',   onIce);

    // Request streams from student on mount
    socket.emit('teacher:watch', { studentSocketId: student.socketId });

    return () => {
      socket.off('webrtc:offer', onOffer);
      socket.off('webrtc:ice',   onIce);

      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);

      if (peerRef.current) {
        peerRef.current.ontrack                 = null;
        peerRef.current.onicecandidate          = null;
        peerRef.current.onconnectionstatechange = null;
        peerRef.current.close();
        peerRef.current = null;
      }
    };
  }, [student.socketId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={S.tile}>
      <div style={S.tileHeader}>
        <div style={S.tileTitle}>
          <span style={{ ...S.onlineDot, background: '#22c55e', boxShadow: '0 0 5px #22c55e' }} />
          <span style={S.studentName}>{student.studentName}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            style={{ ...S.recBtn, ...(isRecording ? S.recBtnActive : {}) }}
            onClick={() => onToggleRecord(student)}
            title={isRecording ? 'Stop recording' : 'Start recording'}
          >
            {isRecording && <span style={S.recPulse} />}
            {isRecording ? '⏹ Stop' : '⏺ Rec'}
          </button>
          <button style={S.expandBtn} onClick={() => onExpand(student)} title="Expand to fullscreen">⛶</button>
          <button style={S.dismissBtn} onClick={() => onDismiss(student.socketId)} title="Hide this student">✕</button>
        </div>
      </div>

      <div style={{ ...S.feedsRow, cursor: 'pointer' }} onClick={() => onExpand(student)}>
        <div style={S.feedBox}>
          <div style={S.feedLabel}>
            <span>🖥</span><span>Screen</span>
            <span style={{ ...S.statusPip, background: screenActive ? '#22c55e' : '#475569' }} />
          </div>
          <div style={S.videoWrap}>
            <video ref={screenRef} autoPlay playsInline muted style={S.video} />
            {!screenActive && (
              <div style={S.videoOverlay}>
                <span style={{ fontSize: 22, marginBottom: 6 }}>🖥</span>
                <span>Waiting for screen...</span>
              </div>
            )}
          </div>
        </div>

        <div style={S.feedBox}>
          <div style={S.feedLabel}>
            <span>📷</span><span>Camera</span>
            <span style={{ ...S.statusPip, background: cameraActive ? '#22c55e' : '#475569' }} />
          </div>
          <div style={S.videoWrap}>
            <video ref={cameraRef} autoPlay playsInline muted style={S.video} />
            {!cameraActive && (
              <div style={S.videoOverlay}>
                <span style={{ fontSize: 22, marginBottom: 6 }}>📷</span>
                <span>Waiting for camera...</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {isRecording && (
        <div style={S.recIndicator}>
          <span style={S.recDot} />
          <span>Recording in progress...</span>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// LiveMonitorDashboard
// ─────────────────────────────────────────────────────────────────────
export default function LiveMonitorDashboard({ testId, onClose }) {
  const [students,  setStudents]  = useState([]);
  const [dismissed, setDismissed] = useState(new Set());
  const [recordingStudents, setRecordingStudents] = useState(new Map());
  const [recordAll, setRecordAll] = useState(false);
  const [studentAttempts, setStudentAttempts] = useState({});
  const [expandedStudent, setExpandedStudent] = useState(null);

  useEffect(() => {
    const joinRoom = () => socket.emit('teacher:join', { testId });

    const onStudentsList  = (list) => setStudents(list);
    const onStudentJoined = (s) =>
      setStudents(prev => prev.find(x => x.socketId === s.socketId) ? prev : [...prev, s]);
    const onStudentLeft   = ({ socketId }) => {
      stopRecordingForStudent(socketId);
      setStudents(prev => prev.filter(s => s.socketId !== socketId));
      setExpandedStudent(prev => prev?.socketId === socketId ? null : prev);
    };

    socket.on('students:list',  onStudentsList);
    socket.on('student:joined', onStudentJoined);
    socket.on('student:left',   onStudentLeft);

    if (socket.connected) joinRoom();
    else { socket.once('connect', joinRoom); socket.connect(); }

    return () => {
      socket.off('students:list',  onStudentsList);
      socket.off('student:joined', onStudentJoined);
      socket.off('student:left',   onStudentLeft);
      socket.off('connect',        joinRoom);
    };
  }, [testId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const fetchAttempts = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_BASE}/api/attempts/test/${testId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          const mapping = {};
          data.forEach(a => { if (a.student?._id) mapping[a.student._id] = a._id; });
          setStudentAttempts(mapping);
        }
      } catch (err) { console.warn('[LiveMonitor] Failed to fetch attempts:', err); }
    };
    fetchAttempts();
    const interval = setInterval(fetchAttempts, 15000);
    return () => clearInterval(interval);
  }, [testId]);

  const startRecordingForStudent = useCallback((student) => {
    const screenStream = student._screenStreamRef?.current;
    const cameraStream = student._cameraStreamRef?.current;
    if (!screenStream && !cameraStream) { toast.error(`No streams available for ${student.studentName}`); return; }

    const recData = { screenChunks: [], cameraChunks: [] };
    if (screenStream) {
      try {
        const recorder = new MediaRecorder(screenStream, { mimeType: 'video/webm;codecs=vp8' });
        recorder.ondataavailable = (e) => { if (e.data.size > 0) recData.screenChunks.push(e.data); };
        recorder.start(1000);
        recData.screenRecorder = recorder;
      } catch (err) { console.warn('[LiveMonitor] Screen MediaRecorder failed:', err); }
    }
    if (cameraStream) {
      try {
        const recorder = new MediaRecorder(cameraStream, { mimeType: 'video/webm;codecs=vp8' });
        recorder.ondataavailable = (e) => { if (e.data.size > 0) recData.cameraChunks.push(e.data); };
        recorder.start(1000);
        recData.cameraRecorder = recorder;
      } catch (err) { console.warn('[LiveMonitor] Camera MediaRecorder failed:', err); }
    }
    setRecordingStudents(prev => { const next = new Map(prev); next.set(student.socketId, recData); return next; });
    toast.success(`Recording started for ${student.studentName}`);
  }, []);

  const stopRecordingForStudent = useCallback((socketId) => {
    setRecordingStudents(prev => {
      const next = new Map(prev);
      const recData = next.get(socketId);
      if (!recData) return next;

      const stopAndUpload = async () => {
        let screenBlob = null;
        let cameraBlob = null;
        if (recData.screenRecorder && recData.screenRecorder.state !== 'inactive') {
          recData.screenRecorder.stop();
          await new Promise(r => { recData.screenRecorder.onstop = r; });
          if (recData.screenChunks.length > 0) screenBlob = new Blob(recData.screenChunks, { type: 'video/webm' });
        }
        if (recData.cameraRecorder && recData.cameraRecorder.state !== 'inactive') {
          recData.cameraRecorder.stop();
          await new Promise(r => { recData.cameraRecorder.onstop = r; });
          if (recData.cameraChunks.length > 0) cameraBlob = new Blob(recData.cameraChunks, { type: 'video/webm' });
        }
        if (!screenBlob && !cameraBlob) return;

        const student   = students.find(s => s.socketId === socketId);
        const attemptId = student ? studentAttempts[student.studentId] : null;

        if (!attemptId) {
          toast.error('Could not find attempt. Recording saved locally.');
          if (screenBlob) downloadBlob(screenBlob, `teacher_screen_${student?.studentName || 'unknown'}.webm`);
          if (cameraBlob) downloadBlob(cameraBlob, `teacher_camera_${student?.studentName || 'unknown'}.webm`);
          return;
        }
        const formData = new FormData();
        if (screenBlob) formData.append('screen', screenBlob, `teacher_screen_${attemptId}.webm`);
        if (cameraBlob) formData.append('camera', cameraBlob, `teacher_camera_${attemptId}.webm`);
        try {
          const token = localStorage.getItem('token');
          const res = await fetch(`${API_BASE}/api/recordings/${attemptId}/teacher`, {
            method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData,
          });
          if (res.ok) toast.success(`Recording uploaded for ${student?.studentName}`);
          else throw new Error(`Upload failed: ${res.status}`);
        } catch (err) {
          console.error('[LiveMonitor] Upload failed:', err);
          toast.error('Upload failed. Downloading locally...');
          if (screenBlob) downloadBlob(screenBlob, `teacher_screen_${student?.studentName || 'unknown'}.webm`);
          if (cameraBlob) downloadBlob(cameraBlob, `teacher_camera_${student?.studentName || 'unknown'}.webm`);
        }
      };
      stopAndUpload();
      next.delete(socketId);
      return next;
    });
  }, [students, studentAttempts]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleRecord = useCallback((student) => {
    if (recordingStudents.has(student.socketId)) {
      stopRecordingForStudent(student.socketId);
      toast.success(`Recording stopped for ${student.studentName}`);
    } else {
      startRecordingForStudent(student);
    }
  }, [recordingStudents, startRecordingForStudent, stopRecordingForStudent]);

  const toggleRecordAll = useCallback(() => {
    if (recordAll) {
      students.forEach(s => { if (recordingStudents.has(s.socketId)) stopRecordingForStudent(s.socketId); });
      setRecordAll(false);
      toast.success('Stopped recording all students');
    } else {
      students.forEach(s => { if (!recordingStudents.has(s.socketId)) startRecordingForStudent(s); });
      setRecordAll(true);
      toast.success('Started recording all students');
    }
  }, [recordAll, students, recordingStudents, startRecordingForStudent, stopRecordingForStudent]);

  const dismiss  = useCallback((socketId) => setDismissed(prev => new Set([...prev, socketId])), []);
  const showAll  = () => setDismissed(new Set());
  const visible  = students.filter(s => !dismissed.has(s.socketId));
  const activeRecCount = recordingStudents.size;

  return (
    <div style={S.overlay}>
      {expandedStudent && <ExpandedView student={expandedStudent} onClose={() => setExpandedStudent(null)} />}

      <div style={S.header}>
        <div style={S.headerLeft}>
          <div style={S.headerIcon}>🎥</div>
          <div>
            <div style={S.headerTitle}>Live Monitor</div>
            <div style={S.headerMeta}>
              <span style={S.liveChip}><span style={S.livePulse} />LIVE</span>
              <span style={{ color: 'var(--text3)', fontSize: 13 }}>
                {students.length} student{students.length !== 1 ? 's' : ''} in exam
              </span>
              {activeRecCount > 0 && (
                <span style={{ color: '#ef4444', fontSize: 13, fontWeight: 700 }}>· ⏺ {activeRecCount} recording</span>
              )}
              {dismissed.size > 0 && (
                <span style={{ color: 'var(--text3)', fontSize: 13 }}>· {dismissed.size} hidden</span>
              )}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {students.length > 0 && (
            <button style={{ ...S.recAllBtn, ...(recordAll ? S.recAllBtnActive : {}) }} onClick={toggleRecordAll}>
              {recordAll ? (<><span style={S.recPulse} /> ⏹ Stop All</>) : '⏺ Record All'}
            </button>
          )}
          {dismissed.size > 0 && (
            <button style={S.showAllBtn} onClick={showAll}>Show All ({dismissed.size})</button>
          )}
          <button style={S.closeBtn} onClick={onClose}>✕ Exit Monitor</button>
        </div>
      </div>

      {visible.length === 0 ? (
        <div style={S.emptyState}>
          <div style={{ fontSize: 52, marginBottom: 14 }}>👁</div>
          <div style={{ color: 'var(--text2)', fontSize: 17, fontWeight: 700 }}>
            {students.length === 0 ? 'Waiting for students to join...' : 'All students hidden from view'}
          </div>
          <div style={{ color: 'var(--text3)', fontSize: 13, marginTop: 8, maxWidth: 340, textAlign: 'center', lineHeight: 1.6 }}>
            {students.length === 0
              ? 'Students will appear here automatically once they start the exam.'
              : 'Click "Show All" to bring them back.'}
          </div>
        </div>
      ) : (
        <div style={S.grid}>
          {visible.map(s => (
            <StudentTile
              key={s.socketId}
              student={s}
              onDismiss={dismiss}
              isRecording={recordingStudents.has(s.socketId)}
              onToggleRecord={toggleRecord}
              onExpand={setExpandedStudent}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

const S = {
  overlay:         { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100vh', background: 'var(--bg)', zIndex: 2000, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  header:          { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 24px', background: 'var(--bg2)', borderBottom: '1px solid var(--border)', flexShrink: 0 },
  headerLeft:      { display: 'flex', alignItems: 'center', gap: 14 },
  headerIcon:      { fontSize: 26 },
  headerTitle:     { fontSize: 17, fontWeight: 800, color: 'var(--text)' },
  headerMeta:      { display: 'flex', alignItems: 'center', gap: 10, marginTop: 3 },
  liveChip:        { display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 700, letterSpacing: 0.5 },
  livePulse:       { width: 7, height: 7, borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 5px #ef4444', display: 'inline-block' },
  closeBtn:        { background: 'var(--bg3)', color: 'var(--text2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600 },
  showAllBtn:      { background: 'var(--accent-dim)', color: 'var(--accent2)', border: '1px solid var(--accent)', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600 },
  recAllBtn:       { display: 'flex', alignItems: 'center', gap: 7, background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 700, transition: 'all 0.2s' },
  recAllBtnActive: { background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.5)', boxShadow: '0 0 12px rgba(239,68,68,0.2)' },
  emptyState:      { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' },
  grid:            { flex: 1, overflowY: 'auto', padding: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(480px, 1fr))', gap: 16, alignContent: 'start', width: '100%', boxSizing: 'border-box' },
  tile:            { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column' },
  tileHeader:      { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg3)', borderBottom: '1px solid var(--border)' },
  tileTitle:       { display: 'flex', alignItems: 'center', gap: 8 },
  onlineDot:       { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  studentName:     { fontWeight: 700, fontSize: 14, color: 'var(--text)' },
  dismissBtn:      { background: 'transparent', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 14, padding: '2px 6px', borderRadius: 4, lineHeight: 1 },
  expandBtn:       { background: 'transparent', border: '1px solid var(--border)', color: 'var(--text2)', cursor: 'pointer', fontSize: 14, padding: '2px 8px', borderRadius: 4, lineHeight: 1 },
  recBtn:          { display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(239,68,68,0.08)', color: '#94a3b8', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 11, fontWeight: 700, transition: 'all 0.2s' },
  recBtnActive:    { background: 'rgba(239,68,68,0.2)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.4)', boxShadow: '0 0 8px rgba(239,68,68,0.15)' },
  recPulse:        { width: 7, height: 7, borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 5px #ef4444', display: 'inline-block', animation: 'pulse 1.5s infinite' },
  feedsRow:        { display: 'flex', gap: 10, padding: 12, flex: 1 },
  feedBox:         { flex: 1, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 },
  feedLabel:       { display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 },
  statusPip:       { width: 6, height: 6, borderRadius: '50%', marginLeft: 'auto', flexShrink: 0 },
  videoWrap:       { position: 'relative', width: '100%', aspectRatio: '16/9', background: '#080c14', borderRadius: 8, overflow: 'hidden', minHeight: 120 },
  video:           { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  videoOverlay:    { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#334155', fontSize: 12, fontWeight: 500, gap: 4 },
  recIndicator:    { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', background: 'rgba(239,68,68,0.08)', borderTop: '1px solid rgba(239,68,68,0.15)', color: '#ef4444', fontSize: 11, fontWeight: 600 },
  recDot:          { width: 8, height: 8, borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 6px #ef4444', flexShrink: 0, animation: 'pulse 1.5s infinite' },
  expandedOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100vh', background: 'var(--bg)', zIndex: 3000, display: 'flex', flexDirection: 'column' },
  expandedHeader:  { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 24px', background: 'var(--bg2)', borderBottom: '1px solid var(--border)', flexShrink: 0 },
  expandedBody:    { flex: 1, display: 'flex', gap: 16, padding: 20, overflow: 'hidden' },
  expandedFeed:    { flex: 1, display: 'flex', flexDirection: 'column', gap: 10 },
};