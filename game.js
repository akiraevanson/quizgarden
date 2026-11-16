// ---- Settings ----
// Paste your Cloudflare Worker URL here (see worker.js). Leave empty to use sample questions only.
const API_URL = "https://quiz-generator.akiraevanson.workers.dev/";
const BANK_KEY = "quizGardenQuestionBank";
const PERFORMANCE_KEY = "quizGardenPerformance";

let generatedPairs = [];
let currentStudySource = {
  setId: "",
  setTitle: "Garden Match",
  subject: "Uncategorized",
  source: "Garden Match"
};
let currentSessionId = "";

function makeId() {
  return (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function recordQuestionResult(pair, attempts, roundNumber) {
  const result = {
    id: makeId(),
    sessionId: currentSessionId,
    round: roundNumber,
    questionId: pair.questionId || "",
    question: String(pair.q || ""),
    answer: String(pair.a || ""),
    attempts,
    firstTry: attempts === 1,
    date: localDateKey(),
    completedAt: new Date().toISOString(),
    setId: currentStudySource.setId,
    setTitle: currentStudySource.setTitle,
    subject: currentStudySource.subject,
    source: currentStudySource.source
  };

  try {
    const saved = JSON.parse(localStorage.getItem(PERFORMANCE_KEY) || "[]");
    const records = Array.isArray(saved) ? saved : [];
    records.push(result);
    // Keep the newest 5,000 completed-question records to limit browser storage use.
    localStorage.setItem(PERFORMANCE_KEY, JSON.stringify(records.slice(-5000)));
  } catch (error) {
    console.error("Could not save study performance:", error);
    setStatus("Your answer was completed, but its review data could not be saved. Check browser storage.");
  }
}

const SAMPLE = [
  {q:"Which pigment captures light energy in plants?",a:"Chlorophyll"},
  {q:"Which gas do plants take in for photosynthesis?",a:"Carbon dioxide"},
  {q:"Which gas do plants release during photosynthesis?",a:"Oxygen"},
  {q:"Where in the cell does photosynthesis happen?",a:"Chloroplast"},
  {q:"What sugar do plants make from light?",a:"Glucose"},
  {q:"What tiny leaf openings let gases move in and out?",a:"Stomata"},
  {q:"What do roots mainly absorb from soil?",a:"Water"},
  {q:"What kind of energy powers photosynthesis?",a:"Sunlight"}];

// ---- Pixel art made from text (8x8) ----
const pix=(rows,pal)=>{let r="";rows.forEach((row,y)=>[...row].forEach((c,x)=>{if(pal[c])r+=`<rect x="${x}" y="${y}" width="1" height="1" fill="${pal[c]}"/>`}));
  return "data:image/svg+xml,"+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8" shape-rendering="crispEdges">${r}</svg>`)};
const PAL={g:"#5cc46a",G:"#2f8f4e",b:"#7a5238",p:"#ff8fb8",y:"#ffd84d"};
const SPROUT=pix(["..gg.gg.","..gGggG.",".gGG.GGg","..gGGg..","...GG...","...GG...","..bbbb..",".bbbbbb."],PAL);
const FLOWER=pix(["..pppp..",".ppyypp.",".ppyypp.","..pppp..","...GG...","..GGG...","...GG...","..bbbb.."],PAL);

// ---- State ----
const $=s=>document.querySelector(s);
const character=$(".character"), map=$(".map");
let x=64,y=100,speed=1,held_directions=[];
const LET=["A","B","C","D"], POT_X=[8,44,80,116], POT_Y=6, PLANT_X=[10,48,86,124];
let game=null,pool=[],used=0,score=0,round=0;
const shuffle=a=>{a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const setStatus=t=>$("#status").textContent=t;
const u=n=>`calc(var(--pixel-size) * ${n})`;

// ---- Load a question set selected from the Question Bank ----
function loadSavedQuestionSet(){
  const params = new URLSearchParams(window.location.search);
  const setId = params.get("set");
  if(!setId) return false;

  try {
    const bank = JSON.parse(localStorage.getItem(BANK_KEY) || "[]");
    const selectedSet = bank.find(set => set.id === setId);

    if(!selectedSet){
      setStatus("That saved question set could not be found. Open your Question Bank and select a set again.");
      return false;
    }

    const pairs = (selectedSet.questions || [])
      .filter(item => item && item.q && item.a)
      .map(item => ({q: String(item.q), a: String(item.a), questionId: item.id || ""}));

    if(pairs.length < 4){
      setStatus("This set needs at least four complete questions before you can play it.");
      return false;
    }

    $("#notes").value = "";
    generatedPairs = [];
    $("#saveSet").hidden = true;
    currentStudySource = {
      setId: selectedSet.id,
      setTitle: selectedSet.title || "Saved question set",
      subject: selectedSet.subject || "Uncategorized",
      source: "Question Bank"
    };
    setStatus(`Loaded "${selectedSet.title}". Your saved questions are ready!`);
    startGame(pairs, currentStudySource);
    return true;
  } catch(error) {
    console.error("Could not load the saved question set:", error);
    setStatus("There was a problem loading your saved questions. Try opening the set again.");
    return false;
  }
}

// ---- Game rounds ----
function startGame(pairs, source = currentStudySource) {
  currentStudySource = {
    setId: source.setId || "",
    setTitle: source.setTitle || "Garden Match",
    subject: source.subject || "Uncategorized",
    source: source.source || "Garden Match"
  };
  currentSessionId = makeId();
  pool = shuffle(pairs);
  used = 0;
  score = 0;
  round = 0;
  newRound();
}

function newRound(){
  document.querySelectorAll(".mpot,.plant,.carry").forEach(e=>e.remove());
  if(used+4>pool.length){pool=shuffle(pool);used=0}
  const pairs=pool.slice(used,used+4);used+=4;round++;
  const slots=shuffle([0,1,2,3]);
  game={pairs,solved:[],carry:null,carryEl:null,attempts:Array(pairs.length).fill(0),
    pots:pairs.map((p,i)=>({i,x:POT_X[i],y:POT_Y})),
    plants:pairs.map((p,i)=>{const s=slots.indexOf(i);return {id:i,a:p.a,x:PLANT_X[s],y:62+(s%2)*26,gone:false}})};
  game.pots.forEach(p=>{const e=document.createElement("div");e.className="mpot";e.style.left=u(p.x);e.style.top=u(p.y);e.innerHTML=`<b>${LET[p.i]}</b>`;map.appendChild(e);p.el=e});
  game.plants.forEach(p=>{const e=document.createElement("div");e.className="plant";e.style.left=u(p.x);e.style.top=u(p.y);e.innerHTML=`<img src="${SPROUT}" alt=""><span class="tag">${esc(p.a)}</span>`;map.appendChild(e);p.el=e});
  x=64;y=100;$("#next").hidden=true;renderPanel();
  setStatus("Walk into a plant to pick it up.");
}

function renderPanel(){
  $("#qs").innerHTML=game.pairs.map((p,i)=>`<li class="${game.solved.includes(i)?"done":""}"><span class="b">${LET[i]}</span><span>${esc(p.q)}<span class="ans">${esc(p.a)}</span></span></li>`).join("");
  $("#round").textContent="Round "+round;$("#score").textContent="Plants grown: "+score;
}

function checkHits(){
  const cx=x+16,cy=y+22;
  if(!game.carry){
    for(const p of game.plants){
      if(p.gone)continue;
      if(Math.hypot(cx-(p.x+8),cy-(p.y+8))<14){
        p.gone=true;p.el.style.display="none";game.carry=p;
        const c=document.createElement("img");c.className="carry";c.src=SPROUT;c.alt="";map.appendChild(c);game.carryEl=c;
        setStatus("Carrying: "+p.a+". Which pot does it answer?");break;
      }
    }
  }else{
    for(const pot of game.pots){
      if(game.solved.includes(pot.i))continue;
      if(Math.hypot(cx-(pot.x+12),cy-(pot.y+14))<16){
        const p=game.carry;game.carry=null;game.carryEl.remove();game.carryEl=null;
        game.attempts[p.id]++;
        if(p.id===pot.i){
          game.solved.push(pot.i);score++;
          recordQuestionResult(game.pairs[p.id], game.attempts[p.id], round);
          pot.el.insertAdjacentHTML("beforeend",`<img src="${FLOWER}" alt="">`);
          setStatus("Yes! "+p.a+" fits pot "+LET[pot.i]+".");
          if(game.solved.length===4){setStatus("Round complete! Your garden is blooming.");$("#next").hidden=false}
        }else{
          p.gone=false;p.el.style.display="";
          setStatus("Not pot "+LET[pot.i]+". The plant went back. Try another pot.");
        }
        renderPanel();break;
      }
    }
  }
}

// ---- Movement (loop, plus game checks) ----
const directions={up:"up",down:"down",left:"left",right:"right"};
const keys={ArrowUp:"up",w:"up",ArrowLeft:"left",a:"left",ArrowRight:"right",d:"right",ArrowDown:"down",s:"down"};

const placeCharacter=()=>{
  const pixelSize=parseInt(getComputedStyle(document.documentElement).getPropertyValue("--pixel-size"));
  const held=held_directions[0];
  if(held){
    if(held===directions.right)x+=speed;
    if(held===directions.left)x-=speed;
    if(held===directions.down)y+=speed;
    if(held===directions.up)y-=speed;
    character.setAttribute("facing",held);
  }
  character.setAttribute("walking",held?"true":"false");
  const leftLimit=-8,rightLimit=16*8+8,topLimit=-7,bottomLimit=16*7;
  if(x<leftLimit)x=leftLimit;if(x>rightLimit)x=rightLimit;
  if(y<topLimit)y=topLimit;if(y>bottomLimit)y=bottomLimit;
  character.style.transform=`translate3d(${x*pixelSize}px,${y*pixelSize}px,0)`;
  if(game){
    checkHits();
    if(game.carryEl){game.carryEl.style.left=u(x+10);game.carryEl.style.top=u(y-2)}
  }
};
const step=()=>{placeCharacter();requestAnimationFrame(step)};
step();

document.addEventListener("keydown", e => {
  // Ignore game controls while typing in inputs or textareas.
  if (
    e.target.tagName === "INPUT" ||
    e.target.tagName === "TEXTAREA" ||
    e.target.isContentEditable
  ) return;

  const dir = keys[e.key];
  if (dir) {
    e.preventDefault();
    if (held_directions.indexOf(dir) === -1) held_directions.unshift(dir);
  }
});
document.addEventListener("keyup",e=>{
  const i=held_directions.indexOf(keys[e.key]);
  if(i>-1)held_directions.splice(i,1);
});

// ---- Question generation ----
async function generate(){
  const notes=$("#notes").value.trim();
  if(notes.length<80){setStatus("Add a few more sentences of notes first (at least 80 characters).");return}
  if(!API_URL){
    generatedPairs = [];
    $("#saveSet").hidden = true;
    currentStudySource = {setId:"", setTitle:"Sample questions", subject:"Sample", source:"Sample"};
    setStatus("No AI connection set up yet, so these are the sample questions.");
    startGame(SAMPLE, currentStudySource);
    return;
  }
  generatedPairs = [];
  $("#saveSet").hidden = true;
  $("#gen").disabled=true;setStatus("Making your questions...");
  try{
    const r=await fetch(API_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({notes})});
    const data=await r.json();
    const pairs=(data.pairs||[]).filter(p=>p&&p.q&&p.a);
    if(!r.ok||pairs.length<4)throw new Error("bad response");
    generatedPairs = pairs.slice(0,8).map(item => ({q:String(item.q), a:String(item.a)}));
    currentStudySource = {
      setId: "",
      setTitle: "AI-generated practice",
      subject: "Uncategorized",
      source: "AI-generated"
    };
    $("#saveSet").hidden = false;
    startGame(generatedPairs, currentStudySource);
  }catch(err){setStatus("Couldn't make questions this time. Try again or use the sample notes.")}
  finally{$("#gen").disabled=false}
}

function saveGeneratedSet() {
  const title = $("#saveSetTitle").value.trim();
  const subject = $("#saveSetSubject").value.trim();
  if (!title) {
    setStatus("Please enter a name for your question set.");
    $("#saveSetTitle").focus();
    return;
  }
  if (generatedPairs.length < 4) {
    setStatus("Generate at least four questions before saving.");
    return;
  }

  try {
    const saved = JSON.parse(localStorage.getItem(BANK_KEY) || "[]");
    const bank = Array.isArray(saved) ? saved : [];
    const now = new Date().toISOString();
    const newSet = {
      id: makeId(),
      title,
      subject,
      createdAt: now,
      updatedAt: now,
      questions: generatedPairs.map(item => ({
        id: makeId(),
        q: item.q,
        a: item.a,
        flagged: false
      }))
    };
    bank.unshift(newSet);
    localStorage.setItem(BANK_KEY, JSON.stringify(bank));
    currentStudySource = {
      setId: newSet.id,
      setTitle: newSet.title,
      subject: newSet.subject || "Uncategorized",
      source: "Question Bank"
    };
    setStatus(`Saved "${title}" to your Question Bank!`);
    $("#saveSet").hidden = true;
    $("#saveSetTitle").value = "";
    $("#saveSetSubject").value = "";
  } catch (error) {
    console.error("Could not save generated question set:", error);
    setStatus("Couldn't save your questions. Check your browser storage.");
  }
}

$("#gen").addEventListener("click",generate);
$("#saveSet").addEventListener("click", saveGeneratedSet);
$("#demo").addEventListener("click",()=>{
  generatedPairs = [];
  $("#saveSet").hidden = true;
  currentStudySource = {setId:"", setTitle:"Sample questions", subject:"Sample", source:"Sample"};
  startGame(SAMPLE, currentStudySource);
});
$("#next").addEventListener("click",newRound);

// If the Question Bank opened this page with a set ID, load that set.
loadSavedQuestionSet();

/* BONUS! Dpad functionality for mouse and touch */
var isPressed = false;
const removePressedAll = () => {
   document.querySelectorAll(".dpad-button").forEach(d => {
      d.classList.remove("pressed")
   })
}
document.body.addEventListener("mousedown", () => {
   console.log('mouse is down')
   isPressed = true;
})
document.body.addEventListener("mouseup", () => {
   console.log('mouse is up')
   isPressed = false;
   held_directions = [];
   removePressedAll();
})
const handleDpadPress = (direction, click) => {   
   if (click) {
      isPressed = true;
   }
   held_directions = (isPressed) ? [direction] : []
   
   if (isPressed) {
      removePressedAll();
      document.querySelector(".dpad-"+direction).classList.add("pressed");
   }
}
//Bind a ton of events for the dpad
document.querySelector(".dpad-left").addEventListener("touchstart", (e) => handleDpadPress(directions.left, true));
document.querySelector(".dpad-up").addEventListener("touchstart", (e) => handleDpadPress(directions.up, true));
document.querySelector(".dpad-right").addEventListener("touchstart", (e) => handleDpadPress(directions.right, true));
document.querySelector(".dpad-down").addEventListener("touchstart", (e) => handleDpadPress(directions.down, true));

document.querySelector(".dpad-left").addEventListener("mousedown", (e) => handleDpadPress(directions.left, true));
document.querySelector(".dpad-up").addEventListener("mousedown", (e) => handleDpadPress(directions.up, true));
document.querySelector(".dpad-right").addEventListener("mousedown", (e) => handleDpadPress(directions.right, true));
document.querySelector(".dpad-down").addEventListener("mousedown", (e) => handleDpadPress(directions.down, true));

document.querySelector(".dpad-left").addEventListener("mouseover", (e) => handleDpadPress(directions.left));
document.querySelector(".dpad-up").addEventListener("mouseover", (e) => handleDpadPress(directions.up));
document.querySelector(".dpad-right").addEventListener("mouseover", (e) => handleDpadPress(directions.right));
document.querySelector(".dpad-down").addEventListener("mouseover", (e) => handleDpadPress(directions.down));