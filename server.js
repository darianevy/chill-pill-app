import 'dotenv/config';
import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json({ limit: '25mb' }));
app.use(express.static(join(__dirname, 'public')));

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const EXTRACTION_SYSTEM_PROMPT = `Ты — система извлечения структурированных данных, встроенная в приложение для управления приёмом лекарств. Твоя единственная задача — прочитать изображение или документ медицинского рецепта и извлечь препараты, дозировки, схему приёма и метаданные документа в строгом JSON-формате.

Ты не даёшь медицинских консультаций и не используешь общие медицинские знания, чтобы "дополнить" или "исправить" то, что не можешь чётко прочитать в исходном документе.

КРИТИЧЕСКИЕ ПРАВИЛА:
1. Извлекай только то, что видно в документе. Никогда не подставляй "типичную" дозу, если фактически написанная доза нечитаема или отсутствует — помечай поле как неуверенное или null.
2. Если не уверена в поле — честно отражай это через confidence. Никогда не угадывай молча.
3. Если документ не является рецептом, либо в нём нет извлекаемой информации — верни пустой массив medications и объясни почему в extraction_warnings.
4. Выводи ТОЛЬКО валидный JSON-объект по схеме ниже. Без markdown-форматирования (без \`\`\`json), без преамбулы, без пояснений вне JSON.
5. Сохраняй оригинальное написание названия препарата ровно так, как в документе.
6. Если в документе несколько препаратов — верни все как отдельные элементы массива.

ОБРАБОТКА СОКРАЩЕНИЙ (медицинский шорт-код на русском/украинском):
Распознавай сокращения типа "1 т. 2 р/д" (1 таблетка 2 раза в день), "в/м" (внутримышечно), "натощак", "після їжі" и т.д. Если сокращение неоднозначно — понижай confidence для этого поля.

ПРАВИЛА CONFIDENCE: "high" — печатный/типографский текст или полностью разборчивый почерк. "medium" — разборчиво, но есть небольшая неоднозначность. "low" — нечитаемо, отсутствует, противоречиво, либо вывод косвенный.
overall_confidence препарата = наименьшее значение среди name_confidence, dosage_confidence, frequency_confidence, duration_confidence.

СХЕМА ВЫВОДА (строго следуй этой структуре, ничего лишнего):
{
  "document_type": "handwritten | printed | electronic_pdf",
  "document_metadata": {
    "clinic": "string или null",
    "doctor_name": "string или null",
    "doctor_specialty": "string или null",
    "issued_at": "string или null"
  },
  "medications": [
    {
      "name": "string",
      "name_confidence": "high | medium | low",
      "dosage": "string или null",
      "dosage_confidence": "high | medium | low",
      "form": "string или null",
      "frequency_human": "строка как в источнике",
      "frequency_confidence": "high | medium | low",
      "frequency_structured": { "times_per_day": "число или null", "specific_times": ["string"] },
      "duration_days": "число или null",
      "duration_confidence": "high | medium | low",
      "special_instructions": "string или null",
      "overall_confidence": "high | medium | low"
    }
  ],
  "extraction_warnings": ["string"]
}`;

app.post('/api/scan-prescription', async (req, res) => {
  const { base64Data, mediaType } = req.body;

  if (!base64Data || !mediaType) {
    return res.status(400).json({ error: 'Missing base64Data or mediaType' });
  }

  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
  if (!allowedTypes.includes(mediaType)) {
    return res.status(400).json({ error: 'Unsupported file type' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY is not set');
    return res.status(500).json({ error: 'Server misconfiguration' });
  }

  const body = {
    system_instruction: {
      parts: [{ text: EXTRACTION_SYSTEM_PROMPT }]
    },
    contents: [{
      role: 'user',
      parts: [
        { inline_data: { mime_type: mediaType, data: base64Data } },
        { text: 'Витягни дані з цього рецепта згідно інструкції. Виведи тільки JSON.' }
      ]
    }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 8192
    }
  };

  try {
    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[Gemini HTTP error]', response.status, errText);
      return res.status(500).json({ error: 'Extraction failed', gemini_status: response.status, gemini_detail: errText });
    }

    const data = await response.json();
    console.log('[Gemini raw response]', JSON.stringify(data).slice(0, 300));

    const text = data.candidates?.[0]?.content?.parts
      ?.filter(p => p.text)
      ?.map(p => p.text)
      ?.join('\n') ?? '';

    if (!text) {
      const blockReason = data.promptFeedback?.blockReason ?? data.candidates?.[0]?.finishReason ?? 'unknown';
      console.error('[Gemini no text] blockReason:', blockReason, JSON.stringify(data));
      return res.status(500).json({ error: 'No text in Gemini response', block_reason: blockReason, raw: data });
    }

    const cleaned = text.replace(/```json|```/g, '').trim();
    let result;
    try {
      result = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error('[JSON parse error]', parseErr.message, '\nRaw text:', text);
      return res.status(500).json({ error: 'JSON parse failed', raw_text: text });
    }
    res.json(result);
  } catch (err) {
    console.error('[Extraction error]', err.message, err.stack);
    res.status(500).json({ error: 'Extraction failed', detail: err.message });
  }
});

app.post('/api/drug-info', async (req, res) => {
  const { name, dosage } = req.body;
  if (!name) return res.status(400).json({ error: 'Missing drug name' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Server misconfiguration' });

  const prompt = `Ти — фармацевтичний довідник. Для препарату "${name}"${dosage ? ' (дозування ' + dosage + ')' : ''} дай коротку структуровану інформацію українською мовою. Відповідай ТІЛЬКИ JSON без markdown:
{
  "usage": "для чого призначають (1-2 речення)",
  "instructions": "як приймати (коротко, 1-2 речення)",
  "sideEffects": "основні побічні ефекти (перелік через кому, до 5 штук)",
  "contraindications": "основні протипоказання (перелік через кому, до 5 штук)",
  "source": "tabletka.ua"
}`;

  try {
    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 512 }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[Drug info error]', response.status, errText);
      return res.status(500).json({ error: 'Drug info failed' });
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.filter(p => p.text)?.map(p => p.text)?.join('\n') ?? '';
    const cleaned = text.replace(/```json|```/g, '').trim();
    res.json(JSON.parse(cleaned));
  } catch (err) {
    console.error('[Drug info error]', err.message);
    res.status(500).json({ error: 'Drug info failed' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Chill Pill running → http://localhost:${PORT}`);
});
