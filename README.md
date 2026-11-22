# MASROOF PWA

هذه الحزمة هي نسخة MASROOF المستقلة للعمل على الهاتف والكمبيوتر عبر GitHub Pages.

## النشر

ارفع **محتويات هذا المجلد** إلى جذر مستودع `emadmadi80.github.io`، وليس المجلد نفسه. فعّل GitHub Pages من فرع `main` ومجلد `/ (root)`.

بعد النشر افتح:

`https://emadmadi80.github.io/`

يمكن تثبيت التطبيق من Chrome على Android أو الكمبيوتر عبر خيار Install App / إضافة إلى الشاشة الرئيسية. التخزين الأساسي محلي في المتصفح، وتعمل النسخة عبر HTTPS.

## ملاحظات

- لا تفتح `index.html` بصيغة `file://`؛ استخدم HTTPS أو localhost.
- احتفظ بنسخة JSON احتياطية قبل استيراد بيانات قديمة.
- إعدادات Google Drive وApps Script تُدخل من داخل التطبيق عند الحاجة.

## Apps Script

يوجد كود المزامنة الخلفية في `apps-script/Code.gs` إذا رغبت في نشره كمشروع Google Apps Script منفصل. لا ترفع أسرارًا أو مفاتيح خاصة إلى GitHub.

## Luxury design layer
- `assets/luxury.*.css` is loaded after the original stylesheet (see index.html). Delete that `<link>` line to roll back.
- Fonts: IBM Plex Sans Arabic, Amiri, Playfair Display (Google Fonts, cached offline by sw.js).
- Service worker cache bumped to `masroof-pwa-v4-luxury` so installed apps pick up the new look.

## Recurring expenses (retroactive entries + due monitoring)
- `assets/recurring-engine.v1.js` computes due dates (weekly / monthly / quarterly / half-yearly / yearly / custom days, month-end safe)
  and keeps a confirmation ledger (`masroof-recurring-ledger-v1`) so a (recurring id + due date) pair can only be recorded once.
- "Record now" lists every missed period and asks for confirmation before anything is created; entries keep their original due dates.
- On every app open (and when the app returns after 30+ min) pending payments are shown with Confirm / Confirm all / Remind me later.
- Nothing is added without explicit confirmation. Editing or deleting a recurring item never touches confirmed expenses.
