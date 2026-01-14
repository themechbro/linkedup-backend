const jwt = require("jsonwebtoken");

function signInternalJwt(user) {
  return jwt.sign(
    {
      sub: user.user_id,
      username: user.username,
      email: user.email,
      iss: "auth-monolith",
      type: "internal",
    },
    process.env.JWT_INTERNAL_SECRET,
    {
      expiresIn: process.env.JWT_INTERNAL_EXPIRY,
    }
  );
}

module.exports = { signInternalJwt };
