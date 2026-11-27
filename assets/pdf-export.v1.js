/* MASROOF — direct PDF export (no printer dialog).
   Renders the report HTML page-by-page with the browser's own text engine (so Arabic shaping/RTL stay correct),
   packs the pages into a real PDF file and opens it in a tab (the viewer has a download button). */
(function () {
  var PW = 794, PH = 1123, M = 53, SCALE = 2;

  function theme(html) {
    return html
      .replace(/font-family:Arial,sans-serif/, 'font-family:Tahoma,"Noto Sans Arabic","Segoe UI",Arial,sans-serif')
      .replace('.total td{background:#26a69a', '.total td{background:#0d2036')
      .replace(/#26a69a/g, '#b08d57').replace(/#e7f5f0/g, '#f7f1e2').replace(/#16776e/g, '#876630')
      .replace(/#c9ddd8/g, '#e1d8c3').replace(/#f6fbfa/g, '#faf6ec').replace(/#16324f/g, '#0d2036')
      .replace(/@page\{[^}]*\}/, '');
  }

  function loadImage(src) {
    return new Promise(function (res, rej) {
      var im = new Image();
      im.onload = function () { res(im); };
      im.onerror = function () { rej(new Error('image')); };
      im.src = src;
    });
  }

  function b64ToBytes(b64) {
    var bin = atob(b64), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  async function renderPages(html) {
    var frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;left:-99999px;top:0;visibility:hidden;border:0;width:' + (PW - 2 * M) + 'px;height:' + PH + 'px';
    document.body.appendChild(frame);
    try {
      var d = frame.contentDocument;
      d.open(); d.write(theme(html)); d.close();
      await new Promise(function (r) { setTimeout(r, 120); });
      if (d.fonts && d.fonts.ready) { try { await d.fonts.ready; } catch (e) {} }
      var header = d.querySelector('header'), summary = d.querySelector('.summary');
      var table = d.querySelector('table'), thead = d.querySelector('thead');
      var rows = Array.prototype.slice.call(d.querySelectorAll('tbody tr'));
      var cap = PH - 2 * M, headH = thead.getBoundingClientRect().height;
      var firstUsed = (header ? header.getBoundingClientRect().height + 18 : 0) + (summary ? summary.getBoundingClientRect().height + 18 : 0);
      var pages = [], cur = [], used = firstUsed + headH, limit = cap;
      rows.forEach(function (tr) {
        var h = tr.getBoundingClientRect().height;
        if (cur.length && used + h > limit) { pages.push(cur); cur = []; used = headH; }
        cur.push(tr); used += h;
      });
      if (cur.length || !pages.length) pages.push(cur);

      var css = Array.prototype.map.call(d.querySelectorAll('style'), function (s) { return s.textContent; }).join('\n')
        .replace(/(^|\})\s*body\s*\{/g, '$1.pdfpage{');
      var dir = d.documentElement.getAttribute('dir') || 'rtl';
      var out = [];
      for (var p = 0; p < pages.length; p++) {
        var wrap = d.createElement('div');
        wrap.className = 'pdfpage';
        wrap.setAttribute('dir', dir);
        wrap.style.cssText = 'box-sizing:border-box;width:' + PW + 'px;height:' + PH + 'px;padding:' + M + 'px;background:#fff;overflow:hidden';
        var st = d.createElement('style'); st.textContent = css; wrap.appendChild(st);
        if (p === 0) {
          if (header) wrap.appendChild(header.cloneNode(true));
          if (summary) wrap.appendChild(summary.cloneNode(true));
        }
        var t = table.cloneNode(false);
        t.appendChild(thead.cloneNode(true));
        var tb = d.createElement('tbody');
        pages[p].forEach(function (tr) { tb.appendChild(tr.cloneNode(true)); });
        t.appendChild(tb); wrap.appendChild(t);
        var xhtml = new XMLSerializer().serializeToString(wrap);
        var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + PW * SCALE + '" height="' + PH * SCALE + '" viewBox="0 0 ' + PW + ' ' + PH + '"><foreignObject x="0" y="0" width="' + PW + '" height="' + PH + '">' + xhtml + '</foreignObject></svg>';
        var img = await loadImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
        var cv = document.createElement('canvas'); cv.width = PW * SCALE; cv.height = PH * SCALE;
        var cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(img, 0, 0, cv.width, cv.height);
        out.push({ w: cv.width, h: cv.height, jpg: b64ToBytes(cv.toDataURL('image/jpeg', 0.92).split(',')[1]) });
      }
      return out;
    } finally { frame.remove(); }
  }

  function buildPdf(pages) {
    var enc = new TextEncoder(), chunks = [], off = 0, offsets = [];
    function push(x) { var b = typeof x === 'string' ? enc.encode(x) : x; chunks.push(b); off += b.length; }
    function obj(id, body) { offsets[id] = off; push(id + ' 0 obj\n' + body + '\nendobj\n'); }
    var n = pages.length;
    push('%PDF-1.4\n');
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    obj(2, '<< /Type /Pages /Kids [' + pages.map(function (_, i) { return (3 + 3 * i) + ' 0 R'; }).join(' ') + '] /Count ' + n + ' >>');
    pages.forEach(function (p, i) {
      var pid = 3 + 3 * i, cid = 4 + 3 * i, iid = 5 + 3 * i;
      obj(pid, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im0 ' + iid + ' 0 R >> >> /Contents ' + cid + ' 0 R >>');
      var cs = 'q 595.28 0 0 841.89 0 0 cm /Im0 Do Q';
      obj(cid, '<< /Length ' + cs.length + ' >>\nstream\n' + cs + '\nendstream');
      offsets[iid] = off;
      push(iid + ' 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + p.w + ' /Height ' + p.h + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + p.jpg.length + ' >>\nstream\n');
      push(p.jpg); push('\nendstream\nendobj\n');
    });
    var xref = off, total = 3 * n + 3, x = 'xref\n0 ' + total + '\n0000000000 65535 f \n';
    for (var i = 1; i < total; i++) x += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
    push(x + 'trailer\n<< /Size ' + total + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF');
    return new Blob(chunks, { type: 'application/pdf' });
  }

  function download(url, name) {
    var a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  }

  window.__masroofPdf = async function (html, filename, win, ar) {
    try {
      var blob = buildPdf(await renderPages(html));
      var url = URL.createObjectURL(blob);
      if (win && !win.closed) { win.location.href = url; } else { window.open(url, '_blank') || download(url, filename); }
      setTimeout(function () { URL.revokeObjectURL(url); }, 10 * 60 * 1000);
    } catch (e) {
      if (win && !win.closed) { try { win.close(); } catch (_) {} }
      alert(ar ? 'تعذّر إنشاء ملف PDF، حاول مرة أخرى.' : 'Could not create the PDF. Please try again.');
      if (window.console) console.error(e);
    }
  };
})();
