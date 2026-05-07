import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  companyName: { type: String, required: true },
  companyEmail: { type: String, required: true, unique: true },
  employees: { type: String, required: true },
  town: { type: String, required: true },
  country: { type: String, required: true },
  password: { type: String, required: true },
  role: { type: String, default: 'admin' }, // Default for the first person signing up the company
  createdAt: { type: Date, default: Date.now },
});

const User = mongoose.model('User', userSchema);
export default User;