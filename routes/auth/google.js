const express = require("express");
const router = express.Router();
const passport = require("../../auth/passport");

router.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

// Handle callback
router.get(
  "/google/callback",
  passport.authenticate("google", { failureRedirect: "/sign-in" }),
  (req, res) => {
    // Store session
    req.session.user = {
      username: req.user.username,
      email: req.user.email,
    };

    // Redirect to frontend home page
    res.redirect(`${process.env.FRONTEND_URL}/home`);
  }
);

module.exports = router;
