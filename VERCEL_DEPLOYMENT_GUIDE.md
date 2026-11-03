# Vercel Deployment & Setup Guide for AlumniConnect

This project has been completely converted from PHP into **Node.js (Express + EJS)**, configured for fast, zero-configuration deployment to **Vercel** serverless functions.

---

## 🚀 Key Improvements & Architecture

1. **Vercel Serverless Ready (`api/index.js` & `vercel.json`)**:
   - Runs serverless on Vercel's global edge network.
   - Stateless cookie-based sessions (`cookie-session`), eliminating the need for Redis in serverless lambdas.
2. **Self-Healing Database (`config/db.js`)**:
   - Automatically initializes all tables (`users`, `approval_logs`, `login_attempts`) on the first connection if they do not exist.
   - Automatically upgrades `profile_photo` to `MEDIUMTEXT` so alumni can upload photos directly without needing external AWS S3 storage buckets.
3. **Dual URL Support**:
   - Supports clean URLs (`/login`, `/register`, `/directory`, `/dashboard`, `/setup-admin`, `/admin/dashboard`, etc.)
   - Maintains full backward compatibility with legacy `.php` URLs (`/login.php`, `/register.php`, etc.).
4. **Security & Protection**:
   - Password hashing with `bcryptjs`.
   - CSRF token validation on all state-changing forms.
   - Brute-force login rate limiting (throttled after 5 failed attempts within 15 minutes).
   - Strict role-based access control (Admin, Approved Alumni, Pending/Rejected).

---

## 🛠️ Step 1: Run Locally

1. **Install dependencies** (if not already installed):
   ```bash
   npm install
   ```

2. **Configure your local `.env`**:
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

3. **Start the server**:
   ```bash
   npm start
   ```
   Or for auto-reloading during development:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## ☁️ Step 2: Set up a Free Cloud MySQL Database (for Vercel)

Since Vercel serverless functions run in the cloud, they need an online MySQL database. You can get a free MySQL database in less than 2 minutes using either:

### Option A: TiDB Cloud (Recommended - Free Serverless MySQL Tier)
1. Go to [TiDB Cloud](https://tidbcloud.com/) and sign up for a free account.
2. Click **Create Cluster** and select **Serverless (Free)**.
3. Once created, click **Connect**, choose **Node.js**, and copy the connection string.
   It looks like:
   `mysql://<username>:<password>@gateway01.<region>.prod.aws.tidbcloud.com:4000/<dbname>?ssl={"rejectUnauthorized":true}`
4. That's your `DATABASE_URL`!

### Option B: Aiven / Railway / Clever Cloud
- Create a free MySQL database on [Aiven](https://aiven.io/) or [Railway](https://railway.app/).
- Copy either the connection URI or the Host, Port, User, Password, and Database Name.

---

## 🚢 Step 3: Deploy to Vercel

### Method A: Deploy via GitHub (Easiest)
1. Initialize a git repository and push your code to GitHub:
   ```bash
   git init
   git add .
   git commit -m "Convert PHP to Node.js for Vercel deployment"
   git branch -M main
   git remote add origin https://github.com/your-username/your-repo.git
   git push -u origin main
   ```
2. Go to [Vercel](https://vercel.com/) and click **Add New...** -> **Project**.
3. Import your GitHub repository.
4. In the **Environment Variables** section, add:
   - `DATABASE_URL`: Your cloud MySQL connection string (e.g., from TiDB Cloud or Aiven)
     *(OR add `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_SSL=true`)*
   - `APP_KEY`: A long random secret string (at least 32 characters)
   - `SETUP_KEY`: A long random secret string (at least 32 characters)
5. Click **Deploy**!

### Method B: Deploy via Vercel CLI
1. Install Vercel CLI:
   ```bash
   npm install -g vercel
   ```
2. In the project folder, run:
   ```bash
   vercel
   ```
3. Follow the prompts. Add environment variables when asked or set them in the Vercel Project Dashboard:
   ```bash
   vercel env add DATABASE_URL
   vercel env add APP_KEY
   vercel env add SETUP_KEY
   ```
4. Deploy to production:
   ```bash
   vercel --prod
   ```

---

## 👤 Step 4: First-Time Administrator Setup

1. Once deployed, open your live Vercel URL (e.g. `https://your-alumni-app.vercel.app/setup-admin`).
2. Enter:
   - The one-time **Setup Key** you configured in `SETUP_KEY`
   - Your administrator name, email, and password (12+ characters).
3. Click **Create administrator**.
4. You can now sign in at `/login` to review pending alumni applications, view directory members, and manage the system!
*(Once created, `/setup-admin` is permanently disabled automatically).*

