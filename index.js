require('dotenv').config();
const express = require('express');
const { engine } = require('express-handlebars');
const path = require('path');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;
const TJ_GEN_URL = (process.env.TJ_GEN_URL || 'http://localhost:3010').replace(/\/+$/, '');

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

// Routes
app.get('/', async (req, res) => {
  try {
    const response = await axios.get(`${TJ_GEN_URL}/api/tts/models`);
    const { models = {}, r2Configured = false } = response.data;
    
    res.render('home', {
      title: 'Text to Speech Converter',
      models,
      r2Configured
    });
  } catch (err) {
    console.error('Error fetching models from tj-gen:', err.message);
    res.status(500).send(`Failed to connect to AI generator microservice (${TJ_GEN_URL}): ${err.message}`);
  }
});

// TTS Conversion and compression API via tj-gen
app.post('/api/convert', async (req, res) => {
  const { text, modelId, voice, language, instructions, pushToR2 } = req.body;

  if (!text || !modelId) {
    return res.status(400).json({ success: false, error: 'Text and Model ID are required.' });
  }

  try {
    console.log(`Forwarding TTS generation request to tj-gen (${TJ_GEN_URL}/api/tts/generate)...`);
    const response = await axios.post(`${TJ_GEN_URL}/api/tts/generate`, {
      text,
      modelId,
      voice,
      language,
      instructions,
      pushToR2
    });

    return res.json(response.data);
  } catch (err) {
    console.error('TTS generation via tj-gen failed:', err.message);
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
});
