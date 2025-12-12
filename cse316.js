/* ---------------------------
   Virtual Memory Visualizer
   ---------------------------
   - Paging (FIFO, LRU, Optimal)
   - Segmentation visualization
   - Memory allocation (First/Best/Worst Fit)
   - Simple step/run/reset controls
*/

///// Global state for paging (for step mode)
let pagingState = null;

// Utility: create element with classes and text
function el(tag='div', classes=[], text='') {
  const d = document.createElement(tag);
  classes.forEach(c => d.classList.add(c));
  if (text) d.innerText = text;
  return d;
}

/* ---------------- PAGING ---------------- */
function runPaging() {
  // prepare engine and run to completion (fast)
  const seq = readSeq();
  if (!seq) return note('Enter a valid reference string (space separated).');

  const frames = parseInt(document.getElementById('frames').value) || 3;
  const algo = document.getElementById('algo').value;

  // Reset UI
  resetPaging();

  // Setup engine
  let frameArr = Array(frames).fill(null);
  let faults = 0, hits = 0;
  let lruTimestamps = {}; // page -> time index

  const timeline = document.getElementById('timeline');

  seq.forEach((page, idx) => {
    const event = {page: page, idx: idx};
    if (frameArr.includes(page)) {
      // hit
      hits++;
      lruTimestamps[page] = idx;
      pushTimeline(event, true);
      flashFrame(frameArr.indexOf(page), 'hit');
    } else {
      // fault
      faults++;
      if (frameArr.includes(null)) {
        frameArr[frameArr.indexOf(null)] = page;
      } else {
        // choose victim
        let victimIndex = 0;
        if (algo === 'FIFO') {
          // maintain a queue: use a simple pointer tracked via lruTimestamps keys order is not reliable -> implement queue
          // We'll emulate FIFO by rotating the array: shift then push
          frameArr.shift();
          frameArr.push(page);
          // no explicit victimIndex needed for UI; but pick last updated index (for flashing)
          victimIndex = frameArr.indexOf(page);
        } else if (algo === 'LRU') {
          // choose page with oldest timestamp
          let oldest = Infinity, victimPage = frameArr[0];
          frameArr.forEach(p => {
            const t = lruTimestamps[p] ?? -1;
            if (t < oldest) { oldest = t; victimPage = p; }
          });
          victimIndex = frameArr.indexOf(victimPage);
          frameArr[victimIndex] = page;
        } else if (algo === 'OPT') {
          // lookahead to find farthest used page
          let future = seq.slice(idx + 1);
          let farthest = -1, replacePage = frameArr[0];
          frameArr.forEach(p => {
            const pos = future.indexOf(p);
            if (pos === -1) { replacePage = p; farthest = 9999; }
            else if (pos > farthest) { farthest = pos; replacePage = p; }
          });
          victimIndex = frameArr.indexOf(replacePage);
          frameArr[victimIndex] = page;
        }
      }
      // update timestamp
      lruTimestamps[page] = idx;
      pushTimeline(event, false);
      // flash last touched frame (best effort)
      // compute index to flash: if page now present, find its index
      const nowIndex = frameArr.indexOf(page);
      flashFrame(nowIndex, 'fault');
    }

    // update UI states per iteration
    updateFrames(frameArr);
    updateStats(idx+1, faults, hits);
  });

  // final summary note
  note(`Run complete. Accesses: ${seq.length} • Faults: ${faults} • Hits: ${hits}`);
}

function readSeq() {
  const raw = document.getElementById('pageSeq').value.trim();
  if (!raw) return null;
  const parts = raw.split(/\s+/).map(s => {
    const v = Number(s);
    return isNaN(v) ? s : v;
  });
  return parts;
}

function updateFrames(frameArr) {
  const area = document.getElementById('frameArea');
  area.innerHTML = '';
  frameArr.forEach((p, i) => {
    const f = el('div', ['frame']);
    f.dataset.index = i;
    f.appendChild(el('div', [], p===null ? '-' : String(p)));
    f.appendChild(el('small', [], `Frame ${i}`));
    area.appendChild(f);
  });
}

function updateStats(accesses, faults, hits) {
  document.getElementById('accessInfo').innerText = `Accesses: ${accesses}`;
  document.getElementById('faultsInfo').innerText = `Page Faults: ${faults}`;
  document.getElementById('hitsInfo').innerText = `Hits: ${hits}`;
}

function pushTimeline(event, isHit) {
  const t = document.getElementById('timeline');
  const item = el('div', ['event']);
  const dot = el('div', ['dot', isHit ? 'hit' : 'fault']);
  const text = el('div', [], `#${event.idx+1} → Page ${event.page} • ${isHit ? 'Hit' : 'Fault'}`);
  item.appendChild(dot);
  item.appendChild(text);
  t.appendChild(item);
  // keep scrollbar at top (since column is reverse)
  t.scrollTop = t.scrollHeight;
}

function flashFrame(index, type) {
  if (index === -1 || index === null) return;
  const area = document.getElementById('frameArea');
  const node = area.querySelector(`.frame[data-index="${index}"]`);
  if (!node) return;
  node.classList.remove('hit','fault');
  node.classList.add(type);
  setTimeout(()=> node.classList.remove(type), 600);
}

function resetPaging() {
  document.getElementById('frameArea').innerHTML = '';
  document.getElementById('timeline').innerHTML = '';
  document.getElementById('accessInfo').innerText = 'Access: -';
  document.getElementById('faultsInfo').innerText = 'Page Faults: 0';
  document.getElementById('hitsInfo').innerText = 'Hits: 0';
  pagingState = null;
  note('Paging reset.');
}

/* Step mode (simple implementation): build pagingState first-time, then step through */
function stepPaging() {
  if (!pagingState) {
    const seq = readSeq();
    if (!seq) return note('Enter reference string for step mode.');
    const frames = parseInt(document.getElementById('frames').value) || 3;
    pagingState = {
      seq, frames,
      frameArr: Array(frames).fill(null),
      idx: 0,
      faults:0, hits:0,
      lruMap: {}
    };
    // clear UI
    document.getElementById('timeline').innerHTML = '';
    updateFrames(pagingState.frameArr);
    updateStats(0,0,0);
  }

  const s = pagingState;
  if (s.idx >= s.seq.length) {
    note('Step run finished.');
    return;
  }

  const page = s.seq[s.idx];
  const idx = s.idx;

  if (s.frameArr.includes(page)) {
    // hit
    s.hits++;
    s.lruMap[page] = idx;
    pushTimeline({page, idx}, true);
    flashFrame(s.frameArr.indexOf(page), 'hit');
  } else {
    // fault
    s.faults++;
    if (s.frameArr.includes(null)) {
      s.frameArr[s.frameArr.indexOf(null)] = page;
    } else {
      // LRU replacement for step mode (use algorithm selection)
      const algo = document.getElementById('algo').value;
      if (algo === 'FIFO') {
        s.frameArr.shift();
        s.frameArr.push(page);
      } else if (algo === 'LRU') {
        let oldest = Infinity, victim = s.frameArr[0];
        s.frameArr.forEach(p => {
          const t = s.lruMap[p] ?? -1;
          if (t < oldest) { oldest = t; victim = p; }
        });
        const vi = s.frameArr.indexOf(victim);
        s.frameArr[vi] = page;
      } else { // OPT
        const future = s.seq.slice(idx+1);
        let farthest=-1, replace = s.frameArr[0];
        s.frameArr.forEach(p => {
          const pos = future.indexOf(p);
          if (pos === -1) { replace = p; farthest = 9999; }
          else if (pos > farthest) { farthest = pos; replace = p; }
        });
        s.frameArr[s.frameArr.indexOf(replace)] = page;
      }
    }
    s.lruMap[page] = idx;
    pushTimeline({page, idx}, false);
    flashFrame(s.frameArr.indexOf(page), 'fault');
  }

  s.idx++;
  updateFrames(s.frameArr);
  updateStats(s.idx, s.faults, s.hits);
  if (s.idx >= s.seq.length) note('Step run finished.');
}

/* ---------------- SEGMENTATION ---------------- */
function runSegmentation() {
  const raw = document.getElementById('segments').value.trim();
  const out = document.getElementById('segOut');
  out.innerHTML = '';
  if (!raw) { out.innerText = 'Enter segment sizes (space separated).'; return; }
  const segs = raw.split(/\s+/).map(Number).filter(n=>!isNaN(n));
  if (segs.length===0) { out.innerText='No valid sizes found.'; return; }

  segs.forEach((s,i) => {
    const tag = el('span',['tag','seg'], `Segment ${i} → ${s} KB`);
    out.appendChild(tag);
  });

  note(`Visualized ${segs.length} segments.`);
}

function clearSeg(){ document.getElementById('segOut').innerHTML=''; note('Segments cleared.'); }

/* ---------------- MEMORY ALLOCATION ---------------- */
function runAllocation() {
  const rawHoles = document.getElementById('holes').value.trim();
  const proc = Number(document.getElementById('processSize').value);
  const method = document.getElementById('allocMethod').value;
  const out = document.getElementById('allocOut');
  out.innerHTML = '';

  if (!rawHoles) { out.innerText = 'Enter available hole sizes.'; return; }
  if (isNaN(proc) || proc<=0) { out.innerText = 'Enter valid process size.'; return; }

  let holes = rawHoles.split(/\s+/).map(Number).map((v,i)=>({size:v, index:i}));
  if (holes.length===0) { out.innerText='No valid holes.'; return; }

  let selectedIndex = -1;
  if (method === 'First Fit') {
    selectedIndex = holes.find(h => h.size >= proc)?.index ?? -1;
  } else if (method === 'Best Fit') {
    let best = Infinity;
    holes.forEach(h => { if (h.size>=proc && h.size < best) { best = h.size; selectedIndex = h.index; }});
  } else {
    // Worst Fit
    let worst = -1;
    holes.forEach(h => { if (h.size>=proc && h.size > worst) { worst = h.size; selectedIndex = h.index; }});
  }

  const tag = el('span',['tag','alloc']);
  if (selectedIndex === -1) {
    tag.innerText = `Process ${proc} KB cannot be allocated (no suitable hole).`;
    out.appendChild(tag);
    note('Allocation failed.');
  } else {
    tag.innerText = `Allocated ${proc} KB at hole index ${selectedIndex}.`;
    out.appendChild(tag);
    note(`Allocation successful (method: ${method}).`);
  }

  // show holes snapshot
  holes.forEach(h => {
    const htag = el('span',[], `Hole ${h.index}: ${h.size} KB`);
    htag.style.marginRight='8px';
    out.appendChild(htag);
  });
}

function clearAlloc(){ document.getElementById('allocOut').innerHTML=''; note('Allocation outputs cleared.'); }

/* ---------------- UTILS / NOTES ---------------- */
function note(text) {
  const n = document.getElementById('notes');
  n.innerText = text;
}

/* Initialize small default frame UI */
(function init(){
  updateFrames(Array(3).fill(null));
  note('Ready — enter inputs and Run. Use Step to walk through sequence.');
})();
