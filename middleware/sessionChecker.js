const isAuthenticated = (req, res, next) => {
  const user = req.session?.user || req.user;

  if (!user) {
    return res.status(401).json({
      message: "Unauthorized access",
      success: false,
    });
  }

  req.currentUser = user;
  next();
};

module.exports = isAuthenticated;
