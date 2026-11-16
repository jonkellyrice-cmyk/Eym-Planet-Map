// Keeps the browser from zooming the page when the map is pinched. The map handles pinches itself (to zoom
// the globe or the model); on iPhone Safari the browser also takes a two-finger pinch as a page zoom unless
// it is told not to, and the two then fight. This refuses Safari's own pinch gestures and any touch with two
// or more fingers on the element, and leaves one finger alone, so turning, taps and double-taps are untouched.

/** Guard an element against page zoom (once; a second call does nothing). Returns whether it was applied. */
export function guardPageZoom(element) {
  if (!element?.addEventListener || element.dataset?.zoomGuard) return false;
  if (element.dataset) element.dataset.zoomGuard = "1";
  const refuse = (event) => event.preventDefault(), refuseTwoFingers = (event) => { if ((event.touches?.length ?? 0) > 1) event.preventDefault(); };
  // Cancelling needs a listener that is not passive (touch listeners are passive by default).
  for (const type of ["gesturestart", "gesturechange", "gestureend"]) element.addEventListener(type, refuse, { passive: false });
  for (const type of ["touchstart", "touchmove"]) element.addEventListener(type, refuseTwoFingers, { passive: false });
  return true;
}
