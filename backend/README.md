# Backend

This directory contains the core server, business logic, REST APIs, and database layer for AlumniConnect.

## Structure
- `src/`
  - `config/`: Centralized environment config (`env.js`) and database driver (`db.js`)
  - `controllers/`: Request handlers for Auth, Alumni, Admin, and Statistics
  - `middleware/`: Authentication guards, CSRF protection, and file upload validation
  - `routes/`: Modular REST API endpoints (`/api/...`) and web page route handlers
- `data/`: Local embedded fallback storage (`db.json`)
- `lib/`: Validation and formatting utility helpers
- `database.sql`: MySQL schema definition
- `app.js`: Express application configuration
- `server.js`: HTTP server entrypoint
- `package.json`: Backend dependencies and scripts
