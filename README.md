# Claude Code RTL Fix

<div dir="rtl">

תוסף VS Code שמוסיף תמיכת **RTL חזקה** (מימין-לשמאל) לתוסף [Claude Code](https://marketplace.visualstudio.com/items?itemName=anthropic.claude-code) — לעברית, ערבית, פרסית וארמית.

</div>

> **Version:** `1.2.0`
> **Engine:** VS Code ≥ `1.80.0`
> **Supports:** VS Code · Cursor · Windsurf · VS Code Insiders

---

<div dir="rtl">

## למה התוסף הזה?

תוסף Claude Code הרשמי לא מטפל היטב בטקסט עברי/ערבי — שורות מעורבות (עברית + לטינית/אנגלית/ספרות) נשברות, יישור הטקסט שגוי, ורשימות נראות הפוך. התוסף הזה מזריק `patch` קטן ל-`webview` של Claude Code שמתקן את כל הבעיות הללו בלי לפגוע בבלוקי קוד וטרמינל.

## איך זה עובד

הפעלת הפקודה `Claude RTL: הפעל RTL` מזריקה JavaScript ו-CSS לתוך קבצי ה-bundle של תוסף Claude Code. ה-patch כולל:

1. **CSS גלובלי** עם `direction: rtl` ו-`unicode-bidi: plaintext/isolate` להחלת RTL נכון.
2. **זיהוי טקסט RTL** לפי טווחי Unicode (`U+0590–U+05FF` עברית, `U+0600–U+06FF` ערבית, ועוד).
3. **כפייה רכה / חזקה** — שורות שמתחילות בלטינית אבל מכילות עברית מקבלות `unicode-bidi: isolate` שמכריח RTL מלא.
4. **טיפול ב-`input` / `textarea` / `contenteditable`** — שדות קלט מקבלים `dir="auto"` שמתעדכן בזמן הקלדה.
5. **תמיכה ב-Shadow DOM** — ה-CSS מוזרק רקורסיבית גם לתוך shadow roots.
6. **`MutationObserver`** — תוכן שנטען דינמית (הודעות חדשות בצ׳אט) מקבל RTL אוטומטית.
7. **גיבוי אוטומטי** של קבצי ה-bundle המקוריים — שחזור בלחיצה אחת.

בלוקי קוד, פלט טרמינל, ו-diffs נשארים **תמיד LTR** — לא נוגעים בקוד.

## התקנה

1. הורד את [`claude-rtl-fix-1.2.0.vsix`](https://github.com/dror-sa/claude-code-rtl-fix/releases/latest) מדף ה-Releases.
2. ב-VS Code: `Ctrl+Shift+P` → `Extensions: Install from VSIX...` → בחר את הקובץ.
3. הפעל: `Ctrl+Shift+P` → `Claude RTL: הפעל RTL`.
4. אשר טעינה מחדש של החלון כשמתבקש.

### דרך CLI

```bash
code --install-extension claude-rtl-fix-1.2.0.vsix
```

(להחלפה ב-`cursor` / `windsurf` בהתאם)

## שימוש

| פקודה | תיאור |
|---|---|
| `Claude RTL: הפעל RTL` | מזריק את ה-patch ל-Claude Code |
| `Claude RTL: כבה RTL` | משחזר את הקבצים המקוריים מגיבוי |
| `Claude RTL: בדוק סטטוס` | מציג סטטוס בכל ההתקנות (VS Code/Cursor/Windsurf) |

קיים גם כפתור `Claude RTL` ב-Status Bar בתחתית המסך — לחיצה עליו מפעילה/מציגה סטטוס.

## הפעלה אוטומטית

כדי שה-RTL יחול אוטומטית בכל פתיחה של VS Code, הוסף ל-`settings.json`:

```json
{
  "claudeRtl.autoEnable": true
}
```

זה שימושי במיוחד אחרי עדכוני Claude Code — התוסף מחליף את קבציו ויש להזריק שוב.

## מה מקבל RTL ומה לא

| ✅ RTL | 🔒 נשאר LTR |
|--------|------------|
| הודעות משתמש | בלוקי קוד (` ``` `) |
| תשובות Claude | פלט טרמינל |
| רשימות ופסקאות | תוצאות כלים (`tool_use`) |
| שדות קלט עם טקסט עברי | diffs ו-syntax highlighting |
| כותרות, ציטוטים | Monaco editor |
| **תצוגת PLAN** (Claude's Plan) | נתיבי קבצים בתוך התוכנית |

> **חדש ב-1.2.0:** תצוגת ה-PLAN (`Claude's Plan`) נפתחת ב-panel נפרד שה-HTML שלו
> בנוי בתוך `extension.js` של Claude Code (ולא ב-webview של הצ'אט). גרסה זו מזריקה
> RTL גם לתבנית הזו — כך שהתוכנית מיושרת לימין, ובלוקי קוד/נתיבים נשארים LTR.

## אחרי עדכון של Claude Code

כש-Claude Code מתעדכן, הוא מחליף את קבצי ה-bundle שלו, ויחד איתם נמחק גם ה-patch. פשוט הפעל שוב:

```
Ctrl+Shift+P → Claude RTL: הפעל RTL
```

או הפעל `autoEnable: true` כדי שזה יקרה לבד.

## הסרה

```
Ctrl+Shift+P → Claude RTL: כבה RTL
```

הקבצים המקוריים משוחזרים מהגיבוי האוטומטי (`*.rtl-backup`) שנשמר בהפעלה הראשונה.

## פיתוח מקומי

הקוד נמצא ב-`src/`:

```
src/
├── extension.js     # לוגיקת הזרקה, גילוי תוסף Claude Code, פקודות
└── package.json     # מניפסט התוסף
```

לבניית VSIX חדש:

```bash
npm install -g @vscode/vsce
cd src
vsce package
```

## דרישות

- VS Code / Cursor / Windsurf בגרסה `1.80.0` ומעלה.
- תוסף [Claude Code](https://marketplace.visualstudio.com/items?itemName=anthropic.claude-code) של Anthropic מותקן.

## רישיון

MIT

</div>
