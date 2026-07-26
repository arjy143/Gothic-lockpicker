/* Gothic Lockpick Solver — UI layer. Solver lives in solver.js.
 *
 * A gate is a steel plate with seven holes and a brass peg that slides between
 * them. The gate's value is which hole the peg sits on: −3 is the leftmost,
 * 0 the middle one (on the keyway), +3 the rightmost. Shifting a gate by +1
 * slides its peg one hole right, −1 one hole left. The lock opens when every
 * peg is on the keyway, i.e. all values are 0.
 *
 * Gate values are updated in place rather than by re-rendering, so the pegs
 * animate — both while you set the lock up and while you step a solution.
 */
(function () {
  'use strict';

  var LO = -3;
  var HI = 3;
  var HOLES = HI - LO + 1; // seven holes per gate
  var MIN_SIZE = 2;
  var MAX_SIZE = 8;
  var LIMIT = 6000000; // explored-state cap, keeps the tab responsive

  var PRESETS = {
    reference: {
      values: [-2, -1, 0, 2, 2, 3],
      rules: [{}, { 3: -1 }, { 1: -1, 3: -1, 4: -1 }, { 4: -1 }, { 0: 1, 1: -1, 3: -1 }, { 3: -1 }]
    },
    chest: {
      values: [1, 3, -2, 2],
      rules: [{ 1: -1 }, { 2: -1, 3: 1 }, { 3: -1 }, {}]
    }
  };

  var values = [];
  var rules = [];
  var selected = 0;    // gate the arrow keys drive
  var result = null;   // last solver result
  var states = [];     // states[0] = start, states[k] = after step k
  var cursor = 0;
  var gateEls = [];    // per-gate element refs in the editor
  var boardEls = [];   // per-gate element refs in the step-through player
  var ownHash = null;  // hash we wrote ourselves, to ignore our own hashchange

  var $ = function (id) { return document.getElementById(id); };

  /* ---------------- puzzle state ---------------- */

  function clampValue(v) {
    v = Math.round(Number(v));
    if (!isFinite(v)) return 0;
    return Math.max(LO, Math.min(HI, v));
  }

  function setSize(n) {
    n = Math.max(MIN_SIZE, Math.min(MAX_SIZE, n));
    while (values.length < n) { values.push(0); rules.push({}); }
    values.length = n;
    rules.length = n;
    // Drop links that point at gates which no longer exist.
    for (var i = 0; i < n; i++) {
      var keep = {};
      for (var j in rules[i]) {
        if (Number(j) < n && Number(j) !== i) keep[j] = rules[i][j] > 0 ? 1 : -1;
      }
      rules[i] = keep;
    }
    if (selected >= n) selected = n - 1;
  }

  function loadPuzzle(v, r) {
    values = v.map(clampValue);
    rules = [];
    for (var i = 0; i < values.length; i++) {
      rules.push(Object.assign({}, (r && r[i]) || {}));
    }
    setSize(values.length);
    clearSolution();
    render();
    writeHash();
  }

  /* ---------------- URL hash ---------------- */
  /* Format: #1~<values csv>~<links gate0>.<links gate1>. …
     each link group is a comma list of "<gate>s" (same) / "<gate>o" (opposite) */

  function encodeHash() {
    var groups = rules.map(function (r) {
      return Object.keys(r)
        .map(Number)
        .sort(function (a, b) { return a - b; })
        .map(function (j) { return j + (r[j] > 0 ? 's' : 'o'); })
        .join(',');
    });
    return '#1~' + values.join(',') + '~' + groups.join('.');
  }

  function decodeHash(hash) {
    var raw = String(hash || '').replace(/^#/, '');
    if (!raw) return null;
    var parts = raw.split('~');
    if (parts[0] !== '1' || parts.length < 2) return null;

    var v = parts[1].split(',').map(function (s) { return clampValue(parseInt(s, 10)); });
    if (v.length < MIN_SIZE) return null;
    v = v.slice(0, MAX_SIZE);

    var groups = (parts[2] || '').split('.');
    var r = [];
    for (var i = 0; i < v.length; i++) {
      var g = {};
      var entries = (groups[i] || '').split(',');
      for (var k = 0; k < entries.length; k++) {
        var m = /^(\d+)([so])$/.exec(entries[k]);
        if (!m) continue;
        var j = parseInt(m[1], 10);
        if (j >= v.length || j === i) continue;
        g[j] = m[2] === 's' ? 1 : -1;
      }
      r.push(g);
    }
    return { values: v, rules: r };
  }

  function writeHash() {
    ownHash = encodeHash();
    try {
      history.replaceState(null, '', location.pathname + location.search + ownHash);
    } catch (e) {
      // Some browsers reject replaceState on file:// URLs; plain assignment works.
      if (location.hash !== ownHash) location.hash = ownHash;
    }
  }

  /* ---------------- the plate ---------------- */

  /* Seven holes plus the sliding peg. `onPick` makes the holes tappable.
     Returns the plate element and the peg, so the peg can be moved later. */
  function buildPlate(onPick, label) {
    var p = el('div', 'plate' + (onPick ? '' : ' static'));
    var holes = el('div', 'holes');
    for (var k = 0; k < HOLES; k++) {
      var slot = k + LO; // −3 … +3, left to right
      var cell = el(onPick ? 'button' : 'div', 'hole-cell');
      if (onPick) {
        cell.type = 'button';
        cell.setAttribute('aria-label', label + ' to ' + (slot > 0 ? '+' + slot : slot));
        cell.onclick = pick(onPick, slot);
      }
      cell.appendChild(el('span', 'hole'));
      holes.appendChild(cell);
    }
    var peg = el('span', 'peg');
    holes.appendChild(peg);
    p.appendChild(holes);
    return { el: p, peg: peg };
  }

  function pick(fn, slot) {
    return function () { fn(slot); };
  }

  /* Slide a peg to the hole for `value`, and flag whether it is on the keyway. */
  function placePeg(plate, peg, value) {
    peg.style.setProperty('--i', String(value - LO));
    plate.classList.toggle('aligned', value === 0);
  }

  /* ---------------- rendering: setup ---------------- */

  function render() {
    $('size').textContent = String(values.length);
    $('size-dec').disabled = values.length <= MIN_SIZE;
    $('size-inc').disabled = values.length >= MAX_SIZE;
    renderGates();
  }

  function renderGates() {
    var host = $('gates');
    host.textContent = '';
    gateEls = [];
    for (var i = 0; i < values.length; i++) {
      host.appendChild(gateEditor(i));
    }
    for (var k = 0; k < values.length; k++) applyGateValue(k);
    applySelection();
  }

  function gateEditor(i) {
    var box = el('div', 'gate-editor');
    box.tabIndex = 0;
    box.onfocus = function () { selectGate(i); };
    box.onclick = function () { selectGate(i); };

    var head = el('div', 'gate-head');
    head.appendChild(el('span', 'gate-name', 'Gate ' + i));
    var val = el('span', 'gate-val', fmtValue(values[i]));
    head.appendChild(val);
    box.appendChild(head);

    var body = el('div', 'gate-body');
    var left = nudge(i, -1, '◀');
    var built = buildPlate(function (slot) { setValue(i, slot); }, 'Set gate ' + i);
    var right = nudge(i, 1, '▶');
    body.appendChild(left);
    body.appendChild(built.el);
    body.appendChild(right);
    box.appendChild(body);

    var links = el('div', 'links');
    links.appendChild(el('span', 'links-label', 'drags'));
    var any = false;
    for (var j = 0; j < values.length; j++) {
      if (j === i) continue;
      links.appendChild(linkChip(i, j));
      any = true;
    }
    if (any) box.appendChild(links);

    gateEls[i] = { card: box, plate: built.el, peg: built.peg, val: val, left: left, right: right };
    return box;
  }

  function nudge(i, d, glyph) {
    var b = el('button', 'nudge', glyph);
    b.type = 'button';
    b.setAttribute('aria-label', 'Shift gate ' + i + (d > 0 ? ' right' : ' left'));
    b.onclick = function () { setValue(i, values[i] + d); };
    return b;
  }

  function linkChip(i, j) {
    var st = rules[i][j] ? (rules[i][j] > 0 ? 1 : -1) : 0;
    var chip = el('button', 'chip');
    chip.type = 'button';
    chip.dataset.state = String(st);
    chip.setAttribute('aria-label',
      'Gate ' + i + ' link to gate ' + j + ': ' + (st === 0 ? 'off' : st > 0 ? 'same' : 'opposite'));
    chip.appendChild(document.createTextNode(String(j)));
    chip.appendChild(el('small', null, st === 0 ? 'off' : st > 0 ? 'same' : 'opp'));
    chip.onclick = function () {
      var next = st === 0 ? 1 : st > 0 ? -1 : 0;
      if (next === 0) delete rules[i][j]; else rules[i][j] = next;
      clearSolution();
      renderGates();
      writeHash();
    };
    return chip;
  }

  /* Update one gate in place so the peg animates instead of being rebuilt. */
  function applyGateValue(i) {
    var g = gateEls[i];
    if (!g) return;
    var v = values[i];
    placePeg(g.plate, g.peg, v);
    g.val.textContent = fmtValue(v);
    g.val.classList.toggle('aligned', v === 0);
    g.left.disabled = v <= LO;
    g.right.disabled = v >= HI;
  }

  function setValue(i, v) {
    selectGate(i);
    v = clampValue(v);
    if (v === values[i]) return;
    values[i] = v;
    clearSolution();
    applyGateValue(i);
    writeHash();
  }

  function selectGate(i) {
    if (i < 0 || i >= values.length) return;
    selected = i;
    applySelection();
  }

  function applySelection() {
    for (var i = 0; i < gateEls.length; i++) {
      gateEls[i].card.classList.toggle('selected', i === selected);
    }
  }

  /* ---------------- solving ---------------- */

  function solve() {
    var btn = $('solve');
    btn.disabled = true;
    btn.textContent = 'Searching…';
    setStatus('', 'Searching for the shortest sequence…');
    $('result-panel').hidden = false;
    $('player').hidden = true;
    $('steps').textContent = '';

    // Yield once so the button state actually paints before the search blocks.
    setTimeout(function () {
      var res;
      try {
        res = GothicSolver.solve(values.slice(), rules, { limit: LIMIT });
      } catch (e) {
        res = { status: 'error', message: e.message };
      }
      btn.disabled = false;
      btn.textContent = 'Solve';
      showResult(res);
    }, 20);
  }

  function showResult(res) {
    result = res;
    states = [];
    cursor = 0;

    if (res.status === 'solved') {
      states = [values.slice()].concat(res.steps.map(function (s) { return s.state; }));
      if (res.steps.length === 0) {
        setStatus('ok', 'Already open — every gate is on the keyway.');
      } else {
        setStatus('ok', 'Solved in <strong>' + res.steps.length + '</strong> shift' +
          (res.steps.length === 1 ? '' : 's') + '. Searched ' + res.explored.toLocaleString() + ' states.');
      }
      renderSteps(res.steps);
      buildBoard();
      $('player').hidden = false;
      renderPlayer();
    } else if (res.status === 'limit') {
      setStatus('fail', 'Search limit reached (' + LIMIT.toLocaleString() +
        ' states). Try a smaller lock.');
      $('player').hidden = true;
    } else if (res.status === 'error') {
      setStatus('fail', 'Error: ' + res.message);
      $('player').hidden = true;
    } else {
      setStatus('fail', 'Not solvable — no legal sequence of shifts aligns every gate ' +
        '(explored every one of ' + res.explored.toLocaleString() + ' reachable states).');
      $('player').hidden = true;
    }
    $('result-panel').hidden = false;
  }

  function renderSteps(steps) {
    var list = $('steps');
    list.textContent = '';
    steps.forEach(function (s, k) {
      var li = document.createElement('li');
      li.dataset.step = String(k + 1);
      li.appendChild(el('span', 'n', 'Step ' + (k + 1) + ':'));
      li.appendChild(el('span', 'op', 'shift gate ' + s.index + ' ' + arrow(s.delta) +
        ' (' + (s.delta > 0 ? '+1' : '−1') + ')'));
      li.appendChild(el('span', 'arr', '→ [' + s.state.map(fmtValue).join(', ') + ']'));
      li.onclick = function () { setCursor(k + 1); };
      list.appendChild(li);
    });
  }

  function arrow(delta) { return delta > 0 ? 'right' : 'left'; }

  /* ---------------- step-through player ---------------- */

  /* Built once per solution; stepping only moves pegs and swaps highlights. */
  function buildBoard() {
    var board = $('board');
    board.textContent = '';
    boardEls = [];
    for (var i = 0; i < values.length; i++) {
      var row = el('div', 'gate');
      var built = buildPlate(null);
      var val = el('span', 'val');
      var tag = el('span', 'tag');
      row.appendChild(el('span', 'idx', String(i)));
      row.appendChild(built.el);
      row.appendChild(val);
      row.appendChild(tag);
      board.appendChild(row);
      boardEls[i] = { row: row, plate: built.el, peg: built.peg, val: val, tag: tag };
    }
  }

  function setCursor(k) {
    if (!states.length) return;
    cursor = Math.max(0, Math.min(states.length - 1, k));
    renderPlayer();
  }

  function renderPlayer() {
    if (!states.length) return;
    var steps = result.steps;
    var move = cursor > 0 ? steps[cursor - 1] : null;

    // Which gates this move shifts, and in which direction.
    var touched = {};
    if (move) {
      touched[move.index] = move.delta;
      var side = rules[move.index] || {};
      for (var j in side) touched[j] = move.delta * (side[j] > 0 ? 1 : -1);
    }

    var state = states[cursor];
    for (var i = 0; i < state.length; i++) {
      var g = boardEls[i];
      placePeg(g.plate, g.peg, state[i]);
      g.val.textContent = fmtValue(state[i]);
      g.row.classList.toggle('zero', state[i] === 0);
      g.row.classList.toggle('active', !!move && i === move.index);
      g.row.classList.toggle('side', !!move && i !== move.index && touched[i] !== undefined);
      g.tag.textContent = touched[i] === undefined ? ' ' : (touched[i] > 0 ? '▶' : '◀');
    }

    $('step-label').textContent = cursor === 0
      ? 'Start — 0 of ' + steps.length
      : 'Step ' + cursor + ' of ' + steps.length;

    $('move-caption').innerHTML = move
      ? 'Shift gate <strong>' + move.index + '</strong> one hole <strong>' + arrow(move.delta) +
        '</strong> (' + (move.delta > 0 ? '+1' : '−1') + ').' +
        (Object.keys(touched).length > 1 ? ' Linked gates move with it (outlined).' : '')
      : (steps.length ? 'Starting position. Press Next, or ▶ / Esc to go back to editing.' : 'Nothing to do.');

    $('prev').disabled = cursor === 0;
    $('next').disabled = cursor >= steps.length;

    var lis = $('steps').children;
    for (var k = 0; k < lis.length; k++) {
      lis[k].classList.toggle('current', k === cursor - 1);
    }
    if (cursor > 0 && lis[cursor - 1]) {
      lis[cursor - 1].scrollIntoView({ block: 'nearest' });
    }
  }

  function clearSolution() {
    result = null;
    states = [];
    cursor = 0;
    $('result-panel').hidden = true;
    $('player').hidden = true;
    $('steps').textContent = '';
  }

  /* ---------------- helpers ---------------- */

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function fmtValue(v) { return v < 0 ? '−' + Math.abs(v) : String(v); }

  function setStatus(cls, html) {
    var s = $('status');
    s.className = 'status' + (cls ? ' ' + cls : '');
    s.innerHTML = html;
  }

  function copyLink() {
    writeHash();
    var url = location.href;
    var btn = $('share');
    var done = function () {
      btn.textContent = 'Copied!';
      setTimeout(function () { btn.textContent = 'Copy link'; }, 1600);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done, fallback);
    } else {
      fallback();
    }
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = url;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { btn.textContent = 'Copy failed'; }
      document.body.removeChild(ta);
    }
  }

  /* ---------------- wiring ---------------- */

  $('size-dec').onclick = function () {
    setSize(values.length - 1); clearSolution(); render(); writeHash();
  };
  $('size-inc').onclick = function () {
    setSize(values.length + 1); clearSolution(); render(); writeHash();
  };
  $('solve').onclick = solve;
  $('reset').onclick = function () {
    loadPuzzle(new Array(values.length).fill(0), []);
  };
  $('share').onclick = copyLink;
  $('prev').onclick = function () { setCursor(cursor - 1); };
  $('next').onclick = function () { setCursor(cursor + 1); };

  Array.prototype.forEach.call(document.querySelectorAll('[data-preset]'), function (b) {
    b.onclick = function () {
      var p = PRESETS[b.dataset.preset];
      loadPuzzle(p.values, p.rules);
    };
  });

  /* Arrow keys drive the lock itself while you are setting it up, and the
     walkthrough once a solution is on screen. Esc returns to setting up. */
  document.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var playing = states.length > 0;

    if (e.key === 'Escape') {
      if (playing) { e.preventDefault(); clearSolution(); }
      return;
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (playing) setCursor(cursor - 1); else setValue(selected, values[selected] - 1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (playing) setCursor(cursor + 1); else setValue(selected, values[selected] + 1);
    } else if (e.key === 'ArrowUp') {
      if (playing) return;
      e.preventDefault();
      focusGate(selected - 1);
    } else if (e.key === 'ArrowDown') {
      if (playing) return;
      e.preventDefault();
      focusGate(selected + 1);
    }
  });

  function focusGate(i) {
    if (i < 0 || i >= values.length) return;
    selectGate(i);
    if (gateEls[i] && gateEls[i].card.focus) gateEls[i].card.focus();
  }

  window.addEventListener('hashchange', function () {
    if (location.hash === ownHash) return;
    var p = decodeHash(location.hash);
    if (p) loadPuzzle(p.values, p.rules);
  });

  var initial = decodeHash(location.hash);
  if (initial) loadPuzzle(initial.values, initial.rules);
  else loadPuzzle(PRESETS.reference.values, PRESETS.reference.rules);
})();
