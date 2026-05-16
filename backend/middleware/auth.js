const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Not authorized' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Special case: hardcoded admin token
    if (decoded.isAdmin) {
      req.user = {
        _id: 'admin',
        name: 'Super Admin',
        email: process.env.ADMIN_EMAIL,
        role: 'admin',
        isAdmin: true,
        isSuperAdmin: true,
      };
      return next();
    }

    req.user = await User.findById(decoded.id).select('-password');
    if (!req.user) return res.status(401).json({ message: 'User not found' });
    next();
  } catch (err) {
    res.status(401).json({ message: 'Invalid token' });
  }
};

const teacherOnly = (req, res, next) => {
  if (req.user.role !== 'teacher')
    return res.status(403).json({ message: 'Teacher access only' });
  next();
};

const studentOnly = (req, res, next) => {
  if (req.user.role !== 'student')
    return res.status(403).json({ message: 'Student access only' });
  next();
};

const adminOnly = (req, res, next) => {
  if (req.user?.role !== 'admin')
    return res.status(403).json({ message: 'Admin access required' });
  next();
};

module.exports = { protect, teacherOnly, studentOnly, adminOnly };