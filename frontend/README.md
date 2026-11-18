# Frontend

This directory contains all client-facing assets and templates for AlumniConnect.

## Structure
- `assets/`: Static files served directly to the browser
  - `css/`: Custom responsive CSS built on top of Bootstrap 5
  - `images/`: Icons, avatars, and static vector graphics
  - `js/`: Client-side scripts (form confirmations, interactive UI)
- `views/`: EJS templates for the user interface
  - `admin/`: Administrator portal views (dashboard, pending applicants, alumni directory & audit history)
  - `partials/`: Reusable navigation header, footer, and profile form components
  - `index.ejs`: Public home page & statistics
  - `login.ejs`: Member & administrator authentication
  - `register.ejs`: Alumni application submission
  - `directory.ejs`: Filterable, searchable, and paginated alumni directory
  - `profile.ejs`: Individual verified alumni profile view
  - `edit-profile.ejs`: Profile management and photo upload
  - `setup-admin.ejs`: First-time administrator creation
