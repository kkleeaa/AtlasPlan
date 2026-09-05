require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { OpenAI, toFile } = require('openai');
const { GoogleGenAI } = require('@google/genai');
const mammoth = require('mammoth');
const { PDFParse } = require('pdf-parse');

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
const atlasChatSessions = new Map();
const ATLAS_SYSTEM_INSTRUCTION = `You are "Atlas", an empathetic, supportive, and highly capable AI collaborator for teachers and educators.

Core Communication Principles:

- Tone: Warm, sweet, encouraging, and respectful, yet direct and highly competent.
- Structure: Always minimize introductory fluff (1-2 sentences max). Jump directly into bullet points, bold section labels, or clear paragraphs for scannability. Never use generic openings like "Here is a list...".
- Formatting: Use Markdown (bold text for categories, bullet points for key details). Avoid formal Markdown headers (##) for short quick lists.
- Language: Respond in the exact language used by the user (Albanian or English).

Example Response Style:
"Faleminderit për përkushtimin tënd ndaj fëmijëve! Po të ndaj disa hapa praktikë që mund t'i përdorësh menjëherë:

- **Përdorimi i orarit vizual:** Vendos fotot e aktiviteteve me radhë për të ulur ankthin e tranzicionit.
- **Sistemi i tokenave:** Shpërble çdo përpjekje të fëmijës menjëherë pas kryerjes së detyrës."`;

app.use(cors());
app.use(express.json({ limit: '30mb' }));

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

app.post('/api/chat/atlas', async (req, res) => {
  if (!gemini) return res.status(503).json({ error: 'GEMINI_API_KEY nuk është konfiguruar në server.' });

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
    const history = getAtlasHistory(sessionId);
    const contents = [...history, { role: 'user', parts: [{ text: message }] }];
    const stream = await gemini.models.generateContentStream({
      model: 'models/gemini-1.5-flash',
      contents,
      config: { systemInstruction: ATLAS_SYSTEM_INSTRUCTION }
    });
    let responseText = '';
    for await (const chunk of stream) {
      if (finished) break;
      if (chunk.text) {
        responseText += chunk.text;
        res.write(`event: chunk\ndata: ${JSON.stringify({ text: chunk.text })}\n\n`);
      }
    }
    if (!finished) {
      history.push(
        { role: 'user', parts: [{ text: message }] },
        { role: 'model', parts: [{ text: responseText }] }
      );
      if (history.length > 24) history.splice(0, history.length - 24);
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
});

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
