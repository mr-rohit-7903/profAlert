// popup.js – ProfAlert v3.0
const $ = id => document.getElementById(id);

// ── Tabs ──────────────────────────────────────────────────────────────────
document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
    tab.classList.add("active");
    $("panel-" + tab.dataset.tab).classList.add("active");
    if (tab.dataset.tab === "google") refreshGoogleTab();
    if (tab.dataset.tab === "scan") renderChecks();
  });
});

// ── Redirect URI ──────────────────────────────────────────────────────────
const redirectUri = chrome.identity.getRedirectURL();
$("uriText").textContent = redirectUri;

function copyUri() {
  navigator.clipboard.writeText(redirectUri).then(() => {
    $("copyStatus").textContent = "✓ Copied!";
    $("copyStatus").className = "status ok";
    $("copyUriBtn").textContent = "✓";
    setTimeout(() => {
      $("copyStatus").textContent = "Paste this in Google Cloud → Authorised redirect URIs";
      $("copyStatus").className = "status dim";
      $("copyUriBtn").textContent = "Copy";
    }, 2000);
  });
}
$("uriBox").addEventListener("click", copyUri);
$("copyUriBtn").addEventListener("click", e => { e.stopPropagation(); copyUri(); });

// ── SCAN BUTTON ────────────────────────────────────────────────────────────
$("scanBtn").addEventListener("click", async () => {
  $("scanBtn").disabled = true;
  $("scanBtn").textContent = "⏳ Scanning...";
  setScanStatus("", "");

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.url?.includes("mail.google.com")) {
      setScanStatus("❌ Open Gmail and an email first, then click here.", "err");
      return;
    }

    // Send message to content script (runs in its isolated world)
    await chrome.tabs.sendMessage(tab.id, { action: "triggerScan" });

    setScanStatus("✓ Scan triggered — check Gmail for the popup.", "ok");

  } catch (e) {
    setScanStatus("❌ " + e.message, "err");
  }

  $("scanBtn").disabled = false;
  $("scanBtn").textContent = "🔍 Scan Current Email";
});

function setScanStatus(msg, cls) {
  $("scanStatus").textContent = msg;
  $("scanStatus").className = "scan-status " + cls;
}

// ── Saved values ──────────────────────────────────────────────────────────
function refresh() {
  chrome.storage.local.get(["googleClientId"], r => {
    if (r.googleClientId) { $("clientInput").value = r.googleClientId; setStatus("clientStatus", "✓ Saved", "ok"); }
    $("connectBtn").disabled = !r.googleClientId;
  });
  refreshGoogleTab();
  renderChecks();
}

function refreshGoogleTab() {
  chrome.runtime.sendMessage({ action: "getAuthStatus" }, res => {
    if (res?.connected) {
      $("connectedBox").style.display = "block";
      $("setupBox").style.display = "none";
    } else {
      $("connectedBox").style.display = "none";
      $("setupBox").style.display = "block";
    }
  });
}

function renderChecks() {
  chrome.storage.local.get(["googleClientId"], r => {
    chrome.runtime.sendMessage({ action: "getAuthStatus" }, res => {
      const checks = [
        { label: "Google Client ID", done: !!r.googleClientId, hint: "Add in Google tab" },
        { label: "Google Sign-in", done: !!res?.connected, hint: "Sign in via Google tab" },
      ];
      $("readinessChecks").innerHTML = checks.map(c => `
        <div class="check-row ${c.done ? "done" : ""}">
          <span style="font-size:15px">${c.done ? "✅" : "⬜"}</span>
          <div>
            <div class="check-label ${c.done ? "done" : "pending"}">${c.label}</div>
            ${!c.done ? `<div class="check-sub">${c.hint}</div>` : ""}
          </div>
        </div>`).join("");
    });
  });
}

// ── Client ID ─────────────────────────────────────────────────────────────
$("saveClient").addEventListener("click", () => {
  const id = $("clientInput").value.trim();
  if (!id.includes(".apps.googleusercontent.com")) { setStatus("clientStatus", "❌ Should end in .apps.googleusercontent.com", "err"); return; }
  chrome.storage.local.set({ googleClientId: id }, refresh);
});

// ── Sign in ───────────────────────────────────────────────────────────────
$("connectBtn").addEventListener("click", () => {
  $("connectBtn").disabled = true;
  $("connectBtn").textContent = "Opening Google sign-in...";
  chrome.runtime.sendMessage({ action: "connectGoogle" }, res => {
    $("connectBtn").textContent = "Sign in with Google";
    if (res?.success) {
      refreshGoogleTab(); renderChecks();
    } else {
      $("connectBtn").disabled = false;
      const err = res?.error || "Unknown error";
      if (err.toLowerCase().includes("mismatch")) {
        setStatus("connectStatus", "❌ Redirect URI mismatch — copy the URI in the Google tab and add it in Google Cloud Console → Authorised redirect URIs → Save, then retry.", "err");
      } else {
        setStatus("connectStatus", "❌ " + err, "err");
      }
    }
  });
});

$("disconnectBtn").addEventListener("click", () => {
  chrome.runtime.sendMessage({ action: "disconnectGoogle" }, refresh);
});

function setStatus(id, msg, cls) {
  const el = $(id); if (!el) return;
  el.textContent = msg; el.className = "status " + cls;
}

refresh();
