(() => {
  // ── ASCII portrait (neofetch pane) ──
  // Uses img-to-ascii.js (loaded as a separate script). See that file for
  // full API docs; it's a standalone module reusable in other projects.
  const asciiEl = document.querySelector('.ascii-avatar');
  if (asciiEl && typeof window.imgToAscii === 'function') {
    const loadImg = (src) => new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });

    (async () => {
      let img;
      try { img = await loadImg(asciiEl.dataset.avatar); }
      catch { try { img = await loadImg(asciiEl.dataset.fallback); } catch { return; } }

      const ascii = window.imgToAscii(img, {
        cols: 56,
        ramp: '@%#*+=-:. ',
        charAspectRatio: window.measureCharAspectRatio(asciiEl),
      });
      if (ascii) asciiEl.textContent = ascii;
    })();
  }

  // ── email: reveal requires a tiny math challenge ──
  document.querySelectorAll('button[data-email-user][data-email-domain]').forEach((btn) => {
    const original = btn.textContent.trim();
    let state = 'idle'; // idle → challenge → revealed

    const reset = () => {
      btn.textContent = original;
      state = 'idle';
    };

    const startChallenge = () => {
      if (state !== 'idle') return;
      state = 'challenge';

      const a = 2 + Math.floor(Math.random() * 7);
      const b = 2 + Math.floor(Math.random() * 7);
      const answer = String(a + b);

      btn.innerHTML = '';
      const label = document.createElement('span');
      label.textContent = `${a} + ${b} = `;
      const input = document.createElement('input');
      input.type = 'text';
      input.inputMode = 'numeric';
      input.autocomplete = 'off';
      input.className = 'email-challenge-input';
      input.setAttribute('aria-label', 'solve to reveal email');
      input.maxLength = 2;
      btn.append(label, input);

      // stop propagation so click inside input doesn't re-trigger
      input.addEventListener('click', (e) => e.stopPropagation());

      input.addEventListener('keydown', async (e) => {
        if (e.key === 'Escape') { e.preventDefault(); reset(); return; }
        if (e.key !== 'Enter') return;
        e.preventDefault();

        if (input.value.trim() === answer) {
          const addr = `${btn.dataset.emailUser}@${btn.dataset.emailDomain}`;
          try { await navigator.clipboard.writeText(addr); } catch (_) {}
          btn.textContent = `${addr}`;
          state = 'revealed';
          setTimeout(reset, 3500);
        } else {
          input.value = '';
          input.classList.add('wrong');
          setTimeout(() => input.classList.remove('wrong'), 400);
        }
      });

      setTimeout(() => input.focus(), 0);
    };

    btn.addEventListener('click', startChallenge);
  });
})();
