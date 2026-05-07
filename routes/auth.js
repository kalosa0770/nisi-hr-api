import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const router = express.Router();

router.post('/signup', async (req, res) => {
    try {
      const { 
        firstName, lastName, companyName, companyEmail, 
        employees, town, country, password 
      } = req.body;
  
      // Validation: Check if email is already in use
      const userExists = await User.findOne({ companyEmail });
      if (userExists) {
        return res.status(400).json({ message: 'This company email is already registered.' });
      }
  
      // Hash Password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);
  
      // Create and Save User
      const newUser = new User({
        firstName, lastName, companyName, companyEmail, 
        employees, town, country, password: hashedPassword
      });
  
      await newUser.save();
  
      // Respond with success, but no token (forces manual login)
      res.status(201).json({ 
        message: 'Account created successfully! Please log in to continue.' 
      });
  
    } catch (error) {
      console.error('Signup Error:', error);
      res.status(500).json({ message: 'Internal server error. Please try again later.' });
    }
});

router.post('/login', async (req, res) => {
    try {
      const { email, password } = req.body;
  
      const user = await User.findOne({ companyEmail: email });
      if (!user) {
        return res.status(400).json({ message: 'Invalid Credentials' });
      }
  
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(400).json({ message: 'Invalid Credentials' });
      }
  
      // 1. Create the Payload (the data inside the token)
      const payload = {
        user: {
          id: user._id,
          role: user.role // Important for protecting HR dashboard routes
        }
      };
  
      // 2. Sign the Token
      jwt.sign(
        payload,
        process.env.JWT_SECRET,
        { expiresIn: '24h' }, // User stays logged in for 24 hours
        (err, token) => {
          if (err) throw err;
          
          // 3. Send token and basic user info back to frontend
          res.json({
            token,
            user: {
              id: user._id,
              firstName: user.firstName,
              lastName: user.lastName,
              companyName: user.companyName
            }
          });
        }
      );
  
    } catch (error) {
      console.error(error.message);
      res.status(500).send('Server Error');
    }
});

export default router;