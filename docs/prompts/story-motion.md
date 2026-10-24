You are given a task to build and integrate three motion components into an existing React codebase:
a **sun-and-households orbit hero** with real physics, an **Apple-style call that plays as you scroll**,
and an **animated heat-haze background**. All three go on the public story page of Neralu only.

Neralu is a heatwave welfare-check system: it phones older people who live alone when the heat
crosses *their own* threshold, asks keypad questions, and sends a person to the door when an answer
is worrying. The motion must explain that, not decorate it. Every number shown comes from Neralu's
real rules or is labelled as an example.

The codebase already supports:
- shadcn-style project structure (`@/components/ui/...` resolves to `frontend/src/components/ui/`)
- Tailwind CSS 4 (tokens in `frontend/src/styles/tokens.css`, mapped in `frontend/src/index.css`)
- TypeScript, React 19, Vite 8
- GSAP 3.15 (`frontend/src/motion.ts` registers CustomEase, DrawSVGPlugin, Flip and exports `gsap`,
  `EASE`, `reducedMotion()`); ScrollTrigger ships with GSAP and is not registered yet
- three.js 0.186 and `motion` 14 are installed but are not needed for this task

Do not install new npm dependencies. Everything below is built with Canvas 2D, GSAP and React.

## Read first

1. `CLAUDE.md` and `docs/NERALU_PLAN.md` §8 (design rules). **Exception, approved by the team lead:**
   the story page (`/`) may use glow, radial gradients and an animated background. Every other page
   (`/ward`, `/volunteer`, `/register`, `/family`, `/phone`, `/responsible`, `/ward/record/:id`)
   keeps the plain civic style. Add one line under the rules in `CLAUDE.md` recording this exception.
2. `frontend/src/pages/Story.tsx`: the current page. The hero uses a lazy `HeatGlobe` and a
   `ShaderAnimation` backdrop; `CallReplay` is a time-based GSAP replay of Kamala's call.
3. `frontend/src/heat.ts`: `personalThreshold(score, warmNight)` mirrors `backend/app/risk.py`.
4. `backend/app/risk.py` (scores, thresholds, `calls_due`) and `backend/app/rules.py` (outcomes).
5. `frontend/src/api.ts` → `api.elders()` returns every resident with `risk_score`, `threshold_c`,
   `name`, `age`, `is_simulated`, `risk_factors`.

## Reference components from 21st.dev (for look and feel only)

The team lead is signed in to 21st.dev and may paste code from these pages below. Use them as
reference for feel and technique; write Neralu's own implementation. Check each licence before
copying any line. If code is copied or closely adapted, credit the author in `README.md` under
"Built honestly: credits and pre-existing work".

- Orbital Hero Section by Yura Dubinin (MIT): https://21st.dev/@yura/components/orbital-hero-section
  (a sun drifts through stars; planets trail helical wakes, from Kepler's laws)
- Cinematic Landing Hero by Hossain Jahed: https://21st.dev/@jahed/components/cinematic-landing-hero
  (headline blurs away on scroll, a panel rises, a phone slides in)
- Spiral Animation by Kain Xu: https://21st.dev/@xubohuah/components/spiral-animation
  (thousands of particles in a ring; reference for drawing ~400 points cheaply)

```tsx
You are given a task to integrate an existing React component in the codebase

The codebase should support:
- shadcn project structure  
- Tailwind CSS
- Typescript

If it doesn't, provide instructions on how to setup project via shadcn CLI, install Tailwind or Typescript.

Determine the default path for components and styles. 
If default path for components is not /components/ui, provide instructions on why it's important to create this folder
Copy-paste this component to /components/ui folder:
```tsx
orbital-hero-section.tsx
"use client";

import * as React from "react";
import { useEffect, useRef } from "react";

/* -------------------------------------------------------------------------- */
/*  What this draws                                                           */
/*                                                                            */
/*  The Sun does not sit still. Relative to the stars around it, it moves at   */
/*  19.4 km/s toward the solar apex in Hercules. The planets keep running      */
/*  their Kepler ellipses around it, so the path each planet actually cuts     */
/*  through space is an ellipse plus a straight drift: a helix.                */
/*                                                                            */
/*  The camera travels with the Sun. That is why the Sun stays put, the        */
/*  background stars slide past with real depth parallax, and every planet     */
/*  leaves a spiral behind it as it chases the Sun.                            */
/*                                                                            */
/*  One thing here is drawn for looks rather than for truth, and it is worth   */
/*  naming. By default the orbits are swung square to the Sun's course, which  */
/*  makes every wake a helix about one shared axis and lays the coils out      */
/*  parallel. That is the geometry of the popular "vortex" video, and it is    */
/*  not ours: the real ecliptic leans 53 degrees to the course, so the real    */
/*  helices lean too. alignToCourse={0} gives you that instead.                */
/* -------------------------------------------------------------------------- */

export type Planet = {
  name: string;
  /** Semi-major axis, in astronomical units. */
  a: number;
  /** Eccentricity. */
  e: number;
  /** Inclination to the ecliptic, in degrees. */
  i: number;
  /** Longitude of the ascending node, in degrees. */
  node: number;
  /** Argument of perihelion, in degrees. */
  peri: number;
  /** Mean anomaly at the J2000 epoch, in degrees. */
  M0: number;
  color: string;
  /** Dot radius in px. Not to scale — nothing would be visible if it were. */
  size: number;
  /** Per-planet brightness multiplier. */
  glow?: number;
};

export interface OrbitalHeroSectionProps
  extends React.HTMLAttributes<HTMLDivElement> {
  /** Bodies to run. Defaults to Mercury through Saturn with J2000 elements. */
  planets?: Planet[];
  /** Seconds of wall clock per Earth year. */
  yearSeconds?: number;
  /** How much past track each planet keeps, in Earth years. */
  trailYears?: number;
  /**
   * Radial squeeze, applied to the drawing only: a planet at r AU is drawn at
   * r^compress. At 1 the map is the true solar system, where Neptune is 78
   * times further out than Mercury and everything inside Jupiter is a speck.
   * Around 0.42 the orbits spread out evenly across the frame. Orbit shapes,
   * eccentricities and tilts survive the squeeze; Kepler's third law is then
   * applied to the drawn spacing, so the inner planets still outrun the outer
   * ones and every planet still sweeps equal areas in equal times.
   */
  compress?: number;
  /** Cap on how many turns of wake a fast planet keeps, so it stays readable. */
  maxTurns?: number;
  /**
   * Fans the orbit planes apart, 0 to 1. The real planets all run within 7° of
   * one plane, so at 0 you get the true article: a flat nested disc seen at an
   * angle. Turning this up tips each orbit onto its own plane, and the loops
   * cross each other at all angles instead of nesting.
   */
  planeSpread?: number;
  /**
   * Stretches the orbits, 0 to 1. The real planets run rings: Venus is off a
   * circle by half a percent, and only Mercury reaches 0.21. At 0 you get
   * those. Turning it up draws each planet onto a longer, lopsided ellipse,
   * which puts the Sun visibly at the focus instead of the middle. The motion
   * stays Keplerian either way — same period, still sweeping equal areas, just
   * a harder swing through perihelion.
   */
  eccentricity?: number;
  /**
   * Swings every orbit onto the one plane standing square to the Sun's
   * course, 0 to 1. At 1 the wakes become true helices about a single shared
   * axis, so the coils run parallel — the tidy look. It is also the geometry
   * of the popular "vortex" video, and it is not ours: the real ecliptic
   * leans 53 degrees to the course, which is what you get at 0.
   */
  alignToCourse?: number;
  /**
   * The Sun's speed through the local star field, in drawn units per year.
   * Earth circles at 2π units a year, so 4.09 is the true 19.4 km/s ratio —
   * right, but it stretches the coils flat. Lower values wind them tighter.
   */
  driftSpeed?: number;
  /** Direction of travel: ecliptic longitude and latitude of the solar apex, in degrees. */
  apex?: [number, number];
  /** Half-width of the view, in AU. */
  viewRadius?: number;
  /** Camera pitch in degrees. 0 looks straight down on the ecliptic, 90 is edge-on. */
  tilt?: number;
  /** Camera yaw in degrees. */
  spin?: number;
  /**
   * Camera roll in degrees. Turns the picture about the line of sight, so it
   * sets which way the helix runs across the screen without touching the
   * viewing angle. Pick it with tilt and spin so the Sun's track lies flat in
   * the screen plane: that is the view where a helix reads as a helix. Seen
   * end-on its turns stack up and look like rings.
   */
  roll?: number;
  /** How far ahead of centre the Sun sits, as a fraction of the short side. */
  lead?: number;
  /**
   * Where to put the Sun in the frame, as fractions of width and height.
   * [0.5, 0.5] centres it. Push it off to one side to clear a quiet corner
   * for hero copy.
   */
  focus?: [number, number];
  /**
   * Lays a black veil over one edge so text can sit there and still be read.
   * The veil is drawn last, over the whole scene, fading out by two thirds of
   * the way across.
   */
  scrim?: "none" | "left" | "right" | "top" | "bottom";
  /** How dark the veil gets at the edge it starts from, 0 to 1. */
  scrimStrength?: number;
  /** Number of background stars. */
  starCount?: number;
  /** Overall bloom strength, 0 to 2. */
  glow?: number;
  /** Add a faint closed ellipse behind each planet. Off by default. */
  showOrbits?: boolean;
  /** Draw the Sun's own straight track through space. */
  showSunTrack?: boolean;
  /** Let the pointer nudge the camera. */
  interactive?: boolean;
  /** Freeze on the current frame. */
  paused?: boolean;
  sunColor?: string;
  children?: React.ReactNode;
}

/* -------------------------------------------------------------------------- */
/*  Real orbital elements, J2000, referred to the ecliptic                    */
/* -------------------------------------------------------------------------- */

export const SOLAR_SYSTEM: Planet[] = [
  { name: "Mercury", a: 0.38710, e: 0.20563, i: 7.005, node: 48.331, peri: 29.125, M0: 174.796, color: "#fff0d0", size: 2.2 },
  { name: "Venus",   a: 0.72333, e: 0.00677, i: 3.395, node: 76.680, peri: 54.853, M0: 50.115,  color: "#ffc65a", size: 3.4 },
  { name: "Earth",   a: 1.00000, e: 0.01671, i: 0.000, node: 348.739, peri: 114.208, M0: 357.517, color: "#5fd8ff", size: 3.8, glow: 1.1 },
  { name: "Mars",    a: 1.52371, e: 0.09339, i: 1.850, node: 49.558, peri: 286.483, M0: 19.373, color: "#ff4a32", size: 2.9 },
  { name: "Jupiter", a: 5.20290, e: 0.04839, i: 1.303, node: 100.464, peri: 273.867, M0: 20.020, color: "#ffa62e", size: 5.4 },
  { name: "Saturn",  a: 9.53700, e: 0.05386, i: 2.485, node: 113.665, peri: 339.392, M0: 317.020, color: "#ffd884", size: 4.8 },
  { name: "Uranus",  a: 19.1913, e: 0.04726, i: 0.773, node: 74.006, peri: 98.999, M0: 142.238, color: "#7fe6ff", size: 4.2 },
  { name: "Neptune", a: 30.0690, e: 0.00859, i: 1.770, node: 131.784, peri: 276.336, M0: 256.228, color: "#3f7dff", size: 4.4 },
];

/** Just the four rocky ones, for a tighter frame. */
export const INNER_PLANETS: Planet[] = SOLAR_SYSTEM.slice(0, 4);

/**
 * Extra tilt and swing added to each orbit plane at planeSpread = 1, in
 * degrees. Fixed rather than random, so the rosette they make is the same
 * every load and on the server as on the client.
 */
const PLANE_FAN: Array<[number, number]> = [
  [58, 35], [27, 145], [71, 250], [40, 80],
  [84, 190], [33, 310], [62, 120], [15, 20],
];

/** Eccentricity each orbit is pulled toward at eccentricity = 1. */
const ECC_FAN = [0.52, 0.34, 0.63, 0.44, 0.3, 0.58, 0.4, 0.68];

/* -------------------------------------------------------------------------- */
/*  Maths                                                                     */
/* -------------------------------------------------------------------------- */

const TAU = Math.PI * 2;
const RAD = Math.PI / 180;

/**
 * Kepler's equation M = E − e·sin E, solved for the eccentric anomaly.
 * Newton's method; at solar-system eccentricities three passes are plenty.
 */
function eccentricAnomaly(M: number, e: number): number {
  let m = M % TAU;
  if (m < 0) m += TAU;
  let E = m + e * Math.sin(m) * (1 + e * Math.cos(m));
  for (let k = 0; k < 8; k++) {
    const step = (E - e * Math.sin(E) - m) / (1 - e * Math.cos(E));
    E -= step;
    if (Math.abs(step) < 1e-10) break;
  }
  return E;
}

function parseRGB(color: string): [number, number, number] {
  const c = color.trim();
  if (c[0] === "#") {
    const hex = c.slice(1);
    const full =
      hex.length === 3 ? hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2] : hex.slice(0, 6);
    const n = parseInt(full, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const m = c.match(/(\d+(?:\.\d+)?)/g);
  if (m && m.length >= 3) return [+m[0], +m[1], +m[2]];
  return [255, 255, 255];
}

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

export function OrbitalHeroSection({
  planets = SOLAR_SYSTEM,
  yearSeconds = 16,
  trailYears = 2.6,
  compress = 0.42,
  maxTurns = 3,
  planeSpread = 1,
  eccentricity = 0.25,
  alignToCourse = 1,
  driftSpeed = 1.5,
  apex = [272, 53],
  viewRadius = 3.4,
  // Pitch and yaw are picked together so the Sun's track leaves the frame at
  // about 38° below the horizon, and it runs up and to the right.
  tilt = 45,
  spin = 252,
  roll = 13.5,
  lead = 0.12,
  focus = [0.5, 0.5],
  scrim = "none",
  scrimStrength = 0.88,
  starCount = 1500,
  glow = 1,
  showOrbits = false,
  showSunTrack = true,
  interactive = true,
  paused = false,
  sunColor = "#FFF2CC",
  className = "",
  children,
  ...rest
}: OrbitalHeroSectionProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const props = useRef({
    planets, yearSeconds, trailYears, compress, maxTurns, planeSpread, eccentricity, alignToCourse, driftSpeed, apex,
    viewRadius, tilt, spin, roll, lead, focus, scrim, scrimStrength, starCount, glow, showOrbits, showSunTrack,
    interactive, paused, sunColor,
  });
  props.current = {
    planets, yearSeconds, trailYears, compress, maxTurns, planeSpread, eccentricity, alignToCourse, driftSpeed, apex,
    viewRadius, tilt, spin, roll, lead, focus, scrim, scrimStrength, starCount, glow, showOrbits, showSunTrack,
    interactive, paused, sunColor,
  };

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let width = 0;
    let height = 0;
    let dpr = 1;
    /** Simulation clock, in Earth years since J2000. */
    let years = reduced ? 1.7 : 0;
    let lastFrame = 0;
    let running = true;
    let visible = true;
    let raf = 0;

    /* --- camera ----------------------------------------------------------- */
    // World axes: x, y span the ecliptic, z points to the ecliptic north pole.
    // Screen basis is built from yaw about z, then pitch about the new x.
    let pxPerAU = 1;
    let cx = 0;
    let cy = 0;
    let camDist = 1; // camera standoff from the Sun, in AU
    // basis vectors in world coords
    const RIGHT = { x: 1, y: 0, z: 0 };
    const UP = { x: 0, y: 1, z: 0 };
    const FWD = { x: 0, y: 0, z: 1 }; // points from the Sun back toward the camera

    function setCamera(yawDeg: number, pitchDeg: number, rollDeg: number) {
      const A = yawDeg * RAD;
      const B = pitchDeg * RAD;
      const ca = Math.cos(A), sa = Math.sin(A);
      const cb = Math.cos(B), sb = Math.sin(B);
      const rx = ca, ry = sa, rz = 0;
      const ux = -sa * cb, uy = ca * cb, uz = sb;
      FWD.x = sa * sb; FWD.y = -ca * sb; FWD.z = cb;
      // Roll turns the picture about the line of sight. It changes nothing in
      // space — it only decides which way the helix runs across the screen,
      // which is why it can be set apart from the viewing angle.
      const C = rollDeg * RAD;
      const cr = Math.cos(C), sr = Math.sin(C);
      RIGHT.x = rx * cr + ux * sr;
      RIGHT.y = ry * cr + uy * sr;
      RIGHT.z = rz * cr + uz * sr;
      UP.x = -rx * sr + ux * cr;
      UP.y = -ry * sr + uy * cr;
      UP.z = -rz * sr + uz * cr;
    }

    // Scratch output for project(); reused to keep the hot loop allocation-free.
    const P = { x: 0, y: 0, depth: 0, s: 0, ok: false };

    /** World offset from the Sun → screen. */
    function project(dx: number, dy: number, dz: number) {
      const vx = dx * RIGHT.x + dy * RIGHT.y + dz * RIGHT.z;
      const vy = dx * UP.x + dy * UP.y + dz * UP.z;
      const vz = dx * FWD.x + dy * FWD.y + dz * FWD.z;
      const depth = camDist - vz;
      if (depth < 0.6) {
        P.ok = false;
        return;
      }
      const s = camDist / depth;
      P.x = cx + vx * pxPerAU * s;
      P.y = cy - vy * pxPerAU * s;
      P.depth = depth;
      P.s = s;
      P.ok = true;
    }

    /* --- the Sun's own velocity ------------------------------------------- */
    // Ecliptic longitude/latitude of the solar apex → a unit vector.
    const DIR = { x: 0, y: 0, z: 0 };
    function setApex(lonDeg: number, latDeg: number) {
      const l = lonDeg * RAD;
      const b = latDeg * RAD;
      DIR.x = Math.cos(b) * Math.cos(l);
      DIR.y = Math.cos(b) * Math.sin(l);
      DIR.z = Math.sin(b);
    }

    /* --- heliocentric position from orbital elements ---------------------- */
    type Elements = {
      p: Planet;
      rgb: [number, number, number];
      e: number; // eccentricity actually drawn
      aDraw: number; // semi-major axis after the radial squeeze
      period: number; // years, from Kepler's third law on the drawn spacing
      n: number; // mean motion, radians per year
      cw: number; sw: number; ci: number; si: number; cn: number; sn: number;
      M0: number;
      /** Turns the orbit plane onto the one square to the Sun's course. */
      swing: number[] | null;
    };

    function elementsOf(
      p: Planet, index: number, gamma: number, spread: number, ecc: number, align: number
    ): Elements {
      const aDraw = Math.pow(p.a, gamma);
      // Kepler's third law: P² ∝ a³, so P = a^1.5 years and n = 2π/P.
      const period = Math.pow(aDraw, 1.5);
      const fan = PLANE_FAN[index % PLANE_FAN.length];
      const inc = (p.i + spread * fan[0]) * RAD;
      const node = (p.node + spread * fan[1]) * RAD;
      const target = ECC_FAN[index % ECC_FAN.length];
      const ci = Math.cos(inc), si = Math.sin(inc);
      const cn = Math.cos(node), sn = Math.sin(node);
      return {
        p,
        rgb: parseRGB(p.color),
        e: Math.min(0.85, p.e + ecc * (target - p.e)),
        aDraw,
        period,
        n: TAU / period,
        cw: Math.cos(p.peri * RAD), sw: Math.sin(p.peri * RAD),
        ci, si, cn, sn,
        M0: p.M0 * RAD,
        swing: align > 0 ? swingToCourse(si * sn, -si * cn, ci, align) : null,
      };
    }

    /**
     * Builds the rotation that swings an orbit plane toward the one standing
     * square to the Sun's course. Feed it the plane's normal; at align = 1 the
     * normal ends up along the course, which makes every wake a true helix
     * about it, and all the helices share one axis.
     */
    function swingToCourse(
      nx: number, ny: number, nz: number, align: number
    ): number[] | null {
      // Aim at whichever end of the course the plane already leans toward, so
      // an orbit is never turned inside out.
      const s = nx * DIR.x + ny * DIR.y + nz * DIR.z >= 0 ? 1 : -1;
      let tx = nx + align * (s * DIR.x - nx);
      let ty = ny + align * (s * DIR.y - ny);
      let tz = nz + align * (s * DIR.z - nz);
      const tl = Math.hypot(tx, ty, tz);
      if (tl < 1e-9) return null;
      tx /= tl; ty /= tl; tz /= tl;
      // Rodrigues: rotate n onto the blended normal, about their cross product.
      let ax = ny * tz - nz * ty;
      let ay = nz * tx - nx * tz;
      let az = nx * ty - ny * tx;
      const al = Math.hypot(ax, ay, az);
      if (al < 1e-9) return null;
      ax /= al; ay /= al; az /= al;
      const c = Math.max(-1, Math.min(1, nx * tx + ny * ty + nz * tz));
      const sA = al > 1 ? 1 : al;
      const k = 1 - c;
      return [
        c + ax * ax * k, ax * ay * k - az * sA, ax * az * k + ay * sA,
        ay * ax * k + az * sA, c + ay * ay * k, ay * az * k - ax * sA,
        az * ax * k - ay * sA, az * ay * k + ax * sA, c + az * az * k,
      ];
    }

    const R3 = { x: 0, y: 0, z: 0 };
    /** Heliocentric position at mean anomaly M, already squeezed. Writes R3. */
    function helio(el: Elements, M: number, gamma: number) {
      const e = el.e;
      const E = eccentricAnomaly(M, e);
      const xo = el.p.a * (Math.cos(E) - e);
      const yo = el.p.a * Math.sqrt(1 - e * e) * Math.sin(E);
      // turn by the argument of perihelion, inside the orbit plane
      const x1 = xo * el.cw - yo * el.sw;
      const y1 = xo * el.sw + yo * el.cw;
      // tip the plane by the inclination
      const y2 = y1 * el.ci;
      const z2 = y1 * el.si;
      // swing round by the ascending node
      let x = x1 * el.cn - y2 * el.sn;
      let y = x1 * el.sn + y2 * el.cn;
      let z = z2;
      // swing the whole plane toward the Sun's course
      const S = el.swing;
      if (S) {
        const rx = S[0] * x + S[1] * y + S[2] * z;
        const ry = S[3] * x + S[4] * y + S[5] * z;
        const rz = S[6] * x + S[7] * y + S[8] * z;
        x = rx; y = ry; z = rz;
      }
      // Squeeze along the radius. Angles are untouched, so the tilt of every
      // orbit plane and the offset of the Sun from the ellipse centre survive.
      if (gamma !== 1) {
        const r = Math.sqrt(x * x + y * y + z * z);
        if (r > 1e-9) {
          const s = Math.pow(r, gamma - 1);
          x *= s; y *= s; z *= s;
        }
      }
      R3.x = x; R3.y = y; R3.z = z;
    }

    let elems: Elements[] = [];
    let elemsKey = "";
    function syncElements() {
      const C = props.current;
      const key =
        C.compress + "/" + C.planeSpread + "/" + C.eccentricity + "/" +
        C.alignToCourse + "/" + C.apex[0] + "," + C.apex[1] + "/" +
        C.planets.map((p) => p.name + p.a + p.e + p.color).join("|");
      if (key === elemsKey) return;
      elemsKey = key;
      elems = C.planets.map((p, idx) => elementsOf(p, idx, C.compress, C.planeSpread, C.eccentricity, C.alignToCourse));
    }

    /* --- background stars ------------------------------------------------- */
    // Kept in world coords, so turning the camera does not drag them along.
    // Depth parallax is real: near stars slide, far ones barely stir. Distances
    // are compressed — the true nearest star is 270,000 AU away and would not
    // shift by a pixel in a lifetime of watching.
    // Depth range of the star box, in camera distances. Real stars sit some
    // 270,000 AU away and would not shift by a pixel in a lifetime of
    // watching, so the range here is squeezed hard. The gradient is honest
    // though: near stars slide, far ones barely stir.
    let D_NEAR = 60;
    let D_FAR = 1400;
    const EMPTY = new Float64Array(0);
    let sx = EMPTY, sy = EMPTY, sz = EMPTY, sMag = EMPTY, sPhase = EMPTY;
    let sTint = new Uint8Array(0);
    let starN = 0;
    let rand = mulberry32(0xc0ffee);

    /** Place one star at a random spot in the frustum, at optional fixed depth. */
    function seedStar(k: number, depth?: number, edge?: 0 | 1 | 2 | 3) {
      const d =
        depth ?? D_NEAR * Math.pow(D_FAR / D_NEAR, Math.pow(rand(), 0.55));
      // screen offset in px, then back out to world units at that depth
      const halfW = (width * 0.5) * 1.15;
      const halfH = (height * 0.5) * 1.15;
      let ox: number, oy: number;
      if (edge === 0) { ox = -halfW; oy = (rand() * 2 - 1) * halfH; }
      else if (edge === 1) { ox = halfW; oy = (rand() * 2 - 1) * halfH; }
      else if (edge === 2) { ox = (rand() * 2 - 1) * halfW; oy = -halfH; }
      else if (edge === 3) { ox = (rand() * 2 - 1) * halfW; oy = halfH; }
      else { ox = (rand() * 2 - 1) * halfW; oy = (rand() * 2 - 1) * halfH; }
      const scale = d / (camDist * pxPerAU);
      const vx = ox * scale;
      const vy = -oy * scale;
      const vz = camDist - d;
      // view basis → world, then offset by where the Sun is right now
      const wx = vx * RIGHT.x + vy * UP.x + vz * FWD.x + DIR.x * dist;
      const wy = vx * RIGHT.y + vy * UP.y + vz * FWD.y + DIR.y * dist;
      const wz = vx * RIGHT.z + vy * UP.z + vz * FWD.z + DIR.z * dist;
      sx[k] = wx; sy[k] = wy; sz[k] = wz;
      sMag[k] = Math.pow(rand(), 2.4);
      sPhase[k] = rand() * TAU;
      const t = rand();
      sTint[k] = t > 0.9 ? 1 : t < 0.08 ? 2 : 0;
    }

    /** Distance the Sun has travelled, in AU. */
    let dist = 0;

    function buildStars() {
      starN = Math.max(
        60,
        Math.round(props.current.starCount * Math.min(2, (width * height) / (1440 * 900)))
      );
      sx = new Float64Array(starN);
      sy = new Float64Array(starN);
      sz = new Float64Array(starN);
      sMag = new Float64Array(starN);
      sPhase = new Float64Array(starN);
      sTint = new Uint8Array(starN);
      rand = mulberry32(0xc0ffee);
      for (let k = 0; k < starN; k++) seedStar(k);
    }

    /* --- sprites ---------------------------------------------------------- */
    const glowCache = new Map<string, HTMLCanvasElement>();
    function glowSprite(color: string): HTMLCanvasElement {
      const hit = glowCache.get(color);
      if (hit) return hit;
      const R = 64;
      const c = document.createElement("canvas");
      c.width = c.height = R * 2;
      const g2 = c.getContext("2d")!;
      const [r, g, b] = parseRGB(color);
      const grad = g2.createRadialGradient(R, R, 0, R, R, R);
      grad.addColorStop(0, "rgba(255,255,255,1)");
      grad.addColorStop(0.15, `rgba(${r},${g},${b},0.95)`);
      grad.addColorStop(0.36, `rgba(${r},${g},${b},0.26)`);
      grad.addColorStop(0.66, `rgba(${r},${g},${b},0.05)`);
      grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
      g2.fillStyle = grad;
      g2.fillRect(0, 0, R * 2, R * 2);
      glowCache.set(color, c);
      return c;
    }

    /* --- sizing ----------------------------------------------------------- */
    function resize() {
      const rect = host!.getBoundingClientRect();
      const w = Math.max(1, rect.width);
      const h = Math.max(1, rect.height);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (w === width && h === height) return;
      width = w;
      height = h;
      canvas!.width = Math.round(w * dpr);
      canvas!.height = Math.round(h * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      layout();
      buildStars();
    }

    function layout() {
      const C = props.current;
      pxPerAU = (Math.min(width, height) * 0.5) / C.viewRadius;
      camDist = C.viewRadius * 3.1;
      D_NEAR = camDist * 5;
      D_FAR = camDist * 120;
      setApex(C.apex[0], C.apex[1]);
      setCamera(C.spin, C.tilt, C.roll);
    }

    /* --- pointer ---------------------------------------------------------- */
    let pointerX = 0, pointerY = 0, camX = 0, camY = 0;
    function onPointer(ev: PointerEvent) {
      if (!props.current.interactive) return;
      const rect = host!.getBoundingClientRect();
      pointerX = ((ev.clientX - rect.left) / rect.width - 0.5) * 2;
      pointerY = ((ev.clientY - rect.top) / rect.height - 0.5) * 2;
    }
    function onLeave() { pointerX = 0; pointerY = 0; }

    /* --- the star at the centre ------------------------------------------ */
    function drawSun(k: number, t: number) {
      const [r, g, b] = parseRGB(props.current.sunColor);
      const pulse = 1 + Math.sin(t * 2.1) * 0.02;
      // The real Sun is 0.0093 AU across — a fifth of a pixel here. What you
      // actually see at this range is its glare, so that is what we draw.
      const R = Math.max(5, Math.min(width, height) * 0.013) * pulse;

      // A tight halo, not a wash: the disc carries the light and the glow only
      // sits close around it.
      const haze = ctx!.createRadialGradient(cx, cy, 0, cx, cy, R * 14);
      haze.addColorStop(0, `rgba(${r},${g},${b},${0.05 * k})`);
      haze.addColorStop(0.4, `rgba(255,190,110,${0.014 * k})`);
      haze.addColorStop(1, "rgba(255,160,80,0)");
      ctx!.fillStyle = haze;
      ctx!.beginPath();
      ctx!.arc(cx, cy, R * 14, 0, TAU);
      ctx!.fill();

      const outer = ctx!.createRadialGradient(cx, cy, 0, cx, cy, R * 4.6);
      outer.addColorStop(0, `rgba(${r},${g},${b},${0.34 * k})`);
      outer.addColorStop(0.3, `rgba(255,222,160,${0.1 * k})`);
      outer.addColorStop(0.62, `rgba(255,196,110,${0.025 * k})`);
      outer.addColorStop(1, "rgba(255,180,90,0)");
      ctx!.fillStyle = outer;
      ctx!.beginPath();
      ctx!.arc(cx, cy, R * 4.6, 0, TAU);
      ctx!.fill();

      const bloom = ctx!.createRadialGradient(cx, cy, 0, cx, cy, R * 2.3);
      bloom.addColorStop(0, `rgba(255,255,255,${k})`);
      bloom.addColorStop(0.42, `rgba(255,252,240,${0.7 * k})`);
      bloom.addColorStop(0.72, `rgba(${r},${g},${b},${0.22 * k})`);
      bloom.addColorStop(1, "rgba(255,210,140,0)");
      ctx!.fillStyle = bloom;
      ctx!.beginPath();
      ctx!.arc(cx, cy, R * 2.3, 0, TAU);
      ctx!.fill();

      ctx!.fillStyle = "rgba(255,255,255,1)";
      ctx!.beginPath();
      ctx!.arc(cx, cy, R, 0, TAU);
      ctx!.fill();
    }

    /* --- one frame -------------------------------------------------------- */

    function render(t: number) {
      const C = props.current;
      const k = C.glow;
      // layout first: it sets the course, which the element maths needs.
      layout();
      syncElements();

      // ease the camera toward the pointer
      camX += (pointerX - camX) * 0.04;
      camY += (pointerY - camY) * 0.04;
      setCamera(C.spin + camX * 7, C.tilt + camY * 5, C.roll);

      dist = C.driftSpeed * t;

      cx = width * C.focus[0];
      cy = height * C.focus[1];
      // Put the Sun a little ahead of centre so the spirals have room behind it.
      project(DIR.x, DIR.y, DIR.z);
      if (P.ok) {
        const dxs = P.x - cx;
        const dys = P.y - cy;
        const len = Math.hypot(dxs, dys) || 1;
        const push = Math.min(width, height) * C.lead;
        cx += (dxs / len) * push;
        cy += (dys / len) * push;
      }

      ctx!.globalCompositeOperation = "source-over";
      ctx!.fillStyle = "#000000";
      ctx!.fillRect(0, 0, width, height);
      ctx!.globalCompositeOperation = "lighter";

      /* stars ------------------------------------------------------------- */
      const dRef = D_NEAR * 3.3;
      const left = -width * 0.12;
      const right = width * 1.12;
      const top = -height * 0.12;
      const bottom = height * 1.12;
      for (let s = 0; s < starN; s++) {
        // position relative to the Sun, which is where the camera rides
        project(sx[s] - DIR.x * dist, sy[s] - DIR.y * dist, sz[s] - DIR.z * dist);
        if (!P.ok || P.depth > D_FAR * 1.25) {
          seedStar(s);
          continue;
        }
        if (P.x < left || P.x > right || P.y < top || P.y > bottom) {
          // gone off an edge: bring it back in on the opposite side
          seedStar(
            s,
            undefined,
            P.x < left ? 1 : P.x > right ? 0 : P.y < top ? 3 : 2
          );
          continue;
        }
        if (P.depth < D_NEAR * 0.75) continue;

        // apparent brightness falls off with distance, and fades out at the
        // far wall so nothing pops in
        const near = Math.min(1, (P.depth - D_NEAR * 0.75) / (D_NEAR * 0.6));
        const far = 1 - Math.max(0, (P.depth - D_FAR * 0.78) / (D_FAR * 0.32));
        let a = (0.2 + sMag[s] * 1.05) * Math.pow(dRef / P.depth, 0.8) * near * far;
        if (a <= 0.012) continue;
        a *= 0.82 + 0.18 * Math.sin(t * 9 + sPhase[s]);
        const col = sTint[s] === 1 ? "175,205,255" : sTint[s] === 2 ? "255,214,170" : "255,255,255";
        const size = Math.min(2.3, 0.55 + sMag[s] * 1.5 * Math.pow(dRef / P.depth, 0.5));
        ctx!.fillStyle = `rgba(${col},${Math.min(1, a).toFixed(3)})`;
        if (size < 1.05) {
          ctx!.fillRect(P.x, P.y, size, size);
        } else {
          ctx!.beginPath();
          ctx!.arc(P.x, P.y, size * 0.5, 0, TAU);
          ctx!.fill();
        }
      }

      /* the Sun's own track through space ---------------------------------- */
      if (C.showSunTrack) {
        // The planets' wakes are clipped for legibility; the Sun's is a
        // straight line, so it can run much further back without any clutter.
        const back = C.driftSpeed * C.trailYears * 1.1;
        project(0, 0, 0);
        const hx = P.x, hy = P.y;
        project(-DIR.x * back, -DIR.y * back, -DIR.z * back);
        if (P.ok) {
          const grad = ctx!.createLinearGradient(hx, hy, P.x, P.y);
          grad.addColorStop(0, `rgba(255,246,214,${k})`);
          grad.addColorStop(0.45, `rgba(255,206,110,${0.55 * k})`);
          grad.addColorStop(1, "rgba(255,180,80,0)");
          ctx!.strokeStyle = grad;
          ctx!.lineCap = "round";
          ctx!.beginPath();
          ctx!.moveTo(hx, hy);
          ctx!.lineTo(P.x, P.y);
          ctx!.lineWidth = 11;
          ctx!.globalAlpha = 0.16;
          ctx!.stroke();
          ctx!.lineWidth = 4;
          ctx!.globalAlpha = 0.3;
          ctx!.stroke();
          ctx!.globalAlpha = 1;
          ctx!.lineWidth = 1.8;
          ctx!.stroke();
        }
      }

      /* orbit guides ------------------------------------------------------- */
      if (C.showOrbits) {
        for (const el of elems) {
          const [r, g, b] = el.rgb;
          const steps = 160;
          ctx!.beginPath();
          let started = false;
          for (let q = 0; q <= steps; q++) {
            // step in eccentric anomaly, then back out the mean anomaly
            const E = (q / steps) * TAU;
            const M = E - el.e * Math.sin(E);
            helio(el, M, C.compress);
            project(R3.x, R3.y, R3.z);
            if (!P.ok) { started = false; continue; }
            if (!started) { ctx!.moveTo(P.x, P.y); started = true; }
            else ctx!.lineTo(P.x, P.y);
          }
          // a soft wide pass under a thin bright one, so the line glows
          ctx!.strokeStyle = `rgba(${r},${g},${b},${0.045 * k})`;
          ctx!.lineWidth = 4;
          ctx!.stroke();
          ctx!.strokeStyle = `rgba(${r},${g},${b},${0.3 * k})`;
          ctx!.lineWidth = 1;
          ctx!.stroke();
        }
      }

      /* planets and their helical wakes ------------------------------------ */
      type Shot = { el: Elements; x: number; y: number; depth: number; s: number };
      const shots: Shot[] = [];

      for (const el of elems) {
        const [r, g, b] = el.rgb;
        const bright = (el.p.glow ?? 1) * k;
        // A wake is a window on the past, the same window for every planet —
        // except that Mercury would wind 5 coils into a scribble, so fast
        // planets get theirs clipped to a few turns.
        const span = Math.min(C.trailYears, C.maxTurns * el.period);
        const turns = span / el.period;
        // Enough samples to keep the tight coils smooth. A stretched orbit
        // needs more: sampling runs on even steps of time, and a planet covers
        // far more ground per step near perihelion.
        const N = Math.max(
          48,
          Math.min(360, Math.ceil(turns * 46 * (1 + 2.2 * el.e)) + 48)
        );

        const xs = new Float64Array(N + 1);
        const ys = new Float64Array(N + 1);
        const okArr = new Uint8Array(N + 1);
        for (let q = 0; q <= N; q++) {
          const age = (1 - q / N) * span; // years back from now
          const M = el.M0 + el.n * (t - age);
          helio(el, M, C.compress);
          // where the planet really was: its place around the Sun at that
          // moment, minus how far the Sun has moved since. Ellipse plus drift
          // is a helix, which is the track a planet actually cuts in space.
          const back = C.driftSpeed * age;
          project(R3.x - DIR.x * back, R3.y - DIR.y * back, R3.z - DIR.z * back);
          xs[q] = P.x; ys[q] = P.y; okArr[q] = P.ok ? 1 : 0;
          if (q === N && P.ok) {
            shots.push({ el, x: P.x, y: P.y, depth: P.depth, s: P.s });
          }
        }

        const stroke = (from: number, to: number, alpha: number, wide: number) => {
          ctx!.strokeStyle = `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
          ctx!.lineWidth = wide;
          ctx!.beginPath();
          let started = false;
          for (let q = from; q <= to; q++) {
            if (!okArr[q]) { started = false; continue; }
            if (!started) { ctx!.moveTo(xs[q], ys[q]); started = true; }
            else ctx!.lineTo(xs[q], ys[q]);
          }
          ctx!.stroke();
        };

        // The soft halo first, as two unbroken paths near the head.
        ctx!.lineCap = "round";
        ctx!.lineJoin = "round";
        stroke(Math.floor(N * 0.72), N, 0.05 * bright, 6.5);
        stroke(Math.floor(N * 0.86), N, 0.05 * bright, 3);

        // Then the line itself, one segment at a time, each with its own
        // alpha. That gives as many steps in the fade as there are samples —
        // hundreds — instead of the handful you get from stroking the whole
        // path a few times over, where the steps land unevenly and read as
        // breaks. Butt ends are what keeps it seamless: two round ends meeting
        // at a joint would overlap and light up as a bead.
        ctx!.lineCap = "butt";
        ctx!.lineWidth = 1.3;
        for (let q = 0; q < N; q++) {
          if (!okArr[q] || !okArr[q + 1]) continue;
          const f = (q + 1) / N; // 0 at the tail, 1 at the planet
          const a = Math.pow(f, 2.6) * 0.95 * bright;
          if (a < 0.005) continue; // the tail is already invisible here
          ctx!.strokeStyle = `rgba(${r},${g},${b},${a.toFixed(3)})`;
          ctx!.beginPath();
          ctx!.moveTo(xs[q], ys[q]);
          ctx!.lineTo(xs[q + 1], ys[q + 1]);
          ctx!.stroke();
        }
      }

      /* bodies, back to front around the Sun -------------------------------- */
      shots.sort((p, q) => q.depth - p.depth);
      const sizeScale = Math.min(width, height) / 660;
      const drawShot = (o: Shot) => {
        const depth = Math.min(1.3, Math.max(0.5, o.s));
        const size = o.el.p.size * depth * sizeScale;
        const bright = (o.el.p.glow ?? 1) * k;
        const R = size * 3.3;
        ctx!.globalAlpha = Math.min(1, 0.9 * bright);
        ctx!.drawImage(glowSprite(o.el.p.color), o.x - R, o.y - R, R * 2, R * 2);
        ctx!.globalAlpha = 1;
        ctx!.fillStyle = "rgba(255,255,255,0.95)";
        ctx!.beginPath();
        ctx!.arc(o.x, o.y, size * 0.5, 0, TAU);
        ctx!.fill();
      };

      let idx = 0;
      while (idx < shots.length && shots[idx].depth > camDist) drawShot(shots[idx++]);
      drawSun(k, t);
      while (idx < shots.length) drawShot(shots[idx++]);

      ctx!.globalCompositeOperation = "source-over";

      /* the veil that copy sits on ----------------------------------------- */
      if (C.scrim !== "none") {
        const s = Math.max(0, Math.min(1, C.scrimStrength));
        const g =
          C.scrim === "left" ? ctx!.createLinearGradient(0, 0, width, 0)
          : C.scrim === "right" ? ctx!.createLinearGradient(width, 0, 0, 0)
          : C.scrim === "top" ? ctx!.createLinearGradient(0, 0, 0, height)
          : ctx!.createLinearGradient(0, height, 0, 0);
        // Heavy at the edge, then off quickly — a straight ramp would grey the
        // whole frame and flatten the picture. Sampled at twelve stops rather
        // than three: with only a few, the slope changes at each one and the
        // eye picks the kink out as a faint vertical band.
        for (let q = 0; q <= 12; q++) {
          const x = q / 12;
          g.addColorStop(x, `rgba(0,0,0,${(s * Math.pow(1 - x, 2.4)).toFixed(4)})`);
        }
        ctx!.fillStyle = g;
        ctx!.fillRect(0, 0, width, height);
      }
    }

    /* --- loop ------------------------------------------------------------- */
    function tick(now: number) {
      if (!running) return;
      raf = requestAnimationFrame(tick);
      if (!visible) { lastFrame = now; return; }
      const dt = lastFrame ? Math.min(0.05, (now - lastFrame) / 1000) : 0;
      lastFrame = now;
      if (!props.current.paused && !reduced) {
        years += dt / Math.max(0.1, props.current.yearSeconds);
      }
      render(years);
    }

    resize();
    render(years);
    if (!reduced) raf = requestAnimationFrame(tick);

    const ro = new ResizeObserver(() => {
      resize();
      if (reduced || props.current.paused) render(years);
    });
    ro.observe(host);

    const io = new IntersectionObserver(
      (entries) => { visible = entries[0]?.isIntersecting ?? true; },
      { threshold: 0 }
    );
    io.observe(host);

    const onVisibility = () => { visible = !document.hidden; lastFrame = 0; };
    document.addEventListener("visibilitychange", onVisibility);
    host.addEventListener("pointermove", onPointer);
    host.addEventListener("pointerleave", onLeave);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      host.removeEventListener("pointermove", onPointer);
      host.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <div
      ref={hostRef}
      className={`relative isolate h-full w-full overflow-hidden bg-black ${className}`}
      {...rest}
    >
      <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 h-full w-full" />
      {children ? <div className="relative z-10 h-full w-full">{children}</div> : null}
    </div>
  );
}

export default OrbitalHeroSection;


demo.tsx
"use client";

import { useEffect, useState } from "react";
import { OrbitalHeroSection } from "@/components/ui/orbital-hero-section";

/** True while the viewport is narrow. Drives the layout swap below. */
function useNarrow(query = "(max-width: 767px)") {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const m = window.matchMedia(query);
    const sync = () => setNarrow(m.matches);
    sync();
    m.addEventListener("change", sync);
    return () => m.removeEventListener("change", sync);
  }, [query]);
  return narrow;
}

/**
 * A hero built around the background rather than laid on top of it.
 *
 * Three things keep the copy readable without dimming the picture:
 *
 * 1. The Sun is pushed off centre with `focus`, so the busy half and the
 *    reading half never overlap.
 * 2. `scrim` darkens the edge the text sits on and fades out before the coils,
 *    which a flat overlay could not do without greying the whole frame.
 * 3. The text block is capped in width, so a long line never runs into the art.
 *
 * On a narrow screen there is no room to put those halves side by side, so the
 * whole thing turns through 90°: art low, copy high, veil from the top.
 */
export default function OrbitalHeroSectionDemo() {
  const narrow = useNarrow();

  return (
    <section className="relative min-h-[92svh] w-full md:min-h-[720px]">
      <OrbitalHeroSection
        focus={narrow ? [0.5, 0.86] : [0.74, 0.42]}
        scrim={narrow ? "top" : "left"}
        scrimStrength={narrow ? 0.94 : 0.92}
        viewRadius={narrow ? 2.1 : 3.1}
        lead={narrow ? 0.05 : 0.12}
        // A phone has no room to stand the art beside the copy: the text alone
        // takes most of the screen. So there it drops back to a quiet texture.
        glow={narrow ? 0.5 : 1}
      >
        <div className="flex h-full min-h-[92svh] items-start px-6 pt-14 sm:px-10 md:min-h-[720px] md:items-center md:pt-0 lg:px-20">
          <div className="max-w-[34rem]">
            <h1 className="text-[2.5rem] font-light leading-[1.05] tracking-[-0.03em] text-white sm:text-6xl lg:text-[4.25rem]">
              Nothing here
              <br />
              stands still
            </h1>

            <p className="mt-6 max-w-md text-[0.95rem] leading-relaxed text-white/60 md:mt-7">
              The Sun is running, and the planets chase it. Every track you see
              is a helix.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3 md:mt-10">
              <a
                href="#"
                className="rounded-full bg-white px-6 py-3 text-sm font-medium text-black transition hover:bg-white/90"
              >
                Get started
              </a>
              <a
                href="#"
                className="rounded-full border border-white/20 px-6 py-3 text-sm text-white/80 transition hover:border-white/40 hover:text-white"
              >
                Read the maths
              </a>
            </div>
          </div>
        </div>
      </OrbitalHeroSection>
    </section>
  );
}

```

Implementation Guidelines
 1. Analyze the component structure and identify all required dependencies
 2. Review the component's argumens and state
 3. Identify any required context providers or hooks and install them
 4. Questions to Ask
 - What data/props will be passed to this component?
 - Are there any specific state management requirements?
 - Are there any required assets (images, icons, etc.)?
 - What is the expected responsive behavior?
 - What is the best place to use this component in the app?

Steps to integrate
 0. Copy paste all the code above in the correct directories
 1. Install external dependencies
 2. Fill image assets with Unsplash stock images you know exist
 3. Use lucide-react icons for svgs or logos if component requires them
// OPTIONAL: paste the 21st.dev "Copy prompt" output for Orbital Hero Section here (reference only)
```

```tsx
You are given a task to integrate an existing React component in the codebase

The codebase should support:
- shadcn project structure  
- Tailwind CSS
- Typescript

If it doesn't, provide instructions on how to setup project via shadcn CLI, install Tailwind or Typescript.

Determine the default path for components and styles. 
If default path for components is not /components/ui, provide instructions on why it's important to create this folder
Copy-paste this component to /components/ui folder:
```tsx
cinematic-landing-hero.tsx
// src/components/ui/cinematic-hero.tsx
"use client";

import React, { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { cn } from "@/lib/utils";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

const INJECTED_STYLES = `
  .gsap-reveal { visibility: hidden; }

  /* Environment Overlays */
  .film-grain {
      position: absolute; inset: 0; width: 100%; height: 100%;
      pointer-events: none; z-index: 50; opacity: 0.05; mix-blend-mode: overlay;
      background: url('data:image/svg+xml;utf8,<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg"><filter id="noiseFilter"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" stitchTiles="stitch"/></filter><rect width="100%" height="100%" filter="url(%23noiseFilter)"/></svg>');
  }

  .bg-grid-theme {
      background-size: 60px 60px;
      background-image: 
          linear-gradient(to right, color-mix(in srgb, var(--color-foreground) 5%, transparent) 1px, transparent 1px),
          linear-gradient(to bottom, color-mix(in srgb, var(--color-foreground) 5%, transparent) 1px, transparent 1px);
      mask-image: radial-gradient(ellipse at center, black 0%, transparent 70%);
      -webkit-mask-image: radial-gradient(ellipse at center, black 0%, transparent 70%);
  }

  /* -------------------------------------------------------------------
     PHYSICAL SKEUOMORPHIC MATERIALS (Restored 3D Depth)
  ---------------------------------------------------------------------- */
  
  /* OUTSIDE THE CARD: Theme-aware text (Shadow in Light Mode, Glow in Dark Mode) */
  .text-3d-matte {
      color: var(--color-foreground);
      text-shadow: 
          0 10px 30px color-mix(in srgb, var(--color-foreground) 20%, transparent), 
          0 2px 4px color-mix(in srgb, var(--color-foreground) 10%, transparent);
  }

  .text-silver-matte {
      background: linear-gradient(180deg, var(--color-foreground) 0%, color-mix(in srgb, var(--color-foreground) 40%, transparent) 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      transform: translateZ(0); /* Hardware acceleration to prevent WebKit clipping bug */
      filter: 
          drop-shadow(0px 10px 20px color-mix(in srgb, var(--color-foreground) 15%, transparent)) 
          drop-shadow(0px 2px 4px color-mix(in srgb, var(--color-foreground) 10%, transparent));
  }

  /* INSIDE THE CARD: Hardcoded Silver/White for the dark background, deep rich shadows */
  .text-card-silver-matte {
      background: linear-gradient(180deg, #FFFFFF 0%, #A1A1AA 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      transform: translateZ(0);
      filter: 
          drop-shadow(0px 12px 24px rgba(0,0,0,0.8)) 
          drop-shadow(0px 4px 8px rgba(0,0,0,0.6));
  }

  /* Deep Physical Card with Dynamic Mouse Lighting */
  .premium-depth-card {
      background: linear-gradient(145deg, #162C6D 0%, #0A101D 100%);
      box-shadow: 
          0 40px 100px -20px rgba(0, 0, 0, 0.9),
          0 20px 40px -20px rgba(0, 0, 0, 0.8),
          inset 0 1px 2px rgba(255, 255, 255, 0.2),
          inset 0 -2px 4px rgba(0, 0, 0, 0.8);
      border: 1px solid rgba(255, 255, 255, 0.04);
      position: relative;
  }

  .card-sheen {
      position: absolute; inset: 0; border-radius: inherit; pointer-events: none; z-index: 50;
      background: radial-gradient(800px circle at var(--mouse-x, 50%) var(--mouse-y, 50%), rgba(255,255,255,0.06) 0%, transparent 40%);
      mix-blend-mode: screen; transition: opacity 0.3s ease;
  }

  /* Realistic iPhone Mockup Hardware */
  .iphone-bezel {
      background-color: #111;
      box-shadow: 
          inset 0 0 0 2px #52525B, 
          inset 0 0 0 7px #000, 
          0 40px 80px -15px rgba(0,0,0,0.9),
          0 15px 25px -5px rgba(0,0,0,0.7);
      transform-style: preserve-3d;
  }

  .hardware-btn {
      background: linear-gradient(90deg, #404040 0%, #171717 100%);
      box-shadow: 
          -2px 0 5px rgba(0,0,0,0.8),
          inset -1px 0 1px rgba(255,255,255,0.15),
          inset 1px 0 2px rgba(0,0,0,0.8);
      border-left: 1px solid rgba(255,255,255,0.05);
  }
  
  .screen-glare {
      background: linear-gradient(110deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0) 45%);
  }

  .widget-depth {
      background: linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%);
      box-shadow: 
          0 10px 20px rgba(0,0,0,0.3),
          inset 0 1px 1px rgba(255,255,255,0.05),
          inset 0 -1px 1px rgba(0,0,0,0.5);
      border: 1px solid rgba(255,255,255,0.03);
  }

  .floating-ui-badge {
      background: linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.01) 100%);
      backdrop-filter: blur(24px); 
      -webkit-backdrop-filter: blur(24px);
      box-shadow: 
          0 0 0 1px rgba(255, 255, 255, 0.1),
          0 25px 50px -12px rgba(0, 0, 0, 0.8),
          inset 0 1px 1px rgba(255,255,255,0.2),
          inset 0 -1px 1px rgba(0,0,0,0.5);
  }

  /* Physical Tactile Buttons */
  .btn-modern-light, .btn-modern-dark {
      transition: all 0.4s cubic-bezier(0.25, 1, 0.5, 1);
  }
  .btn-modern-light {
      background: linear-gradient(180deg, #FFFFFF 0%, #F1F5F9 100%);
      color: #0F172A;
      box-shadow: 0 0 0 1px rgba(0,0,0,0.05), 0 2px 4px rgba(0,0,0,0.1), 0 12px 24px -4px rgba(0,0,0,0.3), inset 0 1px 1px rgba(255,255,255,1), inset 0 -3px 6px rgba(0,0,0,0.06);
  }
  .btn-modern-light:hover {
      transform: translateY(-3px);
      box-shadow: 0 0 0 1px rgba(0,0,0,0.05), 0 6px 12px -2px rgba(0,0,0,0.15), 0 20px 32px -6px rgba(0,0,0,0.4), inset 0 1px 1px rgba(255,255,255,1), inset 0 -3px 6px rgba(0,0,0,0.06);
  }
  .btn-modern-light:active {
      transform: translateY(1px);
      background: linear-gradient(180deg, #F1F5F9 0%, #E2E8F0 100%);
      box-shadow: 0 0 0 1px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.1), inset 0 3px 6px rgba(0,0,0,0.1), inset 0 0 0 1px rgba(0,0,0,0.02);
  }
  .btn-modern-dark {
      background: linear-gradient(180deg, #27272A 0%, #18181B 100%);
      color: #FFFFFF;
      box-shadow: 0 0 0 1px rgba(255,255,255,0.1), 0 2px 4px rgba(0,0,0,0.6), 0 12px 24px -4px rgba(0,0,0,0.9), inset 0 1px 1px rgba(255,255,255,0.15), inset 0 -3px 6px rgba(0,0,0,0.8);
  }
  .btn-modern-dark:hover {
      transform: translateY(-3px);
      background: linear-gradient(180deg, #3F3F46 0%, #27272A 100%);
      box-shadow: 0 0 0 1px rgba(255,255,255,0.15), 0 6px 12px -2px rgba(0,0,0,0.7), 0 20px 32px -6px rgba(0,0,0,1), inset 0 1px 1px rgba(255,255,255,0.2), inset 0 -3px 6px rgba(0,0,0,0.8);
  }
  .btn-modern-dark:active {
      transform: translateY(1px);
      background: #18181B;
      box-shadow: 0 0 0 1px rgba(255,255,255,0.05), inset 0 3px 8px rgba(0,0,0,0.9), inset 0 0 0 1px rgba(0,0,0,0.5);
  }

  .progress-ring {
      transform: rotate(-90deg);
      transform-origin: center;
      stroke-dasharray: 402;
      stroke-dashoffset: 402;
      stroke-linecap: round;
  }
`;

export interface CinematicHeroProps extends React.HTMLAttributes<HTMLDivElement> {
  brandName?: string;
  tagline1?: string;
  tagline2?: string;
  cardHeading?: string;
  cardDescription?: React.ReactNode;
  metricValue?: number;
  metricLabel?: string;
  ctaHeading?: string;
  ctaDescription?: string;
}

export function CinematicHero({ 
  brandName = "Sobers",
  tagline1 = "Track the journey,",
  tagline2 = "not just the days.",
  cardHeading = "Accountability, redefined.",
  cardDescription = <><span className="text-white font-semibold">Sobers</span> empowers sponsors and sponsees in 12-step recovery programs with structured accountability, precise sobriety tracking, and beautiful visual timelines.</>,
  metricValue = 365,
  metricLabel = "Days Sober",
  ctaHeading = "Start your recovery.",
  ctaDescription = "Join thousands of others in the 12-step program and take control of your timeline today.",
  className, 
  ...props 
}: CinematicHeroProps) {
  
  const containerRef = useRef<HTMLDivElement>(null);
  const mainCardRef = useRef<HTMLDivElement>(null);
  const mockupRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<number>(0);

  // 1. High-Performance Mouse Interaction Logic (Using requestAnimationFrame)
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (window.scrollY > window.innerHeight * 2) return;

      cancelAnimationFrame(requestRef.current);
      
      requestRef.current = requestAnimationFrame(() => {
        if (mainCardRef.current && mockupRef.current) {
          const rect = mainCardRef.current.getBoundingClientRect();
          const mouseX = e.clientX - rect.left;
          const mouseY = e.clientY - rect.top;
          
          mainCardRef.current.style.setProperty("--mouse-x", `${mouseX}px`);
          mainCardRef.current.style.setProperty("--mouse-y", `${mouseY}px`);

          const xVal = (e.clientX / window.innerWidth - 0.5) * 2;
          const yVal = (e.clientY / window.innerHeight - 0.5) * 2;

          gsap.to(mockupRef.current, {
            rotationY: xVal * 12,
            rotationX: -yVal * 12,
            ease: "power3.out",
            duration: 1.2,
          });
        }
      });
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      cancelAnimationFrame(requestRef.current);
    };
  },[]);

  // 2. Complex Cinematic Scroll Timeline
  useEffect(() => {
    const isMobile = window.innerWidth < 768;

    const ctx = gsap.context(() => {
      gsap.set(".text-track", { autoAlpha: 0, y: 60, scale: 0.85, filter: "blur(20px)", rotationX: -20 });
      gsap.set(".text-days", { autoAlpha: 1, clipPath: "inset(0 100% 0 0)" });
      gsap.set(".main-card", { y: window.innerHeight + 200, autoAlpha: 1 });
      gsap.set([".card-left-text", ".card-right-text", ".mockup-scroll-wrapper", ".floating-badge", ".phone-widget"], { autoAlpha: 0 });
      gsap.set(".cta-wrapper", { autoAlpha: 0, scale: 0.8, filter: "blur(30px)" });

      const introTl = gsap.timeline({ delay: 0.3 });
      introTl
        .to(".text-track", { duration: 1.8, autoAlpha: 1, y: 0, scale: 1, filter: "blur(0px)", rotationX: 0, ease: "expo.out" })
        .to(".text-days", { duration: 1.4, clipPath: "inset(0 0% 0 0)", ease: "power4.inOut" }, "-=1.0");

      const scrollTl = gsap.timeline({
        scrollTrigger: {
          trigger: containerRef.current,
          start: "top top",
          end: "+=7000",
          pin: true,
          scrub: 1,
          anticipatePin: 1,
        },
      });

      scrollTl
        .to([".hero-text-wrapper", ".bg-grid-theme"], { scale: 1.15, filter: "blur(20px)", opacity: 0.2, ease: "power2.inOut", duration: 2 }, 0)
        .to(".main-card", { y: 0, ease: "power3.inOut", duration: 2 }, 0)
        .to(".main-card", { width: "100%", height: "100%", borderRadius: "0px", ease: "power3.inOut", duration: 1.5 })
        .fromTo(".mockup-scroll-wrapper",
          { y: 300, z: -500, rotationX: 50, rotationY: -30, autoAlpha: 0, scale: 0.6 },
          { y: 0, z: 0, rotationX: 0, rotationY: 0, autoAlpha: 1, scale: 1, ease: "expo.out", duration: 2.5 }, "-=0.8"
        )
        .fromTo(".phone-widget", { y: 40, autoAlpha: 0, scale: 0.95 }, { y: 0, autoAlpha: 1, scale: 1, stagger: 0.15, ease: "back.out(1.2)", duration: 1.5 }, "-=1.5")
        .to(".progress-ring", { strokeDashoffset: 60, duration: 2, ease: "power3.inOut" }, "-=1.2")
        .to(".counter-val", { innerHTML: metricValue, snap: { innerHTML: 1 }, duration: 2, ease: "expo.out" }, "-=2.0")
        .fromTo(".floating-badge", { y: 100, autoAlpha: 0, scale: 0.7, rotationZ: -10 }, { y: 0, autoAlpha: 1, scale: 1, rotationZ: 0, ease: "back.out(1.5)", duration: 1.5, stagger: 0.2 }, "-=2.0")
        .fromTo(".card-left-text", { x: -50, autoAlpha: 0 }, { x: 0, autoAlpha: 1, ease: "power4.out", duration: 1.5 }, "-=1.5")
        .fromTo(".card-right-text", { x: 50, autoAlpha: 0, scale: 0.8 }, { x: 0, autoAlpha: 1, scale: 1, ease: "expo.out", duration: 1.5 }, "<")
        .to({}, { duration: 2.5 })
        .set(".hero-text-wrapper", { autoAlpha: 0 })
        .set(".cta-wrapper", { autoAlpha: 1 }) 
        .to({}, { duration: 1.5 })
        .to([".mockup-scroll-wrapper", ".floating-badge", ".card-left-text", ".card-right-text"], {
          scale: 0.9, y: -40, z: -200, autoAlpha: 0, ease: "power3.in", duration: 1.2, stagger: 0.05,
        })
        // Responsive card pullback sizing
        .to(".main-card", { 
          width: isMobile ? "92vw" : "85vw", 
          height: isMobile ? "92vh" : "85vh", 
          borderRadius: isMobile ? "32px" : "40px", 
          ease: "expo.inOut", 
          duration: 1.8 
        }, "pullback") 
        .to(".cta-wrapper", { scale: 1, filter: "blur(0px)", ease: "expo.inOut", duration: 1.8 }, "pullback")
        .to(".main-card", { y: -window.innerHeight - 300, ease: "power3.in", duration: 1.5 });

    }, containerRef);

    return () => ctx.revert();
  },[metricValue]); 

  return (
    <div
      ref={containerRef}
      className={cn("relative w-screen h-screen overflow-hidden flex items-center justify-center bg-background text-foreground font-sans antialiased", className)}
      style={{ perspective: "1500px" }}
      {...props}
    >
      <style dangerouslySetInnerHTML={{ __html: INJECTED_STYLES }} />
      <div className="film-grain" aria-hidden="true" />
      <div className="bg-grid-theme absolute inset-0 z-0 pointer-events-none opacity-50" aria-hidden="true" />

      {/* BACKGROUND LAYER: Hero Texts */}
      <div className="hero-text-wrapper absolute z-10 flex flex-col items-center justify-center text-center w-screen px-4 will-change-transform transform-style-3d">
        <h1 className="text-track gsap-reveal text-3d-matte text-5xl md:text-7xl lg:text-[6rem] font-bold tracking-tight mb-2">
          {tagline1}
        </h1>
        <h1 className="text-days gsap-reveal text-silver-matte text-5xl md:text-7xl lg:text-[6rem] font-extrabold tracking-tighter">
          {tagline2}
        </h1>
      </div>

      {/* BACKGROUND LAYER 2: Tactile CTA Buttons */}
      <div className="cta-wrapper absolute z-10 flex flex-col items-center justify-center text-center w-screen px-4 gsap-reveal pointer-events-auto will-change-transform">
        <h2 className="text-4xl md:text-6xl lg:text-7xl font-bold mb-6 tracking-tight text-silver-matte">
          {ctaHeading}
        </h2>
        <p className="text-muted-foreground text-lg md:text-xl mb-12 max-w-xl mx-auto font-light leading-relaxed">
          {ctaDescription}
        </p>
        <div className="flex flex-col sm:flex-row gap-6">
          <a href="#" aria-label="Download on the App Store" className="btn-modern-light flex items-center justify-center gap-3 px-8 py-4 rounded-[1.25rem] group focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
            {/* Authentic Apple App Store Logo SVG */}
            <svg className="w-8 h-8 transition-transform group-hover:scale-105" fill="currentColor" viewBox="0 0 384 512" aria-hidden="true">
              <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/>
            </svg>
            <div className="text-left">
              <div className="text-[10px] font-bold tracking-wider text-neutral-500 uppercase mb-[-2px]">Download on the</div>
              <div className="text-xl font-bold leading-none tracking-tight">App Store</div>
            </div>
          </a>
          <a href="#" aria-label="Get it on Google Play" className="btn-modern-dark flex items-center justify-center gap-3 px-8 py-4 rounded-[1.25rem] group focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-background">
            {/* Authentic Google Play Store Solid Logo SVG */}
            <svg className="w-7 h-7 transition-transform group-hover:scale-105" fill="currentColor" viewBox="0 0 512 512" aria-hidden="true">
               <path d="M325.3 234.3L104.6 13l280.8 161.2-60.1 60.1zM47 0C34 6.8 25.3 19.2 25.3 35.3v441.3c0 16.1 8.7 28.5 21.7 35.3l256.6-256L47 0zm425.2 225.6l-58.9-34.1-65.7 64.5 65.7 64.5 60.1-34.1c18-14.3 18-46.5-1.2-60.8zM104.6 499l280.8-161.2-60.1-60.1L104.6 499z"/>
            </svg>
            <div className="text-left">
              <div className="text-[10px] font-bold tracking-wider text-neutral-400 uppercase mb-[-2px]">Get it on</div>
              <div className="text-xl font-bold leading-none tracking-tight">Google Play</div>
            </div>
          </a>
        </div>
      </div>

      {/* FOREGROUND LAYER: The Physical Deep Blue Card */}
      <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none" style={{ perspective: "1500px" }}>
        <div
          ref={mainCardRef}
          className="main-card premium-depth-card relative overflow-hidden gsap-reveal flex items-center justify-center pointer-events-auto w-[92vw] md:w-[85vw] h-[92vh] md:h-[85vh] rounded-[32px] md:rounded-[40px]"
        >
          <div className="card-sheen" aria-hidden="true" />

          {/* DYNAMIC RESPONSIVE GRID: Flex-col on mobile to force order, Grid on desktop */}
          <div className="relative w-full h-full max-w-7xl mx-auto px-4 lg:px-12 flex flex-col justify-evenly lg:grid lg:grid-cols-3 items-center lg:gap-8 z-10 py-6 lg:py-0">
            
            {/* 1. TOP (Mobile) / RIGHT (Desktop): BRAND NAME */}
            <div className="card-right-text gsap-reveal order-1 lg:order-3 flex justify-center lg:justify-end z-20 w-full">
              <h2 className="text-6xl md:text-[6rem] lg:text-[8rem] font-black uppercase tracking-tighter text-card-silver-matte lg:mt-0">
                {brandName}
              </h2>
            </div>

            {/* 2. MIDDLE (Mobile) / CENTER (Desktop): IPHONE MOCKUP */}
            <div className="mockup-scroll-wrapper order-2 lg:order-2 relative w-full h-[380px] lg:h-[600px] flex items-center justify-center z-10" style={{ perspective: "1000px" }}>
              
              {/* Inner wrapper for safe CSS scaling that doesn't conflict with GSAP */}
              <div className="relative w-full h-full flex items-center justify-center transform scale-[0.65] md:scale-85 lg:scale-100">
                
                {/* The iPhone Bezel */}
                <div
                  ref={mockupRef}
                  className="relative w-[280px] h-[580px] rounded-[3rem] iphone-bezel flex flex-col will-change-transform transform-style-3d"
                >
                  {/* Physical Hardware Buttons */}
                  <div className="absolute top-[120px] -left-[3px] w-[3px] h-[25px] hardware-btn rounded-l-md z-0" aria-hidden="true" />
                  <div className="absolute top-[160px] -left-[3px] w-[3px] h-[45px] hardware-btn rounded-l-md z-0" aria-hidden="true" />
                  <div className="absolute top-[220px] -left-[3px] w-[3px] h-[45px] hardware-btn rounded-l-md z-0" aria-hidden="true" />
                  <div className="absolute top-[170px] -right-[3px] w-[3px] h-[70px] hardware-btn rounded-r-md z-0 scale-x-[-1]" aria-hidden="true" />

                  {/* Inner Screen Container */}
                  <div className="absolute inset-[7px] bg-[#050914] rounded-[2.5rem] overflow-hidden shadow-[inset_0_0_15px_rgba(0,0,0,1)] text-white z-10">
                    <div className="absolute inset-0 screen-glare z-40 pointer-events-none" aria-hidden="true" />

                    {/* Dynamic Island Notch */}
                    <div className="absolute top-[5px] left-1/2 -translate-x-1/2 w-[100px] h-[28px] bg-black rounded-full z-50 flex items-center justify-end px-3 shadow-[inset_0_-1px_2px_rgba(255,255,255,0.1)]">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)] animate-pulse" />
                    </div>

                    {/* App Interface */}
                    <div className="relative w-full h-full pt-12 px-5 pb-8 flex flex-col">
                      <div className="phone-widget flex justify-between items-center mb-8">
                        <div className="flex flex-col">
                          <span className="text-[10px] text-neutral-400 uppercase tracking-widest font-bold mb-1">Today</span>
                          <span className="text-xl font-bold tracking-tight text-white drop-shadow-md">Journey</span>
                        </div>
                        <div className="w-9 h-9 rounded-full bg-white/5 text-neutral-200 flex items-center justify-center font-bold text-sm border border-white/10 shadow-lg shadow-black/50">JS</div>
                      </div>

                      <div className="phone-widget relative w-44 h-44 mx-auto flex items-center justify-center mb-8 drop-shadow-[0_15px_25px_rgba(0,0,0,0.8)]">
                        <svg className="absolute inset-0 w-full h-full" aria-hidden="true">
                          <circle cx="88" cy="88" r="64" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="12" />
                          <circle className="progress-ring" cx="88" cy="88" r="64" fill="none" stroke="#3B82F6" strokeWidth="12" />
                        </svg>
                        <div className="text-center z-10 flex flex-col items-center">
                          <span className="counter-val text-4xl font-extrabold tracking-tighter text-white">0</span>
                          <span className="text-[8px] text-blue-200/50 uppercase tracking-[0.1em] font-bold mt-0.5">{metricLabel}</span>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div className="phone-widget widget-depth rounded-2xl p-3 flex items-center">
                          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-600/5 flex items-center justify-center mr-3 border border-blue-400/20 shadow-inner">
                            <svg className="w-4 h-4 text-blue-400 drop-shadow-md" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </div>
                          <div className="flex-1">
                            <div className="h-2 w-20 bg-neutral-300 rounded-full mb-2 shadow-inner" />
                            <div className="h-1.5 w-12 bg-neutral-600 rounded-full shadow-inner" />
                          </div>
                        </div>
                        <div className="phone-widget widget-depth rounded-2xl p-3 flex items-center">
                          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-600/5 flex items-center justify-center mr-3 border border-emerald-400/20 shadow-inner">
                            <svg className="w-4 h-4 text-emerald-400 drop-shadow-md" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                          <div className="flex-1">
                            <div className="h-2 w-16 bg-neutral-300 rounded-full mb-2 shadow-inner" />
                            <div className="h-1.5 w-24 bg-neutral-600 rounded-full shadow-inner" />
                          </div>
                        </div>
                      </div>

                      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-[120px] h-[4px] bg-white/20 rounded-full shadow-[0_1px_2px_rgba(0,0,0,0.5)]" />
                    </div>
                  </div>
                </div>

                {/* Floating Glass Badges */}
                <div className="floating-badge absolute flex top-6 lg:top-12 left-[-15px] lg:left-[-80px] floating-ui-badge rounded-xl lg:rounded-2xl p-3 lg:p-4 items-center gap-3 lg:gap-4 z-30">
                  <div className="w-8 h-8 lg:w-10 lg:h-10 rounded-full bg-gradient-to-b from-blue-500/20 to-blue-900/10 flex items-center justify-center border border-blue-400/30 shadow-inner">
                    <span className="text-base lg:text-xl drop-shadow-lg" aria-hidden="true">🔥</span>
                  </div>
                  <div>
                    <p className="text-white text-xs lg:text-sm font-bold tracking-tight">1 Year Streak</p>
                    <p className="text-blue-200/50 text-[10px] lg:text-xs font-medium">Milestone unlocked</p>
                  </div>
                </div>

                <div className="floating-badge absolute flex bottom-12 lg:bottom-20 right-[-15px] lg:right-[-80px] floating-ui-badge rounded-xl lg:rounded-2xl p-3 lg:p-4 items-center gap-3 lg:gap-4 z-30">
                  <div className="w-8 h-8 lg:w-10 lg:h-10 rounded-full bg-gradient-to-b from-indigo-500/20 to-indigo-900/10 flex items-center justify-center border border-indigo-400/30 shadow-inner">
                    <span className="text-base lg:text-lg drop-shadow-lg" aria-hidden="true">🤝</span>
                  </div>
                  <div>
                    <p className="text-white text-xs lg:text-sm font-bold tracking-tight">Sponsor Update</p>
                    <p className="text-blue-200/50 text-[10px] lg:text-xs font-medium">Shared successfully</p>
                  </div>
                </div>

              </div>
            </div>

            {/* 3. BOTTOM (Mobile) / LEFT (Desktop): ACCOUNTABILITY TEXT */}
            <div className="card-left-text gsap-reveal order-3 lg:order-1 flex flex-col justify-center text-center lg:text-left z-20 w-full lg:max-w-none px-4 lg:px-0">
              <h3 className="text-white text-2xl md:text-3xl lg:text-4xl font-bold mb-0 lg:mb-5 tracking-tight">
                {cardHeading}
              </h3>
              {/* HIDDEN ON MOBILE (added hidden md:block) */}
              <p className="hidden md:block text-blue-100/70 text-sm md:text-base lg:text-lg font-normal leading-relaxed mx-auto lg:mx-0 max-w-sm lg:max-w-none">
                {cardDescription}
              </p>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

demo.tsx
import { CinematicHero } from "@/components/ui/cinematic-landing-hero";

export default function CinematicHeroDemo() {
  return (
    <div className="overflow-x-hidden w-[100%] min-h-screen">
      <CinematicHero />
    </div>
  );
}
```

Install NPM dependencies:
```bash
gsap
```

Implementation Guidelines
 1. Analyze the component structure and identify all required dependencies
 2. Review the component's argumens and state
 3. Identify any required context providers or hooks and install them
 4. Questions to Ask
 - What data/props will be passed to this component?
 - Are there any specific state management requirements?
 - Are there any required assets (images, icons, etc.)?
 - What is the expected responsive behavior?
 - What is the best place to use this component in the app?

Steps to integrate
 0. Copy paste all the code above in the correct directories
 1. Install external dependencies
 2. Fill image assets with Unsplash stock images you know exist
 3. Use lucide-react icons for svgs or logos if component requires them
// OPTIONAL: paste the 21st.dev "Copy prompt" output for Cinematic Landing Hero here (reference only)
```

## Files to create

Keep files small and single-purpose.

```
frontend/src/components/story/orbitPhysics.ts   pure functions: orbits, springs, heat mapping (no DOM)
frontend/src/components/story/SunOrbits.tsx     component 1: canvas hero with the sun and households
frontend/src/components/story/OrbitTooltip.tsx  hover / focus card for one household
frontend/src/components/story/CallOnScroll.tsx  component 2: pinned scroll scene with the phone
frontend/src/components/story/KeypadPhone3D.tsx the phone the call plays on (CSS 3D, no three.js)
frontend/src/components/story/HeatHaze.tsx      component 3: page background, rising heat haze
frontend/src/components/story/useScrollHeat.ts  shared scroll-driven heat value for all three
```

Register ScrollTrigger in `frontend/src/motion.ts` next to the other plugins and export it.

## Shared state: one heat value drives everything

`useScrollHeat` exposes a heat index `H` in °C. It is a mutable ref plus a subscribe function, never
React state per frame. Scrolling the hero moves `H` from **31.0 °C** (a normal afternoon) to
**38.0 °C** (a heatwave afternoon). The sun, the households, the counter and the background all read
the same `H`. Show `H` on screen in IBM Plex Mono with the label "Heat index · example afternoon".

## Component 1: SunOrbits (replaces the current hero globe)

**Concept.** Ward 47's households orbit a sun. **Each household's distance from the sun is its own
heat threshold**: the most vulnerable people (lowest threshold) orbit closest. As the heat rises, a
"heat front" spreads outward from the sun. Every household inside it turns orange: Neralu calls
them today. A live counter reads "**140 of 401** households get a call". Compute the number with the
real rule (`H >= threshold_c`, see `calls_due` in `risk.py`); don't hard-code it.

**Data.** `api.elders()` gives the real list, including the ~400 simulated residents and Kamala.
While it loads, or if it fails, use a deterministic seeded set of 401 with the same score
distribution and show a small "example data" label. Kamala R. (the only non-simulated resident in the
demo) gets a ring marker and is labelled in her tooltip.

**Physics (put these in `orbitPhysics.ts` as pure, testable functions):**
- Orbit radius from threshold: `r = r_min + (threshold - T_min) / (T_max - T_min) * (r_max - r_min)`,
  with `T_min = 30`, `T_max = 40` (thresholds run about 30–40 °C), `r_min = 0.16 * R` and
  `r_max = 0.46 * R`, where `R = min(width, height)`. Add a deterministic jitter of ±0.012·R per
  household (seeded from its id) so equal thresholds don't stack.
- Kepler's third law for speed: angular velocity `ω = ω0 * (r_min / r) ** 1.5` (T² ∝ r³), so inner
  households move visibly faster. Pick `ω0` so the innermost orbit takes about 14 s.
- Slight eccentricity, `e` from 0 to 0.08 (seeded), with the radius following
  `r(θ) = a(1 - e²) / (1 + e cos(θ - ϖ))`. Do not solve Kepler's equation; integrating θ at the
  local `ω` is enough.
- Tilt the whole system by `i = 62°` (project y by `cos i`) to get a 3D ellipse. Sort by depth, scale
  dot size by `0.75 + 0.35 * depth01`, and draw the far half of each orbit dimmer and behind the sun.
- Helical wakes: the sun drifts slowly along x (about 0.6 % of the width per second, wrapping
  softly). Each household keeps a ring buffer of its last 28 screen positions, drawn as a fading
  polyline, so the trails come out as helices like the Orbital Hero reference. Only households
  inside the heat front draw wakes. That keeps the canvas calm until the heat rises.
- Heat front radius `r_front = r(H)`, the same mapping applied to the current heat. Draw it as a soft
  ring that breathes (±1.5 %, a 4 s sine).
- State changes use a critically damped spring, never a tween:
  `a = -k (x - target) - c v` with `k = 170` and `c = 2 * sqrt(k) ≈ 26`, integrated with
  semi-implicit Euler at a fixed 1/120 s step (accumulate the frame delta, cap it at 0.05 s). Spring
  each dot's colour mix (0 = cool shade green `--brand`, 1 = heat orange `--heat`) and its radius
  (2.2 px to 3.4 px when called).
- Magnetic hover: within `R_m = 90 px` of the pointer, push dots radially outward with a force
  `F = 1400 * (1 - d / R_m) ** 2`. They spring back to their orbit with the same spring.
- Sun: core radius `0.07 R` growing to `0.10 R` as H goes from 31 to 38 (sprung). The corona is a
  radial gradient (allowed here) whose alpha rises with H. Add a faint heat shimmer by offsetting the
  corona by 2D value noise (small amplitude, 0.3 Hz).

**Interaction.**
- Hover or tap a household: `OrbitTooltip` shows name, age, the top two risk factors, "Own threshold
  33 °C", and either "Called today at 38.0 °C" or "Not called: below their threshold". Simulated
  residents carry the existing `SimTag`.
- Hit-testing: nearest dot within 12 px, searched over a uniform grid rebuilt every frame (no O(n²)).
- Keyboard: the canvas is `role="img"` with an `aria-label` that states the current counts. A visible
  "Step through households" button cycles the tooltip through the called households with arrow keys.
- An `aria-live="polite"` line repeats "At 38.0 °C, 140 of 401 households get a call", updated only
  when the count changes.

**Scroll.** Pin the hero with ScrollTrigger (`pin: true`, `end: '+=180%'`, `scrub: 0.6`). Over the
pin, H goes from 31 to 38, the headline copy fades into its second line, and the counter ticks.
Before any scroll the orbits still move: the page is alive on load.

## Component 2: CallOnScroll (the call, as a pinned scroll scene)

Replace the time-based `CallReplay` placement with a pinned section, `end: '+=400%'`, `scrub: 0.8`.
Keep `CallReplay` in the file for the reduced-motion path. Scroll progress `p` from 0 to 1 drives a
single GSAP timeline:

| p | What happens |
|---|---|
| 0.00–0.12 | Section headline "Then Neralu calls Kamala" sharpens in, then blurs out (`filter: blur(0→14px)`, opacity 1→0, scale 1→0.94) |
| 0.08–0.28 | `KeypadPhone3D` rises from `y: 55vh` with `rotateX: 22° → 0` and `perspective: 1400px`. It lands with a slight overshoot (`ease: 'back.out(1.4)'` under the scrub) |
| 0.28–0.34 | Incoming call: the phone shakes with a decaying sine, `x = 6px * sin(2π·9·t) * e^(-3t)`, on scroll progress, not wall time |
| 0.34–0.40 | Connected: the caption says "This is Neralu, from your ward office. Your family's code word is Mallige." |
| 0.40–0.80 | Six questions, one per step. On each: the caption types in, the pressed key depresses (scale 0.9, brand ring), and the answer drops into a card beside the phone |
| 0.80–0.92 | Verdict stamp: "RED · Rule R3 · Symptoms and no water". It scales from 1.15 to 1 with a 0.4 px ink border; the phone screen tints `--alert-bg` |
| 0.92–1.00 | A case card slides out of the phone: "A volunteer nearby is asked to go to the door". Its link "See it in the ward console →" goes to `/ward` |

Kamala's answers for this scene are water **No** (key 2), dizzy **Yes** (key 1), room very hot
**Yes**, fan working **Yes**, day **correct** (pressed the weekday digit), okay or help **Okay**.
Confirm the outcome and the rule id by reading `backend/app/rules.py`; if the rules give a different
id or reason, use theirs. Never invent an outcome. Captions are the English meaning of the
Kannada prompts (see `CAPTIONS` in `backend/app/routes/phone.py`).

`KeypadPhone3D` is a plain keypad phone (Neralu works on any phone): a CSS 3D body with
`transform-style: preserve-3d`, a small screen, and a 12-key grid. No image assets, no emoji, and no
smartphone notch.

## Component 3: HeatHaze (animated background for the whole story page)

A fixed full-viewport canvas behind the content (`z-index: -1`, `pointer-events: none`).
- About 700 faint particles (300 on screens under 768 px), drifting on a curl-noise flow field
  (2D simplex noise, curl computed by finite differences) plus buoyancy `vy -= g * heat01`, so heat
  visibly rises. `heat01 = (H - 31) / 7`.
- Particle colour moves from the shade green `--brand` to `--heat`, and alpha from 0.05 to 0.18 as
  `heat01` grows. Additive blending (`globalCompositeOperation = 'lighter'`) is allowed on this page.
- When the particles leave the top they respawn at the bottom. No trails, so the text stays readable.
- Below the hero, H stays at its last value and the haze settles to a slow drift.

## Performance (required)

- One `requestAnimationFrame` loop per canvas. No React state updates per frame: everything lives in
  refs, and React re-renders only when the tooltip or the counts change.
- Device pixel ratio capped at 2; resize with a `ResizeObserver`.
- Pause when off-screen (`IntersectionObserver`) and when the tab is hidden (`visibilitychange`).
- If a frame takes over 24 ms for 30 frames in a row, halve the particle and wake counts (a low-end
  laptop on a projector).
- Lazy-load `SunOrbits` and `HeatHaze` with `React.lazy`, as the current hero does.

## Reduced motion and `?still` (required)

`reducedMotion()` from `motion.ts` covers both. When it is true:
- SunOrbits draws one static frame at H = 38 with no wakes, and hover still works.
- CallOnScroll does not pin; it shows the finished state (the existing `CallReplay` in its done state
  is fine).
- HeatHaze is not mounted.

## Design rules that still apply on the story page

- Colours only through tokens (`var(--heat)`, `--sun`, `--brand`, `--alert`, `--paper`, `--ink`,
  `--muted`). Canvas code reads them with `getComputedStyle` and re-reads them on theme change
  (`useTheme()` from `frontend/src/theme.ts`; there is a light mode for projectors).
- Public Sans for text, IBM Plex Mono for every number, time and rule id. Sentence case.
- No emoji, no exclamation marks, no "AI-powered" copy, no invented metrics. Ward 47 is a demo ward:
  keep the "simulated" labels.
- The layout works at 1280×800 (projector) and at 390 px wide (phone) with no horizontal scroll. On
  a phone, put the sun at the bottom and the copy at the top, like the Orbital Hero's narrow layout.

## Steps to integrate

0. Create the files above. Register ScrollTrigger in `motion.ts`.
1. Write `orbitPhysics.ts` first, with a small self-check: export a `__selfTest()` that asserts
   Kepler ordering (inner ω > outer ω), spring convergence (|x - target| < 0.01 within 1 s at
   k = 170) and the threshold-to-radius mapping. Run it once from the browser console.
2. Build SunOrbits on its own route first (`/lab/orbits`, development only, removed before commit),
   then swap it into `Story.tsx` in place of the hero globe.
3. Build CallOnScroll and place it where `TheCall` section is now.
4. Mount HeatHaze once at the top of `Story.tsx`.
5. `cd frontend && npx tsc -b --noEmit && npm run build` must pass. The backend is untouched; `cd
   backend && .venv/Scripts/python.exe -m pytest -q` must still pass.
6. Check in a browser at 1280×800 and 390×844, in dark and light mode, with and without `?still`.
   Open DevTools Performance and confirm the hero holds 60 fps on a mid laptop.
7. Commit on a branch (`story-motion`). Do not push or merge; the team lead does that.

## Questions to ask the team lead before starting, if unclear

- Should the counter use the live `api.elders()` data (it changes when someone registers) or the
  fixed example afternoon?
- Keep the current `HeatExplorer` section below the hero, or does SunOrbits replace it?
- Should the call scene end on RED (a person is sent) or AMBER (a follow-up call), as the current
  replay does?
