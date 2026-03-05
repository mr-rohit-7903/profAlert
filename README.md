# 🎓 ProfAlert

**ProfAlert** is a Chrome extension that scans your Gmail emails for upcoming exams, quizzes, tests, vivas, and assignment deadlines — then lets you save them directly to Google Calendar with one click.

**No API keys needed for scanning.** It uses a local regex/heuristic parser to extract dates, times, course codes, and event details — entirely offline and private.

---

## ✨ Features

- **Auto-scan** — Automatically detects exam-related emails when you open them in Gmail
- **Manual scan** — Click "Scan Current Email" from the popup for on-demand scanning
- **Local parsing** — Zero API calls for email analysis — works offline, no rate limits
- **Smart date extraction** — Handles formats like `15th March`, `03/15/2025`, `next Monday`, `tomorrow`
- **Course detection** — Extracts course codes like `CS21001`, `ME 302`, `MATH-200`
- **One-click calendar save** — Save individual exams or all at once to Google Calendar
- **Smart reminders** — Automatically adds reminders (24h and 1h before the exam)
- **Dark-themed UI** — Clean, GitHub-style dark banner overlaid on Gmail

---

## 📦 Installation

1. Download or clone this repository
2. Open **Chrome** and go to `chrome://extensions/`
3. Enable **Developer mode** (toggle in top-right)
4. Click **Load unpacked** and select the `profAlert` folder
5. The 🎓 ProfAlert icon appears in your toolbar

---

## ⚙️ Setup

You only need to set up Google Calendar access (for saving events). **No API key is needed for scanning emails.**

### Google Calendar OAuth

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a project (or select an existing one)
3. Enable the **Google Calendar API**
4. Go to **Credentials** → **+ Create Credentials** → **OAuth client ID**
5. ⚠️ Application type: **Web application** (NOT "Chrome Extension")
6. Open the ProfAlert popup → **Google** tab → copy the **Redirect URI** shown
7. In Google Cloud, under **Authorised redirect URIs**, click **Add URI** → paste the redirect URI → **Save**
8. Copy the generated **Client ID** → paste it in the ProfAlert popup → **Save**
9. Click **Sign in with Google** and authorize calendar access

---

## 🚀 Usage

### Automatic Scanning
1. Open **Gmail** in Chrome
2. Open any email — ProfAlert automatically scans emails containing keywords like *test*, *quiz*, *exam*, *midterm*, *viva*, *assignment*, etc.
3. If exams are found, a banner appears in the top-right corner with details
4. Click **Save** on individual exams or **Save All** to add them to your Google Calendar

### Manual Scanning
1. Open an email in Gmail
2. Click the 🎓 ProfAlert icon in the toolbar
3. Click **🔍 Scan Current Email**
4. Check Gmail for the results banner

---

## 📅 Supported Date Formats

The local parser handles these formats:

| Format | Example |
|---|---|
| DD/MM/YYYY | `15/03/2025` |
| YYYY-MM-DD | `2025-03-15` |
| Named month | `15th March 2025`, `March 15`, `15 Mar` |
| Relative | `tomorrow`, `day after tomorrow` |
| Day names | `next Monday`, `this Friday`, `on Wednesday` |
| Time | `10:00 AM`, `6:30 PM`, `1800 hrs` |

---

## 🔐 Permissions Explained

| Permission | Why |
|---|---|
| `storage` | Save your Client ID and tokens locally |
| `identity` | Google OAuth sign-in flow |
| `activeTab` | Access the current tab to communicate with Gmail |
| `tabs` | Check if the current tab is Gmail |
| `mail.google.com` | Read email content from the Gmail page |
| `googleapis.com` | Google Calendar API for saving events |

All data stays local — email content is parsed entirely in your browser and never sent anywhere.

---

## 🛠️ Tech Stack

- **Manifest V3** Chrome Extension
- **Regex/heuristic parser** for email analysis (zero external dependencies)
- **Google Calendar API** for event creation
- **Vanilla JS** — no frameworks, no build step
