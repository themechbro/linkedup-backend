require("dotenv").config();
const express = require("express");
const app = express();
const cors = require("cors");
const pg = require("pg");
const connectPgSimple = require("connect-pg-simple");
const session = require("express-session");
const pool = require("./db");
const path = require("path");

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
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Route Imports
const mainRoutes = require("./routes/index");
const SignupRoute = require("./routes/auth/signup");
const LoginRoute = require("./routes/auth/login");
const CheckAuth = require("./routes/auth/check-status");
const Logout = require("./routes/auth/logout");
const passport = require("./auth/passport");
const GoogleOauthRoutes = require("./routes/auth/google");
const FacebookOauthRoutes = require("./routes/auth/facebook");
const UserDetailsRoutes = require("./routes/auth/user-details");
const postRoutes = require("./routes/posts");
const likeRoutes = require("./routes/likes");
const commentRoutes = require("./routes/comments");
const UploadRouteforProfile = require("./routes/uploads");
// const UploadRoute = require("./routes/uploads");
// Mount Routes
app.use(passport.initialize());
app.use(passport.session());
app.use("/", mainRoutes);
app.use("/api/auth", SignupRoute); // All routes in SignupRoute will be prefixed with /api/auth
app.use("/api/auth", LoginRoute);
app.use("/api/auth", GoogleOauthRoutes);
app.use("/api/auth", FacebookOauthRoutes);
app.use("/api/auth", CheckAuth);
app.use("/api/auth", Logout);
app.use("/api/auth", UserDetailsRoutes);
app.use("/api/posts", postRoutes);
app.use("/api/likes", likeRoutes);
app.use("/api/posts", commentRoutes);
app.use("/api/upload", UploadRouteforProfile);

// app.use("/api/upload", UploadRoute);

app.listen(8000, "0.0.0.0", () => {
  console.log("Server is running on port 8000");
});
