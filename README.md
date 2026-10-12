# KNUST Student Management System

A website the KNUST Registry uses to keep student records, track academic results, and help students call for help in an emergency.

It runs in a web browser. All data is stored in [Supabase](https://supabase.com), an online database service.

## What it does

- **Student records:** add, edit and delete students (name, student ID, date of birth, contact details, programme, level).
- **Academic results:** record course marks. The system works out each student's CWA, semester averages, grades and degree class automatically.
- **Campus Guardian:**
  - **SOS button:** a student sends their location to campus security in one tap.
  - **SafeWalk:** a check-in timer for walking alone. If the student doesn't check in on time, security is alerted, even if the student's phone is off.
  - **Security dispatch screen:** shows alerts live, with the student's name, phone and a map link.
- **Logins with roles:** each person sees and does only what their role allows.

## Who can do what

| Role | Can do |
|---|---|
| **Admin** | Everything Registry can do, plus manage user roles and handle emergency alerts |
| **Registry** | Manage all student records and results |
| **Security** | See and respond to emergency alerts (no access to grades) |
| **Student** | See their own record and results, update personal details, use SOS and SafeWalk |

These rules are enforced by the database, not just hidden on screen.

## Getting started

### 1. Set up the database (once)
In the Supabase dashboard, open **SQL Editor**. For each file below, paste the **whole** file and click **Run**, in this order:

1. `docs/role-access-setup.sql`
2. `docs/results-and-safety-setup.sql`

### 2. Create logins
In Supabase: **Authentication → Users → Add user**. New logins start as Students.

Make your first admin in the SQL Editor (change the email):

```sql
update public.profiles set username = 'admin', role = 'admin'
where id = (select id from auth.users where email = 'admin@knust.edu.gh');
```

After that, sign in as the admin and use the **User accounts** panel to set everyone else's role. For a student, also enter their student ID so they can see their own record.

### 3. Run the website
You need [Node.js](https://nodejs.org) installed.

```bash
npm install
npm start
```

Then open http://localhost:8000.

Alternatively, open `index.html` with the Live Server extension in VS Code.

> Location sharing for SOS and SafeWalk only works on `localhost` or an `https://` address.

## Project layout

| Path | What it is |
|---|---|
| `index.html` | The page: sign-in, forms, tables and panels |
| `public/js/script.js` | Sign-in, roles, student register, user accounts |
| `public/js/results.js` | Academic results and CWA |
| `public/js/safety.js` | SOS, SafeWalk and the security dispatch screen |
| `public/css/style.css` | Styling |
| `server.js` | Small web server used by `npm start` |
| `docs/*.sql` | Database setup scripts |

## More detail

See **[docs/SYSTEM_GUIDE.md](docs/SYSTEM_GUIDE.md)** for:
- step-by-step instructions for each feature
- how CWA is calculated
- how data is protected
- known limits
- plain answers to likely presentation questions
