import { io } from 'socket.io-client';

// Dynamically determines backend socket URL across dev and production environments
const getSocketUrl = () => {
  if (process.env.REACT_APP_API_URL) {
    return process.env.REACT_APP_API_URL.replace(/\/api\/?$/, '');
  }
  if (process.env.NODE_ENV === 'production') {
    return window.location.origin;
  }
  return 'http://localhost:5001';
};

const socket = io(getSocketUrl(), {
  autoConnect: false,
  withCredentials: true,
  transports: ['websocket', 'polling'],  // try websocket first
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
});

export default socket;