const express = require("express");
const router = express.Router();
const { logoutLimitter } = require("../../middleware/rateLimiter");

router.post("/logout", logoutLimitter, (req, res) => {
  if (!req.session) {
    return res
      .status(400)
      .json({ message: "No active session to log out from.", success: false });
  }

  req.session.destroy((err) => {
    if (err) {
      console.error("Session destruction error:", err);
      return res
        .status(500)
        .json({ message: "Logout failed. Please try again.", success: false });
    }

    res.clearCookie("connect.sid", { path: "/", sameSite: "lax" });
    return res.json({ message: "Logged out successfully", success: true });
  });
});

module.exports = router;
