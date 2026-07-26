"""
Array-zeroing puzzle solver.

Puzzle:
  - Array of integers, each value must stay within [-3, +3] at all times.
  - One move = add or subtract 1 at a chosen index.
  - Each index has a rule describing side effects on other indices:
      +1 means "apply the SAME operation to that index"
      -1 means "apply the OPPOSITE operation to that index"
  - A move is illegal if ANY affected value (including side effects)
    would leave the [-3, +3] range.
  - Goal: reach the all-zeros array.

Approach: breadth-first search over the state space. With values in
[-3, 3] and n elements there are at most 7**n states, so BFS is fast for
small arrays and guarantees a shortest solution (fewest moves).
"""

from collections import deque


def solve(initial, rules, lo=-3, hi=3):
    """
    initial : list[int]              starting array
    rules   : dict[int, dict[int,int]]
              rules[i][j] = +1 -> same op applied to j when you operate on i
                            -1 -> opposite op applied to j
              (index i itself always receives the chosen operation)
    Returns a list of steps [(index, delta, resulting_state), ...]
    or None if the puzzle is unsolvable.
    """
    n = len(initial)
    start = tuple(initial)
    goal = (0,) * n

    if any(v < lo or v > hi for v in start):
        raise ValueError("initial array is outside the allowed range")
    if start == goal:
        return []

    # Pre-compute the full effect list of operating on each index.
    # effects[i] = [(target_index, sign), ...] with sign +1 (same) / -1 (opposite)
    effects = []
    for i in range(n):
        eff = [(i, +1)]
        for j, sign in rules.get(i, {}).items():
            eff.append((j, sign))
        effects.append(eff)

    # BFS, remembering how we reached each state so we can rebuild the path.
    parent = {start: None}          # state -> (previous_state, index, delta)
    queue = deque([start])

    while queue:
        state = queue.popleft()
        for i in range(n):
            for delta in (+1, -1):
                new = list(state)
                legal = True
                for j, sign in effects[i]:
                    v = new[j] + delta * sign
                    if v < lo or v > hi:        # range violated -> illegal move
                        legal = False
                        break
                    new[j] = v
                if not legal:
                    continue

                nxt = tuple(new)
                if nxt in parent:               # already visited
                    continue
                parent[nxt] = (state, i, delta)

                if nxt == goal:                 # reconstruct the move sequence
                    path = []
                    cur = nxt
                    while parent[cur] is not None:
                        prev, idx, d = parent[cur]
                        path.append((idx, d, cur))
                        cur = prev
                    return path[::-1]

                queue.append(nxt)

    return None                                 # state space exhausted


def print_solution(initial, steps):
    if steps is None:
        print("not solvable")
        return
    print(f"Start: {list(initial)}")
    for k, (idx, delta, state) in enumerate(steps, 1):
        op = "+1" if delta > 0 else "-1"
        print(f"Step {k}: apply {op} at index {idx}  ->  {list(state)}")
    print(f"Solved in {len(steps)} step(s).")


if __name__ == "__main__":
    initial = [-2, -1, 0, +2, +2, +3]

    # rules[i][j]: -1 = opposite operation on j, +1 = same operation on j
    rules = {
        0: {},                          # no side effects
        1: {3: -1},                     # opposite op on index 3
        2: {1: -1, 3: -1, 4: -1},       # opposite op on indices 1, 3, 4
        3: {4: -1},                     # opposite op on index 4
        4: {0: +1, 1: -1, 3: -1},       # same op on 0, opposite on 1 and 3
        5: {3: -1},                     # opposite op on index 3
    }

    steps = solve(initial, rules)
    print_solution(initial, steps)
