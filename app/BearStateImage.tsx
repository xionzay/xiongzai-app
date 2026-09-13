"use client";

import { useEffect, useRef } from "react";
import { mountBearPlayback, type BearProgress } from "./bear-playback";
import { bearScenes, type BearScene, type BearStateId } from "./bear-state-config";

type Props = {
  id: BearStateId;
  size?: number;
  mode?: "auto" | "static";
  active?: boolean;
  eventKey?: string;
  basePath?: string;
};

function BearImageSession({ id, size = 160, mode = "auto", active = true, basePath = "/assets/bear-states-v3" }: Props) {
  const image = useRef<HTMLImageElement>(null);
  const player = useRef<ReturnType<typeof mountBearPlayback> | null>(null);
  const progress = useRef<BearProgress>({ played: false, failed: false });
  const base = basePath.replace(/\/$/, "");
  useEffect(() => {
    if (!image.current) return;
    const playback = mountBearPlayback(image.current, id, base, progress.current);
    player.current = playback;
    return () => { playback.dispose(); player.current = null; };
  }, [base, id]);
  useEffect(() => { player.current?.update({ active, mode }); }, [active, mode, base, id]);
  return <div className="bear-state-image" style={{ width: size, maxWidth: "100%" }} data-bear-state={id}>
    {/* Decorative art: the surrounding status text remains the accessible source of truth. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img ref={image} src={`${base}/posters/${id}.png`} alt="" aria-hidden="true" width={size} height={size} draggable={false} />
  </div>;
}

export function BearStateImage(props: Props) {
  // Explicit state events reset playback. Parent rerenders and size changes do not.
  return <BearImageSession key={`${props.basePath ?? "v3"}:${props.id}:${props.eventKey ?? "default"}`} {...props} />;
}

export function StateBear({ scene, eventKey, size }: { scene: BearScene; eventKey?: string; size?: number }) {
  return <BearStateImage {...bearScenes[scene]} {...(size ? { size } : {})} eventKey={`${scene}:${eventKey ?? "default"}`} />;
}
