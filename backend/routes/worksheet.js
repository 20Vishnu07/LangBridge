const express = require('express');
const { Groq } = require('groq-sdk');

const router = express.Router();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const WORKSHEET_PROMPT = `You are a Hindi-Santali bilingual worksheet generator for classroom use.
Given a Hindi text, generate a JSON worksheet with 5-8 practice items for students learning Santali.

Output ONLY valid JSON in this exact format:
{
  "title": "Worksheet title in Hindi",
  "items": [
    {
      "type": "translation",
      "hindi": "Hindi sentence",
      "santali": "Santali translation in Ol Chiki script",
      "audio_hint": "Pronunciation guide if needed"
    },
    {
      "type": "fill_blank",
      "hindi": "Hindi sentence with _____ blank",
      "santali": "Santali with _____ blank",
      "answer": "The missing word in Santali",
      "options": ["option1", "option2", "option3"]
    },
    {
      "type": "match",
      "hindi": "Hindi word/phrase",
      "santali": "Santali word/phrase"
    },
    {
      "type": "listen_write",
      "hindi": "Hindi sentence (teacher reads aloud)",
      "santali": "Santali sentence (students write in Ol Chiki)"
    }
  ],
  "instructions_hindi": "कार्यपत्रक के निर्देश हिंदी में",
  "instructions_santali": "कार्यपत्रक के निर्देश संताली में"
}

Mix item types. Keep sentences simple, classroom-appropriate. Use proper Ol Chiki script for Santali.`;

router.post('/generate', async (req, res) => {
  const { hindi_text, title } = req.body;
  
  if (!hindi_text || !hindi_text.trim()) {
    return res.status(400).json({ error: 'Hindi text is required' });
  }
  
  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: WORKSHEET_PROMPT },
        { role: 'user', content: `Generate a worksheet from this Hindi text:\n\n${hindi_text.trim()}\n\n${title ? `Title: ${title}` : ''}` }
      ],
      temperature: 0.7,
      max_tokens: 2000,
      response_format: { type: 'json_object' }
    });
    
    const worksheet = JSON.parse(completion.choices[0].message.content);
    res.json(worksheet);
  } catch (error) {
    console.error('Worksheet generation error:', error.message);
    if (error.status === 401) {
      return res.status(401).json({ error: 'Invalid Groq API key' });
    }
    res.status(502).json({ error: 'Worksheet generation failed', details: error.message });
  }
});

module.exports = router;