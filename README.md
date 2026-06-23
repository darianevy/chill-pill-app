# Chill Pill 💊

Веб-застосунок для управління прийомом ліків із AI-скануванням рецептів.

## Що робить

- Завантаж фото або PDF рецепта — AI (Gemini) витягне назви препаратів, дозування і схему прийому
- Перевір дані на екрані підтвердження, виправ за потреби
- Застосунок складе графік прийомів і показує їх на головному екрані
- Відмічай прийоми одним тапом, дивись аналітику і всю історію

## Технології

- **Backend:** Node.js + Express
- **AI:** Google Gemini API (`gemini-2.5-flash`) — розпізнавання зображень і PDF
- **Frontend:** Vanilla JS + HTML/CSS (single-page app, без фреймворків)

## Запуск локально

**1. Клонуй репозиторій**
```bash
git clone https://github.com/darianevy/chill-pill-app.git
cd chill-pill-app
```

**2. Встанови залежності**
```bash
npm install
```

**3. Налаштуй змінні середовища**
```bash
cp .env.example .env
```
Відкрий `.env` і встав свій Gemini API ключ (отримати на [aistudio.google.com](https://aistudio.google.com)):
```
GEMINI_API_KEY=your_key_here
```

**4. Запусти сервер**
```bash
npm start
```

Застосунок доступний на [http://localhost:3000](http://localhost:3000).

## Безпека

API-ключ зберігається тільки як змінна середовища і ніколи не передається у фронтенд. Детальніше — у [SECURITY.md](SECURITY.md).

## Структура проєкту

```
├── server.js          # Express-сервер, проксі до Gemini API
├── public/
│   └── index.html     # Single-page фронтенд
├── .env.example       # Шаблон змінних середовища
├── SECURITY.md        # Опис безпекової моделі
└── package.json
```
