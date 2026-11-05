import { useState, useEffect, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Sky, Grid, Html } from "@react-three/drei";
import * as THREE from "three";
import {
  Save, Trash2, Fan, Droplets, Utensils,
  Zap, BoxSelect, ArrowLeftRight, DoorOpen,
  Columns, Hammer, MousePointer2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useLanguage } from "@/contexts/LanguageContext";

// --- TÍPUSOK ---
export type ItemType =
  | "fan" | "wall-inlet" | "ceiling-inlet"
  | "feed-line" | "drink-line" | "feed-motor"
  | "sensor" | "heater" | "door" | "pillar";

type EditMode = "build" | "furnish";

export interface BarnItem {
  id: string;
  type: ItemType;
  x: number; y: number; z: number;
  w: number; h: number; rotation: number;
  name: string;
  props: Record<string, any>;
}

export interface WallSegment {
  id: string;
  start: [number, number, number];
  end:   [number, number, number];
  height: number;
  thickness: number;
}

type Snapshot = { items: BarnItem[]; walls: WallSegment[] };

const TOOLBOX_DEF = [
  { type: "feed-line",  icon: Utensils,       defaultW: 10,  defaultH: 0.6, defaultY: 0,   props: { panCount: 20 } },
  { type: "drink-line", icon: Droplets,       defaultW: 10,  defaultH: 0.2, defaultY: 0,   props: { nippleCount: 40 } },
  { type: "fan",        icon: Fan,            defaultW: 1.2, defaultH: 1.2, defaultY: 1.5 },
  { type: "wall-inlet", icon: ArrowLeftRight, defaultW: 1.5, defaultH: 0.5, defaultY: 2.0 },
  { type: "heater",     icon: BoxSelect,      defaultW: 1,   defaultH: 1,   defaultY: 0   },
  { type: "door",       icon: DoorOpen,       defaultW: 2,   defaultH: 2.2, defaultY: 0   },
  { type: "pillar",     icon: Columns,        defaultW: 0.3, defaultH: 3,   defaultY: 0   },
  { type: "feed-motor", icon: Zap,            defaultW: 0.5, defaultH: 0.5, defaultY: 0   },

];

// --- SEGÉDFÜGGVÉNYEK ---
const snapToGrid = (val: number, step = 0.5) => Math.round(val / step) * step;
const deepClone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const MAX_HISTORY = 10;

const calculateWallTransform = (
  start: [number, number, number],
  end:   [number, number, number],
  height: number,
  thickness: number
) => {
  const dx = end[0] - start[0];
  const dz = end[2] - start[2];
  const length = Math.sqrt(dx * dx + dz * dz);
  const angle  = -Math.atan2(dz, dx);
  const cx = (start[0] + end[0]) / 2;
  const cz = (start[2] + end[2]) / 2;
  return {
    position: [cx, height / 2, cz] as [number, number, number],
    rotation: [0, angle, 0] as [number, number, number],
    args:     [length, height, thickness] as [number, number, number],
    length
  };
};

// --- 3D KOMPONENSEK ---
type Wall3DProps = {
  id?: string;
  start: [number, number, number];
  end: [number, number, number];
  height: number;
  thickness: number;
  isSelected?: boolean;
  isGhost?: boolean;
  ignorePointer?: boolean;
  onClick?: (e: any) => void;
};

const Wall3D = ({
  id, start, end, height, thickness,
  isSelected, onClick, isGhost, ignorePointer
}: Wall3DProps) => {
  const { position, rotation, args } = useMemo(
    () => calculateWallTransform(start, end, height, thickness),
    [start, end, height, thickness]
  );

  return (
    <group
      position={position}
      rotation={rotation}
      onClick={onClick}
      {...(ignorePointer || isGhost ? { raycast: () => null } : {})}
    >
      <mesh>
        <boxGeometry args={args} />
        <meshStandardMaterial
          color={isGhost ? "#67e8f9" : "#e5e7eb"}
          transparent={!!isGhost}
          opacity={isGhost ? 0.35 : 1}
          roughness={0.8}
          emissive={isGhost ? new THREE.Color("#06b6d4") : new THREE.Color("#000")}
          emissiveIntensity={isGhost ? 0.15 : 0}
        />
      </mesh>

      {(isSelected || isGhost) && (
        <lineSegments>
          <edgesGeometry args={[new THREE.BoxGeometry(...args)]} />
          <lineBasicMaterial color={isGhost ? "#ef4444" : "red"} linewidth={2} />
        </lineSegments>
      )}
    </group>
  );
};

// Kiemelt „ghost” fal, hossz felirattal
const WallGhost = ({
  start, end, height, thickness
}: { start: [number, number, number]; end: [number, number, number]; height: number; thickness: number; }) => {
  const { position, rotation, args, length } = useMemo(
    () => calculateWallTransform(start, end, height, thickness),
    [start, end, height, thickness]
  );

  return (
    <group position={position} rotation={rotation} raycast={() => null}>
      <mesh>
        <boxGeometry args={args} />
        <meshStandardMaterial
          color="#67e8f9"
          transparent
          opacity={0.35}
          roughness={0.8}
          emissive={new THREE.Color("#06b6d4")}
          emissiveIntensity={0.15}
        />
      </mesh>

      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(...args)]} />
        <lineBasicMaterial color="#ef4444" linewidth={2} />
      </lineSegments>

      <Html position={[0, height/2 + 0.25, 0]} center distanceFactor={12} transform>
        <div className="bg-black/70 text-white text-[10px] px-2 py-1 rounded select-none whitespace-nowrap">
          {`${length.toFixed(2)} m`}
        </div>
      </Html>
    </group>
  );
};

const Fan3D = ({ item, isSelected, onClick, isGhost }: any) => {
  const pos: [number, number, number] = [item.x, item.y + item.h / 2, item.z];

  return (
    <group
      position={pos}
      rotation={[0, -item.rotation * (Math.PI / 180), 0]}
      onClick={!isGhost ? onClick : undefined}
      {...(isGhost ? { raycast: () => null } : {})}
    >
      {isSelected && !isGhost && (
        <mesh>
          <boxGeometry args={[item.w + 0.1, item.h + 0.1, 0.6]} />
          <meshBasicMaterial color="yellow" wireframe />
        </mesh>
      )}

      <mesh castShadow={!isGhost} receiveShadow={!isGhost}>
        <boxGeometry args={[item.w, item.h, 0.4]} />
        <meshStandardMaterial color="#333" transparent={isGhost} opacity={isGhost ? 0.45 : 1} />
      </mesh>

      <mesh position={[0, 0, 0.21]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[ (item.w/2)*0.9, (item.w/2)*0.9, 0.05, 32 ]} />
        <meshStandardMaterial color={isGhost ? "#1f2937" : "#111"} />
      </mesh>

      <mesh position={[0, 0, 0.25]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[ item.w/6, item.w/5, 0.2, 16 ]} />
        <meshStandardMaterial color={isGhost ? "#374151" : "#555"} />
      </mesh>

      <group position={[0, 0, 0.25]}>
        <mesh rotation={[0, 0, Math.PI / 4]}>
          <boxGeometry args={[item.w * 0.8, item.w * 0.15, 0.05]} />
          <meshStandardMaterial color={isGhost ? "#88ccff" : "#0ea5e9"} transparent opacity={isGhost ? 0.6 : 1} />
        </mesh>
        <mesh rotation={[0, 0, -Math.PI / 4]}>
          <boxGeometry args={[item.w * 0.8, item.w * 0.15, 0.05]} />
          <meshStandardMaterial color={isGhost ? "#88ccff" : "#0ea5e9"} transparent opacity={isGhost ? 0.6 : 1} />
        </mesh>
      </group>

      {/* Címke (kijelölt) */}
      {!isGhost && (
        <Html position={[0, item.h / 2 + 0.5, 0]} center distanceFactor={10} style={{ pointerEvents: "none" }}>
          <div className="bg-black/70 text-white text-[10px] px-1 rounded whitespace-nowrap select-none">
            {item.name}
          </div>
        </Html>
      )}

      {/* Ghost alsó él felirat */}
      {isGhost && (
        <Html position={[0, -item.h/2 - 0.1, 0]} center distanceFactor={12} transform>
          <div className="bg-black/75 text-white text-[10px] px-2 py-1 rounded select-none whitespace-nowrap">
            Alsó él: {item.y.toFixed(2)} m
          </div>
        </Html>
      )}
    </group>
  );
};

const GenericItem3D = ({ item, isSelected, onClick, isGhost = false }: any) => {
  const color = item.type.includes("feed")
    ? "orange"
    : item.type.includes("door")
    ? "#78350f"
    : "blue";

  const pos: [number, number, number] = [item.x, item.y + item.h / 2, item.z];

  return (
    <group
      position={pos}
      rotation={[0, -item.rotation * (Math.PI / 180), 0]}
      onClick={!isGhost ? onClick : undefined}
      {...(isGhost ? { raycast: () => null } : {})}
    >
      {isSelected && !isGhost && (
        <mesh>
          <boxGeometry args={[item.w + 0.1, item.h + 0.1, item.w + 0.1]} />
          <meshBasicMaterial color="yellow" wireframe />
        </mesh>
      )}
      <mesh castShadow={!isGhost} receiveShadow={!isGhost}>
        <boxGeometry args={[item.w, item.h, 0.2]} />
        <meshStandardMaterial color={color} transparent={isGhost} opacity={isGhost ? 0.45 : 1} />
      </mesh>

      {/* Ghost alsó él felirat (minden berendezésnél) */}
      {isGhost && (
        <Html position={[0, -item.h/2 - 0.1, 0]} center distanceFactor={12} transform>
          <div className="bg-black/75 text-white text-[10px] px-2 py-1 rounded select-none whitespace-nowrap">
            Alsó él: {item.y.toFixed(2)} m
          </div>
        </Html>
      )}

      {!isGhost && (
        <Html position={[0, item.h + 0.5, 0]} center distanceFactor={10} style={{ pointerEvents: "none" }}>
          <div className="bg-black/70 text-white text-[10px] px-1 rounded whitespace-nowrap select-none">
            {item.name}
          </div>
        </Html>
      )}
    </group>
  );
};

// --- EDITOR SCENE ---
const EditorScene = ({
  mode, items, setItems, walls, setWalls,
  selectedId, setSelectedId,
  activeTool, setActiveTool,
  placingType, setPlacingType,
  phantomRotation, setPhantomRotation,
  drawStart, setDrawStart,
  onCommit, // UNDO/REDO commit
}: any) => {

  const [mousePos, setMousePos] = useState<[number, number, number]>([0, 0, 0]);

  // Ghost paraméterek (elhelyezés közben állítható W/H/Y)
  const [ghostY, setGhostY] = useState<number>(0);
  const [ghostW, setGhostW] = useState<number>(1);
  const [ghostH, setGhostH] = useState<number>(1);

  // Ha eszköz vált, ghost értékek alaphelyzet
  useEffect(() => {
    if (!placingType) return;
    const tool = TOOLBOX_DEF.find(t => t.type === placingType);
    setGhostY(tool?.defaultY ?? 0);
    setGhostW(tool?.defaultW ?? 1);
    setGhostH(tool?.defaultH ?? 1);
  }, [placingType]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // forgatás
      if (e.key === "r" || e.key === "R") {
        setPhantomRotation((prev: number) => (prev + 90) % 360);
      }
      // Escape: megszakítás
      if (e.key === "Escape") {
        setSelectedId(null);
        setPlacingType(null);
        setDrawStart(null);
        setActiveTool(null);
      }

      // Ghost magasság (csak berendezés elhelyezéskor)
      if (mode === "furnish" && placingType) {
        const step = e.shiftKey ? 0.5 : 0.1;
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setGhostY(prev => Math.min(10, +(prev + step).toFixed(3)));
        }
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setGhostY(prev => Math.max(0, +(prev - step).toFixed(3)));
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mode, placingType, setPhantomRotation, setSelectedId, setPlacingType, setDrawStart, setActiveTool]);

  const handlePlaneMove = (e: any) => {
    const p = e.point;
    setMousePos([snapToGrid(p.x, 0.5), 0, snapToGrid(p.z, 0.5)]);
  };

  const handlePlaneDown = (e: any) => {
    if (e.button === 2) { // Jobb klikk
      e.stopPropagation();
      if (drawStart)   { setDrawStart(null);   return; }
      if (placingType) { setPlacingType(null); return; }
      if (selectedId)  { setSelectedId(null);  return; }
      return;
    }

    if (e.button === 0) { // Bal klikk
      e.stopPropagation();

      // Berendezés elhelyezés (ghost paraméterekkel)
      if (mode === "furnish" && placingType) {
        onCommit?.();
        const tool = TOOLBOX_DEF.find(t => t.type === placingType);
        const newItem: BarnItem = {
          id: Math.random().toString(36).slice(2, 11),
          type: placingType,
          x: mousePos[0], y: ghostY, z: mousePos[2],
          w: ghostW, h: ghostH,
          rotation: phantomRotation,
          name: `Item ${items.length + 1}`,
          props: tool?.props ? { ...tool.props } : {}
        };
        setItems((prev: any) => [...prev, newItem]);
        return;
      }

      // Fal húzás
      if (mode === "build" && activeTool === "wall") {
        if (!drawStart) {
          setDrawStart(mousePos);
        } else {
          if (drawStart[0] === mousePos[0] && drawStart[2] === mousePos[2]) return;
          onCommit?.();
          const newWall: WallSegment = {
            id: Math.random().toString(36).slice(2, 11),
            start: drawStart,
            end: mousePos,
            height: 3,
            thickness: 0.2
          };
          setWalls((prev: any) => [...prev, newWall]);
          setDrawStart(mousePos); // folytatólagos húzás
        }
        return;
      }

      if (!placingType && !drawStart) setSelectedId(null);
    }
  };

  const buildingNow = mode === "build" && activeTool === "wall";
  return (
    <>
      <OrbitControls
        makeDefault
        maxPolarAngle={Math.PI / 2 - 0.1}
        mouseButtons={{
          LEFT:   THREE.MOUSE.ROTATE,
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT:  THREE.MOUSE.PAN
        }}
      />

      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 20, 5]} intensity={1} castShadow />
      <Sky sunPosition={[100, 20, 100]} />

      {/* LOGIKAI SÍK – láthatatlan, raycastolható, nem ír depth-et */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        onPointerMove={handlePlaneMove}
        onPointerDown={handlePlaneDown}
      >
        <planeGeometry args={[2000, 2000]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* TALAJ */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]} receiveShadow>
        <planeGeometry args={[2000, 2000]} />
        <meshStandardMaterial color="#5ea862" roughness={1} />
      </mesh>

      {/* RÁCS */}
      <Grid
        position={[0, 0.02, 0]}
        args={[400, 400]}
        cellSize={0.5}
        cellThickness={1}
        cellColor="#3f3f46"
        sectionSize={5}
        sectionThickness={1.5}
        sectionColor="#9ca3af"
        infiniteGrid={false}
        followCamera={false}
      />

      {/* FALAK – építés közben NEM kattinthatóak és nem jelölhetők */}
      {walls.map((wall: WallSegment) => (
        <Wall3D
          key={wall.id}
          id={wall.id}
          start={wall.start}
          end={wall.end}
          height={wall.height}
          thickness={wall.thickness}
          isSelected={!buildingNow && selectedId === wall.id && mode === "build"}
          ignorePointer={buildingNow || !!drawStart}
          onClick={(e: any) => {
            if (mode === "build" && !buildingNow && !drawStart) {
              e.stopPropagation();
              setActiveTool(null);
              setSelectedId(wall.id);
            }
          }}
        />
      ))}

      {/* FAL GHOST – mindig látható húzás közben */}
      {mode === "build" && activeTool === "wall" && drawStart && (
        <WallGhost start={drawStart} end={mousePos} height={3} thickness={0.2} />
      )}

      {/* ESZKÖZÖK */}
      {items.map((item: any) => {
        const isSelected = selectedId === item.id && mode === "furnish";
        const onClick = (e: any) => {
          if (mode === "furnish" && !placingType) {
            e.stopPropagation();
            setSelectedId(item.id);
          }
        };
        if (item.type === "fan") {
          return <Fan3D key={item.id} item={item} isSelected={isSelected} onClick={onClick} />;
        }
        return <GenericItem3D key={item.id} item={item} isSelected={isSelected} onClick={onClick} />;
      })}

      {/* BERENDEZÉS GHOST – a ghost W/H/Y a billentyűkkel is változik */}
      {mode === "furnish" && placingType && (() => {
        const ghost = {
          type: placingType,
          x: mousePos[0],
          y: ghostY,
          z: mousePos[2],
          w: ghostW,
          h: ghostH,
          rotation: phantomRotation,
          name: "Előnézet"
        };
        return placingType === "fan"
          ? <Fan3D item={ghost} isGhost />
          : <GenericItem3D item={ghost} isGhost />;
      })()}

      {/* Kurzor jelölő */}
      <mesh position={mousePos} raycast={() => null}>
        <sphereGeometry args={[0.08, 8, 8]} />
        <meshBasicMaterial color="red" />
      </mesh>
    </>
  );
};

// --- FŐ KOMPONENS ---
export default function IstalloSzerkeszto() {
  const { t } = useLanguage();

  const [mode, setMode] = useState<EditMode>("build");
  const [activeTool, setActiveTool] = useState<string | null>("wall");
  const [placingType, setPlacingType] = useState<string | null>(null);
  const [phantomRotation, setPhantomRotation] = useState<number>(0);
  const [drawStart, setDrawStart] = useState<[number, number, number] | null>(null);

  const [items, setItems] = useState<BarnItem[]>([]);
  const [walls, setWalls] = useState<WallSegment[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // UNDO/REDO
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [redo, setRedo] = useState<Snapshot[]>([]);

  const selectedWall = mode === "build" ? walls.find(w => w.id === selectedId) : undefined;

  const snapshot = (): Snapshot => ({ items: deepClone(items), walls: deepClone(walls) });

  const pushHistory = () => {
    setHistory(prev => {
      const next = [...prev, snapshot()];
      if (next.length > MAX_HISTORY) next.shift();
      return next;
    });
    setRedo([]);
  };

  const undo = () => {
    if (history.length === 0) return;
    const prevSnap = history[history.length - 1];
    setRedo(r => [...r, snapshot()]);
    setItems(prevSnap.items);
    setWalls(prevSnap.walls);
    setSelectedId(null);
    setHistory(history.slice(0, -1));
  };

  const redoForward = () => {
    if (redo.length === 0) return;
    const nextSnap = redo[redo.length - 1];
    setHistory(h => {
      const next = [...h, snapshot()];
      if (next.length > MAX_HISTORY) next.shift();
      return next;
    });
    setItems(nextSnap.items);
    setWalls(nextSnap.walls);
    setSelectedId(null);
    setRedo(redo.slice(0, -1));
  };

  // ADATBETÖLTÉS
  useEffect(() => {
    const load = async () => {
      try {
        const snap = await getDoc(doc(db, "istallo_layouts", "sims_layout"));
        if (snap.exists()) {
          const data = snap.data() as any;
          setItems(data.items || []);
          setWalls(data.walls || []);
          setHistory([]); setRedo([]);
        }
      } catch (e) {
        console.error(e);
      }
    };
    load();
  }, []);

  const handleSave = async () => {
    try {
      await setDoc(
        doc(db, "istallo_layouts", "sims_layout"),
        { items, walls, updatedAt: serverTimestamp() }
      );
      toast({ title: t("common.success"), description: "Sikeres mentés!" });
    } catch (e: any) {
      toast({ title: "Hiba", description: e.message, variant: "destructive" });
    }
  };

  const handleToolSelect = (type: string) => {
    if (mode !== "furnish") return;
    setPlacingType(type);
    setPhantomRotation(0);
    setSelectedId(null);
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    pushHistory();
    if (mode === "build") setWalls(prev => prev.filter(w => w.id !== selectedId));
    else setItems(prev => prev.filter(i => i.id !== selectedId));
    setSelectedId(null);
  };

  const updateItem = (changes: Partial<BarnItem>) => {
    if (!selectedId) return;
    pushHistory();
    setItems(prev => prev.map(i => (i.id === selectedId ? { ...i, ...changes } : i)));
  };

  const updateWallHeight = (id: string, h: number) => {
    pushHistory();
    setWalls(prev => prev.map(w => (w.id === id ? { ...w, height: h } : w)));
  };

  const getToolLabel = (type: string) => t(`editor.tool.${type.replace(/-/g, "_")}`);
  const selectedObj = mode === "build" ? walls.find(w => w.id === selectedId) : items.find(i => i.id === selectedId);

  const handleContextMenu = (e: React.MouseEvent) => { e.preventDefault(); };

  // Globális gyorsbillentyűk: Del, Ctrl+Z, Ctrl+U
  useEffect(() => {
    const isTyping = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (!el) return false;
      const tag = (el.tagName || "").toLowerCase();
      return el.isContentEditable || tag === "input" || tag === "textarea" || tag === "select";
    };

    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e)) return;

      if (e.key === "Delete") {
        if (selectedId) {
          e.preventDefault();
          deleteSelected();
        }
        return;
      }

      if (e.ctrlKey && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        undo();
        return;
      }

      if (e.ctrlKey && (e.key === "u" || e.key === "U")) {
        e.preventDefault();
        redoForward();
        return;
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, history, redo, items, walls]);

  return (
    <div
      className="h-[calc(100vh-4rem)] flex flex-col bg-slate-950 text-white font-sans select-none"
      onContextMenu={handleContextMenu}
    >
      {/* HEADER */}
      <div className="bg-slate-900 border-b border-slate-800 p-2 flex justify-between items-center shrink-0 z-30 shadow-lg">
        <div className="flex items-center gap-2 bg-slate-800 p-1 rounded-lg border border-slate-700">
          <Button
            variant={mode === "build" ? "default" : "ghost"}
            onClick={() => {
              setMode("build");
              setActiveTool("wall");
              setPlacingType(null);
              setSelectedId(null);
            }}
            className={cn("gap-2 transition-all", mode === "build" ? "bg-amber-600 hover:bg-amber-700" : "text-slate-400 hover:text-white")}
          >
            <Hammer className="h-4 w-4" /> <span className="hidden sm:inline">Építés</span>
          </Button>
          <Button
            variant={mode === "furnish" ? "default" : "ghost"}
            onClick={() => {
              setMode("furnish");
              setActiveTool(null);
              setPlacingType(null);
              setSelectedId(null);
            }}
            className={cn("gap-2 transition-all", mode === "furnish" ? "bg-blue-600 hover:bg-blue-700" : "text-slate-400 hover:text-white")}
          >
            <MousePointer2 className="h-4 w-4" /> <span className="hidden sm:inline">Berendezés</span>
          </Button>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-xs text-slate-400 hidden lg:block bg-slate-800/50 px-3 py-1 rounded border border-slate-700">
            <span className="text-white font-bold">Bal Klikk</span> Építés/Elhelyezés |
            <span className="text-white font-bold"> Jobb Klikk</span> Mégse |
            <span className="text-white font-bold"> R</span> Forgatás |
            <span className="text-white font-bold"> ↑/↓</span> Ghost magasság |
            <span className="text-white font-bold"> Shift</span> nagy lépés |
            <span className="text-white font-bold"> Del</span> Törlés |
            <span className="text-white font-bold"> Ctrl+Z</span> Visszavon |
            <span className="text-white font-bold"> Ctrl+U</span> Újra
          </div>
          <Button onClick={handleSave} size="sm" className="bg-emerald-600 hover:bg-emerald-700 gap-2">
            <Save className="h-4 w-4" /> Mentés
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden relative">
        {/* BAL MENÜ */}
        <div className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0 z-20">
          {mode === "build" ? (
            <div className="p-4 space-y-4 animate-in slide-in-from-left-4 fade-in">
              <h3 className="text-xs font-bold uppercase text-amber-500 tracking-wider">Építő elemek</h3>
              <Button
                variant={activeTool === "wall" ? "default" : "outline"}
                className={cn("w-full h-16 flex flex-col justify-center border-slate-700",
                  activeTool === "wall" ? "bg-amber-600/20 border-amber-500 text-amber-500" : "bg-slate-800")}
                onClick={() => { setActiveTool("wall"); setPlacingType(null); }}
              >
                <Columns className="h-6 w-6 mb-1" /><span>Fal Húzása</span>
              </Button>
              <div className="text-xs text-slate-500 p-2 bg-slate-800 rounded">
                Bal klikk: pont lerakása. <br />Jobb klikk: megszakítás.
              </div>
            </div>
          ) : (
            <div className="flex flex-col h-full animate-in slide-in-from-left-4 fade-in">
              <div className="p-4 border-b border-slate-800">
                <h3 className="text-xs font-bold uppercase text-blue-500 tracking-wider">Eszközök</h3>
              </div>
              <div className="p-2 overflow-y-auto grid grid-cols-2 gap-2 content-start flex-1">
                {TOOLBOX_DEF.map(t => {
                  const Icon = t.icon;
                  const isActive = placingType === t.type;
                  return (
                    <Button
                      key={t.type}
                      variant="outline"
                      className={cn(
                        "h-24 flex flex-col gap-2 border-slate-700 bg-slate-800 hover:bg-slate-700 hover:text-white group transition-all",
                        isActive && "ring-2 ring-blue-500 bg-blue-900/20"
                      )}
                      onClick={() => handleToolSelect(t.type)}
                    >
                      <div className="p-2 rounded-full bg-slate-900 group-hover:bg-blue-600 transition-colors">
                        <Icon className="h-5 w-5 text-slate-400 group-hover:text-white" />
                      </div>
                      <span className="text-[10px] font-medium whitespace-normal text-center leading-tight">
                        {getToolLabel(t.type)}
                      </span>
                    </Button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* 3D VILÁG */}
        <div className={cn("flex-1 relative cursor-crosshair transition-colors", mode === "build" ? "bg-slate-950" : "bg-slate-900")}>
          <Canvas shadows camera={{ position: [10, 15, 10], fov: 50 }}>
            <EditorScene
              mode={mode}
              items={items} setItems={setItems}
              walls={walls} setWalls={setWalls}
              selectedId={selectedId} setSelectedId={setSelectedId}
              activeTool={activeTool} setActiveTool={setActiveTool}
              placingType={placingType} setPlacingType={setPlacingType}
              phantomRotation={phantomRotation} setPhantomRotation={setPhantomRotation}
              drawStart={drawStart} setDrawStart={setDrawStart}
              onCommit={pushHistory}
            />
          </Canvas>

          {/* HUD falmagasság (ha fal kijelölt és nem építesz) */}
          {selectedWall && (
            <div
              className="absolute top-6 left-1/2 -translate-x-1/2 z-40"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-slate-900/95 backdrop-blur border border-slate-700 rounded-xl shadow-2xl px-4 py-3 w-[300px]">
                <div className="text-xs uppercase tracking-wide text-slate-400 mb-2">
                  Fal magassága (m)
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    step={0.1}
                    value={selectedWall.height}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (!Number.isNaN(v) && v > 0.1)
                        updateWallHeight(selectedWall.id, v);
                    }}
                    className="bg-slate-800 border-slate-600"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-slate-600"
                    onClick={() => updateWallHeight(selectedWall.id, Math.max(1, Math.round((selectedWall.height - 0.1) * 10) / 10))}
                  >-</Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-slate-600"
                    onClick={() => updateWallHeight(selectedWall.id, Math.round((selectedWall.height + 0.1) * 10) / 10)}
                  >+</Button>
                </div>
                <Slider
                  className="py-3"
                  value={[selectedWall.height]}
                  min={1}
                  max={6}
                  step={0.1}
                  onValueChange={(v) => updateWallHeight(selectedWall.id, v[0])}
                />
                <div className="text-[10px] text-slate-500">
                  Fal ID: <span className="text-slate-300">{selectedWall.id.slice(0,6)}</span>
                </div>
              </div>
            </div>
          )}

          {/* TÖRLÉS GOMB (Del is működik) */}
          {selectedId && !placingType && (
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-30">
              <Button
                variant="destructive"
                size="lg"
                className="rounded-full shadow-xl"
                onClick={deleteSelected}
              >
                <Trash2 className="h-5 w-5 mr-2" /> Törlés
              </Button>
            </div>
          )}
        </div>

        {/* JOBB PANEL */}
        {selectedObj && !placingType && (
          <div className="w-80 bg-slate-900 border-l border-slate-800 p-4 shrink-0 z-20 shadow-xl overflow-y-auto animate-in slide-in-from-right-10">
            <div className="mb-6 pb-4 border-b border-slate-700">
              <h3 className="text-xs uppercase font-bold text-slate-500 mb-1">Kijelölve</h3>
              <div className="text-xl font-semibold flex items-center gap-2">
                {mode === "build" ? <Columns className="text-amber-500" /> : <BoxSelect className="text-blue-500" />}
                {mode === "build" ? "Fal Szakasz" : (selectedObj as BarnItem).name}
              </div>
            </div>

            {mode === "build" ? (
              <div className="space-y-4">
                <div className="space-y-2 p-3 bg-slate-800 rounded-lg border border-slate-700">
                  <Label className="text-amber-500">Fal Magassága (m)</Label>
                  <Input
                    type="number"
                    value={(selectedObj as WallSegment).height}
                    onChange={e => {
                      const val = Number(e.target.value);
                      if (!Number.isNaN(val) && val > 0.1) {
                        updateWallHeight((selectedObj as WallSegment).id, val);
                      }
                    }}
                    className="bg-slate-900 border-slate-600 text-lg"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="space-y-2">
                  <Label>Név</Label>
                  <Input
                    className="bg-slate-800 border-slate-700"
                    value={(selectedObj as BarnItem).name}
                    onChange={e => updateItem({ name: e.target.value })}
                  />
                </div>

                <div className="space-y-4 border-t border-slate-800 pt-4">
                  <h4 className="text-xs font-bold text-slate-500 uppercase">Méretek & Pozíció</h4>

                  <div className="space-y-1">
                    <Label className="text-blue-400">Pozíció Y (Elem alja)</Label>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        step={0.1}
                        className="bg-slate-800 border-slate-700"
                        value={(selectedObj as BarnItem).y}
                        onChange={e => updateItem({ y: Number(e.target.value) })}
                      />
                      <span className="flex items-center text-xs text-slate-500">méter</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Szélesség (W)</Label>
                      <Input
                        type="number"
                        step={0.1}
                        className="bg-slate-800 border-slate-700"
                        value={(selectedObj as BarnItem).w}
                        onChange={e => updateItem({ w: Number(e.target.value) })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Magasság (H)</Label>
                      <Input
                        type="number"
                        step={0.1}
                        className="bg-slate-800 border-slate-700"
                        value={(selectedObj as BarnItem).h}
                        onChange={e => updateItem({ h: Number(e.target.value) })}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>X</Label>
                      <Input
                        type="number"
                        step={0.1}
                        className="bg-slate-800 border-slate-700"
                        value={(selectedObj as BarnItem).x}
                        onChange={e => updateItem({ x: Number(e.target.value) })}
                      />
                    </div>
                    <div>
                      <Label>Z</Label>
                      <Input
                        type="number"
                        step={0.1}
                        className="bg-slate-800 border-slate-700"
                        value={(selectedObj as BarnItem).z}
                        onChange={e => updateItem({ z: Number(e.target.value) })}
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <Label className="flex justify-between">
                    Forgatás <span>{(selectedObj as BarnItem).rotation}°</span>
                  </Label>
                  <Slider
                    className="py-4"
                    value={[(selectedObj as BarnItem).rotation]}
                    max={360}
                    step={5}
                    onValueChange={(v) => updateItem({ rotation: v[0] })}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
