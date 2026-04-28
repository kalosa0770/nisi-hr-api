import mongoose from 'mongoose';

const waitlistSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    trim: true,
    lowercase: true,
    match: [/^\S+@\S+\.\S+$/, 'Please use a valid email address'],
  },
  joinedAt: {
    type: Date,
    default: Date.now,
  },
  status: {
    type: String,
    enum: ['pending', 'notified', 'unsubscribed'],
    default: 'pending',
  },
  source: {
    type: String,
    default: 'landing_page_popup',
  }
});

const Waitlist = mongoose.model('Waitlist', waitlistSchema);

export default Waitlist;