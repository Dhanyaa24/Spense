# 🌿 SPENSE — Personal Finance Tracker

> *Your money, simplified.*

Spense is a full-stack personal finance web application built for students. It features expense tracking with mood-based logging, subscription management with intelligent billing reminders, budget pacing, behavioral spending analysis, and a unique hand-drawn "doodle" aesthetic rendered entirely in custom SVG.

---

## 📐 Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Browser)                       │
│                                                                 │
│   index.html ─── login.html ─── dashboard.html ─── expenses.html│
│                                  track.html ─── settings.html   │
│                                                                 │
│   • Vanilla HTML5 / CSS3 / JavaScript                           │
│   • Custom SVG doodle icon system (no emoji, no icon libraries) │
│   • Chart.js for data visualization                             │
│   • CSS variable-driven theming (light / dark)                  │
│   • JWT stored in localStorage for auth state                   │
│                                                                 │
│                     ▼  fetch() API calls  ▼                     │
├─────────────────────────────────────────────────────────────────┤
│                     BACKEND (Node.js / Express)                 │
│                                                                 │
│   server.js                                                     │
│   ├── Authentication (register, login, Google OAuth, JWT)       │
│   ├── Expense CRUD endpoints                                    │
│   ├── Budget management                                         │
│   ├── Subscription CRUD endpoints                               │
│   ├── Analytics engine (weekly, monthly, yearly, category)      │
│   ├── Streak calculation                                        │
│   └── Cron jobs (monthly & yearly email summaries)              │
│                                                                 │
│   emailService.js                                               │
│   └── Nodemailer: login alerts, password reset, summaries       │
│                                                                 │
│                     ▼  SQL queries  ▼                            │
├─────────────────────────────────────────────────────────────────┤
│                     DATABASE (SQLite)                            │
│                                                                 │
│   spense.db                                                     │
│   ├── users                                                     │
│   ├── expenses                                                  │
│   ├── budgets                                                   │
│   ├── subscriptions                                             │
│   └── password_reset_tokens                                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📁 Project Structure

```
spense-auth/
├── server.js                 # Express backend — all API routes & DB init
├── emailService.js           # Nodemailer config for automated emails  
├── package.json              # Dependencies & scripts
├── .env                      # Environment variables (JWT secret, email creds)
├── .gitignore                # Ignores node_modules, .env, spense.db
├── spense.db                 # SQLite database (auto-created on first run)
├── spense_logo.png           # Brand logo
│
├── docs/
│   └── README.md             # This file
│
└── public/                   # Static frontend files served by Express
    ├── index.html            # Landing page — hero section with SVG illustrations
    ├── login.html            # Login & registration with Google OAuth
    ├── home.html             # Authenticated home/welcome page
    ├── dashboard.html        # Main hub — expense log, charts, budget, analysis
    ├── expenses.html         # Focused daily expense view with illustration
    ├── track.html            # Subscription tracker with billing reminders
    ├── settings.html         # App preferences (dark mode toggle)
    ├── profile_settings.html # User profile management
    ├── reset-password.html   # Password reset flow
    ├── theme.js              # Centralized theme engine (light/dark mode)
    └── spense_logo.png       # Logo copy for public access
```

---

## 🎨 Design System

### Color Palette
Spense uses a warm, organic color palette inspired by café aesthetics:

| Variable               | Hex       | Usage                           |
|------------------------|-----------|---------------------------------|
| `--savory-sage`        | `#818263` | Primary — headings, buttons, accents |
| `--avocado-smoothie`   | `#C2C395` | Secondary green — progress bars, highlights |
| `--blush-beet`         | `#DDBAAE` | Warm accent — "want" indicators |
| `--peach-protein`      | `#EFD7CF` | Soft pink — background blobs    |
| `--oat-latte`          | `#DCD4C1` | Neutral — hover states          |
| `--honey-oatmilk`     | `#F6EAD4` | Light accent — cards, borders   |
| `--coconut-cream`      | `#FFFAF2` | Page background                 |

### Typography
- **DM Serif Display** (italic) — headings and display text
- **Outfit** (300–700) — body text, labels, and UI elements

### Custom SVG Doodle System
Instead of using standard emoji or icon libraries, Spense uses a centralized JavaScript `doodles` object containing raw SVG markup for every icon:

- **Mood faces:** `smile`, `sad`, `angry`, `relieved`, `thinking`, `sweat`
- **UI icons:** `calendar`, `money`, `trash`, `needStar`, `wantCircle`
- **Subscription icons:** `movie`, `music`, `gym`, `cloud`, `card`
- **Streak flame:** Custom multi-layered SVG with sparkle accents

### Theming
`theme.js` reads from `localStorage` and applies `[data-theme="dark"]` to the document root. All CSS variables automatically invert, and SVG strokes adapt through inherited properties.

---

## ✨ Features

### 1. 🔐 Authentication System
- **Email/password registration** with bcrypt hashing (salt rounds: 10)
- **JWT-based login** — tokens expire in 7 days, stored in `localStorage`
- **Google OAuth** — auto-creates accounts for new Google users
- **Password reset** — crypto-generated tokens sent via email, 1-hour expiry
- **Login email alerts** — Nodemailer sends notifications on each login

### 2. 💰 Expense Logging (dashboard.html / expenses.html)
- **Daily expense tracking** with a custom calendar date picker
- **Category system:** Food, Transport, Shopping, Entertainment, Bills, Education, Other
- **Need vs. Want classification** — visual star (need) and circle (want) doodle icons
- **Mood tracking** — associate emotions with purchases using hand-drawn SVG faces
- **Inline add/delete** — no modal popups, everything happens in-place
- **Day total display** with running calculations

### 3. 📊 Budget Management
- **Monthly budget setting** — inline editable, stored per-user in DB
- **Budget progress bar** — visual fill showing spend vs. budget
- **Monthly summary cards:**
  - Total Spent (includes normalized subscription costs)
  - Total Saved (budget minus spent)
  - Category breakdown with percentage bars

### 4. 📈 Analytics & Charts (Chart.js)
- **Chart types:** Bar, Line, Pie, Donut — user selectable
- **Time ranges:** Weekly, Monthly, Yearly
- **Category breakdown** — aggregated by spending category with subscription normalization
- **Empty state** — hollow green line graph placeholder when no data exists

### 5. 🔔 Subscription Tracker (track.html)
- **Recurring bill management** — add services with name, cost, cycle (monthly/yearly), start date
- **Summary cards:**
  - Active subscriptions count
  - Monthly cost total
  - Due soon count (within 7 days)
- **Intelligent billing prediction** — `calculateNextBilling()` determines the next payment date by advancing from the start date
- **Notification bell** — universal nav component across all pages
  - Red dot appears when subscriptions are due within 7 days
  - Dropdown lists upcoming payments with day countdown
  - Clicking a reminder navigates to `track.html`
- **Custom SVG icons** per service type (Netflix → movie, Spotify → music, Gym → gym, etc.)

### 6. 🔥 Streak & Gamification
- **Consecutive day streak** — backend counts continuous days with at least one expense logged
- **Doodle flame badge** — multi-layered SVG fire icon in the navbar
- **Streak tooltip** — hover to see streak details
- **Pulse animation** — subtle glow effect on the streak badge

### 7. 🧠 Behavioral Analysis (dashboard.html)
- **50/30/20 Rule check** — warns if "wants" exceed 35% of total spending
- **Budget pacing alerts** — warns when >90% of budget is consumed
- **Top category detection** — highlights if a single category dominates (>40%)
- **Balance praise** — positive reinforcement when spending is disciplined
- **Personalized recommendations** — empathetic, human-toned financial advice

### 8. 📧 Automated Email Reports
- **Login alerts** — email notification on every sign-in
- **Monthly summary** (1st of each month, 9:00 AM IST via cron)
  - Total spent with subscription normalization
  - Budget comparison with savings calculation
  - Top spending category
- **Yearly summary** (January 1st, 9:00 AM IST via cron)
  - Annual total spent
  - Average monthly spend
  - Best (lowest-spend) month
  - Top category for the year

### 9. 🌙 Dark Mode
- **Toggle in settings** — persisted in `localStorage` and synced to server
- **Full CSS variable inversion** — all backgrounds, text, and borders adapt
- **SVG-safe** — doodle icons remain visible in both themes

---

## 📊 Database Schema

### `users`
| Column       | Type     | Notes                            |
|--------------|----------|----------------------------------|
| id           | INTEGER  | Primary key, auto-increment      |
| name         | TEXT     | User's display name              |
| email        | TEXT     | Unique, used for login           |
| password     | TEXT     | bcrypt hash                      |
| theme        | TEXT     | `'doodle-light'` or `'dark'`     |
| created_at   | DATETIME | Account creation timestamp       |

### `expenses`
| Column       | Type     | Notes                            |
|--------------|----------|----------------------------------|
| id           | INTEGER  | Primary key, auto-increment      |
| user_id      | INTEGER  | FK → users.id                    |
| name         | TEXT     | Expense label                    |
| amount       | REAL     | Amount in ₹                      |
| category     | TEXT     | Food, Transport, Shopping, etc.  |
| type         | TEXT     | `'need'` or `'want'`             |
| mood         | TEXT     | Doodle key: smile, sad, etc.     |
| date         | TEXT     | `YYYY-MM-DD` format              |
| created_at   | DATETIME | Entry timestamp                  |

### `budgets`
| Column         | Type     | Notes                          |
|----------------|----------|--------------------------------|
| id             | INTEGER  | Primary key, auto-increment    |
| user_id        | INTEGER  | FK → users.id (unique)         |
| monthly_budget | REAL     | Budget amount in ₹             |
| updated_at     | DATETIME | Last update timestamp          |

### `subscriptions`
| Column       | Type     | Notes                            |
|--------------|----------|----------------------------------|
| id           | INTEGER  | Primary key, auto-increment      |
| user_id      | INTEGER  | FK → users.id                    |
| name         | TEXT     | Service name                     |
| cost         | REAL     | Billing amount in ₹              |
| cycle        | TEXT     | `'monthly'` or `'yearly'`        |
| start_date   | TEXT     | Billing start date               |
| created_at   | DATETIME | Entry timestamp                  |

### `password_reset_tokens`
| Column       | Type     | Notes                            |
|--------------|----------|----------------------------------|
| id           | INTEGER  | Primary key, auto-increment      |
| user_id      | INTEGER  | FK → users.id                    |
| token        | TEXT     | Unique crypto-generated string   |
| expires_at   | DATETIME | 1-hour expiry window             |
| used         | INTEGER  | 0 = unused, 1 = consumed         |

---

## 🔗 API Reference

### Authentication
| Method | Endpoint                | Auth | Description                    |
|--------|-------------------------|------|--------------------------------|
| POST   | `/api/register`         | No   | Create new account             |
| POST   | `/api/login`            | No   | Login, returns JWT             |
| POST   | `/api/google-login`     | No   | Google OAuth login             |
| POST   | `/api/forgot-password`  | No   | Send password reset email      |
| POST   | `/api/reset-password`   | No   | Reset password with token      |
| GET    | `/api/profile`          | Yes  | Get authenticated user profile |
| POST   | `/api/user/theme`       | Yes  | Update theme preference        |
| GET    | `/api/users`            | No   | List all users (admin/debug)   |

### Expenses
| Method | Endpoint              | Auth | Description                      |
|--------|-----------------------|------|----------------------------------|
| GET    | `/api/expenses`       | Yes  | Get expenses by date (`?date=`)  |
| POST   | `/api/expenses`       | Yes  | Add new expense                  |
| PUT    | `/api/expenses/:id`   | Yes  | Update expense                   |
| DELETE | `/api/expenses/:id`   | Yes  | Delete expense                   |

### Budget
| Method | Endpoint       | Auth | Description           |
|--------|----------------|------|-----------------------|
| GET    | `/api/budget`  | Yes  | Get user's budget     |
| PUT    | `/api/budget`  | Yes  | Update monthly budget |

### Subscriptions
| Method | Endpoint                  | Auth | Description              |
|--------|---------------------------|------|--------------------------|
| GET    | `/api/subscriptions`      | Yes  | Get all subscriptions    |
| POST   | `/api/subscriptions`      | Yes  | Add new subscription     |
| DELETE | `/api/subscriptions/:id`  | Yes  | Delete subscription      |

### Analytics
| Method | Endpoint                             | Auth | Description                  |
|--------|--------------------------------------|------|------------------------------|
| GET    | `/api/analytics/weekly`              | Yes  | Daily totals for current week|
| GET    | `/api/analytics/monthly-chart`       | Yes  | Daily totals for current month|
| GET    | `/api/analytics/yearly-chart`        | Yes  | Monthly totals for current year|
| GET    | `/api/analytics/category-breakdown`  | Yes  | Category spending breakdown  |
| GET    | `/api/analytics/monthly`             | Yes  | Monthly summary with needs/wants|
| GET    | `/api/analytics/streak`              | Yes  | Consecutive tracking days    |

---

## 🚀 Setup Instructions

### Prerequisites
- [Node.js](https://nodejs.org/) (LTS version)

### Installation

```bash
# 1. Navigate to the project
cd SpendSense/spense-auth

# 2. Install dependencies
npm install

# 3. Create .env file (optional — has fallback defaults)
#    JWT_SECRET=your-secret-key
#    EMAIL_USER=your-email@gmail.com
#    EMAIL_PASS=your-app-password

# 4. Start the server
node server.js
```

### You should see:
```
🚀 Spense Backend Server Running!
📍 Server: http://localhost:3000
📊 Database: spense.db
🌐 Dashboard: http://localhost:3000/dashboard.html
⏰ Email cron jobs scheduled
```

### Open in browser:
- Landing page: `http://localhost:3000/index.html`
- Login: `http://localhost:3000/login.html`

---

## 📦 Dependencies

| Package          | Version  | Purpose                                  |
|------------------|----------|------------------------------------------|
| express          | ^5.2.1   | Web server framework                     |
| cors             | ^2.8.6   | Cross-origin request handling            |
| bcryptjs         | ^3.0.3   | Password hashing                         |
| jsonwebtoken     | ^9.0.3   | JWT token generation & verification      |
| better-sqlite3   | ^12.8.0  | SQLite database driver                   |
| dotenv           | ^17.4.1  | Environment variable management          |
| nodemailer       | ^8.0.5   | Email dispatch (login alerts, summaries) |
| node-cron        | ^4.2.1   | Scheduled email jobs                     |

---

## 🔐 Security

- **Passwords** are never stored in plain text — bcrypt with 10 salt rounds
- **JWT tokens** expire after 7 days and are required for all protected endpoints
- **Password reset tokens** are crypto-generated, single-use, and expire in 1 hour
- **Email enumeration prevention** — forgot-password always returns the same message
- **User isolation** — all expense/budget/subscription queries are scoped to `user_id`

---

## 🛣️ Page Flow

```
index.html (Landing)
    │
    ▼
login.html (Login / Register / Google OAuth)
    │
    ▼
home.html (Welcome page)
    │
    ├──▶ dashboard.html (Main hub — log expenses, charts, budget, analysis)
    │
    ├──▶ expenses.html (Focused daily expense view with illustration)
    │
    ├──▶ track.html (Subscription tracker)
    │
    ├──▶ settings.html (Dark mode, preferences)
    │
    ├──▶ profile_settings.html (Profile management)
    │
    └──▶ reset-password.html (Password reset via email token)
```

---

*Built with 🌿 by Dhanya*