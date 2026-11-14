(function () {
  const nz = s => { const x = Math.sin(s * 12.9898) * 43758.5453; return x - Math.floor(x); };
  window.priceAt = (c, t = Date.now()) => {
    if (!c) return null;
    if (c.dir === 'flat') return Number(c.price);
    const s = Math.max(0, (t - c.since) / 1000), d = c.dir === 'up' ? 1 : -1, sp = Number(c.speed) || 1, v = Number(c.vol) || 0.1;
    // Smooth continuous wave instead of sudden random jumps
    const wave = Math.sin(t / 400 + (c.since % 97)) * 0.5 + (nz(Math.floor(t / 1000) + c.since % 53) - 0.5) * 0.3;
    return Number(c.price) + d * sp * v * s * 0.05 + wave * v * 0.15 * sp * Math.min(1, s / 2);
  };
  window.decOf = p => p >= 500 ? 2 : p >= 50 ? 3 : p >= 5 ? 4 : 5;

  window.CandleChart = class {
    constructor(cv) {
      this.cv = cv; this.g = cv.getContext('2d'); this.C = []; this.tf = 60; this.dec = 4; this.cw = 11; this.off = 0;
      this.marks = []; this.price = 0; this.disp = 0; this.lo = 0; this.hi = 1; this.skew = 0; this.W = 0; this.H = 0;
      this.drawingMode = false; this.drawings = []; this.currentDraw = null;
      this.autoScroll = true;
      this.gridOpacity = 0.08;
      this.upColor = '#0faf59';
      this.dnColor = '#ef5d4e';
      this.tradeDuration = 60;
      this.updateThemeColors();

      let d = null;
      cv.addEventListener('pointerdown', e => {
        const r = this.cv.getBoundingClientRect(); const x = e.clientX - r.left, y = e.clientY - r.top;
        if (this.drawingMode) { this.currentDraw = [{x, y}, {x, y}]; return; }
        d = { x: e.clientX, o: this.off }; cv.setPointerCapture(e.pointerId);
      });
      cv.addEventListener('pointermove', e => {
        const r = this.cv.getBoundingClientRect(); const x = e.clientX - r.left, y = e.clientY - r.top;
        if (this.drawingMode && this.currentDraw) { this.currentDraw[1] = {x, y}; return; }
        if (d) this.off = Math.max(0, Math.min(Math.max(0, this.C.length - 8), d.o + (e.clientX - d.x) / this.cw));
      });
      cv.addEventListener('pointerup', () => {
        if (this.drawingMode && this.currentDraw) { this.drawings.push(this.currentDraw); this.currentDraw = null; }
        d = null;
      });
      cv.addEventListener('wheel', e => { e.preventDefault(); this.cw = Math.max(5, Math.min(38, this.cw * (e.deltaY > 0 ? .92 : 1.08))); }, { passive: false });
      new ResizeObserver(() => this.size()).observe(cv.parentElement); this.size(); this.draw();
    }

    updateThemeColors() {
      const style = getComputedStyle(document.documentElement);
      this.gridRgb = style.getPropertyValue('--grid-rgb').trim() || '255,255,255';
      this.textColor = style.getPropertyValue('--mu').trim() || '#8f95ad';
      this.watermarkColor = style.getPropertyValue('--watermark').trim() || 'rgba(255,255,255,0.03)';
    }

    size() {
      const r = this.cv.getBoundingClientRect(), p = devicePixelRatio || 1;
      this.W = r.width; this.H = r.height;
      this.cv.width = r.width * p; this.cv.height = r.height * p;
      this.g.setTransform(p, 0, 0, p, 0, 0);
    }
    setDrawingMode(m) { this.drawingMode = m; }
    clearDrawings() { this.drawings = []; this.currentDraw = null; }

    setData(c, price, tf, dec) {
      this.C = c.map(k => ({ t: k.time, o: k.open, h: k.high, l: k.low, c: k.close }));
      this.tf = tf; this.dec = dec; this.price = this.disp = price;
      if (this.autoScroll) this.off = 0;
      this.lo = price * .999; this.hi = price * 1.001;
    }

    tick(price, now) {
      if (!this.C.length) return;
      this.price = price;
      const t = Math.floor(now / 1000 / this.tf) * this.tf, l = this.C[this.C.length - 1];
      if (t > l.t) {
        this.C.push({ t, o: l.c, h: Math.max(l.c, price), l: Math.min(l.c, price), c: price });
        if (this.C.length > 1500) this.C.shift();
        if (this.autoScroll && this.off < 2) this.off = 0;
      } else {
        l.c = price; l.h = Math.max(l.h, price); l.l = Math.min(l.l, price);
      }
    }

    draw() {
      requestAnimationFrame(() => this.draw());
      const { g, W, H, C } = this; g.clearRect(0, 0, W, H);
      if (!W || !C.length) return;

      const now = Date.now() + this.skew, AX = 68, pw = W - AX, R = pw * .76, cw = this.cw;
      const fo = Math.floor(this.off), last = C.length - 1 - fo, first = Math.max(0, last - Math.ceil(R / cw) - 2);

      // Ultra-smooth price interpolation (eliminates jhatka/jitter)
      this.disp += (this.price - this.disp) * 0.14;

      const K = i => {
        const k = C[i];
        return i === C.length - 1 ? { t: k.t, o: k.o, h: Math.max(k.h, this.disp), l: Math.min(k.l, this.disp), c: this.disp } : k;
      };

      let mn = 1e18, mx = -1e18;
      for (let i = first; i <= last; i++) { const k = K(i); mn = Math.min(mn, k.l); mx = Math.max(mx, k.h); }
      const span = Math.max(mx - mn, this.price * .0006), mid = (mx + mn) / 2, pad = span * .28;
      this.lo += (mid - span / 2 - pad - this.lo) * .12;
      this.hi += (mid + span / 2 + pad - this.hi) * .12;

      const Y = v => 18 + (this.hi - v) / (this.hi - this.lo) * (H - 46);
      const X = i => R - (last - i + .5) * cw - (this.off % 1) * cw;
      const f = v => v.toFixed(this.dec);

      // Background DEMO Watermark (Quotex Style)
      g.save();
      g.fillStyle = this.watermarkColor;
      g.font = `900 ${Math.min(W * 0.22, 140)}px system-ui,sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('DEMO', pw * 0.5, H * 0.5);
      g.restore();

      // Grid lines
      g.font = '11px system-ui,sans-serif'; g.textBaseline = 'middle'; g.lineWidth = 1;
      const gridStroke = `rgba(${this.gridRgb}, ${this.gridOpacity})`;
      for (let i = 0; i <= 6; i++) {
        const v = this.lo + (this.hi - this.lo) * i / 6, y = Math.round(Y(v)) + .5;
        g.strokeStyle = gridStroke; g.beginPath(); g.moveTo(0, y); g.lineTo(pw, y); g.stroke();
        g.fillStyle = this.textColor; g.textAlign = 'left'; g.fillText(f(v), pw + 8, y);
      }

      // Time grid
      const step = Math.max(1, Math.ceil(95 / cw)); g.textAlign = 'center';
      for (let i = first; i <= last; i++) {
        if (Math.round(C[i].t / this.tf) % step === 0) {
          const x = Math.round(X(i)) + .5;
          g.strokeStyle = gridStroke; g.beginPath(); g.moveTo(x, 14); g.lineTo(x, H - 28); g.stroke();
          g.fillStyle = this.textColor;
          g.fillText(new Date(C[i].t * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), x, H - 14);
        }
      }

      // Candlesticks
      const bw = Math.max(2.5, cw * .70);
      for (let i = first; i <= last; i++) {
        const k = K(i), x = X(i), col = k.c >= k.o ? this.upColor : this.dnColor;
        g.fillStyle = g.strokeStyle = col;
        g.beginPath(); g.moveTo(Math.round(x) + .5, Y(k.h)); g.lineTo(Math.round(x) + .5, Y(k.l)); g.stroke();
        const y1 = Y(Math.max(k.o, k.c)), h = Math.max(1.5, Math.abs(Y(k.o) - Y(k.c))), r = Math.min(2, bw / 3);
        g.beginPath(); g.roundRect ? g.roundRect(x - bw / 2, y1, bw, h, r) : g.rect(x - bw / 2, y1, bw, h); g.fill();
      }

      // Quotex Double Vertical Lines ("Beginning of trade" & "End of trade")
      const curX = X(C.length - 1);
      const endOffsetPx = Math.min(pw - curX - 10, Math.max(45, (this.tradeDuration / this.tf) * cw));
      const endX = curX + endOffsetPx;

      if (curX > 0 && curX < pw) {
        // Beginning of trade dashed vertical line
        g.setLineDash([4, 4]); g.strokeStyle = 'rgba(232,235,244,0.45)'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(curX, 24); g.lineTo(curX, H - 28); g.stroke();
        g.setLineDash([]);

        g.fillStyle = this.textColor; g.font = '11px system-ui,sans-serif'; g.textAlign = 'right';
        g.fillText('Beginning of trade', curX - 8, 36);

        // End of trade solid vertical line
        if (endX < pw) {
          g.strokeStyle = 'rgba(232,235,244,0.22)';
          g.beginPath(); g.moveTo(endX, 24); g.lineTo(endX, H - 28); g.stroke();
          g.textAlign = 'left';
          g.fillText('End of trade', endX + 8, 36);
          g.fillText(String(Math.floor(this.tradeDuration/60)).padStart(2,'0') + ':' + String(this.tradeDuration%60).padStart(2,'0'), endX + 8, 50);
        }
      }

      // Active Trade Marks (Quotex Entry Dot + Horizontal Line)
      for (const m of this.marks) {
        const y = Y(m.price), col = m.dir === 'buy' ? this.upColor : this.dnColor;
        let exX = curX;
        for (let i = first; i <= last; i++) { if (C[i].t * 1000 >= m.entryTime) { exX = X(i); break; } }

        g.strokeStyle = col; g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(exX, y); g.lineTo(pw, y); g.stroke();

        // Glowing Entry Circle
        g.fillStyle = col; g.beginPath(); g.arc(exX, y, 5, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#fff'; g.beginPath(); g.arc(exX, y, 2, 0, Math.PI * 2); g.fill();

        // Price/Amount Pill on Line
        g.fillStyle = col;
        g.beginPath(); g.roundRect ? g.roundRect(exX - 74, y - 10, 68, 20, 4) : g.rect(exX - 74, y - 10, 68, 20); g.fill();
        g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = 'bold 11px system-ui,sans-serif';
        g.fillText((m.dir === 'buy' ? '▲ ' : '▼ ') + '$' + m.amt, exX - 40, y);
      }

      // Live Price Horizontal Line, Candle Countdown & Blue Price Badge
      const py = Y(this.disp), left = Math.max(0, this.tf - (now / 1000) % this.tf);
      const tm = String(Math.floor(left / 60)).padStart(2, '0') + ':' + String(Math.floor(left % 60)).padStart(2, '0');

      g.setLineDash([4, 4]); g.strokeStyle = 'rgba(232,235,244,0.6)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(0, py); g.lineTo(pw, py); g.stroke(); g.setLineDash([]);

      // Candle Timer Badge
      const tmX = Math.min(pw - 56, curX + 10);
      g.fillStyle = '#262a3d';
      g.beginPath(); g.roundRect ? g.roundRect(tmX, py - 10, 46, 20, 4) : g.rect(tmX, py - 10, 46, 20); g.fill();
      g.fillStyle = '#e8ebf4'; g.textAlign = 'center'; g.font = 'bold 11px system-ui,sans-serif';
      g.fillText(tm, tmX + 23, py);

      // Right Axis Price Pill
      g.fillStyle = '#2b99ff';
      g.beginPath(); g.roundRect ? g.roundRect(pw + 2, py - 11, AX - 4, 22, 11) : g.rect(pw + 2, py - 11, AX - 4, 22); g.fill();
      g.fillStyle = '#fff'; g.fillText(f(this.disp), pw + AX / 2, py);

      // User Drawings
      g.strokeStyle = '#2b99ff'; g.lineWidth = 2; g.setLineDash([]);
      this.drawings.forEach(l => { g.beginPath(); g.moveTo(l[0].x, l[0].y); g.lineTo(l[1].x, l[1].y); g.stroke(); });
      if (this.currentDraw) { g.beginPath(); g.moveTo(this.currentDraw[0].x, this.currentDraw[0].y); g.lineTo(this.currentDraw[1].x, this.currentDraw[1].y); g.stroke(); }
    }
  };
})();
