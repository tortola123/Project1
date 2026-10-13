const API = "https://api.scryfall.com";
const KEY = "mtg-collection-v1";
const $ = id => document.getElementById(id);
let view = "search", nextPage = null, results = [], busy = false;

// ---- storage (wrapped: can fail in private mode) ----
function load(){ try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } }
function persist(c){ try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { $("status").textContent = "Couldn't save: browser storage is unavailable."; } }
let coll = load();

// ---- helpers ----
const imgOf = (c, size="normal") => (c.image_uris || (c.card_faces && c.card_faces[0].image_uris) || {})[size] || "";
const slim = c => ({ id:c.id, name:c.name, set:(c.set_name||""), type:c.type_line||"", small:imgOf(c,"small"), normal:imgOf(c,"normal"), usd:c.prices && c.prices.usd });
const esc = s => String(s).replace(/[&<>"]/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[m]));
const total = () => Object.values(coll).reduce((n,e)=>n+e.qty,0);

function renderCount(){ const n = total(); $("count").textContent = n ? "(" + n + ")" : ""; }

function cardHTML(c, inColl){
  const e = coll[c.id];
  const action = e
    ? `<div class="qty"><button data-act="dec" aria-label="Remove one ${esc(c.name)}">−</button><span>${e.qty} owned</span><button data-act="inc" aria-label="Add one ${esc(c.name)}">+</button></div>`
    : `<button class="save" data-act="inc">Save card</button>`;
  return `<article class="card" data-id="${c.id}">
    <img src="${esc(c.small)}" data-big="${esc(c.normal)}" alt="${esc(c.name)}" loading="lazy">
    <div><div class="name">${esc(c.name)}</div><div class="meta">${esc(c.set)}${c.usd ? " · $" + c.usd : ""}</div></div>
    <div class="row">${action}</div></article>`;
}

function render(){
  renderCount();
  const grid = $("grid"), bar = $("bar");
  if (view === "search"){
    bar.hidden = true;
    grid.innerHTML = results.map(c => cardHTML(c)).join("");
    $("more").hidden = !nextPage;
  } else {
    const list = Object.values(coll).sort((a,b)=>a.name.localeCompare(b.name));
    $("more").hidden = true;
    bar.hidden = !list.length;
    const value = list.reduce((s,e)=>s + (parseFloat(e.usd)||0)*e.qty, 0);
    bar.innerHTML = `<span>${total()} cards, ${list.length} unique · est. $${value.toFixed(2)}</span>
      <span><button class="link" id="export">Export JSON</button> &nbsp; <button class="link" id="clear">Clear collection</button></span>`;
    grid.innerHTML = list.map(c => cardHTML(c, true)).join("");
    $("status").textContent = list.length ? "" : "Nothing saved yet. Search for a card and press Save card.";
  }
}

// ---- search ----
async function search(url){
  if (busy) return; busy = true;
  $("status").textContent = "Searching…";
  try {
    const r = await fetch(url);
    const d = await r.json();
    if (!r.ok){ results = []; nextPage = null; $("status").textContent = d.details || "No cards found."; }
    else {
      results = results.concat(d.data.map(slim));
      nextPage = d.has_more ? d.next_page : null;
      $("status").textContent = d.total_cards + " cards found" + (nextPage ? "; showing " + results.length : "");
    }
  } catch { $("status").textContent = "Couldn't reach Scryfall. Check your connection and try again."; }
  busy = false; render();
}

$("form").addEventListener("submit", e => {
  e.preventDefault();
  const q = $("q").value.trim(); if (!q) return;
  setView("search"); results = []; nextPage = null;
  search(API + "/cards/search?order=name&q=" + encodeURIComponent(q));
});
$("more").addEventListener("click", () => nextPage && search(nextPage));

// ---- tabs ----
function setView(v){
  view = v;
  $("t-search").setAttribute("aria-selected", v==="search");
  $("t-coll").setAttribute("aria-selected", v==="coll");
  $("form").hidden = $("hint").hidden = v !== "search";
  $("status").textContent = v==="search" && results.length ? $("status").textContent : "";
  render();
}
$("t-search").onclick = () => setView("search");
$("t-coll").onclick = () => setView("coll");

// ---- save / quantity / zoom ----
$("grid").addEventListener("click", e => {
  const card = e.target.closest(".card"); if (!card) return;
  const id = card.dataset.id;
  if (e.target.tagName === "IMG"){ $("big").src = e.target.dataset.big || e.target.src; $("big").alt = e.target.alt; $("dlg").showModal(); return; }
  const act = e.target.dataset.act; if (!act) return;
  if (act === "inc"){
    if (coll[id]) coll[id].qty++;
    else { const c = results.find(r => r.id === id); if (!c) return; coll[id] = { ...c, qty:1 }; }
  } else if (act === "dec"){
    if (--coll[id].qty <= 0) delete coll[id];
  }
  persist(coll); render();
});
$("dlg").addEventListener("click", () => $("dlg").close());

$("bar").addEventListener("click", e => {
  if (e.target.id === "clear" && confirm("Remove every saved card?")){ coll = {}; persist(coll); render(); }
  if (e.target.id === "export"){
    const rows = Object.values(coll).map(({name,set,qty,id}) => ({name,set,qty,scryfall_id:id}));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(rows,null,2)], {type:"application/json"}));
    a.download = "collection.json"; a.click(); URL.revokeObjectURL(a.href);
  }
});

render();
