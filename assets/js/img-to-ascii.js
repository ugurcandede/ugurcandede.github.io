/**
 * Convert an `img` element to ASCII art while preserving the source image's
 * aspect ratio, with font character-cell compensation (mono chars are ~2×
 * taller than wide; without correction a square image renders as a tall
 * rectangle of characters).
 *
 * Zero dependencies. Works in any modern browser (Canvas2D + getImageData).
 *
 * ---
 *
 * **Quick Start**
 *
 * ```html
 * <img id="src" crossorigin="anonymous" src="...">
 * <pre id="out"></pre>
 * <script src="img-to-ascii.js"></script>
 * <script>
 *   const img = document.getElementById('src');
 *   const out = document.getElementById('out');
 *   img.onload = () => {
 *     out.textContent = imgToAscii(img, {
 *       cols: 56,
 *       charAspectRatio: measureCharAspectRatio(out),
 *     });
 *   };
 * </script>
 * ```
 *
 * ---
 *
 * **Gotchas**
 *
 * 1. **CORS** — `getImageData` throws `SecurityError` on tainted canvases.
 *    Set `crossOrigin = 'anonymous'` on the `<img>` and ensure the server
 *    sends `Access-Control-Allow-Origin: *`. Same-origin loads are always safe.
 *
 * 2. **Wait for load** — Call only after `img.complete === true`; otherwise
 *    `naturalWidth` / `naturalHeight` are 0.
 *
 * 3. **Char aspect ratio** — Default `0.55` works for SF Mono / JetBrains Mono
 *    / Consolas at `line-height: 1`. For other fonts call
 *    `measureCharAspectRatio(el)` to measure against your target element.
 *
 * ---
 *
 * **ESM** — Add `export { imgToAscii, measureCharAspectRatio };` at the bottom
 * and load with `<script type="module">`.
 *
 * @module img-to-ascii
 */

(function () {
  'use strict';

  /**
   * Convert a loaded image to an ASCII-art string.
   *
   * @param {HTMLImageElement} img  Fully-loaded, CORS-accessible image.
   * @param {Object} [opts]
   * @param {number} [opts.cols=56]
   *   Output character width. Higher = more detail, wider rendered output.
   * @param {string} [opts.ramp='@%#*+=-:. ']
   *   Densest → lightest character ramp. Defaults to a 10-level ramp
   *   tuned for dark backgrounds: bright pixels render as dense chars,
   *   dark pixels render as spaces (invisible). Reverse the string for
   *   a light background.
   * @param {number} [opts.charAspectRatio=0.55]
   *   Character cell width ÷ height in the target font (≈ 0.55 for SF
   *   Mono / JetBrains Mono / Consolas at line-height 1). Use
   *   measureCharAspectRatio() to measure exactly.
   * @returns {string|null}
   *   ASCII art with '\n' line breaks, or null if the canvas readback
   *   fails (typically a CORS-tainted image).
   */
  function imgToAscii(img, opts) {
    opts = opts || {};
    var cols = opts.cols || 56;
    var ramp = opts.ramp || '@%#*+=-:. ';
    var charAspectRatio = opts.charAspectRatio || 0.55;

    var imgW = img.naturalWidth || img.width;
    var imgH = img.naturalHeight || img.height;
    if (!imgW || !imgH) return null;

    // Preserve display aspect:
    //   display_width  = cols * char_w
    //   display_height = rows * char_h
    // Want display_h / display_w == imgH / imgW
    //   rows = cols * (imgH/imgW) * (char_w/char_h)
    var imgAspect = imgH / imgW;
    var rows = Math.max(1, Math.round(cols * imgAspect * charAspectRatio));

    var canvas = document.createElement('canvas');
    canvas.width = cols;
    canvas.height = rows;
    var ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, cols, rows);

    var data;
    try {
      data = ctx.getImageData(0, 0, cols, rows).data;
    } catch (e) {
      return null; // CORS-tainted
    }

    var out = '';
    var rampLast = ramp.length - 1;
    for (var y = 0; y < rows; y++) {
      for (var x = 0; x < cols; x++) {
        var i = (y * cols + x) * 4;
        // Rec. 601 luma
        var b = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
        var idx = Math.floor((1 - b) * rampLast);
        out += ramp[idx];
      }
      if (y < rows - 1) out += '\n';
    }
    return out;
  }

  /**
   * Measure the width/height ratio of a single character cell in the
   * element's computed font. Feed the result to imgToAscii's
   * charAspectRatio option for pixel-accurate aspect preservation.
   *
   * @param {HTMLElement} el
   *   Element whose font (family, size, line-height, letter-spacing) will
   *   be measured. Usually the <pre> that will display the ASCII output.
   * @returns {number}
   *   char_width / char_height, typically 0.55–0.60 for mono fonts.
   *   Character width / character height for the current font metrics.
   *   Falls back to 0.55 if measurement fails.
   */
  function measureCharAspectRatio(el) {
    var probe = document.createElement('span');
    var cs = getComputedStyle(el);
    probe.style.font = cs.font;
    probe.style.lineHeight = cs.lineHeight;
    probe.style.letterSpacing = cs.letterSpacing;
    probe.style.whiteSpace = 'pre';
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    probe.style.top = '-9999px';
    probe.style.left = '-9999px';
    probe.textContent = 'M\nM';
    document.body.appendChild(probe);
    var rect = probe.getBoundingClientRect();
    var charW = rect.width;
    var charH = rect.height / 2;
    document.body.removeChild(probe);
    return (charW && charH) ? (charW / charH) : 0.55;
  }

  // Expose to the global scope for classic <script> usage.
  if (typeof window !== 'undefined') {
    window.imgToAscii = imgToAscii;
    window.measureCharAspectRatio = measureCharAspectRatio;
  }
})();
