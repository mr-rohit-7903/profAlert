# ProfAlert

ProfAlert is a Chrome extension that scans your Gmail emails for exams, quizzes, tests, and assignment deadlines — and lets you save them to Google Calendar in one click.

It parses emails locally using pattern matching (no API keys needed for scanning), so everything stays private.

---

## What it does

- Detects exam-related emails automatically when you open them in Gmail
- Extracts dates, times, course codes, and locations from the email text
- Shows a small popup on Gmail with the details it found
- Lets you save events to Google Calendar individually or all at once
- Adds automatic reminders (24 hours and 1 hour before the event)

---

## How to install

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Turn on **Developer mode** (toggle in the top-right corner)
4. Click **Load unpacked** and select the `profAlert` folder
5. You'll see the ProfAlert icon in your toolbar — you're done

---

## How to set up Google Calendar

You only need to do this once. It connects ProfAlert to your Google Calendar so it can save events.

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and sign in with your Google account
2. Create a new project (or use an existing one)
3. Search for **Google Calendar API** and click **Enable**
4. In the left menu, click **Credentials**
5. Click **+ Create Credentials**, then choose **OAuth client ID**
6. For Application type, choose **Web application** (not "Chrome Extension")
7. Click the ProfAlert icon in Chrome, go to the **Google** tab, and copy the **Redirect URI** shown there
8. Back in Google Cloud, scroll to **Authorised redirect URIs**, click **Add URI**, paste the URI you copied, and click **Save**
9. Copy the **Client ID** that Google gives you
10. Paste it in the ProfAlert popup under the Google tab, then click **Save**
11. Click **Sign in with Google** and allow calendar access

That's it. You're connected.

---

## How to use

### Automatic scanning
Just open an email in Gmail. If it mentions exams, tests, quizzes, or deadlines, ProfAlert will automatically show a banner in the top-right corner with the details. Click **Save** to add it to your calendar.

### Manual scanning
1. Open an email in Gmail
2. Click the ProfAlert icon in the toolbar
3. Click **Scan Current Email**
4. Check Gmail for the results banner

---

## Supported date formats

The parser can handle these formats:

| Format | Example |
|---|---|
| DD/MM/YYYY | `15/03/2025` |
| YYYY-MM-DD | `2025-03-15` |
| Named month | `15th March 2025`, `March 15`, `15 Mar` |
| Relative | `tomorrow`, `day after tomorrow` |
| Day names | `next Monday`, `this Friday`, `on Wednesday` |
| Time | `10:00 AM`, `6:30 PM`, `1800 hrs` |

---

## Permissions

| Permission | Why it's needed |
|---|---|
| `storage` | Saves your Client ID and login tokens locally |
| `identity` | Handles the Google sign-in process |
| `activeTab` | Lets ProfAlert read the current Gmail tab |
| `tabs` | Checks if you're on Gmail before scanning |
| `mail.google.com` | Reads email content from the Gmail page |
| `googleapis.com` | Saves events to Google Calendar |

All email parsing happens locally in your browser. Nothing is sent to any server.

---

## Tech

- Chrome Extension (Manifest V3)
- Local regex parser — no external APIs for scanning
- Google Calendar API for saving events
- Plain JavaScript, no frameworks
