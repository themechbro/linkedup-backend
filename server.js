require("dotenv").config();
const express = require("express");
const app = express();
const cors = require("cors");
const pg = require("pg");
const connectPgSimple = require("connect-pg-simple");
const session = require("express-session");
const pool = require("./db");

const PgSession = connectPgSimple(session);

app.use(
  cors({
    origin: ["http://localhost:3000", "http://192.168.1.6:3000"], // your frontend URLs
    credentials: true, // ✅ allow cookies
  })
);

app.use(
  session({
    store: new PgSession({
      pool,
      tableName: "session",
    }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24, // 1 day
      secure: false, // ❌ false for local dev (HTTP)
      sameSite: "lax", // ✅ safe for local dev
    },
  })
);

// Middlewares
app.use(express.json()); // Body parser for JSON

// Route Imports
const mainRoutes = require("./routes/index");
const SignupRoute = require("./routes/auth/signup");
const LoginRoute = require("./routes/auth/login");
const CheckAuth = require("./routes/auth/check-status");
const Logout = require("./routes/auth/logout");
const passport = require("./auth/passport");
const GoogleOauthRoutes = require("./routes/auth/google");
// Mount Routes
app.use(passport.initialize());
app.use(passport.session());
app.use("/", mainRoutes);
app.use("/api/auth", SignupRoute); // All routes in SignupRoute will be prefixed with /api/auth
app.use("/api/auth", LoginRoute);
app.use("/api/auth", GoogleOauthRoutes);
app.use("/api/auth", CheckAuth);
app.use("/api/auth", Logout);

app.listen(8000, "0.0.0.0", () => {
  console.log("Server is running on port 8000");
});
