/* Mark Lloren — portfolio interactions.
   No libraries: raw WebGL for the hero, CSS 3D for the rest. */
(function () {
    'use strict';

    const $ = (s, root = document) => root.querySelector(s);
    const $$ = (s, root = document) => [...root.querySelectorAll(s)];
    const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const finePointer = matchMedia('(pointer: fine)').matches;

    /* ---- Preloader counter (the curtain itself is CSS, so it lifts even if this file fails) ---- */
    const preCount = $('#preCount');
    if (preCount && !reduced) {
        const t0 = performance.now();
        requestAnimationFrame(function tick(now) {
            const p = clamp((now - t0) / 850, 0, 1);
            preCount.textContent = String(Math.round(p * 100)).padStart(2, '0');
            if (p < 1) requestAnimationFrame(tick);
        });
    }

    /* ---- Navigation ---- */
    const navbar = $('#navbar');
    const navToggle = $('#navToggle');
    const navLinks = $('#navLinks');
    const setMenu = open => {
        navLinks.classList.toggle('mobile-open', open);
        navToggle.classList.toggle('active', open);
        navToggle.setAttribute('aria-expanded', open);
    };
    navToggle.addEventListener('click', () => setMenu(!navLinks.classList.contains('mobile-open')));
    $$('a', navLinks).forEach(a => a.addEventListener('click', () => setMenu(false)));

    // Highlight the link of the section crossing the middle of the screen
    const spy = new IntersectionObserver(entries => entries.forEach(e => {
        if (!e.isIntersecting) return;
        $$('a', navLinks).forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + e.target.id));
    }), { rootMargin: '-45% 0px -50% 0px' });
    $$('main > section[id], footer[id]').forEach(s => spy.observe(s));

    /* ---- Résumé: native <dialog> gives Esc, focus trap and backdrop for free ---- */
    const resume = $('#resumeModal');
    $('#openResumeBtn').addEventListener('click', () => resume.showModal());
    resume.addEventListener('click', e => { if (e.target === resume) resume.close(); });

    /* ---- Reveal on scroll + count-up numbers ---- */
    function countUp(el) {
        const end = +el.dataset.count;
        const t0 = performance.now();
        requestAnimationFrame(function tick(now) {
            const p = clamp((now - t0) / 1600, 0, 1);
            el.textContent = Math.round(end * (1 - Math.pow(1 - p, 4)));
            if (p < 1) requestAnimationFrame(tick);
        });
    }
    $$('[data-count]').forEach(el => { el.dataset.count = el.textContent; });

    const revealer = new IntersectionObserver(entries => entries.forEach(e => {
        if (!e.isIntersecting) return;
        e.target.classList.add('revealed');
        if (e.target.dataset.count && !reduced) countUp(e.target);
        revealer.unobserve(e.target);
    }), { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
    $$('.reveal, .lines, [data-count]').forEach(el => revealer.observe(el));

    /* ---- Hero: rotating role ---- */
    const roles = $$('#roleSwap > span');
    if (roles.length > 1 && !reduced) {
        let r = 0;
        setInterval(() => {
            const out = roles[r];
            out.classList.replace('is-active', 'is-out');
            setTimeout(() => out.classList.remove('is-out'), 700);
            r = (r + 1) % roles.length;
            roles[r].classList.add('is-active');
        }, 2600);
    }

    /* ---- Mouse-only extras: trailing cursor, magnetic buttons, 3D tilt ---- */
    if (finePointer && !reduced) {
        const cursor = $('#cursor');
        const label = $('#cursorLabel');
        let x = -100, y = -100, cx = -100, cy = -100;
        addEventListener('pointermove', e => {
            x = e.clientX;
            y = e.clientY;
            cursor.classList.add('is-visible');
        }, { passive: true });
        document.addEventListener('mouseout', e => { if (!e.relatedTarget) cursor.classList.remove('is-visible'); });
        document.addEventListener('pointerover', e => {
            const target = e.target.closest('a, button, [data-cursor]');
            const text = (target && target.dataset.cursor) || '';
            cursor.classList.toggle('is-hover', !!target);
            cursor.classList.toggle('has-label', !!text);
            label.textContent = text;
        });
        requestAnimationFrame(function follow() {
            cx += (x - cx) * 0.2;
            cy += (y - cy) * 0.2;
            cursor.style.transform = `translate3d(${cx}px, ${cy}px, 0)`;
            requestAnimationFrame(follow);
        });

        $$('[data-magnetic]').forEach(el => {
            el.addEventListener('pointermove', e => {
                const r = el.getBoundingClientRect();
                el.style.translate = `${(e.clientX - r.left - r.width / 2) * 0.25}px ${(e.clientY - r.top - r.height / 2) * 0.35}px`;
            });
            el.addEventListener('pointerleave', () => { el.style.translate = ''; });
        });

        $$('[data-tilt]').forEach(el => {
            el.addEventListener('pointermove', e => {
                const r = el.getBoundingClientRect();
                const px = (e.clientX - r.left) / r.width;
                const py = (e.clientY - r.top) / r.height;
                el.style.setProperty('--rx', `${(0.5 - py) * 10}deg`);
                el.style.setProperty('--ry', `${(px - 0.5) * 12}deg`);
                el.style.setProperty('--gx', `${px * 100}%`);
                el.style.setProperty('--gy', `${py * 100}%`);
            });
            el.addEventListener('pointerleave', () => {
                el.style.setProperty('--rx', '0deg');
                el.style.setProperty('--ry', '0deg');
            });
        });
    }

    /* ---- About: flip card ---- */
    const flip = $('#flipCard');
    flip.addEventListener('click', () => flip.setAttribute('aria-pressed', flip.classList.toggle('is-flipped')));

    /* ---- Hero: particle portrait (raw WebGL) ----
       Each bright pixel of portrait.js becomes a point. The vertex shader assembles them on load,
       pushes them away from the pointer, turns the portrait toward it and scatters it on scroll. */
    (function heroPortrait() {
        const hero = $('#hero');
        const canvas = $('#heroCanvas');
        const gl = window.PORTRAIT_SRC && canvas.getContext('webgl', { antialias: false });
        if (!gl) return; // the plain photo stays as the fallback

        const VS = `
            attribute vec3 aPos;    // x, y, brightness
            attribute vec3 aDir;    // random direction for the intro and the scroll scatter
            attribute float aDelay;
            uniform float uTime, uIntro, uScatter, uHover, uAspect, uSize;
            uniform vec2 uMouse, uRot;
            uniform vec3 uView;     // portrait centre (NDC) and height (NDC units)
            varying float vLum, vAlpha;
            void main() {
                vec3 p = vec3(aPos.xy, aPos.z * 0.14);
                p.z += sin(p.y * 10.0 + uTime * 1.3) * 0.012 + sin(p.x * 8.0 - uTime) * 0.008;
                vec2 d = p.xy - uMouse;
                float f = smoothstep(0.1, 0.0, length(d)) * uHover;
                p.xy += normalize(d + 0.0001) * f * 0.025;
                p.z += f * 0.2;
                float t = clamp(uIntro - aDelay, 0.0, 1.0);
                t = 1.0 - pow(1.0 - t, 3.0);
                p = mix(aDir * 1.2, p, t) + aDir * uScatter * 1.1;
                float cy = cos(uRot.y), sy = sin(uRot.y), cx = cos(uRot.x), sx = sin(uRot.x);
                p = vec3(cy * p.x + sy * p.z, p.y, -sy * p.x + cy * p.z);
                p = vec3(p.x, cx * p.y - sx * p.z, sx * p.y + cx * p.z);
                float persp = 3.0 / max(3.0 - p.z, 0.6);
                vec2 ndc = p.xy * persp * uView.z;
                gl_Position = vec4(ndc.x / uAspect + uView.x, ndc.y + uView.y, 0.0, 1.0);
                gl_PointSize = uSize * persp;
                vLum = aPos.z;
                vAlpha = t * (1.0 - uScatter * 0.85) * smoothstep(-0.52, -0.22, aPos.y);
            }`;
        const FS = `
            precision mediump float;
            varying float vLum, vAlpha;
            void main() {
                float d = length(gl_PointCoord - 0.5);
                if (d > 0.5) discard;
                vec3 deep = vec3(0.76, 0.33, 0.29), amber = vec3(0.91, 0.66, 0.29), cream = vec3(0.98, 0.95, 0.9);
                vec3 col = vLum < 0.55 ? mix(deep, amber, vLum / 0.55) : mix(amber, cream, (vLum - 0.55) / 0.45);
                float a = smoothstep(0.5, 0.1, d) * vAlpha * (0.3 + 0.7 * vLum);
                gl_FragColor = vec4(col * a, a);
            }`;

        const program = gl.createProgram();
        [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, FS]].forEach(([type, src]) => {
            const shader = gl.createShader(type);
            gl.shaderSource(shader, src);
            gl.compileShader(shader);
            gl.attachShader(program, shader);
        });
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
        gl.useProgram(program);
        const u = {};
        ['uTime', 'uIntro', 'uScatter', 'uHover', 'uAspect', 'uSize', 'uMouse', 'uRot', 'uView']
            .forEach(name => { u[name] = gl.getUniformLocation(program, name); });

        const img = new Image();
        img.onload = () => {
            const w = img.width, h = img.height;
            const c = document.createElement('canvas');
            c.width = w;
            c.height = h;
            const ctx = c.getContext('2d');
            ctx.drawImage(img, 0, 0);
            const px = ctx.getImageData(0, 0, w, h).data;
            const step = innerWidth < 768 ? 2 : 1; // fewer points on phones
            const data = [];
            for (let y = 0; y < h; y += step) {
                for (let x = 0; x < w; x += step) {
                    const lum = px[(y * w + x) * 4] / 255;
                    if (lum < 0.06) continue; // removed backdrop
                    const a = Math.random() * Math.PI * 2, z = Math.random() * 2 - 1, r = 0.5 + Math.random();
                    const s = Math.sqrt(1 - z * z) * r;
                    data.push((x / w - 0.5) * (w / h), 0.5 - y / h, lum,
                        Math.cos(a) * s, Math.sin(a) * s, z * r,
                        (y / h) * 0.6 + Math.random() * 0.4); // assembles top to bottom
                }
            }
            start(new Float32Array(data), data.length / 7, h / step);
        };
        img.src = window.PORTRAIT_SRC;

        function start(points, count, rows) {
            gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
            gl.bufferData(gl.ARRAY_BUFFER, points, gl.STATIC_DRAW);
            [['aPos', 3, 0], ['aDir', 3, 12], ['aDelay', 1, 24]].forEach(([name, size, offset]) => {
                const loc = gl.getAttribLocation(program, name);
                gl.enableVertexAttribArray(loc);
                gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 28, offset);
            });
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.ONE, gl.ONE); // additive glow
            gl.clearColor(0, 0, 0, 0);
            hero.classList.add('gl-ready');

            // Must match the hero media query in index.css
            const wide = matchMedia('(min-width: 768px) and (orientation: landscape)');
            let view = [0, 0, 1], aspect = 1, lastW = 0, lastH = 0;
            function resize() {
                const W = hero.clientWidth, H = hero.clientHeight;
                if (W === lastW && H === lastH) return; // mobile URL bar show/hide
                lastW = W;
                lastH = H;
                const dpr = Math.min(devicePixelRatio || 1, 2);
                canvas.width = Math.round(W * dpr);
                canvas.height = Math.round(H * dpr);
                gl.viewport(0, 0, canvas.width, canvas.height);
                let ph, px, py; // portrait height and centre, in CSS px
                if (wide.matches) { ph = H * 0.82; px = W * 0.74; py = H * 0.5; }
                else { ph = Math.min(W, 480); px = W / 2; py = 76 + ph / 2; }
                aspect = W / H;
                view = [px / W * 2 - 1, 1 - py / H * 2, ph / H * 2];
                gl.uniform3f(u.uView, view[0], view[1], view[2]);
                gl.uniform1f(u.uAspect, aspect);
                gl.uniform1f(u.uSize, ph / rows * 1.25 * dpr);
                kick();
            }

            const mouse = [0, 0], mouseTarget = [0, 0], rot = [0, 0], rotTarget = [0, 0];
            let hover = 0, hoverTarget = 0, scatter = 0;
            hero.addEventListener('pointermove', e => {
                const r = canvas.getBoundingClientRect();
                const nx = (e.clientX - r.left) / r.width * 2 - 1;
                const ny = 1 - (e.clientY - r.top) / r.height * 2;
                mouseTarget[0] = (nx - view[0]) * aspect / view[2];
                mouseTarget[1] = (ny - view[1]) / view[2];
                rotTarget[0] = -ny * 0.18;
                rotTarget[1] = nx * 0.32;
                hoverTarget = 1;
            });
            hero.addEventListener('pointerleave', () => {
                hoverTarget = 0;
                rotTarget[0] = rotTarget[1] = 0;
            });

            let pending = 0, visible = true;
            const kick = () => { if (!pending) pending = requestAnimationFrame(frame); };
            const t0 = performance.now() + (reduced ? -1e5 : 950); // the intro waits for the curtain
            function frame(now) {
                pending = 0;
                const t = (now - t0) / 1000;
                hover += (hoverTarget - hover) * 0.08;
                for (let i = 0; i < 2; i++) {
                    // jump straight to the pointer when the effect is off, so it never sweeps in from afar
                    mouse[i] = hover < 0.02 ? mouseTarget[i] : mouse[i] + (mouseTarget[i] - mouse[i]) * 0.2;
                    rot[i] += (rotTarget[i] - rot[i]) * 0.05;
                }
                scatter += (clamp(scrollY / (hero.offsetHeight * 0.85), 0, 1) - scatter) * 0.15;
                const sway = reduced ? 0 : 1;
                gl.uniform1f(u.uTime, reduced ? 0 : t);
                gl.uniform1f(u.uIntro, clamp(t / 1.1, 0, 2));
                gl.uniform1f(u.uScatter, scatter);
                gl.uniform1f(u.uHover, hover);
                gl.uniform2f(u.uMouse, mouse[0], mouse[1]);
                gl.uniform2f(u.uRot, rot[0] + Math.sin(t * 0.5) * 0.04 * sway,
                    rot[1] + Math.sin(t * 0.3) * 0.12 * sway + scatter * 0.9);
                gl.clear(gl.COLOR_BUFFER_BIT);
                gl.drawArrays(gl.POINTS, 0, count);
                if (visible && !reduced) kick(); // reduced motion: one still frame per resize
            }

            resize();
            addEventListener('resize', resize);
            new IntersectionObserver(([e]) => {
                visible = e.isIntersecting;
                if (visible) kick();
            }).observe(hero);
        }
    })();

    /* ---- Skills: drag-to-spin 3D sphere of chips ---- */
    (function skillSphere() {
        const box = $('#skillSphere');
        if (!box || reduced) return; // stays a plain chip cloud
        const items = [...box.children];
        const n = items.length;
        // Fibonacci sphere: evenly spread points
        const pts = items.map((_, i) => {
            const y = 1 - (2 * i + 1) / n, r = Math.sqrt(1 - y * y), a = i * 2.39996;
            return [Math.cos(a) * r, y, Math.sin(a) * r];
        });
        box.classList.add('is-3d');

        let radius = 0;
        const size = () => { radius = box.clientWidth * 0.4; };
        size();
        addEventListener('resize', size);

        const idle = 0.0035;
        let ax = -0.3, ay = 0, vx = 0, vy = idle, dragging = false, lastX = 0, lastY = 0;
        box.addEventListener('pointerdown', e => {
            dragging = true;
            lastX = e.clientX;
            lastY = e.clientY;
            box.setPointerCapture(e.pointerId);
        });
        box.addEventListener('pointermove', e => {
            if (!dragging) return;
            vy = (e.clientX - lastX) * 0.004;
            vx = -(e.clientY - lastY) * 0.004;
            lastX = e.clientX;
            lastY = e.clientY;
        });
        const stop = () => { dragging = false; };
        box.addEventListener('pointerup', stop);
        box.addEventListener('pointercancel', stop);

        let on = false, pending = 0;
        const kick = () => { if (!pending) pending = requestAnimationFrame(tick); };
        function tick() {
            pending = 0;
            if (!on) return;
            if (!dragging) { // ease back to a slow idle spin
                vy += (idle - vy) * 0.02;
                vx += (0 - vx) * 0.02;
            }
            ay += vy;
            ax += vx;
            const cosY = Math.cos(ay), sinY = Math.sin(ay), cosX = Math.cos(ax), sinX = Math.sin(ax);
            items.forEach((el, i) => {
                const [x0, y0, z0] = pts[i];
                const x1 = cosY * x0 + sinY * z0, z1 = -sinY * x0 + cosY * z0;
                const y2 = cosX * y0 - sinX * z1, z2 = sinX * y0 + cosX * z1; // z2: -1 back … 1 front
                el.style.transform = `translate(-50%, -50%) translate3d(${x1 * radius}px, ${y2 * radius}px, 0) scale(${0.6 + 0.4 * (z2 + 1) / 2})`;
                el.style.opacity = 0.22 + 0.78 * (z2 + 1) / 2;
                el.style.zIndex = Math.round((z2 + 1) * 50);
            });
            kick();
        }
        new IntersectionObserver(([e]) => {
            on = e.isIntersecting;
            if (on) kick();
        }).observe(box);
    })();

    /* ---- Experience: timeline line draws as you scroll ---- */
    const timeline = $('#timeline');
    const timelineFill = $('#timelineFill');
    function fillTimeline() {
        const r = timeline.getBoundingClientRect();
        timelineFill.style.transform = `scaleY(${clamp((innerHeight * 0.7 - r.top) / r.height, 0, 1)})`;
    }

    /* ---- Projects: vertical scroll drives a horizontal track (large screens) ---- */
    const projects = $('#projects');
    const track = $('#projectsTrack');
    const bar = $('#projectsBar');
    const counter = $('#projectsCount');
    const cardCount = $$('.project-card', track).length;
    const pinQuery = matchMedia('(min-width: 1024px) and (min-height: 680px)');
    let travel = 0;
    function layoutProjects() {
        const pin = pinQuery.matches && !reduced;
        projects.classList.toggle('is-pinned', pin);
        travel = pin ? Math.max(0, track.scrollWidth - innerWidth) : 0;
        projects.style.height = pin ? `${innerHeight + travel}px` : '';
        if (!pin) track.style.transform = '';
    }
    function scrollProjects() {
        if (!travel) return;
        const p = clamp(-projects.getBoundingClientRect().top / travel, 0, 1);
        track.style.transform = `translate3d(${-p * travel}px, 0, 0)`;
        bar.style.transform = `scaleX(${p})`;
        counter.textContent = String(Math.min(cardCount, Math.floor(p * cardCount) + 1)).padStart(2, '0');
    }

    /* ---- Life: polaroid deck (tap, drag/fling, or the button sends the top photo to the back) ---- */
    (function polaroidDeck() {
        const deck = $('#deck');
        let cards = [...deck.children];
        const layout = () => cards.forEach((card, i) => {
            card.style.setProperty('--i', i);
            card.style.zIndex = cards.length - i;
        });
        let busy = false;
        function sendBack(dir = 1) {
            if (busy) return;
            busy = true;
            const top = cards[0];
            top.style.transform = '';
            top.style.setProperty('--fly', dir);
            top.classList.add('is-leaving');
            setTimeout(() => {
                cards.push(cards.shift());
                top.classList.remove('is-leaving');
                layout();
                busy = false;
            }, 420);
        }
        $('#deckNext').addEventListener('click', () => sendBack(1));

        let startX = 0, startY = 0, dx = 0, dy = 0, dragging = false;
        deck.addEventListener('pointerdown', e => {
            if (busy || e.target.closest('.polaroid') !== cards[0]) return;
            dragging = true;
            startX = e.clientX;
            startY = e.clientY;
            dx = dy = 0;
            cards[0].setPointerCapture(e.pointerId);
            cards[0].classList.add('is-dragging');
        });
        deck.addEventListener('pointermove', e => {
            if (!dragging) return;
            dx = e.clientX - startX;
            dy = e.clientY - startY;
            cards[0].style.transform = `translate3d(${dx}px, ${dy}px, 0) rotate(${dx * 0.06}deg)`;
        });
        // pointercancel = the browser took over (e.g. a vertical scroll on a phone): just put the card back
        const release = e => {
            if (!dragging) return;
            dragging = false;
            const top = cards[0];
            top.classList.remove('is-dragging');
            const up = e.type === 'pointerup';
            if (up && (Math.hypot(dx, dy) < 6 || Math.abs(dx) > 90)) sendBack(dx < 0 ? -1 : 1);
            else top.style.transform = '';
        };
        deck.addEventListener('pointerup', release);
        deck.addEventListener('pointercancel', release);
    })();

    /* ---- Marquee speeds up while you scroll ---- */
    const marqueeTrack = $('#marqueeTrack');
    let marqueeRate = 1, marqueeEasing = false;
    function boostMarquee(dy) {
        const anim = !reduced && marqueeTrack.getAnimations && marqueeTrack.getAnimations()[0];
        if (!anim) return;
        marqueeRate = Math.min(6, marqueeRate + Math.abs(dy) * 0.02);
        if (marqueeEasing) return;
        marqueeEasing = true;
        requestAnimationFrame(function ease() {
            marqueeRate += (1 - marqueeRate) * 0.06;
            anim.playbackRate = marqueeRate;
            if (marqueeRate > 1.01) requestAnimationFrame(ease);
            else {
                anim.playbackRate = 1;
                marqueeEasing = false;
            }
        });
    }

    /* ---- Footer: local time in Quezon City ---- */
    const timeEl = $('#localTime');
    const timeFmt = new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' });
    const showTime = () => { timeEl.textContent = `${timeFmt.format(new Date())} local time`; };
    showTime();
    setInterval(showTime, 30000);

    /* ---- One rAF-throttled scroll handler ---- */
    const progress = $('#scrollProgress');
    let lastScroll = scrollY, ticking = false;
    function onScroll() {
        ticking = false;
        const y = scrollY;
        navbar.classList.toggle('scrolled', y > 50);
        progress.style.transform = `scaleX(${y / Math.max(1, document.documentElement.scrollHeight - innerHeight)})`;
        fillTimeline();
        scrollProjects();
        boostMarquee(y - lastScroll);
        lastScroll = y;
    }
    addEventListener('scroll', () => {
        if (!ticking) {
            ticking = true;
            requestAnimationFrame(onScroll);
        }
    }, { passive: true });
    addEventListener('resize', () => { layoutProjects(); onScroll(); });
    addEventListener('load', () => { layoutProjects(); onScroll(); });
    layoutProjects();
    onScroll();
})();
