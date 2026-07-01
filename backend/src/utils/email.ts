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

const VAULT_CODE_CONTENT: Record<string, { subject: string; body: (code: string) => string }> = {
  ko: {
    subject: "[AkashaAlt] API 비밀번호 변경 인증코드",
    body: (code) =>
      `AkashaAlt API 비밀번호 변경/초기화 인증코드: <strong>${code}</strong><br>15분 내에 입력해주세요.<br>` +
      `본인이 요청하지 않았다면 이 메일을 무시하세요.`,
  },
  en: {
    subject: "[AkashaAlt] API Password Change Verification Code",
    body: (code) =>
      `Your AkashaAlt API password change/reset code: <strong>${code}</strong><br>This code expires in 15 minutes.<br>` +
      `If you didn't request this, please ignore this email.`,
  },
  ja: {
    subject: "[AkashaAlt] APIパスワード変更認証コード",
    body: (code) =>
      `AkashaAlt APIパスワード変更・初期化の認証コード: <strong>${code}</strong><br>15分以内に入力してください。<br>` +
      `心当たりがない場合はこのメールを無視してください。`,
  },
  zh: {
    subject: "[AkashaAlt] API 密码修改验证码",
    body: (code) =>
      `AkashaAlt API 密码修改/重置验证码：<strong>${code}</strong><br>请在15分钟内使用。<br>` +
      `如果不是您本人操作，请忽略此邮件。`,
  },
};

export async function sendVaultCodeEmail(to: string, code: string, lang = "en") {
  const content = VAULT_CODE_CONTENT[lang] ?? VAULT_CODE_CONTENT.en;

  if (process.env.NODE_ENV !== "production") {
    console.log(`[DEV] AkashaAlt vault code for ${to}: ${code}`);
    return;
  }

  await transporter.sendMail({
    from: process.env.EMAIL_FROM!,
    to,
    subject: content.subject,
    html: `<p>${content.body(code)}</p>`,
  });
}
