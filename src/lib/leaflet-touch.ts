import L from "leaflet";

/**
 * Leaflet cancels every touchmove of a drag or a pinch, to keep the page from
 * scrolling under the map. Once the browser has handed the gesture to a scroll
 * the event can no longer be cancelled, and Chrome logs an "[Intervention]
 * Ignored attempt to cancel a touchmove event" error for every one of them —
 * hundreds on a phone. The cancel does nothing then anyway, so for an event
 * that cannot be cancelled it is skipped; the drag and the pinch themselves go
 * on exactly as before. Imported for its effect by every map.
 */

type Handler = (this: unknown, e: Event) => void;

const PATCHED = Symbol.for("oh-crm.leaflet-touch");

const quiet = (handler: Handler): Handler =>
  function (this: unknown, e: Event) {
    if (e.type === "touchmove" && !e.cancelable) Object.defineProperty(e, "preventDefault", { value: () => {}, configurable: true });
    return handler.call(this, e);
  };

/** Once per prototype: a hot reload runs this module again. */
const patch = (proto: object, key: string) => {
  const target = proto as Record<string, Handler> & { [PATCHED]?: true };
  if (target[PATCHED]) return;
  target[key] = quiet(target[key]);
  target[PATCHED] = true;
};

// The private handlers Leaflet binds to the document's touchmove: a drag's (the map's and a marker's) and a pinch's.
patch(L.Draggable.prototype, "_onMove");
patch((L.Map as unknown as { TouchZoom: { prototype: object } }).TouchZoom.prototype, "_onTouchMove");
