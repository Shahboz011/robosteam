/* RoboSTEAM astronaut: a canvas frame-sequence mascot for the hero.
   idle = clip2 loop, look = clip1 (cursor), wave = clip3 (scroll). Frames come from public/frames (see manifest.json). */
(function () {
  'use strict';

  // ---- Tuning: everything worth adjusting lives here ----
  var TUNING = {
    // Cursor look (desktop, mouse only)
    lookLerp: 7,            // how fast the head chases the cursor, per second (higher = snappier)
    lookFadeIn: 0.25,       // seconds to crossfade idle -> look
    lookFadeOut: 0.5,       // seconds to crossfade look -> idle
    idleTimeout: 1500,      // ms without mouse movement before returning to idle
    recenter: 1.5,          // how close (in frames) the head must get to centre before fading back to idle
    parallaxPx: 8,          // max canvas shift toward the cursor, CSS px (0 = off)
    parallaxLerp: 4,        // how fast the parallax follows, per second

    // Idle loop
    idleFps: 12,            // idle frames were exported at 12fps; neighbouring frames are blended

    // Scroll: turn + wave while leaving the hero, then dock in the corner and fade
    scrollTrigger: '.hero .stage',
    scrollStart: 'clamp(bottom bottom)', // starts when the stage is fully in view (or at the page top)
    scrollEnd: 'bottom top',             // ends when the stage has left the viewport
    handoff: 0.12,          // share of the scroll range spent blending from the hero pose into clip3
    fadeTrigger: '#about',
    fadeStart: 'bottom 85%', // docked astronaut starts fading when #about's bottom reaches 85% of the viewport
    fadeEnd: 'bottom 45%',   // ...and is fully gone at 45%

    // Rendering and loading
    maxDpr: 2,
    mobileQuery: '(max-width: 760px)', // uses the 500px set; keep in sync with the preload links in index.html
    loadConcurrency: 4,
    base: 'public/frames/',
  };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
  function approach(cur, target, rate, dt) { return cur + (target - cur) * (1 - Math.exp(-rate * dt)); }
  function pad3(n) { return ('00' + n).slice(-3); }

  function loadImg(src) {
    var img = new Image();
    img.decoding = 'async';
    img.src = src;
    return img.decode().then(function () { return img; });
  }

  // A canvas kept at its CSS size x devicePixelRatio (capped). Multi-layer draws are summed with 'lighter'
  // on an offscreen canvas, which is a true premultiplied crossfade (no dimming, no silhouette pop).
  function Surface(canvas, onResize) {
    var self = this;
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.off = document.createElement('canvas');
    this.octx = this.off.getContext('2d');
    this.dpr = 1;
    this.fit();
    new ResizeObserver(function () { if (self.fit() && onResize) onResize(); }).observe(canvas);
  }
  Surface.prototype.fit = function () {
    this.dpr = Math.min(window.devicePixelRatio || 1, TUNING.maxDpr);
    var w = Math.round(this.cv.clientWidth * this.dpr), h = Math.round(this.cv.clientHeight * this.dpr);
    if (!w || !h || (w === this.cv.width && h === this.cv.height)) return false;
    this.cv.width = this.off.width = w;
    this.cv.height = this.off.height = h;
    this.ctx.imageSmoothingQuality = this.octx.imageSmoothingQuality = 'high';
    return true;
  };
  // layers: [{ img, w (weight), dy (fraction of frame height) }]; ox/oy: offset in CSS px
  Surface.prototype.paint = function (layers, ox, oy) {
    var W = this.cv.width, H = this.cv.height, list = [], sum = 0, i, l;
    for (i = 0; i < layers.length; i++) { l = layers[i]; if (l.img && l.w > 0.002) { list.push(l); sum += l.w; } }
    this.ctx.clearRect(0, 0, W, H);
    if (!list.length) return;
    var x = (ox || 0) * this.dpr, y = (oy || 0) * this.dpr;
    if (list.length === 1) { this.ctx.drawImage(list[0].img, x, y + list[0].dy * H, W, H); return; }
    var o = this.octx;
    o.globalCompositeOperation = 'source-over';
    o.globalAlpha = 1;
    o.clearRect(0, 0, W, H);
    o.globalCompositeOperation = 'lighter';
    for (i = 0; i < list.length; i++) { o.globalAlpha = list[i].w / sum; o.drawImage(list[i].img, 0, list[i].dy * H, W, H); }
    o.globalCompositeOperation = 'source-over';
    o.globalAlpha = 1;
    this.ctx.drawImage(this.off, x, y);
  };

  function Clip(info, width) {
    this.dir = info.dir;
    this.n = info.frames;
    this.width = width;
    this.imgs = new Array(this.n);
    this.loaded = 0;
    this.failed = 0;
  }
  Clip.prototype.src = function (i) { return TUNING.base + this.dir + '/' + this.width + '/' + pad3(i + 1) + '.webp'; };
  Clip.prototype.settled = function () { return this.loaded > 0 && this.loaded + this.failed === this.n; };
  Clip.prototype.get = function (i) { // the frame, or the nearest one that has loaded
    for (var d = 0; d < this.n; d++) {
      if (this.imgs[i - d]) return this.imgs[i - d];
      if (this.imgs[i + d]) return this.imgs[i + d];
    }
    return null;
  };
  // Layers for a fractional frame index, blending the two neighbouring frames.
  Clip.prototype.layers = function (f, weight, dy, wrap) {
    f = wrap ? ((f % this.n) + this.n) % this.n : clamp(f, 0, this.n - 1);
    var i = Math.floor(f), t = f - i, j = wrap ? (i + 1) % this.n : Math.min(i + 1, this.n - 1);
    return [{ img: this.get(i), w: weight * (1 - t), dy: dy }, { img: this.get(j), w: weight * t, dy: dy }];
  };

  // Loads frames a few at a time; a clip can be moved to the front of the queue when it's needed now.
  function Loader() { this.queue = []; this.active = 0; }
  Loader.prototype.add = function (clip, from) { for (var i = from || 0; i < clip.n; i++) this.queue.push({ clip: clip, i: i }); this.pump(); };
  Loader.prototype.prioritize = function (clip) {
    this.queue.sort(function (a, b) { return (b.clip === clip) - (a.clip === clip) || a.i - b.i; });
  };
  Loader.prototype.pump = function () {
    var self = this;
    while (this.active < TUNING.loadConcurrency && this.queue.length) {
      var job = this.queue.shift();
      this.active++;
      (function (job) {
        loadImg(job.clip.src(job.i))
          .then(function (img) { job.clip.imgs[job.i] = img; job.clip.loaded++; }, function () { job.clip.failed++; })
          .then(function () { self.active--; self.pump(); });
      })(job);
    }
  };

  function init(opts) {
    var heroEl = document.querySelector('.hero');
    var stage = document.querySelector(TUNING.scrollTrigger);
    var canvas = stage && stage.querySelector('.astro');
    var poster = stage && stage.querySelector('.astro-poster');
    var reduce = opts && opts.reduce;
    if (!canvas || !canvas.getContext || !window.ResizeObserver) return fallback();

    function fallback() {
      if (canvas) canvas.hidden = true;
      if (poster) { poster.src = poster.dataset.src; poster.hidden = false; }
    }

    fetch(TUNING.base + 'manifest.json')
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(start)
      .catch(function (err) { console.warn('mascot: falling back to poster', err); fallback(); });

    function start(M) {
      var mobile = window.matchMedia(TUNING.mobileQuery).matches;
      var size = mobile ? M.width.mobile : M.width.desktop;
      var idle = new Clip(M.clips.idle, size);
      var look = new Clip(M.clips.look, size);
      var wave = new Clip(M.clips.wave, size);
      var idleDy = M.clips.idle.dy;
      var hero = new Surface(canvas, function () { heroDirty = true; });
      var heroDirty = true;

      return loadImg(idle.src(0)).then(function (img) {
        idle.imgs[0] = img;
        idle.loaded = 1;
        if (reduce) return still();
        run();
      });

      // prefers-reduced-motion: one static frame, redrawn only on resize.
      function still() {
        var draw = function () { hero.paint([{ img: idle.imgs[0], w: 1, dy: 0 }]); };
        draw();
        new ResizeObserver(draw).observe(canvas);
      }

      function run() {
        var loader = new Loader();
        var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
        var scroll = !!(window.gsap && window.ScrollTrigger);
        loader.add(idle, 1);
        if (finePointer) loader.add(look);
        if (scroll) loader.add(wave);

        // --- cursor look state ---
        var center = (look.n - 1) / 2;
        var looking = false, lastMove = -Infinity, target = center, lookIdx = center, mix = 0;
        var par = { x: 0, y: 0, tx: 0, ty: 0 };
        if (finePointer) {
          heroEl.addEventListener('pointermove', function (e) {
            if (e.pointerType !== 'mouse' || !look.settled()) return;
            var r = heroEl.getBoundingClientRect();
            var nx = clamp((e.clientX - r.left) / r.width, 0, 1), ny = clamp((e.clientY - r.top) / r.height, 0, 1);
            target = nx * (look.n - 1);
            par.tx = (nx - 0.5) * 2 * TUNING.parallaxPx;
            par.ty = (ny - 0.5) * 2 * TUNING.parallaxPx * 0.6;
            lastMove = performance.now();
            if (!looking) { looking = true; if (mix === 0) lookIdx = center; } // clip1's centre frame matches the idle pose
          });
        }

        // --- scroll: fixed layer that carries the astronaut from the stage to the corner ---
        var st = null, fade = null, fly = null, dock = null, flyS = null, flyOn = false, flyKey = '';
        if (scroll) {
          fly = document.createElement('canvas');
          fly.className = 'astro-fly';
          fly.setAttribute('aria-hidden', 'true');
          dock = document.createElement('div');
          dock.className = 'astro-dock';
          document.body.appendChild(dock);
          document.body.appendChild(fly);
          fly.style.width = canvas.getBoundingClientRect().width + 'px';
          flyS = new Surface(fly, function () { flyKey = ''; });
          st = ScrollTrigger.create({ trigger: stage, start: TUNING.scrollStart, end: TUNING.scrollEnd });
          fade = ScrollTrigger.create({ trigger: TUNING.fadeTrigger, start: TUNING.fadeStart, end: TUNING.fadeEnd });
        }

        // Pause hero drawing while the stage is off screen.
        var heroVisible = true;
        new IntersectionObserver(function (en) { heroVisible = en[0].isIntersecting; }).observe(stage);

        var t = 0, last = performance.now(), snapshot = { layers: [], dy: 0, x: 0, y: 0 };

        function tick() {
          var now = performance.now(), dt = Math.min((now - last) / 1000, 0.1);
          last = now;
          var p = st ? st.progress : 0, q = fade ? fade.progress : 0;

          // Hero: idle loop + cursor look. Frozen while the astronaut is out on the fly layer.
          if (p === 0 && (heroVisible || heroDirty)) {
            t += dt;
            var playing = idle.settled();
            var f = playing ? (t * TUNING.idleFps) % idle.n : 0;
            var fi = Math.floor(f);
            // Float height of the idle clip right now; clip1 frames are shifted by it so heights always match.
            var dy = lerp(idleDy[fi], idleDy[(fi + 1) % idle.n], f - fi);

            if (looking) {
              var active = now - lastMove < TUNING.idleTimeout;
              lookIdx = approach(lookIdx, active ? target : center, TUNING.lookLerp, dt);
              if (active) mix = Math.min(1, mix + dt / TUNING.lookFadeIn);
              else {
                par.tx = par.ty = 0;
                // turn back to centre first, then fade to idle, so the crossfade is between matching poses
                if (Math.abs(lookIdx - center) < TUNING.recenter) mix = Math.max(0, mix - dt / TUNING.lookFadeOut);
                if (mix === 0) looking = false;
              }
            }
            par.x = approach(par.x, par.tx, TUNING.parallaxLerp, dt);
            par.y = approach(par.y, par.ty, TUNING.parallaxLerp, dt);

            var w = smooth(mix);
            var layers = idle.layers(f, 1 - w, 0, true);
            if (w > 0) layers = layers.concat(look.layers(lookIdx, w, dy, false));
            hero.paint(layers, par.x, par.y);
            snapshot = { layers: layers, dy: dy, x: par.x, y: par.y };
            heroDirty = false;
          }

          if (!st) return;
          var flying = p > 0 && q < 1;
          if (flying !== flyOn) {
            flyOn = flying;
            fly.style.visibility = flying ? 'visible' : 'hidden';
            if (flying) loader.prioritize(wave);
            flyKey = '';
          }
          canvas.style.visibility = p > 0 ? 'hidden' : '';
          if (!flyOn) return;

          // Position: from the hero canvas (moving with the page) to the dock, eased over the scroll range.
          var hr = canvas.getBoundingClientRect(), dr = dock.getBoundingClientRect();
          if (Math.abs(fly.clientWidth - hr.width) > 0.5) fly.style.width = hr.width + 'px';
          var e = smooth(p);
          fly.style.transform = 'translate3d(' + lerp(hr.left, dr.left, e) + 'px,' + lerp(hr.top, dr.top, e) + 'px,0) scale(' + lerp(1, dr.width / hr.width, e) + ')';
          fly.style.opacity = 1 - smooth(q);

          // Frames: clip3 scrubbed by scroll, blended in from the last hero pose over the first `handoff` of the range.
          var wf = p * (wave.n - 1), k = smooth(p / TUNING.handoff);
          var key = wf.toFixed(3) + '|' + k.toFixed(3) + '|' + wave.loaded;
          if (key === flyKey) return;
          flyKey = key;
          var fl = wave.loaded ? wave.layers(wf, k, snapshot.dy * (1 - k), false) : [];
          for (var i = 0; i < snapshot.layers.length; i++) {
            var s = snapshot.layers[i];
            fl.push({ img: s.img, w: s.w * (wave.loaded ? 1 - k : 1), dy: s.dy });
          }
          flyS.paint(fl, snapshot.x * (1 - k), snapshot.y * (1 - k));
        }

        if (window.gsap) gsap.ticker.add(tick);
        else (function loop() { tick(); requestAnimationFrame(loop); })();
      }
    }
  }

  window.Mascot = { init: init, TUNING: TUNING };
})();
