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
          const email = profile.emails?.[0]?.value;
          if (!email) return done(new Error("No email from Google"));

          const [rows] = await pool.query(
            "SELECT * FROM users WHERE google_id = ? OR email = ? LIMIT 1",
            [profile.id, email]
          );
          const users = rows as Record<string, unknown>[];

          if (users.length > 0) {
            const user = users[0];
            if (!user.google_id) {
              await pool.query("UPDATE users SET google_id = ? WHERE id = ?", [profile.id, user.id]);
              user.google_id = profile.id;
            }
            return done(null, user as unknown as Express.User);
          }

          const displayName = profile.displayName || email.split("@")[0];
          const [result] = await pool.query(
            "INSERT INTO users (email, display_name, google_id, role) VALUES (?, ?, ?, 'user')",
            [email, displayName, profile.id]
          );
          const newUser = {
            id: (result as { insertId: number }).insertId,
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
