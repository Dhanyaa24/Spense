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
 * npm install express cors bcryptjs jsonwebtoken better-sqlite3 dotenv
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
const cron = require('node-cron');
const { sendLoginEmail, sendMonthlySummaryEmail, sendYearlySummaryEmail, sendPasswordResetEmail } = require('./emailService');

// Create Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Secret key for JWT
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key-only';

// Middleware
app.use(cors()); // Allow requests from frontend
app.use(express.json()); // Parse JSON request bodies
app.use(express.static('public')); // Serve static files from public folder

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

// Create expenses table
db.exec(`
    CREATE TABLE IF NOT EXISTS expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        amount REAL NOT NULL,
        category TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'need',
        mood TEXT DEFAULT '😊',
        date TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )
`);

// Create budgets table
db.exec(`
    CREATE TABLE IF NOT EXISTS budgets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL UNIQUE,
        monthly_budget REAL NOT NULL DEFAULT 5000,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )
`);
// Create subscriptions table
db.exec(`
    CREATE TABLE IF NOT EXISTS subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        cost REAL NOT NULL,
        cycle TEXT NOT NULL DEFAULT 'monthly',
        start_date TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )
`);

db.exec(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        token TEXT NOT NULL UNIQUE,
        expires_at DATETIME NOT NULL,
        used INTEGER DEFAULT 0,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )
`);

// MIGRATION: Add theme column to users if it doesn't exist
try {
    db.prepare("ALTER TABLE users ADD COLUMN theme TEXT DEFAULT 'doodle-light'").run();
    console.log('✅ Added theme column to users table');
} catch (e) {
    // Column likely already exists
}

console.log('✅ Database initialized (users, expenses, budgets, subscriptions, reset_tokens tables)');

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
                email: user.email,
                theme: user.theme || 'doodle-light'
            }
        });

        console.log(`✅ User logged in: ${email}`);

        // STEP 6: Send login notification email (non-blocking)
        sendLoginEmail(user.name, user.email).catch(() => {});

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ 
            message: 'Server error during login' 
        });
    }
});

/**
 * API ENDPOINT: Forgot Password
 * POST /api/forgot-password
 * Generates a reset token and sends a password reset email
 */
app.post('/api/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ message: 'Email is required' });

        const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

        // Always return success to prevent email enumeration
        if (!user) {
            return res.json({ message: 'If that email is registered, a reset link has been sent.' });
        }

        // Generate a secure random token
        const crypto = require('crypto');
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

        // Remove any existing tokens for this user, then store new one
        db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').run(user.id);
        db.prepare(
            'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)'
        ).run(user.id, token, expiresAt);

        // Send the reset email
        await sendPasswordResetEmail(user.name, user.email, token);

        res.json({ message: 'If that email is registered, a reset link has been sent.' });
        console.log(`📧 Password reset requested for: ${email}`);

    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

/**
 * API ENDPOINT: Reset Password
 * POST /api/reset-password
 * Validates token and updates user password
 */
app.post('/api/reset-password', async (req, res) => {
    try {
        const { token, password } = req.body;
        if (!token || !password) return res.status(400).json({ message: 'Token and password are required' });
        if (password.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters' });

        // Find and validate token
        const resetRecord = db.prepare(
            'SELECT * FROM password_reset_tokens WHERE token = ? AND used = 0'
        ).get(token);

        if (!resetRecord) return res.status(400).json({ message: 'Invalid or expired reset link' });

        if (new Date(resetRecord.expires_at) < new Date()) {
            return res.status(400).json({ message: 'This reset link has expired. Please request a new one.' });
        }

        // Hash the new password and update user
        const hashedPassword = await bcrypt.hash(password, 10);
        db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashedPassword, resetRecord.user_id);

        // Mark token as used
        db.prepare('UPDATE password_reset_tokens SET used = 1 WHERE id = ?').run(resetRecord.id);

        res.json({ message: 'Password updated successfully! You can now log in.' });
        console.log(`✅ Password reset successful for user_id: ${resetRecord.user_id}`);

    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ message: 'Server error' });
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
 * API ENDPOINT: Update User Theme
 * POST /api/user/theme
 */
app.post('/api/user/theme', authenticateToken, (req, res) => {
    try {
        const { theme } = req.body;
        if (!theme) return res.status(400).json({ message: 'Theme name required' });

        db.prepare('UPDATE users SET theme = ? WHERE id = ?').run(theme, req.user.userId);
        res.json({ message: 'Theme updated successfully' });
    } catch (error) {
        console.error('Update theme error:', error);
        res.status(500).json({ message: 'Server error updating theme' });
    }
});

// ============================================================
// EXPENSE MANAGEMENT ENDPOINTS
// ============================================================

/**
 * API ENDPOINT: Get Expenses for a specific date
 * GET /api/expenses?date=YYYY-MM-DD
 * 
 * Returns all expenses for the authenticated user on the given date.
 * If no date is provided, defaults to today.
 */
app.get('/api/expenses', authenticateToken, (req, res) => {
    try {
        const date = req.query.date || new Date().toISOString().split('T')[0];
        const expenses = db.prepare(
            'SELECT * FROM expenses WHERE user_id = ? AND date = ? ORDER BY created_at DESC'
        ).all(req.user.userId, date);

        res.json({ expenses });
    } catch (error) {
        console.error('Fetch expenses error:', error);
        res.status(500).json({ message: 'Server error fetching expenses' });
    }
});

/**
 * API ENDPOINT: Add a new expense
 * POST /api/expenses
 */
app.post('/api/expenses', authenticateToken, (req, res) => {
    try {
        const { name, amount, category, type, mood, date } = req.body;

        if (!name || amount === undefined || !category) {
            return res.status(400).json({ message: 'Name, amount, and category are required' });
        }

        const expenseDate = date || new Date().toISOString().split('T')[0];

        const result = db.prepare(`
            INSERT INTO expenses (user_id, name, amount, category, type, mood, date)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(req.user.userId, name, amount, category, type || 'need', mood || '😊', expenseDate);

        const newExpense = db.prepare('SELECT * FROM expenses WHERE id = ?').get(result.lastInsertRowid);

        console.log(`✅ Expense added: ${name} - ₹${amount} by user ${req.user.userId}`);
        res.status(201).json({ message: 'Expense added', expense: newExpense });
    } catch (error) {
        console.error('Add expense error:', error);
        res.status(500).json({ message: 'Server error adding expense' });
    }
});

/**
 * API ENDPOINT: Update an expense (e.g. toggle need/want)
 * PUT /api/expenses/:id
 */
app.put('/api/expenses/:id', authenticateToken, (req, res) => {
    try {
        const { id } = req.params;
        const { name, amount, category, type, mood } = req.body;

        // Ensure the expense belongs to the user
        const existing = db.prepare('SELECT * FROM expenses WHERE id = ? AND user_id = ?').get(id, req.user.userId);
        if (!existing) {
            return res.status(404).json({ message: 'Expense not found' });
        }

        db.prepare(`
            UPDATE expenses SET 
                name = COALESCE(?, name),
                amount = COALESCE(?, amount),
                category = COALESCE(?, category),
                type = COALESCE(?, type),
                mood = COALESCE(?, mood)
            WHERE id = ? AND user_id = ?
        `).run(name || null, amount || null, category || null, type || null, mood || null, id, req.user.userId);

        const updated = db.prepare('SELECT * FROM expenses WHERE id = ?').get(id);
        res.json({ message: 'Expense updated', expense: updated });
    } catch (error) {
        console.error('Update expense error:', error);
        res.status(500).json({ message: 'Server error updating expense' });
    }
});

/**
 * API ENDPOINT: Delete an expense
 * DELETE /api/expenses/:id
 */
app.delete('/api/expenses/:id', authenticateToken, (req, res) => {
    try {
        const { id } = req.params;

        const existing = db.prepare('SELECT * FROM expenses WHERE id = ? AND user_id = ?').get(id, req.user.userId);
        if (!existing) {
            return res.status(404).json({ message: 'Expense not found' });
        }

        db.prepare('DELETE FROM expenses WHERE id = ? AND user_id = ?').run(id, req.user.userId);

        console.log(`🗑️ Expense deleted: ID ${id} by user ${req.user.userId}`);
        res.json({ message: 'Expense deleted' });
    } catch (error) {
        console.error('Delete expense error:', error);
        res.status(500).json({ message: 'Server error deleting expense' });
    }
});

// ============================================================
// BUDGET MANAGEMENT ENDPOINTS
// ============================================================

/**
 * API ENDPOINT: Get user's budget
 * GET /api/budget
 */
app.get('/api/budget', authenticateToken, (req, res) => {
    try {
        let budget = db.prepare('SELECT * FROM budgets WHERE user_id = ?').get(req.user.userId);

        if (!budget) {
            // Create default budget for user
            db.prepare('INSERT INTO budgets (user_id, monthly_budget) VALUES (?, 5000)').run(req.user.userId);
            budget = db.prepare('SELECT * FROM budgets WHERE user_id = ?').get(req.user.userId);
        }

        res.json({ budget });
    } catch (error) {
        console.error('Get budget error:', error);
        res.status(500).json({ message: 'Server error fetching budget' });
    }
});

/**
 * API ENDPOINT: Update user's budget
 * PUT /api/budget
 */
app.put('/api/budget', authenticateToken, (req, res) => {
    try {
        const { monthly_budget } = req.body;

        if (!monthly_budget || monthly_budget <= 0) {
            return res.status(400).json({ message: 'Valid budget amount is required' });
        }

        const existing = db.prepare('SELECT * FROM budgets WHERE user_id = ?').get(req.user.userId);

        if (existing) {
            db.prepare('UPDATE budgets SET monthly_budget = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?')
                .run(monthly_budget, req.user.userId);
        } else {
            db.prepare('INSERT INTO budgets (user_id, monthly_budget) VALUES (?, ?)').run(req.user.userId, monthly_budget);
        }

        const budget = db.prepare('SELECT * FROM budgets WHERE user_id = ?').get(req.user.userId);
        res.json({ message: 'Budget updated', budget });
    } catch (error) {
        console.error('Update budget error:', error);
        res.status(500).json({ message: 'Server error updating budget' });
    }
});

// ============================================================
// ANALYTICS / CHART ENDPOINTS
// ============================================================

/**
 * API ENDPOINT: Weekly spending data for chart
 * GET /api/analytics/weekly?date=YYYY-MM-DD
 * 
 * Returns spending totals for each day of the current week
 */
app.get('/api/analytics/weekly', authenticateToken, (req, res) => {
    try {
        const refDate = req.query.date ? new Date(req.query.date) : new Date();
        const dayOfWeek = refDate.getDay(); // 0 = Sunday
        const monday = new Date(refDate);
        monday.setDate(refDate.getDate() - ((dayOfWeek + 6) % 7)); // Go back to Monday

        const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        const weeklyData = [];

        for (let i = 0; i < 7; i++) {
            const d = new Date(monday);
            d.setDate(monday.getDate() + i);
            const dateStr = d.toISOString().split('T')[0];

            const result = db.prepare(
                'SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE user_id = ? AND date = ?'
            ).get(req.user.userId, dateStr);

            weeklyData.push({
                day: days[i],
                date: dateStr,
                total: result.total
            });
        }

        res.json({ weeklyData });
    } catch (error) {
        console.error('Weekly analytics error:', error);
        res.status(500).json({ message: 'Server error fetching analytics' });
    }
});

/**
 * API ENDPOINT: Monthly spending data for chart
 * GET /api/analytics/monthly-chart?date=YYYY-MM-DD
 * 
 * Returns spending totals for each day of the current month
 */
app.get('/api/analytics/monthly-chart', authenticateToken, (req, res) => {
    try {
        const refDate = req.query.date ? new Date(req.query.date) : new Date();
        const year = refDate.getFullYear();
        const month = refDate.getMonth();
        
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const monthlyData = [];

        for (let i = 1; i <= daysInMonth; i++) {
            const dateStr = new Date(year, month, i, 12, 0, 0).toISOString().split('T')[0];
            const result = db.prepare(
                'SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE user_id = ? AND date = ?'
            ).get(req.user.userId, dateStr);

            monthlyData.push({
                day: i.toString(),
                date: dateStr,
                total: result.total
            });
        }

        res.json({ monthlyData });
    } catch (error) {
        console.error('Monthly chart analytics error:', error);
        res.status(500).json({ message: 'Server error fetching analytics' });
    }
});

/**
 * API ENDPOINT: Yearly spending data for chart
 * GET /api/analytics/yearly-chart?date=YYYY-MM-DD
 * 
 * Returns spending totals for each month of the current year
 */
app.get('/api/analytics/yearly-chart', authenticateToken, (req, res) => {
    try {
        const refDate = req.query.date ? new Date(req.query.date) : new Date();
        const year = refDate.getFullYear();
        
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const yearlyData = [];

        for (let i = 0; i < 12; i++) {
            const monthStr = `${year}-${String(i + 1).padStart(2, '0')}`;
            const result = db.prepare(
                'SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE user_id = ? AND date LIKE ?'
            ).get(req.user.userId, `${monthStr}%`);

            yearlyData.push({
                day: months[i],
                date: monthStr,
                total: result.total
            });
        }

        res.json({ yearlyData });
    } catch (error) {
        console.error('Yearly chart analytics error:', error);
        res.status(500).json({ message: 'Server error fetching analytics' });
    }
});

/**
 * API ENDPOINT: Category breakdown for pie/donut charts
 * GET /api/analytics/category-breakdown?timeframe=weekly|monthly|yearly&date=YYYY-MM-DD
 */
app.get('/api/analytics/category-breakdown', authenticateToken, (req, res) => {
    try {
        const { timeframe, date } = req.query;
        const refDate = date ? new Date(date) : new Date();
        let query = '';
        let params = [req.user.userId];

        if (timeframe === 'weekly') {
            const dayOfWeek = refDate.getDay();
            const monday = new Date(refDate);
            monday.setDate(refDate.getDate() - ((dayOfWeek + 6) % 7));
            const rangeStart = monday.toISOString().split('T')[0];
            const sunday = new Date(monday);
            sunday.setDate(monday.getDate() + 6);
            const rangeEnd = sunday.toISOString().split('T')[0];
            query = 'SELECT category as label, SUM(amount) as total FROM expenses WHERE user_id = ? AND date BETWEEN ? AND ? GROUP BY category';
            params.push(rangeStart, rangeEnd);
        } else if (timeframe === 'monthly') {
            const month = refDate.toISOString().slice(0, 7);
            query = 'SELECT category as label, SUM(amount) as total FROM expenses WHERE user_id = ? AND date LIKE ? GROUP BY category';
            params.push(`${month}%`);
        } else {
            const year = refDate.getFullYear();
            query = 'SELECT category as label, SUM(amount) as total FROM expenses WHERE user_id = ? AND date LIKE ? GROUP BY category';
            params.push(`${year}%`);
        }

        let breakdown = db.prepare(query).all(...params);

        // Normalize subscriptions to monthly equivalent
        const subs = db.prepare('SELECT cost, cycle FROM subscriptions WHERE user_id = ?').all(req.user.userId);
        let monthlySubTotal = 0;
        subs.forEach(s => {
            if(s.cycle === 'yearly') monthlySubTotal += s.cost / 12;
            else monthlySubTotal += s.cost;
        });

        if (monthlySubTotal > 0) {
            let normalizedSubTotal = monthlySubTotal;
            if (timeframe === 'weekly') normalizedSubTotal = monthlySubTotal / 4;
            else if (timeframe === 'yearly') normalizedSubTotal = monthlySubTotal * 12;
            
            breakdown.push({ label: 'Subscriptions', total: normalizedSubTotal });
        }

        res.json({ breakdown, monthlySubTotal });
    } catch (error) {
        console.error('Category breakdown error:', error);
        res.status(500).json({ message: 'Server error fetching analytics' });
    }
});

/**
 * API ENDPOINT: Monthly summary
 * GET /api/analytics/monthly?month=YYYY-MM
 * 
 * Returns total spent, needs vs wants breakdown for the month
 */
app.get('/api/analytics/monthly', authenticateToken, (req, res) => {
    try {
        const month = req.query.month || new Date().toISOString().slice(0, 7);

        const totalSpent = db.prepare(
            "SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE user_id = ? AND date LIKE ?"
        ).get(req.user.userId, `${month}%`);

        const needsTotal = db.prepare(
            "SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE user_id = ? AND date LIKE ? AND type = 'need'"
        ).get(req.user.userId, `${month}%`);

        const wantsTotal = db.prepare(
            "SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE user_id = ? AND date LIKE ? AND type = 'want'"
        ).get(req.user.userId, `${month}%`);

        const trackingDays = db.prepare(
            "SELECT COUNT(DISTINCT date) as days FROM expenses WHERE user_id = ? AND date LIKE ?"
        ).get(req.user.userId, `${month}%`);

        // Calculate normalized subscriptions
        const subs = db.prepare('SELECT cost, cycle FROM subscriptions WHERE user_id = ?').all(req.user.userId);
        let subTotal = 0;
        subs.forEach(s => {
            if(s.cycle === 'yearly') subTotal += s.cost / 12;
            else subTotal += s.cost;
        });

        res.json({
            month,
            totalSpent: totalSpent.total + subTotal,
            needsTotal: needsTotal.total + subTotal, // Subscriptions are considered 'Needs'
            wantsTotal: wantsTotal.total,
            trackingDays: trackingDays.days
        });
    } catch (error) {
        console.error('Monthly analytics error:', error);
        res.status(500).json({ message: 'Server error fetching monthly analytics' });
    }
});

/**
 * API ENDPOINT: Spending streak
 * GET /api/analytics/streak
 * 
 * Returns the number of consecutive days the user has logged at least one expense
 */
app.get('/api/analytics/streak', authenticateToken, (req, res) => {
    try {
        // Count consecutive days (backwards from today) with at least 1 expense
        let streak = 0;
        const today = new Date();

        for (let i = 0; i < 365; i++) {
            const d = new Date(today);
            d.setDate(today.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];

            const result = db.prepare(
                'SELECT COUNT(*) as count FROM expenses WHERE user_id = ? AND date = ?'
            ).get(req.user.userId, dateStr);

            if (result.count > 0) {
                streak++;
            } else {
                if (i === 0) {
                    // haven't logged *today* yet, don't break the streak from yesterday
                    continue; 
                } else {
                    break;
                }
            }
        }

        res.json({ streak });
    } catch (error) {
        console.error('Streak error:', error);
        res.status(500).json({ message: 'Server error fetching streak' });
    }
});

/**
 * SUBSCRIPTIONS API
 */

// Get all subscriptions
app.get('/api/subscriptions', authenticateToken, (req, res) => {
    try {
        const subs = db.prepare('SELECT * FROM subscriptions WHERE user_id = ? ORDER BY start_date ASC').all(req.user.userId);
        res.json(subs);
    } catch (error) {
        console.error('Fetch subscriptions error:', error);
        res.status(500).json({ message: 'Server error parsing subscriptions' });
    }
});

// Add new subscription
app.post('/api/subscriptions', authenticateToken, (req, res) => {
    try {
        const { name, cost, cycle, start_date } = req.body;
        if (!name || isNaN(cost) || !start_date || !cycle) {
            return res.status(400).json({ message: 'Invalid subscription data' });
        }

        const result = db.prepare(`
            INSERT INTO subscriptions (user_id, name, cost, cycle, start_date)
            VALUES (?, ?, ?, ?, ?)
        `).run(req.user.userId, name, Number(cost), cycle, start_date);

        res.status(201).json({ message: 'Subscription added successfully', id: result.lastInsertRowid });
    } catch (error) {
        console.error('Add subscription error:', error);
        res.status(500).json({ message: 'Server error saving subscription' });
    }
});

// Delete subscription
app.delete('/api/subscriptions/:id', authenticateToken, (req, res) => {
    try {
        const { id } = req.params;
        const result = db.prepare('DELETE FROM subscriptions WHERE id = ? AND user_id = ?').run(id, req.user.userId);
        
        if (result.changes === 0) {
            return res.status(404).json({ message: 'Subscription not found or unauthorized' });
        }
        res.json({ message: 'Subscription deleted successfully' });
    } catch (error) {
        console.error('Delete subscription error:', error);
        res.status(500).json({ message: 'Server error deleting subscription' });
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
🌐 Dashboard: http://localhost:${PORT}/dashboard.html
    
API Endpoints:
✉️  POST   /api/register          - Register new user
🔐 POST   /api/login             - Login user
👤 GET    /api/profile           - Get user profile (requires auth)
👥 GET    /api/users             - Get all users
💰 GET    /api/expenses          - Get expenses for a date
💰 POST   /api/expenses          - Add new expense
💰 PUT    /api/expenses/:id      - Update expense
💰 DELETE /api/expenses/:id      - Delete expense
📊 GET    /api/budget            - Get user budget
📊 PUT    /api/budget            - Update user budget
📈 GET    /api/analytics/weekly  - Weekly spending chart
📈 GET    /api/analytics/monthly - Monthly summary
🔥 GET    /api/analytics/streak  - Spending streak

Press Ctrl+C to stop the server
    `);
});

// ─── CRON JOB: Monthly Summary ────────────────────────────────────────────────
// Runs at 9:00 AM IST on the 1st of every month
// IST = UTC+5:30, so 9:00 IST = 03:30 UTC
cron.schedule('30 3 1 * *', async () => {
    console.log('📅 Running monthly summary email job...');

    const users = db.prepare('SELECT id, name, email FROM users').all();

    for (const user of users) {
        try {
            const now = new Date();
            const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const ym = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`;

            // Total spent last month
            const totalRow = db.prepare(`
                SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as cnt
                FROM expenses
                WHERE user_id = ? AND strftime('%Y-%m', date) = ?
            `).get(user.id, ym);

            // Budget
            const budgetRow = db.prepare('SELECT monthly_budget FROM budgets WHERE user_id = ?').get(user.id);

            // Top category
            const categories = db.prepare(`
                SELECT category as label, SUM(amount) as total
                FROM expenses
                WHERE user_id = ? AND strftime('%Y-%m', date) = ?
                GROUP BY category ORDER BY total DESC LIMIT 1
            `).get(user.id, ym);

            // Subscription normalized monthly cost
            const subs = db.prepare('SELECT cost, cycle FROM subscriptions WHERE user_id = ?').all(user.id);
            const subMonthly = subs.reduce((acc, s) => acc + (s.cycle === 'yearly' ? s.cost / 12 : s.cost), 0);

            const totalSpent = (totalRow.total || 0) + subMonthly;
            const budget = budgetRow ? budgetRow.monthly_budget : 0;
            const savings = budget - totalSpent;

            await sendMonthlySummaryEmail(user, {
                totalSpent,
                budget,
                savings,
                expenseCount: totalRow.cnt,
                topCategory: categories || null
            });
        } catch (err) {
            console.warn(`⚠️  Monthly summary failed for ${user.email}: ${err.message}`);
        }
    }
}, { timezone: 'Asia/Kolkata' });

// ─── CRON JOB: Yearly Summary ─────────────────────────────────────────────────
// Runs at 9:00 AM IST on January 1st every year
cron.schedule('30 3 1 1 *', async () => {
    console.log('🎉 Running yearly summary email job...');

    const users = db.prepare('SELECT id, name, email FROM users').all();
    const prevYear = new Date().getFullYear() - 1;

    for (const user of users) {
        try {
            // Total spent in the previous year
            const totalRow = db.prepare(`
                SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as cnt
                FROM expenses
                WHERE user_id = ? AND strftime('%Y', date) = ?
            `).get(user.id, String(prevYear));

            // Average monthly spend
            const avgMonthly = Math.round((totalRow.total || 0) / 12);

            // Top category for the year
            const topCat = db.prepare(`
                SELECT category as label, SUM(amount) as total
                FROM expenses
                WHERE user_id = ? AND strftime('%Y', date) = ?
                GROUP BY category ORDER BY total DESC LIMIT 1
            `).get(user.id, String(prevYear));

            // Best month (lowest spending, only months with data)
            const monthlyRows = db.prepare(`
                SELECT strftime('%Y-%m', date) as ym, SUM(amount) as total
                FROM expenses
                WHERE user_id = ? AND strftime('%Y', date) = ?
                GROUP BY ym ORDER BY total ASC LIMIT 1
            `).get(user.id, String(prevYear));

            let bestMonth = null;
            if (monthlyRows) {
                const d = new Date(monthlyRows.ym + '-01');
                bestMonth = d.toLocaleString('en-IN', { month: 'long' });
            }

            await sendYearlySummaryEmail(user, {
                totalSpent: totalRow.total || 0,
                expenseCount: totalRow.cnt || 0,
                avgMonthly,
                topCategory: topCat || null,
                bestMonth
            });
        } catch (err) {
            console.warn(`⚠️  Yearly summary failed for ${user.email}: ${err.message}`);
        }
    }
}, { timezone: 'Asia/Kolkata' });

console.log('⏰ Email cron jobs scheduled (monthly: 1st of month 9AM IST, yearly: Jan 1st 9AM IST)');

// Graceful shutdown
process.on('SIGINT', () => {
    db.close();
    console.log('\n👋 Server stopped');
    process.exit(0);
});