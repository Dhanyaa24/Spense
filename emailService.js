/**
 * Spense Email Service
 * Handles all email notifications:
 * - Login welcome emails
 * - Monthly spending summaries
 * - Yearly spending summaries
 *
 * SETUP:
 *   Uses Resend for email delivery.
 *   1. Create a Resend account
 *   2. Set RESEND_API_KEY in your environment
 */

require('dotenv').config();
const { Resend } = require('resend');

// ─── CONFIG ───────────────────────────────────────────────────────────────────
// Values are now pulled from the .env file
const resend = new Resend(process.env.RESEND_API_KEY);
const EMAIL_FROM = process.env.EMAIL_FROM || 'onboarding@resend.dev';
const APP_URL = process.env.APP_URL || 'http://localhost:3000';
const RESET_LINK_EXPIRY_HOURS = Number(process.env.RESET_TOKEN_EXPIRY_HOURS) || 6;
const RESET_LINK_EXPIRY_TEXT = RESET_LINK_EXPIRY_HOURS === 1 ? '1 hour' : `${RESET_LINK_EXPIRY_HOURS} hours`;
// ──────────────────────────────────────────────────────────────────────────────

if (!process.env.RESEND_API_KEY) {
  console.warn('⚠️  RESEND_API_KEY is missing. Set it in your .env or Railway Variables.');
}

async function sendMail({ to, subject, html }) {
  const { error } = await resend.emails.send({
    from: `Spense <${EMAIL_FROM}>`,
    to,
    subject,
    html
  });

  if (error) {
    throw new Error(`Resend error: ${error.message}`);
  }
}

// ─── SHARED STYLES ────────────────────────────────────────────────────────────
const emailBase = (content) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Spense</title>
</head>
<body style="margin:0;padding:0;background:#FFFAF2;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FFFAF2;padding:30px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background:#818263;border-radius:16px 16px 0 0;padding:32px 40px;text-align:center;">
              <h1 style="margin:0;font-size:2rem;font-style:italic;color:white;letter-spacing:-0.5px;">Spense</h1>
              <p style="margin:6px 0 0;color:rgba(255,255,255,0.8);font-size:0.9rem;">Smart money, smarter you.</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background:white;padding:36px 40px;border-left:1px solid #F6EAD4;border-right:1px solid #F6EAD4;">
              ${content}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#F6EAD4;border-radius:0 0 16px 16px;padding:20px 40px;text-align:center;">
              <p style="margin:0;color:#818263;font-size:0.8rem;">You're receiving this because you have a Spense account.</p>
              <p style="margin:4px 0 0;color:#818263;font-size:0.75rem;">© ${new Date().getFullYear()} Spense</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

// ─── EMAIL: LOGIN NOTIFICATION ─────────────────────────────────────────────────
async function sendLoginEmail(userName, userEmail) {
  const now = new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'long',
    timeStyle: 'short'
  });

  const content = `
        <h2 style="color:#818263;font-size:1.6rem;font-style:italic;margin:0 0 8px;">Hey, ${userName}! 👋</h2>
        <p style="color:#5a5a5a;margin:0 0 24px;font-size:1rem;line-height:1.6;">
            Thanks for logging in to Spense. We noticed a new login to your account.
        </p>

        <div style="background:#FFFAF2;border:1px solid #F6EAD4;border-radius:12px;padding:20px;margin-bottom:24px;">
            <p style="margin:0 0 8px;font-size:0.85rem;color:#818263;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Login Details</p>
            <p style="margin:0;color:#2d2d2d;font-size:0.95rem;">🕐 <strong>${now}</strong> (IST)</p>
            <p style="margin:4px 0 0;color:#5a5a5a;font-size:0.9rem;">📧 ${userEmail}</p>
        </div>

        <p style="color:#5a5a5a;font-size:0.95rem;line-height:1.6;margin:0 0 24px;">
            Ready to track your spending? Head to your dashboard and keep your budget on point! 💪
        </p>

        <div style="text-align:center;margin:28px 0;">
            <a href="${APP_URL}/dashboard.html"
               style="background:#818263;color:white;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:600;font-size:0.95rem;display:inline-block;">
               Open Dashboard →
            </a>
        </div>

        <p style="color:#aaa;font-size:0.82rem;margin:20px 0 0;text-align:center;">
            Wasn't you? Please change your password immediately.
        </p>
    `;

  try {
    await sendMail({
      to: userEmail,
      subject: `Hey ${userName}, you just logged in to Spense 👋`,
      html: emailBase(content)
    });
    console.log(`📧 Login email sent to ${userEmail}`);
  } catch (err) {
    console.warn(`⚠️  Could not send login email: ${err.message}`);
  }
}

// ─── EMAIL: MONTHLY SUMMARY ────────────────────────────────────────────────────
async function sendMonthlySummaryEmail(user, summaryData) {
  const { totalSpent, budget, topCategory, expenseCount, savings } = summaryData;
  const monthName = new Date().toLocaleString('en-IN', { month: 'long', year: 'numeric' });
  const savingsColor = savings >= 0 ? '#818263' : '#EF5350';
  const savingsLabel = savings >= 0 ? 'Saved' : 'Overspent';

  const content = `
        <h2 style="color:#818263;font-size:1.6rem;font-style:italic;margin:0 0 4px;">Your ${monthName} Summary 📊</h2>
        <p style="color:#5a5a5a;margin:0 0 28px;font-size:0.95rem;">Here's how your spending shaped up this month, ${user.name}.</p>

        <!-- Stats Grid -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
          <tr>
            <td width="50%" style="padding-right:8px;">
              <div style="background:#818263;border-radius:12px;padding:20px;text-align:center;">
                <p style="margin:0;color:rgba(255,255,255,0.8);font-size:0.8rem;text-transform:uppercase;letter-spacing:0.5px;">Total Spent</p>
                <p style="margin:6px 0 0;color:white;font-size:1.8rem;font-weight:700;">₹${(totalSpent || 0).toLocaleString('en-IN')}</p>
              </div>
            </td>
            <td width="50%" style="padding-left:8px;">
              <div style="background:#F6EAD4;border-radius:12px;padding:20px;text-align:center;">
                <p style="margin:0;color:#818263;font-size:0.8rem;text-transform:uppercase;letter-spacing:0.5px;">Budget</p>
                <p style="margin:6px 0 0;color:#2d2d2d;font-size:1.8rem;font-weight:700;">₹${(budget || 0).toLocaleString('en-IN')}</p>
              </div>
            </td>
          </tr>
          <tr>
            <td width="50%" style="padding-right:8px;padding-top:12px;">
              <div style="background:#FFFAF2;border:1px solid #F6EAD4;border-radius:12px;padding:20px;text-align:center;">
                <p style="margin:0;color:#818263;font-size:0.8rem;text-transform:uppercase;letter-spacing:0.5px;">${savingsLabel}</p>
                <p style="margin:6px 0 0;color:${savingsColor};font-size:1.8rem;font-weight:700;">₹${Math.abs(savings || 0).toLocaleString('en-IN')}</p>
              </div>
            </td>
            <td width="50%" style="padding-left:8px;padding-top:12px;">
              <div style="background:#FFFAF2;border:1px solid #F6EAD4;border-radius:12px;padding:20px;text-align:center;">
                <p style="margin:0;color:#818263;font-size:0.8rem;text-transform:uppercase;letter-spacing:0.5px;">Transactions</p>
                <p style="margin:6px 0 0;color:#2d2d2d;font-size:1.8rem;font-weight:700;">${expenseCount || 0}</p>
              </div>
            </td>
          </tr>
        </table>

        ${topCategory ? `
        <div style="background:#FFFAF2;border:1px solid #F6EAD4;border-radius:12px;padding:16px 20px;margin-bottom:24px;">
            <p style="margin:0;color:#818263;font-size:0.85rem;font-weight:600;">🏆 Top Spending Category</p>
            <p style="margin:6px 0 0;color:#2d2d2d;font-size:1.1rem;font-weight:600;">${topCategory.label} &nbsp;—&nbsp; ₹${topCategory.total.toLocaleString('en-IN')}</p>
        </div>` : ''}

        <div style="text-align:center;margin:28px 0;">
            <a href="${APP_URL}/dashboard.html"
               style="background:#818263;color:white;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:600;font-size:0.95rem;display:inline-block;">
               View Full Dashboard →
            </a>
        </div>
    `;

  try {
    await sendMail({
      to: user.email,
      subject: `Your ${monthName} spending summary is ready 📊`,
      html: emailBase(content)
    });
    console.log(`📧 Monthly summary sent to ${user.email}`);
  } catch (err) {
    console.warn(`⚠️  Could not send monthly summary: ${err.message}`);
  }
}

// ─── EMAIL: YEARLY SUMMARY ─────────────────────────────────────────────────────
async function sendYearlySummaryEmail(user, summaryData) {
  const { totalSpent, totalBudget, topCategory, expenseCount, avgMonthly, bestMonth, worstMonth } = summaryData;
  const year = new Date().getFullYear() - 1; // sends for previous year

  const content = `
        <h2 style="color:#818263;font-size:1.6rem;font-style:italic;margin:0 0 4px;">Your ${year} Year in Review ✨</h2>
        <p style="color:#5a5a5a;margin:0 0 28px;font-size:0.95rem;">What a year! Here's everything you spent in ${year}, ${user.name}.</p>

        <!-- Big stat -->
        <div style="background:#818263;border-radius:16px;padding:28px;text-align:center;margin-bottom:20px;">
            <p style="margin:0;color:rgba(255,255,255,0.8);font-size:0.9rem;text-transform:uppercase;letter-spacing:0.5px;">Total Spent in ${year}</p>
            <p style="margin:10px 0 0;color:white;font-size:2.8rem;font-weight:700;">₹${(totalSpent || 0).toLocaleString('en-IN')}</p>
            <p style="margin:6px 0 0;color:rgba(255,255,255,0.7);font-size:0.9rem;">${expenseCount} transactions across the year</p>
        </div>

        <!-- Stats Grid -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
          <tr>
            <td width="50%" style="padding-right:8px;">
              <div style="background:#F6EAD4;border-radius:12px;padding:20px;text-align:center;">
                <p style="margin:0;color:#818263;font-size:0.8rem;text-transform:uppercase;letter-spacing:0.5px;">Avg Monthly</p>
                <p style="margin:6px 0 0;color:#2d2d2d;font-size:1.6rem;font-weight:700;">₹${(avgMonthly || 0).toLocaleString('en-IN')}</p>
              </div>
            </td>
            <td width="50%" style="padding-left:8px;">
              <div style="background:#FFFAF2;border:1px solid #F6EAD4;border-radius:12px;padding:20px;text-align:center;">
                <p style="margin:0;color:#818263;font-size:0.8rem;text-transform:uppercase;letter-spacing:0.5px;">Best Month</p>
                <p style="margin:6px 0 0;color:#818263;font-size:1.4rem;font-weight:700;">${bestMonth || '—'}</p>
              </div>
            </td>
          </tr>
        </table>

        ${topCategory ? `
        <div style="background:#FFFAF2;border:1px solid #F6EAD4;border-radius:12px;padding:16px 20px;margin-bottom:24px;">
            <p style="margin:0;color:#818263;font-size:0.85rem;font-weight:600;">🏆 Biggest Spending Category of ${year}</p>
            <p style="margin:6px 0 0;color:#2d2d2d;font-size:1.1rem;font-weight:600;">${topCategory.label} &nbsp;—&nbsp; ₹${topCategory.total.toLocaleString('en-IN')}</p>
        </div>` : ''}

        <div style="text-align:center;margin:28px 0;">
            <a href="${APP_URL}/dashboard.html"
               style="background:#818263;color:white;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:600;font-size:0.95rem;display:inline-block;">
               Explore Your Dashboard →
            </a>
        </div>
    `;

  try {
    await sendMail({
      to: user.email,
      subject: `Your ${year} Spense Year in Review ✨`,
      html: emailBase(content)
    });
    console.log(`📧 Yearly summary sent to ${user.email}`);
  } catch (err) {
    console.warn(`⚠️  Could not send yearly summary: ${err.message}`);
  }
}

// ─── EMAIL: PASSWORD RESET ─────────────────────────────────────────────────────
async function sendPasswordResetEmail(userName, userEmail, resetToken) {
  const resetLink = `${APP_URL}/reset-password.html?token=${resetToken}`;

  const content = `
        <h2 style="color:#818263;font-size:1.6rem;font-style:italic;margin:0 0 8px;">Reset your password</h2>
        <p style="color:#5a5a5a;margin:0 0 24px;font-size:1rem;line-height:1.6;">
            Hey ${userName}, we received a request to reset your Spense password. Click the button below to choose a new one.
        </p>

        <div style="text-align:center;margin:32px 0;">
            <a href="${resetLink}"
               style="background:#818263;color:white;text-decoration:none;padding:16px 40px;border-radius:12px;font-weight:600;font-size:1rem;display:inline-block;letter-spacing:0.3px;">
                Reset Password →
            </a>
        </div>

        <div style="background:#FFFAF2;border:1px solid #F6EAD4;border-radius:12px;padding:16px 20px;margin-bottom:20px;">
            <p style="margin:0;font-size:0.82rem;color:#818263;font-weight:600;">Link expires in ${RESET_LINK_EXPIRY_TEXT}</p>
            <p style="margin:6px 0 0;font-size:0.82rem;color:#5a5a5a;">If the button doesn't work, copy this link:<br>
              <span style="color:#818263;word-break:break-all;">${resetLink}</span>
            </p>
        </div>

        <p style="color:#aaa;font-size:0.82rem;margin:20px 0 0;text-align:center;">
            Didn't request this? You can safely ignore this email — your password won't change.
        </p>
    `;

  try {
    await sendMail({
      to: userEmail,
      subject: `Reset your Spense password`,
      html: emailBase(content)
    });
    console.log(`📧 Password reset email sent to ${userEmail}`);
  } catch (err) {
    console.error(`❌ Could not send reset email to ${userEmail}: ${err.message}`);
    if (err.response) {
      console.error('Email response:', err.response);
    }
    throw err;
  }
}

module.exports = { sendLoginEmail, sendMonthlySummaryEmail, sendYearlySummaryEmail, sendPasswordResetEmail };
