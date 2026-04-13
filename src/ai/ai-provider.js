/**
 * Module IA pour répondre aux questions TOEIC
 * Supporte ChatGPT (OpenAI) et Gemini (Google)
 */

const TOEIC_SYSTEM_PROMPT = 'Tu es un expert en anglais et en TOEIC. Tu dois répondre aux questions en donnant UNIQUEMENT la lettre de la bonne réponse (A, B, C ou D). Ne donne aucune explication, juste la lettre.';

function getEnvInt(name, fallback) {
    const parsed = parseInt(process.env[name], 10);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function truncateText(value, maxLength) {
    const normalized = String(value || '').replace(/\s+/g, ' ').trim();
    if (!maxLength || normalized.length <= maxLength) {
        return normalized;
    }
    return `${normalized.slice(0, Math.max(0, maxLength - 1))}…`;
}

/**
 * Appelle l'API OpenAI (ChatGPT)
 * @param {string} prompt - Le prompt à envoyer
 * @returns {Promise<string>} La réponse de l'IA
 */
async function callOpenAI(prompt) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        throw new Error('OPENAI_API_KEY non définie dans .env');
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: TOEIC_SYSTEM_PROMPT
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: 0.1,
            max_tokens: 50
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content.trim();
}

/**
 * Appelle l'API Google Gemini
 * @param {string} prompt - Le prompt à envoyer
 * @returns {Promise<string>} La réponse de l'IA
 */
async function callGemini(prompt) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error('GEMINI_API_KEY non définie dans .env');
    }

    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const baseMaxOutputTokens = getEnvInt('GEMINI_MAX_OUTPUT_TOKENS', 256);
    const maxRetries = getEnvInt('GEMINI_MAX_RETRIES', 2);
    const thinkingBudget = getEnvInt('GEMINI_THINKING_BUDGET', 0);

    const extractGeminiText = (data) => {
        const parts = data?.candidates?.[0]?.content?.parts || [];
        return parts
            .map((part) => typeof part?.text === 'string' ? part.text.trim() : '')
            .filter(Boolean)
            .join('\n')
            .trim();
    };

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const maxOutputTokens = baseMaxOutputTokens + (attempt * 128);

        const payload = {
            contents: [
                {
                    parts: [
                        {
                            text: `${TOEIC_SYSTEM_PROMPT}\n\n${prompt}`
                        }
                    ]
                }
            ],
            generationConfig: {
                temperature: 0.1,
                maxOutputTokens,
                responseMimeType: 'text/plain',
                ...(thinkingBudget >= 0 ? { thinkingConfig: { thinkingBudget } } : {})
            }
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(`Gemini API error: ${error.error?.message || response.statusText}`);
        }

        const data = await response.json();
        const finishReason = data?.candidates?.[0]?.finishReason || 'UNKNOWN';
        const text = extractGeminiText(data);

        if (text) {
            return text;
        }

        const canRetry = attempt < maxRetries;
        if (finishReason === 'MAX_TOKENS' && canRetry) {
            console.warn(`⚠ Gemini réponse vide avec finishReason=MAX_TOKENS, retry ${attempt + 1}/${maxRetries} (maxOutputTokens=${maxOutputTokens + 128})`);
            continue;
        }

        console.error('Réponse Gemini inattendue:', JSON.stringify(data, null, 2));

        if (canRetry) {
            console.warn(`⚠ Gemini réponse vide, retry ${attempt + 1}/${maxRetries}`);
            continue;
        }

        throw new Error(`Réponse Gemini invalide ou vide (finishReason=${finishReason})`);
    }

    throw new Error('Réponse Gemini invalide ou vide après retries');
}

/**
 * Appelle l'IA configurée
 * @param {string} prompt - Le prompt à envoyer
 * @returns {Promise<string>} La réponse de l'IA
 */
export async function callAI(prompt) {
    const provider = process.env.AI_PROVIDER || 'gemini';

    console.log(`🤖 Appel à l'IA (${provider})...`);

    try {
        let response;
        if (provider === 'openai') {
            response = await callOpenAI(prompt);
        } else if (provider === 'gemini') {
            response = await callGemini(prompt);
        } else {
            throw new Error(`Provider IA inconnu: ${provider}. Utilisez 'openai' ou 'gemini'.`);
        }

        console.log(`✓ Réponse IA: ${response}`);
        return response;
    } catch (error) {
        console.error(`✗ Erreur IA: ${error.message}`);
        // En cas d'erreur, retourner une lettre aléatoire
        const fallbackLetter = ['A', 'B', 'C', 'D'][Math.floor(Math.random() * 4)];
        console.log(`🎲 Fallback: réponse aléatoire ${fallbackLetter}`);
        return fallbackLetter;
    }
}

/**
 * Extrait la lettre de réponse d'une réponse IA
 * @param {string} response - La réponse de l'IA
 * @returns {string|null} La lettre (A, B, C ou D) ou null si non trouvée
 */
export function extractAnswerLetter(response) {
    // Chercher une lettre A, B, C ou D dans la réponse
    const match = response.match(/[ABCD]/i);
    return match ? match[0].toUpperCase() : null;
}

/**
 * Génère un prompt pour un exercice de type Conversation/Monologue avec TOUTES les questions
 * @param {string} transcription - La transcription de l'audio
 * @param {Array} questions - Les données de toutes les questions
 * @returns {string} Le prompt formaté
 */
export function generateConversationPromptBatch(transcription, questions) {
    const maxTranscriptionChars = getEnvInt('AI_TRANSCRIPTION_MAX_CHARS', 1800);
    const maxQuestionTextChars = getEnvInt('AI_QUESTION_MAX_CHARS', 220);
    const maxChoiceTextChars = getEnvInt('AI_CHOICE_MAX_CHARS', 160);
    const cleanedTranscription = truncateText(transcription, maxTranscriptionChars) || '[Transcription indisponible]';

    let prompt = `TOEIC Listening - Conversation/Monologue\n\n`;
    prompt += `Transcription:\n"${cleanedTranscription}"\n\n`;
    prompt += `Tu dois répondre à ${questions.length} question(s). Pour chaque question, donne UNIQUEMENT la lettre de la bonne réponse.\n\n`;

    questions.forEach((question, index) => {
        prompt += `--- Question ${index + 1} ---\n`;
        prompt += `${truncateText(question.texte || question.numero, maxQuestionTextChars)}\n`;
        prompt += `Choix:\n`;
        question.reponses.forEach(r => {
            const lettre = r.lettre.replace('.', '');
            prompt += `  ${lettre}: ${truncateText(r.texte, maxChoiceTextChars)}\n`;
        });
        prompt += `\n`;
    });

    prompt += `Format de sortie strict: ${questions.map((_, index) => `Q${index + 1}=A|B|C|D`).join(', ')}.\n`;
    prompt += `Réponds sur UNE SEULE LIGNE, sans explication. Exemple: Q1=B, Q2=D, Q3=A`;

    return prompt;
}

/**
 * Génère un prompt pour un exercice de type Phrases à trous avec TOUTES les questions
 * @param {Array} questions - Les données de toutes les questions
 * @returns {string} Le prompt formaté
 */
export function generateFillInTheBlankPromptBatch(questions) {
    let prompt = `TOEIC Reading Part 5 - Phrases à trous\n\n`;
    prompt += `Tu dois répondre à ${questions.length} question(s). Pour chaque phrase, choisis le mot qui complète correctement la phrase.\n\n`;

    questions.forEach((question, index) => {
        prompt += `--- Question ${index + 1} ---\n`;
        prompt += `Phrase: "${question.texte}"\n`;
        prompt += `Choix:\n`;
        question.reponses.forEach(r => {
            const lettre = r.lettre.replace('.', '');
            prompt += `  ${lettre}: ${r.texte}\n`;
        });
        prompt += `\n`;
    });

    prompt += `Réponds avec UNIQUEMENT les lettres dans l'ordre, séparées par des virgules. Exemple: A,B,C,D`;

    return prompt;
}

/**
 * Génère un prompt pour un exercice de type Textes à compléter (une seule question)
 * @param {string} texte - Le texte support
 * @param {Object} question - Les données de la question
 * @returns {string} Le prompt formaté
 */
export function generateTextCompletionPrompt(texte, question) {
    let prompt = `TOEIC Reading Part 6/7 - Texte à compléter\n\n`;
    prompt += `Texte:\n"${texte}"\n\n`;
    prompt += `Question: ${question.texte || question.numero}\n`;
    prompt += `Choix:\n`;

    question.reponses.forEach(r => {
        const lettre = r.lettre.replace('.', '');
        prompt += `  ${lettre}: ${r.texte}\n`;
    });

    prompt += `\nRéponds avec UNIQUEMENT la lettre de la bonne réponse (A, B, C ou D).`;

    return prompt;
}

/**
 * Parse une réponse IA contenant plusieurs lettres (ex: "A,B,C,D" ou "A, B, C, D")
 * @param {string} response - La réponse de l'IA
 * @param {number} expectedCount - Le nombre de réponses attendues
 * @returns {string[]} Les lettres extraites
 */
export function parseMultipleAnswers(response, expectedCount) {
    if (!response || typeof response !== 'string') {
        return Array.from({ length: expectedCount }, () => ['A', 'B', 'C', 'D'][Math.floor(Math.random() * 4)]);
    }

    // Nettoyer la réponse
    const cleaned = response.toUpperCase().replace(/[^ABCD,\s]/g, '');

    // Essayer de parser avec virgules
    let letters = cleaned.split(/[,\s]+/).filter(l => /^[ABCD]$/.test(l));

    // Si pas assez de lettres, essayer de prendre toutes les lettres dans l'ordre
    if (letters.length < expectedCount) {
        const allLetters = response.toUpperCase().match(/[ABCD]/g) || [];
        letters = allLetters.slice(0, expectedCount);
    }

    // Si toujours pas assez, compléter avec des réponses aléatoires
    while (letters.length < expectedCount) {
        letters.push(['A', 'B', 'C', 'D'][Math.floor(Math.random() * 4)]);
    }

    return letters.slice(0, expectedCount);
}

/**
 * Obtient les réponses IA pour TOUTES les questions de conversation/monologue en une seule requête
 * @param {string} transcription - La transcription
 * @param {Array} questions - Toutes les questions
 * @returns {Promise<string[]>} Les lettres de réponse pour chaque question
 */
export async function getAIAnswersForConversationBatch(transcription, questions) {
    const prompt = generateConversationPromptBatch(transcription, questions);
    const head = prompt.slice(0, 500);
    const tail = prompt.length > 700 ? prompt.slice(-200) : '';
    console.log(`\n📤 Prompt envoyé à l'IA (${prompt.length} caractères):\n${head}${prompt.length > 500 ? '\n...[tronqué dans les logs]...\n' : ''}${tail}\n`);

    const response = await callAI(prompt);
    const letters = parseMultipleAnswers(response, questions.length);

    console.log(`✓ Réponses parsées: ${letters.join(', ')}`);
    return letters;
}

/**
 * Obtient les réponses IA pour TOUTES les questions de phrases à trous en une seule requête
 * @param {Array} questions - Toutes les questions
 * @returns {Promise<string[]>} Les lettres de réponse pour chaque question
 */
export async function getAIAnswersForFillInTheBlankBatch(questions) {
    const prompt = generateFillInTheBlankPromptBatch(questions);
    console.log('\n📤 Prompt envoyé à l\'IA:\n', prompt.substring(0, 500) + '...\n');

    const response = await callAI(prompt);
    const letters = parseMultipleAnswers(response, questions.length);

    console.log(`✓ Réponses parsées: ${letters.join(', ')}`);
    return letters;
}

/**
 * Obtient la réponse IA pour une question de textes à compléter
 * @param {string} texte - Le texte support
 * @param {Object} question - La question
 * @returns {Promise<string>} La lettre de réponse
 */
export async function getAIAnswerForTextCompletion(texte, question) {
    const prompt = generateTextCompletionPrompt(texte, question);
    const response = await callAI(prompt);
    const letter = extractAnswerLetter(response);

    if (!letter) {
        console.warn('⚠ Impossible d\'extraire la lettre, réponse aléatoire...');
        return ['A', 'B', 'C', 'D'][Math.floor(Math.random() * 4)];
    }

    return letter;
}

/**
 * Vérifie si l'IA est configurée
 * @returns {boolean}
 */
export function isAIConfigured() {
    const provider = process.env.AI_PROVIDER || 'gemini';

    if (provider === 'openai') {
        return !!process.env.OPENAI_API_KEY;
    } else if (provider === 'gemini') {
        return !!process.env.GEMINI_API_KEY;
    }

    return false;
}
