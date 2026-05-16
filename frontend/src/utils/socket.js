import { io } from 'socket.io-client';

// Picks up your existing backend URL — same origin in prod, localhost in dev
const URL = process.env.REACT_APP_API_URL
  ? process.env.REACT_APP_API_URL.replace('/api', '')
  : 'http://localhost:5001';

const socket = io(URL, {
  autoConnect: false,
  withCredentials: true,
  transports: ['websocket', 'polling'],  // try websocket first
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
});

export default socket;