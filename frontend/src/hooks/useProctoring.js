import { useEffect, useRef } from 'react';
import socket from '../utils/socket';

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

export default function useProctoring({
  testId,
  studentId,
  studentName,
  enabled,
  screenStream,
  cameraStream,
}) {
  // ── Always-current refs — assigned during render, never stale ────────────
  const screenStreamRef = useRef(screenStream);
  const cameraStreamRef = useRef(cameraStream);
  screenStreamRef.current = screenStream;
  cameraStreamRef.current = cameraStream;

  const peerRef      = useRef(null); // single peer connection to teacher
  const pendingRef   = useRef([]);   // watch requests queued before streams ready
  const teacherIdRef = useRef(null); // current teacher socket id

  useEffect(() => {
    if (!enabled || !testId || !studentId) return;

    // ─────────────────────────────────────────────────────────────────────
    // createPeer: ONE RTCPeerConnection carrying BOTH screen + camera.
    //
    // Why single peer instead of two?
    // Chrome fails the ICE consent check on a second peer when both peers
    // are on the same machine (localhost). Using one peer with two streams
    // (identified by their MediaStream.id) avoids this entirely.
    // ─────────────────────────────────────────────────────────────────────
    const createPeer = async (teacherSocketId) => {
      const screen = screenStreamRef.current;
      const camera = cameraStreamRef.current;

      if (!screen && !camera) {
        console.warn('[PROCTOR] No streams yet — queuing watch request');
        if (!pendingRef.current.includes(teacherSocketId))
          pendingRef.current.push(teacherSocketId);
        return;
      }

      // Cleanly destroy old peer before creating a new one
      if (peerRef.current) {
        peerRef.current.ontrack                 = null;
        peerRef.current.onicecandidate          = null;
        peerRef.current.onconnectionstatechange = null;
        peerRef.current.close();
        peerRef.current = null;
      }

      teacherIdRef.current = teacherSocketId;
      const peer = new RTCPeerConnection(ICE_CONFIG);
      peerRef.current = peer;

      // ── Add screen tracks — wrapped in their own MediaStream so teacher
      //    can identify them by stream.id === 'screen' ────────────────────
      if (screen) {
        const screenStream = new MediaStream(screen.getVideoTracks());
        Object.defineProperty(screenStream, 'id', { value: 'screen' });
        screen.getVideoTracks().forEach(track => {
          peer.addTrack(track, screenStream);
          console.log('[PROCTOR] Added screen track:', track.label);
        });
      }

      // ── Add camera tracks — wrapped in their own MediaStream so teacher
      //    can identify them by stream.id === 'camera' ───────────────────
      if (camera) {
        const cameraStream = new MediaStream(camera.getTracks());
        Object.defineProperty(cameraStream, 'id', { value: 'camera' });
        camera.getTracks().forEach(track => {
          peer.addTrack(track, cameraStream);
          console.log('[PROCTOR] Added camera track:', track.label, track.kind);
        });
      }

      peer.onicecandidate = ({ candidate }) => {
        if (candidate)
          socket.emit('webrtc:ice', { to: teacherSocketId, candidate });
      };

      peer.onconnectionstatechange = () => {
        console.log('[PROCTOR] peer state:', peer.connectionState);
        if (['failed', 'disconnected'].includes(peer.connectionState)) {
          const hasStreams = !!(screenStreamRef.current || cameraStreamRef.current);
          if (hasStreams && teacherIdRef.current) {
            console.warn('[PROCTOR] Peer failed — retrying in 2s');
            setTimeout(() => {
              if (teacherIdRef.current) createPeer(teacherIdRef.current);
            }, 2000);
          }
        }
      };

      try {
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        // streamType: 'combined' tells teacher this is the new single-peer format
        socket.emit('webrtc:offer', { to: teacherSocketId, offer, streamType: 'combined' });
        console.log('[PROCTOR] Combined offer sent to teacher →', teacherSocketId);
      } catch (e) {
        console.warn('[PROCTOR] createOffer failed:', e);
      }
    };

    // ── Drain any watch requests that arrived before streams were ready ────
    if ((screenStream || cameraStream) && pendingRef.current.length > 0) {
      const pending = [...pendingRef.current];
      pendingRef.current = [];
      pending.forEach(id => createPeer(id));
    }

    // ── Join exam room ─────────────────────────────────────────────────────
    const joinRoom = () => {
      console.log('[PROCTOR] student:join emitted, socket.id:', socket.id);
      socket.emit('student:join', { testId, studentId, studentName });
    };

    if (socket.connected) joinRoom();
    else socket.once('connect', joinRoom);

    // ── Socket event handlers ──────────────────────────────────────────────
    const onWatch = ({ teacherSocketId }) => {
      console.log('[PROCTOR] teacher:watch from:', teacherSocketId,
        '| screen:', !!screenStreamRef.current,
        '| camera:', !!cameraStreamRef.current);
      createPeer(teacherSocketId);
    };

    const onAnswer = async ({ from, answer }) => {
      console.log('[PROCTOR] answer received from teacher');
      const peer = peerRef.current;
      if (peer && peer.signalingState !== 'stable') {
        try {
          await peer.setRemoteDescription(new RTCSessionDescription(answer));
          console.log('[PROCTOR] remote description set OK');
        } catch (e) {
          console.warn('[PROCTOR] setRemoteDescription failed:', e);
        }
      }
    };

    const onIce = async ({ from, candidate }) => {
      if (!peerRef.current) return;
      try {
        await peerRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (_) {}
    };

    socket.on('teacher:watch', onWatch);
    socket.on('webrtc:answer', onAnswer);
    socket.on('webrtc:ice',    onIce);

    return () => {
      socket.off('connect',       joinRoom);
      socket.off('teacher:watch', onWatch);
      socket.off('webrtc:answer', onAnswer);
      socket.off('webrtc:ice',    onIce);

      if (peerRef.current) {
        peerRef.current.ontrack                 = null;
        peerRef.current.onicecandidate          = null;
        peerRef.current.onconnectionstatechange = null;
        peerRef.current.close();
        peerRef.current = null;
      }
      teacherIdRef.current = null;
      pendingRef.current   = [];
    };
  }, [enabled, testId, studentId, studentName, screenStream, cameraStream]); // eslint-disable-line react-hooks/exhaustive-deps
}