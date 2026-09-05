require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { OpenAI, toFile } = require('openai');

// DEBUG: Check if key is loaded
console.log("Key check:", process.env.OPENAI_API_KEY ? "Key loaded successfully! ✅" : "NO KEY FOUND ❌");

const app = express();
const PORT = process.env.PORT || 5001;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.use(cors());
app.use(express.json({ limit: '30mb' }));

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
