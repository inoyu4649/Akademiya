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

/** AkashaAlt API 비밀번호 변경/초기화 인증코드 이메일 (UI가 한국어 전용이라 본문도 한국어 고정) */
export async function sendVaultCodeEmail(to: string, code: string): Promise<void> {
  if (process.env.NODE_ENV !== "production") {
    console.log(`[DEV] AkashaAlt vault code for ${to}: ${code}`);
    return;
  }

  await transporter.sendMail({
    from: process.env.EMAIL_FROM!,
    to,
    subject: "[AkashaAlt] API 비밀번호 변경 인증코드",
    html:
      `<p>AkashaAlt API 비밀번호 변경/초기화 인증코드: <strong>${code}</strong><br>` +
      `15분 내에 입력해주세요.<br>` +
      `본인이 요청하지 않았다면 이 메일을 무시하세요.</p>`,
  });
}
