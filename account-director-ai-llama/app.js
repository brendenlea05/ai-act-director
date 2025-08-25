// Hosted-ready static site. Default model: Llama 3.1 8B (WebLLM).
// Works purely in the browser; first load downloads weights (cached after).
let engine = null;
let currentModel = "Llama-3.1-8B-Instruct-q4f16_1-MLC";

const $ = (id)=>document.getElementById(id);
const messagesEl = $("messages");
const inputEl = $("input");
const statusEl = $("status");
const toastEl = $("toast");

function toast(msg){ toastEl.textContent = msg; toastEl.classList.add("show"); setTimeout(()=>toastEl.classList.remove("show"), 1200); }
function addMessage(role, content){
  const wrap = document.createElement("div");
  wrap.className = "msg " + role;
  const bub = document.createElement("div");
  bub.className = "bubble";
  bub.textContent = content;
  wrap.appendChild(bub);
  messagesEl.appendChild(wrap);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}
function uiStatus(t){ statusEl.textContent = t; }

async function waitForWebLLM(maxMs=20000){
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const lib = window.mlc || window.webllm;
    if (lib) return lib;
    await new Promise(r=>setTimeout(r,150));
  }
  throw new Error("WebLLM library not loaded (check connection or try Chrome/Edge).");
}
async function ensureEngine(){
  if (engine) return engine;
  uiStatus("Loading model… (first time can take minutes; cached after)");
  const WebLLM = await waitForWebLLM();
  engine = await WebLLM.CreateMLCEngine(currentModel, {
    initProgressCallback: (r)=> uiStatus(r.text || "Loading…")
  });
  uiStatus("Ready");
  addMessage("assistant", `Model loaded: ${currentModel}`);
  return engine;
}
$("initBtn").onclick = ensureEngine;
$("modelSelect").onchange = (e)=>{ currentModel = e.target.value; engine = null; uiStatus("Model set. Click Launch AI."); };

const KEY = "ad_ai_profile_v1";
function saveProfile(){
  const data = {
    name: $("accName").value.trim(),
    context: $("accContext").value.trim(),
    contacts: $("accContacts").value.trim(),
    risks: $("accRisks").value.trim(),
    renewal: $("accRenewal").value,
    standup: $("accStandup").value.trim()
  };
  localStorage.setItem(KEY, JSON.stringify(data));
  toast("Profile saved");
  return data;
}
function loadProfile(){
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    $("accName").value = d.name||"";
    $("accContext").value = d.context||"";
    $("accContacts").value = d.contacts||"";
    $("accRisks").value = d.risks||"";
    $("accRenewal").value = d.renewal||"";
    $("accStandup").value = d.standup||"";
    return d;
  } catch { return null; }
}
$("saveProfile").onclick = saveProfile;
$("clearProfile").onclick = ()=>{ localStorage.removeItem(KEY); ["accName","accContext","accContacts","accRisks","accRenewal","accStandup"].forEach(id=>$(id).value=""); toast("Profile cleared"); };
loadProfile();

async function generate(prompt){
  await ensureEngine();
  const sys = "You are an expert Account Director assistant. Be precise, structured, and safe. Always output clear, usable content.";
  let full = "";
  const stream = await engine.chat.completions.create({
    messages: [
      { role: "system", content: sys },
      { role: "user", content: prompt }
    ],
    stream: true
  });
  for await (const part of stream) {
    const delta = part?.choices?.[0]?.delta?.content || "";
    if (delta) full += delta;
  }
  return full || "(no output)";
}
$("composer").addEventListener("submit", async (e)=>{
  e.preventDefault();
  const text = inputEl.value.trim(); if (!text) return;
  inputEl.value = "";
  addMessage("user", text);
  try {
    const out = await generate(text);
    addMessage("assistant", out);
  } catch (err) {
    addMessage("assistant", "Error: " + (err?.message||err));
  }
});

const workflows = {
  weekly: (p)=>`Create a Weekly Account Plan for ${p.name||"the account"}.
Context: ${p.context}
Risks: ${p.risks}
Renewal: ${p.renewal||"n/a"}
Return sections: Priorities, Risks & Mitigations, Stakeholder Touchpoints, Value Moments, Next Steps (owners & dates).`,
  qbr: (p)=>`Draft a 6-slide QBR outline for ${p.name||"the account"}.
Include: Wins, ROI Metrics, Usage/Adoption, Open Issues, Roadmap Asks, Renewal Plan.`,
  emails: (p)=>`Write three client-ready emails for ${p.name||"the account"}:
1) Follow-up after discovery (subject + body).
2) Renewal nudge (subject + body).
3) Friendly check-in (subject + body).`,
  churn: (p)=>`Create a 7-day churn recovery plan for ${p.name||"the account"} with comms plan, quick wins, exec alignment, KPIs.`,
  execsum: (p)=>`Create a one-page Executive Summary for ${p.name||"the account"}: Context, KPIs, Value Delivered, Risks, Next Steps.`
};
document.querySelectorAll("[data-workflow]").forEach(btn=>{
  btn.addEventListener("click", async ()=>{
    const type = btn.getAttribute("data-workflow");
    const p = saveProfile();
    const prompt = workflows[type](p);
    addMessage("user", `Run workflow: ${type}`);
    const out = await generate(prompt);
    addMessage("assistant", out);
  });
});

function download(name, blob){
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}
function asCSV(text){ return new Blob([text], { type: "text/csv;charset=utf-8" }); }
function asTXT(text){ return new Blob([text], { type: "text/plain;charset=utf-8" }); }
function makeICS(summary, description, startLocalISO, durationMin=30){
  const dtStart = startLocalISO.replace(/[-:]/g, "").split(".")[0];
  const dtEnd = new Date(new Date(startLocalISO).getTime() + durationMin*60000).toISOString().replace(/[-:]/g,"").split(".")[0];
  const ics = [
    "BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Account Director AI//EN",
    "BEGIN:VEVENT",
    "UID:" + Date.now() + "@account-director-ai",
    "DTSTAMP:" + new Date().toISOString().replace(/[-:]/g,"").split(".")[0] + "Z",
    "DTSTART:" + dtStart.replace("Z",""),
    "DTEND:" + dtEnd.replace("Z",""),
    "SUMMARY:" + summary,
    "DESCRIPTION:" + description.replace(/\n/g,"\n"),
    "END:VEVENT","END:VCALENDAR"
  ].join("\r\n");
  return new Blob([ics], { type:"text/calendar;charset=utf-8" });
}
function nextDayTimeLocal(timeHHMM){
  const [hh, mm] = (timeHHMM || "10:00").split(":").map(x=>parseInt(x,10));
  const d = new Date(); d.setDate(d.getDate()+1); d.setHours(hh||10, mm||0, 0, 0);
  return d.toISOString();
}
$("runAuto").onclick = async ()=>{
  const p = saveProfile();
  addMessage("assistant", "Running Auto‑Manager…");
  if ($("amTasks").checked){
    const plan = await generate(workflows.weekly(p) + "\nReturn tasks as CSV columns: Task,Owner,Due Date,Priority,Status (use ISO dates).");
    download(`${(p.name||'account').replace(/\W+/g,'_')}-tasks.csv`, asCSV(plan));
  }
  if ($("amEmails").checked){
    const emails = await generate(workflows.emails(p) + "\nFormat each as:\nSUBJECT: ...\nBODY:\n...");
    const parts = emails.split(/SUBJECT:/i).filter(Boolean).slice(0,3);
    parts.forEach((chunk, idx)=>{
      const [subjectLine, bodyRest] = chunk.split(/\nBODY:\n/i);
      const subject = (subjectLine||"Client Email").trim();
      const body = (bodyRest||chunk).trim();
      const eml = [
        "From: you@example.com",
        "To: " + (p.contacts||"client@example.com"),
        "Subject: " + subject,
        "Content-Type: text/plain; charset=utf-8","",body
      ].join("\r\n");
      download(`${(p.name||'account').replace(/\W+/g,'_')}-email${idx+1}.eml`, new Blob([eml], { type:"message/rfc822" }));
    });
  }
  if ($("amICS").checked){
    const whenISO = nextDayTimeLocal(p.standup || "10:00");
    const desc = "Weekly standup for " + (p.name||"account");
    download(`${(p.name||'account').replace(/\W+/g,'_')}-standup.ics`, makeICS("Weekly Account Standup", desc, whenISO, 30));
  }
  if ($("amPPTX").checked){
    const q = await generate(workflows.qbr(p));
    try {
      const pptx = new PptxGenJS();
      const slide1 = pptx.addSlide(); slide1.addText("QBR — " + (p.name||"Account"), { x:0.5, y:0.5, fontSize:26, bold:true });
      const slide2 = pptx.addSlide(); slide2.addText(q, { x:0.5, y:0.6, fontSize:18, color:"363636", w:9, h:4.8 });
      const blob = await pptx.write("blob");
      download(`${(p.name||'account').replace(/\W+/g,'_')}-QBR.pptx`, blob);
    } catch (e){ addMessage("assistant", "PPTX export failed: " + (e?.message||e)); }
  }
  if ($("amSummary").checked){
    const s = await generate(workflows.execsum(p));
    download(`${(p.name||'account').replace(/\W+/g,'_')}-exec-summary.txt`, asTXT(s));
  }
  addMessage("assistant", "Auto‑Manager complete. Files downloaded.");
};
