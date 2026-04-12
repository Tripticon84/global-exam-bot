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
 * Génère un prompt pour un exercice de type Conversation/Monologue avec TOUTES les questions
 * @param {string} transcription - La transcription de l'audio
 * @param {Array} questions - Les données de toutes les questions
 * @returns {string} Le prompt formaté
 */
export function generateConversationPromptBatch(transcription, questions) {
    let prompt = `TOEIC Listening - Conversation/Monologue\n\n`;
    prompt += `Transcription:\n"${transcription}"\n\n`;
    prompt += `Tu dois répondre à ${questions.length} question(s). Pour chaque question, donne UNIQUEMENT la lettre de la bonne réponse.\n\n`;

    questions.forEach((question, index) => {
        prompt += `--- Question ${index + 1} ---\n`;
        prompt += `${question.texte || question.numero}\n`;
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
    console.log('\n📤 Prompt envoyé à l\'IA:\n', prompt.substring(0, 500) + '...\n');

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
