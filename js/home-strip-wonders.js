/* Homepage image strip — WONDERS variant (/alt/). Even slivers; the full image
   reveals on top at its own sliver (no resize, no transition). Desktop = reveal on
   hover; touch = auto-cycle front→back while in view. Decorative; respects
   reduced-motion. Logic identical to js/home-strip.js — only IMAGES + BASE differ. */
(function () {
  var IMAGES = [
    {f:"w01.jpg",a:1.501},{f:"w02.jpg",a:1.43}, {f:"w03.jpg",a:1.554},{f:"w04.jpg",a:1.0},
    {f:"w05.jpg",a:0.8},  {f:"w06.jpg",a:1.333},{f:"w07.jpg",a:1.294},{f:"w08.jpg",a:1.499},
    {f:"w09.jpg",a:1.528},{f:"w10.jpg",a:1.291},{f:"w11.jpg",a:1.505},{f:"w12.jpg",a:0.666},
    {f:"w13.jpg",a:1.25}, {f:"w14.jpg",a:1.503}
  ];
  var BASE = "/assets/home-wonders/";
  var strip = document.getElementById("home-strip");
  if (!strip) return;

  IMAGES.forEach(function (im) {
    var p = document.createElement("div");
    p.className = "hs-panel";
    p.setAttribute("data-a", im.a);
    p.innerHTML =
      '<img class="hs-slice" src="' + BASE + im.f + '" alt="" decoding="async">' +
      '<img class="hs-full"  src="' + BASE + im.f + '" alt="" aria-hidden="true">';
    strip.appendChild(p);
  });
  var panels = [].slice.call(strip.querySelectorAll(".hs-panel"));

  function openIdx(i) {
    var p = panels[i]; if (!p) return;
    var H = strip.clientHeight, W = strip.clientWidth, a = parseFloat(p.getAttribute("data-a")) || 1;
    var w = Math.min(Math.round(H * a), W);
    var full = p.querySelector(".hs-full");
    var leftInStrip = Math.max(0, Math.min(p.offsetLeft, W - w)); /* at-sliver, clamped on-screen */
    full.style.width = w + "px";
    full.style.left = (leftInStrip - p.offsetLeft) + "px";
    for (var k = 0; k < panels.length; k++) panels[k].classList.remove("is-open");
    p.classList.add("is-open");
  }
  function closeAll() { for (var k = 0; k < panels.length; k++) panels[k].classList.remove("is-open"); }

  var isTouch = window.matchMedia("(hover: none) and (pointer: coarse)").matches;
  var reduce  = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (isTouch) {
    var cur = 0, timer = null;
    function tick() { openIdx(cur); cur = (cur + 1) % panels.length; }
    function start() { if (timer || reduce) return; tick(); timer = setInterval(tick, 1600); }
    function stop()  { if (timer) { clearInterval(timer); timer = null; } }
    if (reduce) { openIdx(0); }
    else if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (es) { es[0].isIntersecting ? start() : stop(); }, { threshold: 0.25 }).observe(strip);
    } else { start(); }
  } else {
    panels.forEach(function (p, i) { p.addEventListener("mouseenter", function () { openIdx(i); }); });
    strip.addEventListener("mouseleave", closeAll);
  }

  window.addEventListener("resize", function () {
    var open = strip.querySelector(".hs-panel.is-open");
    if (open) openIdx(panels.indexOf(open));
  });
})();
