# KNUST Student Management System — Plain-English Guide

This guide explains what the system does, who can use it, how to set it up, and how each feature works. It describes the system **as it is actually built**, so it is safe to quote in the presentation.

---

## 1. What the system is

It is a website the KNUST Registry uses to keep student records. It has grown into four parts:

1. **Student records** — names, student ID, date of birth, contact details, programme and level.
2. **Academic results** — course marks for each student, with their CWA and degree class worked out automatically.
3. **Campus Guardian** — an emergency button and a "SafeWalk" timer that let students call for help.
4. **User accounts** — logins, each with a role that decides what the person can see and do.

The website runs in a normal web browser. All the data is stored in **Supabase**, an online database service.

---

## 2. Who uses it (the four roles)

Every login has exactly one role.

| Role | Who it is for | What they can do |
|---|---|---|
| **Admin** | System manager | Everything Registry can do, plus: change people's roles, link student logins to student records, and see and handle emergency alerts. |
| **Registry** | Registry staff | See, add, edit and delete every student record. Add and delete academic results. |
| **Security** | Campus security desk | See emergency alerts as they come in, with the student's name, phone and location. Cannot see grades or the full student register. |
| **Student** | A student | See only their own record and results. Update their own personal details. Send an emergency alert or start a SafeWalk. |

**Important:** these rules are enforced by the database itself, not just hidden on screen. Even someone with technical skills who goes around the website cannot see data their role is not allowed to see.

---

## 3. Setting it up (one time)

You need access to the Supabase project dashboard.

### Step 1 — Run the two setup scripts
In Supabase, open **SQL Editor**. For each file below: clear the editor, paste the **whole** file, and click **Run**. Do them in this order:

1. `docs/role-access-setup.sql` — sets up logins, roles and the protection rules for student records.
2. `docs/results-and-safety-setup.sql` — adds academic results and Campus Guardian.

Both are safe to run again if you are unsure whether they ran.

> Do **not** run the SQL inside `NEW_FEATURES_SPEC_AND_DEFENSE_GUIDE.md`. It would let anyone on the internet read students' emergency locations, and it conflicts with the working login setup.

### Step 2 — Create the logins
In Supabase go to **Authentication → Users → Add user**, and enter an email and password. Every new login starts as a **Student**.

### Step 3 — Make the first Admin
The first admin has to be set in the SQL Editor (change the email):

```sql
update public.profiles set username = 'admin', role = 'admin'
where id = (select id from auth.users where email = 'admin@knust.edu.gh');
```

After that, the admin can do everything else from inside the website.

### Step 4 — Give everyone else their role
Sign in as the admin. At the bottom of the page is **User accounts**. For each person:

- Choose their role (Admin, Registry, Security or Student).
- For a **student**, type the student ID of their record in **Linked student ID**. This is what lets the student see their own record. Without it they see nothing.
- Click **Save**.

### Step 5 — Open the website
- On a computer with Node.js: run `npm install` once, then `npm start`, and open `http://localhost:8000`.
- Or open `index.html` with the Live Server extension in VS Code.

---

## 4. Using the system

### 4.1 Student records (Admin and Registry)

- **Add a student:** fill in the form at the top and click **Add to register**.
  - Student ID must be exactly 8 digits.
  - Age is worked out from the date of birth automatically.
  - The Level list only allows levels that exist for the chosen programme (for example, up to 600 for Medicine, 400 for most BSc programmes).
- **Edit:** click **Edit** on a row. The form fills in; change what you need and click **Update student**.
- **Delete:** click **Delete** on a row and confirm.

### 4.2 Student records (Students)

- A student sees only their own row.
- Clicking **Edit** lets them correct their name, gender, date of birth, email and phone.
- They **cannot** change their student ID, programme or level. Those must be changed by the Registry. This stops a student from, for example, promoting themselves to a higher level.

### 4.3 Academic results and CWA

Click **Results** on any student's row.

**What you see:**
- **CWA** (Cumulative Weighted Average) for all courses so far.
- **Classification** — the degree class that CWA falls into.
- Results grouped by academic year and semester, with each semester's average.
- A letter grade beside each mark.

**How CWA is worked out:** each mark is multiplied by the course's credit hours, these are added up, and the total is divided by the total credit hours.

> Example: 75 in a 3-credit course, 62 in a 2-credit course, 48 in a 1-credit course
> = (75×3 + 62×2 + 48×1) ÷ (3+2+1) = 397 ÷ 6 = **66.17** → Second Class (Upper Division)

| CWA | Class | | Mark | Grade |
|---|---|---|---|---|
| 70 and above | First Class | | 70–100 | A |
| 60 – 69.99 | Second Class (Upper Division) | | 60–69 | B |
| 50 – 59.99 | Second Class (Lower Division) | | 50–59 | C |
| 40 – 49.99 | Pass | | 40–49 | D |
| Below 40 | Fail | | 0–39 | F |

**Adding a result (Admin and Registry only):** fill in the **Add a result** form under the results — course code, title, credit hours, academic year (like `2025/2026`), semester and mark — and click **Add result**. If the course code has been used before, the title and credits fill in by themselves. A student can only have one result per course per semester; to correct a mark, delete it and add it again.

Students can view their own results but cannot change them.

### 4.4 Campus Guardian — for students

Students see a **Campus Guardian** box at the top of their page.

**SOS button (emergency alert)**
1. Press **SOS · Send emergency alert** and confirm.
2. The website asks the phone for its location and sends an alert to campus security straight away.
3. If the phone will not share its location, the alert is **still sent**, and the student is told to call security and say where they are.

**SafeWalk (check-in timer)** — for walking alone, for example late at night from the library to a hostel in Ayeduase.
1. Choose how many minutes the walk should take, and optionally where you are going. Press **Start SafeWalk**.
2. A countdown appears. While it runs, the student's location is updated about once a minute, but only while the page is open.
3. On arrival, press **I'm safe · Check in**. The walk ends and nothing is sent to security.
4. If the time runs out without a check-in, the walk shows as **OVERDUE** on the security screen.

**Why SafeWalk still works if the phone is lost or switched off:** the deadline is saved in the database the moment the walk starts. The security screen compares that deadline with the clock. It does not need the student's phone to send anything when time runs out.

**Privacy:** a student's location is only collected when they press SOS or during an active SafeWalk. It is never tracked in the background.

### 4.5 Campus Guardian — for Security (and Admin)

Security and admin accounts see a **Security dispatch** box at the top of the page. It updates by itself when a new alert arrives, and the browser tab title shows how many alerts need attention.

Each alert card shows:
- What happened: **PANIC ALERT**, **SAFEWALK OVERDUE**, or a SafeWalk still in progress.
- The student's name, student ID and phone number.
- When it was raised, and the note or destination.
- **Open location on map** — opens the location in OpenStreetMap, with how accurate it is and when it was last updated. If there is no location, the card says to call the student.

Colours:
- **Red** — needs attention now (a new panic alert or an overdue SafeWalk). These are always at the top.
- **Amber** — someone has acknowledged it and is dealing with it.
- **Grey** — a SafeWalk that is still on time.

Buttons:
- **Acknowledge** — "we've seen this and are responding."
- **Resolve** — "this is over." You can type a short note about what happened.

---

## 5. How data is kept safe

- **Each role only sees what it should.** The database checks every request against the person's role, so hiding something on screen is never the only protection.
- **People who are not signed in see nothing.** This was checked by trying to read the data without logging in, and the database refused.
- **Students cannot change key details** (student ID, programme, level, or which login is linked to which record).
- **Emergency alerts can only be created through fixed, checked actions** ("raise an alert", "start a walk", "check in", "acknowledge", "resolve"). Nobody can write to the alerts table directly or fake an alert for another student.
- **Admins cannot change their own role**, so they cannot lock themselves out by accident.
- **Location is only collected during an emergency or a SafeWalk**, in line with the data-minimisation idea in Ghana's Data Protection Act, 2012 (Act 843).

---

## 6. Known limits (be honest about these)

- **Location needs a secure page.** Browsers only share location on `https://` sites or on `localhost`. For the demo, run it on `localhost` or an `https` address.
- **SafeWalk location updates stop if the page is closed.** The overdue warning still works, but security will see the last location sent, not a live one.
- **No sound alarm.** The security screen highlights the alert, updates the tab title, and vibrates on devices that support it. There is no siren.
- **Not built yet** (mentioned in the spec, but not in the system): the duress PIN, battery level, the GIS hostel map and live student tracking, and creating logins directly from the website. Present these as future work.
- **New logins are created in the Supabase dashboard**, not in the website.

---

## 7. Simple answers for the presentation

**"How do you know when a student is in danger?"**
> Two ways. A student can press the SOS button, which sends their location to the security desk immediately. Or, when walking alone, they start a SafeWalk timer. If they don't check in before it runs out, security is alerted automatically. That works even if their phone has been taken or switched off, because the deadline is stored on the server, not the phone.

**"Isn't tracking students a privacy problem?"**
> We don't track students. Location is only collected when a student presses SOS or chooses to start a SafeWalk. Security staff can see alerts, but not grades. Students can only see their own records.

**"How is CWA calculated?"**
> Each mark is weighted by the course's credit hours: multiply each mark by its credits, add them up, and divide by the total credits. The system then places the CWA in the KNUST class bands, for example 70 and above is First Class.

**"Can a student change their own grades or level?"**
> No. Students can only edit personal details like their phone number. Grades, programme, level and student ID can only be changed by Registry or Admin, and the database itself blocks any attempt.

**"What stops someone from just reading the database directly?"**
> The database checks who is asking on every single request. Someone who isn't logged in gets "permission denied", and a logged-in student only ever gets their own data back.

---

## 8. Where things are in the code

| File | What it contains |
|---|---|
| `index.html` | The page layout: sign-in, forms, tables and panels. |
| `public/js/script.js` | Sign-in, roles, the student register and the user accounts panel. |
| `public/js/results.js` | Academic results, CWA and degree class. |
| `public/js/safety.js` | SOS button, SafeWalk and the security dispatch screen. |
| `public/css/style.css` | How everything looks. |
| `server.js` | A small web server that serves the page (`npm start`). |
| `docs/role-access-setup.sql` | Database setup for logins, roles and record protection. |
| `docs/results-and-safety-setup.sql` | Database setup for results and Campus Guardian. |
