import express from 'express';
import { Resend } from 'resend';
import Waitlist from '../models/Waitlist.js';

const router = express.Router();

router.post('/', async (req, res) => {
  const { email } = req.body;

  try {
    // Initialize Resend INSIDE the route handler
    const resend = new Resend(process.env.RESEND_API_KEY);

    const existingUser = await Waitlist.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'You are already on our waitlist!' });
    }

    // 2. Save to MongoDB
    const newLead = new Waitlist({ email });
    await newLead.save();

    // 3. Trigger Resend "Thank You" Email
    await resend.emails.send({
      from: 'delivered@resend.dev', // Ensure domain is verified in Resend dashboard
      to: email,
      subject: 'You’re on the list! 🚀',
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
          <h2 style="color: #533afd;">Welcome to Nisi HR</h2>
          <p>Hi there,</p>
          <p>Thanks for joining the waitlist for <strong>Nisi HR</strong>. We’re building the modern HR operating system specifically for Zambian businesses, and we’re thrilled to have you with us from the start.</p>
          <p>We'll notify you as soon as we're ready for early access. In the meantime, feel free to follow our journey.</p>
          <br />
          <p>Best,<br />The Nisi Team</p>
        </div>
      `,
    });

    res.status(201).json({ success: true, message: 'Successfully joined the waitlist.' });

  } catch (error) {
    console.error('Waitlist Error:', error);
    res.status(500).json({ message: 'Server error. Please try again later.' });
  }
});

export default router;