// Claude Code RTL Fix - Extension v1.1.0
// אכיפת RTL חזקה: CSS גלובלי + dir="rtl" מפורש + זיהוי טקסט עברי/ערבי
// + תמיכה ב-Shadow DOM + טיפול ב-input/textarea

const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const os = require("os");

// ה-patch שמוזרק לתוך ה-webview של Claude Code
const RTL_PATCH = `
/* CLAUDE_RTL_FIX_START */
(function() {
  const PATCH_ID = 'claude-rtl-fix-v1-1';
  if (document.getElementById(PATCH_ID)) return;

  const marker = document.createElement('meta');
  marker.id = PATCH_ID;
  document.head.appendChild(marker);

  // ---------- שכבה 1: CSS גלובלי עם !important ----------
  // הרעיון: אם class מסוים נוסף לאלמנט - הוא ייאלץ להיות RTL
  // unicode-bidi: plaintext = מתנהג כמו dir=auto פנימית אבל text-align נשאר ימינה
  const STYLE_ID = 'claude-rtl-fix-style-v1-1';
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = \`
      /* כפייה רכה - שומרת על bidi נכון בתוך השורה */
      .claude-rtl-force,
      [data-rtl-fixed="1"] {
        direction: rtl !important;
        text-align: right !important;
        unicode-bidi: plaintext !important;
      }
      /* כפייה חזקה - מאלצת RTL מלא גם אם השורה מתחילה בלטינית */
      .claude-rtl-force-strong,
      [data-rtl-fixed="2"] {
        direction: rtl !important;
        text-align: right !important;
        unicode-bidi: isolate !important;
      }
      /* בלוקי קוד וטרמינל - תמיד LTR */
      pre, code, kbd, samp,
      pre *, code *,
      [class*="codeBlock"], [class*="codeBlock"] *,
      [class*="terminal"], [class*="terminal"] *,
      [class*="diff"], [class*="diff"] *,
      [class*="syntax"], [class*="syntax"] *,
      [data-rtl-fixed="ltr"] {
        direction: ltr !important;
        text-align: left !important;
        unicode-bidi: isolate !important;
      }
      /* רשימות - הזחה מימין */
      .claude-rtl-force ul,
      .claude-rtl-force ol,
      [data-rtl-fixed] ul,
      [data-rtl-fixed] ol {
        padding-right: 1.5em !important;
        padding-left: 0 !important;
      }
      /* שדות קלט עם טקסט עברי */
      input.claude-rtl-input,
      textarea.claude-rtl-input,
      [contenteditable].claude-rtl-input {
        direction: rtl !important;
        text-align: right !important;
        unicode-bidi: plaintext !important;
      }
    \`;
    (document.head || document.documentElement).appendChild(style);
  }

  // ---------- שכבה 2: זיהוי טקסט RTL ----------
  // טווחי Unicode של עברית, ערבית, פרסית, ארמית
  // 0590-05FF = Hebrew, 0600-06FF = Arabic, 0700-074F = Syriac
  // 0750-077F = Arabic Supplement, 08A0-08FF = Arabic Extended-A
  // FB1D-FDFF = Hebrew/Arabic Presentation, FE70-FEFF = Arabic Presentation-B
  const RTL_RE = /[\\u0590-\\u05FF\\u0600-\\u06FF\\u0700-\\u074F\\u0750-\\u077F\\u08A0-\\u08FF\\uFB1D-\\uFDFF\\uFE70-\\uFEFF]/;
  // תו "חזק" לטיני (אותיות בלבד) - לא ספרות, לא סוגריים, לא emoji
  const STRONG_LTR_RE = /[A-Za-z\\u00C0-\\u024F]/;

  function hasRTL(text) {
    return text && RTL_RE.test(text);
  }

  // האם השורה "באמת מעורבת" - מתחילה בלטינית/ספרה/סימן אבל מכילה עברית
  function startsWithNonRTL(text) {
    if (!text) return false;
    // נמצא את התו ה"חזק" הראשון
    for (const ch of text) {
      if (RTL_RE.test(ch)) return false;
      if (STRONG_LTR_RE.test(ch)) return true;
    }
    return false;
  }

  // ---------- שכבה 3: סלקטורים ----------
  const TEXT_SELECTORS = [
    '[class*="message_"]',
    '[class*="Message_"]',
    '[class*="content_"]',
    '[class*="Content_"]',
    '[class*="userMessage"]',
    '[class*="UserMessage"]',
    '[class*="assistantMessage"]',
    '[class*="AssistantMessage"]',
    '[class*="messageInput"]',
    '[class*="MessageInput"]',
    '[class*="markdown"]',
    '[class*="Markdown"]',
    '[class*="prose"]',
    '[class*="text_"]',
    '[class*="bubble"]',
    '[class*="chat"]',
    '[class*="thread"]',
    '[class*="paragraph"]',
    'p', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'blockquote', 'figcaption', 'summary',
    'span[class]', 'div[class*="text"]', 'div[role="paragraph"]'
  ].join(', ');

  const SKIP_SELECTOR = [
    'pre', 'code', 'kbd', 'samp',
    '[class*="codeBlock"]',
    '[class*="terminal"]',
    '[class*="diff"]',
    '[class*="syntax"]',
    '[class*="monaco"]',
    '[class*="editor"]',
    '[data-rtl-skip="1"]'
  ].join(', ');

  function shouldSkip(el) {
    return el.closest && el.closest(SKIP_SELECTOR);
  }

  // ---------- שכבה 4: החלת RTL ----------
  function applyRTL(el) {
    if (!el || el.nodeType !== 1) return;
    if (el.getAttribute('data-rtl-fixed')) return;
    if (shouldSkip(el)) {
      // סמן בלוקי קוד כדי שה-CSS יחיל עליהם LTR מפורש
      el.setAttribute('data-rtl-fixed', 'ltr');
      return;
    }

    // טקסט גולמי של האלמנט (ללא הילדים) - לזיהוי מהיר
    const text = el.textContent || '';
    if (!hasRTL(text)) return; // אין עברית/ערבית - לא נוגעים

    // החלטה: כפייה רכה או חזקה
    // - אם השורה מתחילה בעברית/ערבית - "רכה" מספיקה
    // - אם השורה מתחילה בלטינית/סימן/emoji אבל מכילה עברית - חזקה
    const useStrong = startsWithNonRTL(text);

    el.setAttribute('dir', 'rtl');
    el.setAttribute('data-rtl-fixed', useStrong ? '2' : '1');
    el.classList.add(useStrong ? 'claude-rtl-force-strong' : 'claude-rtl-force');
  }

  // ---------- שכבה 5: input/textarea/contenteditable ----------
  function applyRTLToInput(el) {
    if (!el || el.getAttribute('data-rtl-input-fixed')) return;
    const value = el.value || el.textContent || '';
    const placeholder = el.getAttribute('placeholder') || '';
    if (!hasRTL(value) && !hasRTL(placeholder)) {
      // נשמע על שינויי input - אולי המשתמש יקליד עברית
      el.addEventListener('input', () => {
        if (hasRTL(el.value || el.textContent || '')) {
          el.classList.add('claude-rtl-input');
          el.setAttribute('dir', 'auto');
        } else {
          el.classList.remove('claude-rtl-input');
        }
      }, { passive: true });
      el.setAttribute('data-rtl-input-fixed', '1');
      return;
    }
    el.classList.add('claude-rtl-input');
    el.setAttribute('dir', 'auto');
    el.setAttribute('data-rtl-input-fixed', '1');
  }

  // ---------- שכבה 6: סריקה ----------
  function scanAndFix(root) {
    if (!root || !root.querySelectorAll) return;

    // אלמנטי טקסט
    try {
      root.querySelectorAll(TEXT_SELECTORS).forEach(applyRTL);
      if (root.matches && root.matches(TEXT_SELECTORS)) applyRTL(root);
    } catch (_) {}

    // input/textarea/contenteditable
    try {
      root.querySelectorAll('input[type="text"], input:not([type]), input[type="search"], textarea, [contenteditable="true"], [contenteditable=""]')
        .forEach(applyRTLToInput);
    } catch (_) {}

    // Shadow DOM - חיפוש רקורסיבי
    try {
      root.querySelectorAll('*').forEach((el) => {
        if (el.shadowRoot) {
          // הזרקת CSS גם לתוך ה-Shadow DOM
          if (!el.shadowRoot.getElementById(STYLE_ID + '-shadow')) {
            const shadowStyle = document.getElementById(STYLE_ID).cloneNode(true);
            shadowStyle.id = STYLE_ID + '-shadow';
            el.shadowRoot.appendChild(shadowStyle);
          }
          scanAndFix(el.shadowRoot);
        }
      });
    } catch (_) {}
  }

  // סריקה ראשונית
  scanAndFix(document.body);

  // ---------- שכבה 7: MutationObserver ----------
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      // אלמנטים חדשים
      m.addedNodes.forEach((node) => {
        if (node.nodeType === 1) scanAndFix(node);
      });
      // שינויי טקסט בתוך אלמנט קיים - יכול לדרוש רענון של ה-dir
      if (m.type === 'characterData' && m.target.parentElement) {
        const parent = m.target.parentElement;
        // נקה את הסימון ונסרוק שוב
        parent.removeAttribute('data-rtl-fixed');
        parent.classList.remove('claude-rtl-force', 'claude-rtl-force-strong');
        applyRTL(parent);
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });

  // ---------- שכבה 8: סריקה חוזרת תקופתית (גיבוי) ----------
  // למקרה ש-MutationObserver החמיץ משהו (Shadow DOM שנפתח מאוחר וכו')
  let scanCount = 0;
  const periodicScan = setInterval(() => {
    scanAndFix(document.body);
    scanCount++;
    if (scanCount >= 20) clearInterval(periodicScan); // 20 פעמים = 20 שניות
  }, 1000);

  console.log('[Claude RTL Fix v1.1] פעיל ✓');
})();
/* CLAUDE_RTL_FIX_END */
`;

const PATCH_MARKER = "/* CLAUDE_RTL_FIX_START */";
const PATCH_END_MARKER = "/* CLAUDE_RTL_FIX_END */";
const BACKUP_SUFFIX = ".rtl-backup";

// ---------------------------------------------------------------------------
// תיקון תצוגת ה-PLAN (Claude's Plan preview)
// ---------------------------------------------------------------------------
// כש-Claude מציג תוכנית, היא נפתחת ב-webview panel נפרד ("claudePlanPreview")
// שה-HTML שלו בנוי בתוך extension.js (קובץ ה-host) של Claude Code — לא ב-webview
// של הצ'אט. לכן הזרקת ה-RTL לצ'אט לא משפיעה עליו. כאן אנחנו מתקנים את התבנית הזו:
// מזריקים <style> + dir="rtl" ל-container שמקבל את ה-markdown של התוכנית.
//
// ה-anchor `<div id="content"></div>` ייחודי וקיים בתבנית תצוגת התוכנית.
const HOST_ANCHOR = '<div id="content"></div>';
const HOST_MARKER = "claude-rtl-plan-style"; // מזהה idempotency
// CSS בלי backticks ובלי ${ } — מוזרק לתוך template literal של Claude Code.
const PLAN_RTL_CSS = [
  "/* CLAUDE_RTL_FIX */",
  "#content{direction:rtl;text-align:right;}",
  "#content h1,#content h2,#content h3,#content h4,#content h5,#content h6,",
  "#content p,#content li,#content blockquote,#content dd,#content dt,",
  "#content summary,#content figcaption{text-align:right;}",
  "#content ul,#content ol{padding-right:32px;padding-left:0;}",
  "#content th,#content td{text-align:right;}",
  "/* קוד/טרמינל/נתיבים נשארים תמיד LTR */",
  "#content pre,#content code,#content kbd,#content samp{direction:ltr;unicode-bidi:isolate;}",
  "#content pre,#content pre code{text-align:left;}",
].join("\n");
const HOST_PATCH_HTML =
  '<style id="' + HOST_MARKER + '">\n' + PLAN_RTL_CSS + '\n</style>' +
  '<div id="content" dir="rtl"></div>';

// מאתר את כל ההתקנות של Claude Code
function findClaudeCodeExtensions() {
  const extDirs = [];
  const homedir = os.homedir();
  const candidates = [
    path.join(homedir, ".vscode", "extensions"),
    path.join(homedir, ".vscode-insiders", "extensions"),
    path.join(homedir, ".cursor", "extensions"),
    path.join(homedir, ".windsurf", "extensions"),
  ];

  const vscodeExtPath = vscode.extensions.all
    .filter((e) => e.id.toLowerCase().includes("anthropic.claude-code"))
    .map((e) => e.extensionPath);

  vscodeExtPath.forEach((p) => {
    if (!extDirs.includes(p)) extDirs.push(p);
  });

  candidates.forEach((dir) => {
    if (!fs.existsSync(dir)) return;
    try {
      fs.readdirSync(dir)
        .filter((name) => name.startsWith("anthropic.claude-code"))
        .forEach((name) => {
          const full = path.join(dir, name);
          if (!extDirs.includes(full)) extDirs.push(full);
        });
    } catch (_) {}
  });

  return extDirs;
}

// מאתר את קובץ ה-webview bundle
function findWebviewBundle(extPath) {
  const candidates = [
    path.join(extPath, "webview", "index.js"),
    path.join(extPath, "dist", "index.js"),
    path.join(extPath, "out", "index.js"),
    path.join(extPath, "dist", "webview.js"),
    path.join(extPath, "media", "index.js"),
    path.join(extPath, "webview", "webview.js"),
  ];

  try {
    fs.readdirSync(extPath).forEach((sub) => {
      const subDir = path.join(extPath, sub);
      try {
        if (fs.statSync(subDir).isDirectory()) {
          fs.readdirSync(subDir)
            .filter((f) => f.endsWith(".js") && !f.endsWith(".map"))
            .forEach((f) => {
              const full = path.join(subDir, f);
              if (!candidates.includes(full)) candidates.push(full);
            });
        }
      } catch (_) {}
    });
  } catch (_) {}

  return candidates.find((p) => fs.existsSync(p)) || null;
}

// מאתר את קובץ ה-host (extension.js) שמכיל את תבנית תצוגת ה-PLAN
function findHostBundle(extPath) {
  const candidate = path.join(extPath, "extension.js");
  return fs.existsSync(candidate) ? candidate : null;
}

function isHostPatched(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8").includes(HOST_MARKER);
  } catch (_) {
    return false;
  }
}

// מחיל RTL על תבנית תצוגת ה-PLAN שב-host bundle
function applyHostPatch(filePath) {
  try {
    let content = fs.readFileSync(filePath, "utf8");
    if (content.includes(HOST_MARKER)) {
      return { ok: true, msg: "כבר מותקן", changed: false };
    }
    if (!content.includes(HOST_ANCHOR)) {
      // גרסת Claude Code לא נתמכת / שונתה התבנית — מדלגים בשקט על ה-PLAN
      return { ok: true, msg: "anchor של תצוגת PLAN לא נמצא — דילגתי", changed: false };
    }
    const backupPath = filePath + BACKUP_SUFFIX;
    if (!fs.existsSync(backupPath)) {
      fs.copyFileSync(filePath, backupPath);
    }
    content = content.replace(HOST_ANCHOR, HOST_PATCH_HTML);
    fs.writeFileSync(filePath, content, "utf8");
    return { ok: true, msg: "תצוגת PLAN קיבלה RTL", changed: true };
  } catch (err) {
    return { ok: false, msg: err.message, changed: false };
  }
}

function removeHostPatch(filePath) {
  try {
    const backupPath = filePath + BACKUP_SUFFIX;
    if (fs.existsSync(backupPath)) {
      fs.copyFileSync(backupPath, filePath);
      return { ok: true, msg: "שוחזר מגיבוי" };
    }
    let content = fs.readFileSync(filePath, "utf8");
    if (content.includes(HOST_PATCH_HTML)) {
      content = content.replace(HOST_PATCH_HTML, HOST_ANCHOR);
      fs.writeFileSync(filePath, content, "utf8");
    }
    return { ok: true, msg: "הוסר" };
  } catch (err) {
    return { ok: false, msg: err.message };
  }
}

function isPatched(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    return content.includes(PATCH_MARKER);
  } catch (_) {
    return false;
  }
}

// בדיקה אם הגרסה הישנה (1.0.0) מותקנת - אם כן צריך לעדכן
function isOldPatchVersion(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    return content.includes(PATCH_MARKER) && !content.includes("claude-rtl-fix-v1-1");
  } catch (_) {
    return false;
  }
}

function applyPatch(filePath) {
  try {
    let content = fs.readFileSync(filePath, "utf8");

    // אם יש patch ישן - נסיר אותו קודם
    if (content.includes(PATCH_MARKER)) {
      const startIdx = content.indexOf(PATCH_MARKER);
      const endIdx = content.indexOf(PATCH_END_MARKER);
      if (endIdx > startIdx) {
        content = content.substring(0, startIdx).trimEnd() +
                  content.substring(endIdx + PATCH_END_MARKER.length);
      } else {
        content = content.substring(0, startIdx).trimEnd();
      }
    }

    // גיבוי (אם עדיין אין)
    const backupPath = filePath + BACKUP_SUFFIX;
    if (!fs.existsSync(backupPath)) {
      fs.copyFileSync(filePath, backupPath);
    }

    fs.writeFileSync(filePath, content + "\n" + RTL_PATCH, "utf8");
    return { ok: true, msg: "הוחל בהצלחה" };
  } catch (err) {
    return { ok: false, msg: err.message };
  }
}

function removePatch(filePath) {
  try {
    const backupPath = filePath + BACKUP_SUFFIX;
    if (fs.existsSync(backupPath)) {
      fs.copyFileSync(backupPath, filePath);
      return { ok: true, msg: "שוחזר מגיבוי" };
    }

    let content = fs.readFileSync(filePath, "utf8");
    const startIdx = content.indexOf(PATCH_MARKER);
    if (startIdx === -1) return { ok: true, msg: "לא נמצא patch" };

    const endIdx = content.indexOf(PATCH_END_MARKER);
    if (endIdx > startIdx) {
      content = content.substring(0, startIdx).trimEnd() +
                content.substring(endIdx + PATCH_END_MARKER.length);
    } else {
      content = content.substring(0, startIdx).trimEnd();
    }
    fs.writeFileSync(filePath, content, "utf8");
    return { ok: true, msg: "הוסר בהצלחה" };
  } catch (err) {
    return { ok: false, msg: err.message };
  }
}

// --- פקודות ---

async function cmdEnable() {
  const extensions = findClaudeCodeExtensions();
  if (extensions.length === 0) {
    vscode.window.showErrorMessage(
      "❌ לא נמצא תוסף Claude Code. וודא שהוא מותקן."
    );
    return;
  }

  let applied = 0;
  let errors = [];

  for (const extPath of extensions) {
    const bundle = findWebviewBundle(extPath);
    if (!bundle) {
      errors.push(`לא נמצא bundle ב: ${extPath}`);
      continue;
    }
    const result = applyPatch(bundle);
    if (result.ok) applied++;
    else errors.push(`${path.basename(extPath)}: ${result.msg}`);

    // תיקון תצוגת ה-PLAN (host bundle נפרד)
    const host = findHostBundle(extPath);
    if (host) {
      const hostResult = applyHostPatch(host);
      if (!hostResult.ok) errors.push(`PLAN: ${hostResult.msg}`);
    }
  }

  if (errors.length > 0) {
    vscode.window.showWarningMessage(`⚠️ שגיאות: ${errors.join(", ")}`);
  }

  if (applied > 0) {
    const reload = await vscode.window.showInformationMessage(
      `✅ RTL v1.2 הופעל על ${applied} התקנה/ות (צ'אט + תצוגת PLAN). נדרשת טעינה מחדש.`,
      "טען מחדש"
    );
    if (reload === "טען מחדש") {
      vscode.commands.executeCommand("workbench.action.reloadWindow");
    }
  } else {
    vscode.window.showInformationMessage("ℹ️ אין שינויים חדשים להחיל.");
  }

  updateStatusBar();
}

async function cmdDisable() {
  const extensions = findClaudeCodeExtensions();
  if (extensions.length === 0) {
    vscode.window.showErrorMessage("❌ לא נמצא תוסף Claude Code.");
    return;
  }

  let removed = 0;
  for (const extPath of extensions) {
    const bundle = findWebviewBundle(extPath);
    if (bundle) {
      const result = removePatch(bundle);
      if (result.ok) removed++;
    }
    const host = findHostBundle(extPath);
    if (host) removeHostPatch(host);
  }

  const reload = await vscode.window.showInformationMessage(
    `✅ RTL כובה מ-${removed} התקנה/ות. נדרשת טעינה מחדש.`,
    "טען מחדש"
  );
  if (reload === "טען מחדש") {
    vscode.commands.executeCommand("workbench.action.reloadWindow");
  }

  updateStatusBar();
}

function cmdStatus() {
  const extensions = findClaudeCodeExtensions();
  if (extensions.length === 0) {
    vscode.window.showInformationMessage("❌ Claude Code לא נמצא.");
    return;
  }

  const lines = extensions.map((extPath) => {
    const bundle = findWebviewBundle(extPath);
    if (!bundle) return `• ${path.basename(extPath)}: bundle לא נמצא`;
    const patched = isPatched(bundle);
    const old = isOldPatchVersion(bundle);
    const host = findHostBundle(extPath);
    const planPatched = host && isHostPatched(host);
    const planStr = planPatched ? "PLAN ✅" : "PLAN ⭕";
    if (old) return `• ${path.basename(extPath)}: ⚠️ גרסה ישנה - מומלץ להפעיל שוב לעדכון`;
    return `• ${path.basename(extPath)}: ${patched ? "✅ צ'אט RTL פעיל" : "⭕ צ'אט RTL לא פעיל"} · ${planStr}`;
  });

  vscode.window.showInformationMessage(
    `סטטוס Claude RTL:\n${lines.join("\n")}`,
    { modal: true }
  );
}

// --- Status Bar ---
let statusBarItem;

function updateStatusBar() {
  const extensions = findClaudeCodeExtensions();
  if (extensions.length === 0) {
    statusBarItem.text = "$(circle-slash) Claude RTL: N/A";
    statusBarItem.tooltip = "Claude Code לא נמצא";
    statusBarItem.backgroundColor = undefined;
    return;
  }

  const anyPatched = extensions.some((extPath) => {
    const bundle = findWebviewBundle(extPath);
    return bundle && isPatched(bundle);
  });

  if (anyPatched) {
    statusBarItem.text = "$(check) Claude RTL: פעיל";
    statusBarItem.tooltip = "RTL פעיל — לחץ לניהול";
    statusBarItem.backgroundColor = new vscode.ThemeColor(
      "statusBarItem.warningBackground"
    );
  } else {
    statusBarItem.text = "$(circle-large-outline) Claude RTL: כבוי";
    statusBarItem.tooltip = "RTL כבוי — לחץ להפעלה";
    statusBarItem.backgroundColor = undefined;
  }
}

// --- Activate ---
function activate(context) {
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.command = "claudeRtl.enable";
  statusBarItem.show();
  updateStatusBar();
  context.subscriptions.push(statusBarItem);

  context.subscriptions.push(
    vscode.commands.registerCommand("claudeRtl.enable", cmdEnable),
    vscode.commands.registerCommand("claudeRtl.disable", cmdDisable),
    vscode.commands.registerCommand("claudeRtl.status", cmdStatus)
  );

  const config = vscode.workspace.getConfiguration("claudeRtl");
  if (config.get("autoEnable")) {
    cmdEnable();
  }
}

function deactivate() {}

module.exports = { activate, deactivate };
