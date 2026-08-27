const express = require('express');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');

const router = express.Router();

const SPEECH_SERVICE_URL = process.env.SPEECH_SERVICE_URL || 'http://localhost:8000';

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

function getCacheKey(prefix, identifier) {
  return `vaanisetu:${prefix}:${identifier}`;
}

async function checkCache(redis, key) {
  try {
    const cached = await redis.get(key);
    return cached ? JSON.parse(cached) : null;
  } catch (e) {
    console.error('Cache read error:', e);
    return null;
  }
}

async function setCache(redis, key, value, ttlSeconds = 86400) {
  try {
    await redis.setEx(key, ttlSeconds, JSON.stringify(value));
  } catch (e) {
    console.error('Cache write error:', e);
  }
}

async function logUnresolvedTerm(pgPool, sourceText, translatedText, confidence, srcLang, tgtLang) {
  if (confidence >= 0.7) return;
  
  try {
    await pgPool.query(
      `INSERT INTO unresolved_terms (source_text, translated_text, confidence, src_lang, tgt_lang)
       VALUES ($1, $2, $3, $4, $5)`,
      [sourceText, translatedText, confidence, srcLang, tgtLang]
    );
  } catch (e) {
    console.error('Failed to log unresolved term:', e);
  }
}

router.get('/unresolved-terms', async (req, res) => {
  const pgPool = req.app.locals.pgPool;
  const limit = parseInt(req.query.limit) || 100;
  const offset = parseInt(req.query.offset) || 0;
  
  try {
    const result = await pgPool.query(
      `SELECT id, source_text, translated_text, confidence, src_lang, tgt_lang, created_at
       FROM unresolved_terms
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    
    const countResult = await pgPool.query(
      `SELECT COUNT(*) FROM unresolved_terms`
    );
    
    res.json({
      terms: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit,
      offset
    });
  } catch (error) {
    console.error('Unresolved terms fetch error:', error.message);
    res.status(500).json({ error: 'Failed to fetch unresolved terms' });
  }
});

router.post('/text', async (req, res) => {
  const { text, src_lang = 'hin_Deva', tgt_lang = 'sat_Olck' } = req.body;
  
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'Text is required' });
  }
  
  const redis = req.app.locals.redis;
  const pgPool = req.app.locals.pgPool;
  const cacheKey = getCacheKey('translate', `${src_lang}:${tgt_lang}:${text}`);
  
  const cached = await checkCache(redis, cacheKey);
  if (cached) {
    return res.json({ ...cached, cached: true });
  }
  
  try {
    const response = await axios.post(`${SPEECH_SERVICE_URL}/translate`, {
      text: text.trim(),
      src_lang,
      tgt_lang
    }, { timeout: 60000 });
    
    const { translated, confidence } = response.data;
    
    await setCache(redis, cacheKey, { translated, confidence });
    await logUnresolvedTerm(pgPool, text.trim(), translated, confidence, src_lang, tgt_lang);
    
    res.json({ translated, confidence, cached: false });
  } catch (error) {
    console.error('Translation error:', error.message);
    if (error.response) {
      return res.status(error.response.status).json({ error: error.response.data });
    }
    res.status(502).json({ error: 'Translation service unavailable' });
  }
});

router.post('/ocr', upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Image file is required' });
  }
  
  try {
    const formData = new FormData();
    formData.append('file', req.file.buffer, {
      filename: req.file.originalname,
      contentType: req.file.mimetype
    });
    
    const response = await axios.post(`${SPEECH_SERVICE_URL}/ocr`, formData, {
      headers: formData.getHeaders(),
      timeout: 60000
    });
    
    res.json({ text: response.data.text || '' });
  } catch (error) {
    console.error('OCR error:', error.message);
    if (error.response) {
      return res.status(error.response.status).json({ error: error.response.data });
    }
    res.status(502).json({ error: 'OCR service unavailable. Ensure speech-service is running with tesseract installed.' });
  }
});

router.post('/voice', upload.single('audio'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Audio file is required' });
  }
  
  const redis = req.app.locals.redis;
  const pgPool = req.app.locals.pgPool;
  
  const audioHash = require('crypto').createHash('sha256').update(req.file.buffer).digest('hex').slice(0, 16);
  const cacheKey = getCacheKey('pipeline', audioHash);
  
  const cached = await checkCache(redis, cacheKey);
  if (cached) {
    return res.json({ ...cached, cached: true });
  }
  
  try {
    const formData = new FormData();
    formData.append('file', req.file.buffer, {
      filename: req.file.originalname,
      contentType: req.file.mimetype
    });
    
    const response = await axios.post(`${SPEECH_SERVICE_URL}/pipeline/voice`, formData, {
      headers: formData.getHeaders(),
      timeout: 120000,
      responseType: 'json'
    });
    
    const { transcribed, translated, confidence, audio_base64 } = response.data;
    
    const result = { transcribed, translated, confidence, audio_base64 };
    await setCache(redis, cacheKey, result);
    await logUnresolvedTerm(pgPool, transcribed, translated, confidence, 'hin_Deva', 'sat_Olck');
    
    res.json({ ...result, cached: false });
  } catch (error) {
    console.error('Voice pipeline error:', error.message);
    if (error.response) {
      return res.status(error.response.status).json({ error: error.response.data });
    }
    res.status(502).json({ error: 'Voice pipeline service unavailable' });
  }
});

module.exports = router;