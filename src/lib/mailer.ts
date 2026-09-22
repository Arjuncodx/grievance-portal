import nodemailer from "nodemailer";

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return null;
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  }
  return transporter;
}

export async function sendMail(to: string, subject: string, html: string): Promise<boolean> {
  const t = getTransporter();
  if (!t) {
    // SMTP not configured — log to server console so the flow is still
    // testable end-to-end in dev without a mail server.
    console.log(`[mailer] SMTP not configured. Would have sent to ${to}: ${subject}`);
    return false;
  }
  try {
    await t.sendMail({
      from: process.env.SMTP_FROM || `"District Collectorate - Chennai" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html
    });
    return true;
  } catch (err) {
    console.error("[mailer] Failed to send email:", err);
    return false;
  }
}

export function otpEmailHtml(otp: string, purposeLabel: string): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color: #0B3D91;">District Collectorate - Chennai</h2>
      <p>Your One-Time Password (OTP) for ${purposeLabel} is:</p>
      <p style="font-size: 28px; font-weight: bold; letter-spacing: 4px; color: #0B3D91;">${otp}</p>
      <p>This OTP is valid for 10 minutes. Do not share it with anyone.</p>
      <p style="color: #666; font-size: 12px;">If you did not request this, you can safely ignore this email.</p>
    </div>
  `;
}
