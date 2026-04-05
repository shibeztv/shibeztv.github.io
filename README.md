# Shibez VOD Archive

A VOD archive and mini-game hub for the Twitch channel **shlbez**, hosted as a single HTML file on GitHub Pages.

Live at: **https://shibeztv.github.io**

---

## What it does

### VOD Archive (main page)
- Pulls all videos from the **ShibezVods** YouTube channel via the YouTube Data API v3
- Groups uploads into streams by parsing dates from video titles; multi-part streams are merged under one entry
- VODs are matched to Twitch VODs so chapters/game categories can be fetched
- Stream thumbnails, duration, view count, and a color-coded game timeline bar are shown for each stream
- Clicking a stream opens a YouTube embed with:
  - **Part switcher** for multi-part streams — switching parts updates the game bar to show only that part's categories
  - **Game/category timeline** — a colored bar under the player showing what was played, in order, with clickable segments that jump to that point in the video
  - **Live chat replay** — synced Twitch chat fetched from Rustlog, rendered with 7TV and BTTV emotes
  - Date filter on the grid

### Twitch Lookup
- Look up any Twitch user by name to see their profile, follower/following counts, and lists
- Falls back to tools.2807.eu for follower/following data when the Twitch API doesn't return results
- Shows mutual follows in purple
- Quick links to tools.2807.eu for mods, VIPs, founders

### Random Clip
- Picks a random clip from the shlbez Twitch channel and plays it in an iframe
- Title is clickable and links to the clip on Twitch
- Starts unmuted; "Play Another" button to cycle

### Profile (Twitch login)
- Log in with Twitch OAuth to track your site activity
- Saves: visit count, time spent, last watched streams, game scores, follow/sub status
- Unlockable achievements based on site usage and game scores

---

## Mini-games

All games use a shared leaderboard system stored in `localStorage`.

### Shib.le
Wordle-style game where you guess the date of a stream from its thumbnail. 5 guesses, daily challenge (same VOD for all users each day) or random mode. Date picker with hold-to-repeat buttons.

### Higher or Lower
Pick which of two 7TV emotes has been used more across Twitch channels. Uses real usage data from StreamElements' global stats API. Data source note shown in-game.

### Emote Guesser
An emote is shown heavily pixelated — guess its name. Gets clearer with each wrong guess (6 levels). Uses the same 7TV emote set as the rest of the site.

### AI or Not
Real photo or AI-generated image? Guess correctly to build a streak. "About this image" links to Google Lens for each image after your guess.

### Flappy Shibez
Flappy Bird with shlbez-themed emotes as obstacles and a Forsen death sound pool. Separate music and SFX volume sliders. Leaderboard.

### SpaceBez
A Vampire Survivors-style bullet-hell game using 7TV emotes as enemies, with a full upgrade shop, multiple weapons with tier-2 upgrades, powerup drops, and a Twitch chat enemy spawner (viewers who type in chat spawn as enemies). Leaderboard.

---

## Technical notes

- **Single file** — the entire site is `index.html`. No dependencies, no bundler, no server
- **APIs used:**
  - YouTube Data API v3 — fetch video list
  - Twitch Helix API — VOD matching, chapters, clip list, user lookup, OAuth
  - Twitch GQL — game chapter timestamps per VOD
  - 7TV API — emote sets (channel + global)
  - BTTV API — global emote fallback
  - StreamElements API — emote usage stats (Higher or Lower)
  - Rustlog — historical Twitch chat logs for replay
- **Data storage:** `localStorage` only — streams are cached for 30 minutes, leaderboards and user profile are persisted locally
- **Chat emotes:** channel 7TV set loads first, then global 7TV, then BTTV globals as fallback
- **Game categories:** fetched from Twitch GQL chapters using a persisted query; falls back to description timestamp parsing if no Twitch VOD is matched. Multi-part streams fetch chapters per-part and merge them with correct cumulative offsets

---
