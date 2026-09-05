export const suggestedQuestions = [
  "Si ta mësoj pritjen e radhës?",
  "Si ta ul mbingarkesën shqisore?",
  "Strategji alternative AAC?",
  "Ide për orar vizual?",
  "Shembuj për përforcim pozitiv?"
];

const responseMap = [
  {
    keywords: ["radh", "prit", "turn", "taking"],
    answer: "Provo një rutinë të shkurtër dhe shumë vizuale: emërto radhën, trego kartën radha ime/radha jote, përdor një kohëmatës 30 sekondash dhe përforco pritjen para se nxënësi të frustrohet. Fillo me një aktivitet të preferuar që ushtrimi të ketë kuptim."
  },
  {
    keywords: ["shqisor", "mbingarkes", "zhurm", "sensory", "overload", "noise"],
    answer: "Ule ngarkesën shqisore duke paralajmëruar momentet me zhurmë, duke ofruar kufje ose një kënd qetësie para përshkallëzimit, duke pakësuar kërkesat verbale dhe duke përdorur kartë vizuale për pushim. Shëno vendin, tingullin dhe orën kur ndodh më shpesh."
  },
  {
    keywords: ["aac", "komunikim", "communication"],
    answer: "Përdor modelim të gjuhës me mbështetje: trego opsionin AAC ndërsa flet, prano përpjekjet e përafërta dhe mos kërko që nxënësi të përsërisë menjëherë pas teje. Mbaji fjalët kryesore të disponueshme gjatë gjithë ditës, jo vetëm në aktivitetet e të folurit."
  },
  {
    keywords: ["vizual", "orar", "visual", "schedule"],
    answer: "Bëje orarin konkret dhe të shkurtër. Përdor së pari/pastaj për detyrat e menjëhershme, një shirit me katër hapa për rutinat dhe orar ditor vetëm kur nxënësi mund ta shohë me qetësi. Hiqi ose shëno gjërat e përfunduara që progresi të duket."
  },
  {
    keywords: ["përforcim", "pozitiv", "shpërblim", "reinforcement", "positive", "reward"],
    answer: "Zgjidh përforcim që përputhet me përpjekjen e kërkuar. Emërto sjelljen e saktë, jep shpërblimin shpejt dhe gradualisht kalo nga shpërblimet konkrete te zgjedhjet, rolet udhëheqëse dhe lavdërimi specifik kur aftësia bëhet më e lehtë."
  }
];

export async function teacherCoach(message, student) {
  await new Promise((resolve) => setTimeout(resolve, 700));
  const lower = message.toLowerCase();
  const match = responseMap.find((item) => item.keywords.every((keyword) => lower.includes(keyword)) || item.keywords.some((keyword) => lower.includes(keyword)));
  const studentContext = student ? ` Për ${student.name}, lidhe strategjinë me objektivat aktuale dhe profilin shqisor.` : "";
  return `${match?.answer || "Fillo duke përcaktuar aftësinë që do të mësosh, zgjidh një lloj ndihme dhe mblidh një të dhënë të vogël çdo ditë. Mbaje rutinën të parashikueshme, përforco përpjekjen dhe ndrysho vetëm një element në të njëjtën kohë."}${studentContext}`;
}

export async function streamTeacherCoach(message, sessionId, onChunk) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 50000);
  try {
    const response = await fetch("http://localhost:5001/api/chat/atlas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, sessionId }),
      signal: controller.signal
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || `Kërkesa dështoi (${response.status}).`);
    }
    if (!response.body) throw new Error("Përgjigjja e Atlasit nuk mund të transmetohet.");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let completeText = "";
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      const events = buffer.split("\n\n");
      buffer = events.pop() || "";
      for (const block of events) {
        const event = block.match(/^event:\s*(.+)$/m)?.[1];
        const dataLine = block.match(/^data:\s*(.+)$/m)?.[1];
        const data = dataLine ? JSON.parse(dataLine) : {};
        if (event === "error") throw new Error(data.error || "Atlas nuk mundi të përgjigjej.");
        if (event === "chunk" && data.text) {
          completeText += data.text;
          onChunk(completeText);
        }
      }
      if (done) break;
    }
    if (!completeText.trim()) throw new Error("Atlas ktheu një përgjigje të zbrazët.");
    return completeText;
  } finally {
    clearTimeout(timeout);
  }
}

export function renderMarkdown(text) {
  const safe = String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
  return safe
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/`(.*?)`/g, "<code>$1</code>")
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block.split("\n");
      if (lines.every((line) => /^[-*]\s+/.test(line))) return `<ul>${lines.map((line) => `<li>${line.replace(/^[-*]\s+/, "")}</li>`).join("")}</ul>`;
      return `<p>${lines.join("<br>")}</p>`;
    })
    .join("");
}
