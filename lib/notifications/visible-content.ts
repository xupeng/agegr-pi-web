import { notificationVisibleIntersection, type NotificationViewRect } from "./viewed-result";

/** Pixel evidence from answer payload, not a Markdown/toolbar container. */
export function isNotificationAnswerContentVisible(
  body: HTMLElement,
  root: HTMLElement,
  viewport: NotificationViewRect,
): boolean {
  const document = body.ownerDocument;
  const window = document.defaultView;
  if (!window || !root.contains(body) || body.closest("[inert], [aria-hidden='true']")) return false;
  const rootRect = root.getBoundingClientRect();
  const nonresult = "[data-notification-nonresult], .react-syntax-highlighter-line-number, script, style, [hidden]";
  const visible = (element: Element, rectangles: ArrayLike<DOMRect>) => {
    if (element.closest(nonresult)) return false;
    for (let ancestor: Element | null = element; ancestor; ancestor = ancestor.parentElement) {
      const style = window.getComputedStyle(ancestor);
      if (style.visibility !== "visible" || style.display === "none" || Number(style.opacity) === 0) return false;
    }
    return Array.from(rectangles).some((rect) => {
      const intersection = notificationVisibleIntersection(rect, rootRect, viewport);
      if (!intersection) return false;
      const hit = document.elementFromPoint((intersection.left + intersection.right) / 2, (intersection.top + intersection.bottom) / 2);
      return Boolean(hit && element.contains(hit));
    });
  };
  const walker = document.createTreeWalker(body, 4 /* NodeFilter.SHOW_TEXT */);
  let text: Node | null;
  while ((text = walker.nextNode())) {
    const parent = text.parentElement;
    const value = text.textContent ?? "";
    const start = value.search(/\S/);
    if (start < 0 || !parent || parent.closest(`${nonresult}, button, [role='button'], [aria-hidden='true'], svg`)) continue;
    const range = document.createRange();
    range.setStart(text, start);
    range.setEnd(text, value.trimEnd().length);
    if (visible(parent, range.getClientRects())) return true;
  }
  // Real image/diagram/math paint is payload too. A spinner, error string or
  // unrendered/broken image never supplies this evidence.
  return Array.from(body.querySelectorAll<Element>("img, [data-notification-result-content] svg, .katex-html"))
    .some((element) => {
      if (element instanceof window.HTMLImageElement && (!element.complete || element.naturalWidth === 0)) return false;
      return visible(element, element.getClientRects());
    });
}
