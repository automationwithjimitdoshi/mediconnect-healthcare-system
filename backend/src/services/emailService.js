// services/emailService.js
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

const templates = {
  'appointment-confirmation': (data) => ({
    subject: `Appointment Confirmed — ${data.doctor.firstName} ${data.doctor.lastName}`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
        <div style="background:#0c1a2e;padding:20px;border-radius:8px;text-align:center;margin-bottom:24px">
          <h2 style="color:white;margin:0">MediConnect AI</h2>
          <p style="color:rgba(255,255,255,0.6);margin:4px 0 0;font-size:13px">Healthcare Intelligence Platform</p>
        </div>
        <h3 style="color:#1565c0">✅ Appointment Confirmed</h3>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:8px;color:#666;border-bottom:1px solid #eee">Doctor</td><td style="padding:8px;font-weight:600;border-bottom:1px solid #eee">Dr. ${data.doctor.firstName} ${data.doctor.lastName}</td></tr>
          <tr><td style="padding:8px;color:#666;border-bottom:1px solid #eee">Specialty</td><td style="padding:8px;border-bottom:1px solid #eee">${data.doctor.specialty}</td></tr>
          <tr><td style="padding:8px;color:#666;border-bottom:1px solid #eee">Date & Time</td><td style="padding:8px;font-weight:600;border-bottom:1px solid #eee">${data.apptDate}</td></tr>
          <tr><td style="padding:8px;color:#666">Hospital</td><td style="padding:8px">${data.doctor.hospital}</td></tr>
        </table>
        <p style="background:#e3f0ff;padding:12px;border-radius:6px;font-size:13px;color:#1565c0">
          📱 Reminders will be sent 24 hours and 1 hour before your appointment.
        </p>
        <p style="font-size:12px;color:#999;margin-top:24px">MediConnect AI · This is an automated message</p>
      </div>`
  }),
  'appointment-reschedule': (data) => ({
    subject: `Appointment Rescheduled — MediConnect AI`,
    html: `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px"><h3 style="color:#b45309">🔄 Appointment Rescheduled</h3><p>Your appointment has been moved to <strong>${data.newDate}</strong>.</p></div>`
  }),
  'appointment-cancelled': (data) => ({
    subject: `Appointment Cancelled — MediConnect AI`,
    html: `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px"><h3 style="color:#c62828">❌ Appointment Cancelled</h3><p>Your appointment has been cancelled. ${data.refundNote || ''}</p></div>`
  })
};

async function sendEmail({ to, subject, template, data, html }) {
  if (!process.env.SMTP_USER) {
    console.log(`[EMAIL MOCK] To: ${to} | Subject: ${subject}`);
    return { mock: true };
  }

  let emailHtml = html;
  let emailSubject = subject;

  if (template && templates[template]) {
    const generated = templates[template](data || {});
    emailHtml    = generated.html;
    emailSubject = generated.subject;
  }

  try {
    const info = await transporter.sendMail({
      from:    process.env.EMAIL_FROM || 'MediConnect AI <noreply@mediconnect.ai>',
      to,
      subject: emailSubject,
      html:    emailHtml
    });
    console.log(`Email sent: ${info.messageId}`);
    return info;
  } catch (err) {
    console.error('Email error:', err.message);
    return null;
  }
}

module.exports = { sendEmail };
