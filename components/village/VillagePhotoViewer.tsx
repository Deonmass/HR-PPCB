'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';

const MIN_ZOOM = 1;
const MAX_ZOOM = 6;
const ZOOM_STEP = 0.25;

type Props = {
  src: string;
  alt?: string;
  caption?: string;
};

function fitSize(
  viewportW: number,
  viewportH: number,
  naturalW: number,
  naturalH: number,
) {
  if (!viewportW || !viewportH || !naturalW || !naturalH) {
    return { w: 0, h: 0 };
  }
  const scale = Math.min(viewportW / naturalW, viewportH / naturalH);
  return {
    w: Math.max(1, Math.floor(naturalW * scale)),
    h: Math.max(1, Math.floor(naturalH * scale)),
  };
}

export default function VillagePhotoViewer({
  src,
  alt = 'Village / Kimpese',
  caption = 'Village / Kimpese',
}: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const naturalRef = useRef({ w: 0, h: 0 });
  const fitRef = useRef({ w: 0, h: 0 });
  const zoomRef = useRef(1);
  const offsetRef = useRef({ x: 0, y: 0 });

  const [fit, setFit] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  const clampOffset = useCallback((nextZoom: number, x: number, y: number) => {
    const el = viewportRef.current;
    const { w: fitW, h: fitH } = fitRef.current;
    if (!el || nextZoom <= 1 || !fitW || !fitH) return { x: 0, y: 0 };
    const scaledW = fitW * nextZoom;
    const scaledH = fitH * nextZoom;
    const maxX = Math.max(0, (scaledW - el.clientWidth) / 2);
    const maxY = Math.max(0, (scaledH - el.clientHeight) / 2);
    return {
      x: Math.max(-maxX, Math.min(maxX, x)),
      y: Math.max(-maxY, Math.min(maxY, y)),
    };
  }, []);

  const commitView = useCallback((nextZoom: number, nextOffset: { x: number; y: number }) => {
    zoomRef.current = nextZoom;
    offsetRef.current = nextOffset;
    setZoom(nextZoom);
    setOffset(nextOffset);
  }, []);

  const recomputeFit = useCallback(() => {
    const el = viewportRef.current;
    const { w: nw, h: nh } = naturalRef.current;
    if (!el || !nw || !nh) return;
    const next = fitSize(el.clientWidth, el.clientHeight, nw, nh);
    fitRef.current = next;
    setFit(next);
    commitView(
      zoomRef.current,
      clampOffset(zoomRef.current, offsetRef.current.x, offsetRef.current.y),
    );
  }, [clampOffset, commitView]);

  const onImageLoad = () => {
    const img = imgRef.current;
    if (!img) return;
    naturalRef.current = {
      w: img.naturalWidth,
      h: img.naturalHeight,
    };
    recomputeFit();
  };

  useEffect(() => {
    const el = viewportRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => recomputeFit());
    ro.observe(el);
    return () => ro.disconnect();
  }, [recomputeFit]);

  useEffect(() => {
    commitView(1, { x: 0, y: 0 });
    naturalRef.current = { w: 0, h: 0 };
    fitRef.current = { w: 0, h: 0 };
    setFit({ w: 0, h: 0 });
    const img = imgRef.current;
    if (img?.complete && img.naturalWidth > 0) {
      naturalRef.current = { w: img.naturalWidth, h: img.naturalHeight };
      // defer to next frame so viewport has layout
      requestAnimationFrame(() => {
        const el = viewportRef.current;
        if (!el) return;
        const next = fitSize(el.clientWidth, el.clientHeight, img.naturalWidth, img.naturalHeight);
        fitRef.current = next;
        setFit(next);
      });
    }
  }, [src, commitView]);

  const applyZoom = useCallback(
    (next: number, pivot?: { x: number; y: number }) => {
      const el = viewportRef.current;
      const prev = zoomRef.current;
      const z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, next));
      if (z <= 1) {
        commitView(1, { x: 0, y: 0 });
        return;
      }
      if (!el || z === prev) {
        commitView(z, clampOffset(z, offsetRef.current.x, offsetRef.current.y));
        return;
      }
      if (pivot) {
        const rect = el.getBoundingClientRect();
        const cx = pivot.x - rect.left - rect.width / 2;
        const cy = pivot.y - rect.top - rect.height / 2;
        const ratio = z / prev;
        const off = offsetRef.current;
        commitView(
          z,
          clampOffset(z, cx - (cx - off.x) * ratio, cy - (cy - off.y) * ratio),
        );
      } else {
        commitView(z, clampOffset(z, offsetRef.current.x, offsetRef.current.y));
      }
    },
    [clampOffset, commitView],
  );

  const zoomIn = () => applyZoom(zoomRef.current + ZOOM_STEP);
  const zoomOut = () => applyZoom(zoomRef.current - ZOOM_STEP);
  const resetView = () => commitView(1, { x: 0, y: 0 });

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      applyZoom(zoomRef.current + delta, { x: e.clientX, y: e.clientY });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [applyZoom]);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (zoomRef.current <= 1 && e.button === 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      originX: offsetRef.current.x,
      originY: offsetRef.current.y,
    };
    setDragging(true);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag?.active) return;
    const next = clampOffset(
      zoomRef.current,
      drag.originX + (e.clientX - drag.startX),
      drag.originY + (e.clientY - drag.startY),
    );
    offsetRef.current = next;
    setOffset(next);
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current?.active) return;
    dragRef.current.active = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    setDragging(false);
  };

  const pct = Math.round(zoom * 100);

  return (
    <figure className="village-photo-figure">
      <div className="village-photo-toolbar">
        <button type="button" className="btn btn-secondary btn-sm" onClick={zoomOut} disabled={zoom <= MIN_ZOOM} title="Zoom arrière">
          −
        </button>
        <span className="village-photo-zoom-label">{pct}%</span>
        <button type="button" className="btn btn-secondary btn-sm" onClick={zoomIn} disabled={zoom >= MAX_ZOOM} title="Zoom avant">
          +
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={resetView} disabled={zoom === 1 && offset.x === 0 && offset.y === 0} title="Réinitialiser">
          Reset
        </button>
        <span className="village-photo-hint">Molette = zoom · Glisser = déplacer · Double-clic = zoom/reset</span>
      </div>

      <div
        ref={viewportRef}
        className={`village-photo-viewport${dragging ? ' is-dragging' : ''}${zoom > 1 ? ' is-zoomed' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={(e) => {
          if (zoomRef.current > 1) resetView();
          else applyZoom(2.5, { x: e.clientX, y: e.clientY });
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          className="village-photo-img"
          draggable={false}
          onLoad={onImageLoad}
          style={{
            width: fit.w ? `${fit.w}px` : 'auto',
            height: fit.h ? `${fit.h}px` : 'auto',
            maxWidth: '100%',
            maxHeight: '100%',
            transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${zoom})`,
          }}
        />
      </div>
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  );
}
