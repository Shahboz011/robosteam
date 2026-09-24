(function () {
  var form = document.getElementById('form');
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var name = form.name.value.trim();
    if (!name) { form.name.focus(); return; }
    form.classList.add('done');
    // Continue on register.html with the name prefilled; with motion on, wait for the robot's bounce first.
    var url = 'register.html?name=' + encodeURIComponent(name.slice(0, 80));
    var motion = window.gsap && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setTimeout(function () { location.href = url; }, motion ? 450 : 0);
  });

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !window.gsap || !window.ScrollTrigger) {
    if (window.Mascot) Mascot.init({ reduce: reduce });
    return;
  }
  gsap.registerPlugin(ScrollTrigger);

  // Smooth scroll
  if (window.Lenis) {
    var lenis = new Lenis({ lerp: 0.1 });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(function (t) { lenis.raf(t * 1000); });
    gsap.ticker.lagSmoothing(0);
    document.querySelectorAll('a[href^="#"]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        var id = a.getAttribute('href');
        var el = id.length > 1 && document.querySelector(id);
        if (el) { e.preventDefault(); lenis.scrollTo(el, { offset: -84 }); }
      });
    });
  }

  // Hero astronaut (mascot.js). Started after Lenis so its ticker runs after each scroll update.
  if (window.Mascot) Mascot.init({ reduce: false });

  // The one orchestrated moment: hero intro
  var tl = gsap.timeline({ defaults: { ease: 'power4.out' } });
  tl.from('.hero h1 .ln > span', { yPercent: 110, duration: 1, stagger: 0.12 })
    .from('[data-hero-in]', { opacity: 0, y: 30, duration: 0.8, stagger: 0.1 }, '-=0.5');

  // Scroll-linked, not scroll-triggered: gear turns, mascots drift, rail fills
  gsap.to('[data-gear]', { rotate: 180, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });
  gsap.utils.toArray('[data-parallax]').forEach(function (el) {
    gsap.fromTo(el, { y: 40 }, { y: -40, ease: 'none', scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true } });
  });
  var rail = gsap.to('.rail i', { scaleY: 1, ease: 'none', scrollTrigger: { trigger: '.steps', start: 'top 60%', end: 'bottom 70%', scrub: true } }).scrollTrigger;

  // Rover assembles bottom-up as the user scrolls through the steps.
  var rover = document.querySelector('.rover');
  if (rover) {
    var steps = document.querySelector('.steps');
    var assemble = function (trigger) {
      var built = function (self) { rover.classList.toggle('is-built', self.progress > 0.999); };
      trigger.scrub = true;
      trigger.invalidateOnRefresh = true;
      trigger.onUpdate = trigger.onRefresh = built;
      var tl = gsap.timeline({ scrollTrigger: trigger });
      // steps 1..5: lower shell, motor+gear, main shell, lid, head (+ its status light); chassis stays put
      for (var s = 1; s <= 5; s++) {
        tl.to(rover.querySelectorAll('[data-step="' + s + '"]'), {
          yPercent: function (i, el) { return parseFloat(getComputedStyle(el).getPropertyValue('--dy')); },
          ease: 'power2.out', duration: 1,
        }, (s - 1) * 0.7); // 30% overlap between consecutive parts
      }
    };
    var mm = gsap.matchMedia();
    // Side-by-side layout: same start as the rail, finishing exactly when the rail fill reaches step 4's marker.
    mm.add('(min-width: 861px)', function () {
      assemble({ trigger: steps, start: 'top 60%', end: function () {
        // rail fill runs from 8px to (height - 8px) inside .steps; step 4's marker centre sits 18px below its top
        var f = (steps.querySelector('.step[data-n="4"]').offsetTop + 18 - 8) / (steps.offsetHeight - 16);
        return rail.start + Math.min(1, f) * (rail.end - rail.start);
      } });
    });
    // Stacked layout: the rover sits above the steps and would scroll away before step 4,
    // so it assembles over its own passage through the viewport instead.
    mm.add('(max-width: 860px)', function () {
      assemble({ trigger: rover, start: 'top 75%', end: 'bottom 50%' });
    });
  }

  // Stat counters (only reveal on page: numbers earn their animation)
  document.querySelectorAll('[data-count]').forEach(function (el) {
    var end = +el.dataset.count, suffix = el.dataset.suffix || '', o = { v: 0 };
    ScrollTrigger.create({ trigger: el, start: 'top 85%', once: true, onEnter: function () {
      gsap.to(o, { v: end, duration: 1.4, ease: 'power2.out', onUpdate: function () { el.textContent = Math.round(o.v) + suffix; } });
    } });
  });

  // Program cards land once as a group
  gsap.from('.card', { y: 60, opacity: 0, duration: 0.8, stagger: 0.14, ease: 'power3.out', scrollTrigger: { trigger: '.cards', start: 'top 80%', once: true } });

  // Footer astronaut pops up from behind the bottom edge once, then starts its float
  gsap.from('.peek picture', { yPercent: 100, duration: 0.9, ease: 'power3.out',
    scrollTrigger: { trigger: '.peek', start: 'top 92%', once: true },
    onComplete: function () { document.querySelector('.peek').classList.add('is-up'); } });

  // Ticket robot reacts to a successful submit: one small bounce, and a short golden glow pulse on the image
  form.addEventListener('submit', function () {
    if (!form.classList.contains('done')) return;
    gsap.fromTo('#cheer', { y: 0 }, { y: -14, yoyo: true, repeat: 1, duration: 0.22, ease: 'power2.out', overwrite: true });
    gsap.fromTo('#cheer img',
      { filter: 'brightness(1) drop-shadow(0 0 0px rgba(255, 210, 63, 0))' },
      { filter: 'brightness(1.15) drop-shadow(0 0 14px rgba(255, 210, 63, 0.85))', yoyo: true, repeat: 1, duration: 0.35, ease: 'sine.inOut', overwrite: true,
        onComplete: function () { gsap.set('#cheer img', { clearProps: 'filter' }); } });
  });
})();
