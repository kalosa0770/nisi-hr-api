import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import connectDB from './config/db.js';
import authRoutes from './routes/auth.js';
import employeeRoutes from "./routes/employees.js";
import payrollRoutes from "./routes/payroll.js";
import waitlistRoutes from './routes/waitlist.js';

// 2. Database Connection
connectDB();

const app = express();

// --- 3. Dynamic CORS Configuration ---
const allowedOrigins = [
  'http://localhost:5173', // Local Vite development
  'http://localhost:3000', // Alternative local port
  'https://nissi-hr.vercel.app', // Example production frontend (Update this later)
  'https://www.nisihr.com'      // Your official domain
];

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or Postman/Curl)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS policy'));
    }
  },
  credentials: true, // Required for cookies/sessions later
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
// -------------------------------------

app.use(express.json());

// 4. API Routes
app.use('/api/auth', authRoutes);
app.use("/api/employees", employeeRoutes);
app.use("/api/payroll", payrollRoutes);
app.use('/api/waitlist', waitlistRoutes);

// 5. Health Check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'active', timestamp: new Date() });
});

// 6. Global Error Handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: err.message || 'Internal Server Error' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Nissi HR Server running on port ${PORT}`);
});