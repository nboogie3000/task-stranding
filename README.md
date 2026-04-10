# BRIDGES TERMINAL

> Death Stranding-inspired in-game order management overlay

A lightweight, holographic task manager designed to float over games as a browser overlay. Tracks quests, side missions, resource goals and more with Scrum-style priority levels.

---

## Features

- **Priority groups** — High / Standard / Deferred / Completed, colour-coded with drag-to-reorder within each group
- **Game management** — add and remove games; filter tasks by game
- **HUD mode** — hides chrome, leaves only semi-transparent task rows (`Ctrl+H`)
- **Edit & notes** — click any task to reveal an inline edit button; long notes clamp with "show more"
- **Holographic UI** — chiral mirror scan lines, silver hover sheen, animated logo pulse
- **Persistent storage** — localStorage by default; optional JSONBin.io sync for cross-device support

---

## Setup

### GitHub Pages (quick start)
1. Fork / clone this repo
2. Push to your GitHub account
3. Go to **Settings → Pages → Source: main branch / root**
4. Your overlay is live at `https://yourusername.github.io/bridges-terminal/`

### Cross-device sync with JSONBin.io
1. Create a free account at [jsonbin.io](https://jsonbin.io)
2. Create a new bin with `{}` as initial content
3. Copy your **Bin ID** and **Master Key**
4. Open `terminal.js` and fill in:

```js
const CONFIG = {
  JSONBIN_BIN_ID: 'your-bin-id-here',
  JSONBIN_KEY:    'your-master-key-here',
  ...
};
```

Data is saved remotely on every change, with localStorage as fallback.

---

## Usage as a Game Overlay

1. Open the GitHub Pages URL in a browser window
2. Resize the window to a thin panel on one side
3. On Windows: use **PowerToys** (`Win + Ctrl + T`) to pin "Always on Top"
4. Set your game to **Borderless Windowed** mode
5. Press `Ctrl+H` to enter HUD mode — the header/tabs/footer hide and task rows become 70% transparent

### Keyboard shortcuts
| Shortcut | Action |
|---|---|
| `Ctrl+N` | New order |
| `Ctrl+H` | Toggle HUD mode |
| `Esc`    | Close any open modal |

---

## File Structure

```
/
├── index.html       — Core HTML structure
├── styles.css       — All styling (Death Stranding aesthetic)
├── terminal.js      — Application logic
├── data.json        — Default seed data template
├── _headers         — Security headers (Netlify / Cloudflare Pages)
├── assets/
│   └── bridges-logo.svg
└── README.md
```

---

## Customising

**Add default games**: edit the `DEFAULT_GAMES` array in `terminal.js`  
**Change seed tasks**: edit `SEED_TASKS` in `terminal.js` or `data.json`  
**Adjust note clamp length**: change `NOTES_CLAMP` in the `CONFIG` object  
**Hover delay**: change `HOVER_DELAY` in `CONFIG` (ms before silver hover effect)
