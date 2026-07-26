/*
 * Gothic lockpick solver — direct port of puzzle_solver.py
 *
 * Puzzle:
 *   - Array of integers, each value must stay within [-3, +3] at all times.
 *   - One move = add or subtract 1 at a chosen index.
 *   - Each index has a rule describing side effects on other indices:
 *       +1 ("same")     -> apply the same operation to that index
 *       -1 ("opposite") -> apply the inverted operation to that index
 *   - A move is illegal if ANY affected value (including side effects) would
 *     leave the [-3, +3] range. Illegal moves are simply skipped.
 *   - Goal: reach the all-zeros array.
 *
 * Breadth-first search guarantees a minimum-length solution. States are packed
 * into a single integer (base-7 digits, value + 3 per slot) so the frontier and
 * the parent table can live in typed arrays.
 */
(function (root) {
  'use strict';

  var LO = -3;
  var HI = 3;
  var RANGE = HI - LO + 1; // 7 values per slot
  var DEFAULT_LIMIT = 6000000; // cap on explored states

  function powers(n) {
    var p = new Array(n + 1);
    p[0] = 1;
    for (var i = 1; i <= n; i++) p[i] = p[i - 1] * RANGE;
    return p;
  }

  function encode(values, pow) {
    var key = 0;
    for (var i = 0; i < values.length; i++) key += (values[i] - LO) * pow[i];
    return key;
  }

  function decode(key, n) {
    var out = new Array(n);
    for (var i = 0; i < n; i++) {
      out[i] = (key % RANGE) + LO;
      key = (key - ((key % RANGE) | 0)) / RANGE;
    }
    return out;
  }

  /*
   * Normalise rules into an array of {index, sign} lists.
   * Accepts either an array of plain objects (rules[i][j] = +1 / -1) or an
   * object keyed by index, matching the Python `dict[int, dict[int,int]]`.
   * Self-references and out-of-range targets are dropped.
   */
  function normalizeRules(rules, n) {
    var out = [];
    for (var i = 0; i < n; i++) {
      var raw = (rules && rules[i]) || {};
      var list = [];
      var keys = Object.keys(raw);
      for (var k = 0; k < keys.length; k++) {
        var j = parseInt(keys[k], 10);
        var sign = raw[keys[k]] > 0 ? 1 : -1;
        if (isNaN(j) || j < 0 || j >= n || j === i) continue;
        list.push({ index: j, sign: sign });
      }
      list.sort(function (a, b) { return a.index - b.index; });
      out.push(list);
    }
    return out;
  }

  /*
   * solve(initial, rules, options)
   *   -> { status: 'solved',     steps: [{index, delta, state}], explored }
   *   -> { status: 'unsolvable', steps: null, explored }
   *   -> { status: 'limit',      steps: null, explored }
   */
  function solve(initial, rules, options) {
    options = options || {};
    var limit = options.limit || DEFAULT_LIMIT;
    var n = initial.length;

    for (var v = 0; v < n; v++) {
      if (initial[v] < LO || initial[v] > HI) {
        throw new RangeError('initial array is outside the allowed range');
      }
    }

    var pow = powers(n);
    var total = pow[n];
    var startKey = encode(initial, pow);
    var goalKey = encode(new Array(n).fill(0), pow);

    if (startKey === goalKey) {
      return { status: 'solved', steps: [], explored: 1, limit: limit };
    }
    if (total > limit) {
      return { status: 'limit', steps: null, explored: 0, limit: limit };
    }

    var eff = normalizeRules(rules, n);

    /* Pre-compute every move: which digits shift, and the resulting key delta.
     * Move order matches the Python reference (index ascending, +1 before -1)
     * so BFS explores in the same order and returns the same sequence. */
    var moves = [];
    for (var i = 0; i < n; i++) {
      for (var d = 0; d < 2; d++) {
        var delta = d === 0 ? 1 : -1;
        var targets = [{ index: i, sign: 1 }].concat(eff[i]);
        var slots = [];
        var keyDelta = 0;
        for (var t = 0; t < targets.length; t++) {
          var step = delta * targets[t].sign;
          slots.push({ pow: pow[targets[t].index], step: step });
          keyDelta += step * pow[targets[t].index];
        }
        moves.push({ index: i, delta: delta, slots: slots, keyDelta: keyDelta });
      }
    }

    var parentKey = new Int32Array(total).fill(-1);
    var parentMove = new Int8Array(total);
    var queue = new Int32Array(total);
    var head = 0;
    var tail = 0;
    var explored = 0;

    queue[tail++] = startKey;
    parentKey[startKey] = -2; // root marker

    while (head < tail) {
      var key = queue[head++];
      explored++;
      if (explored > limit) {
        return { status: 'limit', steps: null, explored: explored, limit: limit };
      }

      for (var m = 0; m < moves.length; m++) {
        var mv = moves[m];
        var legal = true;
        for (var s = 0; s < mv.slots.length; s++) {
          var slot = mv.slots[s];
          var digit = Math.floor(key / slot.pow) % RANGE;
          var next = digit + slot.step;
          if (next < 0 || next >= RANGE) { legal = false; break; } // range violated
        }
        if (!legal) continue;

        var nk = key + mv.keyDelta;
        if (parentKey[nk] !== -1) continue; // already visited

        parentKey[nk] = key;
        parentMove[nk] = m;

        if (nk === goalKey) {
          return {
            status: 'solved',
            steps: rebuild(nk, startKey, parentKey, parentMove, moves, n),
            explored: explored,
            limit: limit
          };
        }
        queue[tail++] = nk;
      }
    }

    return { status: 'unsolvable', steps: null, explored: explored, limit: limit };
  }

  function rebuild(goalKey, startKey, parentKey, parentMove, moves, n) {
    var path = [];
    var cur = goalKey;
    while (cur !== startKey) {
      var mv = moves[parentMove[cur]];
      path.push({ index: mv.index, delta: mv.delta, state: decode(cur, n) });
      cur = parentKey[cur];
    }
    path.reverse();
    return path;
  }

  var api = {
    LO: LO,
    HI: HI,
    DEFAULT_LIMIT: DEFAULT_LIMIT,
    solve: solve,
    normalizeRules: normalizeRules
  };

  root.GothicSolver = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
