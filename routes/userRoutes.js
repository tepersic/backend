import { ObjectId } from 'mongodb';  // Add this import
import bcrypt from 'bcryptjs';
import express from 'express';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { checkAdmin } from '../middleware/authMiddleware.js';
import { authenticateUser } from '../middleware/authMiddleware.js';
import { connectToDatabase } from '../db.js'; // Import the updated function

dotenv.config();

const router = express.Router();


router.post('/registracija', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        
        if (!name || !email || !password) {
            return res.status(400).json({ message: "All fields are required" });
        }

        const { client, db } = await connectToDatabase();
        const usersCollection = db.collection('korisnici');

        // Check if user already exists with the same email
        const existingUser = await usersCollection.findOne({ email });
        if (existingUser) {
            client.close();
            return res.status(400).json({ message: "User already exists" });
        }

        // Check if nickname (name) is already taken
        const existingNickname = await usersCollection.findOne({ name });
        if (existingNickname) {
            client.close();
            return res.status(400).json({ message: "Nickname already taken. Please choose another one." });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Save user to DB with admin: false (normal user by default)
        await usersCollection.insertOne({ 
            name, 
            email, 
            password: hashedPassword, 
            admin: false // Default to normal user
        });
        client.close();

        res.status(201).json({ message: "User registered successfully" });
    } catch (error) {
        console.error("Error registering user:", error);
        res.status(500).json({ message: "Server error" });
    }
});


router.post('/login', async (req, res) => {
    try {
      const { email, password } = req.body;
  
      // Connect to the database
      const { client, db } = await connectToDatabase();
      const usersCollection = db.collection('korisnici');
  
      // Check if user exists
      const user = await usersCollection.findOne({ email });
      if (!user) {
        client.close();
        return res.status(400).json({ message: "Invalid credentials" });
      }
  
      // Compare passwords
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        client.close();
        return res.status(400).json({ message: "Invalid credentials" });
      }
  
      // Generate JWT Token with 1-hour expiration
      const token = jwt.sign(
        { id: user._id, name: user.name, admin: user.admin }, // Including admin status
        process.env.JWT_SECRET || "secret", 
        { expiresIn: "1h" }
      );
  
      // Decode the JWT token (Backend side decoding)
      const decodedToken = jwt.decode(token);  // This is optional but can be used for additional checks
  
      // Close the database connection
      client.close();
  
      // Respond with user data, token, and admin status (from the decoded token)
      res.json({
        name: user.name,
        email: user.email,
        token,
        admin: decodedToken.admin  // Send admin status in response (no need for frontend decoding)
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Server error" });
    }
  });



router.post('/korisnici/:id/promote', authenticateUser, checkAdmin, async (req, res) => {
    try {
        const { client, db } = await connectToDatabase();
        const usersCollection = db.collection('korisnici');

        // Use returnDocument: 'after' so that we get the updated document
        const user = await usersCollection.findOneAndUpdate(
            { _id: new ObjectId(req.params.id) },
            { $set: { admin: true } },
            { returnDocument: 'after' } // returns the updated document
        );

        if (!user.value) {
            client.close();
            return res.status(404).json({ message: "User not found." });
        }

        client.close();
        res.json({ message: `${user.value.name} promoted to admin.` });
    } catch (error) {
        console.error("Error promoting user:", error);
        res.status(500).json({ message: "Server error" });
    }
});

// Demote user from admin
router.post('/korisnici/:id/demote', authenticateUser, checkAdmin, async (req, res) => {
    try {
        const { client, db } = await connectToDatabase();
        const usersCollection = db.collection('korisnici');

        const user = await usersCollection.findOneAndUpdate(
            { _id: new ObjectId(req.params.id) }, 
            { $set: { admin: false } }
        );

        if (!user.value) {
            client.close();
            return res.status(404).json({ message: "User not found." });
        }

        client.close();
        res.json({ message: `${user.value.name} demoted from admin.` });
    } catch (error) {
        console.error("Error demoting user:", error);
        res.status(500).json({ message: "Server error" });
    }
});

// Add a validation check for the ObjectId
router.delete('/korisnici/:id', authenticateUser, checkAdmin, async (req, res) => {
    try {
        const userId = req.params.id;
        
        // Check if the provided ID is a valid MongoDB ObjectId
        if (!ObjectId.isValid(userId)) {
            return res.status(400).json({ message: "Invalid ID format." });
        }

        console.log("Attempting to delete user with ID:", userId); // Debug log

        const { client, db } = await connectToDatabase();
        const usersCollection = db.collection('korisnici');

        // Delete the user by ObjectId
        const user = await usersCollection.findOneAndDelete({ _id: new ObjectId(userId) });

        if (!user.value) {
            client.close();
            return res.status(404).json({ message: "User not found." });
        }

        client.close();
        res.json({ message: `User ${user.value.name} has been deleted.` });
    } catch (error) {
        console.error("Error deleting user:", error);
        res.status(500).json({ message: "Server error" });
    }
});


router.delete('/:profesorId/komentari/:id', authenticateUser, checkAdmin, async (req, res) => {
    console.log("DELETE comment endpoint hit:", req.params); // Debug log
    try {
      const { client, db } = await connectToDatabase();
      const commentsCollection = db.collection('komentari');
      
      // Optionally, verify that the comment belongs to the given profesorId here
  
      const result = await commentsCollection.findOneAndDelete({ _id: new ObjectId(req.params.id) });
      client.close();
  
      // Instead of returning a 404 when no comment is found, return a success response
      if (!result.value) {
        return res.json({ message: "Comment not found or already deleted." });
      }
  
      return res.json({ message: "Comment deleted successfully." });
    } catch (error) {
      console.error("Error deleting comment:", error);
      return res.status(500).json({ message: "Server error" });
    }
  });
  
  

// Admin dashboard for managing users
router.get('/korisnici', authenticateUser, checkAdmin, async (req, res) => {
    try {
        const { client, db } = await connectToDatabase();
        const usersCollection = db.collection('korisnici');
        const users = await usersCollection.find().toArray();
        client.close();
        res.json(users); // Return all users
    } catch (error) {
        console.error("Error fetching users:", error);
        res.status(500).json({ message: "Server error" });
    }
});

export default router;