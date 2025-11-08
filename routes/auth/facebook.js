const express = require("express");
const router = express.Router();
const passport = require("../../auth/passport");

router.get(
  "/facebook",
  passport.authenticate("facebook", { scope: ["email"] })
);

router.get(
  "/facebook/callback",
  passport.authenticate("facebook", { failureRedirect: "/sign-in" }),
  (req, res) => {
    req.session.user = {
      username: req.user.username,
      email: req.user.email,
      user_id: req.user.user_id,
      type: req.user.type,
    };
    res.redirect(`${process.env.FRONTEND_URL}/home`);
  }
);

module.exports = router;
