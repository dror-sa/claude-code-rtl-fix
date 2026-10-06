# rtl-bidi: מוד RTL ל-Claude Code

<div dir="rtl">

אב-טיפוס של **mod** (plugin של function hooks) ל-Claude Code, שמסדר טקסט בעברית, ערבית ופרסית בתמליל: בטרמינל, באפליקציית הדסקטופ וב-VS Code. בניגוד לתוסף ה-VSIX, הוא לא משנה קבצים של Claude Code ולכן לא נשבר בעדכונים.

## איך זה עובד

המוד מתחבר ל-`ui.render` של `AssistantMessage` ו-`UserMessage` ומשכתב את הטקסט לפני שהוא מצויר (ההודעה השמורה לא משתנה). בלוקי קוד (```) לא נוגעים בהם, ו-inline code נשאר LTR.

יש שני מצבים:

| מצב | מה הוא עושה | מתאים ל |
|---|---|---|
| `isolate` | מוסיף תווי בקרה של Unicode: `RLM` + `RLI…PDI` סביב פסקה בעברית, `LRI…PDI` סביב קטעים באנגלית וסביב קוד | דסקטופ, VS Code, וטרמינלים עם תמיכת bidi (GNOME Terminal ו-VTE, Konsole, mlterm, Terminal.app) |
| `visual` | מסדר כל שורה מחדש לסדר חזותי (גרסה מצומצמת של אלגוריתם ה-bidi) ושובר שורות לפי רוחב החלון | טרמינלים בלי bidi: Windows Terminal, הטרמינל של VS Code, iTerm2, kitty, WezTerm, Ghostty |

ברירת המחדל `auto` בוחרת `isolate` מחוץ לטרמינל, ובטרמינל לפי משתני הסביבה (`VTE_VERSION`, `KONSOLE_VERSION`, `MLTERM`, `TERM_PROGRAM=Apple_Terminal`), אחרת `visual`. אפשר לקבוע מצב ידנית ב-`/config`.

## התקנה

</div>

```
/plugin install rtl-bidi --marketplace dror-sa/claude-code-rtl-fix
```

<div dir="rtl">

לפיתוח מקומי: `claude --plugin-dir ./mod/rtl-bidi`.

## בדיקות

</div>

```bash
claude plugin validate mod/rtl-bidi
claude plugin test mod/rtl-bidi
```

<div dir="rtl">

## מגבלות ידועות

- שדה הקלט עצמו (מה שמקלידים לפני שליחה) לא חשוף ל-hooks, אז הוא לא מתוקן. ההודעה כן מתוקנת אחרי השליחה.
- מצב `visual` מחליף את ה-wrapping של הטרמינל בשבירת שורות משלו, ולכן קישורים ארוכים או טבלאות רחבות עלולים להישבר אחרת מהרגיל. יישור לימין לא נעשה.
- זיהוי הטרמינל לפי משתני סביבה הוא היוריסטיקה; אם הסדר יוצא הפוך, החלף מצב ב-`/config`.

</div>
