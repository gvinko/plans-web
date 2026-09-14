"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useFloorPlanStore } from "../store/floorPlanStore";
import { pixelToPlan, snapPoint, distance } from "../lib/coords";
import { pdfFileToImageDataUrl } from "../lib/pdfLoader";
import { Point2, Wall } from "../lib/types";

const CANVAS_PADDING = 40;

/** Plan-space origin, in canvas pixels, chosen the first time the user places anything. Kept local — plan-mm is what's persisted. */
function usePlanOrigin() {
  const ref = useRef<{ x: number; y: number } | null>(null);
  return ref;
}

function findNearestWallPoint(
  walls: Wall[],
  p: Point2
): { wall: Wall; distanceFromStart: number; point: Point2; distToWall: number } | null {
  let best: { wall: Wall; distanceFromStart: number; point: Point2; distToWall: number } | null = null;
  for (const w of walls) {
    const dx = w.end.x - w.start.x;
    const dy = w.end.y - w.start.y;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) continue;
    let t = ((p.x - w.start.x) * dx + (p.y - w.start.y) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const proj = { x: w.start.x + t * dx, y: w.start.y + t * dy };
    const d = distance(p, proj);
    if (!best || d < best.distToWall) {
      best = { wall: w, distanceFromStart: t * Math.sqrt(len2), point: proj, distToWall: d };
    }
  }
  return best;
}

export default function BlueprintCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const bgImageRef = useRef<HTMLImageElement | null>(null);

  const doc = useFloorPlanStore((s) => s.doc);
  const tool = useFloorPlanStore((s) => s.tool);
  const setBackgroundImage = useFloorPlanStore((s) => s.setBackgroundImage);
  const setCalibration = useFloorPlanStore((s) => s.setCalibration);
  const addWall = useFloorPlanStore((s) => s.addWall);
  const addOpening = useFloorPlanStore((s) => s.addOpening);
  const selectedWallId = useFloorPlanStore((s) => s.selectedWallId);
  const setSelectedWall = useFloorPlanStore((s) => s.setSelectedWall);
  const setTool = useFloorPlanStore((s) => s.setTool);

  const planOriginPx = usePlanOrigin(); // canvas px that corresponds to plan (0,0)
  const [calibClicks, setCalibClicks] = useState<{ x: number; y: number }[]>([]);
  const [drawPoints, setDrawPoints] = useState<Point2[]>([]);
  const [cursorPlan, setCursorPlan] = useState<Point2 | null>(null);
  const [pendingOpening, setPendingOpening] = useState<{ type: "door" | "window" } | null>(null);

  // ── File upload ──────────────────────────────────────────────────────
  const onUpload = useCallback(
    async (file: File) => {
      if (file.type === "application/pdf") {
        const { dataUrl } = await pdfFileToImageDataUrl(file);
        setBackgroundImage(dataUrl);
      } else {
        const reader = new FileReader();
        reader.onload = () => setBackgroundImage(reader.result as string);
        reader.readAsDataURL(file);
      }
    },
    [setBackgroundImage]
  );

  useEffect(() => {
    if (!doc.backgroundImage) {
      bgImageRef.current = null;
      return;
    }
    const img = new Image();
    img.onload = () => {
      bgImageRef.current = img;
      draw();
    };
    img.src = doc.backgroundImage;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.backgroundImage]);

  // ── Coordinate helpers ───────────────────────────────────────────────
  const pxToClient = (e: React.MouseEvent): { x: number; y: number } => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const pxToPlan = (px: { x: number; y: number }): Point2 => {
    const mmPerPixel = doc.calibration.mmPerPixel ?? 5; // sane default before calibration
    if (!planOriginPx.current) planOriginPx.current = { x: CANVAS_PADDING, y: CANVAS_PADDING };
    return pixelToPlan(px, planOriginPx.current, mmPerPixel);
  };

  const planToPx = (p: Point2): { x: number; y: number } => {
    const mmPerPixel = doc.calibration.mmPerPixel ?? 5;
    const origin = planOriginPx.current ?? { x: CANVAS_PADDING, y: CANVAS_PADDING };
    return { x: origin.x + p.x / mmPerPixel, y: origin.y + p.y / mmPerPixel };
  };

  // ── Drawing ──────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#161a20";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (bgImageRef.current) {
      ctx.globalAlpha = 0.55;
      ctx.drawImage(bgImageRef.current, 0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 1;
    }

    // grid
    if (doc.snapToGrid && doc.calibration.mmPerPixel) {
      const stepPx = doc.gridSizeMm / doc.calibration.mmPerPixel;
      if (stepPx > 4) {
        ctx.strokeStyle = "rgba(255,255,255,0.06)";
        ctx.lineWidth = 1;
        for (let x = 0; x < canvas.width; x += stepPx) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, canvas.height);
          ctx.stroke();
        }
        for (let y = 0; y < canvas.height; y += stepPx) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(canvas.width, y);
          ctx.stroke();
        }
      }
    }

    // walls
    for (const w of doc.walls) {
      const a = planToPx(w.start);
      const b = planToPx(w.end);
      const isSelected = w.id === selectedWallId;
      ctx.strokeStyle = isSelected ? "#f2a65a" : "#7cc4ff";
      ctx.lineWidth = Math.max(2, w.thicknessMm / (doc.calibration.mmPerPixel ?? 5));
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();

      // openings
      for (const o of w.openings) {
        const dx = w.end.x - w.start.x;
        const dy = w.end.y - w.start.y;
        const len = Math.hypot(dx, dy) || 1;
        const t0 = (o.distanceFromStart - o.width / 2) / len;
        const t1 = (o.distanceFromStart + o.width / 2) / len;
        const p0 = planToPx({ x: w.start.x + dx * t0, y: w.start.y + dy * t0 });
        const p1 = planToPx({ x: w.start.x + dx * t1, y: w.start.y + dy * t1 });
        ctx.strokeStyle = o.type === "door" ? "#5be38c" : "#e3d15b";
        ctx.lineWidth = (ctx.lineWidth as number) + 3;
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();
      }
    }

    // in-progress wall polyline
    if (drawPoints.length > 0) {
      ctx.strokeStyle = "#f2a65a";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      const first = planToPx(drawPoints[0]);
      ctx.moveTo(first.x, first.y);
      for (const p of drawPoints.slice(1)) {
        const px = planToPx(p);
        ctx.lineTo(px.x, px.y);
      }
      if (cursorPlan) {
        const px = planToPx(cursorPlan);
        ctx.lineTo(px.x, px.y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // calibration markers
    calibClicks.forEach((c, i) => {
      ctx.fillStyle = "#f2a65a";
      ctx.beginPath();
      ctx.arc(c.x, c.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "12px sans-serif";
      ctx.fillText(i === 0 ? "A" : "B", c.x + 8, c.y - 8);
    });
    if (calibClicks.length === 2) {
      ctx.strokeStyle = "#f2a65a";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(calibClicks[0].x, calibClicks[0].y);
      ctx.lineTo(calibClicks[1].x, calibClicks[1].y);
      ctx.stroke();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, selectedWallId, drawPoints, cursorPlan, calibClicks]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    const resize = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
      draw();
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Interaction ──────────────────────────────────────────────────────
  const onClick = (e: React.MouseEvent) => {
    const px = pxToClient(e);

    if (tool === "calibrate") {
      const next = [...calibClicks, px].slice(-2);
      setCalibClicks(next);
      if (next.length === 2) {
        const realMm = Number(window.prompt("Real-world distance between these two points, in millimetres:", "1000"));
        if (realMm && realMm > 0) {
          setCalibration(next[0], next[1], realMm);
        }
        setCalibClicks([]);
      }
      return;
    }

    if (tool === "draw-wall") {
      const raw = pxToPlan(px);
      const anchor = drawPoints[drawPoints.length - 1];
      const snapped = anchor
        ? snapPoint(anchor, raw, {
            gridSizeMm: doc.gridSizeMm,
            snapToGrid: doc.snapToGrid,
            angleSnapDeg: doc.angleSnapDeg,
          })
        : raw;
      setDrawPoints((pts) => [...pts, snapped]);
      return;
    }

    if (tool === "place-door" || tool === "place-window") {
      const raw = pxToPlan(px);
      const hit = findNearestWallPoint(doc.walls, raw);
      if (hit && hit.distToWall < 30) {
        const isDoor = tool === "place-door";
        const margin = 20; // mm keep-away from wall ends
        const width = isDoor ? 800 : 900;
        const clamped = Math.max(margin + width / 2, Math.min(
          Math.hypot(hit.wall.end.x - hit.wall.start.x, hit.wall.end.y - hit.wall.start.y) - margin - width / 2,
          hit.distanceFromStart
        ));
        addOpening(hit.wall.id, {
          type: isDoor ? "door" : "window",
          distanceFromStart: clamped,
          width,
          height: isDoor ? 2000 : 1200,
          sillHeight: isDoor ? 0 : 900,
          headerHeight: isDoor ? 2000 : 2100,
        });
      }
      return;
    }

    if (tool === "select") {
      const raw = pxToPlan(px);
      const hit = findNearestWallPoint(doc.walls, raw);
      setSelectedWall(hit && hit.distToWall < 20 ? hit.wall.id : null);
      return;
    }
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (tool !== "draw-wall" || drawPoints.length === 0) return;
    const px = pxToClient(e);
    const raw = pxToPlan(px);
    const anchor = drawPoints[drawPoints.length - 1];
    const snapped = snapPoint(anchor, raw, {
      gridSizeMm: doc.gridSizeMm,
      snapToGrid: doc.snapToGrid,
      angleSnapDeg: doc.angleSnapDeg,
    });
    setCursorPlan(snapped);
  };

  const onDoubleClick = () => {
    if (tool === "draw-wall" && drawPoints.length >= 2) {
      for (let i = 0; i < drawPoints.length - 1; i++) {
        addWall(drawPoints[i], drawPoints[i + 1]);
      }
      setDrawPoints([]);
      setCursorPlan(null);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDrawPoints([]);
        setCalibClicks([]);
      }
      if (e.key === "Enter") onDoubleClick();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawPoints, tool]);

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden rounded-lg border border-white/10 bg-[#161a20]">
      <canvas
        ref={canvasRef}
        onClick={onClick}
        onMouseMove={onMouseMove}
        onDoubleClick={onDoubleClick}
        className="h-full w-full cursor-crosshair"
      />
      {!doc.backgroundImage && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <label className="pointer-events-auto flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-white/20 px-8 py-10 text-sm text-white/60 hover:border-white/40 hover:text-white/80">
            <span className="text-base font-medium text-white/80">Upload a floor plan</span>
            <span>PNG, JPG, or PDF — click to browse</span>
            <input
              type="file"
              accept="image/png,image/jpeg,application/pdf"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])}
            />
          </label>
        </div>
      )}
      {tool === "calibrate" && (
        <div className="absolute left-3 top-3 rounded bg-black/70 px-3 py-1.5 text-xs text-white/90">
          Click two points on the blueprint at a known real-world distance apart.
        </div>
      )}
      {tool === "draw-wall" && (
        <div className="absolute left-3 top-3 rounded bg-black/70 px-3 py-1.5 text-xs text-white/90">
          Click to place wall points · double-click or Enter to finish · Esc to cancel
        </div>
      )}
      {doc.calibration.mmPerPixel === null && doc.backgroundImage && tool !== "calibrate" && (
        <button
          onClick={() => setTool("calibrate")}
          className="absolute right-3 top-3 rounded bg-amber-500/90 px-3 py-1.5 text-xs font-medium text-black hover:bg-amber-400"
        >
          Calibrate scale first →
        </button>
      )}
    </div>
  );
}
