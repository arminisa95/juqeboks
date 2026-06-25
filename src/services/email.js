const nodemailer = require('nodemailer');

const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = parseInt(process.env.SMTP_PORT, 10) || 587;
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || 'noreply@juqeboks.de';
const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:3000';

const hasSmtpConfig = SMTP_HOST && SMTP_USER && SMTP_PASS;

const transporter = hasSmtpConfig
    ? nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_PORT === 465,
        auth: {
            user: SMTP_USER,
            pass: SMTP_PASS,
        },
    })
    : null;

async function sendEmailVerification(user, token) {
    const verifyUrl = `${APP_BASE_URL}/verify-email.html?token=${encodeURIComponent(token)}`;
    const html = `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
            <h2>Willkommen bei juqeboks!</h2>
            <p>Bestätige deine E-Mail-Adresse, um dein Konto zu aktivieren:</p>
            <p><a href="${verifyUrl}" style="display: inline-block; padding: 12px 24px; background: #007bff; color: #fff; text-decoration: none; border-radius: 6px;">E-Mail bestätigen</a></p>
            <p>Oder verwende diesen Code: <strong>${token}</strong></p>
            <p>Falls du dich nicht registriert hast, kannst du diese E-Mail ignorieren.</p>
        </div>
    `;

    const text = `Willkommen bei juqeboks! Bestätige deine E-Mail mit diesem Code: ${token}\n\nLink: ${verifyUrl}`;

    if (!transporter) {
        console.log('SMTP not configured. Verification email simulated for', user.email);
        return { simulated: true, token };
    }

    try {
        await transporter.sendMail({
            from: SMTP_FROM,
            to: user.email,
            subject: 'Bestätige deine E-Mail-Adresse bei juqeboks',
            text,
            html,
        });
        return { sent: true };
    } catch (error) {
        console.error('Failed to send verification email:', error);
        return { sent: false, error: error.message };
    }
}

module.exports = { sendEmailVerification };
