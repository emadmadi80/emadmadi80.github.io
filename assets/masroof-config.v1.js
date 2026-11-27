/* MASROOF settings you may edit.
   MASROOF_VOICE_API: URL of an optional speech-to-text service that accepts
   { audioData (data URL), language } and answers { text }.
   - Leave EMPTY on GitHub Pages (static hosting, no server): the app then uses the browser's own speech
     recognition (Android / desktop) or the iPhone keyboard dictation sheet.
   - On a host that provides the service, set it, e.g. "/api/voice/transcribe". */
window.MASROOF_VOICE_API = "";
