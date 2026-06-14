import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { pool } from "../db/pool.js";

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL!,
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const emailEntry = profile.emails?.[0];
          const email = emailEntry?.value;
          if (!email) return done(new Error("No email from Google"));

          // Google이 이메일 소유를 검증했는지 확인
          // (passport 버전별로 emails[].verified 또는 _json.email_verified 제공)
          const emailVerified =
            (emailEntry as { verified?: boolean | string }).verified === true ||
            (emailEntry as { verified?: boolean | string }).verified === "true" ||
            (profile._json as { email_verified?: boolean })?.email_verified === true;

          // 1) 이미 연동된 계정(google_id 일치)은 항상 안전하게 로그인
          const [byGoogle] = await pool.query(
            "SELECT * FROM users WHERE google_id = ? LIMIT 1",
            [profile.id]
          );
          const googleUsers = byGoogle as Record<string, unknown>[];
          if (googleUsers.length > 0) {
            return done(null, googleUsers[0] as unknown as Express.User);
          }

          // 이후 단계(이메일 매칭/신규 생성/도메인 자동가입)는
          // Google이 이메일 소유를 검증한 경우에만 허용한다.
          if (!emailVerified) {
            return done(null, false, { message: "EMAIL_NOT_VERIFIED" });
          }

          // 2) 동일 이메일의 기존 계정에 연동
          const [byEmail] = await pool.query(
            "SELECT * FROM users WHERE email = ? LIMIT 1",
            [email]
          );
          const emailUsers = byEmail as Record<string, unknown>[];
          if (emailUsers.length > 0) {
            const user = emailUsers[0];
            if (!user.google_id) {
              await pool.query("UPDATE users SET google_id = ? WHERE id = ?", [profile.id, user.id]);
              user.google_id = profile.id;
            }
            return done(null, user as unknown as Express.User);
          }

          // 3) 신규 가입 (검증된 이메일이므로 도메인 자동가입 허용)
          const displayName = profile.displayName || email.split("@")[0];
          const [result] = await pool.query(
            "INSERT INTO users (email, display_name, google_id, role) VALUES (?, ?, ?, 'user')",
            [email, displayName, profile.id]
          );
          const newUserId = (result as { insertId: number }).insertId;

          // ── 학교 이메일 도메인 자동 조직 가입 ──────────────────────
          const emailDomain = email.toLowerCase().split("@")[1];
          if (emailDomain) {
            const [matchingOrgs] = await pool.query(
              "SELECT id FROM organizations WHERE google_domain = ? AND status = 'approved'",
              [emailDomain]
            );
            for (const org of (matchingOrgs as { id: number }[])) {
              await pool.query(
                "INSERT IGNORE INTO org_members (org_id, user_id, permission) VALUES (?, ?, 0)",
                [org.id, newUserId]
              );
            }
          }

          const newUser = {
            id: newUserId,
            email,
            display_name: displayName,
            google_id: profile.id,
            country: null,
            phone: null,
            role: "user" as const,
          };
          return done(null, newUser as Express.User);
        } catch (err) {
          return done(err as Error);
        }
      }
    )
  );
}

export default passport;
