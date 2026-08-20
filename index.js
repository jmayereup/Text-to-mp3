require('dotenv').config();
const express = require('express');
const { engine } = require('express-handlebars');
const path = require('path');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;
const TJ_GEN_URL = (process.env.TJ_GEN_URL || 'http://localhost:3010').replace(/\/+$/, '');
const POCKETBASE_URL = (process.env.POCKETBASE_URL || process.env.VITE_POCKETBASE_URL || 'https://pb.teacherjake.com').replace(/\/+$/, '');

// Directories setup
const PUBLIC_DIR = path.join(__dirname, 'public');

// Setup Handlebars
app.engine('handlebars', engine({
  defaultLayout: 'main',
  helpers: {
    json: function (context) {
      return JSON.stringify(context);
    },
    eq: function (a, b) {
      return a === b;
    },
    perMillion: function (price) {
      if (price === undefined || price === null) return '0.00';
      const num = parseFloat(price);
      if (isNaN(num)) return price;
      const val = num * 1000000;
      return val.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 4
      });
    }
  }
}));
app.set('view engine', 'handlebars');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(PUBLIC_DIR));

// Proxy /output/:filename to tj-gen if requested locally
app.get('/output/:filename', async (req, res) => {
  try {
    const targetUrl = `${TJ_GEN_URL}/output/${req.params.filename}`;
    const response = await axios.get(targetUrl, { responseType: 'stream' });
    res.setHeader('Content-Type', response.headers['content-type'] || 'audio/mpeg');
    response.data.pipe(res);
  } catch (err) {
    res.status(404).send('Audio file not found.');
  }
});

// Fallback models metadata if tj-gen is unauthenticated on initial SSR
const FALLBACK_MODELS = {
  'hexgrad/kokoro-82m': {
    id: 'hexgrad/kokoro-82m',
    name: 'Hexgrad: Kokoro 82M',
    description: 'Ultra-lightweight, lightning-fast open-weight TTS model. Delivers exceptionally natural-sounding speech.',
    pricing: { prompt: '0.00000062', completion: '0.00000062', unit: 'character' },
    voices: [
      { id: 'af_heart', name: 'US Female: Heart' },
      { id: 'af_bella', name: 'US Female: Bella' },
      { id: 'af_nicole', name: 'US Female: Nicole' },
      { id: 'af_sarah', name: 'US Female: Sarah' },
      { id: 'am_adam', name: 'US Male: Adam' },
      { id: 'am_michael', name: 'US Male: Michael' },
      { id: 'bf_emma', name: 'UK Female: Emma' },
      { id: 'bm_george', name: 'UK Male: George' },
      { id: 'ef_dora', name: 'ES Female: Dora' },
      { id: 'em_alex', name: 'ES Male: Alex' },
      { id: 'ff_siwis', name: 'FR Female: Siwis' },
      { id: 'if_sara', name: 'IT Female: Sara' },
      { id: 'im_nicola', name: 'IT Male: Nicola' },
      { id: 'jf_alpha', name: 'JA Female: Alpha' },
      { id: 'pf_dora', name: 'PT Female: Dora' },
      { id: 'zf_xiaobei', name: 'ZH Female: Xiaobei' }
    ],
    response_format: 'pcm',
    supportsLanguage: true,
    supportsInstructions: false,
    languages: [
      { code: 'en-US', name: 'English (United States)' },
      { code: 'en-GB', name: 'English (United Kingdom)' },
      { code: 'es-ES', name: 'Spanish (Spain)' },
      { code: 'fr-FR', name: 'French (France)' },
      { code: 'it-IT', name: 'Italian (Italy)' },
      { code: 'ja-JP', name: 'Japanese (Japan)' },
      { code: 'pt-BR', name: 'Portuguese (Brazil)' },
      { code: 'zh-CN', name: 'Chinese (Simplified)' }
    ]
  },
  'google/gemini-3.1-flash-tts-preview': {
    id: 'google/gemini-3.1-flash-tts-preview',
    name: 'Google: Gemini 3.1 Flash TTS Preview',
    description: 'High-performance TTS model supporting 70+ languages and inline audio tags (e.g. [whispers], [laughs]).',
    pricing: { prompt: '0.000001', completion: '0.00002', unit: 'token' },
    voices: [
      { id: 'Puck', name: 'Upbeat Male: Puck' },
      { id: 'Zephyr', name: 'Bright Female: Zephyr' },
      { id: 'Charon', name: 'Charon' },
      { id: 'Kore', name: 'Kore' },
      { id: 'Fenrir', name: 'Fenrir' },
      { id: 'Aoede', name: 'Aoede' }
    ],
    response_format: 'pcm',
    supportsLanguage: true,
    supportsInstructions: true,
    defaultInstructions: 'A slow clear voice suitable for ESL students.',
    languages: [
      { code: 'en-US', name: 'English (United States)' },
      { code: 'en-GB', name: 'English (United Kingdom)' },
      { code: 'es-ES', name: 'Spanish (Spain)' },
      { code: 'fr-FR', name: 'French (France)' },
      { code: 'de-DE', name: 'German (Germany)' },
      { code: 'it-IT', name: 'Italian (Italy)' },
      { code: 'ja-JP', name: 'Japanese (Japan)' },
      { code: 'ko-KR', name: 'Korean (South Korea)' },
      { code: 'pt-BR', name: 'Portuguese (Brazil)' },
      { code: 'ru-RU', name: 'Russian (Russia)' },
      { code: 'zh-CN', name: 'Chinese (Simplified)' }
    ]
  },
  'mistralai/voxtral-mini-tts-2603': {
    id: 'mistralai/voxtral-mini-tts-2603',
    name: 'Mistral: Voxtral Mini TTS',
    description: "Mistral's specialized text-to-speech model featuring zero-shot voice cloning capabilities.",
    pricing: { prompt: '0.000016', completion: '0.000016', unit: 'character' },
    voices: [
      { id: 'en_paul_neutral', name: 'EN: Paul (Neutral)' },
      { id: 'gb_oliver_neutral', name: 'GB: Oliver (Neutral)' },
      { id: 'gb_jane_neutral', name: 'GB: Jane (Neutral)' },
      { id: 'fr_marie_neutral', name: 'FR: Marie (Neutral)' }
    ],
    response_format: 'mp3',
    supportsLanguage: true,
    supportsInstructions: true,
    defaultInstructions: 'A slow clear voice suitable for ESL students.',
    languages: [
      { code: 'en-US', name: 'English (United States)' },
      { code: 'en-GB', name: 'English (United Kingdom)' },
      { code: 'fr-FR', name: 'French (France)' }
    ]
  }
};

// Routes
app.get('/', async (req, res) => {
  let models = FALLBACK_MODELS;
  let r2Configured = false;

  try {
    const headers = {};
    if (process.env.INTERNAL_SERVICE_KEY) {
      headers['X-Service-Key'] = process.env.INTERNAL_SERVICE_KEY;
    }
    const response = await axios.get(`${TJ_GEN_URL}/api/tts/models`, { headers, timeout: 3000 });
    if (response.data?.models) {
      models = response.data.models;
      r2Configured = !!response.data.r2Configured;
    }
  } catch (err) {
    console.warn(`[tj-tts] Using local models metadata (${err.message})`);
  }

  res.render('home', {
    title: 'TJ-TTS - Text to Speech Converter',
    models,
    r2Configured,
    pocketbaseUrl: POCKETBASE_URL
  });
});

// TTS Conversion and compression API via tj-gen (forwards PocketBase Authorization & Service Keys)
app.post('/api/convert', async (req, res) => {
  const { text, modelId, voice, language, instructions, pushToR2 } = req.body;

  if (!text || !modelId) {
    return res.status(400).json({ success: false, error: 'Text and Model ID are required.' });
  }

  try {
    const headers = { 'Content-Type': 'application/json' };
    
    if (req.headers.authorization) {
      headers['Authorization'] = req.headers.authorization;
    }
    if (req.headers['x-token']) {
      headers['x-token'] = req.headers['x-token'];
    }
    if (req.headers['x-service-key']) {
      headers['x-service-key'] = req.headers['x-service-key'];
    } else if (process.env.INTERNAL_SERVICE_KEY) {
      headers['x-service-key'] = process.env.INTERNAL_SERVICE_KEY;
    }

    console.log(`[tj-tts] Forwarding TTS generation request to tj-gen (${TJ_GEN_URL}/api/tts/generate)...`);
    const response = await axios.post(
      `${TJ_GEN_URL}/api/tts/generate`,
      {
        text,
        modelId,
        voice,
        language,
        instructions,
        pushToR2
      },
      { headers }
    );

    return res.json(response.data);
  } catch (err) {
    console.error('[tj-tts] TTS generation via tj-gen failed:', err.message);
    const errorMsg = err.response?.data?.error || err.message;
    res.status(err.response?.status || 500).json({
      success: false,
      error: errorMsg
    });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`[tj-tts] Frontend UI running on http://localhost:${PORT}`);
  console.log(`[tj-tts] Central backend proxy pointing to ${TJ_GEN_URL}`);
  console.log(`[tj-tts] PocketBase auth pointing to ${POCKETBASE_URL}`);
});

