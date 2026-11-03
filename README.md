# AlumniConnect (Node.js & Vercel Edition)

A responsive alumni tracking and networking platform built with **Node.js, Express, EJS, MySQL, Bootstrap 5, and JavaScript**, optimized for **1-click serverless deployment on Vercel**.

---

## ⚡ Quick Start

### 1. Install & Run Locally
```bash
npm install
npm start
```
The server runs on [http://localhost:3000](http://localhost:3000).

### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=alumni_tracking
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_SSL=false

APP_KEY=245f354545e328ade35994678103241d8f8cccd994b719cf2bdad89b040e8e78
SETUP_KEY=c961636875b541f02aad7cc48845ea52e9245e5965769d495b0dde26b6020a2c
PORT=3000
```

### 3. Deploy to Vercel
See [VERCEL_DEPLOYMENT_GUIDE.md](VERCEL_DEPLOYMENT_GUIDE.md) for full instructions on setting up a free cloud database (TiDB Cloud / Aiven) and deploying to Vercel in 2 minutes.

---

## 📂 Project Structure

```text
alumni-tracking-system/
├── api/
│   └── index.js              # Vercel serverless function entrypoint
├── assets/
│   ├── css/style.css         # Bootstrap custom styling
│   ├── images/avatar.svg     # Default avatar SVG
│   └── js/script.js          # Client-side form confirmation
├── config/
│   └── db.js                 # MySQL connection pool & auto table initialization
├── lib/
│   └── helpers.js            # URL, validation, and profile helpers
├── views/
│   ├── admin/
│   │   ├── alumni.ejs        # Admin alumni list & decision logs
│   │   ├── dashboard.ejs     # Admin stats & review queue
│   │   └── pending.ejs       # Admin review & approve/reject forms
│   ├── partials/
│   │   ├── footer.ejs        # Shared footer
│   │   ├── header.ejs        # Shared navbar & alerts
│   │   └── profile-form.ejs  # Reusable profile fields
│   ├── dashboard.ejs         # Alumni user dashboard
│   ├── directory.ejs         # Search, filter & paginated directory
│   ├── edit-profile.ejs      # Profile update & photo upload
│   ├── index.ejs             # Landing page
│   ├── login.ejs             # Throttled login form
│   ├── profile.ejs           # Public/Admin alumni profile view
│   ├── register.ejs          # Alumni application form
│   └── setup-admin.ejs       # One-time initial admin creation
├── app.js                    # Express application and route handlers
├── server.js                 # Local development server
├── vercel.json               # Vercel serverless configuration
├── database.sql              # MySQL database schema definition
├── package.json              # Node.js dependencies and scripts
└── VERCEL_DEPLOYMENT_GUIDE.md # Step-by-step deployment guide
```

---

## 🔒 Features & Security

- **Vercel Serverless Architecture**: Uses stateless `cookie-session` with cryptographic signing, eliminating serverless state loss across lambdas.
- **Self-Healing Database**: Tables (`users`, `approval_logs`, `login_attempts`) are automatically created on the first run; `profile_photo` is automatically upgraded to `MEDIUMTEXT` to support base64 uploads without external S3 buckets.
- **Password Security**: Passwords hashed with `bcryptjs`.
- **CSRF Token Validation**: Protects all state-changing forms.
- **Login Rate Limiting**: Maximum 5 failed attempts per email/IP pair within a rolling 15-minute window.
- **Dual URL Support**: Supports both clean URLs (`/login`, `/register`, `/directory`) and legacy URLs (`/login.php`, `/register.php`, `/directory.php`).
