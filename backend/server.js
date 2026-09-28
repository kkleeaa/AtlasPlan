require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });
require('dotenv').config({ path: require('path').resolve(__dirname, '.env.local'), override: true });
const express = require('express');
const cors = require('cors');
const { OpenAI, toFile } = require('openai');
const { GoogleGenAI } = require('@google/genai');
const mammoth = require('mammoth');
const { PDFParse } = require('pdf-parse');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const supabase = require('./config/supabase');

// DEBUG: Check if key is loaded
console.log("Key check:", process.env.OPENAI_API_KEY ? "Key loaded successfully! ✅" : "NO KEY FOUND ❌");

const app = express();
const PORT = process.env.PORT || 5001;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 10000,
  maxRetries: 2,
});
const openaiAac = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 35000,
  maxRetries: 2,
});
const openaiImages = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 240000,
  maxRetries: 2,
});
const openaiVision = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 45000,
  maxRetries: 2,
});

const JSON_SYSTEM_RULE = 'You must respond ONLY with a valid JSON object matching the requested schema in standard Albanian (sq-AL). Never include markdown blocks like ```json, headers, or conversational text.';
const FROZEN_APPROVED_GENERATION_NOTE = 'Do not change this frozen generation behavior unless the user explicitly asks for a new version.';
const FROZEN_TEXT_MODEL = 'gpt-4o-mini-2024-07-18';
const FROZEN_SEED = 424242;
const FROZEN_TEMPERATURE = 0.1;

const FROZEN_MODULE_PROMPTS = Object.freeze({
  sequences: `${JSON_SYSTEM_RULE}\n${FROZEN_APPROVED_GENERATION_NOTE}\nFROZEN MODULE 1 SCHEMA. Break the requested activity into exactly 8 small, chronological, child-safe steps. Every sentence must use correct standard Albanian. Return exactly {"moduli_i_zgjedhur":"Moduli 1: Sekuencat me Fjalë","sekuencat_me_fjale":{"hapat":[{"hapi":1,"simboli":"emoji","teksti_shkurter":"Unë ..."}]}}. Key names, nesting, types, and module name are immutable. Any deviation is forbidden.`,
  flashcards: `${JSON_SYSTEM_RULE}\n${FROZEN_APPROVED_GENERATION_NOTE}\nFROZEN MODULE 2 SCHEMA. Return exactly 8 concrete flashcards directly related to the requested activity. Albanian spelling and meaning must be exact. English visual descriptions must disambiguate every word. Return exactly {"moduli_i_zgjedhur":"Moduli 2: Flashcards","flashcards":[{"fjala":"...","kuptimi_ne_anglisht":"...","pershkrimi_vizual_anglisht":"one unambiguous object or action, no text"}]}. Key names, nesting, types, and module name are immutable. Any deviation is forbidden.`,
  communication: `${JSON_SYSTEM_RULE}\n${FROZEN_APPROVED_GENERATION_NOTE}\nFROZEN MODULE 3 SCHEMA. Build rich, activity-specific AAC vocabulary in correct, natural, standard Albanian for one exact requested routine only. The output must help a child and teacher build useful sentences for that same activity and must never drift into unrelated vocabulary. Use exactly five categories and keep these category names exactly: Veprimet (8-10), Objektet (7-10), Përemrat (only unë, ti), Fjalë Lidhëse/Parafjalë (6-9), Ndajfoljet (3-4). First silently imagine at least 7 short practical sentences a child or teacher would actually say during that routine, then extract the most useful words from those sentences. Every word must directly support the requested activity. Include the main action verb from the prompt whenever applicable, plus the place, materials, routine objects, and contextual helper words needed to build short sentences. Use grammatically correct Albanian, including correct letters like ë and ç. Avoid duplicates, near-duplicates, generic school words, or unrelated words. Prefer concrete usable forms that fit sentence building in AAC. For nouns and key routine words, prefer the form most useful on a board, and when a different case/form is clearly needed for that exact activity, include a closely related usable form only if it adds real sentence value. Every visual description must unambiguously show the exact meaning of the Albanian word. Do not confuse homonyms or similar-sounding words. Example: pastë in a dental routine means toothpaste, never pasta/food. For beach bathing topics include words like lahem, plazhi, deti, rëra, topi, kremi i diellit, peshqiri, lodrat e rërës or kova when relevant. For tooth brushing topics include words like dhëmbët, furça, pasta, goja, uji, rubineti, fërkoj, shpëlaj, marr, vendos, hap, mbyll, ngadalë, pastaj when relevant. Every option that represents an action, object, or place must have a simple visual concept that can be illustrated clearly for children; linking words and some adverbs may use simpler symbolic visuals but must still return a visual description string. Return exactly {"moduli_i_zgjedhur":"Moduli 3: Tabela e Komunikimit","tabela_komunikimit":{"kategorite":[{"emri_kategorise":"Veprimet","opsionet":[{"fjala":"...","simboli":"","kuptimi_ne_anglisht":"...","pershkrimi_vizual_anglisht":"..."}]}]}}. Key names, nesting, and types are immutable. Any deviation is forbidden.`,
  book: `${JSON_SYSTEM_RULE}\n${FROZEN_APPROVED_GENERATION_NOTE}\nFROZEN MODULE 4 SCHEMA. Write exactly 10 chronological pages that teach only the requested activity, not a general daily routine. Each page must contain one short, grammatically correct Albanian sentence describing one clear visible action by the named child. The 10 pages must progress step by step from the beginning of the activity to the successful completion of that same activity. Keep the same main object, place, and task across the whole book whenever the activity requires it. Never switch to an unrelated object, location, instrument, toy, or routine. Never drift into a full-day story. Use only natural, standard Albanian wording that a teacher would actually say to a child. The title and every page sentence must describe the activity with the correct Albanian verb-object structure. Never create ungrammatical phrases such as "lahet ne dhembe", "vishet ne kepuce", or other literal malformed constructions. If the requested activity is brushing teeth, use natural forms like "lan dhëmbët", "merr furçën", "vendos pastën", "fërkon dhëmbët", "shpëlan gojën". If the activity is hand washing, use forms like "lan duart" and never "lahet në duar". If the activity is reading, every page must stay about reading letters, sounds, syllables, words, or a book. If the activity is sleeping, the final pages must keep the child in bed and asleep or nearly asleep. If the activity is piano, keep the child at the piano and never replace it with another instrument. The book title must be short, natural Albanian and must name the exact activity correctly, for example "Ari lan dhëmbët", "Lina lan duart", "Noa lexon", not malformed or ambiguous phrasing. Page 10 must clearly complete the requested activity. Return exactly {"moduli_i_zgjedhur":"Moduli 4: Social Story (Libri Virtual)","social_story_libri":{"titulli_tregimit":"...","faqet":[{"numri_faqes":1,"teksti_faqes":"Emri ..."}]}}. Key names, nesting, types, page count, and module name are immutable. Any deviation is forbidden.`
});

const RESOURCE_TYPE_BY_MODULE = Object.freeze({
  sequences: 'sequence',
  flashcards: 'flashcards',
  communication: 'communication_board'
});

function normalizeSearchSlug(value) {
  const normalized = String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('sq-AL')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180);
  return normalized || 'pa-teme';
}

function buildResourceSearchSlug(resourceType, topic) {
  return `${resourceType}:${normalizeSearchSlug(topic)}`;
}

async function getCachedResource(resourceType, topic) {
  if (!supabase || !resourceType) return null;
  try {
    const searchSlug = buildResourceSearchSlug(resourceType, topic);
    const { data, error } = await supabase
      .from('cached_resources')
      .select('data')
      .eq('search_slug', searchSlug)
      .maybeSingle();
    if (error) {
      console.warn('Supabase cache read skipped:', error.message);
      return null;
    }
    return data?.data && typeof data.data === 'object' ? data.data : null;
  } catch (error) {
    console.warn('Supabase cache read failed:', error.message);
    return null;
  }
}

async function saveCachedResource(resourceType, topic, payload, title = '') {
  if (!supabase || !resourceType || !payload || typeof payload !== 'object' || Array.isArray(payload)) return;
  try {
    const searchSlug = buildResourceSearchSlug(resourceType, topic);
    const { error } = await supabase
      .from('cached_resources')
      .upsert({
        resource_type: resourceType,
        search_slug: searchSlug,
        title: String(title || topic || '').trim().slice(0, 300),
        data: payload
      }, { onConflict: 'search_slug' });
    if (error) console.warn('Supabase cache write skipped:', error.message);
  } catch (error) {
    console.warn('Supabase cache write failed:', error.message);
  }
}

function validateFrozenModule(moduleType, value) {
  const expectedNames = {
    sequences: 'Moduli 1: Sekuencat me Fjalë', flashcards: 'Moduli 2: Flashcards',
    communication: 'Moduli 3: Tabela e Komunikimit', book: 'Moduli 4: Social Story (Libri Virtual)'
  };
  if (value?.moduli_i_zgjedhur !== expectedNames[moduleType]) throw new Error('Emri i modulit devijoi nga skema e ngrirë.');
  if (moduleType === 'sequences') {
    const items = value?.sekuencat_me_fjale?.hapat;
    if (!Array.isArray(items) || items.length !== 8 || items.some((x) => !Number.isInteger(x?.hapi) || !String(x?.simboli || '').trim() || !String(x?.teksti_shkurter || '').trim())) throw new Error('Skema e sekuencave devijoi.');
  } else if (moduleType === 'flashcards') {
    const items = value?.flashcards;
    if (!Array.isArray(items) || items.length !== 8 || items.some((x) => !String(x?.fjala || '').trim() || !String(x?.kuptimi_ne_anglisht || '').trim() || !String(x?.pershkrimi_vizual_anglisht || '').trim())) throw new Error('Skema e flashcards devijoi.');
  } else if (moduleType === 'communication') {
    const categories = value?.tabela_komunikimit?.kategorite;
    const required = ['Veprimet', 'Objektet', 'Përemrat', 'Fjalë Lidhëse/Parafjalë', 'Ndajfoljet'];
    if (!Array.isArray(categories) || categories.length !== 5 || required.some((name) => !categories.some((x) => x?.emri_kategorise === name && Array.isArray(x?.opsionet)))) throw new Error('Skema e tabelës AAC devijoi.');
  } else if (moduleType === 'book') {
    const pages = value?.social_story_libri?.faqet;
    if (!String(value?.social_story_libri?.titulli_tregimit || '').trim() || !Array.isArray(pages) || pages.length !== 10 || pages.some((x, index) => x?.numri_faqes !== index + 1 || !String(x?.teksti_faqes || '').trim())) throw new Error('Skema e librit devijoi.');
  }
  return value;
}

function parseJsonObject(value, label = 'Përgjigjja AI') {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value.trim()) : value;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Expected an object.');
    return parsed;
  } catch (error) {
    throw new Error(`${label} nuk ishte JSON i vlefshëm: ${error.message}`);
  }
}

function enforceJsonMessages(messages) {
  const safe = Array.isArray(messages) ? messages.slice() : [];
  const systemIndex = safe.findIndex((message) => message.role === 'system' && typeof message.content === 'string');
  if (systemIndex >= 0) safe[systemIndex] = { ...safe[systemIndex], content: `${JSON_SYSTEM_RULE}\n${safe[systemIndex].content}` };
  else safe.unshift({ role: 'system', content: JSON_SYSTEM_RULE });
  return safe;
}

function sanitizeTtsText(value) {
  return String(value || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[*_~`#>\[\]{}()"“”'‘’]/g, ' ')
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}]/gu, ' ')
    .replace(/[^\p{L}\p{N}\s.,!?;:ëËçÇ-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 249);
}

const gemini = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null;
const GEMINI_MODEL = String(process.env.GEMINI_MODEL || 'gemini-3.6-flash').trim();
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
const APP_STATE_STORE = path.join(__dirname, 'data', 'app-state.json');
const APP_STATE_RESOURCE_TYPE = 'system_app_state';
const APP_STATE_SEARCH_SLUG = 'system:atlas-app-state-v1';
const CALENDAR_RESOURCE_TYPE = 'system_calendar_events';
const CALENDAR_SEARCH_SLUG = 'system:atlas-calendar-events-v1';
const ROLE_DATA_RESOURCE_TYPE = 'system_accounts';
const ROLE_DATA_SEARCH_SLUG = 'system:atlas-role-data-v1';
const ROLE_TYPE_TO_BUCKET = Object.freeze({ teacher: 'teachers', parent: 'parents', admin: 'admins' });
const BUCKET_TO_ROLE_TYPE = Object.freeze({ teachers: 'teacher', parents: 'parent', admins: 'admin' });
const DEFAULT_ROLE_ACCOUNTS = Object.freeze({
  teachers: [{ id: 'teacher-demo', name: 'Mësuesja Demo', username: 'mesues', email: 'mesues@atlas.al', password: 'Atlas123' }],
  parents: [{ id: 'parent-demo', name: 'Prindi Demo', username: 'prind', email: 'prind@atlas.al', password: 'Atlas123' }],
  admins: [{ id: 'admin-demo', name: 'Administratori', username: 'admin', email: 'admin@atlas.al', password: 'QendraPerparimi123!' }]
});
const DEMO_ACCOUNT_PUBLIC_IDS = Object.freeze({
  teacher: { mesues: 'teacher-demo' },
  parent: { prind: 'parent-demo' },
  admin: { admin: 'admin-demo' }
});

function stableUuid(scope, value) {
  const hash = crypto.createHash('sha1').update(`${scope}:${String(value || '').trim() || crypto.randomUUID()}`).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

function parseJsonText(value, fallback) {
  try {
    return JSON.parse(String(value || ''));
  } catch {
    return fallback;
  }
}

function isMissingColumnError(error, columnName) {
  const message = String(error?.message || '');
  return message.includes(`column ${columnName}`) || message.includes(`'${columnName}'`) || message.includes(`"${columnName}"`);
}

function birthdayToIso(value) {
  const match = String(value || '').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
}

function isoToBirthday(value) {
  const match = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : 'Nuk është shënuar';
}

function publicAccountIdForRoleUsername(role, username) {
  const normalizedRole = String(role || '').trim().toLocaleLowerCase('sq-AL');
  const normalizedUsername = String(username || '').trim().toLocaleLowerCase('sq-AL');
  return DEMO_ACCOUNT_PUBLIC_IDS[normalizedRole]?.[normalizedUsername] || normalizedUsername;
}

function roleFromBucket(bucket) {
  return BUCKET_TO_ROLE_TYPE[String(bucket || '').trim()] || '';
}

function usernameForPublicAccountId(role, accountId) {
  const normalizedRole = String(role || '').trim().toLocaleLowerCase('sq-AL');
  const normalizedAccountId = String(accountId || '').trim().toLocaleLowerCase('sq-AL');
  const pairs = Object.entries(DEMO_ACCOUNT_PUBLIC_IDS[normalizedRole] || {});
  const match = pairs.find(([, publicId]) => publicId === normalizedAccountId);
  return match ? match[0] : normalizedAccountId;
}

function buildProfileRow(account, fallbackBucket, fallbackIndex = 0) {
  const normalized = normalizeStoredAccount(account, fallbackBucket, fallbackIndex);
  if (!normalized) return null;
  const role = roleFromBucket(fallbackBucket);
  const publicId = String(normalized.id || '').trim() || publicAccountIdForRoleUsername(role, normalized.username);
  return {
    id: stableUuid('profile', publicId),
    full_name: normalized.name,
    role,
    username: normalized.username,
    password_hash: normalized.passwordHash,
    email: normalized.email,
    created_at: normalized.createdAt
  };
}

function toPublicAccountFromProfile(profile = {}) {
  const role = String(profile.role || '').trim().toLocaleLowerCase('sq-AL');
  const username = String(profile.username || '').trim().toLocaleLowerCase('sq-AL');
  return {
    id: publicAccountIdForRoleUsername(role, username),
    name: String(profile.full_name || profile.name || 'Përdorues').trim(),
    username,
    email: String(profile.email || '').trim(),
    createdAt: String(profile.created_at || new Date().toISOString())
  };
}

async function ensureDefaultProfilesSeeded() {
  if (!supabase) return false;
  try {
    const rows = Object.entries(DEFAULT_ROLE_ACCOUNTS)
      .flatMap(([bucket, accounts]) => accounts.map((account, index) => buildProfileRow(account, bucket, index)))
      .filter(Boolean);
    if (!rows.length) return true;
    const { error } = await supabase.from('profiles').upsert(rows, { onConflict: 'username' });
    if (error) {
      console.warn('Supabase default profile seed skipped:', error.message);
      return false;
    }
    return true;
  } catch (error) {
    console.warn('Supabase default profile seed failed:', error.message);
    return false;
  }
}

async function deleteAllRows(tableName) {
  if (!supabase) return false;
  try {
    const { error } = await supabase.from(tableName).delete().not('id', 'is', null);
    if (error) {
      console.warn(`Delete all from ${tableName} skipped:`, error.message);
      return false;
    }
    return true;
  } catch (error) {
    console.warn(`Delete all from ${tableName} failed:`, error.message);
    return false;
  }
}

function hasStructuredAppStateData(state = {}) {
  const arrayKeys = ['students', 'teachingMaterials'];
  const objectKeys = ['progressByStudent', 'reportsByStudent', 'scheduleByStudent', 'planAnalysesByStudent'];
  return arrayKeys.some((key) => Array.isArray(state[key]) && state[key].length)
    || objectKeys.some((key) => state[key] && typeof state[key] === 'object' && Object.keys(state[key]).length);
}

function readAppStateLocal() {
  try {
    const value = JSON.parse(fs.readFileSync(APP_STATE_STORE, 'utf8'));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function writeAppStateLocal(value) {
  fs.mkdirSync(path.dirname(APP_STATE_STORE), { recursive: true });
  const temporaryPath = `${APP_STATE_STORE}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(value, null, 2));
  fs.renameSync(temporaryPath, APP_STATE_STORE);
}

function readCalendarEventsLocal() {
  try {
    const value = JSON.parse(fs.readFileSync(CALENDAR_STORE, 'utf8'));
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function writeCalendarEventsLocal(events) {
  fs.mkdirSync(path.dirname(CALENDAR_STORE), { recursive: true });
  fs.writeFileSync(CALENDAR_STORE, JSON.stringify(Array.isArray(events) ? events : [], null, 2));
}

async function readSystemResource(resourceType, searchSlug) {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('cached_resources')
      .select('data')
      .eq('search_slug', searchSlug)
      .maybeSingle();
    if (error) {
      console.warn(`Supabase ${resourceType} read skipped:`, error.message);
      return null;
    }
    return data?.data ?? null;
  } catch (error) {
    console.warn(`Supabase ${resourceType} read failed:`, error.message);
    return null;
  }
}

async function writeSystemResource(resourceType, searchSlug, title, payload) {
  if (!supabase) return false;
  try {
    const { error } = await supabase
      .from('cached_resources')
      .upsert({
        resource_type: resourceType,
        search_slug: searchSlug,
        title,
        data: payload
      }, { onConflict: 'search_slug' });
    if (error) {
      console.warn(`Supabase ${resourceType} write skipped:`, error.message);
      return false;
    }
    return true;
  } catch (error) {
    console.warn(`Supabase ${resourceType} write failed:`, error.message);
    return false;
  }
}

async function readAppState() {
  const structured = await readAppStateFromStructuredTables();
  if (hasStructuredAppStateData(structured)) return structured;
  const remote = await readSystemResource(APP_STATE_RESOURCE_TYPE, APP_STATE_SEARCH_SLUG);
  if (remote && typeof remote === 'object' && !Array.isArray(remote)) return remote;
  const local = readAppStateLocal();
  if (Object.keys(local).length) {
    await writeSystemResource(APP_STATE_RESOURCE_TYPE, APP_STATE_SEARCH_SLUG, 'AtlasPlan app state', local);
  }
  return local;
}

async function writeAppState(value) {
  const safeValue = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  writeAppStateLocal(safeValue);
  await writeAppStateToStructuredTables(safeValue);
  await writeSystemResource(APP_STATE_RESOURCE_TYPE, APP_STATE_SEARCH_SLUG, 'AtlasPlan app state', safeValue);
}

async function readCalendarEvents() {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('calendar_events')
        .select('id, title, description, event_date, teacher_id, child_id, created_at')
        .order('event_date', { ascending: true });
      if (!error && Array.isArray(data) && data.length) {
        return data.map((row) => {
          const payload = parseJsonText(row.description, {});
          return {
            ...payload,
            id: String(payload.id || row.id || ''),
            title: String(payload.title || row.title || ''),
            date: String(payload.date || row.event_date || ''),
            teacherId: String(payload.teacherId || row.teacher_id || ''),
            studentId: String(payload.studentId || payload.childId || ''),
            updatedAt: String(payload.updatedAt || row.created_at || new Date().toISOString())
          };
        });
      }
      if (error) console.warn('Supabase calendar read skipped:', error.message);
    } catch (error) {
      console.warn('Supabase calendar read failed:', error.message);
    }
  }
  const remote = await readSystemResource(CALENDAR_RESOURCE_TYPE, CALENDAR_SEARCH_SLUG);
  if (Array.isArray(remote)) return remote;
  const local = readCalendarEventsLocal();
  if (local.length) {
    await writeSystemResource(CALENDAR_RESOURCE_TYPE, CALENDAR_SEARCH_SLUG, 'AtlasPlan calendar events', local);
  }
  return local;
}

async function writeCalendarEvents(events) {
  const safeEvents = Array.isArray(events) ? events : [];
  writeCalendarEventsLocal(safeEvents);
  if (supabase) {
    try {
      await deleteAllRows('calendar_events');
      const rows = safeEvents.map((event, index) => ({
        id: stableUuid(
          'calendar-event',
          event?.sourceKey
            ? `${event.sourceKey}:${event?.teacherId || ''}`
            : (event?.id || `${event?.teacherId || ''}:${event?.date || ''}:${event?.title || index}`)
        ),
        title: String(event?.title || '').slice(0, 200),
        description: JSON.stringify(event),
        event_date: String(event?.date || '').slice(0, 10),
        teacher_id: String(event?.teacherId || ''),
        child_id: event?.studentId ? stableUuid('child', event.studentId) : null,
        created_at: String(event?.updatedAt || new Date().toISOString())
      }));
      if (rows.length) {
        const { error } = await supabase.from('calendar_events').upsert(rows, { onConflict: 'id' });
        if (error) console.warn('Supabase calendar write skipped:', error.message);
      }
    } catch (error) {
      console.warn('Supabase calendar write failed:', error.message);
    }
  }
  await writeSystemResource(CALENDAR_RESOURCE_TYPE, CALENDAR_SEARCH_SLUG, 'AtlasPlan calendar events', safeEvents);
}

function hashAccountPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const derived = crypto.scryptSync(String(password || ''), salt, 64).toString('hex');
  return `scrypt:${salt}:${derived}`;
}

function verifyAccountPassword(password, passwordHash = '') {
  const [scheme, salt, expectedHash] = String(passwordHash || '').split(':');
  if (scheme !== 'scrypt' || !salt || !expectedHash) return false;
  const derived = crypto.scryptSync(String(password || ''), salt, 64).toString('hex');
  const expectedBuffer = Buffer.from(expectedHash, 'hex');
  const actualBuffer = Buffer.from(derived, 'hex');
  return expectedBuffer.length === actualBuffer.length && crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

function normalizeStoredAccount(account, fallbackBucket, fallbackIndex = 0) {
  if (!account || typeof account !== 'object' || Array.isArray(account)) return null;
  const fallback = DEFAULT_ROLE_ACCOUNTS[fallbackBucket]?.[fallbackIndex] || {};
  const email = String(account.email || fallback.email || '').trim();
  const username = String(
    account.username
      || email.split('@')[0]
      || fallback.username
      || `${fallbackBucket.slice(0, -1)}${fallbackIndex + 1}`
  ).trim().toLocaleLowerCase('sq-AL');
  const plainPassword = String(account.password || fallback.password || '').trim();
  const passwordHash = String(account.password_hash || account.passwordHash || '').trim()
    || (plainPassword ? hashAccountPassword(plainPassword) : '');
  return {
    id: String(account.id || fallback.id || crypto.randomUUID()).trim(),
    name: String(account.name || fallback.name || 'Përdorues').trim(),
    username,
    email,
    passwordHash,
    createdAt: String(account.createdAt || account.created_at || new Date().toISOString())
  };
}

function buildDefaultRoleDataStore() {
  return Object.fromEntries(Object.entries(DEFAULT_ROLE_ACCOUNTS).map(([bucket, accounts]) => [
    bucket,
    accounts.map((account, index) => normalizeStoredAccount(account, bucket, index)).filter(Boolean)
  ]));
}

function normalizeRoleDataStore(input = {}) {
  return Object.fromEntries(Object.keys(DEFAULT_ROLE_ACCOUNTS).map((bucket) => {
    const defaults = DEFAULT_ROLE_ACCOUNTS[bucket].map((account, index) => normalizeStoredAccount(account, bucket, index)).filter(Boolean);
    const defaultIds = new Set(defaults.map((account) => account.id));
    const extras = (Array.isArray(input[bucket]) ? input[bucket] : [])
      .filter((account) => account && !defaultIds.has(String(account.id || '')))
      .map((account, index) => normalizeStoredAccount(account, bucket, index + defaults.length))
      .filter(Boolean);
    return [bucket, [...defaults, ...extras]];
  }));
}

function toPublicRoleData(roleData = {}) {
  return Object.fromEntries(Object.keys(DEFAULT_ROLE_ACCOUNTS).map((bucket) => [
    bucket,
    (Array.isArray(roleData[bucket]) ? roleData[bucket] : []).map(({ passwordHash, ...account }) => account)
  ]));
}

async function readRoleDataFromSupabase() {
  if (!supabase) return null;
  try {
    await ensureDefaultProfilesSeeded();
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, role, username, email, password_hash, created_at')
      .order('created_at', { ascending: true });
    if (error) {
      console.warn('Supabase account read skipped:', error.message);
      return null;
    }
    if (!Array.isArray(data)) return null;
    const validProfiles = data.filter((profile) =>
      String(profile?.role || '').trim()
      && String(profile?.username || '').trim()
      && String(profile?.password_hash || '').trim()
    );
    if (!validProfiles.length) {
      return normalizeRoleDataStore(buildDefaultRoleDataStore());
    }
    return normalizeRoleDataStore(Object.values(ROLE_TYPE_TO_BUCKET).reduce((accumulator, bucket) => {
      accumulator[bucket] = validProfiles
        .filter((profile) => ROLE_TYPE_TO_BUCKET[String(profile.role || '').trim().toLocaleLowerCase('sq-AL')] === bucket)
        .map((profile) => {
          const publicAccount = toPublicAccountFromProfile(profile);
          return {
            ...publicAccount,
            passwordHash: String(profile.password_hash || '').trim()
          };
        });
      return accumulator;
    }, {}));
  } catch (error) {
    console.warn('Supabase account read failed:', error.message);
    return null;
  }
}

async function writeRoleDataToSupabase(roleData) {
  if (!supabase) return false;
  try {
    const payload = normalizeRoleDataStore(roleData);
    const rows = Object.entries(payload)
      .flatMap(([bucket, accounts]) => accounts.map((account, index) => buildProfileRow(account, bucket, index)))
      .filter(Boolean);
    const deleted = await deleteAllRows('profiles');
    if (!deleted && rows.length) {
      console.warn('Supabase account write skipped: old profiles could not be cleared.');
      return false;
    }
    if (rows.length) {
      const { error } = await supabase.from('profiles').upsert(rows, { onConflict: 'username' });
      if (error) {
        console.warn('Supabase account write skipped:', error.message);
        return false;
      }
    }
    return true;
  } catch (error) {
    console.warn('Supabase account write failed:', error.message);
    return false;
  }
}

async function getRoleDataStore() {
  const supabaseStore = await readRoleDataFromSupabase();
  if (supabaseStore) return normalizeRoleDataStore(supabaseStore);
  const legacyState = await readAppState();
  const seeded = normalizeRoleDataStore(legacyState.roleData || buildDefaultRoleDataStore());
  await writeRoleDataToSupabase(seeded);
  return seeded;
}

async function saveRoleDataStore(roleData) {
  const normalized = normalizeRoleDataStore(roleData);
  await writeRoleDataToSupabase(normalized);
  return normalized;
}

async function readProfilesIndex() {
  if (!supabase) return { byDbId: new Map(), byPublicId: new Map(), byUsername: new Map() };
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, role, username')
      .order('created_at', { ascending: true });
    if (error || !Array.isArray(data)) return { byDbId: new Map(), byPublicId: new Map(), byUsername: new Map() };
    const byDbId = new Map();
    const byPublicId = new Map();
    const byUsername = new Map();
    data.forEach((profile) => {
      const publicId = publicAccountIdForRoleUsername(profile.role, profile.username);
      byDbId.set(String(profile.id), publicId);
      byPublicId.set(publicId, String(profile.id));
      byUsername.set(String(profile.username || '').trim().toLocaleLowerCase('sq-AL'), String(profile.id));
    });
    return { byDbId, byPublicId, byUsername };
  } catch {
    return { byDbId: new Map(), byPublicId: new Map(), byUsername: new Map() };
  }
}

function pickFallbackProfileDbId(profilesIndex, preferredRole = 'teacher') {
  if (!profilesIndex?.byPublicId) return null;
  const preferredPublicId = `${preferredRole}-demo`;
  if (profilesIndex.byPublicId.has(preferredPublicId)) return profilesIndex.byPublicId.get(preferredPublicId);
  const firstPreferred = [...profilesIndex.byPublicId.entries()].find(([publicId]) => publicId.startsWith(`${preferredRole}-`));
  if (firstPreferred) return firstPreferred[1];
  const firstAny = profilesIndex.byPublicId.values().next();
  return firstAny.done ? null : firstAny.value;
}

function resolveProfileDbId(rawAuthorId, profilesIndex) {
  const value = String(rawAuthorId || '').trim();
  if (!value) return null;
  if (profilesIndex?.byPublicId?.has(value)) return profilesIndex.byPublicId.get(value);
  const normalizedUsername = value.toLocaleLowerCase('sq-AL');
  if (profilesIndex?.byUsername?.has(normalizedUsername)) return profilesIndex.byUsername.get(normalizedUsername);
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    return value;
  }
  return null;
}

async function readChildrenFromSupabase() {
  if (!supabase) return [];
  try {
    const [{ data: childRows, error: childError }, { data: relationshipRows, error: relationshipError }, profilesIndex] = await Promise.all([
      supabase
        .from('children')
        .select('id, name, age, full_name, birth_date, address, contact_number, notes, photo_url, created_by, created_at')
        .order('created_at', { ascending: true }),
      supabase
        .from('child_relationships')
        .select('child_id, profile_id, relationship_type, created_at'),
      readProfilesIndex()
    ]);
    if (childError) {
      console.warn('Supabase children read skipped:', childError.message);
      return [];
    }
    if (relationshipError) console.warn('Supabase child relationship read skipped:', relationshipError.message);
    const relationshipsByChildId = new Map();
    (Array.isArray(relationshipRows) ? relationshipRows : []).forEach((row) => {
      const key = String(row.child_id || '');
      if (!key) return;
      const list = relationshipsByChildId.get(key) || [];
      list.push(row);
      relationshipsByChildId.set(key, list);
    });
    return (Array.isArray(childRows) ? childRows : []).map((row) => {
      const payload = parseJsonText(row.notes, {});
      const relationships = relationshipsByChildId.get(String(row.id)) || [];
      const teacherRelationship = relationships.find((item) => String(item.relationship_type || '').trim() === 'teacher');
      const parentRelationship = relationships.find((item) => String(item.relationship_type || '').trim() === 'parent');
      return {
        ...payload,
        id: String(payload.id || row.id || ''),
        name: String(payload.name || row.full_name || row.name || 'Nxënës i ri'),
        nickname: String(payload.nickname || payload.name || row.full_name || row.name || 'Nxënës i ri'),
        age: payload.age ?? row.age ?? 'Nuk është shënuar',
        birthday: String(payload.birthday || isoToBirthday(row.birth_date)),
        address: String(payload.address || row.address || 'Nuk është shënuar'),
        contactNumber: String(payload.contactNumber || row.contact_number || 'Nuk është shënuar'),
        photoUrl: String(payload.photoUrl || row.photo_url || ''),
        teacherId: String(
          payload.teacherId
            || profilesIndex.byDbId.get(String(teacherRelationship?.profile_id || ''))
            || ''
        ),
        parentId: String(
          payload.parentId
            || profilesIndex.byDbId.get(String(parentRelationship?.profile_id || ''))
            || ''
        ),
        createdAt: String(payload.createdAt || row.created_at || new Date().toISOString())
      };
    });
  } catch (error) {
    console.warn('Supabase children read failed:', error.message);
    return [];
  }
}

async function writeChildrenToSupabase(students = []) {
  if (!supabase) return false;
  try {
    const profilesIndex = await readProfilesIndex();
    await deleteAllRows('child_relationships');
    await deleteAllRows('children');
    const rows = [];
    const relationships = [];
    students.forEach((student, index) => {
      const externalId = String(student?.id || `student-${index + 1}`);
      const rowId = stableUuid('child', externalId);
      rows.push({
        id: rowId,
        name: String(student?.name || 'Nxënës i ri').trim(),
        age: Number.isFinite(Number(student?.age)) ? Number(student.age) : null,
        full_name: String(student?.name || student?.nickname || 'Nxënës i ri').trim(),
        birth_date: birthdayToIso(student?.birthday),
        address: String(student?.address || 'Nuk është shënuar'),
        contact_number: String(student?.contactNumber || 'Nuk është shënuar'),
        notes: JSON.stringify({ ...student, id: externalId }),
        photo_url: String(student?.photoUrl || ''),
        created_by: String(student?.teacherId || ''),
        created_at: String(student?.createdAt || new Date().toISOString())
      });
      [
        ['teacher', String(student?.teacherId || '')],
        ['parent', String(student?.parentId || '')]
      ].forEach(([relationshipType, publicId]) => {
        if (!publicId) return;
        const profileId = profilesIndex.byPublicId.get(publicId) || stableUuid('profile', publicId);
        relationships.push({
          id: stableUuid('child-relationship', `${externalId}:${relationshipType}:${publicId}`),
          child_id: rowId,
          profile_id: profileId,
          relationship_type: relationshipType,
          created_at: new Date().toISOString()
        });
      });
    });
    if (rows.length) {
      const { error } = await supabase.from('children').upsert(rows, { onConflict: 'id' });
      if (error) {
        console.warn('Supabase children write skipped:', error.message);
        return false;
      }
    }
    if (relationships.length) {
      const { error } = await supabase.from('child_relationships').upsert(relationships, { onConflict: 'id' });
      if (error) console.warn('Supabase child relationship write skipped:', error.message);
    }
    return true;
  } catch (error) {
    console.warn('Supabase children write failed:', error.message);
    return false;
  }
}

async function readProgressFromSupabase() {
  if (!supabase) return {};
  try {
    const { data, error } = await supabase
      .from('student_progress')
      .select('id, child_id, author_id, entry_type, content, created_at')
      .order('created_at', { ascending: true });
    if (error) {
      console.warn('Supabase progress read skipped:', error.message);
      return {};
    }
    return (Array.isArray(data) ? data : []).reduce((accumulator, row) => {
      const payload = parseJsonText(row.content, {});
      const childId = String(payload.studentId || payload.childId || row.child_id || '');
      if (!childId) return accumulator;
      const entry = {
        ...payload,
        id: String(payload.id || row.id || ''),
        studentId: childId,
        authorId: String(payload.authorId || row.author_id || ''),
        entryType: String(payload.entryType || row.entry_type || 'note'),
        createdAt: String(payload.createdAt || row.created_at || ''),
        date: String(payload.date || row.created_at || '').slice(0, 10)
      };
      accumulator[childId] ||= [];
      accumulator[childId].push(entry);
      return accumulator;
    }, {});
  } catch (error) {
    console.warn('Supabase progress read failed:', error.message);
    return {};
  }
}

async function writeProgressToSupabase(progressByStudent = {}) {
  if (!supabase) return false;
  try {
    const profilesIndex = await readProfilesIndex();
    const fallbackAuthorId = pickFallbackProfileDbId(profilesIndex, 'teacher');
    await deleteAllRows('student_progress');
    const rows = Object.entries(progressByStudent || {}).flatMap(([childId, entries]) =>
      (Array.isArray(entries) ? entries : []).map((entry, index) => ({
        id: stableUuid('student-progress', `${childId}:${entry?.id || index}:${entry?.date || ''}:${entry?.goal || ''}`),
        child_id: stableUuid('child', childId),
        author_id: resolveProfileDbId(entry?.authorId || '', profilesIndex) || fallbackAuthorId,
        entry_type: String(entry?.entryType || 'note'),
        content: JSON.stringify({ ...entry, studentId: childId }),
        created_at: String(entry?.createdAt || entry?.date || new Date().toISOString())
      }))
    );
    if (!rows.length) return true;
    const { error } = await supabase.from('student_progress').upsert(rows, { onConflict: 'id' });
    if (error) {
      console.warn('Supabase progress write skipped:', error.message);
      return false;
    }
    return true;
  } catch (error) {
    console.warn('Supabase progress write failed:', error.message);
    return false;
  }
}

async function readReportsFromSupabase() {
  if (!supabase) return {};
  try {
    let { data, error } = await supabase
      .from('reports')
      .select('id, child_id, author_id, title, content, created_at, updated_at')
      .order('updated_at', { ascending: true });
    if (error && isMissingColumnError(error, 'updated_at')) {
      ({ data, error } = await supabase
        .from('reports')
        .select('id, child_id, author_id, title, content, created_at')
        .order('created_at', { ascending: true }));
    }
    if (error) {
      console.warn('Supabase reports read skipped:', error.message);
      return {};
    }
    return (Array.isArray(data) ? data : []).reduce((accumulator, row) => {
      const payload = parseJsonText(row.content, {});
      const childId = String(payload.childId || payload.studentId || row.child_id || '');
      if (!childId) return accumulator;
      accumulator[childId] = payload.value ?? payload;
      return accumulator;
    }, {});
  } catch (error) {
    console.warn('Supabase reports read failed:', error.message);
    return {};
  }
}

async function writeReportsToSupabase(reportsByStudent = {}) {
  if (!supabase) return false;
  try {
    const profilesIndex = await readProfilesIndex();
    const fallbackAuthorId = pickFallbackProfileDbId(profilesIndex, 'teacher');
    await deleteAllRows('reports');
    const rows = Object.entries(reportsByStudent || {}).map(([childId, value]) => ({
      id: stableUuid('student-report', childId),
      child_id: stableUuid('child', childId),
      author_id: resolveProfileDbId(value?.updatedBy || value?.authorId || '', profilesIndex) || fallbackAuthorId,
      title: String(value?.title || 'Raporti për prindin').slice(0, 160),
      content: JSON.stringify({ childId, value }),
      created_at: String(value?.generatedAt || value?.updatedAt || new Date().toISOString()),
      updated_at: String(value?.updatedAt || value?.generatedAt || new Date().toISOString())
    }));
    if (!rows.length) return true;
    let { error } = await supabase.from('reports').upsert(rows, { onConflict: 'id' });
    if (error && isMissingColumnError(error, 'updated_at')) {
      const fallbackRows = rows.map(({ updated_at, ...row }) => row);
      ({ error } = await supabase.from('reports').upsert(fallbackRows, { onConflict: 'id' }));
    }
    if (error) {
      console.warn('Supabase reports write skipped:', error.message);
      return false;
    }
    return true;
  } catch (error) {
    console.warn('Supabase reports write failed:', error.message);
    return false;
  }
}

async function readLegacyTeachingStateFromSupabase() {
  if (!supabase) {
    return { teachingMaterials: [], scheduleByStudent: {}, planAnalysesByStudent: {} };
  }
  try {
    const { data, error } = await supabase
      .from('teaching_materials')
      .select('id, child_id, author_id, module_type, title, data, created_at')
      .order('created_at', { ascending: true });
    if (error) {
      console.warn('Supabase legacy teaching-state read skipped:', error.message);
      return { teachingMaterials: [], scheduleByStudent: {}, planAnalysesByStudent: {} };
    }
    const state = { teachingMaterials: [], scheduleByStudent: {}, planAnalysesByStudent: {} };
    (Array.isArray(data) ? data : []).forEach((row) => {
      const payload = row.data && typeof row.data === 'object' && !Array.isArray(row.data)
        ? row.data
        : parseJsonText(row.data, {});
      if (row.module_type === 'schedule_state') {
        const childId = String(payload.childId || '');
        if (childId) state.scheduleByStudent[childId] = payload.schedule || [];
      } else if (row.module_type === 'plan_analysis') {
        const childId = String(payload.childId || '');
        if (childId) state.planAnalysesByStudent[childId] = payload.analysis || payload;
      }
    });
    return state;
  } catch (error) {
    console.warn('Supabase legacy teaching-state read failed:', error.message);
    return { teachingMaterials: [], scheduleByStudent: {}, planAnalysesByStudent: {} };
  }
}

async function readStudentSchedulesFromSupabase() {
  if (!supabase) return {};
  try {
    const { data, error } = await supabase
      .from('student_schedules')
      .select('id, child_id, title, schedule_data, updated_at')
      .order('updated_at', { ascending: true });
    if (error) {
      console.warn('Supabase student schedules read skipped:', error.message);
      return {};
    }
    return (Array.isArray(data) ? data : []).reduce((accumulator, row) => {
      const payload = row.schedule_data && typeof row.schedule_data === 'object' && !Array.isArray(row.schedule_data)
        ? row.schedule_data
        : parseJsonText(row.schedule_data, {});
      const childId = String(payload.childId || '');
      if (childId) accumulator[childId] = payload.schedule || [];
      return accumulator;
    }, {});
  } catch (error) {
    console.warn('Supabase student schedules read failed:', error.message);
    return {};
  }
}

async function writeStudentSchedulesToSupabase(scheduleByStudent = {}) {
  if (!supabase) return false;
  try {
    await deleteAllRows('student_schedules');
    const rows = Object.entries(scheduleByStudent || {}).map(([childId, schedule]) => ({
      id: stableUuid('student-schedule', childId),
      child_id: stableUuid('child', childId),
      title: `Orari i ${childId}`,
      schedule_data: { childId, schedule },
      updated_at: new Date().toISOString()
    }));
    if (!rows.length) return true;
    const { error } = await supabase.from('student_schedules').upsert(rows, { onConflict: 'id' });
    if (error) {
      console.warn('Supabase student schedules write skipped:', error.message);
      return false;
    }
    return true;
  } catch (error) {
    console.warn('Supabase student schedules write failed:', error.message);
    return false;
  }
}

async function readPlanAnalysesFromSupabase() {
  if (!supabase) return {};
  try {
    const { data, error } = await supabase
      .from('plan_analyses')
      .select('id, child_id, file_name, analysis_data, analyzed_at')
      .order('analyzed_at', { ascending: true });
    if (error) {
      console.warn('Supabase plan analyses read skipped:', error.message);
      return {};
    }
    return (Array.isArray(data) ? data : []).reduce((accumulator, row) => {
      const payload = row.analysis_data && typeof row.analysis_data === 'object' && !Array.isArray(row.analysis_data)
        ? row.analysis_data
        : parseJsonText(row.analysis_data, {});
      const childId = String(payload.childId || payload.studentId || '');
      if (childId) accumulator[childId] = payload.analysis || payload;
      return accumulator;
    }, {});
  } catch (error) {
    console.warn('Supabase plan analyses read failed:', error.message);
    return {};
  }
}

async function writePlanAnalysesToSupabase(planAnalysesByStudent = {}) {
  if (!supabase) return false;
  try {
    await deleteAllRows('plan_analyses');
    const rows = Object.entries(planAnalysesByStudent || {}).map(([childId, analysis]) => ({
      id: stableUuid('plan-analysis', childId),
      child_id: stableUuid('child', childId),
      file_name: String(analysis?.fileName || `Analiza ${childId}`),
      analysis_data: { childId, analysis },
      analyzed_at: String(analysis?.analyzedAt || new Date().toISOString())
    }));
    if (!rows.length) return true;
    const { error } = await supabase.from('plan_analyses').upsert(rows, { onConflict: 'id' });
    if (error) {
      console.warn('Supabase plan analyses write skipped:', error.message);
      return false;
    }
    return true;
  } catch (error) {
    console.warn('Supabase plan analyses write failed:', error.message);
    return false;
  }
}

async function readAppStateFromStructuredTables() {
  const [students, progressByStudent, reportsByStudent, scheduleByStudent, planAnalysesByStudent, legacyTeachingState] = await Promise.all([
    readChildrenFromSupabase(),
    readProgressFromSupabase(),
    readReportsFromSupabase(),
    readStudentSchedulesFromSupabase(),
    readPlanAnalysesFromSupabase(),
    readLegacyTeachingStateFromSupabase()
  ]);
  return {
    students,
    progressByStudent,
    reportsByStudent,
    scheduleByStudent: Object.keys(scheduleByStudent).length ? scheduleByStudent : legacyTeachingState.scheduleByStudent,
    teachingMaterials: [],
    planAnalysesByStudent: Object.keys(planAnalysesByStudent).length ? planAnalysesByStudent : legacyTeachingState.planAnalysesByStudent
  };
}

async function writeAppStateToStructuredTables(incoming = {}) {
  if (Object.prototype.hasOwnProperty.call(incoming, 'students')) {
    await writeChildrenToSupabase(Array.isArray(incoming.students) ? incoming.students : []);
  }

  const dependentTasks = [];
  if (Object.prototype.hasOwnProperty.call(incoming, 'progressByStudent')) dependentTasks.push(writeProgressToSupabase(incoming.progressByStudent || {}));
  if (Object.prototype.hasOwnProperty.call(incoming, 'reportsByStudent')) dependentTasks.push(writeReportsToSupabase(incoming.reportsByStudent || {}));
  if (Object.prototype.hasOwnProperty.call(incoming, 'scheduleByStudent')) dependentTasks.push(writeStudentSchedulesToSupabase(incoming.scheduleByStudent || {}));
  if (Object.prototype.hasOwnProperty.call(incoming, 'planAnalysesByStudent')) dependentTasks.push(writePlanAnalysesToSupabase(incoming.planAnalysesByStudent || {}));
  await Promise.all(dependentTasks);
}

app.get('/api/app-state', async (_req, res) => {
  res.json({ state: await readAppState() });
});

app.put('/api/app-state', async (req, res) => {
  const incoming = req.body?.state;
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
    return res.status(400).json({ error: 'Gjendja e aplikacionit nuk është e vlefshme.' });
  }
  const allowedKeys = ['students', 'progressByStudent', 'reportsByStudent', 'scheduleByStudent', 'teachingMaterials', 'planAnalysesByStudent'];
  const previous = await readAppState();
  const next = { ...previous };
  allowedKeys.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(incoming, key)) next[key] = incoming[key];
  });
  next.updatedAt = new Date().toISOString();
  await writeAppState(next);
  res.json({ saved: true, updatedAt: next.updatedAt });
});

app.get('/api/accounts', async (_req, res) => {
  const roleData = await getRoleDataStore();
  res.json({ roleData: toPublicRoleData(roleData) });
});

app.post('/api/login', async (req, res) => {
  const role = String(req.body?.role || '').trim().toLocaleLowerCase('sq-AL');
  const username = String(req.body?.username || '').trim().toLocaleLowerCase('sq-AL');
  const password = String(req.body?.password || '');
  const bucket = ROLE_TYPE_TO_BUCKET[role];
  if (!bucket || !username || !password) {
    return res.status(400).json({ error: 'Roli, username dhe fjalëkalimi janë të detyrueshme.' });
  }
  const roleData = await getRoleDataStore();
  const user = (roleData[bucket] || []).find((account) => account.username === username);
  if (!user || !verifyAccountPassword(password, user.passwordHash)) {
    return res.status(401).json({ error: 'Username ose fjalëkalimi nuk është i saktë.' });
  }
  const { passwordHash, ...publicUser } = user;
  res.json({ user: publicUser, roleData: toPublicRoleData(roleData) });
});

app.post('/api/accounts', async (req, res) => {
  const accountType = String(req.body?.accountType || '').trim();
  const bucket = ['teachers', 'parents', 'admins'].includes(accountType) ? accountType : '';
  const role = roleFromBucket(bucket);
  const name = String(req.body?.name || '').trim();
  const username = String(req.body?.username || '').trim().toLocaleLowerCase('sq-AL');
  const email = String(req.body?.email || '').trim();
  const password = String(req.body?.password || '');
  if (!bucket || !role || !name || !username || !email || password.length < 6) {
    return res.status(400).json({ error: 'Të gjitha fushat e llogarisë janë të detyrueshme.' });
  }
  const roleData = await getRoleDataStore();
  const usernameExists = Object.values(roleData).flat().some((account) => account.username === username);
  if (usernameExists) {
    return res.status(409).json({ error: 'Ky username ekziston tashmë.' });
  }
  roleData[bucket].push(normalizeStoredAccount({
    id: publicAccountIdForRoleUsername(role, username),
    name,
    username,
    email,
    passwordHash: hashAccountPassword(password),
    createdAt: new Date().toISOString()
  }, bucket, roleData[bucket].length));
  const saved = await saveRoleDataStore(roleData);
  res.json({ roleData: toPublicRoleData(saved) });
});

app.delete('/api/accounts/:accountType/:accountId', async (req, res) => {
  const accountType = String(req.params.accountType || '').trim();
  const accountId = String(req.params.accountId || '').trim();
  if (!['teachers', 'parents', 'admins'].includes(accountType) || !accountId) {
    return res.status(400).json({ error: 'Llogaria nuk është e vlefshme.' });
  }
  const roleData = await getRoleDataStore();
  roleData[accountType] = (roleData[accountType] || []).filter((account) => account.id !== accountId);
  const saved = await saveRoleDataStore(roleData);
  res.json({ roleData: toPublicRoleData(saved) });
});

app.get('/api/calendar-events', async (req, res) => {
  const teacherId = String(req.query.teacherId || '').trim();
  if (!teacherId) return res.status(400).json({ error: 'Mungon identifikuesi i mësueses.' });
  const events = (await readCalendarEvents())
    .filter((event) => event.teacherId === teacherId)
    .sort((a, b) => `${a.date} ${a.time || ''}`.localeCompare(`${b.date} ${b.time || ''}`));
  res.json({ events });
});

app.post('/api/calendar-events', async (req, res) => {
  const teacherId = String(req.body?.teacherId || '').trim();
  const date = String(req.body?.date || '').trim();
  const title = String(req.body?.title || '').trim();
  if (!teacherId || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !title) {
    return res.status(400).json({ error: 'Mësuesja, data dhe titulli janë të detyrueshme.' });
  }
  const events = await readCalendarEvents();
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
  await writeCalendarEvents(events);
  res.json({ event: calendarEvent });
});

app.post('/api/calendar-events/sync-birthday', async (req, res) => {
  const studentId = String(req.body?.studentId || '').trim();
  const teacherId = String(req.body?.teacherId || '').trim();
  const studentName = String(req.body?.studentName || '').trim();
  const birthday = String(req.body?.birthday || '').trim();
  if (!studentId) return res.status(400).json({ error: 'Mungon identifikuesi i nxënësit.' });
  const sourceKey = `birthday:${studentId}`;
  const events = (await readCalendarEvents()).filter((event) => event.sourceKey !== sourceKey);
  const match = birthday.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!teacherId || !studentName || !match) {
    await writeCalendarEvents(events);
    return res.json({ event: null });
  }
  const [, day, month] = match;
  const now = new Date();
  let year = now.getFullYear();
  if (`${year}-${month}-${day}` < now.toISOString().slice(0, 10)) year += 1;
  const birthdayEventId = stableUuid('calendar-birthday', `${teacherId}:${studentId}:${month}-${day}`);
  const birthdayEvent = {
    id: birthdayEventId,
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
  await writeCalendarEvents(events);
  res.json({ event: birthdayEvent });
});

app.delete('/api/calendar-events/:id', async (req, res) => {
  const teacherId = String(req.query.teacherId || '').trim();
  const events = await readCalendarEvents();
  const nextEvents = events.filter((event) => !(event.id === req.params.id && event.teacherId === teacherId));
  if (nextEvents.length === events.length) return res.status(404).json({ error: 'Ngjarja nuk u gjet.' });
  await writeCalendarEvents(nextEvents);
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
  const openaiConfigured = Boolean(process.env.OPENAI_API_KEY);
  if (!openrouter && !gemini && !openaiConfigured) return res.status(503).json({ error: 'Shërbimi AI nuk është konfiguruar në server.' });

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
    let stream;
    let provider = '';
    if (openrouter) {
      try {
        stream = await openrouter.chat.completions.create({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'system', content: systemInstruction },
            ...contents.map((item) => ({ role: item.role === 'model' ? 'assistant' : 'user', content: item.parts[0].text }))
          ],
          max_tokens: 800,
          stream: true
        });
        provider = 'openrouter';
      } catch (openrouterError) {
        console.warn('Atlas OpenRouter unavailable; trying Gemini fallback.', {
          message: openrouterError.message,
          status: openrouterError.status,
          code: openrouterError.code
        });
      }
    }
    if (!stream && gemini) {
      try {
        stream = await gemini.models.generateContentStream({
          model: GEMINI_MODEL,
          contents,
          config: { systemInstruction }
        });
        provider = 'gemini';
      } catch (geminiError) {
        console.warn('Atlas Gemini unavailable; trying OpenAI fallback.', {
          message: geminiError.message,
          status: geminiError.status,
          code: geminiError.code
        });
      }
    }
    if (!stream && openaiConfigured) {
      stream = await openai.chat.completions.create({
        model: FROZEN_TEXT_MODEL,
        messages: [
          { role: 'system', content: systemInstruction },
          ...contents.map((item) => ({ role: item.role === 'model' ? 'assistant' : 'user', content: item.parts[0].text }))
        ],
        max_tokens: 800,
        stream: true
      });
      provider = 'openai';
    }
    if (!stream) throw new Error('Asnjë ofrues AI nuk ishte i disponueshëm.');
    let responseText = '';
    for await (const chunk of stream) {
      if (finished) break;
      const text = provider === 'gemini' ? chunk.text : chunk.choices?.[0]?.delta?.content;
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
    console.error('Atlas chat error:', {
      message: error.message,
      status: error.status,
      code: error.code,
      cause: error.cause?.message
    });
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
      { fjala: 'laj', kuptimi_ne_anglisht: 'wash', pershkrimi_vizual_anglisht: 'a child washing both hands with soap and water' },
      { fjala: 'shkoj', kuptimi_ne_anglisht: 'go', pershkrimi_vizual_anglisht: 'a child going toward the bathroom sink' },
      { fjala: 'hap', kuptimi_ne_anglisht: 'open', pershkrimi_vizual_anglisht: 'a hand turning on a water faucet' },
      { fjala: 'lag', kuptimi_ne_anglisht: 'wet', pershkrimi_vizual_anglisht: 'two hands getting wet under running water' },
      { fjala: 'marr', kuptimi_ne_anglisht: 'take', pershkrimi_vizual_anglisht: 'a child taking soap before washing hands' },
      { fjala: 'vendos', kuptimi_ne_anglisht: 'put', pershkrimi_vizual_anglisht: 'putting soap onto a palm' },
      { fjala: 'fërkoj', kuptimi_ne_anglisht: 'rub', pershkrimi_vizual_anglisht: 'rubbing soapy hands together' },
      { fjala: 'shpëlaj', kuptimi_ne_anglisht: 'rinse', pershkrimi_vizual_anglisht: 'rinsing hands under clean running water' },
      { fjala: 'mbyll', kuptimi_ne_anglisht: 'close', pershkrimi_vizual_anglisht: 'a hand turning off a water faucet' },
      { fjala: 'thaj', kuptimi_ne_anglisht: 'dry', pershkrimi_vizual_anglisht: 'drying both hands with a clean towel' },
      { fjala: 'përfundoj', kuptimi_ne_anglisht: 'finish', pershkrimi_vizual_anglisht: 'a child showing clean dry hands after washing' }
    ]);
    ensureWords(/objekt/, 'Objektet', [
      { fjala: 'duart', kuptimi_ne_anglisht: 'the hands', pershkrimi_vizual_anglisht: 'two clean child hands' },
      { fjala: 'sapuni', kuptimi_ne_anglisht: 'the soap', pershkrimi_vizual_anglisht: 'a simple soap dispenser beside a sink' },
      { fjala: 'uji', kuptimi_ne_anglisht: 'the water', pershkrimi_vizual_anglisht: 'clean water flowing from a faucet' },
      { fjala: 'rubineti', kuptimi_ne_anglisht: 'the faucet', pershkrimi_vizual_anglisht: 'a bathroom water faucet' },
      { fjala: 'lavamani', kuptimi_ne_anglisht: 'the sink', pershkrimi_vizual_anglisht: 'a simple bathroom sink' },
      { fjala: 'peshqiri', kuptimi_ne_anglisht: 'the towel', pershkrimi_vizual_anglisht: 'a clean hand towel beside a sink' },
      { fjala: 'peceta', kuptimi_ne_anglisht: 'the paper towel', pershkrimi_vizual_anglisht: 'a clean paper towel for drying hands' },
      { fjala: 'mëngët', kuptimi_ne_anglisht: 'the sleeves', pershkrimi_vizual_anglisht: 'shirt sleeves rolled above the wrists' }
    ]);
    ensureWords(/njerëz|njerez|përem|perem/, 'Njerëzit/Përemrat', [
      { fjala: 'unë', kuptimi_ne_anglisht: 'I', pershkrimi_vizual_anglisht: 'a child pointing to self' },
      { fjala: 'ti', kuptimi_ne_anglisht: 'you', pershkrimi_vizual_anglisht: 'a child pointing to another person' },
      { fjala: 'mësuesja', kuptimi_ne_anglisht: 'the teacher', pershkrimi_vizual_anglisht: 'a friendly female teacher' },
      { fjala: 'prindi', kuptimi_ne_anglisht: 'the parent', pershkrimi_vizual_anglisht: 'a supportive parent beside a child' },
      { fjala: 'shoku', kuptimi_ne_anglisht: 'the friend', pershkrimi_vizual_anglisht: 'a child friend waiting near the sink' }
    ]);
    ensureWords(/lidh|parafjal/, 'Fjalë Lidhëse/Parafjalë', [
      { fjala: 'në', kuptimi_ne_anglisht: 'in', pershkrimi_vizual_anglisht: 'an object inside a place' },
      { fjala: 'te', kuptimi_ne_anglisht: 'at', pershkrimi_vizual_anglisht: 'a child arriving at a sink' },
      { fjala: 'me', kuptimi_ne_anglisht: 'with', pershkrimi_vizual_anglisht: 'two things used together' },
      { fjala: 'nga', kuptimi_ne_anglisht: 'from', pershkrimi_vizual_anglisht: 'an arrow moving from one place to another' },
      { fjala: 'dhe', kuptimi_ne_anglisht: 'and', pershkrimi_vizual_anglisht: 'two actions joined together' },
      { fjala: 'e', kuptimi_ne_anglisht: 'it', pershkrimi_vizual_anglisht: 'one object connected to the next action' },
      { fjala: 'pastaj', kuptimi_ne_anglisht: 'then', pershkrimi_vizual_anglisht: 'two actions in sequence with an arrow' },
      { fjala: 'për', kuptimi_ne_anglisht: 'for', pershkrimi_vizual_anglisht: 'an object intended for a purpose' }
    ]);
    ensureWords(/ndajfol/, 'Ndajfoljet', [
      { fjala: 'tani', kuptimi_ne_anglisht: 'now', pershkrimi_vizual_anglisht: 'a clock indicating now' },
      { fjala: 'ngadalë', kuptimi_ne_anglisht: 'slowly', pershkrimi_vizual_anglisht: 'a turtle moving slowly' },
      { fjala: 'mirë', kuptimi_ne_anglisht: 'well', pershkrimi_vizual_anglisht: 'clean hands with a positive check mark' },
      { fjala: 'përsëri', kuptimi_ne_anglisht: 'again', pershkrimi_vizual_anglisht: 'a simple repeat arrow' }
    ]);

    const keepOnly = (categoryMatch, allowedWords) => {
      const category = categories.find((item) => categoryMatch.test(String(item?.emri_kategorise || '').toLocaleLowerCase('sq-AL')));
      if (!Array.isArray(category?.opsionet)) return;
      const allowed = new Set(allowedWords);
      category.opsionet = category.opsionet.filter((item) => allowed.has(String(item?.fjala || '').toLocaleLowerCase('sq-AL')));
    };
    keepOnly(/veprim/, ['laj', 'shkoj', 'hap', 'lag', 'marr', 'vendos', 'fërkoj', 'shpëlaj', 'mbyll', 'thaj', 'përfundoj']);
    keepOnly(/objekt/, ['duart', 'sapuni', 'uji', 'rubineti', 'lavamani', 'peshqiri', 'peceta', 'mëngët']);
    keepOnly(/njerëz|njerez|përem|perem/, ['unë', 'ti']);
    keepOnly(/lidh|parafjal/, ['në', 'te', 'me', 'nga', 'dhe', 'e', 'pastaj', 'për']);
    keepOnly(/ndajfol/, ['tani', 'ngadalë', 'mirë', 'përsëri']);
  }
  if (/(dhëmb|dhemb|furç|furc)/.test(normalizedGoal)) {
    ensureWords(/veprim/, 'Veprimet', [
      { fjala: 'shkoj', kuptimi_ne_anglisht: 'go', pershkrimi_vizual_anglisht: 'a child going to the bathroom' },
      { fjala: 'marr', kuptimi_ne_anglisht: 'take', pershkrimi_vizual_anglisht: 'a child taking a toothbrush from a bathroom cabinet' },
      { fjala: 'vendos', kuptimi_ne_anglisht: 'put', pershkrimi_vizual_anglisht: 'putting toothpaste onto a toothbrush' },
      { fjala: 'fërkoj', kuptimi_ne_anglisht: 'brush', pershkrimi_vizual_anglisht: 'a child brushing teeth with a toothbrush' },
      { fjala: 'shpëlaj', kuptimi_ne_anglisht: 'rinse', pershkrimi_vizual_anglisht: 'a child rinsing the mouth with water' },
      { fjala: 'hap', kuptimi_ne_anglisht: 'open', pershkrimi_vizual_anglisht: 'a hand opening a bathroom faucet or cabinet' },
      { fjala: 'mbyll', kuptimi_ne_anglisht: 'close', pershkrimi_vizual_anglisht: 'a hand closing a bathroom faucet' },
      { fjala: 'laj', kuptimi_ne_anglisht: 'wash', pershkrimi_vizual_anglisht: 'a child washing teeth or mouth with water' },
      { fjala: 'lë', kuptimi_ne_anglisht: 'leave', pershkrimi_vizual_anglisht: 'putting the toothbrush back in its place' }
    ]);
    ensureWords(/objekt/, 'Objektet', [
      { fjala: 'dhëmbët', kuptimi_ne_anglisht: 'the teeth', pershkrimi_vizual_anglisht: 'a clean child-friendly mouth showing teeth' },
      { fjala: 'furçën', kuptimi_ne_anglisht: 'the toothbrush', pershkrimi_vizual_anglisht: 'one child toothbrush, dental hygiene item' },
      { fjala: 'pastën', kuptimi_ne_anglisht: 'toothpaste', pershkrimi_vizual_anglisht: 'a tube of toothpaste beside a toothbrush, no food or noodles' },
      { fjala: 'rubinetin', kuptimi_ne_anglisht: 'the faucet', pershkrimi_vizual_anglisht: 'a bathroom water faucet' },
      { fjala: 'gojën', kuptimi_ne_anglisht: 'the mouth', pershkrimi_vizual_anglisht: 'a child-friendly mouth rinsing with water' },
      { fjala: 'dollapin', kuptimi_ne_anglisht: 'the cabinet', pershkrimi_vizual_anglisht: 'a small bathroom cabinet holding a toothbrush' },
      { fjala: 'ujin', kuptimi_ne_anglisht: 'water', pershkrimi_vizual_anglisht: 'clean water in a rinsing cup' },
      { fjala: 'banjën', kuptimi_ne_anglisht: 'bathroom', pershkrimi_vizual_anglisht: 'a simple bathroom for brushing teeth' }
    ]);
    ensureWords(/njerëz|njerez|përem|perem/, 'Përemrat', [
      { fjala: 'unë', kuptimi_ne_anglisht: 'I', pershkrimi_vizual_anglisht: 'a child pointing to self' },
      { fjala: 'ti', kuptimi_ne_anglisht: 'you', pershkrimi_vizual_anglisht: 'a child pointing to another person' }
    ]);
    ensureWords(/lidh|parafjal/, 'Fjalë Lidhëse/Parafjalë', [
      { fjala: 'në', kuptimi_ne_anglisht: 'in', pershkrimi_vizual_anglisht: 'an object inside a place' },
      { fjala: 'me', kuptimi_ne_anglisht: 'with', pershkrimi_vizual_anglisht: 'a toothbrush used with toothpaste' },
      { fjala: 'nga', kuptimi_ne_anglisht: 'from', pershkrimi_vizual_anglisht: 'an arrow moving from a cabinet' },
      { fjala: 'dhe', kuptimi_ne_anglisht: 'and', pershkrimi_vizual_anglisht: 'two actions joined together' },
      { fjala: 'e', kuptimi_ne_anglisht: 'it', pershkrimi_vizual_anglisht: 'one object connected to the next action' },
      { fjala: 'pastaj', kuptimi_ne_anglisht: 'then', pershkrimi_vizual_anglisht: 'two actions in sequence with an arrow' },
      { fjala: 'te', kuptimi_ne_anglisht: 'at', pershkrimi_vizual_anglisht: 'a child arriving at a sink' },
      { fjala: 'mbi', kuptimi_ne_anglisht: 'on', pershkrimi_vizual_anglisht: 'toothpaste placed on a toothbrush' }
    ]);
    ensureWords(/ndajfol/, 'Ndajfoljet', [
      { fjala: 'tani', kuptimi_ne_anglisht: 'now', pershkrimi_vizual_anglisht: 'a clock indicating now' },
      { fjala: 'ngadalë', kuptimi_ne_anglisht: 'slowly', pershkrimi_vizual_anglisht: 'a turtle moving slowly' },
      { fjala: 'mirë', kuptimi_ne_anglisht: 'well', pershkrimi_vizual_anglisht: 'clean teeth with a check mark' },
      { fjala: 'përsëri', kuptimi_ne_anglisht: 'again', pershkrimi_vizual_anglisht: 'a simple repeat arrow' }
    ]);
  }
  if (/(top|futboll|basketboll|loj.+top|luaj.+top|ball)/.test(normalizedGoal)) {
    ensureWords(/veprim/, 'Veprimet', [
      { fjala: 'luaj', kuptimi_ne_anglisht: 'play', pershkrimi_vizual_anglisht: 'a child playing with a ball' },
      { fjala: 'marr', kuptimi_ne_anglisht: 'take', pershkrimi_vizual_anglisht: 'a child taking a ball with both hands' },
      { fjala: 'mbaj', kuptimi_ne_anglisht: 'hold', pershkrimi_vizual_anglisht: 'a child holding a ball' },
      { fjala: 'pasoj', kuptimi_ne_anglisht: 'pass', pershkrimi_vizual_anglisht: 'a child passing a ball to another child' },
      { fjala: 'gjuaj', kuptimi_ne_anglisht: 'kick or shoot', pershkrimi_vizual_anglisht: 'a child kicking or shooting a ball toward a goal' },
      { fjala: 'kap', kuptimi_ne_anglisht: 'catch', pershkrimi_vizual_anglisht: 'a child catching a ball' },
      { fjala: 'dribloj', kuptimi_ne_anglisht: 'dribble', pershkrimi_vizual_anglisht: 'a child controlling a ball while moving' },
      { fjala: 'mbroj', kuptimi_ne_anglisht: 'defend', pershkrimi_vizual_anglisht: 'a child defending the ball or blocking another player' },
      { fjala: 'vrapoj', kuptimi_ne_anglisht: 'run', pershkrimi_vizual_anglisht: 'a child running after a ball' }
    ]);
    ensureWords(/objekt/, 'Objektet', [
      { fjala: 'topin', kuptimi_ne_anglisht: 'the ball', pershkrimi_vizual_anglisht: 'one simple play ball' },
      { fjala: 'fushën', kuptimi_ne_anglisht: 'the field', pershkrimi_vizual_anglisht: 'a simple sports field' },
      { fjala: 'portën', kuptimi_ne_anglisht: 'the goal', pershkrimi_vizual_anglisht: 'a child-friendly football goal' },
      { fjala: 'golin', kuptimi_ne_anglisht: 'the scored goal', pershkrimi_vizual_anglisht: 'scoring a goal in a sports game' },
      { fjala: 'shokun', kuptimi_ne_anglisht: 'the teammate', pershkrimi_vizual_anglisht: 'a teammate waiting for the ball' },
      { fjala: 'skuadrën', kuptimi_ne_anglisht: 'the team', pershkrimi_vizual_anglisht: 'a small children sports team' },
      { fjala: 'rrjetën', kuptimi_ne_anglisht: 'the net', pershkrimi_vizual_anglisht: 'a goal net behind a football goal' },
      { fjala: 'këmbën', kuptimi_ne_anglisht: 'the foot or leg', pershkrimi_vizual_anglisht: 'a child foot next to a ball' }
    ]);
    ensureWords(/njerëz|njerez|përem|perem/, 'Përemrat', [
      { fjala: 'unë', kuptimi_ne_anglisht: 'I', pershkrimi_vizual_anglisht: 'a child pointing to self' },
      { fjala: 'ti', kuptimi_ne_anglisht: 'you', pershkrimi_vizual_anglisht: 'a child pointing to another person' }
    ]);
    ensureWords(/lidh|parafjal/, 'Fjalë Lidhëse/Parafjalë', [
      { fjala: 'në', kuptimi_ne_anglisht: 'in', pershkrimi_vizual_anglisht: 'a ball in the field' },
      { fjala: 'me', kuptimi_ne_anglisht: 'with', pershkrimi_vizual_anglisht: 'a child with a ball' },
      { fjala: 'nga', kuptimi_ne_anglisht: 'from', pershkrimi_vizual_anglisht: 'an arrow moving from one player to another' },
      { fjala: 'te', kuptimi_ne_anglisht: 'to or at', pershkrimi_vizual_anglisht: 'a ball moving to a teammate' },
      { fjala: 'drejt', kuptimi_ne_anglisht: 'toward', pershkrimi_vizual_anglisht: 'an arrow moving toward the goal' },
      { fjala: 'dhe', kuptimi_ne_anglisht: 'and', pershkrimi_vizual_anglisht: 'two actions joined together' },
      { fjala: 'e', kuptimi_ne_anglisht: 'it', pershkrimi_vizual_anglisht: 'the ball linked to the next action' },
      { fjala: 'pastaj', kuptimi_ne_anglisht: 'then', pershkrimi_vizual_anglisht: 'two actions in sequence with an arrow' }
    ]);
    ensureWords(/ndajfol/, 'Ndajfoljet', [
      { fjala: 'shpejt', kuptimi_ne_anglisht: 'quickly', pershkrimi_vizual_anglisht: 'speed lines showing fast movement' },
      { fjala: 'ngadalë', kuptimi_ne_anglisht: 'slowly', pershkrimi_vizual_anglisht: 'a slow gentle ball movement' },
      { fjala: 'mirë', kuptimi_ne_anglisht: 'well', pershkrimi_vizual_anglisht: 'a correct pass with a check mark' },
      { fjala: 'bashkë', kuptimi_ne_anglisht: 'together', pershkrimi_vizual_anglisht: 'two children playing together' }
    ]);
  }
  if (/(ha|ngr|ushq|dark|drek|mengjes|mëngjes|eat|eating|food)/.test(normalizedGoal)) {
    ensureWords(/veprim/, 'Veprimet', [
      { fjala: 'ulem', kuptimi_ne_anglisht: 'sit', pershkrimi_vizual_anglisht: 'a child sitting at a table ready to eat' },
      { fjala: 'marr', kuptimi_ne_anglisht: 'take', pershkrimi_vizual_anglisht: 'a child taking a spoon or food' },
      { fjala: 'ha', kuptimi_ne_anglisht: 'eat', pershkrimi_vizual_anglisht: 'a child eating food' },
      { fjala: 'përtypem', kuptimi_ne_anglisht: 'chew', pershkrimi_vizual_anglisht: 'a child chewing food calmly' },
      { fjala: 'pi', kuptimi_ne_anglisht: 'drink', pershkrimi_vizual_anglisht: 'a child drinking water from a cup' },
      { fjala: 'mbaj', kuptimi_ne_anglisht: 'hold', pershkrimi_vizual_anglisht: 'a child holding a spoon or cup' },
      { fjala: 'vendos', kuptimi_ne_anglisht: 'put', pershkrimi_vizual_anglisht: 'putting food on a spoon' },
      { fjala: 'gëlltit', kuptimi_ne_anglisht: 'swallow', pershkrimi_vizual_anglisht: 'a child swallowing food safely' },
      { fjala: 'fshij', kuptimi_ne_anglisht: 'wipe', pershkrimi_vizual_anglisht: 'wiping the mouth with a napkin' }
    ]);
    ensureWords(/objekt/, 'Objektet', [
      { fjala: 'ushqimin', kuptimi_ne_anglisht: 'the food', pershkrimi_vizual_anglisht: 'a simple plate of food' },
      { fjala: 'ujin', kuptimi_ne_anglisht: 'the water', pershkrimi_vizual_anglisht: 'a cup of clean drinking water' },
      { fjala: 'pjatën', kuptimi_ne_anglisht: 'the plate', pershkrimi_vizual_anglisht: 'a child-friendly plate with food' },
      { fjala: 'lugën', kuptimi_ne_anglisht: 'the spoon', pershkrimi_vizual_anglisht: 'a simple spoon for eating' },
      { fjala: 'pirunin', kuptimi_ne_anglisht: 'the fork', pershkrimi_vizual_anglisht: 'a simple eating fork' },
      { fjala: 'gotën', kuptimi_ne_anglisht: 'the cup', pershkrimi_vizual_anglisht: 'a simple cup for water' },
      { fjala: 'tavolinën', kuptimi_ne_anglisht: 'the table', pershkrimi_vizual_anglisht: 'a table ready for a meal' },
      { fjala: 'pecetën', kuptimi_ne_anglisht: 'the napkin', pershkrimi_vizual_anglisht: 'a clean napkin beside a plate' }
    ]);
    ensureWords(/njerëz|njerez|përem|perem/, 'Përemrat', [
      { fjala: 'unë', kuptimi_ne_anglisht: 'I', pershkrimi_vizual_anglisht: 'a child pointing to self' },
      { fjala: 'ti', kuptimi_ne_anglisht: 'you', pershkrimi_vizual_anglisht: 'a child pointing to another person' }
    ]);
    ensureWords(/lidh|parafjal/, 'Fjalë Lidhëse/Parafjalë', [
      { fjala: 'në', kuptimi_ne_anglisht: 'in', pershkrimi_vizual_anglisht: 'food in a plate' },
      { fjala: 'te', kuptimi_ne_anglisht: 'at', pershkrimi_vizual_anglisht: 'a child sitting at the table' },
      { fjala: 'me', kuptimi_ne_anglisht: 'with', pershkrimi_vizual_anglisht: 'food eaten with a spoon' },
      { fjala: 'nga', kuptimi_ne_anglisht: 'from', pershkrimi_vizual_anglisht: 'taking water from a cup' },
      { fjala: 'dhe', kuptimi_ne_anglisht: 'and', pershkrimi_vizual_anglisht: 'two meal actions joined together' },
      { fjala: 'e', kuptimi_ne_anglisht: 'it', pershkrimi_vizual_anglisht: 'one object linked to the next action' },
      { fjala: 'pastaj', kuptimi_ne_anglisht: 'then', pershkrimi_vizual_anglisht: 'two eating steps in sequence with an arrow' },
      { fjala: 'mbi', kuptimi_ne_anglisht: 'on', pershkrimi_vizual_anglisht: 'food on a spoon' }
    ]);
    ensureWords(/ndajfol/, 'Ndajfoljet', [
      { fjala: 'ngadalë', kuptimi_ne_anglisht: 'slowly', pershkrimi_vizual_anglisht: 'a calm slow eating motion' },
      { fjala: 'mirë', kuptimi_ne_anglisht: 'well', pershkrimi_vizual_anglisht: 'a correct eating action with a check mark' },
      { fjala: 'tani', kuptimi_ne_anglisht: 'now', pershkrimi_vizual_anglisht: 'a clock indicating now' },
      { fjala: 'bashkë', kuptimi_ne_anglisht: 'together', pershkrimi_vizual_anglisht: 'two people eating together' }
    ]);
  }
  if (/(plazh|det|rërë|rere|not|bregdet)/.test(normalizedGoal) && /(lahem|lahet|laj|lar)/.test(normalizedGoal)) {
    ensureWords(/veprim/, 'Veprimet', [
      { fjala: 'shkoj', kuptimi_ne_anglisht: 'go', pershkrimi_vizual_anglisht: 'a child going to the beach' },
      { fjala: 'ulem', kuptimi_ne_anglisht: 'sit', pershkrimi_vizual_anglisht: 'a child sitting calmly on the beach' },
      { fjala: 'lahem', kuptimi_ne_anglisht: 'bathe or wash myself', pershkrimi_vizual_anglisht: 'a child washing or bathing at the beach with water' },
      { fjala: 'luaj', kuptimi_ne_anglisht: 'play', pershkrimi_vizual_anglisht: 'a child playing on the beach' },
      { fjala: 'mbush', kuptimi_ne_anglisht: 'fill', pershkrimi_vizual_anglisht: 'a child filling a bucket with sand' },
      { fjala: 'ndërtoj', kuptimi_ne_anglisht: 'build', pershkrimi_vizual_anglisht: 'a child building a sandcastle' },
      { fjala: 'lyej', kuptimi_ne_anglisht: 'apply', pershkrimi_vizual_anglisht: 'applying sunscreen on the skin' },
      { fjala: 'mbaj', kuptimi_ne_anglisht: 'hold', pershkrimi_vizual_anglisht: 'a child holding a ball or beach toy' },
      { fjala: 'fshihem', kuptimi_ne_anglisht: 'dry myself', pershkrimi_vizual_anglisht: 'a child drying with a towel after water play' }
    ]);
    ensureWords(/objekt/, 'Objektet', [
      { fjala: 'plazhin', kuptimi_ne_anglisht: 'the beach', pershkrimi_vizual_anglisht: 'a simple child-friendly beach' },
      { fjala: 'detin', kuptimi_ne_anglisht: 'the sea', pershkrimi_vizual_anglisht: 'the sea near a beach' },
      { fjala: 'rërën', kuptimi_ne_anglisht: 'the sand', pershkrimi_vizual_anglisht: 'clean beach sand' },
      { fjala: 'topin', kuptimi_ne_anglisht: 'the ball', pershkrimi_vizual_anglisht: 'a simple beach ball' },
      { fjala: 'kremin', kuptimi_ne_anglisht: 'the sunscreen', pershkrimi_vizual_anglisht: 'a sunscreen bottle for children at the beach' },
      { fjala: 'peshqirin', kuptimi_ne_anglisht: 'the towel', pershkrimi_vizual_anglisht: 'a beach towel' },
      { fjala: 'lodrën', kuptimi_ne_anglisht: 'the toy', pershkrimi_vizual_anglisht: 'a simple sand toy for the beach' },
      { fjala: 'kovën', kuptimi_ne_anglisht: 'the bucket', pershkrimi_vizual_anglisht: 'a beach bucket for sand' }
    ]);
    ensureWords(/njerëz|njerez|përem|perem/, 'Përemrat', [
      { fjala: 'unë', kuptimi_ne_anglisht: 'I', pershkrimi_vizual_anglisht: 'a child pointing to self' },
      { fjala: 'ti', kuptimi_ne_anglisht: 'you', pershkrimi_vizual_anglisht: 'a child pointing to another person' }
    ]);
    ensureWords(/lidh|parafjal/, 'Fjalë Lidhëse/Parafjalë', [
      { fjala: 'në', kuptimi_ne_anglisht: 'in', pershkrimi_vizual_anglisht: 'a child in the sea or in the sand' },
      { fjala: 'te', kuptimi_ne_anglisht: 'at', pershkrimi_vizual_anglisht: 'a child arriving at the beach' },
      { fjala: 'me', kuptimi_ne_anglisht: 'with', pershkrimi_vizual_anglisht: 'a child with a ball or sunscreen' },
      { fjala: 'nga', kuptimi_ne_anglisht: 'from', pershkrimi_vizual_anglisht: 'coming from the water or from the sand' },
      { fjala: 'mbi', kuptimi_ne_anglisht: 'on', pershkrimi_vizual_anglisht: 'sunscreen on the skin or sand on a toy' },
      { fjala: 'dhe', kuptimi_ne_anglisht: 'and', pershkrimi_vizual_anglisht: 'two beach actions joined together' },
      { fjala: 'e', kuptimi_ne_anglisht: 'it', pershkrimi_vizual_anglisht: 'one object linked to the next action' },
      { fjala: 'pastaj', kuptimi_ne_anglisht: 'then', pershkrimi_vizual_anglisht: 'two beach steps in sequence with an arrow' }
    ]);
    ensureWords(/ndajfol/, 'Ndajfoljet', [
      { fjala: 'ngadalë', kuptimi_ne_anglisht: 'slowly', pershkrimi_vizual_anglisht: 'a calm slow beach movement' },
      { fjala: 'mirë', kuptimi_ne_anglisht: 'well', pershkrimi_vizual_anglisht: 'a correct beach routine action with a check mark' },
      { fjala: 'tani', kuptimi_ne_anglisht: 'now', pershkrimi_vizual_anglisht: 'a clock indicating now' },
      { fjala: 'bashkë', kuptimi_ne_anglisht: 'together', pershkrimi_vizual_anglisht: 'children playing together on the beach' }
    ]);
  }
  const adverbs = categories.find((item) => /ndajfol/.test(String(item?.emri_kategorise || '').toLocaleLowerCase('sq-AL')));
  if (Array.isArray(adverbs?.opsionet)) adverbs.opsionet = adverbs.opsionet.slice(0, 4);
  const toothpasteForms = new Set(['pastë', 'paste', 'pasta', 'pastën', 'pasten']);
  categories.forEach((category) => {
    if (!Array.isArray(category?.opsionet)) return;
    category.opsionet.forEach((option) => {
      const word = String(option?.fjala || '').trim().toLocaleLowerCase('sq-AL');
      if (toothpasteForms.has(word)) {
        option.kuptimi_ne_anglisht = 'toothpaste, dental hygiene product in a tube; never food or spaghetti';
        option.pershkrimi_vizual_anglisht = 'a child-safe tube of toothpaste beside a toothbrush, dental hygiene item, no food, no spaghetti, no pasta noodles';
      }
    });
  });
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
      model: FROZEN_TEXT_MODEL,
      messages: enforceJsonMessages(safeMessages),
      response_format: { type: 'json_object' },
      temperature: FROZEN_TEMPERATURE,
      seed: FROZEN_SEED,
    });

    const parsed = parseJsonObject(completion.choices[0]?.message?.content, 'Përgjigjja e planit');
    const plan = JSON.stringify(parsed);
    const choices = completion.choices.map((choice) => ({ ...choice, message: { ...choice.message, content: plan } }));
    res.json({ success: true, plan, data: parsed, choices });
  } catch (error) {
    console.error('AI Error:', error.message);
    res.status(error.status || 500).json({ error: error.message });
  }
});

app.post('/api/generate-module-content', async (req, res) => {
  try {
    const moduleType = String(req.body?.moduleType || '');
    const topic = String(req.body?.topic || '').trim();
    const systemPrompt = FROZEN_MODULE_PROMPTS[moduleType];
    if (!systemPrompt || !topic) return res.status(400).json({ error: 'Moduli dhe tema janë të detyrueshme.' });
    const resourceType = RESOURCE_TYPE_BY_MODULE[moduleType];
    if (resourceType) {
      const cached = await getCachedResource(resourceType, topic);
      if (cached) {
        try {
          return res.json(validateFrozenModule(moduleType, cached));
        } catch (error) {
          console.warn(`Cached ${resourceType} payload ignored:`, error.message);
        }
      }
    }
    const childName = String(req.body?.childName || 'Fëmija').trim().slice(0, 80);
    const childDescription = String(req.body?.childDescription || '').trim().slice(0, 1000);
    const completion = await openai.chat.completions.create({
      model: FROZEN_TEXT_MODEL,
      temperature: FROZEN_TEMPERATURE,
      seed: FROZEN_SEED,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Tema e pandryshueshme: ${topic}\nEmri i fëmijës: ${childName}\nPërshkrimi: ${childDescription || 'nuk është dhënë'}` }
      ]
    });
    const parsed = validateFrozenModule(moduleType, parseJsonObject(completion.choices[0]?.message?.content, 'Përmbajtja e modulit'));
    const count = moduleType === 'sequences' ? parsed?.sekuencat_me_fjale?.hapat?.length
      : moduleType === 'flashcards' ? parsed?.flashcards?.length
      : moduleType === 'book' ? parsed?.social_story_libri?.faqet?.length
      : parsed?.tabela_komunikimit?.kategorite?.length;
    const expected = moduleType === 'communication' ? 5 : moduleType === 'book' ? 10 : 8;
    if (count !== expected) throw new Error(`Skema e ngrirë kërkon saktësisht ${expected} elemente.`);
    if (resourceType) await saveCachedResource(resourceType, topic, parsed, topic);
    res.json(parsed);
  } catch (error) {
    console.error('Frozen module generation error:', error.message);
    res.status(error.status || 500).json({ error: error.message });
  }
});

app.post('/api/generate-aac-board', async (req, res) => {
  try {
    const goal = typeof req.body?.goal === 'string' ? req.body.goal.trim() : '';
    if (!goal) return res.status(400).json({ error: 'Qëllimi mësimor është i detyrueshëm.' });
    const cached = await getCachedResource('communication_board', goal);
    if (cached) {
      try {
        if (!Array.isArray(cached?.tabela_komunikimit?.kategorite)) throw new Error('Tabela AAC nuk përmban kategori të vlefshme.');
        return res.json(ensureGoalCoreVocabulary(cached, goal));
      } catch (error) {
        console.warn('Cached communication_board payload ignored:', error.message);
      }
    }

    const completion = await openaiAac.chat.completions.create({
      model: FROZEN_TEXT_MODEL,
      response_format: { type: 'json_object' },
      temperature: FROZEN_TEMPERATURE,
      seed: FROZEN_SEED,
      messages: [
        {
          role: 'system',
          content: `${JSON_SYSTEM_RULE}\nTi je ekspert i AAC dhe gjuhës shqipe për fëmijë me nevoja të veçanta. Mendo fillimisht 7-8 fjali shumë të thjeshta, praktike dhe kronologjike që e kryejnë aktivitetin në rend logjik; pastaj nxirr prej tyre vetëm fjalorin që i duhet fëmijës për të ndërtuar vetë fjali për atë rutinë. Struktura është {"moduli_i_zgjedhur":"Moduli 3: Tabela e Komunikimit","tabela_komunikimit":{"kategorite":[{"emri_kategorise":"Veprimet","opsionet":[{"fjala":"...","simboli":"","kuptimi_ne_anglisht":"...","pershkrimi_vizual_anglisht":"..."}]}]}}. Kategoritë dhe sasitë: Veprimet 8-10, Objektet 7-10, Përemrat vetëm “unë” dhe “ti”, Fjalë Lidhëse/Parafjalë 6-9 dhe Ndajfoljet 3-4. Fjalori duhet të jetë i balancuar mes veprimeve kryesore, objekteve të rutinës, fjalëve të vendit/lidhjes dhe ndajfoljeve të dobishme. Çdo fjalë duhet të lidhet drejtpërdrejt me temën; mos shto njerëz, vende ose objekte të rastësishme. Mos jep fjalor të përgjithshëm si “objekt”, “gjë”, “vend”, përveçse kur tema e kërkon realisht. Duhet të përfshihen jo vetëm veprimi kryesor, por edhe vendi ku ndodh rutina, materialet që përdoren, objektet që preken, lodrat ose sendet tipike të asaj situate dhe fjalët funksionale që lejojnë fjali të thjeshta. Nëse te kërkesa ka një folje kyçe si “lahem”, “ha”, “lexoj”, “luaj”, kjo folje duhet të shfaqet patjetër në kategori si fjalë përdorimi. Përdor fjalë konkrete që mësuesi ose fëmija do t'i shtypte realisht gjatë aktivitetit. Për larjen e dhëmbëve mendo fjali si: “Unë shkoj në banjë. Pastaj unë marr furçën nga dollapi. Marr pastën dhe e vendos mbi furçën. Pastaj fërkoj dhëmbët ngadalë. Shpëlaj gojën me ujin dhe mbyll rubinetin.” Për larjen e duarve përfshi duart, sapunin, ujin, rubinetin, lavamanin, peshqirin, banjën; laj, shkoj, hap, lag, marr, vendos, fërkoj, shpëlaj, mbyll, thaj. Për situata si “të lahet në plazh” përfshi patjetër fjalë si lahem, plazhi, deti, rëra, topi, kremi i diellit, peshqiri, lodrat e rërës ose kovë, dhe veprime si luaj, lyej, mbush, ndërtoj kur janë të dobishme për atë rutinë. Përdor shqip standarde gramatikisht të saktë dhe ruaj çdo “ë” dhe “ç”. Për çdo fjalë jep kuptimin dhe një përshkrim vizual shumë të qartë në anglisht, që ilustrimi të mos ngatërrojë homonime ose kuptime të tjera.`
        },
        {
          role: 'user',
          content: `Qëllimi mësimor: ${goal}\nKrijo fjalor AAC që përdoret vetëm për këtë aktivitet dhe që lejon ndërtimin e fjalive të thjeshta.`
        }
      ]
    });

    const parsed = parseJsonObject(completion.choices[0]?.message?.content, 'Tabela AAC');
    if (!Array.isArray(parsed?.tabela_komunikimit?.kategorite)) throw new Error('Tabela AAC nuk përmban kategori të vlefshme.');
    const enriched = ensureGoalCoreVocabulary(parsed, goal);
    await saveCachedResource('communication_board', goal, enriched, goal);
    res.json(enriched);
  } catch (error) {
    console.error('AAC board error:', error.message);
    res.status(error.status || 500).json({ error: error.message });
  }
});

app.post('/api/text-to-speech', async (req, res) => {
  try {
    const text = sanitizeTtsText(req.body?.text);
    if (!text) return res.status(400).json({ error: 'Teksti është i detyrueshëm.' });

    const speech = await openai.audio.speech.create({
      model: 'gpt-4o-mini-tts-2025-12-15',
      voice: 'nova',
      input: text,
      instructions: 'Speak in a clearly feminine voice using natural standard Albanian (sq-AL). Use native Albanian pronunciation and do not use an English or foreign accent. Pronounce j as Albanian j, never like gj. Pronounce dh, q, r, and rr clearly as distinct Albanian sounds. Pronounce every ë and ç carefully. Use a calm, warm, child-friendly pace. Read exactly the supplied Albanian words without translating, paraphrasing, or adding anything.',
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

app.post('/api/compare-character-likeness', async (req, res) => {
  try {
    const { originalPhoto, illustratedCharacter } = req.body || {};
    if (typeof originalPhoto !== 'string' || typeof illustratedCharacter !== 'string') {
      return res.status(400).json({ error: 'Both character images are required.' });
    }
    const completion = await openaiVision.chat.completions.create({
      model: FROZEN_TEXT_MODEL,
      temperature: FROZEN_TEMPERATURE,
      seed: FROZEN_SEED,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: `${JSON_SYSTEM_RULE}\nCompare two child images strictly for identity preservation. Ignore background and illustration medium.` },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Image 1 is the source child. Image 2 is an illustrated candidate. Compare face shape, eye shape and spacing, eyebrows, nose, mouth, cheeks, hairline, hair texture and color, skin tone, body proportions, clothing, posture, and mobility equipment. Return {"likeness_score":0,"same_child_likely":false,"correction_prompt":"precise English corrections"}. A generic lookalike must score below 75.' },
            { type: 'image_url', image_url: { url: originalPhoto } },
            { type: 'image_url', image_url: { url: illustratedCharacter } }
          ]
        }
      ]
    });
    const parsed = parseJsonObject(completion.choices[0]?.message?.content, 'Likeness comparison');
    res.json({
      likeness_score: Math.max(0, Math.min(100, Number(parsed.likeness_score) || 0)),
      same_child_likely: parsed.same_child_likely === true,
      correction_prompt: String(parsed.correction_prompt || '').trim()
    });
  } catch (error) {
    console.error('Character likeness comparison error:', error.message);
    res.status(error.status || 500).json({ error: error.message });
  }
});

const IMAGE_START_INTERVAL_MS = Number(process.env.OPENAI_IMAGE_INTERVAL_MS) || 12500;
const STORYBOOK_IMAGE_INTERVAL_MS = Number(process.env.OPENAI_STORYBOOK_IMAGE_INTERVAL_MS) || 5000;
let imageStartGate = Promise.resolve();
let nextImageStartAt = 0;

async function reserveImageStart(intervalMs = IMAGE_START_INTERVAL_MS) {
  const previous = imageStartGate;
  let release;
  imageStartGate = new Promise((resolve) => { release = resolve; });
  await previous;
  const waitMs = Math.max(0, nextImageStartAt - Date.now());
  if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
  nextImageStartAt = Date.now() + Math.max(500, intervalMs);
  release();
}

function retryableImageError(error) {
  return error?.status === 408 || error?.status === 409 || error?.status === 429 || error?.status >= 500
    || error?.name === 'APIConnectionError' || error?.name === 'APITimeoutError';
}

async function runImageRequest(operation, attempts = 3, intervalMs = IMAGE_START_INTERVAL_MS) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await reserveImageStart(intervalMs);
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!retryableImageError(error) || attempt === attempts - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * (2 ** attempt)));
    }
  }
  throw lastError;
}

app.get('/api/health', (_req, res) => res.json({ ok: true, openaiConfigured: Boolean(process.env.OPENAI_API_KEY) }));

app.post('/api/generate-image', async (req, res) => {
  try {
    const { prompt, size = '1024x1024', quality = 'low', priority_class } = req.body || {};
    if (typeof prompt !== 'string' || !prompt.trim()) return res.status(400).json({ error: 'Prompt is required.' });
    const style = "Clean, professional 2D digital illustration for a children's learning app. Clear subject, warm colors, natural anatomy, uncluttered background, no writing, no watermark.";
    const request = { prompt: `${style} Subject: ${prompt.trim()}`, size, quality, output_format: 'png' };
    const intervalMs = priority_class === 'storybook' ? STORYBOOK_IMAGE_INTERVAL_MS : IMAGE_START_INTERVAL_MS;
    const result = await runImageRequest(() => openaiImages.images.generate({ model: 'gpt-image-2', ...request }), 3, intervalMs);
    const b64 = result?.data?.[0]?.b64_json;
    if (!b64) throw new Error('OpenAI returned no image data.');
    res.json({ ...result, imageUrl: `data:image/png;base64,${b64}` });
  } catch (error) {
    console.error('Image generation error:', error.message);
    res.status(error.status || 500).json({ error: error.message });
  }
});

function dataUrlToImageFile(dataUrl, index) {
  const match = String(dataUrl).match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s);
  if (!match) throw new Error(`Reference image ${index + 1} is invalid.`);
  const extension = match[1].includes('jpeg') ? 'jpg' : 'png';
  return toFile(Buffer.from(match[2], 'base64'), `reference-${index}.${extension}`, { type: match[1] });
}

function sanitizeEditReferenceImages(images) {
  return Array.from(new Set((Array.isArray(images) ? images : [])
    .map((item) => String(item || '').trim())
    .filter((item) => /^data:image\/(?:png|jpeg|jpg|webp);base64,/i.test(item)))).slice(0, 3);
}

app.post('/api/edit-image', async (req, res) => {
  try {
    const {
      prompt,
      images,
      size = '1024x1536',
      quality = 'high',
      model = 'gpt-image-2',
      input_fidelity,
      priority_class
    } = req.body || {};
    if (typeof prompt !== 'string' || !prompt.trim()) return res.status(400).json({ error: 'Prompt is required.' });
    const sanitizedImages = sanitizeEditReferenceImages(images);
    if (!sanitizedImages.length) return res.status(400).json({ error: 'One to three valid raster reference images are required.' });
    const imageFiles = await Promise.all(sanitizedImages.map(dataUrlToImageFile));
    const request = {
      image: imageFiles,
      prompt: prompt.trim(),
      size,
      quality,
      output_format: 'png'
    };
    if (typeof input_fidelity === 'string' && input_fidelity.trim()) {
      request.input_fidelity = input_fidelity.trim();
    }
    const intervalMs = priority_class === 'storybook' ? STORYBOOK_IMAGE_INTERVAL_MS : IMAGE_START_INTERVAL_MS;
    const result = await runImageRequest(() => openaiImages.images.edit({ model, ...request }), 3, intervalMs);
    const b64 = result?.data?.[0]?.b64_json;
    if (!b64) throw new Error('OpenAI returned no edited image data.');
    res.json({ ...result, imageUrl: `data:image/png;base64,${b64}` });
  } catch (error) {
    console.error('Image edit error:', error.message);
    res.status(error.status || 500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Backend running securely on http://localhost:${PORT}`);
});
