const express = require("express");
const router = express.Router();

// @route   GET /
// @desc    Test route
// @access  Public
router.get("/", async (req, res) => {
  return res.send("Hello World from the router!");
});

module.exports = router;
