/**
 * BACKEND SERVER FOR SPENSE APP
 *
 * This is a Node.js Express server that handles:
 * - User registration
 * - User login
 * - Password hashing (encryption)
 * - JWT authentication tokens
 * - Database storage using PostgreSQL (Railway)
 *
 * WHAT YOU NEED TO INSTALL:
 * Run these commands in your terminal:
 * npm install express cors bcryptjs jsonwebtoken pg dotenv node-cron
 * npm uninstall @libsql/client better-sqlite3
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
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
app.use(cors());
app.use(express.json());
const path = require('path');
app.use(express.static(path.join(__dirname, 'public')));

/**
 * DATABASE SETUP
 * Using PostgreSQL via Railway.
 * Set DATABASE_URL in your .env locally, Railway injects it automatically in production.
 */
const db = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Helper: run a query with positional params
// Converts libsql-style { sql, args } → pg-style (sql, params)
// Usage: await query('SELECT * FROM users WHERE id = $1', [id])
async function query(sql, params) {
    const res = await db.query(sql, params);
    return res.rows;
}

const dbInitPromise = (async () => {
    // Create users table
    await db.query(`
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            theme TEXT DEFAULT 'doodle-light',
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Create expenses table
    await db.query(`
        CREATE TABLE IF NOT EXISTS expenses (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            amount REAL NOT NULL,
            category TEXT NOT NULL,
            type TEXT NOT NULL DEFAULT 'need',
            mood TEXT DEFAULT '😊',
            date TEXT NOT NULL,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);

    // Create budgets table
    await db.query(`
        CREATE TABLE IF NOT EXISTS budgets (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL UNIQUE,
            monthly_budget REAL NOT NULL DEFAULT 5000,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);

    // Create subscriptions table
    await db.query(`
        CREATE TABLE IF NOT EXISTS subscriptions (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            cost REAL NOT NULL,
            cycle TEXT NOT NULL DEFAULT 'monthly',
            start_date TEXT NOT NULL,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);

    // Create password_reset_tokens table
    await db.query(`
        CREATE TABLE IF NOT EXISTS password_reset_tokens (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            token TEXT NOT NULL UNIQUE,
            expires_at TIMESTAMPTZ NOT NULL,
            used INTEGER DEFAULT 0,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);

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
 */
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ message: 'Please provide name, email, and password' });
        }

        const existing = await query('SELECT * FROM users WHERE email = $1', [email]);
        if (existing[0]) {
            return res.status(400).json({ message: 'Email already registered' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const result = await query(
            'INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING id',
            [name, email, hashedPassword]
        );

        res.status(201).json({
            message: 'User registered successfully',
            userId: result[0].id
        });

        console.log(`✅ New user registered: ${email}`);

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ message: 'Server error during registration: ' + (error.message || error) });
    }
});

/**
 * API ENDPOINT: Login User
 * POST /api/login
 */
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: 'Please provide email and password' });
        }

        const users = await query('SELECT * FROM users WHERE email = $1', [email]);
        const user = users[0];

        if (!user) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        const token = jwt.sign(
            { userId: user.id, email: user.email },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            message: 'Login successful',
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                theme: user.theme || 'doodle-light'
            }
        });

        console.log(`✅ User logged in: ${email}`);
        sendLoginEmail(user.name, user.email).catch(() => {});

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Server error during login: ' + (error.message || error) });
    }
});

/**
 * API ENDPOINT: Forgot Password
 * POST /api/forgot-password
 */
app.post('/api/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ message: 'Email is required' });

        const users = await query('SELECT * FROM users WHERE email = $1', [email]);
        const user = users[0];

        if (!user) {
            return res.json({ message: 'If that email is registered, a reset link has been sent.' });
        }

        const crypto = require('crypto');
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_MS).toISOString();

        await query('DELETE FROM password_reset_tokens WHERE user_id = $1', [user.id]);
        await query(
            'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
            [user.id, token, expiresAt]
        );

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
 */
app.post('/api/reset-password', async (req, res) => {
    try {
        const { token, password } = req.body;
        if (!token || !password) return res.status(400).json({ message: 'Token and password are required' });
        if (password.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters' });

        const records = await query(
            'SELECT * FROM password_reset_tokens WHERE token = $1 AND used = 0',
            [token]
        );
        const resetRecord = records[0];

        if (!resetRecord) return res.status(400).json({ message: 'Invalid or expired reset link' });

        if (new Date(resetRecord.expires_at) < new Date()) {
            return res.status(400).json({ message: 'This reset link has expired. Please request a new one.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        await query('UPDATE users SET password = $1 WHERE id = $2', [hashedPassword, resetRecord.user_id]);
        await query('UPDATE password_reset_tokens SET used = 1 WHERE id = $1', [resetRecord.id]);

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
 */
app.post('/api/google-login', async (req, res) => {
    try {
        const { token: googleToken } = req.body;

        if (!googleToken) {
            return res.status(400).json({ message: 'Google token required' });
        }

        try {
            const parts = googleToken.split('.');
            const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
            const { email, name } = payload;

            if (!email) {
                return res.status(400).json({ message: 'Invalid Google token' });
            }

            let users = await query('SELECT * FROM users WHERE email = $1', [email]);
            let user = users[0];

            if (!user) {
                const randomPassword = await bcrypt.hash(Math.random().toString(36), 10);
                const result = await query(
                    'INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING id',
                    [name || email.split('@')[0], email, randomPassword]
                );
                const newUsers = await query('SELECT * FROM users WHERE id = $1', [result[0].id]);
                user = newUsers[0];
                console.log(`✅ New user created via Google: ${email}`);
            }

            const authToken = jwt.sign(
                { userId: user.id, email: user.email },
                JWT_SECRET,
                { expiresIn: '7d' }
            );

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
            return res.status(400).json({ message: 'Invalid Google token format' });
        }

    } catch (error) {
        console.error('Google login error:', error);
        res.status(500).json({ message: 'Server error during Google login' });
    }
});

/**
 * MIDDLEWARE: Verify JWT Token
 */
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

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
 * API ENDPOINT: Get User Profile
 * GET /api/profile
 */
app.get('/api/profile', authenticateToken, async (req, res) => {
    try {
        const users = await query(
            'SELECT id, name, email, created_at FROM users WHERE id = $1',
            [req.user.userId]
        );
        const user = users[0];

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
 * API ENDPOINT: Get All Users
 * GET /api/users
 */
app.get('/api/users', async (req, res) => {
    try {
        const users = await query('SELECT id, name, email, created_at FROM users', []);
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

        await query('UPDATE users SET theme = $1 WHERE id = $2', [theme, req.user.userId]);
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
 * GET /api/expenses?date=YYYY-MM-DD
 */
app.get('/api/expenses', authenticateToken, async (req, res) => {
    try {
        const date = req.query.date || new Date().toISOString().split('T')[0];
        const expenses = await query(
            'SELECT * FROM expenses WHERE user_id = $1 AND date = $2 ORDER BY created_at DESC',
            [req.user.userId, date]
        );
        res.json({ expenses });
    } catch (error) {
        console.error('Fetch expenses error:', error);
        res.status(500).json({ message: 'Server error fetching expenses: ' + (error.message || error) });
    }
});

/**
 * POST /api/expenses
 */
app.post('/api/expenses', authenticateToken, async (req, res) => {
    try {
        const { name, amount, category, type, mood, date } = req.body;

        if (!name || amount === undefined || !category) {
            return res.status(400).json({ message: 'Name, amount, and category are required' });
        }

        const expenseDate = date || new Date().toISOString().split('T')[0];

        const result = await query(
            'INSERT INTO expenses (user_id, name, amount, category, type, mood, date) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
            [req.user.userId, name, amount, category, type || 'need', mood || '😊', expenseDate]
        );

        const newExpense = (await query('SELECT * FROM expenses WHERE id = $1', [result[0].id]))[0];

        console.log(`✅ Expense added: ${name} - ₹${amount} by user ${req.user.userId}`);
        res.status(201).json({ message: 'Expense added', expense: newExpense });
    } catch (error) {
        console.error('Add expense error:', error);
        res.status(500).json({ message: 'Server error adding expense' });
    }
});

/**
 * PUT /api/expenses/:id
 */
app.put('/api/expenses/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, amount, category, type, mood } = req.body;

        const existing = (await query(
            'SELECT * FROM expenses WHERE id = $1 AND user_id = $2',
            [id, req.user.userId]
        ))[0];

        if (!existing) {
            return res.status(404).json({ message: 'Expense not found' });
        }

        await query(`
            UPDATE expenses SET
                name = COALESCE($1, name),
                amount = COALESCE($2, amount),
                category = COALESCE($3, category),
                type = COALESCE($4, type),
                mood = COALESCE($5, mood)
            WHERE id = $6 AND user_id = $7
        `, [name || null, amount || null, category || null, type || null, mood || null, id, req.user.userId]);

        const updated = (await query('SELECT * FROM expenses WHERE id = $1', [id]))[0];
        res.json({ message: 'Expense updated', expense: updated });
    } catch (error) {
        console.error('Update expense error:', error);
        res.status(500).json({ message: 'Server error updating expense' });
    }
});

/**
 * DELETE /api/expenses/:id
 */
app.delete('/api/expenses/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        const existing = (await query(
            'SELECT * FROM expenses WHERE id = $1 AND user_id = $2',
            [id, req.user.userId]
        ))[0];

        if (!existing) {
            return res.status(404).json({ message: 'Expense not found' });
        }

        await query('DELETE FROM expenses WHERE id = $1 AND user_id = $2', [id, req.user.userId]);

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
 * GET /api/budget
 */
app.get('/api/budget', authenticateToken, async (req, res) => {
    try {
        let budget = (await query('SELECT * FROM budgets WHERE user_id = $1', [req.user.userId]))[0];

        if (!budget) {
            await query('INSERT INTO budgets (user_id, monthly_budget) VALUES ($1, 5000)', [req.user.userId]);
            budget = (await query('SELECT * FROM budgets WHERE user_id = $1', [req.user.userId]))[0];
        }

        res.json({ budget });
    } catch (error) {
        console.error('Get budget error:', error);
        res.status(500).json({ message: 'Server error fetching budget' });
    }
});

/**
 * PUT /api/budget
 */
app.put('/api/budget', authenticateToken, async (req, res) => {
    try {
        const monthlyBudget = Number(req.body.monthly_budget);

        if (!Number.isFinite(monthlyBudget) || monthlyBudget <= 0) {
            return res.status(400).json({ message: 'Valid budget amount is required' });
        }

        const existing = (await query('SELECT * FROM budgets WHERE user_id = $1', [req.user.userId]))[0];

        if (existing) {
            await query(
                'UPDATE budgets SET monthly_budget = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2',
                [monthlyBudget, req.user.userId]
            );
        } else {
            await query(
                'INSERT INTO budgets (user_id, monthly_budget) VALUES ($1, $2)',
                [req.user.userId, monthlyBudget]
            );
        }

        const budget = (await query('SELECT * FROM budgets WHERE user_id = $1', [req.user.userId]))[0];
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
 * GET /api/analytics/weekly?date=YYYY-MM-DD
 */
app.get('/api/analytics/weekly', authenticateToken, async (req, res) => {
    try {
        const refDate = req.query.date ? new Date(req.query.date) : new Date();
        const dayOfWeek = refDate.getDay();
        const monday = new Date(refDate);
        monday.setDate(refDate.getDate() - ((dayOfWeek + 6) % 7));

        const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        const weeklyData = [];

        for (let i = 0; i < 7; i++) {
            const d = new Date(monday);
            d.setDate(monday.getDate() + i);
            const dateStr = d.toISOString().split('T')[0];

            const result = (await query(
                'SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE user_id = $1 AND date = $2',
                [req.user.userId, dateStr]
            ))[0];

            weeklyData.push({ day: days[i], date: dateStr, total: result.total });
        }

        res.json({ weeklyData });
    } catch (error) {
        console.error('Weekly analytics error:', error);
        res.status(500).json({ message: 'Server error fetching analytics' });
    }
});

/**
 * GET /api/analytics/monthly-chart?date=YYYY-MM-DD
 */
app.get('/api/analytics/monthly-chart', authenticateToken, async (req, res) => {
    try {
        const refDate = req.query.date ? new Date(req.query.date) : new Date();
        const year = refDate.getFullYear();
        const month = refDate.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const monthlyData = [];

        for (let i = 1; i <= daysInMonth; i++) {
            const dateStr = new Date(year, month, i, 12, 0, 0).toISOString().split('T')[0];
            const result = (await query(
                'SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE user_id = $1 AND date = $2',
                [req.user.userId, dateStr]
            ))[0];

            monthlyData.push({ day: i.toString(), date: dateStr, total: result.total });
        }

        res.json({ monthlyData });
    } catch (error) {
        console.error('Monthly chart analytics error:', error);
        res.status(500).json({ message: 'Server error fetching analytics' });
    }
});

/**
 * GET /api/analytics/yearly-chart?date=YYYY-MM-DD
 */
app.get('/api/analytics/yearly-chart', authenticateToken, async (req, res) => {
    try {
        const refDate = req.query.date ? new Date(req.query.date) : new Date();
        const year = refDate.getFullYear();
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const yearlyData = [];

        for (let i = 0; i < 12; i++) {
            const monthStr = `${year}-${String(i + 1).padStart(2, '0')}`;
            const result = (await query(
                "SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE user_id = $1 AND date LIKE $2",
                [req.user.userId, `${monthStr}%`]
            ))[0];

            yearlyData.push({ day: months[i], date: monthStr, total: result.total });
        }

        res.json({ yearlyData });
    } catch (error) {
        console.error('Yearly chart analytics error:', error);
        res.status(500).json({ message: 'Server error fetching analytics' });
    }
});

/**
 * GET /api/analytics/category-breakdown?timeframe=weekly|monthly|yearly&date=YYYY-MM-DD
 */
app.get('/api/analytics/category-breakdown', authenticateToken, async (req, res) => {
    try {
        const { timeframe, date } = req.query;
        const refDate = date ? new Date(date) : new Date();
        let sql = '';
        let params = [req.user.userId];

        if (timeframe === 'weekly') {
            const dayOfWeek = refDate.getDay();
            const monday = new Date(refDate);
            monday.setDate(refDate.getDate() - ((dayOfWeek + 6) % 7));
            const rangeStart = monday.toISOString().split('T')[0];
            const sunday = new Date(monday);
            sunday.setDate(monday.getDate() + 6);
            const rangeEnd = sunday.toISOString().split('T')[0];
            sql = 'SELECT category as label, SUM(amount) as total FROM expenses WHERE user_id = $1 AND date BETWEEN $2 AND $3 GROUP BY category';
            params.push(rangeStart, rangeEnd);
        } else if (timeframe === 'monthly') {
            const month = refDate.toISOString().slice(0, 7);
            sql = "SELECT category as label, SUM(amount) as total FROM expenses WHERE user_id = $1 AND date LIKE $2 GROUP BY category";
            params.push(`${month}%`);
        } else {
            const year = refDate.getFullYear();
            sql = "SELECT category as label, SUM(amount) as total FROM expenses WHERE user_id = $1 AND date LIKE $2 GROUP BY category";
            params.push(`${year}%`);
        }

        let breakdown = await query(sql, params);

        const subs = await query('SELECT cost, cycle FROM subscriptions WHERE user_id = $1', [req.user.userId]);
        let monthlySubTotal = 0;
        subs.forEach(s => {
            if (s.cycle === 'yearly') monthlySubTotal += s.cost / 12;
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
 * GET /api/analytics/monthly?month=YYYY-MM
 */
app.get('/api/analytics/monthly', authenticateToken, async (req, res) => {
    try {
        const month = req.query.month || new Date().toISOString().slice(0, 7);

        const totalSpent = (await query(
            "SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE user_id = $1 AND date LIKE $2",
            [req.user.userId, `${month}%`]
        ))[0];

        const needsTotal = (await query(
            "SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE user_id = $1 AND date LIKE $2 AND type = 'need'",
            [req.user.userId, `${month}%`]
        ))[0];

        const wantsTotal = (await query(
            "SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE user_id = $1 AND date LIKE $2 AND type = 'want'",
            [req.user.userId, `${month}%`]
        ))[0];

        const trackingDays = (await query(
            "SELECT COUNT(DISTINCT date) as days FROM expenses WHERE user_id = $1 AND date LIKE $2",
            [req.user.userId, `${month}%`]
        ))[0];

        const subs = await query('SELECT cost, cycle FROM subscriptions WHERE user_id = $1', [req.user.userId]);
        let subTotal = 0;
        subs.forEach(s => {
            if (s.cycle === 'yearly') subTotal += s.cost / 12;
            else subTotal += s.cost;
        });

        res.json({
            month,
            totalSpent: totalSpent.total + subTotal,
            needsTotal: needsTotal.total + subTotal,
            wantsTotal: wantsTotal.total,
            trackingDays: trackingDays.days
        });
    } catch (error) {
        console.error('Monthly analytics error:', error);
        res.status(500).json({ message: 'Server error fetching monthly analytics' });
    }
});

/**
 * GET /api/analytics/streak
 */
app.get('/api/analytics/streak', authenticateToken, async (req, res) => {
    try {
        let streak = 0;
        const today = new Date();

        for (let i = 0; i < 365; i++) {
            const d = new Date(today);
            d.setDate(today.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];

            const result = (await query(
                'SELECT COUNT(*) as count FROM expenses WHERE user_id = $1 AND date = $2',
                [req.user.userId, dateStr]
            ))[0];

            if (result.count > 0) {
                streak++;
            } else {
                if (i === 0) {
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

// ============================================================
// SUBSCRIPTIONS ENDPOINTS
// ============================================================

app.get('/api/subscriptions', authenticateToken, async (req, res) => {
    try {
        const subs = await query(
            'SELECT * FROM subscriptions WHERE user_id = $1 ORDER BY start_date ASC',
            [req.user.userId]
        );
        res.json(subs);
    } catch (error) {
        console.error('Fetch subscriptions error:', error);
        res.status(500).json({ message: 'Server error parsing subscriptions' });
    }
});

app.post('/api/subscriptions', authenticateToken, async (req, res) => {
    try {
        const { name, cost, cycle, start_date } = req.body;
        if (!name || isNaN(cost) || !start_date || !cycle) {
            return res.status(400).json({ message: 'Invalid subscription data' });
        }

        const result = await query(
            'INSERT INTO subscriptions (user_id, name, cost, cycle, start_date) VALUES ($1, $2, $3, $4, $5) RETURNING id',
            [req.user.userId, name, Number(cost), cycle, start_date]
        );

        res.status(201).json({ message: 'Subscription added successfully', id: result[0].id });
    } catch (error) {
        console.error('Add subscription error:', error);
        res.status(500).json({ message: 'Server error saving subscription' });
    }
});

app.delete('/api/subscriptions/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const existing = (await query(
            'SELECT * FROM subscriptions WHERE id = $1 AND user_id = $2',
            [id, req.user.userId]
        ))[0];

        if (!existing) {
            return res.status(404).json({ message: 'Subscription not found or unauthorized' });
        }

        await query('DELETE FROM subscriptions WHERE id = $1 AND user_id = $2', [id, req.user.userId]);
        res.json({ message: 'Subscription deleted successfully' });
    } catch (error) {
        console.error('Delete subscription error:', error);
        res.status(500).json({ message: 'Server error deleting subscription' });
    }
});

// ============================================================
// START SERVER
// ============================================================
app.listen(PORT, () => {
    console.log(`
🚀 Spense Backend Server Running!
📍 Server: http://localhost:${PORT}
📊 Database: PostgreSQL (Railway)
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

module.exports = app;

// ─── CRON JOB: Monthly Summary ────────────────────────────────────────────────
cron.schedule('30 3 1 * *', async () => {
    console.log('📅 Running monthly summary email job...');

    const users = await query('SELECT id, name, email FROM users', []);

    for (const user of users) {
        try {
            const now = new Date();
            const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const ym = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`;

            const totalRow = (await query(`
                SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as cnt
                FROM expenses
                WHERE user_id = $1 AND date LIKE $2
            `, [user.id, `${ym}%`]))[0];

            const budgetRow = (await query('SELECT monthly_budget FROM budgets WHERE user_id = $1', [user.id]))[0];

            const categories = (await query(`
                SELECT category as label, SUM(amount) as total
                FROM expenses
                WHERE user_id = $1 AND date LIKE $2
                GROUP BY category ORDER BY total DESC LIMIT 1
            `, [user.id, `${ym}%`]))[0];

            const subs = await query('SELECT cost, cycle FROM subscriptions WHERE user_id = $1', [user.id]);
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
cron.schedule('30 3 1 1 *', async () => {
    console.log('🎉 Running yearly summary email job...');

    const users = await query('SELECT id, name, email FROM users', []);
    const prevYear = new Date().getFullYear() - 1;

    for (const user of users) {
        try {
            const totalRow = (await query(`
                SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as cnt
                FROM expenses
                WHERE user_id = $1 AND date LIKE $2
            `, [user.id, `${prevYear}%`]))[0];

            const avgMonthly = Math.round((totalRow.total || 0) / 12);

            const topCat = (await query(`
                SELECT category as label, SUM(amount) as total
                FROM expenses
                WHERE user_id = $1 AND date LIKE $2
                GROUP BY category ORDER BY total DESC LIMIT 1
            `, [user.id, `${prevYear}%`]))[0];

            const monthlyRows = (await query(`
                SELECT TO_CHAR(TO_DATE(date, 'YYYY-MM-DD'), 'YYYY-MM') as ym, SUM(amount) as total
                FROM expenses
                WHERE user_id = $1 AND date LIKE $2
                GROUP BY ym ORDER BY total ASC LIMIT 1
            `, [user.id, `${prevYear}%`]))[0];

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
process.on('SIGINT', async () => {
    await db.end();
    console.log('\n👋 Server stopped');
    process.exit(0);
});