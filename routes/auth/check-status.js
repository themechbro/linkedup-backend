const express = require("express");
const router = express.Router();

router.get("/check_auth", async (req, res) => {
  console.log("Session:", req.session);
  console.log("Cookies received:", req.headers.cookie);
  if (req.session.user) {
    return res.json({
      isAuthenticated: true,
      user: req.session.user,
      success: true,
    });
  } else {
    return res
      .status(401)
      .json({ isAuthenticated: false, user: null, success: false });
  }
});

module.exports = router;
