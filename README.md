# Gothic-lockpicker

Solver for the lockpicking minigame in the Gothic Remake. Set the gates the way
the lock shows them, mark how they are linked, and it gives you the shortest
legal sequence of shifts, one at a time.

Live at <https://arjy143.github.io/Gothic-lockpicker/>.

## The puzzle

Each gate is a plate with seven holes. Its value is which hole currently sits on
the keyway, the line running down the middle of the stack:

```
 -3  -2  -1   0  +1  +2  +3
  o   o   o   |   o   o   o
              ^ keyway
```

Shifting a gate +1 moves it one hole right, -1 one hole left, so every value
stays within -3 to +3. Gates can drag others along: a link is either `same` (the
linked gate moves the same direction) or `opposite` (it moves the other way).

A shift is illegal if any affected gate, the one you moved or anything it drags,
would be pushed past its last hole. The lock opens when every gate is on the
keyway, i.e. all values are 0.

## How the solver works

Breadth-first search over the reachable states, which guarantees the fewest
possible shifts. From each state it tries +1 and -1 on every gate, skips the
illegal ones, and records the state it came from so the move sequence can be
rebuilt once it reaches all-zeros. If the queue empties first, the lock is
unsolvable and it says so.

With 8 gates the entire state space is 7^8 = 5,764,801 states, so a full sweep
takes well under a second. States are packed into a single integer (base-7
digits, value + 3 per slot) so the queue and the parent table can be typed
arrays rather than a hash map. The search is capped at 6,000,000 states, which
at these sizes is never reached.

`solver.js` is a port of `puzzle_solver.py` and produces the same sequence. It
also runs under Node: `require('./solver.js').solve(values, rules)`.
