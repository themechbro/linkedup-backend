const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const pool = require("../db");

// Serialize user to session
passport.serializeUser((user, done) => {
  done(null, user.username);
});

// Deserialize user from session
passport.deserializeUser(async (username, done) => {
  try {
    const result = await pool.query("SELECT * FROM users WHERE username = $1", [
      username,
    ]);
    done(null, result.rows[0]);
  } catch (err) {
    done(err, null);
  }
});

// Configure Google OAuth strategy
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: `${process.env.BACKEND_URL}/api/auth/google/callback`,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails[0].value;
        const username = profile.displayName;

        let result = await pool.query("SELECT * FROM users WHERE email=$1", [
          email,
        ]);

        let user;
        if (result.rows.length === 0) {
          // Create a new user if not found
          result = await pool.query(
            `INSERT INTO users (username, email, password)
             VALUES ($1, $2, $3)
             RETURNING *`,
            [username, email, "oauth_user"]
          );
        }

        user = result.rows[0];
        done(null, user);
      } catch (err) {
        done(err, null);
      }
    }
  )
);

module.exports = passport;
