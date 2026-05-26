import dns from 'dns';
import mongoose from 'mongoose';

// Force a reliable DNS resolver for SRV lookups.
dns.setServers(['8.8.8.8', '1.1.1.1']);

const connectDB = async () => {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.error("❌ MONGODB_URI is undefined. Check your Railway Variables!");
    process.exit(1);
  }

  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000
    });
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`❌ Connection Error: ${error.message}`);
    process.exit(1);
  }
};

export default connectDB;