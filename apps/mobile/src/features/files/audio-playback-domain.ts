export function audioProgressSeconds(currentTime: number, duration: number): string {
  const total = Number.isFinite(duration) ? Math.max(0, duration) : 0;
  const current = Number.isFinite(currentTime) ? Math.min(total, Math.max(0, currentTime)) : 0;
  return `${current.toFixed(1)} / ${total.toFixed(1)} 秒`;
}

type ReplayablePlayer = {
  readonly currentStatus: { didJustFinish: boolean; currentTime: number; duration: number };
  seekTo(seconds: number): Promise<void>;
  play(): void;
};

export async function resumeAudioPlayer(player: ReplayablePlayer, isCurrent: () => boolean): Promise<void> {
  if (!isCurrent()) return;
  const state = player.currentStatus;
  if (state.didJustFinish || (state.duration > 0 && state.currentTime >= state.duration)) await player.seekTo(0);
  if (isCurrent()) player.play();
}
