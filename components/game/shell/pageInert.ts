// Makes the page behind the game inert while the game is on screen (Play to the return to the hero):
// nothing outside the stage can take a Tab stop, a click or a screen-reader visit, and the hero
// chrome that is still fading out cannot either. The stage itself (canvas, loading strip, failure
// dialog, game overlay) stays live. `restore()` puts back exactly what was there before, so a page
// that had its own aria-hidden or inert keeps it.
const SKIP = new Set(["SCRIPT", "STYLE", "LINK", "TEMPLATE", "NOSCRIPT", "META"]);

type Mark = { el: Element; inert: boolean; ariaHidden: string | null };

function mark(el: Element, marks: Mark[]): void {
  if (SKIP.has(el.tagName)) return;
  marks.push({ el, inert: el.hasAttribute("inert"), ariaHidden: el.getAttribute("aria-hidden") });
  el.setAttribute("inert", "");
  el.setAttribute("aria-hidden", "true");
}

/**
 * Inert every sibling on the way from `stage` up to the body, and the hero chrome (`[data-xfade]`)
 * inside the stage (found through its `[data-xfade]` elements). Returns the function that undoes it; calling it twice is harmless.
 */
export function inertPageBehind(stage: Element | null): () => void {
  const marks: Mark[] = [];
  if (stage) {
    // The hero chrome: each stage child that holds a `[data-xfade]` element (the title, the gesture lists, the hints).
    const chrome = new Set<Element>();
    stage.querySelectorAll("[data-xfade]").forEach((el) => {
      let top: Element = el;
      while (top.parentElement && top.parentElement !== stage) top = top.parentElement;
      if (top.parentElement === stage) chrome.add(top);
    });
    chrome.forEach((el) => mark(el, marks));
    for (let node: Element = stage; node.parentElement && node !== document.body; node = node.parentElement) {
      for (const sibling of Array.from(node.parentElement.children)) {
        if (sibling !== node) mark(sibling, marks);
      }
    }
  }
  let done = false;
  return () => {
    if (done) return;
    done = true;
    for (const m of marks) {
      if (!m.inert) m.el.removeAttribute("inert");
      if (m.ariaHidden === null) m.el.removeAttribute("aria-hidden");
      else m.el.setAttribute("aria-hidden", m.ariaHidden);
    }
  };
}
