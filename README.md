# Gothic-lockpicker

A static, single-page solver for the lockpicking minigame in the Gothic Remake.
Set the gates the way the lock shows them, describe how they are linked, press
**Solve**, and step through the shortest legal sequence of shifts one at a time
while you play.

No backend, no build step, no frameworks — just `index.html` plus two plain
`.js` files and a stylesheet.

## The puzzle

Each gate is a steel plate with seven holes. Its value is **which hole currently
sits on the keyway** — the vertical line running down the middle of the stack:

```
  −3  −2  −1   0  +1  +2  +3      <- hole positions
   o   o   o   |   o   o   o
               ^ keyway
```

- Shifting a gate **+1** moves its lit hole one place right, **−1** one place
  left. A gate can never slide past its outermost hole, so every value stays
  within **−3 … +3**.
- Gates can drag others along. A link is either **same** (the linked gate moves
  the same direction) or **opposite** (it moves the other way).
- A shift is **illegal** if any affected gate — the one you moved *or* anything
  it drags — would be pushed past its last hole. Illegal shifts are simply
  unavailable.
- The lock opens when **every** gate's hole is on the keyway, i.e. all values 0.

The solver runs a breadth-first search over the reachable states, so the
sequence it shows is always a *minimum-length* solution. If the search exhausts
every reachable state without ever aligning the gates, the lock is genuinely
unsolvable and the page says so.

## Using it

1. Set the **gate count** to match the lock (2–8).
2. For each gate, **tap the hole** that is on the keyway in-game, or nudge the
   gate with ◀ / ▶.
3. Under each gate, tap the numbered chips to mark which other gates it drags,
   and whether each moves the **same** way or the **opposite** way.
4. Press **Solve**, then walk the solution with **Next** / **Prev** (or the
   arrow keys). The gate being shifted is outlined in gold with its direction;
   gates that move as a side effect are outlined in orange. Gates already on
   the keyway glow green.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | The page. |
| `solver.js` | The BFS solver — a direct port of `puzzle_solver.py`. |
| `app.js` | UI: gate editors, step-through player, URL sharing. |
| `styles.css` | Styling. |
| `puzzle_solver.py` | The original Python reference implementation. |

`solver.js` also works under Node (`require('./solver.js').solve(values, rules)`),
which is how it was checked against the Python reference — for the built-in
6-gate example both produce the same 28-move sequence.

## Sharing a lock

The full setup — size, gate positions and every link — is encoded in the URL hash,
so **Copy link** yields a link to that exact lock. The format is
`#1~<values>~<links per gate>`, for example:

```
#1~-2,-1,0,2,2,3~.3o.1o,3o,4o.4o.0s,1o,3o.3o
```

which is the reference lock: gates at `[-2,-1,0,2,2,3]`, gate 1 opposite-linked
to gate 3, gate 2 opposite to 3 of its neighbours, and so on (`s` = same,
`o` = opposite).

## Limits

The search is capped at **6,000,000 explored states**; beyond that the page
reports "search limit reached" rather than freezing the tab. In practice the cap
is never reached: 8 gates is the maximum size, and the entire state space at
that size is 7⁸ = 5,764,801 — a full sweep takes well under a second.

## Publishing on GitHub Pages

Everything is static, so the repository can be served as-is:

1. Push the files to the `main` branch (`index.html` must be in the repository
   root).
2. On GitHub, open **Settings → Pages**.
3. Under **Build and deployment → Source**, choose **Deploy from a branch**.
4. Set the branch to **main** and the folder to **/ (root)**, then **Save**.
5. Wait a minute for the first deployment; the site appears at
   `https://<username>.github.io/<repository>/` — for this repo,
   <https://arjy143.github.io/Gothic-lockpicker/>.

Pushing to `main` afterwards redeploys automatically.

## Running locally

Open `index.html` directly in a browser, or serve the folder:

```sh
python3 -m http.server 8000   # then visit http://localhost:8000
```
