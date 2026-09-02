// A pointerup action can expose a new target before the browser dispatches its
// compatibility click. Consume that click, regardless of where it lands.
export function createPointerClickGuard({ now = () => performance.now() } = {}) {
  let handledUntil = 0;

  return {
    startGesture() {
      // A deliberate next tap must work immediately, even if the previous
      // gesture never generated a compatibility click.
      handledUntil = 0;
    },
    markHandled() {
      handledUntil = now() + 1000;
    },
    consumeClick(event) {
      // Keyboard, assistive activation, and controller .click() are independent
      // of the handled pointer gesture.
      if (!event.detail && !event.pointerType) return false;
      const handled = now() < handledUntil;
      handledUntil = 0;
      return handled;
    }
  };
}
