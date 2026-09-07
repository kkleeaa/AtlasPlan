require('dotenv').config();
require('dotenv').config({ path: '.env.local' });
const express = require('express');
const cors = require('cors');
const { OpenAI, toFile } = require('openai');
const { GoogleGenAI } = require('@google/genai');
const mammoth = require('mammoth');
const { PDFParse } = require('pdf-parse');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// DEBUG: Check if key is loaded
console.log("Key check:", process.env.OPENAI_API_KEY ? "Key loaded successfully! ✅" : "NO KEY FOUND ❌");

const app = express();
const PORT = process.env.PORT || 5001;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const gemini = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null;
const openrouter = process.env.OPENROUTER_API_KEY
  ? new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY,
      defaultHeaders: { 'X-OpenRouter-Title': 'AtlasPlan' }
    })
  : null;
const atlasChatSessions = new Map();
const ATLAS_SYSTEM_INSTRUCTION = `You are Atlas, an empathetic, highly knowledgeable AI educational consultant and supportive assistant built inside the School Management platform. You support teachers, school staff, and parents.

Your focus areas and core competencies:
1. Teaching Strategies & Classroom Management: Help teachers design active learning strategies, practical lesson plans, differentiated instruction, classroom routines, and positive discipline techniques.
2. Child Development & Support: Guide teachers and parents in supporting children through emotional, behavioral, social, or academic difficulties with care, patience, and empathy. Adapt ideas for different learning needs without reducing a child to a label.
3. Practical Pedagogical Guidance: Offer concrete activities, classroom management methods, step-by-step interventions, and realistic ideas that can be used immediately in class or at home.
4. Platform Knowledge: Explain and help users navigate Biblioteka e Materialeve, student profiles, progress tracking (Ndiq progresin), parent reports, schedules, calendars, and automatic birthday alerts.

Behavior and communication rules:
- Respond fluently and naturally in the same language used by the user, primarily Albanian when the user writes in Albanian.
- Be genuinely warm, encouraging, respectful, and human-like. Briefly validate difficult situations before giving useful guidance.
- Give concise, clear, actionable advice. Prefer short paragraphs, concrete steps, examples, or bullet points when they improve readability.
- Never repeat robotic template responses or canned disclaimers such as "Më fal, por unë jam vetëm një asistent".
- Do not behave like a limited database tool. For requests involving education, emotional support, child development, teaching, or parenting, engage naturally and helpfully.
- Avoid repetitive introductions. Tailor every response to the user's actual question, role, and active page.
- Frame suggestions constructively and protect the dignity, privacy, and wellbeing of every child.`;

app.use(cors());
app.use(express.json({ limit: '30mb' }));

const CALENDAR_STORE = path.join(__dirname, 'data', 'calendar-events.json');

function readCalendarEvents() {
  try {
    return JSON.parse(fs.readFileSync(CALENDAR_STORE, 'utf8'));
  } catch {
    return [];
  }
}

function writeCalendarEvents(events) {
  fs.mkdirSync(path.dirname(CALENDAR_STORE), { recursive: true });
  fs.writeFileSync(CALENDAR_STORE, JSON.stringify(events, null, 2));
}

app.get('/api/calendar-events', (req, res) => {
  const teacherId = String(req.query.teacherId || '').trim();
  if (!teacherId) return res.status(400).json({ error: 'Mungon identifikuesi i mësueses.' });
  const events = readCalendarEvents()
    .filter((event) => event.teacherId === teacherId)
    .sort((a, b) => `${a.date} ${a.time || ''}`.localeCompare(`${b.date} ${b.time || ''}`));
  res.json({ events });
});

app.post('/api/calendar-events', (req, res) => {
  const teacherId = String(req.body?.teacherId || '').trim();
  const date = String(req.body?.date || '').trim();
  const title = String(req.body?.title || '').trim();
  if (!teacherId || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !title) {
    return res.status(400).json({ error: 'Mësuesja, data dhe titulli janë të detyrueshme.' });
  }
  const events = readCalendarEvents();
  const requestedId = String(req.body?.id || '').trim();
  const existingIndex = events.findIndex((event) => event.id === requestedId && event.teacherId === teacherId);
  const calendarEvent = {
    id: existingIndex >= 0 ? events[existingIndex].id : crypto.randomUUID(),
    teacherId,
    studentId: String(req.body?.studentId || '').trim(),
    date,
    time: String(req.body?.time || '').slice(0, 5),
    type: ['EXAM', 'HOLIDAY', 'TRIP', 'DEADLINE', 'OTHER'].includes(req.body?.type) ? req.body.type : 'OTHER',
    title: title.slice(0, 120),
    notes: String(req.body?.notes || '').trim().slice(0, 1000),
    updatedAt: new Date().toISOString()
  };
  if (existingIndex >= 0) events[existingIndex] = calendarEvent;
  else events.push(calendarEvent);
  writeCalendarEvents(events);
  res.json({ event: calendarEvent });
});

app.post('/api/calendar-events/sync-birthday', (req, res) => {
  const studentId = String(req.body?.studentId || '').trim();
  const teacherId = String(req.body?.teacherId || '').trim();
  const studentName = String(req.body?.studentName || '').trim();
  const birthday = String(req.body?.birthday || '').trim();
  if (!studentId) return res.status(400).json({ error: 'Mungon identifikuesi i nxënësit.' });
  const sourceKey = `birthday:${studentId}`;
  const events = readCalendarEvents().filter((event) => event.sourceKey !== sourceKey);
  const match = birthday.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!teacherId || !studentName || !match) {
    writeCalendarEvents(events);
    return res.json({ event: null });
  }
  const [, day, month] = match;
  const now = new Date();
  let year = now.getFullYear();
  if (`${year}-${month}-${day}` < now.toISOString().slice(0, 10)) year += 1;
  const birthdayEvent = {
    id: crypto.randomUUID(),
    teacherId,
    date: `${year}-${month}-${day}`,
    time: '',
    type: 'BIRTHDAY',
    title: `Ditëlindja: ${studentName}`.slice(0, 120),
    notes: 'Përsëritet çdo vit',
    sourceKey,
    recurrence: 'ANNUAL',
    monthDay: `${month}-${day}`,
    updatedAt: new Date().toISOString()
  };
  events.push(birthdayEvent);
  writeCalendarEvents(events);
  res.json({ event: birthdayEvent });
});

app.delete('/api/calendar-events/:id', (req, res) => {
  const teacherId = String(req.query.teacherId || '').trim();
  const events = readCalendarEvents();
  const nextEvents = events.filter((event) => !(event.id === req.params.id && event.teacherId === teacherId));
  if (nextEvents.length === events.length) return res.status(404).json({ error: 'Ngjarja nuk u gjet.' });
  writeCalendarEvents(nextEvents);
  res.json({ success: true });
});

app.post('/api/extract-plan-text', async (req, res) => {
  try {
    const fileName = String(req.body?.fileName || '').toLowerCase();
    const encoded = String(req.body?.data || '');
    if (!encoded) return res.status(400).json({ error: 'Skedari mungon.' });
    const buffer = Buffer.from(encoded, 'base64');
    if (!buffer.length || buffer.length > 12 * 1024 * 1024) return res.status(400).json({ error: 'Skedari duhet të jetë më i vogël se 12 MB.' });

    let text = '';
    if (fileName.endsWith('.txt') || fileName.endsWith('.md') || fileName.endsWith('.csv')) {
      text = buffer.toString('utf8');
    } else if (fileName.endsWith('.docx')) {
      text = (await mammoth.extractRawText({ buffer })).value;
    } else if (fileName.endsWith('.pdf')) {
      const parser = new PDFParse({ data: buffer });
      try {
        text = (await parser.getText()).text;
      } finally {
        await parser.destroy();
      }
    } else {
      return res.status(415).json({ error: 'Formati nuk mbështetet. Përdorni PDF, DOCX, TXT, MD ose CSV.' });
    }

    if (!text.trim()) return res.status(422).json({ error: 'Nuk u gjet tekst i lexueshëm në skedar.' });
    res.json({ text });
  } catch (error) {
    console.error('Plan extraction error:', error.message);
    res.status(500).json({ error: 'Teksti nuk mund të nxirrej nga ky skedar.' });
  }
});

function getAtlasHistory(sessionId) {
  if (atlasChatSessions.has(sessionId)) return atlasChatSessions.get(sessionId);
  if (atlasChatSessions.size >= 200) atlasChatSessions.delete(atlasChatSessions.keys().next().value);
  const history = [];
  atlasChatSessions.set(sessionId, history);
  return history;
}

function normalizeAtlasMessages(messages, currentMessage) {
  const source = Array.isArray(messages) ? messages.slice(-24) : [];
  const normalized = source.reduce((history, item) => {
    const role = item?.role === 'model' || item?.role === 'ai' ? 'model' : item?.role === 'user' || item?.role === 'teacher' ? 'user' : '';
    const text = String(item?.text ?? item?.content ?? '').trim().slice(0, 6000);
    if (!role || !text) return history;
    if (!history.length && role === 'model') return history;
    const previous = history[history.length - 1];
    if (previous?.role === role) previous.parts[0].text += `\n${text}`;
    else history.push({ role, parts: [{ text }] });
    return history;
  }, []);
  const last = normalized[normalized.length - 1];
  if (!last || last.role !== 'user' || (last.parts[0].text !== currentMessage && !last.parts[0].text.endsWith(`\n${currentMessage}`))) {
    normalized.push({ role: 'user', parts: [{ text: currentMessage }] });
  }
  return normalized.slice(-24);
}

function atlasInstructionWithContext(context) {
  const roles = { teacher: 'teacher', admin: 'administrator', parent: 'parent' };
  const pages = {
    dashboard: 'dashboard', students: 'student profiles', upload: 'PIA upload', tools: 'Biblioteka e Materialeve',
    schedules: 'schedule and calendar', boards: 'communication materials', progress: 'Ndiq progresin',
    reports: 'parent reports', coach: 'Atlas chat', settings: 'settings', admin: 'administrator dashboard'
  };
  const role = roles[String(context?.role || '').toLowerCase()];
  const page = pages[String(context?.activePage || '')];
  if (!role && !page) return ATLAS_SYSTEM_INSTRUCTION;
  return `${ATLAS_SYSTEM_INSTRUCTION}\n\nCurrent trusted application context: ${role ? `the signed-in user is a ${role}` : ''}${role && page ? '; ' : ''}${page ? `the active page is ${page}` : ''}. Tailor navigation guidance to this context without changing permissions.`;
}

async function handleAtlasChat(req, res) {
  if (!openrouter && !gemini) return res.status(503).json({ error: 'Shërbimi AI nuk është konfiguruar në server.' });

  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId.trim() : '';
  if (!message) return res.status(400).json({ error: 'Mesazhi është i detyrueshëm.' });
  if (message.length > 6000) return res.status(400).json({ error: 'Mesazhi është shumë i gjatë.' });
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(sessionId)) return res.status(400).json({ error: 'Sesioni i bisedës nuk është i vlefshëm.' });

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  let finished = false;
  const timeout = setTimeout(() => {
    if (finished) return;
    finished = true;
    res.write(`event: error\ndata: ${JSON.stringify({ error: 'Atlas po merr më shumë kohë se zakonisht. Ju lutem provoni përsëri.' })}\n\n`);
    res.end();
  }, 45000);

  try {
    const sessionHistory = getAtlasHistory(sessionId);
    const contents = Array.isArray(req.body?.messages)
      ? normalizeAtlasMessages(req.body.messages, message)
      : [...sessionHistory, { role: 'user', parts: [{ text: message }] }];
    const systemInstruction = atlasInstructionWithContext(req.body?.context);
    const stream = openrouter
      ? await openrouter.chat.completions.create({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'system', content: systemInstruction },
            ...contents.map((item) => ({ role: item.role === 'model' ? 'assistant' : 'user', content: item.parts[0].text }))
          ],
          max_tokens: 800,
          stream: true
        })
      : await gemini.models.generateContentStream({
          model: 'gemini-2.5-flash',
          contents,
          config: { systemInstruction }
        });
    let responseText = '';
    for await (const chunk of stream) {
      if (finished) break;
      const text = openrouter ? chunk.choices?.[0]?.delta?.content : chunk.text;
      if (text) {
        responseText += text;
        res.write(`event: chunk\ndata: ${JSON.stringify({ text })}\n\n`);
      }
    }
    if (!finished) {
      atlasChatSessions.set(sessionId, [...contents, { role: 'model', parts: [{ text: responseText }] }].slice(-24));
      finished = true;
      res.write('event: done\ndata: {}\n\n');
      res.end();
    }
  } catch (error) {
    console.error('Gemini chat error:', error.message);
    atlasChatSessions.delete(sessionId);
    if (!finished) {
      finished = true;
      res.write(`event: error\ndata: ${JSON.stringify({ error: 'Atlas nuk mundi të përgjigjej tani. Ju lutem provoni përsëri.' })}\n\n`);
      res.end();
    }
  } finally {
    clearTimeout(timeout);
  }
}

app.post('/api/chat', handleAtlasChat);
app.post('/api/chat/atlas', handleAtlasChat);

function normalizeMessages(messages, prompt) {
  if (!Array.isArray(messages) || !messages.length) {
    const promptText = typeof prompt === 'string' ? prompt.trim() : '';
    if (!promptText) return null;
    return [
      { role: 'system', content: 'Ti je AtlasPlan, një asistent arsimor në Gjuhën Shqipe.' },
      { role: 'user', content: promptText }
    ];
  }

  return messages
    .filter((message) => message && typeof message === 'object')
    .map((message) => {
      if (Array.isArray(message.content)) {
        const content = message.content.filter((part) => {
          if (!part || typeof part !== 'object') return false;
          if (part.type === 'text') return typeof part.text === 'string' && part.text.trim();
          return part.type === 'image_url' && typeof part.image_url?.url === 'string' && part.image_url.url;
        });
        return { role: message.role || 'user', content };
      }
      return {
        role: message.role || 'user',
        content: typeof message.content === 'string' ? message.content : ''
      };
    })
    .filter((message) => Array.isArray(message.content) ? message.content.length : message.content.trim());
}

function ensureGoalCoreVocabulary(board, goal) {
  const normalizedGoal = goal.toLocaleLowerCase('sq-AL');
  const categories = board?.tabela_komunikimit?.kategorite;
  if (!Array.isArray(categories)) return board;

  const ensureWords = (categoryMatch, categoryName, requiredWords) => {
    let category = categories.find((item) => categoryMatch.test(String(item?.emri_kategorise || '').toLocaleLowerCase('sq-AL')));
    if (!category) {
      category = { emri_kategorise: categoryName, opsionet: [] };
      categories.push(category);
    }
    if (!Array.isArray(category.opsionet)) category.opsionet = [];
    const existing = new Set(category.opsionet.map((item) => String(item?.fjala || '').toLocaleLowerCase('sq-AL')));
    requiredWords.forEach((item) => {
      if (!existing.has(item.fjala)) category.opsionet.unshift(item);
    });
  };

  if ((normalizedGoal.includes('laj') || normalizedGoal.includes('lar')) && normalizedGoal.includes('duar')) {
    ensureWords(/veprim/, 'Veprimet', [
      { fjala: 'laj', kuptimi_ne_anglisht: 'wash', pershkrimi_vizual_anglisht: 'a child washing both hands with soap and water' }
    ]);
    ensureWords(/objekt/, 'Objektet', [
      { fjala: 'duart', kuptimi_ne_anglisht: 'the hands', pershkrimi_vizual_anglisht: 'two clean child hands' },
      { fjala: 'sapuni', kuptimi_ne_anglisht: 'the soap', pershkrimi_vizual_anglisht: 'a simple soap dispenser beside a sink' },
      { fjala: 'uji', kuptimi_ne_anglisht: 'the water', pershkrimi_vizual_anglisht: 'clean water flowing from a faucet' }
    ]);
  }
  return board;
}

app.post('/api/generate-plan', async (req, res) => {
  try {
    const { prompt, messages, response_format } = req.body;
    const safeMessages = normalizeMessages(messages, prompt);
    if (!safeMessages?.length) {
      return res.status(400).json({ error: 'Kërkesa nuk përmban tekst të vlefshëm për gjenerim.' });
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: safeMessages,
      ...(response_format ? { response_format } : {}),
    });

    const content = completion.choices[0].message.content;
    res.json({ success: true, plan: content, choices: completion.choices });
  } catch (error) {
    console.error('AI Error:', error.message);
    res.status(error.status || 500).json({ error: error.message });
  }
});

app.post('/api/generate-aac-board', async (req, res) => {
  try {
    const goal = typeof req.body?.goal === 'string' ? req.body.goal.trim() : '';
    if (!goal) return res.status(400).json({ error: 'Qëllimi mësimor është i detyrueshëm.' });

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `Ti je ekspert i AAC dhe gjuhës shqipe. Krijo vetëm një tabelë komunikimi që lidhet drejtpërdrejt me qëllimin e përdoruesit. Kthe vetëm JSON të vlefshëm me strukturën {"moduli_i_zgjedhur":"Moduli 3: Tabela e Komunikimit","tabela_komunikimit":{"kategorite":[{"emri_kategorise":"Veprimet","opsionet":[{"fjala":"...","kuptimi_ne_anglisht":"...","pershkrimi_vizual_anglisht":"..."}]}]}}. Përfshi kategoritë Veprimet, Objektet dhe Njerëzit/Përemrat, plus Fjalë Lidhëse/Parafjalë dhe Ndajfolje. Çdo kategori duhet të ketë të paktën 5 fjalë. Fjalori duhet të jetë specifik për qëllimin, jo sende të rastësishme. Për larjen e duarve duhet të përfshihen patjetër: duart, sapuni, uji dhe laj. Përdor shqip gramatikisht të saktë dhe ruaj çdo “ë”. Jep për çdo fjalë një përshkrim vizual të saktë në anglisht.`
        },
        {
          role: 'user',
          content: `Qëllimi mësimor: ${goal}\nKrijo fjalor AAC që përdoret vetëm për këtë aktivitet dhe që lejon ndërtimin e fjalive të thjeshta.`
        }
      ]
    });

    const content = completion.choices[0]?.message?.content || '{}';
    res.json(ensureGoalCoreVocabulary(JSON.parse(content), goal));
  } catch (error) {
    console.error('AAC board error:', error.message);
    res.status(error.status || 500).json({ error: error.message });
  }
});

app.post('/api/text-to-speech', async (req, res) => {
  try {
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    if (!text) return res.status(400).json({ error: 'Teksti është i detyrueshëm.' });
    if (text.length > 4096) return res.status(400).json({ error: 'Teksti është shumë i gjatë.' });

    const speech = await openai.audio.speech.create({
      model: 'tts-1',
      voice: 'nova',
      input: text,
      response_format: 'mp3'
    });
    const buffer = Buffer.from(await speech.arrayBuffer());
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  } catch (error) {
    console.error('Text-to-speech error:', error.message);
    res.status(error.status || 500).json({ error: error.message });
  }
});

app.post('/api/generate-image', async (req, res) => {
  try {
    const { prompt, size = '1024x1024', quality = 'low' } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt is required.' });

    const result = await openai.images.generate({
      model: 'gpt-image-1',
      prompt,
      size,
      quality,
      output_format: 'png'
    });
    res.json(result);
  } catch (error) {
    console.error('Image generation error:', error.message);
    res.status(error.status || 500).json({ error: error.message });
  }
});

function dataUrlToFile(dataUrl, index) {
  const match = String(dataUrl).match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s);
  if (!match) throw new Error('Invalid reference image.');
  const extension = match[1].includes('jpeg') ? 'jpg' : 'png';
  return toFile(Buffer.from(match[2], 'base64'), `reference-${index}.${extension}`, { type: match[1] });
}

app.post('/api/edit-image', async (req, res) => {
  try {
    const { prompt, images, size = '1024x1536', quality = 'low' } = req.body;
    if (typeof prompt !== 'string' || !prompt.trim() || !Array.isArray(images) || !images.length) {
      return res.status(400).json({ error: 'Prompt and reference images are required.' });
    }

    const imageFiles = await Promise.all(images.map(dataUrlToFile));
    const result = await openai.images.edit({
      model: 'gpt-image-1',
      image: imageFiles,
      prompt: prompt.trim(),
      size,
      quality,
      input_fidelity: 'high',
      output_format: 'png'
    });
    res.json(result);
  } catch (error) {
    console.error('Image edit error:', error.message);
    res.status(error.status || 500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Backend running securely on http://localhost:${PORT}`);
});
