// content.js – ProfAlert v2.6

let lastUrl = "";
let scanTimeout = null;

// Expose for manual trigger from popup
window.__profAlertScan = () => tryReadEmail(true);

// Also listen for manual scan event from popup
document.addEventListener("profAlertManualScan", () => tryReadEmail(true));

// Listen for trigger from popup via chrome messaging (works across worlds)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "triggerScan") {
    tryReadEmail(true);
    sendResponse({ triggered: true });
  }
});

// Watch URL changes
setInterval(() => {
  const url = location.href;
  if (url === lastUrl) return;
  lastUrl = url;
  if (/\/[A-Za-z0-9]{10,}$/.test(url)) {
    clearTimeout(scanTimeout);
    scanTimeout = setTimeout(() => tryReadEmail(false), 2000);
  }
}, 600);

// Also fire on initial load
setTimeout(() => {
  lastUrl = location.href;
  if (/\/[A-Za-z0-9]{10,}$/.test(location.href)) tryReadEmail(false);
}, 2000);

function tryReadEmail(forced) {
  const subjectEl =
    document.querySelector('h2.hP') ||
    document.querySelector('.ha h2') ||
    document.querySelector('[data-thread-perm-id] h2') ||
    document.querySelector('.nH h2');

  if (!subjectEl) {
    if (forced) showError("Could not find email subject. Make sure an email is fully open.");
    return;
  }

  const subject = subjectEl.innerText?.trim() || "";

  const bodyEl =
    document.querySelector('.a3s.aiL') ||
    document.querySelector('.a3s') ||
    document.querySelector('.ii.gt') ||
    document.querySelector('.gs .a3s');

  if (!bodyEl) {
    if (forced) showError("Could not find email body. Try scrolling down to load it.");
    return;
  }

  const body = bodyEl.innerText?.trim() || "";
  if (!body) {
    if (forced) showError("Email body appears empty.");
    return;
  }

  const keywords = ['test', 'quiz', 'exam', 'midterm', 'final', 'assessment', 'viva', 'assignment', 'schedule', 'class', 'date'];
  const lc = (subject + " " + body).toLowerCase();
  if (!forced && !keywords.some(k => lc.includes(k))) return;

  const senderEl = document.querySelector('.gD') || document.querySelector('[email]');
  const sender = senderEl?.getAttribute('email') || senderEl?.innerText || '';

  document.getElementById("pa-container")?.remove();
  showLoading();

  try {
    const exams = parseEmailForExams({ subject, body: body.slice(0, 4000), sender });
    document.getElementById("pa-container")?.remove();
    if (!exams.length) { if (forced) showError("No exam/test/deadline found in this email."); return; }
    showExamsBanner(exams);
  } catch (e) {
    document.getElementById("pa-container")?.remove();
    showError("Parse error: " + e.message);
  }
}

function showLoading() {
  const el = document.createElement("div");
  el.id = "pa-container";
  el.innerHTML = `<div class="pa-loading"><span class="pa-spinner"></span><span>ProfAlert scanning...</span></div>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add("pa-visible"));
}

function showError(msg) {
  document.getElementById("pa-container")?.remove();
  const el = document.createElement("div");
  el.id = "pa-container";
  el.innerHTML = `<div class="pa-error-pill">⚠ ${esc(msg)}</div>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add("pa-visible"));
  setTimeout(() => { el.classList.remove("pa-visible"); setTimeout(() => el.remove(), 300); }, 6000);
}

function showExamsBanner(exams) {
  const el = document.createElement("div");
  el.id = "pa-container";

  const cards = exams.map((exam, i) => `
    <div class="pa-card" id="pa-card-${i}">
      <div class="pa-card-info">
        <div class="pa-card-title">${esc(exam.title)}</div>
        <div class="pa-card-meta">
          ${exam.date ? `<span class="pa-pill">📅 ${formatDate(exam.date)}</span>` : ""}
          ${exam.time ? `<span class="pa-pill">⏰ ${exam.time}</span>` : ""}
          ${exam.location ? `<span class="pa-pill">📍 ${esc(exam.location)}</span>` : ""}
          ${exam.course ? `<span class="pa-pill">📚 ${esc(exam.course)}</span>` : ""}
        </div>
        ${exam.notes ? `<div class="pa-card-notes">${esc(exam.notes.slice(0, 80))}</div>` : ""}
      </div>
      <button class="pa-save-one" data-index="${i}">Save</button>
    </div>`).join("");

  el.innerHTML = `
    <div class="pa-banner">
      <div class="pa-header">
        <span class="pa-icon">🎓</span>
        <div>
          <div class="pa-title">${exams.length} exam${exams.length > 1 ? "s" : ""} found</div>
          <div class="pa-subtitle">Save to Google Calendar?</div>
        </div>
        <button class="pa-close-btn" id="pa-close-x">✕</button>
      </div>
      <div class="pa-cards">${cards}</div>
      <div class="pa-footer">
        ${exams.length > 1 ? `<button class="pa-save-all" id="pa-save-all">💾 Save All ${exams.length}</button>` : ""}
        <button class="pa-dismiss" id="pa-dismiss">Dismiss</button>
      </div>
      <div class="pa-result" id="pa-result"></div>
    </div>`;

  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add("pa-visible"));

  el.querySelectorAll(".pa-save-one").forEach(btn => {
    btn.addEventListener("click", async () => {
      const i = parseInt(btn.dataset.index);
      btn.textContent = "..."; btn.disabled = true;
      const res = await sendSave(exams[i]);
      if (res.success) {
        btn.textContent = "✓"; btn.style.background = "#238636";
        document.getElementById("pa-card-" + i).style.opacity = "0.5";
      } else {
        btn.textContent = "✗"; btn.style.background = "#da3633"; btn.disabled = false;
        showBannerResult("❌ " + (res.error || "Save failed"), false);
      }
    });
  });

  document.getElementById("pa-save-all")?.addEventListener("click", async () => {
    const btn = document.getElementById("pa-save-all");
    btn.disabled = true; btn.textContent = "Saving...";
    let saved = 0;
    for (let i = 0; i < exams.length; i++) {
      const res = await sendSave(exams[i]);
      if (res.success) {
        saved++;
        const b = el.querySelector(`[data-index="${i}"]`);
        if (b) { b.textContent = "✓"; b.style.background = "#238636"; b.disabled = true; }
        document.getElementById("pa-card-" + i).style.opacity = "0.5";
      }
    }
    btn.textContent = `✓ Saved ${saved}`;
    showBannerResult(`✅ ${saved}/${exams.length} events added to Calendar!`, true);
  });

  const dismiss = () => { el.classList.remove("pa-visible"); setTimeout(() => el.remove(), 300); };
  document.getElementById("pa-dismiss").addEventListener("click", dismiss);
  document.getElementById("pa-close-x").addEventListener("click", dismiss);
}

function showBannerResult(msg, ok) {
  const el = document.getElementById("pa-result");
  if (!el) return;
  el.textContent = msg; el.style.display = "block";
  el.style.background = ok ? "#0f2d1a" : "#2d0f0f";
  el.style.color = ok ? "#3fb950" : "#f85149";
}

function sendSave(exam) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ action: "saveToCalendar", exam }, res => {
      if (chrome.runtime.lastError) resolve({ success: false, error: chrome.runtime.lastError.message });
      else resolve(res || { success: false });
    });
  });
}

function formatDate(d) {
  if (!d) return "TBD";
  try { return new Date(d + "T12:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return d; }
}

function esc(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
