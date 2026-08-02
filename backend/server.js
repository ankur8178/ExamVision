const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const path = require('path');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
require('dotenv').config();

const app    = express();
const server = http.createServer(app);
const allowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5001',
  ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL.replace(/\/$/, '')] : [])
];

const io     = new Server(server, {
  cors: { 
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin) || (process.env.FRONTEND_URL && origin.startsWith(process.env.FRONTEND_URL.replace(/\/$/, '')))) {
        return callback(null, true);
      }
      callback(null, false);
    },
    methods: ['GET', 'POST'],
    credentials: true
  }
});

app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true);
    
    const cleanFrontendUrl = process.env.FRONTEND_URL?.replace(/\/$/, '');
    if (allowedOrigins.includes(origin) || (cleanFrontendUrl && origin.startsWith(cleanFrontendUrl))) {
      callback(null, true);
    } else {
      console.log('Blocked by CORS:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/courses',       require('./routes/courses'));
app.use('/api/tests',         require('./routes/tests'));
app.use('/api/questions',     require('./routes/questions'));
app.use('/api/attempts',      require('./routes/attempts'));
app.use('/api/messages',      require('./routes/messages'));
app.use('/api/analytics',     require('./routes/analytics'));
app.use('/api/upload',        require('./routes/upload'));
app.use('/api/recordings',    require('./routes/recordings'));
app.use('/api/announcements', require('./routes/announcements'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/sessions',      require('./routes/sessions'));

// ─────────────────────────────────────────────────────────────────────
// Socket.io — messaging + WebRTC signaling + live student count
// ─────────────────────────────────────────────────────────────────────

/**
 * broadcastStudentCount
 * Reads the live `test-${testId}` socket room, collects all student sockets,
 * and pushes `active_students_update` to every teacher in `teachers-${testId}`.
 * This keeps both the TeacherDashboard count AND the LiveMonitorDashboard
 * student list in sync on every join / leave / disconnect.
 */
function broadcastStudentCount(testId) {
  const room = io.sockets.adapter.rooms.get(`test-${testId}`);
  const students = [];
  if (room) {
    room.forEach((sid) => {
      const s = io.sockets.sockets.get(sid);
      if (s?.data?.role === 'student') {
        students.push({
          studentId:   s.data.studentId,
          studentName: s.data.studentName,
          socketId:    sid,
        });
      }
    });
  }
  io.to(`teachers-${testId}`).emit('active_students_update', {
    testId,
    count:    students.length,
    students,
  });
}

io.on('connection', (socket) => {

  // ── Auto-join personal notification room via auth token ──────────
  try {
    const token = socket.handshake.auth?.token;
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (decoded.id) {
        socket.join(`user_${decoded.id}`);
        socket.data.userId = decoded.id; // set ONCE — never overwrite below
      }
    }
  } catch (_) { /* invalid token — skip */ }

  // ── Chat messaging ───────────────────────────────────────────────
  socket.on('join_room', (roomId) => socket.join(roomId));
  socket.on('send_message', (data) => {
    io.to(data.roomId).emit('receive_message', data);
  });

  // ── Student joins exam room ──────────────────────────────────────
  socket.on('student:join', ({ testId, studentId, studentName }) => {
    if (!testId || !studentId) return;

    socket.join(`test-${testId}`);

    // IMPORTANT: merge properties — never do socket.data = { ... }
    // Overwriting the whole object wipes the userId set by JWT block above.
    socket.data.testId      = testId;
    socket.data.studentId   = studentId;
    socket.data.studentName = studentName;
    socket.data.role        = 'student';

    // Tell any open LiveMonitorDashboard about this new student
    socket.to(`teachers-${testId}`).emit('student:joined', {
      studentId,
      studentName,
      socketId: socket.id,
    });

    // Push updated count to TeacherDashboard + LiveMonitorDashboard
    broadcastStudentCount(testId);
  });

  // ── Teacher opens LiveMonitorDashboard (full WebRTC tile view) ───
  socket.on('teacher:join', ({ testId }) => {
    if (!testId) return;

    socket.join(`teachers-${testId}`);
    socket.data.testId = testId;
    socket.data.role   = 'teacher';

    // Build current student snapshot for this teacher only
    const room = io.sockets.adapter.rooms.get(`test-${testId}`);
    const students = [];
    if (room) {
      room.forEach((sid) => {
        const s = io.sockets.sockets.get(sid);
        if (s?.data?.role === 'student') {
          students.push({
            studentId:   s.data.studentId,
            studentName: s.data.studentName,
            socketId:    sid,
          });
        }
      });
    }

    // Send tile list to LiveMonitorDashboard
    socket.emit('students:list', students);

    // Also send count so header counter is immediately correct
    socket.emit('active_students_update', {
      testId,
      count:    students.length,
      students,
    });
  });

  // ── Teacher subscribes to count only (TeacherDashboard cards) ───
  // Lighter-weight than teacher:join — no WebRTC, just live count updates.
  socket.on('teacher:subscribe', ({ testId }) => {
    if (!testId) return;
    socket.join(`teachers-${testId}`);
    socket.data.role = 'teacher';
    // Immediately push current count to just this socket
    broadcastStudentCount(testId);
  });

  // ── Teacher requests WebRTC streams from a specific student ─────
  socket.on('teacher:watch', ({ studentSocketId }) => {
    io.to(studentSocketId).emit('teacher:watch', { teacherSocketId: socket.id });
  });

  // ── Teacher resumes a paused student ────────────────────────────
  socket.on('resume_test', ({ attemptId, testId }) => {
    io.to(`test-${testId}`).emit('test_resumed', { attemptId });
  });

  // ── WebRTC signaling relay ───────────────────────────────────────
  // Video never touches this server — purely peer-to-peer.
  socket.on('webrtc:offer', ({ to, offer, streamType }) => {
    io.to(to).emit('webrtc:offer', { from: socket.id, offer, streamType });
  });

  socket.on('webrtc:answer', ({ to, answer, streamType }) => {
    io.to(to).emit('webrtc:answer', { from: socket.id, answer, streamType });
  });

  socket.on('webrtc:ice', ({ to, candidate }) => {
    io.to(to).emit('webrtc:ice', { from: socket.id, candidate });
  });

  // ── Disconnect ───────────────────────────────────────────────────
  socket.on('disconnect', () => {
    if (socket.data?.role === 'student' && socket.data?.testId) {
      // Remove tile from any open LiveMonitorDashboard
      socket.to(`teachers-${socket.data.testId}`).emit('student:left', {
        socketId:  socket.id,
        studentId: socket.data.studentId,
      });
      // setTimeout(0) lets the socket fully leave its rooms before we re-query
      setTimeout(() => broadcastStudentCount(socket.data.testId), 0);
    }
  });
});

const PORT = process.env.PORT || 5001;

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB connected successfully'))
  .catch(err => console.error('MongoDB connection error:', err.message));

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});