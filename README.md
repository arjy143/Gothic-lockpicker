# Gothic-lockpicker

A static, single-page solver for the lockpicking minigame in the Gothic Remake.
Enter the pins, describe how they are linked, press **Solve**, and step through
the shortest legal sequence of moves one at a time while you play.

No backend, no build step, no frameworks — just `index.html` plus two plain
`.js` files and a stylesheet.

## The puzzle

- Every pin holds an integer that must stay within **−3 … +3** at all times.
- One move is **+1** or **−1** on a chosen pin.
- Each pin can be linked to others. A link is either **same** (the linked pin
  moves in the same direction) or **opposite** (it moves the other way).
- A move is **illegal** if any affected pin — the one you pressed *or* anything
  it drags along — would leave the −3 … +3 range. Illegal moves are simply
  unavailable.
- Goal: every pin at **0**.

The solver runs a breadth-first search over the reachable states, so the
sequence it shows is always a *minimum-length* solution. If the search exhausts
every reachable state without hitting all-zeros, the puzzle is genuinely
unsolvable and the page says so.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | The page. |
| `solver.js` | The BFS solver — a direct port of `puzzle_solver.py`. |
| `app.js` | UI: pin editors, step-through player, URL sharing. |
| `styles.css` | Styling. |
| `puzzle_solver.py` | The original Python reference implementation. |

`solver.js` also works under Node (`require('./solver.js').solve(values, rules)`),
which is how it was checked against the Python reference — for the built-in
6-pin example both produce the same 28-move sequence.

## Sharing a lock

The full setup — size, pin values and every link — is encoded in the URL hash,
so **Copy link** yields a link to that exact lock. The format is
`#1~<values>~<links per pin>`, for example:

```
#1~-2,-1,0,2,2,3~.3o.1o,3o,4o.4o.0s,1o,3o.3o
```

which is the reference lock: values `[-2,-1,0,2,2,3]`, pin 1 opposite-linked to
pin 3, pin 2 opposite to 1/3/4, and so on (`s` = same, `o` = opposite).

## Limits

The search is capped at **6,000,000 explored states**; beyond that the page
reports "search limit reached" rather than freezing the tab. In practice the cap
is never reached: 8 pins is the maximum size, and the entire state space at that
size is 7⁸ = 5,764,801 — a full sweep takes well under a second.

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
