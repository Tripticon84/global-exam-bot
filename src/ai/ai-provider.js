/**
 * Module IA pour répondre aux questions TOEIC
 * Supporte ChatGPT (OpenAI) et Gemini (Google)
 */

const AI_PROVIDER = process.env.AI_PROVIDER || 'gemini'; // 'openai' ou 'gemini'

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
                    content: 'Tu es un expert en anglais et en TOEIC. Tu dois répondre aux questions en donnant UNIQUEMENT la lettre de la bonne réponse (A, B, C ou D). Ne donne aucune explication, juste la lettre.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: 0.1,
            max_tokens: 10
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

    const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            contents: [
                {
                    parts: [
                        {
                            text: `Tu es un expert en anglais et en TOEIC. Tu dois répondre aux questions en donnant UNIQUEMENT la lettre de la bonne réponse (A, B, C ou D). Ne donne aucune explication, juste la lettre.\n\n${prompt}`
                        }
                    ]
                }
            ],
            generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 50
            }
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(`Gemini API error: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();

    // Vérifier que la réponse contient les données attendues
    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content || !data.candidates[0].content.parts || !data.candidates[0].content.parts[0]) {
        console.error('Réponse Gemini inattendue:', JSON.stringify(data, null, 2));
        throw new Error('Réponse Gemini invalide ou vide');
    }

    return data.candidates[0].content.parts[0].text.trim();
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
 * Génère un prompt pour un exercice de type Conversation/Monologue
 * @param {string} transcription - La transcription de l'audio
 * @param {Object} question - Les données de la question
 * @returns {string} Le prompt formaté
 */
export function generateConversationPrompt(transcription, question) {
    let prompt = `Voici une transcription d'une conversation/monologue en anglais:\n\n`;
    prompt += `"${transcription}"\n\n`;
    prompt += `Question: ${question.texte}\n\n`;
    prompt += `Réponses possibles:\n`;

    question.reponses.forEach(r => {
        prompt += `${r.lettre} ${r.texte}\n`;
    });

    prompt += `\nQuelle est la bonne réponse? Réponds UNIQUEMENT par la lettre (A, B, C ou D).`;

    return prompt;
}

/**
 * Génère un prompt pour un exercice de type Phrases à trous
 * @param {Object} question - Les données de la question
 * @returns {string} Le prompt formaté
 */
export function generateFillInTheBlankPrompt(question) {
    let prompt = `Voici une phrase à trous en anglais (TOEIC Reading Part 5):\n\n`;
    prompt += `"${question.texte}"\n\n`;
    prompt += `Réponses possibles:\n`;

    question.reponses.forEach(r => {
        prompt += `${r.lettre} ${r.texte}\n`;
    });

    prompt += `\nQuelle est la bonne réponse pour compléter la phrase? Réponds UNIQUEMENT par la lettre (A, B, C ou D).`;

    return prompt;
}

/**
 * Génère un prompt pour un exercice de type Textes à compléter
 * @param {string} texte - Le texte support
 * @param {Object} question - Les données de la question
 * @returns {string} Le prompt formaté
 */
export function generateTextCompletionPrompt(texte, question) {
    let prompt = `Voici un texte en anglais (TOEIC Reading Part 6):\n\n`;
    prompt += `"${texte}"\n\n`;
    prompt += `Question: ${question.texte}\n\n`;
    prompt += `Réponses possibles:\n`;

    question.reponses.forEach(r => {
        prompt += `${r.lettre} ${r.texte}\n`;
    });

    prompt += `\nQuelle est la bonne réponse pour compléter le texte? Réponds UNIQUEMENT par la lettre (A, B, C ou D).`;

    return prompt;
}

/**
 * Obtient la réponse IA pour une question de conversation/monologue
 * @param {string} transcription - La transcription
 * @param {Object} question - La question
 * @returns {Promise<string>} La lettre de réponse
 */
export async function getAIAnswerForConversation(transcription, question) {
    const prompt = generateConversationPrompt(transcription, question);
    const response = await callAI(prompt);
    const letter = extractAnswerLetter(response);

    if (!letter) {
        console.warn('⚠ Impossible d\'extraire la lettre, réponse aléatoire...');
        return ['A', 'B', 'C', 'D'][Math.floor(Math.random() * 4)];
    }

    return letter;
}

/**
 * Obtient la réponse IA pour une question de phrases à trous
 * @param {Object} question - La question
 * @returns {Promise<string>} La lettre de réponse
 */
export async function getAIAnswerForFillInTheBlank(question) {
    const prompt = generateFillInTheBlankPrompt(question);
    const response = await callAI(prompt);
    const letter = extractAnswerLetter(response);

    if (!letter) {
        console.warn('⚠ Impossible d\'extraire la lettre, réponse aléatoire...');
        return ['A', 'B', 'C', 'D'][Math.floor(Math.random() * 4)];
    }

    return letter;
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
