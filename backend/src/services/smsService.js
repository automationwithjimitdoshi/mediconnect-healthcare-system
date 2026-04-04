// services/smsService.js — Twilio SMS
const twilio = require('twilio');

const client = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
  ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;

async function sendSMS(to, body) {
  if (!client) {
    console.log(`[SMS MOCK] To: ${to} | Message: ${body}`);
    return { mock: true };
  }
  try {
    const message = await client.messages.create({
      body,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: to.startsWith('+') ? to : `+91${to.replace(/^0/, '')}`
    });
    console.log(`SMS sent: ${message.sid}`);
    return message;
  } catch (err) {
    console.error('SMS error:', err.message);
    return null;
  }
}

module.exports = { sendSMS };

// ─────────────────────────────────────────────────────
// services/emailService.js — Nodemailer Email
// (Append below or create separate file)
