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
const { createClient } = require('@libsql/client');
const cron = require('node-cron');
const { sendLoginEmail, sendMonthlySummaryEmail, sendYearlySummaryEmail, sendPasswordResetEmail } = require('./emailService');

// Create Express app
const app = express();
const PORT = process.env.PORT || 3000;
const RESET_TOKEN_EXPIRY_HOURS = Number(process.env.RESET_TOKEN_EXPIRY_HOURS) || 6;
const RESET_TOKEN_EXPIRY_MS = RESET_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000;

// Secret key for JWT
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key-only';

// Middleware
app.use(cors()); // Allow requests from frontend
app.use(express.json()); // Parse JSON request bodies
const path = require('path');
app.use(express.static(path.join(__dirname, 'public'))); // Serve static files from public folder

function getLocalDateString(value = new Date()) {
    const d = value instanceof Date ? value : new Date(value);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/** Gregorian calendar YYYY-MM-DD minus N days (UTC components; matches client-stored date strings). */
function subtractCalendarDays(ymd, deltaDays) {
    const parts = ymd.split('-').map(Number);
    const y = parts[0];
    const m = parts[1];
    const day = parts[2];
    if (!y || !m || !day) return ymd;
    const dt = new Date(Date.UTC(y, m - 1, day));
    dt.setUTCDate(dt.getUTCDate() - deltaDays);
    const yy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(dt.getUTCDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
}

/**
 * DATABASE SETUP
 * Using SQLite - a simple file-based database
 * Perfect for learning and small applications
 * 
 * NOTE: On Vercel, the filesystem is read-only except /tmp.
 * We use /tmp/spense.db there. Data won't persist between cold starts.
 * For persistent data on Vercel, switch to a cloud DB (Turso, Neon, Supabase).
 */

// Setup Turso Database Client
const fallbackDbPath = process.env.VERCEL ? 'file:/tmp/spense.db' : 'file:spense.db';
const db = createClient({
    url: process.env.TURSO_DATABASE_URL || fallbackDbPath,
    authToken: process.env.TURSO_AUTH_TOKEN
});

const dbInitPromise = (async () => {
// Create users table if it doesn't exist
await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`);

// Create expenses table
await db.executeMultiple(`
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
await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS budgets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL UNIQUE,
        monthly_budget REAL NOT NULL DEFAULT 5000,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )
`);
// Create subscriptions table
await db.executeMultiple(`
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

await db.executeMultiple(`
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
    await db.execute("ALTER TABLE users ADD COLUMN theme TEXT DEFAULT 'doodle-light'");
    console.log('✅ Added theme column to users table');
} catch (e) {
    // Column likely already exists
}

console.log('✅ Database initialized (users, expenses, budgets, subscriptions, reset_tokens tables)');
})();

// Middleware to ensure DB is initialized before handling ANY request
app.use(async (req, res, next) => {
    try {
        await dbInitPromise;
        next();
    } catch (err) {
        console.error("Database initialization failed:", err);
        res.status(500).json({ message: "Database initialization failed" });
    }
});

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
        const existingUser = (await db.execute({ sql: 'SELECT * FROM users WHERE email = ?', args: [email] })).rows[0];
        
        if (existingUser) {
            return res.status(400).json({ 
                message: 'Email already registered' 
            });
        }

        // STEP 3: Hash the password
        // Never store plain passwords! bcrypt creates a secure hash
        const hashedPassword = await bcrypt.hash(password, 10);

        // STEP 4: Insert new user into database
        const result = await db.execute({ sql: `
            INSERT INTO users (name, email, password) 
            VALUES (?, ?, ?)
        `, args: [name, email, hashedPassword] });

        // STEP 5: Return success response
        res.status(201).json({
            message: 'User registered successfully',
            userId: Number(result.lastInsertRowid)
        });

        console.log(`✅ New user registered: ${email}`);

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ 
            message: 'Server error during registration: ' + (error.message || error)
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
        const user = (await db.execute({ sql: 'SELECT * FROM users WHERE email = ?', args: [email] })).rows[0];

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
            message: 'Server error during login: ' + (error.message || error)
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

        const user = (await db.execute({ sql: 'SELECT * FROM users WHERE email = ?', args: [email] })).rows[0];

        // Always return success to prevent email enumeration
        if (!user) {
            return res.json({ message: 'If that email is registered, a reset link has been sent.' });
        }

        // Generate a secure random token
        const crypto = require('crypto');
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_MS).toISOString(); // expires in 6 hours
        await db.execute({ sql: 'DELETE FROM password_reset_tokens WHERE user_id = ?', args: [user.id] });
        await db.execute({
            sql: 'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)',
            args: [user.id, token, expiresAt]
        });

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
        const resetRecord = (await db.execute({
            sql: 'SELECT * FROM password_reset_tokens WHERE token = ? AND used = 0',
            args: [token]
        })).rows[0];

        if (!resetRecord) return res.status(400).json({ message: 'Invalid or expired reset link' });

        if (new Date(resetRecord.expires_at) < new Date()) {
            return res.status(400).json({ message: 'This reset link has expired. Please request a new one.' });
        }

        // Hash the new password and update user
        const hashedPassword = await bcrypt.hash(password, 10);
        await db.execute({ sql: 'UPDATE users SET password = ? WHERE id = ?', args: [hashedPassword, resetRecord.user_id] });

        // Mark token as used
        await db.execute({ sql: 'UPDATE password_reset_tokens SET used = 1 WHERE id = ?', args: [resetRecord.id] });

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
            let user = (await db.execute({ sql: 'SELECT * FROM users WHERE email = ?', args: [email] })).rows[0];

            if (!user) {
                // Create new user from Google account
                // Note: We use a random password since they'll login via Google
                const randomPassword = await bcrypt.hash(Math.random().toString(36), 10);
                
                const result = await db.execute({ sql: `
                    INSERT INTO users (name, email, password) 
                    VALUES (?, ?, ?)
                `, args: [name || email.split('@')[0], email, randomPassword] });

                // Fetch the newly created user
                user = (await db.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [Number(result.lastInsertRowid)] })).rows[0];
                
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
app.get('/api/profile', authenticateToken, async (req, res) => {
    try {
        const user = (await db.execute({
            sql: 'SELECT id, name, email, created_at FROM users WHERE id = ?',
            args: [req.user.userId]
        })).rows[0];

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
app.get('/api/users', async (req, res) => {
    try {
        const users = (await db.execute('SELECT id, name, email, created_at FROM users')).rows;
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
app.post('/api/user/theme', authenticateToken, async (req, res) => {
    try {
        const { theme } = req.body;
        if (!theme) return res.status(400).json({ message: 'Theme name required' });

        await db.execute({ sql: 'UPDATE users SET theme = ? WHERE id = ?', args: [theme, req.user.userId] });
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
app.get('/api/expenses', authenticateToken, async (req, res) => {
    try {
        const date = req.query.date || getLocalDateString();
        const expenses = (await db.execute({
            sql: 'SELECT * FROM expenses WHERE user_id = ? AND date = ? ORDER BY created_at DESC',
            args: [req.user.userId, date]
        })).rows;

        res.json({ expenses });
    } catch (error) {
        console.error('Fetch expenses error:', error);
        res.status(500).json({ message: 'Server error fetching expenses: ' + (error.message || error) });
    }
});

/**
 * API ENDPOINT: Add a new expense
 * POST /api/expenses
 */
app.post('/api/expenses', authenticateToken, async (req, res) => {
    try {
        const { name, amount, category, type, mood, date } = req.body;

        if (!name || amount === undefined || !category) {
            return res.status(400).json({ message: 'Name, amount, and category are required' });
        }

        const expenseDate = date || getLocalDateString();

        const result = await db.execute({ sql: `
            INSERT INTO expenses (user_id, name, amount, category, type, mood, date)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, args: [req.user.userId, name, amount, category, type || 'need', mood || '😊', expenseDate] });

        const newExpense = (await db.execute({ sql: 'SELECT * FROM expenses WHERE id = ?', args: [Number(result.lastInsertRowid)] })).rows[0];

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
app.put('/api/expenses/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, amount, category, type, mood } = req.body;

        // Ensure the expense belongs to the user
        const existing = (await db.execute({ sql: 'SELECT * FROM expenses WHERE id = ? AND user_id = ?', args: [id, req.user.userId] })).rows[0];
        if (!existing) {
            return res.status(404).json({ message: 'Expense not found' });
        }

        await db.execute({ sql: `
            UPDATE expenses SET 
                name = COALESCE(?, name),
                amount = COALESCE(?, amount),
                category = COALESCE(?, category),
                type = COALESCE(?, type),
                mood = COALESCE(?, mood)
            WHERE id = ? AND user_id = ?
        `, args: [name || null, amount || null, category || null, type || null, mood || null, id, req.user.userId] });

        const updated = (await db.execute({ sql: 'SELECT * FROM expenses WHERE id = ?', args: [id] })).rows[0];
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
app.delete('/api/expenses/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        const existing = (await db.execute({ sql: 'SELECT * FROM expenses WHERE id = ? AND user_id = ?', args: [id, req.user.userId] })).rows[0];
        if (!existing) {
            return res.status(404).json({ message: 'Expense not found' });
        }

        await db.execute({ sql: 'DELETE FROM expenses WHERE id = ? AND user_id = ?', args: [id, req.user.userId] });

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
app.get('/api/budget', authenticateToken, async (req, res) => {
    try {
        let budget = (await db.execute({ sql: 'SELECT * FROM budgets WHERE user_id = ?', args: [req.user.userId] })).rows[0];

        if (!budget) {
            // Create default budget for user
            await db.execute({ sql: 'INSERT INTO budgets (user_id, monthly_budget) VALUES (?, 5000)', args: [req.user.userId] });
            budget = (await db.execute({ sql: 'SELECT * FROM budgets WHERE user_id = ?', args: [req.user.userId] })).rows[0];
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
app.put('/api/budget', authenticateToken, async (req, res) => {
    try {
        const monthlyBudget = Number(req.body.monthly_budget);

        if (!Number.isFinite(monthlyBudget) || monthlyBudget <= 0) {
            return res.status(400).json({ message: 'Valid budget amount is required' });
        }

        const existing = (await db.execute({ sql: 'SELECT * FROM budgets WHERE user_id = ?', args: [req.user.userId] })).rows[0];

        if (existing) {
            await db.execute({ sql: 'UPDATE budgets SET monthly_budget = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?', args: [monthlyBudget, req.user.userId] });
        } else {
            await db.execute({ sql: 'INSERT INTO budgets (user_id, monthly_budget) VALUES (?, ?)', args: [req.user.userId, monthlyBudget] });
        }

        const budget = (await db.execute({ sql: 'SELECT * FROM budgets WHERE user_id = ?', args: [req.user.userId] })).rows[0];
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
app.get('/api/analytics/weekly', authenticateToken, async (req, res) => {
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
            const dateStr = getLocalDateString(d);

            const result = (await db.execute({
                sql: 'SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE user_id = ? AND date = ?',
                args: [req.user.userId, dateStr]
            })).rows[0];

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
app.get('/api/analytics/monthly-chart', authenticateToken, async (req, res) => {
    try {
        const refDate = req.query.date ? new Date(req.query.date) : new Date();
        const year = refDate.getFullYear();
        const month = refDate.getMonth();
        
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const monthlyData = [];

        for (let i = 1; i <= daysInMonth; i++) {
            const dateStr = getLocalDateString(new Date(year, month, i, 12, 0, 0));
            const result = (await db.execute({
                sql: 'SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE user_id = ? AND date = ?',
                args: [req.user.userId, dateStr]
            })).rows[0];

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
app.get('/api/analytics/yearly-chart', authenticateToken, async (req, res) => {
    try {
        const refDate = req.query.date ? new Date(req.query.date) : new Date();
        const year = refDate.getFullYear();
        
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const yearlyData = [];

        for (let i = 0; i < 12; i++) {
            const monthStr = `${year}-${String(i + 1).padStart(2, '0')}`;
            const result = (await db.execute({
                sql: 'SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE user_id = ? AND date LIKE ?',
                args: [req.user.userId, `${monthStr}%`]
            })).rows[0];

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
app.get('/api/analytics/category-breakdown', authenticateToken, async (req, res) => {
    try {
        const { timeframe, date } = req.query;
        const refDate = date ? new Date(date) : new Date();
        let query = '';
        let params = [req.user.userId];

        if (timeframe === 'weekly') {
            const dayOfWeek = refDate.getDay();
            const monday = new Date(refDate);
            monday.setDate(refDate.getDate() - ((dayOfWeek + 6) % 7));
            const rangeStart = getLocalDateString(monday);
            const sunday = new Date(monday);
            sunday.setDate(monday.getDate() + 6);
            const rangeEnd = getLocalDateString(sunday);
            query = 'SELECT category as label, SUM(amount) as total FROM expenses WHERE user_id = ? AND date BETWEEN ? AND ? GROUP BY category';
            params.push(rangeStart, rangeEnd);
        } else if (timeframe === 'monthly') {
            const month = getLocalDateString(refDate).slice(0, 7);
            query = 'SELECT category as label, SUM(amount) as total FROM expenses WHERE user_id = ? AND date LIKE ? GROUP BY category';
            params.push(`${month}%`);
        } else {
            const year = refDate.getFullYear();
            query = 'SELECT category as label, SUM(amount) as total FROM expenses WHERE user_id = ? AND date LIKE ? GROUP BY category';
            params.push(`${year}%`);
        }

        let breakdown = (await db.execute({ sql: query, args: params })).rows;

        // Normalize subscriptions to monthly equivalent
        const subs = (await db.execute({ sql: 'SELECT cost, cycle FROM subscriptions WHERE user_id = ?', args: [req.user.userId] })).rows;
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
app.get('/api/analytics/monthly', authenticateToken, async (req, res) => {
    try {
        const month = req.query.month || getLocalDateString().slice(0, 7);

        const totalSpent = (await db.execute({
            sql: "SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE user_id = ? AND date LIKE ?",
            args: [req.user.userId, `${month}%`]
        })).rows[0];

        const needsTotal = (await db.execute({
            sql: "SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE user_id = ? AND date LIKE ? AND type = 'need'",
            args: [req.user.userId, `${month}%`]
        })).rows[0];

        const wantsTotal = (await db.execute({
            sql: "SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE user_id = ? AND date LIKE ? AND type = 'want'",
            args: [req.user.userId, `${month}%`]
        })).rows[0];

        const trackingDays = (await db.execute({
            sql: "SELECT COUNT(DISTINCT date) as days FROM expenses WHERE user_id = ? AND date LIKE ?",
            args: [req.user.userId, `${month}%`]
        })).rows[0];

        // Calculate normalized subscriptions
        const subs = (await db.execute({ sql: 'SELECT cost, cycle FROM subscriptions WHERE user_id = ?', args: [req.user.userId] })).rows;
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
app.get('/api/analytics/streak', authenticateToken, async (req, res) => {
    try {
        // Anchor to client's "today" so streak matches expense dates (browser en-CA dates).
        const asOfParam = req.query.asOf;
        const asOf = asOfParam && /^\d{4}-\d{2}-\d{2}$/.test(String(asOfParam))
            ? String(asOfParam)
            : getLocalDateString();

        let streak = 0;

        for (let i = 0; i < 365; i++) {
            const dateStr = subtractCalendarDays(asOf, i);

            const result = (await db.execute({
                sql: 'SELECT COUNT(*) as count FROM expenses WHERE user_id = ? AND date = ?',
                args: [req.user.userId, dateStr]
            })).rows[0];

            const count = Number(result.count);
            if (count > 0) {
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
app.get('/api/subscriptions', authenticateToken, async (req, res) => {
    try {
        const subs = (await db.execute({ sql: 'SELECT * FROM subscriptions WHERE user_id = ? ORDER BY start_date ASC', args: [req.user.userId] })).rows;
        res.json(subs);
    } catch (error) {
        console.error('Fetch subscriptions error:', error);
        res.status(500).json({ message: 'Server error parsing subscriptions' });
    }
});

// Add new subscription
app.post('/api/subscriptions', authenticateToken, async (req, res) => {
    try {
        const { name, cost, cycle, start_date } = req.body;
        if (!name || isNaN(cost) || !start_date || !cycle) {
            return res.status(400).json({ message: 'Invalid subscription data' });
        }

        const result = await db.execute({ sql: `
            INSERT INTO subscriptions (user_id, name, cost, cycle, start_date)
            VALUES (?, ?, ?, ?, ?)
        `, args: [req.user.userId, name, Number(cost), cycle, start_date] });

        res.status(201).json({ message: 'Subscription added successfully', id: Number(result.lastInsertRowid) });
    } catch (error) {
        console.error('Add subscription error:', error);
        res.status(500).json({ message: 'Server error saving subscription' });
    }
});

// Delete subscription
app.delete('/api/subscriptions/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const result = await db.execute({ sql: 'DELETE FROM subscriptions WHERE id = ? AND user_id = ?', args: [id, req.user.userId] });
        
        if (result.rowsAffected === 0) {
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
 * On Vercel, the app is exported as a serverless function — no listen() needed.
 * Locally, we call listen() as usual.
 */
if (!process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`
🚀 Spense Backend Server Running!
📍 Server: http://localhost:${PORT}
📊 Database: Turso Sqlite (or fallback)
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
}

// Export for Vercel serverless
module.exports = app;

// ─── CRON JOB: Monthly Summary ────────────────────────────────────────────────
// Runs at 9:00 AM IST on the 1st of every month
// IST = UTC+5:30, so 9:00 IST = 03:30 UTC
cron.schedule('30 3 1 * *', async () => {
    console.log('📅 Running monthly summary email job...');

    const users = (await db.execute('SELECT id, name, email FROM users')).rows;

    for (const user of users) {
        try {
            const now = new Date();
            const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const ym = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`;

            // Total spent last month
            const totalRow = (await db.execute({ sql: `
                SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as cnt
                FROM expenses
                WHERE user_id = ? AND strftime('%Y-%m', date) = ?
            `, args: [user.id, ym] })).rows[0];

            // Budget
            const budgetRow = (await db.execute({ sql: 'SELECT monthly_budget FROM budgets WHERE user_id = ?', args: [user.id] })).rows[0];

            // Top category
            const categories = (await db.execute({ sql: `
                SELECT category as label, SUM(amount) as total
                FROM expenses
                WHERE user_id = ? AND strftime('%Y-%m', date) = ?
                GROUP BY category ORDER BY total DESC LIMIT 1
            `, args: [user.id, ym] })).rows[0];

            // Subscription normalized monthly cost
            const subs = (await db.execute({ sql: 'SELECT cost, cycle FROM subscriptions WHERE user_id = ?', args: [user.id] })).rows;
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

    const users = (await db.execute('SELECT id, name, email FROM users')).rows;
    const prevYear = new Date().getFullYear() - 1;

    for (const user of users) {
        try {
            // Total spent in the previous year
            const totalRow = (await db.execute({ sql: `
                SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as cnt
                FROM expenses
                WHERE user_id = ? AND strftime('%Y', date) = ?
            `, args: [user.id, String(prevYear)] })).rows[0];

            // Average monthly spend
            const avgMonthly = Math.round((totalRow.total || 0) / 12);

            // Top category for the year
            const topCat = (await db.execute({ sql: `
                SELECT category as label, SUM(amount) as total
                FROM expenses
                WHERE user_id = ? AND strftime('%Y', date) = ?
                GROUP BY category ORDER BY total DESC LIMIT 1
            `, args: [user.id, String(prevYear)] })).rows[0];

            // Best month (lowest spending, only months with data)
            const monthlyRows = (await db.execute({ sql: `
                SELECT strftime('%Y-%m', date) as ym, SUM(amount) as total
                FROM expenses
                WHERE user_id = ? AND strftime('%Y', date) = ?
                GROUP BY ym ORDER BY total ASC LIMIT 1
            `, args: [user.id, String(prevYear)] })).rows[0];

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