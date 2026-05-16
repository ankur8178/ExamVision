import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import '@tensorflow/tfjs';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

// ─────────────────────────────────────────────────────────────────────────────
//  TUNING CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────
const THRESHOLD          = 4;    // strict mode
const NO_FACE_MULTIPLIER = 3;    // strict mode — violation after ~18 s
const AUDIO_THRESHOLD    = 40;
const SPEECH_MIN_LENGTH  = 30;
const SCAN_INTERVAL_MS   = 1500;

// After a violation fires, the same type cannot fire again for this many ms.
// This prevents the same issue (e.g. face not detected) from tripling up
// within seconds and burning through the max-violation limit unfairly.
const VIOLATION_COOLDOWN_MS = {
  face_not_detected  : 60_000,   // 60 s cooldown after a face-not-detected violation
  multiple_faces     : 30_000,   // 30 s cooldown after a multiple-faces violation
  unauthorized_device: 30_000,   // 30 s cooldown after a phone violation
  background_noise   : 45_000,   // 45 s cooldown after a noise violation
  speech_detected    : 45_000,   // 45 s cooldown after a speech violation
};
// ─────────────────────────────────────────────────────────────────────────────

export default function AILiveMonitor({ stream, onViolation, onReady }) {
  const [modelLoading,  setModelLoading]  = useState(true);
  const [audioLevel,    setAudioLevel]    = useState(0);
  const [speechWarning, setSpeechWarning] = useState('');
  const [cvWarning,     setCvWarning]     = useState('');

  const videoRef             = useRef(null);
  const audioCtxRef          = useRef(null);
  const speechRecognitionRef = useRef(null);
  const modelRef             = useRef(null);
  const lastVideoTimeRef     = useRef(-1);

  // Per-condition consecutive-hit counters
  const counters = useRef({
    multipleFaces : 0,
    noFace        : 0,
    cellPhone     : 0,
    loudAudio     : 0,
  });

  // Tracks when each violation type last fired (ms timestamp)
  // Prevents the same violation from firing multiple times in rapid succession
  const lastViolationTime = useRef({});

  // ── Wrapped violation emitter with cooldown check ─────────────────────────
  const fireViolation = useCallback((type, details) => {
    const now      = Date.now();
    const cooldown = VIOLATION_COOLDOWN_MS[type] ?? 30_000;
    const lastFire = lastViolationTime.current[type] ?? 0;

    if (now - lastFire < cooldown) {
      // Still in cooldown — skip this violation
      console.info(`[AIMonitor] Violation "${type}" suppressed (cooldown: ${Math.round((cooldown - (now - lastFire)) / 1000)}s remaining)`);
      return;
    }

    lastViolationTime.current[type] = now;
    onViolation(type, details);
  }, [onViolation]);

  // ── Helper: wait until video is genuinely playing ─────────────────────────
  const waitForVideo = useCallback((videoEl) => {
    return new Promise((resolve) => {
      const check = () => {
        if (
          videoEl.readyState >= 2 &&
          videoEl.videoWidth  > 0 &&
          videoEl.videoHeight > 0 &&
          !videoEl.paused &&
          videoEl.currentTime > 0
        ) {
          resolve();
        } else {
          requestAnimationFrame(check);
        }
      };
      check();
    });
  }, []);

  // ── 1. Load models & audio ────────────────────────────────────────────────
  useEffect(() => {
    if (!stream) return;

    let cancelled = false;

    const videoEl = videoRef.current;
    if (videoEl) {
      videoEl.srcObject = stream;
      videoEl.play().catch(() => {});
    }

    async function loadFace() {
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm'
      );
      return FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
          delegate: 'GPU',
        },
        runningMode            : 'VIDEO',
        numFaces               : 3,
        minDetectionConfidence : 0.4,
        minTrackingConfidence  : 0.4,
        minPresenceConfidence  : 0.4,
      });
    }

    const loadTimeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Model load timeout')), 20000)
    );

    Promise.race([
      Promise.all([cocoSsd.load(), loadFace()]),
      loadTimeout,
    ])
      .then(async ([cocoModel, faceModel]) => {
        if (cancelled) return;
        modelRef.current = { coco: cocoModel, face: faceModel };
        if (videoEl) await waitForVideo(videoEl).catch(() => {});
        setModelLoading(false);
        if (onReady) onReady();
      })
      .catch((e) => {
        if (cancelled) return;
        console.error('Model load error:', e);
        setModelLoading(false);
        if (onReady) onReady();
      });

    // ── Audio ─────────────────────────────────────────────────────────────
    let cleanupAudio = () => {};
    try {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      const source   = audioCtxRef.current.createMediaStreamSource(stream);
      const analyzer = audioCtxRef.current.createAnalyser();
      analyzer.fftSize = 256;
      source.connect(analyzer);
      const bufLen    = analyzer.frequencyBinCount;
      const dataArray = new Uint8Array(bufLen);

      const audioInterval = setInterval(() => {
        analyzer.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((s, v) => s + v, 0) / bufLen;
        setAudioLevel(avg);

        if (avg > AUDIO_THRESHOLD) {
          counters.current.loudAudio++;
          if (counters.current.loudAudio > THRESHOLD * 2) {
            fireViolation('background_noise', 'Persistent loud background noise detected.');
            counters.current.loudAudio = 0;
          }
        } else {
          counters.current.loudAudio = Math.max(0, counters.current.loudAudio - 1);
        }
      }, 500);

      cleanupAudio = () => {
        clearInterval(audioInterval);
        if (audioCtxRef.current?.state !== 'closed') {
          audioCtxRef.current.close().catch(() => {});
        }
      };
    } catch (_) {}

    return () => {
      cancelled = true;
      cleanupAudio();
      if (modelRef.current?.face) {
        try { modelRef.current.face.close(); } catch (_) {}
      }
    };
  }, [stream, fireViolation, waitForVideo, onReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 2. Speech recognition ─────────────────────────────────────────────────
  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition         = new SpeechRecognition();
    recognition.continuous    = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        transcript += event.results[i][0].transcript;
      }
      if (transcript.trim().length > SPEECH_MIN_LENGTH) {
        setSpeechWarning('Talking detected!');
        fireViolation('speech_detected', `Speech transcribed: "${transcript.substring(0, 40)}..."`);
        recognition.stop();
      }
    };

    let active = true;
    recognition.onend = () => {
      setSpeechWarning('');
      if (active) { try { recognition.start(); } catch (_) {} }
    };

    try { recognition.start(); } catch (_) {}
    speechRecognitionRef.current = recognition;

    return () => {
      active = false;
      speechRecognitionRef.current?.stop();
    };
  }, [stream, fireViolation]);

  // ── 3. CV scanning loop ───────────────────────────────────────────────────
  useEffect(() => {
    if (!stream || modelLoading) return;

    const scanInterval = setInterval(async () => {
      const videoEl = videoRef.current;
      const models  = modelRef.current;

      if (
        !videoEl ||
        !models  ||
        videoEl.readyState < 2 ||
        videoEl.videoWidth  === 0 ||
        videoEl.paused      ||
        videoEl.currentTime === 0
      ) return;

      const currentTime = videoEl.currentTime;
      if (currentTime === lastVideoTimeRef.current) return;
      lastVideoTimeRef.current = currentTime;

      try {
        const faceResult = models.face.detectForVideo(videoEl, performance.now());
        const faceCount  = faceResult?.faceLandmarks?.length ?? 0;

        const predictions   = await models.coco.detect(videoEl);
        const phoneDetected = predictions.some((p) => p.class === 'cell phone');

        // ── Cell phone ────────────────────────────────────────────────────
        if (phoneDetected) {
          counters.current.cellPhone++;
          setCvWarning('📱 Cell phone detected in frame');
          if (counters.current.cellPhone >= THRESHOLD) {
            fireViolation('unauthorized_device', 'AI detected a mobile device in the camera view.');
            counters.current.cellPhone = 0;
          }
        } else {
          counters.current.cellPhone = Math.max(0, counters.current.cellPhone - 1);
        }

        // ── Multiple faces ────────────────────────────────────────────────
        if (faceCount > 1) {
          counters.current.multipleFaces++;
          setCvWarning('👥 Multiple people detected');
          if (counters.current.multipleFaces >= THRESHOLD) {
            fireViolation('multiple_faces', 'AI detected multiple people looking at the exam.');
            counters.current.multipleFaces = 0;
          }
        } else {
          counters.current.multipleFaces = Math.max(0, counters.current.multipleFaces - 2);
        }

        // ── No face ───────────────────────────────────────────────────────
        if (faceCount === 0) {
          counters.current.noFace++;

          if (counters.current.noFace >= 3) {
            setCvWarning('❓ Face not recognised');
          }
          if (counters.current.noFace >= THRESHOLD * NO_FACE_MULTIPLIER) {
            fireViolation('face_not_detected', 'Student face missing from the camera frame.');
            counters.current.noFace = 0;
          }
        } else {
          counters.current.noFace = Math.max(0, counters.current.noFace - 3);
          if (!phoneDetected && faceCount === 1) setCvWarning('');
        }

      } catch (err) {
        console.warn('CV scan frame error:', err);
      }
    }, SCAN_INTERVAL_MS);

    return () => clearInterval(scanInterval);
  }, [stream, modelLoading, fireViolation]);

  if (!stream) return null;

  return (
    <>
      {/*
        Video must NOT be display:none — MediaPipe cannot read pixels from hidden elements.
        Keep it on-screen but invisible with opacity:0 and 1x1 size.
      */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        width={640}
        height={480}
        style={{
          position      : 'fixed',
          top           : 0,
          left          : 0,
          width         : 1,
          height        : 1,
          opacity       : 0,
          pointerEvents : 'none',
          zIndex        : -1,
        }}
      />

      {/* AI status widget */}
      <div style={{
        position      : 'fixed',
        bottom        : 150,
        right         : 16,
        width         : 170,
        background    : 'rgba(17,17,24,0.9)',
        backdropFilter: 'blur(10px)',
        border        : '1px solid rgba(108,99,255,0.4)',
        borderRadius  : 12,
        padding       : 12,
        zIndex        : 999,
        boxShadow     : '0 8px 32px rgba(0,0,0,0.4)',
      }}>
        <div style={{
          fontSize     : 11,
          fontWeight   : 800,
          textTransform: 'uppercase',
          color        : 'var(--accent2)',
          marginBottom : 8,
          display      : 'flex',
          alignItems   : 'center',
          gap          : 6,
        }}>
          {modelLoading
            ? <span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} />
            : <span style={{ width: 8, height: 8, background: 'var(--accent)', borderRadius: '50%', boxShadow: '0 0 8px var(--accent)' }} />
          }
          {modelLoading ? 'Loading AI…' : 'AI Active'}
        </div>

        <div style={{ fontSize: 11, color: 'var(--text3)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Vision Tracker:</span>
            <span style={{ color: cvWarning ? 'var(--yellow)' : 'var(--green)', fontWeight: 600 }}>
              {cvWarning ? 'Alert' : 'Lock'}
            </span>
          </div>

          {(cvWarning || speechWarning) && (
            <div style={{ fontSize: 10, color: 'var(--yellow)', lineHeight: 1.3 }}>
              {cvWarning     && <div>{cvWarning}</div>}
              {speechWarning && <div>{speechWarning}</div>}
            </div>
          )}

          <div style={{ marginTop: 4 }}>
            <div style={{ fontSize: 10, marginBottom: 4 }}>Audio Spectrum:</div>
            <div style={{ height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                height    : '100%',
                width     : `${Math.min(100, (audioLevel / 80) * 100)}%`,
                background: audioLevel > 50 ? 'var(--red)' : 'var(--accent)',
                transition: 'width 0.1s linear',
              }} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}