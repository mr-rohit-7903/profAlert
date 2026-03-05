// background.js – ProfAlert v3.0
const SCOPES = "https://www.googleapis.com/auth/calendar.events";

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "saveToCalendar") {
    saveToCalendar(msg.exam).then(() => sendResponse({ success: true })).catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }
  if (msg.action === "connectGoogle") {
    connectGoogle().then(() => sendResponse({ success: true })).catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }
  if (msg.action === "disconnectGoogle") {
    chrome.storage.local.remove(["accessToken", "tokenExpiry"], () => sendResponse({ success: true }));
    return true;
  }
  if (msg.action === "getAuthStatus") {
    isTokenValid().then(valid => sendResponse({ connected: valid }));
    return true;
  }
  if (msg.action === "getRedirectUri") {
    sendResponse({ uri: chrome.identity.getRedirectURL() });
    return true;
  }
});

async function saveToCalendar(exam, retried = false) {
  const token = await getValidToken();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  let eventBody;
  if (exam.date) {
    const startStr = exam.time ? `${exam.date}T${exam.time}:00` : `${exam.date}T09:00:00`;
    const endDate = new Date(new Date(startStr).getTime() + (exam.duration || 90) * 60000);
    const endStr = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}T${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}:${String(endDate.getSeconds()).padStart(2, '0')}`;
    eventBody = {
      summary: exam.title,
      description: `Saved by ProfAlert\nCourse: ${exam.course}\n${exam.notes || ""}\n\n--- Original Email ---\n${exam.emailBody || ""}`.trim(),
      location: exam.location || "",
      start: { dateTime: startStr, timeZone: tz },
      end: { dateTime: endStr, timeZone: tz },
      colorId: "11",
      reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 1440 }, { method: "popup", minutes: 60 }] }
    };
  } else {
    const d = new Date(); d.setDate(d.getDate() + 7);
    const day = d.toISOString().split("T")[0];
    eventBody = {
      summary: exam.title + " (date unclear)",
      description: `Saved by ProfAlert\nCourse: ${exam.course}\n${exam.notes || ""}\n\n--- Original Email ---\n${exam.emailBody || ""}`.trim(),
      start: { date: day }, end: { date: day }, colorId: "11",
      reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 1440 }] }
    };
  }
  const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(eventBody)
  });
  if (!res.ok) {
    if (res.status === 401 && !retried) { await chrome.storage.local.remove(["accessToken", "tokenExpiry"]); return saveToCalendar(exam, true); }
    if (res.status === 401) throw new Error("Authentication failed. Please reconnect Google in the popup.");
    const err = await res.json().catch(() => ({}));
    throw new Error(`Calendar: ${err.error?.message || res.status}`);
  }
}

async function connectGoogle() {
  const { googleClientId } = await chrome.storage.local.get("googleClientId");
  if (!googleClientId) throw new Error("No Client ID saved.");
  const redirectUri = chrome.identity.getRedirectURL();
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", googleClientId);
  authUrl.searchParams.set("response_type", "token");
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("scope", SCOPES);
  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow({ url: authUrl.toString(), interactive: true }, async (responseUrl) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (!responseUrl) return reject(new Error("Sign-in was cancelled."));
      try {
        const params = new URLSearchParams(new URL(responseUrl).hash.slice(1));
        const token = params.get("access_token");
        if (!token) throw new Error("No access token received.");
        await chrome.storage.local.set({ accessToken: token, tokenExpiry: String(Date.now() + parseInt(params.get("expires_in") || "3600") * 1000) });
        resolve();
      } catch (e) { reject(e); }
    });
  });
}

async function getValidToken() {
  const r = await chrome.storage.local.get(["accessToken", "tokenExpiry"]);
  if (r.accessToken && r.tokenExpiry && Date.now() < Number(r.tokenExpiry) - 60000) return r.accessToken;
  await connectGoogle();
  const r2 = await chrome.storage.local.get("accessToken");
  if (!r2.accessToken) throw new Error("Could not get access token.");
  return r2.accessToken;
}

async function isTokenValid() {
  const r = await chrome.storage.local.get(["accessToken", "tokenExpiry"]);
  return !!(r.accessToken && r.tokenExpiry && Date.now() < Number(r.tokenExpiry) - 60000);
}
