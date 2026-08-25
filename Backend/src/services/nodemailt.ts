// services/email.service.ts
import nodemailer from 'nodemailer';

// Configuración global del transporte
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.example.com',
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER || 'tu_usuario',
    pass: process.env.SMTP_PASS || 'tu_contraseña',
  },
});

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  attachments?: Array<{
    filename: string;
    path?: string;
    content?: Buffer;
    contentType?: string;
  }>;
}

export async function enviarCorreoService(options: SendEmailOptions) {
  const { to, subject, html, attachments } = options;

  const info = await transporter.sendMail({
    from: `"Mi Sistema" <${process.env.SMTP_USER}>`,
    to,
    subject,
    html,
    attachments,
  });

  return info;
}