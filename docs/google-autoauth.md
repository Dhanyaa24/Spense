# 🔐 GOOGLE OAUTH SETUP GUIDE

This guide will show you how to enable "Continue with Google" login for SpendSense.

---

## 📋 WHAT YOU'LL LEARN

1. How to create a Google Cloud Project
2. How to get OAuth credentials
3. How to configure your app
4. How Google OAuth works (explained for beginners)

---

## 🎯 STEP-BY-STEP SETUP

### Step 1: Create Google Cloud Project

1. **Go to Google Cloud Console**
   - Visit: https://console.cloud.google.com/
   - Sign in with your Google account

2. **Create New Project**
   - Click "Select a project" at the top
   - Click "NEW PROJECT"
   - Name it: "SpendSense Auth"
   - Click "CREATE"

3. **Wait for Project Creation**
   - It takes a few seconds
   - You'll see a notification when done

---

### Step 2: Enable Google+ API

1. **Go to API Library**
   - In the left sidebar, click "APIs & Services" → "Library"

2. **Search for Google+ API**
   - Type "Google+ API" in the search box
   - Click on "Google+ API"

3. **Enable the API**
   - Click "ENABLE"
   - Wait for it to activate

---

### Step 3: Create OAuth Credentials

1. **Go to Credentials**
   - Left sidebar → "APIs & Services" → "Credentials"

2. **Configure OAuth Consent Screen** (First Time Only)
   - Click "CONFIGURE CONSENT SCREEN"
   - Select "External"
   - Click "CREATE"
   
   Fill in:
   - App name: **SpendSense**
   - User support email: **your-email@gmail.com**
   - Developer contact: **your-email@gmail.com**
   - Click "SAVE AND CONTINUE"
   
   Scopes:
   - Click "ADD OR REMOVE SCOPES"
   - Select: `email`, `profile`, `openid`
   - Click "UPDATE"
   - Click "SAVE AND CONTINUE"
   
   Test Users (for development):
   - Click "ADD USERS"
   - Add your email
   - Click "SAVE AND CONTINUE"

3. **Create OAuth Client ID**
   - Click "CREATE CREDENTIALS" → "OAuth client ID"
   - Application type: **Web application**
   - Name: **SpendSense Web Client**
   
   **Authorized JavaScript origins:**
   ```
   http://localhost:3000
   http://127.0.0.1:3000
   ```
   
   **Authorized redirect URIs:**
   ```
   http://localhost:3000
   http://127.0.0.1:3000
   ```
   
   - Click "CREATE"

4. **Copy Your Client ID**
   - A popup will show your Client ID
   - **COPY THIS!** It looks like:
   ```
   123456789-abcdefghijklmnop.apps.googleusercontent.com
   ```
   - Save it somewhere safe

---

### Step 4: Add Client ID to Your Code

1. **Open `login.html`**

2. **Find this line (around line 480):**
   ```javascript
   const GOOGLE_CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID_HERE';
   ```

3. **Replace it with your actual Client ID:**
   ```javascript
   const GOOGLE_CLIENT_ID = '123456789-abcdefghijklmnop.apps.googleusercontent.com';
   ```

4. **Save the file**

---

### Step 5: Test Google Login

1. **Start your server:**
   ```bash
   node server.js
   ```

2. **Open `login.html` in browser**

3. **Click "Continue with Google"**

4. **Select your Google account**

5. **You should be logged in!**

---

## 🔍 HOW GOOGLE OAUTH WORKS

### Simple Explanation:

```
1. User clicks "Continue with Google"
   ↓
2. Google opens popup asking "Allow SpendSense to access your info?"
   ↓
3. User clicks "Allow"
   ↓
4. Google gives us a special token (JWT)
   ↓
5. Token contains: email, name, profile picture
   ↓
6. We send token to our server
   ↓
7. Server checks if user exists
   - If YES: Log them in
   - If NO: Create account automatically
   ↓
8. Server creates our own JWT token
   ↓
9. User is logged in!
```

### What's in the Google Token?

The token contains user information like:

```json
{
  "email": "john@gmail.com",
  "name": "John Doe",
  "picture": "https://...profile-pic.jpg",
  "email_verified": true
}
```

---

## 🛡️ SECURITY NOTES

### Development vs Production

**In Development (Learning):**
- We decode the token without verification
- This is OK for learning and testing
- NEVER do this in production!

**In Production (Real App):**
- You MUST verify the token with Google
- Install: `npm install google-auth-library`
- Use proper token verification:

```javascript
const {OAuth2Client} = require('google-auth-library');
const client = new OAuth2Client(GOOGLE_CLIENT_ID);

async function verify(token) {
  const ticket = await client.verifyIdToken({
      idToken: token,
      audience: GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();
  return payload;
}
```

---

## 🚨 COMMON ERRORS & SOLUTIONS

### Error: "Popup closed by user"
**Solution:** User canceled login. This is normal.

### Error: "Invalid client ID"
**Solution:** 
- Check that you copied the entire Client ID
- Make sure there are no extra spaces
- Verify it ends with `.apps.googleusercontent.com`

### Error: "redirect_uri_mismatch"
**Solution:**
- Go back to Google Console
- Check "Authorized redirect URIs"
- Make sure `http://localhost:3000` is added

### Error: "Access blocked: This app's request is invalid"
**Solution:**
- Complete the OAuth consent screen setup
- Add yourself as a test user
- Make sure all required fields are filled

### Google popup doesn't appear
**Solution:**
- Check browser console for errors
- Make sure pop-ups are not blocked
- Try a different browser

---

## 🎨 CUSTOMIZING THE GOOGLE BUTTON

### Change Button Text

In `login.html`, find:
```html
<button type="button" class="google-btn" onclick="loginWithGoogle()">
    Continue with Google
</button>
```

Change to:
```html
Sign in with Google
Login with Google
Google Login
```

### Change Button Style

Modify the `.google-btn` CSS class to customize colors, size, etc.

---

## 📊 HOW DATA IS STORED

### When User Logs in with Google:

1. **First Time:**
   - New user created in database
   - Email from Google account
   - Name from Google account
   - Random password (they won't use it)

2. **Next Times:**
   - User already exists
   - Just log them in
   - No password needed

### Database Structure:

```
users table:
id | name      | email           | password (encrypted)
1  | John Doe  | john@gmail.com  | [random hash]
```

---

## 🔄 FLOW DIAGRAM

```
┌─────────────┐
│   User      │
│  Clicks     │
│  "Google"   │
└──────┬──────┘
       │
       ▼
┌──────────────┐
│   Google     │
│   Popup      │
│  (Login)     │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│   Google     │
│   Returns    │
│   Token      │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  Frontend    │
│   Sends      │
│  to Server   │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│   Server     │
│  Decodes     │
│   Token      │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  Check if    │
│  User Exists │
└──────┬───────┘
       │
    ┌──┴──┐
    │ No  │ Yes
    ▼     ▼
  Create  Login
   User   User
    └──┬──┘
       │
       ▼
┌──────────────┐
│  Return JWT  │
│   Token to   │
│   Frontend   │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│   User is    │
│  Logged In!  │
└──────────────┘
```

---

## 💡 ADVANCED FEATURES

### Link Google Account to Existing Account

If user already has an account with email/password, they can also login with Google.

The system will recognize them by email and log them in.

### Get Profile Picture

Modify server.js to store profile picture:

```javascript
const { email, name, picture } = payload;

// Add picture column to database first
db.prepare(`
    INSERT INTO users (name, email, password, picture) 
    VALUES (?, ?, ?, ?)
`).run(name, email, randomPassword, picture);
```

---

## ✅ TESTING CHECKLIST

Before going live, test:

- [ ] Google login button appears
- [ ] Clicking button opens Google popup
- [ ] Selecting account works
- [ ] First-time user creates account
- [ ] Existing user logs in
- [ ] Redirects to dashboard
- [ ] User info displays correctly
- [ ] Logout works
- [ ] Can login again

---

## 📚 HELPFUL RESOURCES

- **Google Console:** https://console.cloud.google.com/
- **OAuth Documentation:** https://developers.google.com/identity/protocols/oauth2
- **Google Sign-In Guide:** https://developers.google.com/identity/gsi/web
- **Troubleshooting:** https://developers.google.com/identity/gsi/web/guides/troubleshooting

---

## 🤝 NEED HELP?

If you're stuck:

1. **Check the browser console** (F12) for error messages
2. **Check the server console** for backend errors
3. **Verify your Client ID** is correct
4. **Make sure OAuth consent screen** is configured
5. **Try with a different Google account**

---

## 🎉 CONGRATULATIONS!

Once setup is complete, you'll have:
- ✅ Email/Password login
- ✅ Google OAuth login  
- ✅ Secure JWT authentication
- ✅ User database
- ✅ Professional login experience

You're ready to build an amazing finance app! 🚀