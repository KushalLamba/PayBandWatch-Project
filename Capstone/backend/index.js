const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const http = require("http");
const socketIo = require("socket.io");
const dotenv = require("dotenv");
const path = require("path");

// Load environment variables
dotenv.config({ path: "./config/config.env" });

// Import routes
const authRoutes = require("./routes/auth");
const walletRoutes = require("./routes/wallet");
const paymentsRoutes = require("./routes/payments");
const adminRoutes = require("./routes/admin");
const userRoutes = require("./routes/users");
const transactionRoutes = require("./routes/transactions");

// Import middleware
const { authenticateJWT } = require("./middleware/auth");

// Create Express app and HTTP server
const app = express();
const server = http.createServer(app);

// ======================
// CORS CONFIG (IMPORTANT)
// ======================
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  process.env.FRONTEND_URL
];

// Express CORS
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("CORS not allowed"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  })
);

app.options("*", cors());

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ======================
// SOCKET.IO SETUP
// ======================
const io = socketIo(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Make io available in routes
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Debug middleware
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

// ======================
// ROUTES
// ======================
app.use("/api/auth", authRoutes);
app.use("/api/wallet", authenticateJWT, walletRoutes);
app.use("/api/payments", paymentsRoutes);
app.use("/api/admin", authenticateJWT, adminRoutes);
app.use("/api/users", userRoutes);
app.use("/api/transactions", authenticateJWT, transactionRoutes);

// Health check
app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    message: "API is running"
  });
});

// API 404 handler
app.use("/api/*", (req, res) => {
  res.status(404).json({
    message: "API endpoint not found",
    path: req.originalUrl
  });
});

// Non-API routes
app.use("*", (req, res) => {
  res.status(404).send("Not Found - Backend API Server");
});

// ======================
// SOCKET.IO AUTH
// ======================
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error("Authentication error"));

  try {
    const jwt = require("jsonwebtoken");
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.userId;
    next();
  } catch (err) {
    next(new Error("Authentication error"));
  }
});

io.on("connection", (socket) => {
  console.log(`User connected: ${socket.userId}`);

  socket.join(socket.userId);

  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.userId}`);
  });
});

// ======================
// DATABASE + SERVER START
// ======================
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB connected");

    const PORT = process.env.PORT || 5000;
    server.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  });

// Handle unhandled promise rejections
process.on("unhandledRejection", (err) => {
  console.error("Unhandled Promise Rejection:", err);
});
