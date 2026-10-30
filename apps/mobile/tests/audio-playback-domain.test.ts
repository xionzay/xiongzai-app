import assert from "node:assert/strict";
import test from "node:test";
import { audioProgressSeconds, resumeAudioPlayer } from "../src/features/files/audio-playback-domain";

test("原生播放器结束回调超出时长时，显示进度不超过总时长", () => {
  assert.equal(audioProgressSeconds(3.1, 3), "3.0 / 3.0 秒");
  assert.equal(audioProgressSeconds(-1, 3), "0.0 / 3.0 秒");
  assert.equal(audioProgressSeconds(NaN, Infinity), "0.0 / 0.0 秒");
});
test("播放结束后再次播放先归零，暂停后恢复保持当前位置", async () => {
  for (const finished of [true, false]) {
    const calls: string[] = [];
    const player = { currentStatus: { didJustFinish: finished, currentTime: finished ? 3 : 1, duration: 3 }, seekTo: async (seconds: number) => { calls.push(`seek:${seconds}`); }, play: () => { calls.push("play"); } };
    await resumeAudioPlayer(player, () => true);
    assert.deepEqual(calls, finished ? ["seek:0", "play"] : ["play"]);
  }
});
test("异步归零期间播放器被释放，不再调用旧实例播放", async () => {
  let live = true; let played = false;
  const player = { currentStatus: { didJustFinish: true, currentTime: 3, duration: 3 }, seekTo: async () => { live = false; }, play: () => { played = true; } };
  await resumeAudioPlayer(player, () => live);
  assert.equal(played, false);
});
