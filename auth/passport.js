const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const pool = require("../db");
const FacebookStrategy = require("passport-facebook").Strategy;

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
        const email = profile.emails?.[0]?.value;
        const firstName = profile.name?.givenName || "";
        const lastName = profile.name?.familyName || "";
        const fullName = `${firstName} ${lastName}`.trim();

        // fallback if fullName missing
        const username = fullName || profile.displayName || "Google User";

        const result = await pool.query("SELECT * FROM users WHERE email=$1", [
          email,
        ]);
        let user;

        if (result.rows.length === 0) {
          const insertResult = await pool.query(
            `INSERT INTO users (username, email, password, type, created_at, full_name)
             VALUES ($1, $2, $3, $4, NOW(), $5)
             RETURNING *`,
            [username, email, "oauth_user", "oauth_google", fullName]
          );
          user = insertResult.rows[0];
        } else {
          user = result.rows[0];
        }

        done(null, user);
      } catch (err) {
        console.error("Google strategy error:", err);
        done(err, null);
      }
    }
  )
);

// Facebook Oauth Strategy Config
passport.use(
  new FacebookStrategy(
    {
      clientID: process.env.FB_APP_ID,
      clientSecret: process.env.FB_SECRET,
      callbackURL: `${process.env.BACKEND_URL}/api/auth/facebook/callback`,
      profileFields: ["id", "emails", "name"],
      enableProof: true,
    },
    // async (accessToken, refreshToken, profile, done) => {
    //   console.log("Facebook profile:", profile);

    //   try {
    //     const email = profile.emails
    //       ? profile.emails[0].value
    //       : `${profile.id}@facebook.com`;
    //     const username = `${profile.name.givenName || ""} ${
    //       profile.name.familyName || ""
    //     }`.trim();
    //     let result = await pool.query("SELECT * FROM users WHERE email=$1", [
    //       email,
    //     ]);
    //     let user;

    //     if (result.rows.length === 0) {
    //       result = await pool.query(
    //         `INSERT INTO users (username, email, password, type, created_at)
    //          VALUES ($1, $2, $3, $4, NOW())
    //          RETURNING *`,
    //         [username || "FB User", email, "oauth_user", "oauth_fb"]
    //       );
    //     }

    //     user = result.rows[0];
    //     done(null, user);
    //   } catch (err) {
    //     done(err, null);
    //   }
    // }

    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails
          ? profile.emails[0].value
          : `${profile.id}@facebook.com`;

        const result = await pool.query("SELECT * FROM users WHERE email=$1", [
          email,
        ]);

        let user;
        if (result.rows.length === 0) {
          const insertResult = await pool.query(
            `INSERT INTO users (username, email, password, type, created_at, full_name)
         VALUES ($1, $2, $3, $4, NOW(),$5)
         RETURNING *`,
            [
              `${profile.name.givenName || ""} 
              }`.trim(),
              email,
              "oauth_user",
              "oauth_fb",
              `${profile.name.givenName || ""} ${profile.name.familyName || ""}
              }`.trim(),
            ]
          );
          user = insertResult.rows[0];
        } else {
          user = result.rows[0];
        }

        done(null, user);
      } catch (err) {
        console.error("Facebook strategy error:", err);
        done(err, null);
      }
    }
  )
);

module.exports = passport;
