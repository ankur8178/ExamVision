# ExamVision — Secure Exam Proctoring System

A full-stack exam proctoring platform with advanced security features, real-time messaging, analytics, leaderboards, admin log tracking, and cloud recording integration.

---

## 🗂️ Project Structure

```text
exam-proctor/
├── backend/               # Node.js + Express + MongoDB API
│   ├── models/
│   │   ├── AdminLog.js            ← Added Admin Logs
│   │   ├── Announcement.js
│   │   ├── Attempt.js
│   │   ├── Course.js
│   │   ├── Message.js
│   │   ├── Notification.js
│   │   ├── Question.js
│   │   ├── Session.js
│   │   ├── Test.js
│   │   └── User.js
│   ├── routes/
│   │   ├── analytics.js
│   │   ├── announcements.js
│   │   ├── attempts.js
│   │   ├── auth.js
│   │   ├── courses.js
│   │   ├── messages.js
│   │   ├── notifications.js
│   │   ├── questions.js
│   │   ├── recordings.js
│   │   ├── sessions.js
│   │   ├── tests.js
│   │   └── upload.js
│   ├── middleware/
│   │   └── auth.js
│   ├── utils/
│   │   ├── googleDrive.js         ← Google Drive integration for recordings
│   │   └── sendEmail.js
│   ├── uploads/
│   │   └── recordings/            ← Local fallback/cache for proctoring recordings
│   ├── server.js
│   ├── service-account.json       ← Google Cloud credentials
│   ├── .env
│   └── package.json
│
└── frontend/              # React SPA
    ├── public/
    │   └── index.html
    ├── src/
    │   ├── App.js
    │   ├── index.css
    │   ├── index.js
    │   ├── pages/
    │   │   ├── AdminDashboard.js         ← Added Admin Dashboard
    │   │   ├── LoginPage.js
    │   │   ├── RegisterPage.js
    │   │   ├── TeacherDashboard.js
    │   │   ├── CourseDetailTeacher.js
    │   │   ├── TestDetailTeacher.js
    │   │   ├── StudentDashboard.js
    │   │   ├── CourseDetailStudent.js
    │   │   ├── ExamPage.js               ← Exam environment with security overlays
    │   │   └── ResultPage.js
    │   ├── components/
    │   │   ├── shared/
    │   │   │   ├── Avatar.js
    │   │   │   ├── AvatarUpload.js
    │   │   │   ├── Layout.js
    │   │   │   ├── NotificationBell.js
    │   │   │   ├── SettingsPage.js
    │   │   │   └── SubmitCelebration.js
    │   │   ├── teacher/
    │   │   │   ├── AnnouncementPanel.js
    │   │   │   ├── Leaderboard.js
    │   │   │   ├── LiveMonitorDashboard.js
    │   │   │   ├── MessagingPanel.js
    │   │   │   ├── QuestionEditor.js
    │   │   │   ├── ScreenRecordings.js
    │   │   │   ├── SecuritySettings.js
    │   │   │   ├── StudentResultsPanel.js ← Reusable component for student scores
    │   │   │   ├── TestAnalytics.js
    │   │   │   └── TheoryGrading.js
    │   │   └── student/
    │   │       ├── AILiveMonitor.js       ← Dual Array AI Proctoring Engine
    │   │       ├── AnnouncementsFeed.js
    │   │       └── StudentMessaging.js
    │   ├── hooks/
    │   │   └── useProctoring.js           ← Custom hook for exam logic & monitoring
    │   ├── context/
    │   │   └── AuthContext.js
    │   └── utils/
    │       ├── api.js
    │       ├── recordingStorage.js        ← Handles recording saves & cloud uploads
    │       └── socket.js
    ├── .env
    ├── .eslintrc.json
    ├── craco.config.js       ← CRA configuration override
    └── package.json
```

---

## ⚡ Quick Start

### 1. Backend Setup

```bash
cd exam-proctor/backend
npm install
# .env is already configured — edit if needed
npm run dev
```

Backend runs on: `http://localhost:5001`

### 2. Frontend Setup

```bash
cd exam-proctor/frontend
npm install
npm start
```

Frontend runs on: `http://localhost:3000`

---

## 🔐 Environment Variables (backend/.env)

```env
PORT=5001
MONGODB_URI=mongodb+srv://examUser:MyPass123@cluster0.kuckh2d.mongodb.net/examproc?retryWrites=true&w=majority
JWT_SECRET=your_super_secret_key
JWT_EXPIRE=7d
# GOOGLE_DRIVE_FOLDER_ID is required if Google Drive integration is used
```

---

## 👥 User Roles

### Admin
- View platform-wide statistics and dashboards.
- Monitor system logs and administrative events (`AdminLog`).
- Manage user interactions and general health of the system.

### Teacher
- Create and manage courses
- Admit students to courses (or share course code)
- Create tests with full configuration
- Add questions: MCQ, True/False, One Word, Theory
- Configure per-test security settings
- Set test visibility (all students or specific ones)
- Toggle result visibility
- View test analytics (score distribution, violation stats)
- View leaderboard per test
- Message students
- Review proctoring recordings seamlessly.

### Student
- Join courses via code
- View available tests per course
- Take proctored exams with all security enforced
- View results and answer review (if not hidden)
- Message teacher

---

## 🛡️ Security Features (all configurable per test)

| Feature | Description |
|---|---|
| Dual AI Active Monitoring | Real-time tracking via Google TensorFlow `COCO-SSD` (devices/cell phones) & `BlazeFace` (accurate facial frame lock). |
| Audio Spectral Analysis | Tracks ambient noise volume, calibrated to filter standard fan/hiss noise avoiding false-positives. |
| NLP Speech Tracking | Analyzes complete speech chunks to punish explicit conversations while ignoring localized coughing. |
| Local Hard-Lock Overlays | Instantly hides and freezes the exam interface with custom React Modals if Fullscreen is exited, maintaining clock integrity. |
| Hardware Feed Intercepts | Auto-submits exams instantly if the camera USB cable is unplugged or the browser permission is dynamically revoked. |
| Tab Switch Detection | Detects when student switches tabs or minimizes window |
| Violation Counter | Counts all security violations with type & timestamp |
| Fullscreen Enforcement | Forces fullscreen programmatically; blocks exams immediately if browser attempts to bypass it. |
| Copy/Paste Blocking | Blocks copy, paste, cut events via local JS override |
| Right-Click Blocking | Disables context menu completely |
| Auto-Submit on Max Violations | Submits exam when violation limit is hit (or falls back to Teacher-Lock Pausing) |
| One-Way Navigation | Prevents going back to previous questions |
| Question Randomization | Server-side shuffle, unique per student |
| Per-Question Time Tracking | Records time spent on each question |
| Screen & Camera WebRTC | Requests and maintains persistent screen and webcam streams to process violations. |
| Cloud Recording Uploads | Streams webcam footage and screen directly to Google Drive via backend buffers ensuring resilience against tampering. |

---

## 📊 Question Types

| Type | Auto-graded | Description |
|---|---|---|
| MCQ | ✅ | Multiple choice, single correct option |
| True/False | ✅ | Boolean question |
| One Word | ✅ | Case-insensitive exact match |
| Theory | ❌ | Manual grading by teacher, model answer provided |

---

## 📡 API Endpoints

### Auth
- `POST /api/auth/register` — Register user
- `POST /api/auth/login` — Login
- `GET /api/auth/me` — Get current user
- `GET /api/auth/students` — List all students (teacher)

### Courses
- `POST /api/courses` — Create course
- `GET /api/courses/my` — Get my courses
- `GET /api/courses/:id` — Get course details
- `POST /api/courses/:id/admit` — Admit student
- `DELETE /api/courses/:id/students/:studentId` — Remove student
- `POST /api/courses/join` — Join by code

### Tests
- `POST /api/tests` — Create test
- `GET /api/tests/course/:courseId` — List tests for course
- `GET /api/tests/:id` — Get test
- `PUT /api/tests/:id` — Update test
- `PUT /api/tests/:id/security` — Update security settings
- `PUT /api/tests/:id/visibility` — Update visibility
- `PUT /api/tests/:id/status` — Publish/close test

### Questions
- `POST /api/questions` — Add question
- `GET /api/questions/test/:testId` — Get questions
- `PUT /api/questions/:id` — Update question
- `DELETE /api/questions/:id` — Delete question

### Attempts
- `POST /api/attempts/start` — Start exam
- `POST /api/attempts/:id/answer` — Save answer
- `POST /api/attempts/:id/violation` — Record violation
- `POST /api/attempts/:id/submit` — Submit exam
- `GET /api/attempts/my/:testId` — Get my attempt
- `GET /api/attempts/test/:testId` — All attempts (teacher)
- `PUT /api/attempts/:id/grade` — Grade theory answer

### Recording & Uploads
- `POST /api/upload/chunk` — Streaming chunks upload for recordings
- `POST /api/recordings/finalize` — Finalize video files and trigger cloud upload
- `GET /api/recordings/:attemptId` — Stream recordings back to teacher panel

### Analytics
- `GET /api/analytics/test/:testId` — Full test analytics
- `GET /api/analytics/student/test/:testId` — Student result

### Messages
- `POST /api/messages` — Send message
- `GET /api/messages/conversation/:courseId/:userId` — Get conversation
- `GET /api/messages/students/:courseId` — All conversations (teacher)

---

## 🏗️ Tech Stack

**Backend:** Node.js, Express, MongoDB (Mongoose), Socket.io, JWT, bcryptjs, Admin Logs, Google Drive API

**Frontend:** React 18, React Router v6, Axios, Recharts, Socket.io-client, React Hot Toast

**AI & WebRTC:** `@tensorflow/tfjs`, `@tensorflow-models/coco-ssd`, `@tensorflow-models/blazeface`, Web Audio Context APIs, Web Speech Recognition APIs