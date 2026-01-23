const { Server } = require("socket.io");

module.exports = function initSocket(server, sessionMiddleware) {
  const io = new Server(server, {
    cors: {
      origin: true,
      credentials: true,
    },
  });

  io.use((socket, next) => {
    sessionMiddleware(socket.request, {}, next);
  });

  io.on("connection", (socket) => {
    const session = socket.request.session;

    let userId =
      session?.user?.user_id || session?.passport?.user || session?.user;

    if (!userId) {
      socket.disconnect(true);
      return;
    }

    // ✅ FIX: Extract user_id if it's an object
    if (typeof userId === "object" && userId.user_id) {
      userId = userId.user_id;
    }
    socket.join(userId);

    socket.on("typing_start", ({ to }) => {
      io.to(to).emit("typing_start", { from: userId });
    });

    socket.on("typing_stop", ({ to }) => {
      io.to(to).emit("typing_stop", { from: userId });
    });

    socket.on("disconnect", () => {
      console.log("User disconnected:", userId);
    });
  });
  return io;
};
