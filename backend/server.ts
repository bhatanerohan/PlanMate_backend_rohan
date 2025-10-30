// backend/server.ts
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import apiRoutes from './routes/api.js';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3001);

// CORS Configuration
// Allow local dev frontend and an optional local frontend URL supplied via env
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174', // Vite alternate port
  process.env.FRONTEND_URL, // Your Vercel URL
  'http://10.0.0.15:5173',
  process.env.LOCAL_FRONTEND_URL, // e.g. http://192.168.1.100:5173
  /\.vercel\.app$/, // All Vercel preview deployments
  /\.railway\.app$/ // Railway domains
].filter(Boolean); // Remove undefined values

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, curl, etc.)
    if (!origin) return callback(null, true);
     
    // Check if origin matches any allowed pattern
    const isAllowed = allowedOrigins.some(allowed => {
      if (typeof allowed === 'string') {
        return allowed === origin;
      }
      if (allowed instanceof RegExp) {
        return allowed.test(origin);
      }
      return false;
    });
    
    if (isAllowed) {
      callback(null, true);
    } else {
      console.warn(`❌ CORS blocked request from: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Request logging
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/api', apiRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'PlanMate API Server',
    version: '1.0.0',
    status: 'running',
    environment: process.env.NODE_ENV || 'development',
    endpoints: {
      health: '/api/health',
      plan: 'POST /api/plan'
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
    path: req.path
  });
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Server Error:', err);
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message
  });
});

// Start server with error handling for address in use
let server = app.listen(PORT, '0.0.0.0', () => {  // bind to all interfaces for LAN access
  const localIp = process.env.LOCAL_IP || 'YOUR_IP';
  console.log('\n' + '='.repeat(50));
  console.log(`🚀 PlanMate API Server running on port ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🌐 Local:   http://localhost:${PORT}`);
  console.log(`🌐 Network: http://${localIp}:${PORT}`);
  console.log('='.repeat(50) + '\n');
});

// Handle listen errors (e.g., EADDRINUSE) so nodemon doesn't crash silently
server.on('error', (err: any) => {
  if (err && err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Please stop the process using it or set a different PORT.`);
    process.exit(1);
  }
  console.error('Server error:', err);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

export default app;