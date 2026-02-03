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
const http = require("http");
const initSocket = require("./socket/socket");

const sessionMiddleware = session({
  store: new PgSession({
    pool,
    tableName: "session",
  }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24,
    secure: false,
    sameSite: "lax",
  },
});
const server = http.createServer(app);
const io = initSocket(server, sessionMiddleware);

app.use(
  cors({
    origin: ["http://localhost:3000", "http://192.168.1.6:3000"], // your frontend URLs
    credentials: true, // ✅ allow cookies
  }),
);

app.use(sessionMiddleware);

// app.use(
//   session({
//     store: new PgSession({
//       pool,
//       tableName: "session",
//     }),
//     secret: process.env.SESSION_SECRET,
//     resave: false,
//     saveUninitialized: false,
//     cookie: {
//       httpOnly: true,
//       maxAge: 1000 * 60 * 60 * 24, // 1 day
//       secure: false, // ❌ false for local dev (HTTP)
//       sameSite: "lax", // ✅ safe for local dev
//     },
//   })
// );
// Middlewares

app.use(express.json()); // Body parser for JSON
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/api/video", require("./routes/post/videoStream"));

// io set
app.set("io", io);

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
const postRoutes = require("./routes/post/posts");
const likeRoutes = require("./routes/likes");
const commentRoutes = require("./routes/comments");
const UploadRouteforProfile = require("./routes/uploads");
const ConnectionRoutes = require("./routes/connections/request");
const SuggestionConnectionRoute = require("./routes/connections/suggestions");
const MessagingAllRoutes = require("./routes/messaging/message");
const JobAllRoutes = require("./routes/jobs/job");
const UpdateProfileSectionRoutes = require("./routes/profile/postRoutes");
const FetchprofileSectionRoutes = require("./routes/profile/getterRoutes");

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

//connections
app.use("/api/connections", ConnectionRoutes);
app.use("/api/connections", SuggestionConnectionRoute);

// Messaging
app.use("/api/messages", MessagingAllRoutes);

// Jobs
app.use("/api/jobs", JobAllRoutes);

// app.use("/api/upload", UploadRoute);

// Profile Routes
app.use("/api/profile/update", UpdateProfileSectionRoutes);
app.use("/api/profile/details/get/", FetchprofileSectionRoutes);

// app.listen(8000, "0.0.0.0", () => {
//   console.log("Server is running on port 8000");
// });

server.listen(8000, "0.0.0.0", () => {
  console.log("Server + Socket.IO running on port 8000");
});
