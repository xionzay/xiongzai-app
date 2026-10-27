import { execFileSync } from "node:child_process";

const requestedDevice = process.argv.slice(2).join(" ").trim();
if (!requestedDevice) {
  console.error('Usage: pnpm mobile:open:simulator "iPad Pro 13-inch (M5)"');
  process.exit(1);
}

const result = JSON.parse(execFileSync("xcrun", ["simctl", "list", "devices", "booted", "--json"], { encoding: "utf8" }));
const bootedDevices = Object.values(result.devices).flat();
const device = bootedDevices.find(({ name, udid }) => name === requestedDevice || udid === requestedDevice);

if (!device) {
  console.error(`No booted Simulator matches "${requestedDevice}".`);
  console.error(`Booted devices: ${bootedDevices.map(({ name }) => name).join(", ") || "none"}`);
  process.exit(1);
}

const metroUrl = "http://127.0.0.1:8081";
try {
  const response = await fetch(`${metroUrl}/status`, { signal: AbortSignal.timeout(3000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
} catch {
  console.error(`Metro is not reachable at ${metroUrl}. Start it with pnpm mobile:start:simulator first.`);
  process.exit(1);
}

const deepLink = `exp+xiongzai-esports://expo-development-client/?url=${encodeURIComponent(metroUrl)}`;
execFileSync("xcrun", ["simctl", "openurl", device.udid, deepLink], { stdio: "inherit" });
try {
  execFileSync("open", [`devices://device/open?id=${device.udid}`], { stdio: "ignore" });
} catch {
  // The app is still launched on the selected Simulator if window focusing is unavailable.
}
console.log(`Opened the development build on ${device.name} (${device.udid}).`);
