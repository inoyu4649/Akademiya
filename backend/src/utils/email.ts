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

export async function sendPasswordResetEmail(to: string, code: string, lang: "ko" | "en" = "en") {
  const subject = lang === "ko" ? "[Akademiya] 비밀번호 재설정 코드" : "[Akademiya] Password Reset Code";
  const body =
    lang === "ko"
      ? `비밀번호 재설정 코드: <strong>${code}</strong><br>15분 내에 입력해주세요.`
      : `Your password reset code: <strong>${code}</strong><br>This code expires in 15 minutes.`;

  if (process.env.NODE_ENV !== "production") {
    console.log(`[DEV] Password reset code for ${to}: ${code}`);
    return;
  }

  await transporter.sendMail({
    from: process.env.EMAIL_FROM!,
    to,
    subject,
    html: `<p>${body}</p>`,
  });
}
