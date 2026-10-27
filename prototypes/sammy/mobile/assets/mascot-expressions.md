# Mascot animation frames

Created with the built-in imagegen tool using `mascot.png` as the edit target.
Output: `mascot-expressions.png` (2172 × 724), three equal horizontal cells: idle, blink, smile.

Prompt: Preserve the current baby bear mascot's blue shark hood, navy outlines, paws, pose, scale, alignment and light-blue background. Create three equally sized square cells in one horizontal row, with no gaps or labels. Left: both eyes open and a small relaxed smile. Center: both eyes closed as happy curved lines and the same relaxed smile. Right: happy crescent eyes and a wider open cheerful mouth with a pink tongue. Only facial expression changes.

The current home hero uses `mascot-expressions-transparent.png`, made by editing the original sheet with the built-in imagegen tool.

Edit prompt: Remove only the blue backdrop and make it transparent. Preserve the mascot, its three expressions, equal cell sizes, pose, scale, and alignment.

The hero clips and layers the three cells, smoothly fading blink and smile expressions over the idle pose. Native-driver transforms add continuous breathing and a gentle head tilt. The header remains static. Me and empty states use the same expression sheet with screen-driven moods. Animation stops in the background or with Reduce Motion enabled; loops and listeners are cleaned up on unmount.

Backdrop artwork comes from the company website: cloud sea, cloud banks, floating island, and gold/cyan stars. These are bundled locally and animated with native transforms and opacity, so the scene needs no network request or video playback.

## Contextual reactions

`AnimatedMascot` uses the existing three expression cells; no new raster assets or native modules are needed. Sign-in uses a welcoming nod and occasional smile. Waiting uses a quiet open-eyed expression and gently moving thought dots. Searching without results uses a curious head tilt and question bubble. Successful payment holds the happy expression, makes one small hop, and shows soft sparkles. A failed first-message save uses a reassuring tilt and an exclamation bubble. The signed-in profile uses calm breathing and blinking.

Messages and Orders pick their moods from account and content state. An empty conversation changes from waiting to curious while drafting, waiting while saving, and concerned if saving fails. Mood descriptions are localized for accessibility. Loops stop on mood changes, backgrounding, Reduce Motion and unmount; reduced motion retains the relevant static expression and cue.
