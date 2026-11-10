(function () {
  // One session id per page load. crypto.randomUUID is unpredictable;
  // Math.random plus a timestamp is not. The id is only a key for the
  // demo's in-memory session state, never an authentication credential.
  var sessionId = "sess-" + (window.crypto && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2, 10) + Date.now().toString(36));
  var paused = false;
  var lang = "en";

  var messagesEl = document.getElementById("messages");
  var chatInput = document.getElementById("chatInput");
  var sendBtn = document.getElementById("sendBtn");
  var composer = document.getElementById("composer");
  var errorBox = document.getElementById("errorBox");
  var handoverBanner = document.getElementById("handoverBanner");
  var resumeRow = document.getElementById("resumeRow");
  var sessionStateEl = document.getElementById("sessionState");
  var sessionIdLabel = document.getElementById("sessionIdLabel");
  sessionIdLabel.textContent = sessionId;

  // Chrome strings only. Bot replies are never translated here.
  // Khmer strings are simple samples, pending native-speaker review.
  var STRINGS = {
    en: {
      banner: "DEMONSTRATION. Fictional shop (Sokha Mart, Phnom Penh). Synthetic data only. Not a real business.",
      shopSub: "Typically replies instantly",
      placeholder: "Type a message...",
      send: "Send",
      staffView: "Staff view",
      customerView: "Customer view",
      note: "Khmer sample text is a demonstration sample pending native-speaker review.",
      handover: "Handed over to a human. The bot is paused. A team member will reply here.",
      resume: "Resume bot (staff)",
      staffTitle: "Staff view",
      sessionState: "Session state",
      sessionLabel: "Session",
      resumeBot: "Resume bot",
      refresh: "Refresh",
      enquiriesTitle: "Enquiries",
      noEnquiries: "No enquiries yet.",
      colTime: "Time",
      colName: "Name",
      colPhone: "Phone",
      colProduct: "Product",
      colMessage: "Message",
      colLang: "Language",
      colStatus: "Status",
      active: "Active",
      pausedState: "Paused"
    },
    kh: {
      banner: "ការបង្ហាញ។ ហាងប្រឌិត (Sokha Mart, Phnom Penh)។ ទិន្នន័យសំយោគតែប៉ុណ្ណោះ។ មិនមែនជាអាជីវកម្មពិតទេ។",
      shopSub: "ឆ្លើយតបយ៉ាងឆាប់រហ័ស",
      placeholder: "សរសេរសារ...",
      send: "ផ្ញើ",
      staffView: "ទិដ្ឋភាពបុគ្គលិក",
      customerView: "ទិដ្ឋភាពអតិថិជន",
      note: "អត្ថបទខ្មែរគំរូ គឺជាគំរូបង្ហាញ ដែលកំពុងរង់ចាំការពិនិត្យពីអ្នកនិយាយដើម។",
      handover: "បានប្រគល់ទៅឱ្យមនុស្ស។ ប៊តត្រូវបានផ្អាក។ សមាជិកក្រុមនឹងឆ្លើយតបនៅទីនេះ។",
      resume: "បន្តប៊ត (បុគ្គលិក)",
      staffTitle: "ទិដ្ឋភាពបុគ្គលិក",
      sessionState: "ស្ថានភាពសម័យ",
      sessionLabel: "សម័យ",
      resumeBot: "បន្តប៊ត",
      refresh: "ផ្ទុកឡើងវិញ",
      enquiriesTitle: "សំណួរ",
      noEnquiries: "មិនទាន់មានសំណួរទេ។",
      colTime: "ពេលវេលា",
      colName: "ឈ្មោះ",
      colPhone: "ទូរស័ព្ទ",
      colProduct: "ផលិតផល",
      colMessage: "សារ",
      colLang: "ភាសា",
      colStatus: "ស្ថានភាព",
      active: "កំពុងដំណើរការ",
      pausedState: "បានផ្អាក"
    }
  };

  function applyLang() {
    var s = STRINGS[lang];
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      var key = el.getAttribute("data-i18n");
      if (s[key]) { el.textContent = s[key]; }
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach(function (el) {
      var key = el.getAttribute("data-i18n-placeholder");
      if (s[key]) { el.setAttribute("placeholder", s[key]); }
    });
    document.getElementById("langToggle").textContent = lang === "en" ? "KH" : "EN";
    document.documentElement.lang = lang === "kh" ? "km" : "en";
    updateSessionState();
  }

  function updateSessionState() {
    var s = STRINGS[lang];
    sessionStateEl.textContent = paused ? s.pausedState : s.active;
    sessionStateEl.classList.toggle("paused", paused);
  }

  function setPaused(value) {
    paused = value;
    handoverBanner.classList.toggle("show", paused);
    resumeRow.classList.toggle("show", paused);
    chatInput.disabled = paused;
    sendBtn.disabled = paused;
    document.querySelectorAll("#quickReplies button").forEach(function (b) {
      b.disabled = paused;
    });
    updateSessionState();
  }

  function langLabel(code) {
    if (code === "kh") { return "KH"; }
    if (code === "kh-roman") { return "KH-ROMAN"; }
    return "EN";
  }

  function sourceLabel(source) {
    if (source === "products") { return "Products"; }
    if (source === "faqs") { return "FAQs"; }
    if (source === "handover") { return "Handover"; }
    return "Fallback";
  }

  function confidenceText(confidence) {
    if (confidence === null || confidence === undefined || confidence === "") { return "n/a"; }
    var n = Number(confidence);
    if (isNaN(n)) { return String(confidence); }
    if (n <= 1) { return Math.round(n * 100) + "%"; }
    return Math.round(n) + "%";
  }

  function addUserMessage(text) {
    var wrap = document.createElement("div");
    wrap.className = "msg user";
    var bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.textContent = text;
    wrap.appendChild(bubble);
    messagesEl.appendChild(wrap);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function addBotMessage(data) {
    var wrap = document.createElement("div");
    wrap.className = "msg bot";
    var bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.textContent = data.reply || "";
    wrap.appendChild(bubble);
    var meta = document.createElement("div");
    meta.className = "meta";
    var badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = langLabel(data.language);
    var chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = sourceLabel(data.source);
    var conf = document.createElement("span");
    conf.className = "conf";
    conf.textContent = confidenceText(data.confidence);
    meta.appendChild(badge);
    meta.appendChild(chip);
    meta.appendChild(conf);
    wrap.appendChild(meta);
    messagesEl.appendChild(wrap);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function showError(show) {
    errorBox.classList.toggle("show", show);
  }

  // Transport layer. Server mode talks to the Node API below.
  // STATIC-BUILD: the static build replaces apiChat, apiResume,
  // apiEnquiries, and recordEnquiry with in-browser equivalents (the
  // bot runs locally; the public build keeps no enquiry store at all).
  // Responses are checked for res.ok first: a 400/429/500 from the
  // server used to render as an empty bot bubble.
  function checkOk(res) {
    if (!res.ok) {
      var err = new Error("request failed: " + res.status);
      err.status = res.status;
      throw err;
    }
    return res.json();
  }
  function apiChat(sessionId, text) {
    return fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: sessionId, text: text })
    }).then(checkOk);
  }
  function apiResume(sessionId) {
    return fetch("/api/handover/resume", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: sessionId })
    }).then(checkOk);
  }
  function apiEnquiries() {
    return fetch("/api/enquiries").then(checkOk);
  }
  // Server mode: the server already stored the enquiry, so this is a
  // no-op. The static build overrides it (and in the public build the
  // enquiry is not stored anywhere).
  function recordEnquiry(enquiry) { return; }

  function sendMessage(text) {
    var trimmed = (text || "").trim();
    if (!trimmed || paused) { return; }
    showError(false);
    addUserMessage(trimmed);
    chatInput.value = "";
    apiChat(sessionId, trimmed)
    .then(function (data) {
      addBotMessage(data);
      if (data && data.handover) {
        setPaused(true);
      }
      if (data && data.enquiry) {
        recordEnquiry(data.enquiry);
      }
    })
    .catch(function (err) {
      // Log the status only, never the message or the enquiry: user
      // text and contact details do not belong in the browser console.
      console.error("chat error", err && err.message ? err.message : err);
      showError(true);
    });
  }

  composer.addEventListener("submit", function (e) {
    e.preventDefault();
    sendMessage(chatInput.value);
  });

  document.getElementById("quickReplies").addEventListener("click", function (e) {
    var btn = e.target.closest("button[data-q]");
    if (!btn) { return; }
    sendMessage(btn.getAttribute("data-q"));
  });

  function resumeBot() {
    apiResume(sessionId)
    .then(function (data) {
      setPaused(false);
      showError(false);
      chatInput.focus();
    })
    .catch(function (err) {
      console.error("handover resume error", err && err.message ? err.message : err);
      showError(true);
    });
  }

  document.getElementById("resumeBtnChat").addEventListener("click", resumeBot);
  document.getElementById("resumeBtnStaff").addEventListener("click", resumeBot);

  // View toggle: customer chat <-> staff view.
  var customerView = document.getElementById("customerView");
  var staffView = document.getElementById("staffView");
  var viewToggle = document.getElementById("viewToggle");
  var staffOpen = false;

  function setStaffOpen(open) {
    staffOpen = open;
    customerView.hidden = open;
    staffView.hidden = !open;
    viewToggle.textContent = open ? STRINGS[lang].customerView : STRINGS[lang].staffView;
    if (open) { loadEnquiries(); }
  }

  viewToggle.addEventListener("click", function () {
    setStaffOpen(!staffOpen);
  });

  // Language toggle: EN <-> KH, chrome labels only.
  document.getElementById("langToggle").addEventListener("click", function () {
    lang = lang === "en" ? "kh" : "en";
    applyLang();
  });

  // Staff enquiries.
  var enquiriesTable = document.getElementById("enquiriesTable");
  var enquiriesBody = document.getElementById("enquiriesBody");
  var enquiriesEmpty = document.getElementById("enquiriesEmpty");
  var staffError = document.getElementById("staffError");

  function loadEnquiries() {
    staffError.hidden = true;
    apiEnquiries()
      .then(function (data) {
        var list = (data && data.enquiries) || [];
        enquiriesBody.innerHTML = "";
        if (!list.length) {
          enquiriesTable.hidden = true;
          enquiriesEmpty.hidden = false;
          return;
        }
        enquiriesEmpty.hidden = true;
        enquiriesTable.hidden = false;
        list.forEach(function (row) {
          var tr = document.createElement("tr");
          var cells = [
            row.timestamp || "",
            row.name || "",
            row.phone || "",
            row.product || "",
            row.message || "",
            row.language || "",
            row.status || ""
          ];
          cells.forEach(function (value) {
            var td = document.createElement("td");
            td.textContent = value;
            tr.appendChild(td);
          });
          enquiriesBody.appendChild(tr);
        });
      })
      .catch(function (err) {
        console.error("enquiries error", err && err.message ? err.message : err);
        staffError.hidden = false;
      });
  }

  document.getElementById("refreshBtn").addEventListener("click", loadEnquiries);

  applyLang();
})();
