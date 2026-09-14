"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useThree, ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Grid, Environment } from "@react-three/drei";
import * as THREE from "three";
import { useFloorPlanStore } from "../store/floorPlanStore";
import { buildBaseShell } from "../lib/modelBuilder";
import { buildRoofGeometry } from "../lib/roofGeometry";
import { FURNITURE_LIBRARY } from "../lib/furniture";
import { worldToMm, mmToWorld } from "../lib/coords";

const furnitureGeoCache = new Map<string, THREE.BufferGeometry>();
function getFurnitureGeometry(id: keyof typeof FURNITURE_LIBRARY): THREE.BufferGeometry {
  if (!furnitureGeoCache.has(id)) {
    furnitureGeoCache.set(id, FURNITURE_LIBRARY[id].build());
  }
  return furnitureGeoCache.get(id)!;
}

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

function GroundClickCatcher() {
  const tool = useFloorPlanStore((s) => s.tool);
  const activePrimitive = useFloorPlanStore((s) => s.activeFurniturePrimitive);
  const addFurniture = useFloorPlanStore((s) => s.addFurniture);

  if (tool !== "place-furniture" || !activePrimitive) return null;

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const p = e.point;
    addFurniture({
      primitiveId: activePrimitive,
      position: { x: worldToMm(p.x), y: worldToMm(p.z) },
      rotationDeg: 0,
      scale: 1,
    });
  };

  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, 0.001, 0]} onClick={onClick}>
      <planeGeometry args={[500, 500]} />
      <meshBasicMaterial visible={false} />
    </mesh>
  );
}

function WallShell({ doc }: { doc: ReturnType<typeof useFloorPlanStore.getState>["doc"] }) {
  const debouncedWalls = useDebounced(doc.walls, 250);
  const debouncedSlab = useDebounced(doc.print.slabThicknessMm, 250);

  const geometry = useMemo(() => {
    const fakeDoc = { ...doc, walls: debouncedWalls, print: { ...doc.print, slabThicknessMm: debouncedSlab } };
    const { brush } = buildBaseShell(fakeDoc);
    const geo = brush.geometry.clone();
    geo.computeVertexNormals();
    return geo;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedWalls, debouncedSlab]);

  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial color="#d8d2c4" roughness={0.85} metalness={0.02} />
    </mesh>
  );
}

function Roof({ doc }: { doc: ReturnType<typeof useFloorPlanStore.getState>["doc"] }) {
  const showRoof = useFloorPlanStore((s) => s.showRoof);
  const debouncedWalls = useDebounced(doc.walls, 250);
  const debouncedRoof = useDebounced(doc.roof, 250);

  const geometry = useMemo(() => {
    if (!debouncedRoof.enabled) return null;
    const { geometry } = buildRoofGeometry(debouncedWalls, debouncedRoof);
    return geometry.attributes.position?.count > 0 ? geometry : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedWalls, debouncedRoof]);

  if (!geometry || !showRoof) return null;
  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial color="#8a5a44" roughness={0.7} side={THREE.DoubleSide} />
    </mesh>
  );
}

function FurniturePieces() {
  const furniture = useFloorPlanStore((s) => s.doc.furniture);
  const showFurniture = useFloorPlanStore((s) => s.showFurniture);
  const selectedId = useFloorPlanStore((s) => s.selectedFurnitureId);
  const setSelectedFurniture = useFloorPlanStore((s) => s.setSelectedFurniture);

  if (!showFurniture) return null;

  return (
    <>
      {furniture.map((f) => {
        const geo = getFurnitureGeometry(f.primitiveId);
        return (
          <mesh
            key={f.id}
            geometry={geo}
            position={[mmToWorld(f.position.x), 0, mmToWorld(f.position.y)]}
            rotation={[0, (-f.rotationDeg * Math.PI) / 180, 0]}
            scale={f.scale}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedFurniture(f.id);
            }}
            castShadow
          >
            <meshStandardMaterial
              color={f.id === selectedId ? "#f2a65a" : "#7a92b5"}
              roughness={0.6}
            />
          </mesh>
        );
      })}
    </>
  );
}

export default function Viewport3D() {
  const doc = useFloorPlanStore((s) => s.doc);
  const showRoof = useFloorPlanStore((s) => s.showRoof);
  const toggleRoofVisibility = useFloorPlanStore((s) => s.toggleRoofVisibility);
  const toggleFurnitureVisibility = useFloorPlanStore((s) => s.toggleFurnitureVisibility);
  const showFurniture = useFloorPlanStore((s) => s.showFurniture);

  return (
    <div className="relative h-full w-full rounded-lg border border-white/10 bg-[#11151b]">
      <div className="absolute right-3 top-3 z-10 flex gap-2">
        <button
          onClick={toggleRoofVisibility}
          className="rounded bg-black/60 px-3 py-1.5 text-xs text-white/90 hover:bg-black/80"
        >
          {showRoof ? "Hide roof" : "Show roof"}
        </button>
        <button
          onClick={toggleFurnitureVisibility}
          className="rounded bg-black/60 px-3 py-1.5 text-xs text-white/90 hover:bg-black/80"
        >
          {showFurniture ? "Hide furniture" : "Show furniture"}
        </button>
      </div>
      <Canvas shadows camera={{ position: [12, 12, 12], fov: 45 }}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 15, 8]} intensity={1.1} castShadow />
        <Grid args={[100, 100]} cellColor="#2a2f38" sectionColor="#3a4150" fadeDistance={60} />
        <WallShell doc={doc} />
        <Roof doc={doc} />
        <FurniturePieces />
        <GroundClickCatcher />
        <OrbitControls makeDefault />
      </Canvas>
    </div>
  );
}
