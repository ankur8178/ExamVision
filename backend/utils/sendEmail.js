const nodemailer = require('nodemailer');

const sendEmail = async ({ email, subject, html }) => {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_PASS,   // Gmail App Password (not your real password)
    },
  });

  await transporter.sendMail({
    from: `"ExamVision" <${process.env.GMAIL_USER}>`,
    to: email,
    subject,
    html,
  });
};

module.exports = sendEmail;