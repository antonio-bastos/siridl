import L from "leaflet";

/**
 * Telemetry beacon pins rendered onto a single Leaflet Canvas pane.
 */

export const PIN_PANE = "siri-pins";

export interface PinLook extends L.PathOptions {
  /** At rest, as CSS. */
  pinColor: string;
  /** While hovered, as CSS. */
  pinHotColor: string;
  pinHot: boolean;
  /** Optional rank/index number displayed inside the beacon. */
  pinNumber?: number;
}

const PLAIN = { w: 28, h: 34, tooltipY: -30 };
const RANKED = { w: 34, h: 40, tooltipY: -36 };
const HOT_SCALE = 1.24;
const PAD = 8;
const STROKE = "var(--card)";

type PinLayer = L.CircleMarker & {
  options: Partial<PinLook>;
  _point: L.Point;
  _pxBounds: L.Bounds;
  _order?: DrawOrder;
};
type DrawOrder = { layer: PinLayer; prev: DrawOrder | null; next: DrawOrder | null };

interface CanvasInternals {
  _initPath(layer: L.Path): void;
  _addPath(layer: L.Path): void;
  _updateStyle(layer: L.Path): void;
  _draw(): void;
  _redraw(): void;
}
const base = L.Canvas.prototype as unknown as CanvasInternals;

const shapeOf = (options: Partial<PinLook>) => (options.pinNumber === undefined ? PLAIN : RANKED);

const rankOf = (layer: PinLayer) => {
  const { pinHot, pinNumber } = layer.options;
  if (pinHot) return 3e6;
  if (pinNumber !== undefined) return 2e6 - pinNumber;
  return -layer.getLatLng().lat;
};

function pinBounds(this: PinLayer) {
  const half = (RANKED.w * HOT_SCALE) / 2 + PAD;
  this._pxBounds = new L.Bounds(
    this._point.subtract([half, RANKED.h * HOT_SCALE + PAD]),
    this._point.add([half, PAD]),
  );
}

function pinContains(this: PinLayer, p: L.Point) {
  const { w, h } = shapeOf(this.options);
  return Math.abs(p.x - this._point.x) <= w / 2 + 2 && p.y <= this._point.y + 2 && p.y >= this._point.y - h;
}

function pinTooltipAnchor(this: PinLayer) {
  return L.point(0, shapeOf(this.options).tooltipY);
}

type Sprite = { image: HTMLCanvasElement; dx: number; dy: number; w: number; h: number };

export class PinCanvas extends L.Canvas {
  declare private _ctx: CanvasRenderingContext2D;
  declare private _drawing: boolean;
  declare private _drawFirst: DrawOrder | null;
  declare private _drawLast: DrawOrder | null;
  private sprites = new Map<string, Sprite>();
  private colors = new Map<string, string>();
  private probe: HTMLElement | null = null;
  private font = "sans-serif";
  private unsorted = false;
  private themeWatch: MutationObserver | null = null;

  constructor() {
    super({ pane: PIN_PANE });
  }

  onAdd(map: L.Map) {
    if (!map.getPane(PIN_PANE)) {
      const pane = map.createPane(PIN_PANE);
      pane.style.zIndex = "590";
      pane.classList.add("siri-pins-pane");
    }
    super.onAdd(map);
    this.font = getComputedStyle(map.getContainer()).fontFamily || this.font;
    this.themeWatch = new MutationObserver(() => {
      this.colors.clear();
      this.sprites.clear();
      if (this._ctx && this._map) base._redraw.call(this);
    });
    this.themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return this;
  }

  onRemove(map: L.Map) {
    this.themeWatch?.disconnect();
    this.themeWatch = null;
    this.probe?.remove();
    this.probe = null;
    return super.onRemove(map);
  }

  _initPath(layer: L.Path) {
    base._initPath.call(this, layer);
    Object.assign(layer, {
      _updateBounds: pinBounds,
      _containsPoint: pinContains,
      _getTooltipAnchor: pinTooltipAnchor,
    });
  }

  _addPath(layer: L.Path) {
    base._addPath.call(this, layer);
    this.unsorted = true;
  }

  _updateStyle(layer: L.Path) {
    base._updateStyle.call(this, layer);
    this.unsorted = true;
  }

  _redraw() {
    if (!this._ctx || !this._map) return;
    base._redraw.call(this);
  }

  _draw() {
    if (!this._ctx || !this._map) return;
    if (this.unsorted) this.sort();
    base._draw.call(this);
  }

  _updateCircle(layer: PinLayer) {
    if (!this._ctx || !this._drawing || (layer as unknown as { _empty(): boolean })._empty()) return;
    const sprite = this.spriteOf(layer.options);
    const m = L.Browser.retina ? 2 : 1;
    const x = Math.round((layer._point.x + sprite.dx) * m) / m;
    const y = Math.round((layer._point.y + sprite.dy) * m) / m;
    this._ctx.globalAlpha = 1;
    this._ctx.drawImage(sprite.image, x, y, sprite.w, sprite.h);
  }

  private sort() {
    this.unsorted = false;
    const layers: PinLayer[] = [];
    for (let order = this._drawFirst; order; order = order.next) layers.push(order.layer);
    layers.sort((a, b) => rankOf(a) - rankOf(b));
    let prev: DrawOrder | null = null;
    for (const layer of layers) {
      const order = layer._order!;
      order.prev = prev;
      order.next = null;
      if (prev) prev.next = order;
      else this._drawFirst = order;
      prev = order;
    }
    this._drawLast = prev;
  }

  private colorOf(css: string) {
    let color = this.colors.get(css);
    if (color === undefined) {
      if (!this.probe) {
        this.probe = document.createElement("span");
        this.probe.hidden = true;
        this._map.getContainer().appendChild(this.probe);
      }
      this.probe.style.color = css;
      color = getComputedStyle(this.probe).color;
      this.colors.set(css, color);
    }
    return color;
  }

  private spriteOf(look: Partial<PinLook>) {
    const fill = this.colorOf((look.pinHot ? look.pinHotColor : look.pinColor) ?? "var(--primary)");
    const stroke = this.colorOf(STROKE);
    const key = `${fill}|${stroke}|${look.pinNumber ?? ""}|${look.pinHot ? 1 : 0}`;
    let sprite = this.sprites.get(key);
    if (!sprite) {
      sprite = this.drawSprite(fill, stroke, look.pinNumber, !!look.pinHot);
      this.sprites.set(key, sprite);
    }
    return sprite;
  }

  private drawSprite(fill: string, stroke: string, number: number | undefined, hot: boolean): Sprite {
    const shape = number === undefined ? PLAIN : RANKED;
    const k = hot ? HOT_SCALE : 1;
    const w = shape.w * k + 2 * PAD;
    const h = shape.h * k + 2 * PAD;
    const m = L.Browser.retina ? 2 : 1;

    const image = document.createElement("canvas");
    image.width = Math.ceil(w * m);
    image.height = Math.ceil(h * m);
    const ctx = image.getContext("2d")!;
    ctx.scale(m, m);

    const cx = PAD + (shape.w * k) / 2;
    const tipY = PAD + shape.h * k;
    const r = ((shape.w - 4) * k) / 2;
    const headY = tipY - r - 6 * k;

    if (hot) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, headY, r + 5 * k, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.globalAlpha = 0.24;
      ctx.fill();
      ctx.restore();
    }

    const drawBeaconPath = () => {
      ctx.beginPath();
      ctx.arc(cx, headY, r, Math.PI * 0.68, Math.PI * 0.32, false);
      ctx.lineTo(cx, tipY);
      ctx.closePath();
    };

    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.32)";
    ctx.shadowOffsetY = 2 * m;
    ctx.shadowBlur = 4 * m;
    drawBeaconPath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.restore();

    drawBeaconPath();
    ctx.lineWidth = 2.2 * k;
    ctx.strokeStyle = stroke;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, headY, r - 2.5 * k, 0, Math.PI * 2);
    ctx.lineWidth = 1.2 * k;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
    ctx.stroke();

    if (number !== undefined) {
      ctx.fillStyle = "#ffffff";
      ctx.font = `700 ${Math.round((number < 10 ? 13 : 11) * k)}px ${this.font}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(number), cx, headY + 0.5);
    } else {
      ctx.beginPath();
      ctx.arc(cx, headY, 4.2 * k, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();

      ctx.beginPath();
      ctx.arc(cx, headY, 2.1 * k, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
    }

    return { image, dx: -cx, dy: -tipY, w, h };
  }
}
