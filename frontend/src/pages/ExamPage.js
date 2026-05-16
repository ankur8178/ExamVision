import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../utils/api';
import socket from '../utils/socket';
import { uploadRecordingsToServer, deleteOldLocalRecording } from '../utils/recordingStorage';
import toast from 'react-hot-toast';
import SubmitCelebration from '../components/shared/SubmitCelebration';
import AILiveMonitor from '../components/student/AILiveMonitor';
import { useAuth } from '../context/AuthContext';
import useProctoring from '../hooks/useProctoring';

export default function ExamPage() {
  const { testId } = useParams();
  const navigate   = useNavigate();
  const { user }   = useAuth();

  const [test, setTest]                     = useState(null);
  const [questions, setQuestions]           = useState([]);
  const [attempt, setAttempt]               = useState(null);
  const [answers, setAnswers]               = useState({});
  const [currentIdx, setCurrentIdx]         = useState(0);
  const [timeLeft, setTimeLeft]             = useState(0);
  const [questionTimeSpent, setQuestionTimeSpent] = useState({});
  const [violationCount, setViolationCount] = useState(0);
  const [phase, setPhase]                   = useState('loading');
  const [submitting, setSubmitting]         = useState(false);
  const [warningMsg, setWarningMsg]         = useState('');
  const [screenStream, setScreenStream]     = useState(null);
  const [cameraStream, setCameraStream]     = useState(null);
  const [submitModalOpen, setSubmitModalOpen] = useState(false);
  const [pauseModalOpen, setPauseModalOpen]   = useState(false);
  const [fsViolationActive, setFsViolationActive] = useState(false);

  const cameraVideoRef    = useRef(null);
  const screenRecorderRef = useRef(null);
  const cameraRecorderRef = useRef(null);
  const screenChunksRef   = useRef([]);
  const cameraChunksRef   = useRef([]);

  const timerRef        = useRef(null);
  const attemptRef      = useRef(null);
  const securityRef     = useRef({});
  const maxViolRef      = useRef(3);
  const submittingRef   = useRef(false);
  const phaseRef        = useRef('loading');
  const confirmOpenRef  = useRef(false);
  const warningTimerRef = useRef(null);

  // ── FIX: Per-question time tracking uses refs to avoid stale closure bugs ──
  // questionStartTimeRef[qId] = timestamp (ms) when student arrived at question
  // questionTimeSpentRef[qId] = total accumulated seconds (survives re-renders)
  const questionStartTimeRef = useRef({});   // { [qId]: Date.now() }
  const questionTimeSpentRef = useRef({});   // { [qId]: totalSeconds }

  // ── FIX: holds live stream objects so stopAllStreams always reaches them ──
  const streamsRef = useRef({ screen: null, camera: null });

  // ── FIX: central stream killer ────────────────────────────────────────────
  const stopAllStreams = useCallback(() => {
    const { screen, camera } = streamsRef.current;
    [screen, camera].forEach(s => {
      if (s) {
        s.getTracks().forEach(t => {
          try { t.stop(); } catch (_) {}
          t.enabled = false;
        });
      }
    });
    streamsRef.current = { screen: null, camera: null };
    setScreenStream(null);
    setCameraStream(null);
  }, []);

  // ── Keep refs in sync ─────────────────────────────────────────────────────
  useEffect(() => { attemptRef.current = attempt; },      [attempt]);
  useEffect(() => { phaseRef.current   = phase;   },      [phase]);
  useEffect(() => { confirmOpenRef.current = submitModalOpen || pauseModalOpen; }, [submitModalOpen, pauseModalOpen]);

  // ── Live proctoring (WebRTC to teacher) ───────────────────────────────────
  useProctoring({
    testId,
    studentId:   user?._id,
    studentName: user?.name,
    enabled:     (phase === 'exam' || phase === 'loading_ai') &&(!!screenStream || !!cameraStream),
    screenStream,
    cameraStream,
  });

  // ── Socket: teacher resume + beforeunload guard ───────────────────────────
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!socket.connected && token) {
      socket.auth = { token };
      socket.connect();
    }

    const handleBeforeUnload = (e) => {
      if (phaseRef.current === 'exam' || phaseRef.current === 'paused') {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    const handleResume = ({ attemptId }) => {
      if (
        attemptRef.current &&
        attemptRef.current._id === attemptId &&
        phaseRef.current === 'paused'
      ) {
        toast.success('Teacher resumed your test!');
        setViolationCount(0);
        setPhase('exam');
      }
    };
    socket.on('test_resumed', handleResume);

    return () => {
      socket.off('test_resumed', handleResume);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  // ── Load exam data ────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const tRes = await api.get(`/tests/${testId}`);
        const t    = tRes.data;
        setTest(t);
        securityRef.current = t.security || {};
        maxViolRef.current  = t.security?.maxTabSwitches || 3;

        const qRes = await api.get(`/questions/test/${testId}`);
        const aRes = await api.post('/attempts/start', { testId });
        const att  = aRes.data;
        setAttempt(att);

        let orderedQ = qRes.data;
        if (att.questionOrder?.length) {
          const orderMap = {};
          att.questionOrder.forEach((id, i) => { orderMap[id.toString()] = i; });
          orderedQ = [...qRes.data].sort(
            (a, b) => (orderMap[a._id] ?? 0) - (orderMap[b._id] ?? 0)
          );
        }
        setQuestions(orderedQ);

        // FIX: restore previously saved timeSpent values from the attempt
        // so that refreshing the page doesn't lose accumulated time
        const restoredTimeSpent = {};
        att.answers?.forEach(a => {
          if (a.question && (a.timeSpent || 0) > 0) {
            const qId = a.question._id || a.question;
            restoredTimeSpent[qId.toString()] = a.timeSpent;
          }
        });
        questionTimeSpentRef.current = restoredTimeSpent;
        setQuestionTimeSpent(restoredTimeSpent);

        const savedAnswers = {};
        att.answers?.forEach(a => { if (a.answer) savedAnswers[a.question] = a.answer; });
        setAnswers(savedAnswers);

        if (['student_paused', 'paused'].includes(att.status) && att.usedTimeSeconds) {
          setTimeLeft(Math.max(0, t.duration * 60 - att.usedTimeSeconds));
        } else if (att.status === 'in_progress' && att.startTime) {
          const elapsed = Math.floor((Date.now() - new Date(att.startTime).getTime()) / 1000);
          setTimeLeft(Math.max(0, t.duration * 60 - elapsed));
        } else {
          setTimeLeft(t.duration * 60);
        }
        setPhase('instructions');
      } catch {
        toast.error('Failed to load exam');
        navigate('/student');
      }
    };
    load();
    return () => {
      clearInterval(timerRef.current);
      clearTimeout(warningTimerRef.current);
      stopAllStreams();
    };
  }, [testId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Countdown timer ───────────────────────────────────────────────────────
  useEffect(() => {
  if (phase !== 'exam') return;

  // If somehow time is already 0 when exam phase starts, submit immediately
  if (timeLeft <= 0) {
    doSubmit(true);
    return;
  }

  timerRef.current = setInterval(() => {
    setTimeLeft(t => {
      if (t <= 1) {
        clearInterval(timerRef.current);
        doSubmit(true);
        return 0;
      }
      return t - 1;
    });
  }, 1000);
  return () => clearInterval(timerRef.current);
}, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Per-question time tracking: record start time when question changes ───
  // FIX: uses ref instead of state so flushQuestionTime has no stale closure
  useEffect(() => {
    if (phase !== 'exam') return;
    const qId = questions[currentIdx]?._id;
    if (!qId) return;
    // Record when we arrived at this question
    questionStartTimeRef.current[qId] = Date.now();
  }, [currentIdx, phase, questions]);

  // ── FIX: getLiveTimeSpent — computes total seconds for a question ──────────
  // Combines already-accumulated seconds + current session elapsed time.
  // Uses refs so it's always fresh with no stale closure issues.
  const getLiveTimeSpent = useCallback((qId) => {
    const accumulated = questionTimeSpentRef.current[qId] || 0;
    const startedAt   = questionStartTimeRef.current[qId];
    const currentSession = startedAt
      ? Math.floor((Date.now() - startedAt) / 1000)
      : 0;
    return accumulated + currentSession;
  }, []);

  // ── FIX: flushQuestionTime — freezes current session time into the ref ────
  // Called before navigating away from a question.
  const flushQuestionTime = useCallback((idx) => {
    if (!securityRef.current.perQuestionTimeTracking) return;
    const qId = questions[idx]?._id;
    if (!qId) return;
    const startedAt = questionStartTimeRef.current[qId];
    if (!startedAt) return;

    const sessionSeconds = Math.floor((Date.now() - startedAt) / 1000);
    const newTotal = (questionTimeSpentRef.current[qId] || 0) + sessionSeconds;

    // Update ref (immediate, no re-render cost)
    questionTimeSpentRef.current[qId] = newTotal;
    // Update state (triggers re-render for the displayed timer)
    setQuestionTimeSpent(prev => ({ ...prev, [qId]: newTotal }));
    // Clear the start time so we don't double-count
    questionStartTimeRef.current[qId] = null;
  }, [questions]);

  // ── Security: tab switch, copy/paste, right-click, devtools ──────────────
  useEffect(() => {
    if (phase !== 'exam') return;

    const onVisibility = () => {
      if (document.hidden && phaseRef.current === 'exam')
        recordViolation('tab_switch', 'Student switched tab or minimized window');
    };
    const onBlur = () => {
      if (confirmOpenRef.current) return;
      if (phaseRef.current === 'exam')
        recordViolation('window_blur', 'Window lost focus');
    };
    const blockCopy = (e) => {
      if (!securityRef.current.copyPasteBlocking) return;
      e.preventDefault();
      recordViolation('copy_paste', `${e.type} attempted`);
      showWarning('🚫 Copy/Paste is not allowed!');
    };
    const blockRight = (e) => {
      if (!securityRef.current.rightClickBlocking) return;
      e.preventDefault();
      showWarning('🚫 Right-click is disabled!');
    };
    const blockKeys = (e) => {
      if (
        e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && ['I', 'J', 'C'].includes(e.key)) ||
        (e.ctrlKey && e.key === 'u') ||
        (securityRef.current.fullscreenEnforcement && e.key === 'Escape')
      ) {
        e.preventDefault();
        showWarning('🚫 Developer tools / Escape are disabled!');
      }
    };

    if (securityRef.current.tabSwitchDetection) {
      document.addEventListener('visibilitychange', onVisibility);
      window.addEventListener('blur', onBlur);
    }
    document.addEventListener('copy',        blockCopy);
    document.addEventListener('paste',       blockCopy);
    document.addEventListener('cut',         blockCopy);
    document.addEventListener('contextmenu', blockRight);
    document.addEventListener('keydown',     blockKeys);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur',               onBlur);
      document.removeEventListener('copy',             blockCopy);
      document.removeEventListener('paste',            blockCopy);
      document.removeEventListener('cut',              blockCopy);
      document.removeEventListener('contextmenu',      blockRight);
      document.removeEventListener('keydown',          blockKeys);
    };
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Security: fullscreen enforcement ─────────────────────────────────────
  useEffect(() => {
    if (phase !== 'exam' || !securityRef.current.fullscreenEnforcement) return;

    if (!document.fullscreenElement) {
      setFsViolationActive(true);
    }

    const onFsChange = () => {
      if (!document.fullscreenElement && phaseRef.current === 'exam') {
        setFsViolationActive(true);
        showWarning('⛶ Fullscreen required — please return to fullscreen to continue.');
      } else {
        setFsViolationActive(false);
      }
    };

    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, [phase]);

  // ── Camera PiP ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (cameraStream && cameraVideoRef.current)
      cameraVideoRef.current.srcObject = cameraStream;
  }, [cameraStream, phase]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const showWarning = (msg) => {
    setWarningMsg(msg);
    clearTimeout(warningTimerRef.current);
    warningTimerRef.current = setTimeout(() => setWarningMsg(''), 3000);
  };

  const recordViolation = useCallback(async (type, details) => {
    if (!attemptRef.current?._id || phaseRef.current !== 'exam') return;
    try {
      const res = await api.post(`/attempts/${attemptRef.current._id}/violation`, { type, details });
      const newCount = res.data.violationCount;
      setViolationCount(newCount);
      showWarning(`⚠️ Violation #${newCount}: ${type.replace(/_/g, ' ')}`);

      if (res.data.isPaused) {
        setPhase('paused');
        toast.error('Test paused due to suspicious activity. Waiting for teacher...');
      } else if (res.data.autoSubmit) {
        toast.error('Maximum violations reached. Exam auto-submitted!');
        doSubmit(true);
      }
    } catch { }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Student-initiated pause ───────────────────────────────────────────────
  const doPause = useCallback(async () => {
    if (!attemptRef.current?._id) return;
    try {
      clearInterval(timerRef.current);
      await api.post(`/attempts/${attemptRef.current._id}/student-pause`);
      toast.success('Test paused successfully.');
      navigate('/student');
    } catch {
      toast.error('Failed to pause test');
    }
  }, [navigate]);

  // ── Submit ────────────────────────────────────────────────────────────────
  const doSubmit = useCallback(async (auto = false) => {
  if (submittingRef.current || !attemptRef.current?._id) return;
  submittingRef.current = true;
  setSubmitting(true);
  phaseRef.current = 'submitted';

  clearInterval(timerRef.current);
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});

  const attemptId = attemptRef.current._id;

  // ── Step 1: Stop recorders and collect blobs BEFORE submitting ──
  // We stop them here so they flush their final chunks,
  // but we do NOT stop the streams yet (upload needs them alive... 
  // actually streams aren't needed for upload, but stopping recorders
  // synchronously here means all chunks are ready before the IIFE runs)
  let screenBlobPromise = null;
  let cameraBlobPromise = null;

  if (screenRecorderRef.current && screenRecorderRef.current.state !== 'inactive') {
    screenBlobPromise = new Promise(resolve => {
      screenRecorderRef.current.onstop = () => {
        const blob = screenChunksRef.current.length > 0
          ? new Blob(screenChunksRef.current, { type: 'video/webm' })
          : null;
        resolve(blob);
      };
      screenRecorderRef.current.stop();
    });
  }

  if (cameraRecorderRef.current && cameraRecorderRef.current.state !== 'inactive') {
    cameraBlobPromise = new Promise(resolve => {
      cameraRecorderRef.current.onstop = () => {
        const blob = cameraChunksRef.current.length > 0
          ? new Blob(cameraChunksRef.current, { type: 'video/webm' })
          : null;
        resolve(blob);
      };
      cameraRecorderRef.current.stop();
    });
  }

  // ── Step 2: Submit the exam ──
  try {
    await api.post(`/attempts/${attemptId}/submit`, { autoSubmitted: auto });
    setPhase('submitted');
    if (!auto) toast.success('Exam submitted!');
  } catch {
    toast.error('Submission failed. Try again.');
    submittingRef.current = false;
    setSubmitting(false);
    phaseRef.current = 'exam';
    // Re-enable recorders if submission failed? They're already stopped.
    // Best we can do is let the user know.
    return;
  }

  // ── Step 3: Await blobs and upload in background ──
  // Component may unmount (navigate away) after setPhase('submitted'),
  // but this IIFE captures attemptId and the blob promises in closure,
  // so it will finish even if the component unmounts.
  (async () => {
    try {
      const [screenBlob, cameraBlob] = await Promise.all([
        screenBlobPromise ?? Promise.resolve(null),
        cameraBlobPromise ?? Promise.resolve(null),
      ]);

      // Stop streams only after blobs are safely captured
      stopAllStreams();

      await uploadRecordingsToServer(attemptId, screenBlob, cameraBlob);
      deleteOldLocalRecording(attemptId);
    } catch (err) {
      console.error('[doSubmit] Background upload error:', err);
    }
  })();

}, [stopAllStreams]);

  // ── Start exam ────────────────────────────────────────────────────────────
  const startExam = async () => {
    if (securityRef.current.fullscreenEnforcement) {
      try {
        await document.documentElement.requestFullscreen();
      } catch {
        toast.error('Fullscreen is required to take this exam. Please allow it in your browser.');
        return;
      }
    }

    let tempCameraStream = null;
    let tempScreenStream = null;

    try {
      tempCameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    } catch (err) {
      if (err.name === 'NotFoundError' || err.message?.includes('not found')) {
        try {
          tempCameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          toast.success('Camera found (no microphone). AI Vision Tracking active!');
        } catch {
          toast.error('A webcam is required to take this exam. None was found.');
          if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
          return;
        }
      } else {
        toast.error(`Camera/Mic error: ${err.message}. Please check browser permissions.`);
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        return;
      }
    }

    try {
      tempScreenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    } catch (err) {
      toast.error(`Screen share error: ${err.message}. Check browser permissions.`);
      tempCameraStream.getTracks().forEach(t => t.stop());
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      return;
    }

    streamsRef.current = { screen: tempScreenStream, camera: tempCameraStream };
    setScreenStream(tempScreenStream);
    setCameraStream(tempCameraStream);

    tempScreenStream.getVideoTracks()[0]?.addEventListener('ended', () => {
      if (submittingRef.current) return;
      toast.error('Screen sharing was stopped. Auto-submitting!', { duration: 5000 });
      recordViolation('screen_share_stopped', 'Student stopped screen sharing mid-exam');
      doSubmit(true);
    });

    tempCameraStream.getVideoTracks()[0]?.addEventListener('ended', () => {
      if (submittingRef.current) return;
      toast.error('Camera was disconnected. Auto-submitting!', { duration: 5000 });
      recordViolation('camera_stopped', 'Student disabled camera mid-exam');
      doSubmit(true);
    });

    if (securityRef.current.screenRecording) {
      screenChunksRef.current = [];
      try {
        const recorder = new MediaRecorder(tempScreenStream, { mimeType: 'video/webm;codecs=vp8' });
        recorder.ondataavailable = (e) => { if (e.data.size > 0) screenChunksRef.current.push(e.data); };
        recorder.start(1000);
        screenRecorderRef.current = recorder;
      } catch { }
    }

    if (securityRef.current.cameraRecording) {
      cameraChunksRef.current = [];
      try {
        const recorder = new MediaRecorder(tempCameraStream, { mimeType: 'video/webm;codecs=vp8' });
        recorder.ondataavailable = (e) => { if (e.data.size > 0) cameraChunksRef.current.push(e.data); };
        recorder.start(1000);
        cameraRecorderRef.current = recorder;
      } catch { }
    }

    // Ensure socket is connected before useProctoring emits student:join
    const token = localStorage.getItem('token');
    if (!socket.connected) {
      socket.auth = { token };
      socket.connect();
    }

    setPhase('loading_ai');
  };

  // ── Answer handling ───────────────────────────────────────────────────────
  // FIX: uses getLiveTimeSpent() instead of stale questionTimeSpent state,
  // so the backend always receives the real elapsed seconds even before flush.
  const handleAnswer = useCallback(async (qId, answer) => {
    setAnswers(prev => ({ ...prev, [qId]: answer }));
    if (!attemptRef.current?._id) return;
    const timeSpent = getLiveTimeSpent(qId);
    try {
      await api.post(`/attempts/${attemptRef.current._id}/answer`, {
        questionId: qId,
        answer,
        timeSpent,
      });
    } catch { }
  }, [getLiveTimeSpent]);

  // ── Navigation ────────────────────────────────────────────────────────────
  const goTo   = (idx) => {
    if (securityRef.current.oneWayNavigation && idx < currentIdx) return;
    flushQuestionTime(currentIdx);
    setCurrentIdx(idx);
  };
  const goNext = () => { if (currentIdx < questions.length - 1) goTo(currentIdx + 1); };
  const goPrev = () => { if (currentIdx > 0 && !securityRef.current.oneWayNavigation) goTo(currentIdx - 1); };

  const clearAnswer = (qId) => {
    setAnswers(prev => { const next = { ...prev }; delete next[qId]; return next; });
    if (attemptRef.current?._id) {
      api.post(`/attempts/${attemptRef.current._id}/answer`, {
        questionId: qId,
        answer: '',
        timeSpent: getLiveTimeSpent(qId),
      }).catch(() => {});
    }
  };

  const formatTime    = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  const answeredCount = questions.filter(q => answers[q._id]?.trim()).length;
  const currentQ      = questions[currentIdx];

  // ── PHASE: loading ────────────────────────────────────────────────────────
  if (phase === 'loading') return (
    <div style={S.centerPage}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 52, marginBottom: 16 }}>⬡</div>
        <div className="spinner" style={{ width: 36, height: 36, margin: '0 auto 12px' }} />
        <p style={{ color: 'var(--text2)' }}>Loading your exam...</p>
      </div>
    </div>
  );

  // ── PHASE: loading_ai ─────────────────────────────────────────────────────
  if (phase === 'loading_ai') return (
    <div style={{ ...S.examShell, alignItems: 'center', justifyContent: 'center' }}>
      {cameraStream && (
        <AILiveMonitor
          stream={cameraStream}
          onViolation={recordViolation}
          onReady={async () => {
            try {
              const r = await api.put(`/attempts/${attemptRef.current._id}/begin`);
            setAttempt(r.data);
            if (r.data.status === 'in_progress' && r.data.startTime) {
              const elapsed = Math.floor((Date.now() - new Date(r.data.startTime).getTime()) / 1000);
              setTimeLeft(prev => {
                const fromStart = Math.max(0, test.duration * 60 - elapsed);
                return Math.min(prev, fromStart);
              });
            }
            } catch { }
            setPhase('exam');
          }}
        />
      )}
      <div style={{ textAlign: 'center', padding: 40, background: 'var(--bg2)', borderRadius: 16, border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)' }}>
        <div style={{ fontSize: 60, marginBottom: 16 }}>🧠</div>
        <div className="spinner" style={{ width: 36, height: 36, margin: '0 auto 16px', borderTopColor: 'var(--accent)' }} />
        <h2 style={{ fontSize: 20, marginBottom: 8 }}>Initializing AI Proctoring...</h2>
        <p style={{ color: 'var(--text2)', fontSize: 14 }}>Loading Computer Vision parameters. Please look at the camera.</p>
      </div>
    </div>
  );

  // ── PHASE: instructions ───────────────────────────────────────────────────
  if (phase === 'instructions') {
    const sec = test?.security || {};
    return (
      <div style={S.centerPage}>
        <div style={S.instrCard}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{ fontSize: 52 }}>📋</div>
            <h1 style={{ fontSize: 24, marginTop: 10 }}>{test?.title}</h1>
            <p style={{ color: 'var(--text3)', fontSize: 13, marginTop: 4 }}>Read instructions carefully before starting</p>
          </div>

          {test?.description && (
            <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
              <p style={{ color: 'var(--text2)', fontSize: 14, lineHeight: 1.6 }}>{test.description}</p>
            </div>
          )}

          <div style={S.metaRow}>
            {[['⏱', `${test?.duration} min`, 'Duration'], ['📝', questions.length, 'Questions'], ['🎯', test?.totalMarks, 'Total Marks']].map(([icon, val, lbl]) => (
              <div key={lbl} style={S.metaBox}>
                <span style={{ fontSize: 22 }}>{icon}</span>
                <strong style={{ fontSize: 20, fontFamily: 'Syne,sans-serif' }}>{val}</strong>
                <span style={{ fontSize: 11, color: 'var(--text3)' }}>{lbl}</span>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 18 }}>
            <p style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Active Security Measures</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {sec.fullscreenEnforcement      && <SBadge icon="⛶"  label="Fullscreen required" />}
              {sec.tabSwitchDetection         && <SBadge icon="🔍" label={`Tab switch limit: ${sec.maxTabSwitches}`} />}
              {sec.copyPasteBlocking          && <SBadge icon="🚫" label="Copy/Paste blocked" />}
              {sec.rightClickBlocking         && <SBadge icon="🖱️" label="Right-click blocked" />}
              {sec.questionRandomization      && <SBadge icon="🔀" label="Questions randomized" />}
              {sec.oneWayNavigation           && <SBadge icon="→"  label="One-way navigation" />}
              {sec.perQuestionTimeTracking    && <SBadge icon="⏱"  label="Time tracked per question" />}
              {sec.screenRecording            && <SBadge icon="🖥️" label="Screen recording"  color="var(--red)" />}
              {sec.cameraRecording            && <SBadge icon="📷" label="Camera recording"  color="var(--red)" />}
              {sec.autoSubmitOnMaxViolations  && <SBadge icon="⚡" label={`Auto-submit at ${sec.maxTabSwitches} violations`} color="var(--yellow)" />}
            </div>
          </div>

          <div style={{ marginTop: 16, padding: '12px 16px', background: 'var(--yellow-dim)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8 }}>
            <p style={{ color: 'var(--yellow)', fontSize: 12, lineHeight: 1.6 }}>
              ⚠️ By starting, you agree to monitoring. Violations are recorded and may auto-submit your exam.
            </p>
          </div>

          <button
            className="btn btn-primary btn-lg"
            style={{ width: '100%', justifyContent: 'center', marginTop: 20 }}
            onClick={startExam}
          >
            ▶ Start Exam Now
          </button>
        </div>
      </div>
    );
  }

  // ── PHASE: submitted ──────────────────────────────────────────────────────
  if (phase === 'submitted') return (
    <div style={S.centerPage}>
      <SubmitCelebration />
      <div style={{ textAlign: 'center', maxWidth: 420, position: 'relative', zIndex: 1 }}>
        <div style={{ fontSize: 72 }}>✅</div>
        <h1 style={{ fontSize: 26, marginTop: 12 }}>Exam Submitted!</h1>
        <p style={{ color: 'var(--text2)', lineHeight: 1.6, marginTop: 8 }}>
          You answered <strong>{answeredCount}</strong> of <strong>{questions.length}</strong> questions.
        </p>
        {violationCount > 0 && (
          <div style={{ marginTop: 12, padding: '10px 16px', background: 'var(--red-dim)', borderRadius: 8, color: 'var(--red)', fontSize: 13 }}>
            ⚠️ {violationCount} violation(s) recorded
          </div>
        )}
        <div style={{ display: 'flex', gap: 12, marginTop: 20, justifyContent: 'center' }}>
          <button className="btn btn-secondary" onClick={() => navigate('/student')}>← Dashboard</button>
          <button className="btn btn-primary"   onClick={() => navigate(`/result/${testId}`)}>View Result →</button>
        </div>
      </div>
    </div>
  );

  // ── PHASE: paused (by teacher/system) ─────────────────────────────────────
  if (phase === 'paused') return (
  <div style={S.centerPage}>
    <div style={{
      textAlign: 'center', maxWidth: 420, padding: 32,
      background: 'var(--bg2)', borderRadius: 16,
      border: '2px solid var(--red)'
    }}>
      <div style={{ fontSize: 60 }}>🔒</div>
      <h1 style={{ fontSize: 24, marginTop: 16, color: 'var(--red)' }}>Test Locked</h1>
      <p style={{ color: 'var(--text2)', lineHeight: 1.6, marginTop: 12 }}>
        Your test has been paused due to too many violations.
        Your teacher has been notified and must unlock it for you.
      </p>
      <div style={{
        marginTop: 16, padding: '12px 16px',
        background: 'var(--red-dim)',
        border: '1px solid rgba(239,68,68,0.3)',
        borderRadius: 8
      }}>
        <p style={{ color: 'var(--red)', fontSize: 13, fontWeight: 700 }}>
          ⚠️ You cannot resume this test yourself.
          Only your teacher can unlock it.
        </p>
      </div>
      <div style={{ marginTop: 24 }}>
        <span className="spinner" style={{ width: 24, height: 24, margin: '0 auto', borderTopColor: 'var(--red)' }} />
        <p style={{ color: 'var(--red)', fontSize: 13, marginTop: 8, fontWeight: 600 }}>
          Waiting for teacher to unlock...
        </p>
      </div>
    </div>
  </div>
);

  // ── PHASE: exam ───────────────────────────────────────────────────────────
  return (
    <div style={S.examShell}>
      {warningMsg && <div style={S.warnBanner}>{warningMsg}</div>}

      {/* Camera PiP preview */}
      {cameraStream && (
        <>
          <video ref={cameraVideoRef} autoPlay muted playsInline style={S.cameraPip} />
          <AILiveMonitor stream={cameraStream} onViolation={recordViolation} />
        </>
      )}

      {/* Top bar */}
      <div style={S.topBar}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
          <span style={{ color: 'var(--accent2)', fontSize: 20, flexShrink: 0 }}>⬡</span>
          <span style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{test?.title}</span>
        </div>
        <div style={{ flexShrink: 0 }}>
          <div style={{ ...S.timer, color: timeLeft < 300 ? 'var(--red)' : timeLeft < 600 ? 'var(--yellow)' : 'var(--text)' }}>
            ⏱ {formatTime(timeLeft)}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, justifyContent: 'flex-end' }}>
          {violationCount > 0 && (
            <div style={S.violBadge}>⚠️ {violationCount}/{maxViolRef.current}</div>
          )}
          <div style={S.progPill}>{answeredCount}/{questions.length}</div>
          {securityRef.current.studentPauseAllowed && (
            <button className="btn btn-secondary btn-sm" onClick={() => setPauseModalOpen(true)} disabled={submitting}>
              ⏸ Pause
            </button>
          )}
          <button className="btn btn-danger btn-sm" onClick={() => setSubmitModalOpen(true)} disabled={submitting}>
            {submitting ? <span className="spinner" /> : 'Submit'}
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={S.body}>
        {/* Question palette */}
        <div style={S.palette}>
          <div style={S.paletteHead}>Questions</div>
          <div style={S.paletteGrid}>
            {questions.map((q, i) => {
              const ans    = answers[q._id]?.trim();
              const locked = securityRef.current.oneWayNavigation && i < currentIdx;
              return (
                <button
                  key={q._id}
                  title={`Q${i + 1}${ans ? ' ✓' : ''}`}
                  style={{ ...S.pBtn, ...(i === currentIdx ? S.pCur : ans ? S.pDone : {}), opacity: locked ? 0.35 : 1 }}
                  onClick={() => goTo(i)}
                  disabled={locked}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
          <div style={S.legend}>
            <div style={S.legendRow}><span style={{ ...S.dot, background: 'var(--accent)' }} />Current</div>
            <div style={S.legendRow}><span style={{ ...S.dot, background: 'var(--green)' }} />Answered</div>
            <div style={S.legendRow}><span style={{ ...S.dot, background: 'var(--bg4)' }} />Skipped</div>
          </div>
        </div>

        {/* Question area */}
        <div style={S.qArea}>
          {currentQ && (
            <div style={S.qCard}>
              <div style={S.qHead}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={S.qNum}>Q{currentIdx + 1}</span>
                  <span style={S.qType}>{currentQ.type.replace('_', ' ')}</span>
                  <span style={{ color: 'var(--text3)', fontSize: 12 }}>{currentQ.marks} mark{currentQ.marks !== 1 ? 's' : ''}</span>
                  {currentQ.negativeMarks > 0 && <span style={{ color: 'var(--red)', fontSize: 12 }}>-{currentQ.negativeMarks} neg</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {securityRef.current.perQuestionTimeTracking && (
                    // FIX: shows live time from state (updated on navigation) 
                    <span style={{ fontSize: 12, color: 'var(--text3)' }}>
                      ⏱ {questionTimeSpent[currentQ._id] || 0}s
                    </span>
                  )}
                  <span style={{ fontSize: 12, color: 'var(--text3)' }}>{currentIdx + 1}/{questions.length}</span>
                </div>
              </div>

              <p style={S.qText}>{currentQ.questionText}</p>

              {/* MCQ */}
              {currentQ.type === 'mcq' && (
                <div style={S.optList}>
                  {currentQ.options?.map((opt, oi) => {
                    const sel = answers[currentQ._id] === opt.text;
                    return (
                      <button
                        key={oi}
                        style={{ ...S.opt, ...(sel ? S.optSel : {}) }}
                        onClick={() => handleAnswer(currentQ._id, opt.text)}
                      >
                        <span style={{ ...S.optLetter, ...(sel ? { background: 'var(--accent)', borderColor: 'var(--accent)', color: 'white' } : {}) }}>
                          {String.fromCharCode(65 + oi)}
                        </span>
                        <span style={{ fontSize: 14, flex: 1, textAlign: 'left' }}>{opt.text}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* True/False */}
              {currentQ.type === 'true_false' && (
                <div style={{ display: 'flex', gap: 14, marginTop: 24 }}>
                  {['True', 'False'].map(v => {
                    const sel = answers[currentQ._id] === v;
                    return (
                      <button
                        key={v}
                        style={{ ...S.tfBtn, ...(sel ? S.tfSel : {}) }}
                        onClick={() => handleAnswer(currentQ._id, v)}
                      >
                        <span style={{ fontSize: 26 }}>{v === 'True' ? '✓' : '✗'}</span>
                        <span style={{ fontWeight: 700, fontSize: 16 }}>{v}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* One Word */}
              {currentQ.type === 'one_word' && (
                <div style={{ marginTop: 24 }}>
                  <input
                    className="input"
                    style={{ maxWidth: 340, fontSize: 17, letterSpacing: 1 }}
                    placeholder="Type your answer..."
                    value={answers[currentQ._id] || ''}
                    onChange={e => handleAnswer(currentQ._id, e.target.value)}
                  />
                </div>
              )}

              {/* Theory */}
              {currentQ.type === 'theory' && (
                <div style={{ marginTop: 24 }}>
                  <textarea
                    className="input"
                    style={{ minHeight: 160, fontSize: 15, lineHeight: 1.7, resize: 'vertical' }}
                    placeholder="Write your answer here..."
                    value={answers[currentQ._id] || ''}
                    onChange={e => handleAnswer(currentQ._id, e.target.value)}
                  />
                  <p style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>
                    {(answers[currentQ._id] || '').length} characters
                  </p>
                </div>
              )}

              {/* Navigation */}
              <div style={S.navRow}>
                <button
                  className="btn btn-secondary"
                  onClick={goPrev}
                  disabled={currentIdx === 0 || securityRef.current.oneWayNavigation}
                >
                  ← Prev
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ opacity: answers[currentQ._id] ? 1 : 0.4 }}
                  onClick={() => clearAnswer(currentQ._id)}
                  disabled={!answers[currentQ._id]}
                >
                  Clear
                </button>
                {currentIdx < questions.length - 1
                  ? <button className="btn btn-primary" onClick={goNext}>Next →</button>
                  : <button className="btn btn-success" onClick={() => setSubmitModalOpen(true)} disabled={submitting}>
                      {submitting ? <><span className="spinner" /> Submitting...</> : '✓ Submit Exam'}
                    </button>
                }
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Submit confirmation modal */}
      {submitModalOpen && (
        <div style={S.modalOverlay}>
          <div style={S.modalContent}>
            <div style={S.modalIcon}>⚠️</div>
            <h3 style={S.modalTitle}>Submit the exam now?</h3>
            <p style={S.modalDesc}>
              {questions.filter(q => !answers[q._id]?.trim()).length > 0
                ? `You have ${questions.filter(q => !answers[q._id]?.trim()).length} unanswered question(s). Are you sure?`
                : 'You have answered all questions. Ready to submit?'}
            </p>
            <div style={S.modalActions}>
              <button className="btn btn-secondary" onClick={() => setSubmitModalOpen(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => { setSubmitModalOpen(false); doSubmit(false); }}>Yes, Submit</button>
            </div>
          </div>
        </div>
      )}

      {/* Pause confirmation modal */}
      {pauseModalOpen && (
        <div style={S.modalOverlay}>
          <div style={S.modalContent}>
            <div style={S.modalIcon}>⏸</div>
            <h3 style={S.modalTitle}>Pause Exam?</h3>
            <p style={S.modalDesc}>The timer will be stopped. You can resume later without losing time.</p>
            <div style={S.modalActions}>
              <button className="btn btn-secondary" onClick={() => setPauseModalOpen(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => { setPauseModalOpen(false); doPause(); }}>Yes, Pause</button>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen violation overlay */}
      {fsViolationActive && (
        <div style={{ ...S.modalOverlay, zIndex: 999999, background: 'var(--bg)' }}>
          <div style={{ textAlign: 'center', padding: 40, maxWidth: 500 }}>
            <div style={{ fontSize: 72, marginBottom: 16 }}>⛶</div>
            <h1 style={{ color: 'var(--red)', fontSize: 32, marginBottom: 12, fontWeight: 800, textTransform: 'uppercase' }}>
              Test Paused!
            </h1>
            <p style={{ color: 'var(--text2)', fontSize: 16, marginBottom: 20, lineHeight: 1.6 }}>
              You have exited fullscreen mode. The exam is locked and hidden to prevent cheating.
            </p>
            <div style={{ padding: '12px 16px', background: 'var(--yellow-dim)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8, marginBottom: 30 }}>
              <p style={{ color: 'var(--yellow)', fontSize: 13, fontWeight: 700 }}>
                ⚠️ The timer is STILL RUNNING. Return to fullscreen immediately.
              </p>
            </div>
            <button
              className="btn btn-primary btn-lg"
              style={{ width: '100%', justifyContent: 'center' }}
              onClick={async () => {
                try {
                  await document.documentElement.requestFullscreen();
                  setFsViolationActive(false);
                } catch {
                  toast.error('Could not enter fullscreen. Please allow it in your browser.');
                }
              }}
            >
              ▶ Return to Fullscreen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function SBadge({ icon, label, color = 'var(--text3)' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 20, fontSize: 11, color }}>
      <span>{icon}</span><span>{label}</span>
    </div>
  );
}

const S = {
  centerPage:  { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: 20 },
  instrCard:   { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: 32, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' },
  metaRow:     { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginTop: 16 },
  metaBox:     { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: 14, background: 'var(--bg3)', borderRadius: 10 },
  examShell:   { height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)', overflow: 'hidden', userSelect: 'none' },
  warnBanner:  { position: 'fixed', top: 68, left: '50%', transform: 'translateX(-50%)', background: '#1a0505', border: '1px solid var(--red)', borderRadius: 10, padding: '10px 22px', color: 'var(--red)', fontWeight: 700, fontSize: 13, zIndex: 9999, whiteSpace: 'nowrap' },
  cameraPip:   { position: 'fixed', bottom: 16, right: 16, width: 160, height: 120, borderRadius: 10, border: '2px solid var(--accent)', zIndex: 999, objectFit: 'cover', background: '#000' },
  topBar:      { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px', background: 'var(--bg2)', borderBottom: '1px solid var(--border)', flexShrink: 0 },
  timer:       { fontFamily: 'Syne,sans-serif', fontSize: 20, fontWeight: 800, letterSpacing: 2 },
  violBadge:   { background: 'var(--red-dim)', color: 'var(--red)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 20, padding: '3px 10px', fontSize: 12, fontWeight: 700 },
  progPill:    { background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 20, padding: '3px 12px', fontSize: 12, color: 'var(--text2)' },
  body:        { display: 'flex', flex: 1, overflow: 'hidden' },
  palette:     { width: 180, background: 'var(--bg2)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'hidden' },
  paletteHead: { padding: '10px 12px', fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid var(--border)', flexShrink: 0 },
  paletteGrid: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 4, padding: 8, overflowY: 'auto', flex: 1, alignContent: 'start' },
  pBtn:        { aspectRatio: '1', background: 'var(--bg4)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text3)', cursor: 'pointer', fontSize: 12, fontWeight: 600, transition: 'all 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  pCur:        { background: 'var(--accent)', borderColor: 'var(--accent)', color: 'white' },
  pDone:       { background: 'var(--green-dim)', borderColor: 'var(--green)', color: 'var(--green)' },
  legend:      { padding: '10px 12px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 5, flexShrink: 0 },
  legendRow:   { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text3)' },
  dot:         { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  qArea:       { flex: 1, overflowY: 'auto', padding: '24px 20px', display: 'flex', justifyContent: 'center' },
  qCard:       { width: '100%', maxWidth: 680 },
  qHead:       { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  qNum:        { background: 'var(--accent-dim)', color: 'var(--accent2)', padding: '3px 12px', borderRadius: 20, fontSize: 13, fontWeight: 800 },
  qType:       { background: 'var(--bg3)', color: 'var(--text2)', padding: '2px 10px', borderRadius: 20, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },
  qText:       { fontSize: 17, lineHeight: 1.7, color: 'var(--text)', marginBottom: 4 },
  optList:     { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 20 },
  opt:         { display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', background: 'var(--bg2)', border: '2px solid var(--border)', borderRadius: 10, cursor: 'pointer', color: 'var(--text)', textAlign: 'left', transition: 'all 0.15s' },
  optSel:      { background: 'var(--accent-dim)', borderColor: 'var(--accent)' },
  optLetter:   { width: 30, height: 30, borderRadius: 7, border: '2px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12, flexShrink: 0, transition: 'all 0.15s' },
  tfBtn:       { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '22px', background: 'var(--bg2)', border: '2px solid var(--border)', borderRadius: 12, cursor: 'pointer', color: 'var(--text)', transition: 'all 0.2s' },
  tfSel:       { background: 'var(--accent-dim)', borderColor: 'var(--accent)', color: 'var(--accent2)' },
  navRow:      { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 28, paddingTop: 20, borderTop: '1px solid var(--border)' },
  modalOverlay:{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  modalContent:{ background: 'var(--bg2)', padding: 32, borderRadius: 16, border: '1px solid var(--border)', maxWidth: 400, width: '100%', textAlign: 'center', boxShadow: 'var(--shadow-lg)' },
  modalIcon:   { fontSize: 40, marginBottom: 16 },
  modalTitle:  { fontSize: 18, color: 'var(--text)', marginBottom: 12, fontWeight: 700 },
  modalDesc:   { fontSize: 14, color: 'var(--text3)', marginBottom: 24, lineHeight: 1.5 },
  modalActions:{ display: 'flex', gap: 12, justifyContent: 'center' },
};