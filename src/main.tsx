import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { unlockAudio } from './render/sfx';

// Browsers only allow sound after the page has been touched. Any touch will
// do, so the first one anywhere wakes the audio up for the whole session.
for (const ev of ['pointerdown', 'keydown'] as const) {
  window.addEventListener(ev, unlockAudio, { capture: true, passive: true });
}

// Read by automated play testing; the climbing screen fills it in while a climb is up.
(window as unknown as { __game?: unknown }).__game = { state: 'title' };

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
