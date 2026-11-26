# MASROOF — GitHub Pages PWA (iPhone build, improved)

Static PWA: upload the contents of this folder to the repository root. Do not rename files.

## Prepaid expenses = monthly allocations
`assets/recurring-engine.v5.js`: a prepaid payment is NOT an expense; it creates a schedule (total / months, rounding goes to the last month).
Due allocations (including past ones) appear on every app open and are recorded only after confirmation, on their scheduled date.
Tapping a prepaid card opens the allocation summary + history. Editing/deleting never touches confirmed expenses.

## Voice input: two modes (chosen per device)
First launch asks once; the More tab has a card to change it (`assets/voice-mode.v1.js`).
- Instant speech recognition: browser recognition, starts and stops automatically (best on Android/desktop).
- Record, then transcribe: needs `MASROOF_VOICE_API`; without it the app uses the keyboard-dictation sheet (best on iPhone).

## Voice input without a server
`assets/masroof-config.v1.js` -> `MASROOF_VOICE_API`
- empty (default, GitHub Pages): browser speech recognition on Android/desktop, keyboard-dictation sheet on iPhone.
- set to a speech-to-text endpoint (e.g. "/api/voice/transcribe") only on a host that provides it.

## Recurring expenses
`assets/recurring-engine.v5.js` schedules due dates (weekly/monthly/quarterly/half-yearly/yearly/custom), keeps a
confirmation ledger so one (recurring item + due date) is recorded once, and asks for confirmation on every app open.
The ledger is now part of JSON backups / Drive backups and is merged on restore.

## Cache
`sw.js` cache name is bumped on every release; assets carry `?v=` so phones pick up new files.

## Refinements (round 3)
- `assets/select-popover.v1.js`: compact dropdown on touch screens (half-screen size, smaller text).
- Voice entry: shop field is focused without raising the keyboard; an Undo button steps back through voice entries until a payment method is pressed.
- No text caret/selection on static text (inputs stay selectable).

## Lock screen & reminder limits
- The PIN/biometric screen is shown at launch only when the auto-lock period (Device security card) has elapsed since the last activity; a plain refresh does not lock. Last activity is stored in `masroof-last-active-v1`.
- The last-backup reminder and the due-payments popup are each shown at most 3 times per day (`masroof-reminder-count-v1`, resets daily).
