import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST!,
  port: Number(process.env.SMTP_PORT ?? 587),
  secure: false,
  auth: {
    user: process.env.SMTP_USER!,
    pass: process.env.SMTP_PASS!,
  },
});

const RESET_CONTENT: Record<string, { subject: string; body: (code: string) => string }> = {
  ko: {
    subject: "[Akademiya] 비밀번호 재설정 코드",
    body: (code) => `비밀번호 재설정 코드: <strong>${code}</strong><br>15분 내에 입력해주세요.`,
  },
  en: {
    subject: "[Akademiya] Password Reset Code",
    body: (code) => `Your password reset code: <strong>${code}</strong><br>This code expires in 15 minutes.`,
  },
  ja: {
    subject: "[Akademiya] パスワードリセットコード",
    body: (code) => `パスワードリセットコード: <strong>${code}</strong><br>15分以内に入力してください。`,
  },
  zh: {
    subject: "[Akademiya] 密码重置验证码",
    body: (code) => `您的密码重置验证码：<strong>${code}</strong><br>请在15分钟内使用。`,
  },
};

export async function sendPasswordResetEmail(to: string, code: string, lang = "en") {
  const content = RESET_CONTENT[lang] ?? RESET_CONTENT.en;

  if (process.env.NODE_ENV !== "production") {
    console.log(`[DEV] Password reset code for ${to}: ${code}`);
    return;
  }

  await transporter.sendMail({
    from: process.env.EMAIL_FROM!,
    to,
    subject: content.subject,
    html: `<p>${content.body(code)}</p>`,
  });
}
