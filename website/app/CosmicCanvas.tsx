"use client";

import { useEffect, useRef } from "react";

type CosmicVariant = "hero" | "violet" | "journey" | "light" | "pink";

type CosmicCanvasProps = {
  className?: string;
  density?: number;
  transparent?: boolean;
  variant?: CosmicVariant;
};

type Star = {
  x: number;
  y: number;
  radius: number;
  depth: number;
  phase: number;
  speed: number;
  warmth: number;
  hover: number;
};

const palettes: Record<CosmicVariant, [string, string, string]> = {
  hero: ["#2853b7", "#506fd6", "#9259c7"],
  violet: ["#30208f", "#6840b7", "#a94cae"],
  journey: ["#141d80", "#3525a5", "#7037b5"],
  light: ["#daeaff", "#e5e6ff", "#e9deff"],
  pink: ["#742b91", "#a83ca6", "#db58b1"],
};

function seededRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function createStars(width: number, height: number, density: number) {
  const random = seededRandom(Math.round(width * 3 + height * 7));
  const compact = width < 680;
  const count = Math.round((compact ? 48 : 96) * density);
  return Array.from({ length: count }, () => ({
    x: random() * width,
    y: random() * height,
    radius: 0.45 + random() * (compact ? 1.2 : 1.7),
    depth: 0.18 + random() * 0.82,
    phase: random() * Math.PI * 2,
    speed: 0.22 + random() * 0.48,
    warmth: random(),
    hover: 0,
  }));
}

export default function CosmicCanvas({ className, density = 1, transparent = false, variant = "hero" }: CosmicCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    if (!canvas || !host) return;

    const context = canvas.getContext("2d", { alpha: transparent });
    if (!context) return;

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = motionQuery.matches;
    let width = 1;
    let height = 1;
    let stars: Star[] = [];
    let frame = 0;
    let visible = false;
    let running = false;
    let lastFrameTime = 0;
    let frameInterval = 1000 / 30;
    let lastPixelRatio = 0;
    let pointerX = 0;
    let pointerY = 0;
    let pointerPixelX = -1000;
    let pointerPixelY = -1000;
    let localScroll = 0;
    let hostLeft = 0;
    let hostTop = 0;
    let animationTime = 0;
    let lastTick = 0;
    let nextMeteorAt = 8 + Math.random() * 7;
    let meteorOriginX = 0.64 + Math.random() * 0.2;

    // Only the launch chapter uses this cache. Rasterize small glow tiles once,
    // then animate their position/opacity without running blur filters per star.
    const glowTiles = new Map<string, HTMLCanvasElement>();
    let trackTile: HTMLCanvasElement | null = null;
    const trackPadding = 24;
    const pinkColors = ["147,231,255", "255,160,221", "202,181,255"];
    const pinkPaths = () => width < 680 ? [
      [.04, .91, .2, .74, .79, 1.0, 1.04, .81],
      [-.05, .78, .44, .98, .94, .89, 1.03, .67],
    ] : [
      [.67, .8, .92, .95, 1.09, .42, .91, .25],
      [.05, .88, .36, .99, .86, .68, 1.07, .86],
      [.68, .27, 1.02, .13, 1.06, .78, .74, .79],
    ];
    const curvePoint = (path: number[], t: number) => {
      const u = 1 - t;
      return {
        x: (u*u*u*path[0] + 3*u*u*t*path[2] + 3*u*t*t*path[4] + t*t*t*path[6]) * width,
        y: (u*u*u*path[1] + 3*u*u*t*path[3] + 3*u*t*t*path[5] + t*t*t*path[7]) * height,
      };
    };
    const glowTile = (color: string) => {
      let tile = glowTiles.get(color);
      if (tile) return tile;
      tile = document.createElement("canvas");
      tile.width = tile.height = 48;
      const ctx = tile.getContext("2d");
      if (ctx) {
        const glow = ctx.createRadialGradient(24, 24, 0, 24, 24, 24);
        glow.addColorStop(0, `rgba(${color},.75)`);
        glow.addColorStop(.22, `rgba(${color},.38)`);
        glow.addColorStop(.5, `rgba(${color},.09)`);
        glow.addColorStop(1, `rgba(${color},0)`);
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, 48, 48);
      }
      glowTiles.set(color, tile);
      return tile;
    };
    const paintGlow = (x: number, y: number, radius: number, color: string, opacity: number) => {
      const alpha = context.globalAlpha;
      context.globalAlpha = opacity;
      context.drawImage(glowTile(color), x - radius, y - radius, radius * 2, radius * 2);
      context.globalAlpha = alpha;
    };
    const cacheTracks = () => {
      if (variant !== "pink") return;
      // Release the old bitmap on resize, and bound the new one even on 4K screens.
      if (trackTile) { trackTile.width = trackTile.height = 1; }
      trackTile = document.createElement("canvas");
      const w = width + trackPadding * 2, h = height + trackPadding * 2;
      const ratio = Math.min(1.3, Math.sqrt(3000000 / (w * h)));
      trackTile.width = Math.round(w * ratio);
      trackTile.height = Math.round(h * ratio);
      const ctx = trackTile.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(ratio, 0, 0, ratio, trackPadding * ratio, trackPadding * ratio);
      ctx.lineCap = "round";
      pinkPaths().forEach((path, index) => {
        ctx.strokeStyle = `rgba(${pinkColors[index]},.22)`;
        ctx.lineWidth = width < 680 ? .8 : 1.15;
        ctx.shadowColor = `rgba(${pinkColors[index]},.6)`;
        ctx.shadowBlur = width < 680 ? 3 : 6;
        ctx.beginPath();
        for (let sample = 0; sample <= 48; sample++) {
          const p = curvePoint(path, sample / 48);
          if (!sample) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
      });
      // Warm all seven small tiles before entering the chapter.
      [...pinkColors, "255,177,226", "166,235,255", "255,158,219", "119,234,255"].forEach(glowTile);
    };

    const resize = () => {
      const bounds = host.getBoundingClientRect();
      hostLeft = bounds.left;
      hostTop = bounds.top;
      const nextWidth = Math.max(1, Math.round(bounds.width));
      const nextHeight = Math.max(1, Math.round(bounds.height));
      const compact = nextWidth < 680;
      const pixelRatio = Math.min(window.devicePixelRatio || 1, compact ? 1.1 : 1.3, Math.sqrt(3000000 / (nextWidth * nextHeight)));
      if (stars.length && width === nextWidth && height === nextHeight && pixelRatio === lastPixelRatio) return;
      width = nextWidth;
      height = nextHeight;
      lastPixelRatio = pixelRatio;
      frameInterval = 1000 / (compact ? 24 : 30);
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      stars = createStars(width, height, density * (variant === "pink" && compact ? .65 : 1));
      cacheTracks();
    };

    const drawNebula = (x: number, y: number, radius: number, color: string, opacity: number) => {
      const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, color.replace("ALPHA", `${opacity}`));
      gradient.addColorStop(0.42, color.replace("ALPHA", `${opacity * 0.48}`));
      gradient.addColorStop(1, color.replace("ALPHA", "0"));
      context.fillStyle = gradient;
      context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    };

    const draw = (now: number) => {
      // Accumulate only visible time: no big jump after returning to a chapter/tab.
      if (lastTick && !reducedMotion && visible && !document.hidden) animationTime += Math.min(now - lastTick, 80) / 1000;
      lastTick = now;
      const elapsed = reducedMotion ? 4 : animationTime;
      const driftX = pointerX * (width < 680 ? 5 : 14);
      const driftY = pointerY * (height < 700 ? 4 : 10) - localScroll * 0.018;
      const [top, middle, bottom] = palettes[variant];

      context.clearRect(0, 0, width, height);
      const nebulaShift = Math.sin(elapsed * 0.055);
      if (!transparent) {
        const base = context.createLinearGradient(0, 0, width, height);
        base.addColorStop(0, top);
        base.addColorStop(0.48, middle);
        base.addColorStop(1, bottom);
        context.fillStyle = base;
        context.fillRect(0, 0, width, height);

        const wash = context.createRadialGradient(width * 0.46, height * 0.45, 0, width * 0.46, height * 0.45, width * 0.52);
        wash.addColorStop(0, variant === "hero" ? "rgba(34,83,174,.18)" : "rgba(255,255,255,.045)");
        wash.addColorStop(0.62, "rgba(24,27,105,.03)");
        wash.addColorStop(1, "rgba(12,20,75,.17)");
        context.fillStyle = wash;
        context.fillRect(0, 0, width, height);
      }

      if (!transparent || variant === "hero") {
        drawNebula(width * 0.83 + driftX * 0.42, height * (0.3 + nebulaShift * 0.018) + driftY * 0.32, width * 0.39, "rgba(70,224,255,ALPHA)", variant === "hero" ? 0.23 : 0.12);
        drawNebula(width * 0.94 - driftX * 0.25, height * 0.65 - nebulaShift * 18 + driftY * 0.19, width * 0.32, "rgba(255,91,211,ALPHA)", variant === "hero" ? 0.18 : 0.22);
        drawNebula(width * 0.11 + driftX * 0.16, height * 0.1 + nebulaShift * 12, width * 0.23, "rgba(100,118,255,ALPHA)", 0.16);
        if (variant === "hero") drawNebula(width * 0.12 - driftX * 0.12, height * 0.82 - nebulaShift * 10, width * 0.22, "rgba(255,203,126,ALPHA)", 0.12);
      }

      context.save();
      context.globalCompositeOperation = variant === "light" ? "source-over" : "screen";
      context.shadowBlur = 0;
      stars.forEach((star) => {
        const depthX = driftX * star.depth + (variant === "pink" ? Math.sin(elapsed * .1 + star.phase) * star.depth * 4 : 0);
        const depthY = driftY * star.depth;
        const wrapHeight = height + 20;
        const starDrift = variant === "pink" ? -1.6 : 2.2;
        const y = ((star.y + elapsed * star.depth * starDrift + depthY + 10) % wrapHeight + wrapHeight) % wrapHeight - 10;
        const x = star.x + depthX;
        const twinkle = variant === "pink"
          ? .22 + Math.pow(.5 + Math.sin(elapsed * star.speed * 1.8 + star.phase) * .5, 2) * .7
          : 0.48 + Math.sin(elapsed * star.speed + star.phase) * 0.25;
        const proximity = reducedMotion ? 0 : Math.max(0, 1 - Math.hypot(x - pointerPixelX, y - pointerPixelY) / 30);
        star.hover += (proximity - star.hover) * .2;
        const radius = star.radius * (1 + star.hover * .65);
        const quietPinkArea = variant === "pink" && x < width * .68 && y > height * .3 && y < height * .78;
        const light = Math.min(.95, twinkle + star.hover * .3) * (quietPinkArea ? .35 : 1);
        context.shadowBlur = variant === "pink" ? 0 : star.hover * 11;
        if (variant === "pink" && (star.radius > 1.35 || star.hover > .01)) {
          paintGlow(x, y, radius + 3 + light * 4 + star.hover * 8,
            star.warmth > .5 ? "255,177,226" : "166,235,255", light * .6 + star.hover * .3);
        }
        context.shadowColor = variant === "pink" ? star.warmth > .5 ? "#ffb1e2" : "#a6ebff" : variant === "light" ? "#547ee8" : "#a6ebff";
        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fillStyle = variant === "pink"
          ? star.warmth > .24 ? `rgba(255,207,240,${light * .8})` : `rgba(195,232,255,${light * .7})`
          : variant === "light" ? `rgba(74,109,196,${light * .8})` : star.warmth > 0.87 ? `rgba(255,224,190,${light})` : `rgba(225,242,255,${light})`;
        context.fill();
        if (star.radius > 1.5) {
          context.strokeStyle = variant === "light" ? `rgba(78,107,196,${light * .4})` : star.warmth > 0.87 ? `rgba(255,222,183,${light * 0.45})` : `rgba(192,230,255,${light * 0.45})`;
          context.lineWidth = 0.7;
          context.beginPath();
          context.moveTo(x - star.radius * 2.4, y);
          context.lineTo(x + star.radius * 2.4, y);
          context.moveTo(x, y - star.radius * 2.4);
          context.lineTo(x, y + star.radius * 2.4);
          context.stroke();
        }
      });
      context.restore();

      if (variant === "hero" && !transparent) {
        const planetX = width * 0.87 + driftX * 0.17;
        const planetY = height * 0.2 + driftY * 0.12;
        const planetRadius = Math.min(width, height) * (width < 680 ? 0.075 : 0.105);
        const planet = context.createRadialGradient(planetX - planetRadius * 0.32, planetY - planetRadius * 0.3, 2, planetX, planetY, planetRadius);
        planet.addColorStop(0, "rgba(255,188,247,.97)");
        planet.addColorStop(0.42, "rgba(174,91,245,.9)");
        planet.addColorStop(1, "rgba(70,39,170,.15)");
        context.fillStyle = planet;
        context.shadowBlur = 32;
        context.shadowColor = "rgba(191,109,255,.72)";
        context.beginPath();
        context.arc(planetX, planetY, planetRadius, 0, Math.PI * 2);
        context.fill();
        context.shadowBlur = 0;
        context.strokeStyle = "rgba(135,217,255,.55)";
        context.lineWidth = Math.max(2, planetRadius * 0.045);
        context.beginPath();
        context.ellipse(planetX, planetY, planetRadius * 1.55, planetRadius * 0.34, -0.23, 0, Math.PI * 2);
        context.stroke();
      }

      if (variant === "pink") {
        // Continuous glowing filaments stay in the right/bottom negative space.
        // Each bright trail follows its own curve; endpoints fade before wrapping.
        const compact = width < 680;
        const paths = pinkPaths();
        const colors = pinkColors;
        const pointOnCurve = (path: number[], t: number) => {
          const point = curvePoint(path, t);
          return {
            x: point.x + driftX * .25,
            y: point.y + driftY * .2,
          };
        };
        context.save();
        context.lineCap = "round";
        context.shadowBlur = 0;
        // The static transparent track bitmap does not need a full-canvas
        // screen blend; reserve additive blending for the tiny moving lights.
        context.globalCompositeOperation = "source-over";
        if (trackTile) context.drawImage(trackTile, -trackPadding + driftX * .25, -trackPadding + driftY * .2,
          width + trackPadding * 2, height + trackPadding * 2);
        context.globalCompositeOperation = "screen";
        paths.forEach((path, index) => {
          const color = colors[index];
          const progress = (elapsed / (14 + index * 5) + index * .31) % 1;
          const opacity = Math.min(1, progress * 12, (1 - progress) * 12);
          const head = pointOnCurve(path, progress);
          const tailT = Math.max(0, progress - .13);
          const tail = pointOnCurve(path, tailT);
          const trail = context.createLinearGradient(tail.x, tail.y, head.x, head.y);
          trail.addColorStop(0, `rgba(${color},0)`);
          trail.addColorStop(.65, `rgba(${color},${opacity * .5})`);
          trail.addColorStop(1, `rgba(${color},${opacity * .9})`);
          context.strokeStyle = trail;
          // Soft bands around the short moving trail replace a per-frame blur.
          // The full curved filament, including its blur, is already cached.
          context.beginPath();
          for (let sample = 0; sample <= 16; sample += 1) {
            const p = pointOnCurve(path, tailT + (progress - tailT) * sample / 16);
            if (!sample) context.moveTo(p.x, p.y); else context.lineTo(p.x, p.y);
          }
          context.globalAlpha = .1;
          context.lineWidth = compact ? 6 : 10;
          context.stroke();
          context.globalAlpha = .18;
          context.lineWidth = compact ? 3 : 5;
          context.stroke();
          context.globalAlpha = 1;
          context.lineWidth = compact ? 1.5 : 2;
          context.stroke();
          paintGlow(head.x, head.y, compact ? 7 : 12, color, opacity * .7);
          context.fillStyle = `rgba(235,244,255,${opacity * .85})`;
          context.beginPath();
          context.arc(head.x, head.y, compact ? 1.5 : 2, 0, Math.PI * 2);
          context.fill();
        });
        context.shadowBlur = 0;
        // A small, separate foreground dust layer gives the stars more depth.
        for (let index = 0; index < (compact ? 8 : 24); index += 1) {
          const phase = elapsed * (.025 + index * .001) + index * 2.399;
          const x = width * (.78 + Math.sin(phase) * .2) + driftX * .7;
          const y = height * (.53 + Math.cos(phase * .7 + index) * .33) + driftY * .7;
          const alpha = .12 + (.5 + Math.sin(elapsed * .5 + index) * .5) * .16;
          paintGlow(x, y, 5, colors[index % 3], alpha);
        }
        context.restore();
      } else {
      const ribbonOffset = Math.sin(elapsed * 0.12) * 15;
      const ribbonGradient = context.createLinearGradient(width * 0.46, 0, width, 0);
      ribbonGradient.addColorStop(0, "rgba(94,225,255,0)");
      ribbonGradient.addColorStop(0.36, "rgba(94,225,255,.2)");
      ribbonGradient.addColorStop(0.72, "rgba(191,111,255,.3)");
      ribbonGradient.addColorStop(1, "rgba(255,134,222,0)");
      context.strokeStyle = ribbonGradient;
      context.lineWidth = width < 680 ? 2 : 3;
      context.shadowBlur = 8;
      context.shadowColor = "rgba(95,213,255,.72)";
      context.beginPath();
      context.moveTo(width * 0.44, height * 0.69 + ribbonOffset + driftY * 0.18);
      context.bezierCurveTo(width * 0.6, height * 0.44, width * 0.77, height * 0.76, width * 1.03, height * 0.45 + ribbonOffset);
      context.stroke();
      context.shadowBlur = 0;
      }

      const pinkCompact = variant === "pink" && width < 680;
      const orbitCenterX = width * (variant === "pink" ? pinkCompact ? .54 : .86 : .77) + driftX * 0.22;
      const orbitCenterY = height * (variant === "pink" ? pinkCompact ? .88 : .67 : .56) + driftY * 0.17;
      for (let index = 0; index < (width < 680 ? 2 : 4); index += 1) {
        const angle = elapsed * (0.075 + index * 0.012) + index * 1.7;
        const orbitX = orbitCenterX + Math.cos(angle) * width * (variant === "pink" ? pinkCompact ? .26 : .11 : 0.14 + index * 0.012);
        const orbitY = orbitCenterY + Math.sin(angle) * height * (variant === "pink" ? pinkCompact ? .037 : .085 : 0.08 + index * 0.008);
        const orbitHover = reducedMotion ? 0 : Math.max(0, 1 - Math.hypot(orbitX - pointerPixelX, orbitY - pointerPixelY) / 26);
        context.beginPath();
        context.arc(orbitX, orbitY, (1.8 + index * 0.35) * (1 + orbitHover * .4), 0, Math.PI * 2);
        context.fillStyle = variant === "pink" ? index % 2 ? "rgba(255,196,235,.54)" : "rgba(189,232,255,.48)" : variant === "light" ? "rgba(112,105,218,.65)" : index % 2 ? "rgba(255,179,229,.84)" : "rgba(143,235,255,.88)";
        context.shadowBlur = variant === "pink" ? 0 : 4 + orbitHover * 9;
        context.shadowColor = index % 2 ? "#ff9edb" : "#77eaff";
        if (variant === "pink") paintGlow(orbitX, orbitY, 7 + orbitHover * 9,
          index % 2 ? "255,158,219" : "119,234,255", .55 + orbitHover * .3);
        context.fill();
      }
      context.shadowBlur = 0;

      if (variant === "hero" && !transparent) {
        const horizonY = height * 1.03;
        const horizon = context.createRadialGradient(width * 0.62, horizonY, 0, width * 0.62, horizonY, width * 0.62);
        horizon.addColorStop(0, "rgba(112,240,255,.68)");
        horizon.addColorStop(0.22, "rgba(78,161,255,.44)");
        horizon.addColorStop(0.52, "rgba(113,64,222,.23)");
        horizon.addColorStop(1, "rgba(37,23,118,0)");
        context.fillStyle = horizon;
        context.fillRect(0, height * 0.66, width, height * 0.34);
      }

      const meteorPhase = elapsed - nextMeteorAt;
      if (!reducedMotion && meteorPhase >= 0 && meteorPhase < 0.9) {
        const progress = meteorPhase / 0.9;
        const meteorX = width * (meteorOriginX - progress * 0.17);
        const meteorY = height * (0.09 + progress * 0.13);
        const meteor = context.createLinearGradient(meteorX - 65, meteorY - 48, meteorX, meteorY);
        meteor.addColorStop(0, "rgba(191,226,255,0)");
        meteor.addColorStop(1, variant === "pink" ? "rgba(255,207,241,.55)" : "rgba(255,255,255,.86)");
        context.strokeStyle = meteor;
        context.lineWidth = 1.2;
        context.beginPath();
        context.moveTo(meteorX - 65, meteorY - 48);
        context.lineTo(meteorX, meteorY);
        context.stroke();
      } else if (!reducedMotion && meteorPhase >= 0.9) {
        nextMeteorAt = elapsed + 8 + Math.random() * 7;
        meteorOriginX = 0.64 + Math.random() * 0.2;
      }
    };

    const loop = (now: number) => {
      if (!visible || document.hidden) {
        running = false;
        return;
      }
      const delta = now - lastFrameTime;
      // Keep the fractional remainder instead of drifting to the next display
      // frame each time. The tolerance only compensates timestamp rounding.
      if (delta >= frameInterval - .5) {
        draw(now);
        lastFrameTime += Math.max(1, Math.floor((delta + .5) / frameInterval)) * frameInterval;
      }
      frame = window.requestAnimationFrame(loop);
    };

    const startLoop = () => {
      if (reducedMotion || running || !visible || document.hidden) return;
      running = true;
      lastFrameTime = 0;
      lastTick = 0;
      frame = window.requestAnimationFrame(loop);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (reducedMotion || event.pointerType === "touch") return;
      pointerPixelX = event.clientX - hostLeft;
      pointerPixelY = event.clientY - hostTop;
      pointerX = pointerPixelX / width - 0.5;
      pointerY = pointerPixelY / height - 0.5;
    };
    const onPointerLeave = () => { pointerPixelX = -1000; pointerPixelY = -1000; pointerX = 0; pointerY = 0; };
    const onScroll = () => {
      if (!visible) return;
      const bounds = host.getBoundingClientRect();
      hostLeft = bounds.left;
      hostTop = bounds.top;
      localScroll = Math.max(-height, Math.min(height, -hostTop));
      onPointerLeave();
    };
    const resizeObserver = new ResizeObserver(() => {
      resize();
      draw(performance.now());
    });
    const visibilityObserver = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) {
        onScroll();
        lastTick = 0;
        draw(performance.now());
        startLoop();
      } else {
        window.cancelAnimationFrame(frame);
        running = false;
        lastTick = 0;
      }
    }, { rootMargin: "80px" });
    const onVisibilityChange = () => {
      if (document.hidden) {
        window.cancelAnimationFrame(frame);
        running = false;
        lastTick = 0;
      } else {
        startLoop();
      }
    };
    const onMotionChange = () => {
      reducedMotion = motionQuery.matches;
      window.cancelAnimationFrame(frame);
      running = false;
      lastTick = 0;
      onPointerLeave();
      stars.forEach((star) => { star.hover = 0; });
      draw(performance.now());
      startLoop();
    };

    resizeObserver.observe(host);
    visibilityObserver.observe(canvas);
    host.addEventListener("pointermove", onPointerMove, { passive: true });
    host.addEventListener("pointerleave", onPointerLeave);
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onVisibilityChange);
    motionQuery.addEventListener("change", onMotionChange);
    resize();
    draw(performance.now());

    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
      host.removeEventListener("pointermove", onPointerMove);
      host.removeEventListener("pointerleave", onPointerLeave);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      motionQuery.removeEventListener("change", onMotionChange);
      if (trackTile) { trackTile.width = trackTile.height = 1; trackTile = null; }
      glowTiles.forEach((tile) => { tile.width = tile.height = 1; });
      glowTiles.clear();
    };
  }, [density, transparent, variant]);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
