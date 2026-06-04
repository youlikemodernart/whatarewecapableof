/* Homepage image strip. Even slivers; the full image reveals on top at its own
   sliver (no resize, no transition). Desktop = reveal on hover; touch = auto-cycle
   front→back while in view. Decorative; respects reduced-motion. */
(function () {
  var IMAGES = [
    {f:"s01.jpg",a:0.8},  {f:"s02.jpg",a:1.365},{f:"s03.jpg",a:0.885},{f:"s04.jpg",a:1.31},
    {f:"s05.jpg",a:0.75}, {f:"s06.jpg",a:0.667},{f:"s07.jpg",a:0.75}, {f:"s08.jpg",a:1.0},
    {f:"s09.jpg",a:1.73}, {f:"s10.jpg",a:0.8},  {f:"s11.jpg",a:1.25}, {f:"s12.jpg",a:0.8},
    {f:"s13.jpg",a:0.666},{f:"s14.jpg",a:1.389},{f:"s15.jpg",a:1.071}
  ];
  var BASE = "/assets/home/";
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
