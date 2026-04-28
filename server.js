import dotenv from 'dotenv';
dotenv.config(); // MUST be before imports that use env vars

import express from 'express';
import cors from 'cors';
import connectDB from './config/db.js';
import waitlistRoutes from './routes/waitlist.js';

// 2. Database Connection
connectDB();

const app = express();

// 3. Global Middleware
app.use(cors()); // Permits your Vite frontend to make requests
app.use(express.json()); // Essential: allows Express to read JSON data from req.body

// 4. API Routes
app.use('/api/waitlist', waitlistRoutes);

// 5. Health Check (Useful for monitoring)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'active', timestamp: new Date() });
});

// 6. Global Error Handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Internal Server Error' });
});

// 7. Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Nissi HR Server running on port ${PORT}`);
});