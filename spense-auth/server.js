/**
 * BACKEND SERVER FOR SPENSE APP
 * 
 * This is a Node.js Express server that handles:
 * - User registration
 * - User login
 * - Password hashing (encryption)
 * - JWT authentication tokens
 * - Database storage using SQLite
 * 
 * WHAT YOU NEED TO INSTALL:
 * Run these commands in your terminal:
 * npm install express cors bcryptjs jsonwebtoken better-sqlite3
 */

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');

// Create Express app
const app = express();
const PORT = 3000;

// Secret key for JWT (in production, use environment variables)
const JWT_SECRET = 'your-secret-key-change-this-in-production';

// Middleware
app.use(cors()); // Allow requests from frontend
app.use(express.json()); // Parse JSON request bodies

/**
 * DATABASE SETUP
 * Using SQLite - a simple file-based database
 * Perfect for learning and small applications
 */

// Create/open database file
const db = new Database('spense.db');

// Create users table if it doesn't exist
db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`);

console.log('✅ Database initialized');

/**
 * API ENDPOINT: Register New User
 * POST /api/register
 * 
 * WHAT IT DOES:
 * 1. Receives name, email, password from frontend
 * 2. Checks if email already exists
 * 3. Hashes (encrypts) the password for security
 * 4. Saves user to database
 * 5. Returns success message
 */
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;

        // STEP 1: Validate input
        if (!name || !email || !password) {
            return res.status(400).json({ 
                message: 'Please provide name, email, and password' 
            });
        }

        // STEP 2: Check if email already exists
        const existingUser = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
        
        if (existingUser) {
            return res.status(400).json({ 
                message: 'Email already registered' 
            });
        }

        // STEP 3: Hash the password
        // Never store plain passwords! bcrypt creates a secure hash
        const hashedPassword = await bcrypt.hash(password, 10);

        // STEP 4: Insert new user into database
        const result = db.prepare(`
            INSERT INTO users (name, email, password) 
            VALUES (?, ?, ?)
        `).run(name, email, hashedPassword);

        // STEP 5: Return success response
        res.status(201).json({
            message: 'User registered successfully',
            userId: result.lastInsertRowid
        });

        console.log(`✅ New user registered: ${email}`);

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ 
            message: 'Server error during registration' 
        });
    }
});

/**
 * API ENDPOINT: Login User
 * POST /api/login
 * 
 * WHAT IT DOES:
 * 1. Receives email and password from frontend
 * 2. Finds user in database by email
 * 3. Compares password with hashed password
 * 4. Creates JWT token for authentication
 * 5. Returns token and user info
 */
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // STEP 1: Validate input
        if (!email || !password) {
            return res.status(400).json({ 
                message: 'Please provide email and password' 
            });
        }

        // STEP 2: Find user in database
        const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

        if (!user) {
            return res.status(401).json({ 
                message: 'Invalid email or password' 
            });
        }

        // STEP 3: Compare password with hashed password
        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
            return res.status(401).json({ 
                message: 'Invalid email or password' 
            });
        }

        // STEP 4: Create JWT token
        // This token will be used to authenticate future requests
        const token = jwt.sign(
            { userId: user.id, email: user.email },
            JWT_SECRET,
            { expiresIn: '7d' } // Token expires in 7 days
        );

        // STEP 5: Return success response with token
        res.json({
            message: 'Login successful',
            token: token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email
            }
        });

        console.log(`✅ User logged in: ${email}`);

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ 
            message: 'Server error during login' 
        });
    }
});

/**
 * API ENDPOINT: Google OAuth Login
 * POST /api/google-login
 * 
 * WHAT IT DOES:
 * 1. Receives Google JWT token from frontend
 * 2. Verifies token with Google
 * 3. Extracts user info (email, name) from token
 * 4. Checks if user exists, creates if not
 * 5. Returns our JWT token
 * 
 * NOTE: To use this, you need to:
 * - Install: npm install google-auth-library
 * - Get Google Client ID from https://console.cloud.google.com/
 */
app.post('/api/google-login', async (req, res) => {
    try {
        const { token: googleToken } = req.body;

        if (!googleToken) {
            return res.status(400).json({ 
                message: 'Google token required' 
            });
        }

        // NOTE: For production, verify the Google token using google-auth-library
        // For this tutorial, we'll decode it without verification
        // IMPORTANT: In production, ALWAYS verify the token!
        
        try {
            // Decode the JWT token from Google (base64 decode)
            const parts = googleToken.split('.');
            const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
            
            const { email, name, picture } = payload;

            if (!email) {
                return res.status(400).json({ 
                    message: 'Invalid Google token' 
                });
            }

            // Check if user exists
            let user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

            if (!user) {
                // Create new user from Google account
                // Note: We use a random password since they'll login via Google
                const randomPassword = await bcrypt.hash(Math.random().toString(36), 10);
                
                const result = db.prepare(`
                    INSERT INTO users (name, email, password) 
                    VALUES (?, ?, ?)
                `).run(name || email.split('@')[0], email, randomPassword);

                // Fetch the newly created user
                user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
                
                console.log(`✅ New user created via Google: ${email}`);
            }

            // Create our JWT token
            const authToken = jwt.sign(
                { userId: user.id, email: user.email },
                JWT_SECRET,
                { expiresIn: '7d' }
            );

            // Return success response
            res.json({
                message: 'Google login successful',
                token: authToken,
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email
                }
            });

            console.log(`✅ User logged in via Google: ${email}`);

        } catch (decodeError) {
            console.error('Token decode error:', decodeError);
            return res.status(400).json({ 
                message: 'Invalid Google token format' 
            });
        }

    } catch (error) {
        console.error('Google login error:', error);
        res.status(500).json({ 
            message: 'Server error during Google login' 
        });
    }
});

/**
 * MIDDLEWARE: Verify JWT Token
 * This function checks if a user is authenticated
 * Use this to protect routes that require login
 */
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Format: "Bearer TOKEN"

    if (!token) {
        return res.status(401).json({ message: 'Access token required' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ message: 'Invalid or expired token' });
        }
        req.user = user;
        next();
    });
}

/**
 * API ENDPOINT: Get User Profile (Protected)
 * GET /api/profile
 * 
 * This is an example of a protected route
 * User must be logged in (have valid token) to access
 */
app.get('/api/profile', authenticateToken, (req, res) => {
    try {
        const user = db.prepare('SELECT id, name, email, created_at FROM users WHERE id = ?')
            .get(req.user.userId);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json({ user });
    } catch (error) {
        console.error('Profile error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

/**
 * API ENDPOINT: Get All Users (for testing/admin)
 * GET /api/users
 * 
 * Returns all users (without passwords)
 */
app.get('/api/users', (req, res) => {
    try {
        const users = db.prepare('SELECT id, name, email, created_at FROM users').all();
        res.json({ users });
    } catch (error) {
        console.error('Users fetch error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

/**
 * START SERVER
 */
app.listen(PORT, () => {
    console.log(`
🚀 Spense Backend Server Running!
📍 Server: http://localhost:${PORT}
📊 Database: spense.db
    
API Endpoints:
✉️  POST /api/register - Register new user
🔐 POST /api/login    - Login user
👤 GET  /api/profile  - Get user profile (requires auth)
👥 GET  /api/users    - Get all users

Press Ctrl+C to stop the server
    `);
});

// Graceful shutdown
process.on('SIGINT', () => {
    db.close();
    console.log('\n👋 Server stopped');
    process.exit(0);
});