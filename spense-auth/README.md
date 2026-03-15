# SPENSE - Login & Authentication System

## 📚 BEGINNER'S GUIDE TO UNDERSTANDING THIS PROJECT

Welcome! This project teaches you how login/authentication works with a real backend and database.

---

## 🎯 WHAT YOU'LL LEARN

1. **Frontend** - The user interface (HTML, CSS, JavaScript)
2. **Backend** - The server that handles requests (Node.js, Express)
3. **Database** - Where user data is stored (SQLite)
4. **Authentication** - How login/signup works securely
5. **API** - How frontend and backend communicate

---

## 📁 PROJECT FILES

```
spense-auth/
├── login.html          # Login/Signup page (Frontend)
├── dashboard.html      # Dashboard after login (Frontend)
├── server.js          # Backend server (Node.js)
├── package.json       # Project dependencies
├── spense.db          # Database file (created automatically)
└── README.md          # This file
```

---

## 🚀 SETUP INSTRUCTIONS

### Step 1: Install Node.js

1. Go to https://nodejs.org/
2. Download and install the LTS version
3. Verify installation by opening terminal/command prompt and typing:
   ```bash
   node --version
   npm --version
   ```

### Step 2: Create Project Folder

```bash
# Create a folder for your project
mkdir spense-auth
cd spense-auth
```

### Step 3: Copy Files

Copy these 3 files into your spense-auth folder:
- login.html
- dashboard.html
- server.js

### Step 4: Initialize NPM

```bash
npm init -y
```

This creates a `package.json` file.

### Step 5: Install Dependencies

```bash
npm install express cors bcryptjs jsonwebtoken better-sqlite3
```

**What each package does:**
- **express**: Web server framework
- **cors**: Allows frontend to talk to backend
- **bcryptjs**: Encrypts passwords securely
- **jsonwebtoken**: Creates authentication tokens
- **better-sqlite3**: Simple database

### Step 6: Start the Server

```bash
node server.js
```

You should see:
```
🚀 Spense Backend Server Running!
📍 Server: http://localhost:3000
📊 Database: spense.db
```

### Step 7: Open the Login Page

1. Open `login.html` in your web browser
2. Or use Live Server extension in VS Code

---

## 🔍 HOW IT WORKS

### **Registration Flow**

```
User fills form → Frontend validates → Sends to Backend
                                            ↓
                                      Checks if email exists
                                            ↓
                                      Hashes password
                                            ↓
                                      Saves to database
                                            ↓
                                      Returns success/error
```

### **Login Flow**

```
User enters credentials → Frontend sends to Backend
                                      ↓
                                Finds user in database
                                      ↓
                                Compares passwords
                                      ↓
                                Creates JWT token
                                      ↓
                                Returns token to frontend
                                      ↓
                          Frontend stores token
                                      ↓
                          Redirects to dashboard
```

### **Dashboard Flow**

```
Page loads → Checks for token → Sends token to backend
                                        ↓
                                  Verifies token
                                        ↓
                                  Returns user data
                                        ↓
                                  Displays dashboard
```

---

## 🔐 SECURITY FEATURES

### 1. **Password Hashing**
Passwords are NEVER stored in plain text!

```javascript
// Plain password: "mypassword123"
// Hashed password: "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy"
```

Even if someone hacks the database, they can't see real passwords.

### 2. **JWT Tokens**
After login, user gets a token that proves they're authenticated.

```javascript
// Token example:
"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEsImVtYWlsIjoidGVzdEB0ZXN0LmNvbSJ9.xyz123"
```

This token is sent with every request to protected pages.

### 3. **HTTPS (in production)**
In real production, you'd use HTTPS to encrypt all communication.

---

## 📊 DATABASE STRUCTURE

### Users Table

| Column     | Type    | Description                    |
|------------|---------|--------------------------------|
| id         | INTEGER | Unique user ID (auto-generated)|
| name       | TEXT    | User's full name               |
| email      | TEXT    | User's email (unique)          |
| password   | TEXT    | Hashed password                |
| created_at | DATETIME| When account was created       |

---

## 🧪 TESTING THE APP

### Test Case 1: Register New User

1. Open login.html
2. Click "Register here"
3. Fill in:
   - Name: John Doe
   - Email: john@test.com
   - Password: password123
   - Confirm: password123
4. Click "Register"
5. You should see "Account created successfully!"

### Test Case 2: Login

1. Enter:
   - Email: john@test.com
   - Password: password123
2. Click "Log in"
3. You should be redirected to dashboard

### Test Case 3: View Database

You can view the database using:
- DB Browser for SQLite (https://sqlitebrowser.org/)
- Open the `spense.db` file

---

## 🐛 COMMON ERRORS & SOLUTIONS

### Error: "Network error. Please check if the server is running."

**Solution:**
- Make sure you ran `node server.js`
- Check if you see the server startup message
- Make sure server is running on port 3000

### Error: "Email already registered"

**Solution:**
- This email is already in the database
- Use a different email
- Or delete `spense.db` to reset database

### Error: "Cannot find module 'express'"

**Solution:**
- Run `npm install express cors bcryptjs jsonwebtoken better-sqlite3`
- Make sure you're in the correct folder

### Error: "Invalid email or password"

**Solution:**
- Check your email and password
- Remember: passwords are case-sensitive
- Make sure you registered first

---

## 🎓 KEY CONCEPTS EXPLAINED

### What is an API?

API = Application Programming Interface

It's how the frontend talks to the backend:

```
Frontend: "Hey backend, register this user!"
Backend: "OK, user registered! Here's the user ID: 5"
```

### What is CORS?

CORS = Cross-Origin Resource Sharing

It allows your frontend (login.html) to make requests to your backend (server.js), even though they're on different "origins".

### What is Middleware?

Functions that run BEFORE your route handlers:

```javascript
app.use(cors());        // Runs first - allows cross-origin requests
app.use(express.json()); // Runs second - parses JSON data
app.post('/api/login');  // Runs last - your actual route
```

### What is JWT?

JWT = JSON Web Token

A secure way to verify users without storing sessions on the server.

```
User logs in → Server creates JWT → User stores JWT
User visits page → Sends JWT → Server verifies JWT → Grants access
```

---

## 🔧 CUSTOMIZATION IDEAS

### 1. Add Email Validation

```javascript
function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
```

### 2. Add Password Strength Check

```javascript
function isStrongPassword(password) {
    return password.length >= 8 && 
           /[A-Z]/.test(password) && 
           /[0-9]/.test(password);
}
```

### 3. Add "Remember Me" Functionality

Store token for longer period if checkbox is checked.

### 4. Add Password Reset

Create a "forgot password" feature with email verification.

### 5. Add User Profile Update

Let users change their name, email, or password.

---

## 📚 NEXT STEPS

After understanding this authentication system, you can:

1. **Add More Features**
   - User profile editing
   - Password reset
   - Email verification
   - Two-factor authentication

2. **Build Your Full App**
   - Connect this to your SpendSense app
   - Add expense tracking
   - Add budget features
   - Add data visualization

3. **Deploy to Production**
   - Use a hosting service (Heroku, Vercel, Railway)
   - Switch to PostgreSQL or MongoDB
   - Add environment variables
   - Enable HTTPS

---

## 💡 HELPFUL RESOURCES

- **Node.js Docs**: https://nodejs.org/docs
- **Express Guide**: https://expressjs.com/
- **JWT.io**: https://jwt.io/
- **bcrypt Docs**: https://www.npmjs.com/package/bcryptjs
- **SQLite Tutorial**: https://www.sqlitetutorial.net/

---

## ❓ FAQ

**Q: Is this production-ready?**
A: No, this is for learning. For production, you need:
- Environment variables for secrets
- Better error handling
- Rate limiting
- Email verification
- HTTPS
- More robust database (PostgreSQL, MySQL)

**Q: Can I use this for my real project?**
A: Yes, but improve security first:
- Use environment variables
- Add input validation
- Implement rate limiting
- Use HTTPS
- Add email verification

**Q: What database should I use for production?**
A: SQLite is great for learning, but for production use:
- PostgreSQL (recommended)
- MySQL
- MongoDB

**Q: How do I deploy this?**
A: You can deploy to:
- Heroku
- Railway
- Render
- DigitalOcean
- AWS

---

## 🤝 NEED HELP?

If you're stuck:
1. Check the error message carefully
2. Read the comments in the code
3. Google the error message
4. Check Stack Overflow
5. Ask in developer communities

---

## 🎉 CONGRATULATIONS!

You now have a working authentication system! You understand:
- How login/signup works
- How backends communicate with databases
- How to secure passwords
- How to use JWT tokens
- How to build APIs

Keep building and learning! 🚀