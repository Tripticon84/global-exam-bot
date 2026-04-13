import {
    solveConversation,
    selectAnswerByLetter,
    validateAnswers,
    getProgress,
    waitBasedOnAudio,
    isConversationExercise
} from './conversation.js';
import {
    solvePhrasesATrous,
    selectAnswerByLetter as selectAnswerByLetterPAT,
    validateAnswers as validateAnswersPAT,
    getProgress as getProgressPAT,
    isPhrasesATrousExercise
} from './phrases-a-troue.js';
import {
    solveTextesACompleter,
    getCurrentQuestion,
    selectAnswerByLetter as selectAnswerByLetterTAC,
    clickNextButton,
    getProgress as getProgressTAC,
    isTextesACompleterExercise
} from './textes-a-completer.js';
import {
    isAIConfigured,
    getAIAnswersForConversationBatch,
    getAIAnswersForFillInTheBlankBatch,
    getAIAnswerForTextCompletion
} from '../ai/ai-provider.js';
import { getSectionKind } from './dom-parsers.js';

/**
 * Vérifie si la page de récapitulatif de fin d'activité est affichée.
 * @param {import('playwright').Page} page
 * @returns {Promise<boolean>}
 */
async function isRecapPage(page) {
    const recapElement = await page.$('[data-testid="your-grade"]');
    return !!recapElement;
}

/**
 * Attend la transition après validation d'une réponse.
 * @param {import('playwright').Page} page
 */
async function waitForTransition(page) {
    console.log('⏳ Attente de la transition de page (exam)...');
    try {
        await Promise.race([
            page.waitForSelector('[data-testid="your-grade"]', { timeout: 10000 }),
            page.waitForURL(/\/result/, { timeout: 10000 }),
            page.waitForTimeout(5000)
        ]);
    } catch {
        // Timeout atteint, on continue la vérification.
    }
}

/**
 * Attend un temps aléatoire pour simuler la réflexion (lecture).
 * @param {import('playwright').Page} page
 * @param {boolean} waitEnabled
 * @param {number} minWait
 * @param {number} maxWait
 */
async function waitRandomTime(page, waitEnabled, minWait, maxWait) {
    if (!waitEnabled) {
        console.log('⏩ Attente désactivée');
        return;
    }

    const baseTimer = Number.isFinite(parseInt(process.env.WAIT_BASE_TIMER, 10))
        ? parseInt(process.env.WAIT_BASE_TIMER, 10)
        : 10000;

    const waitTime = Math.floor(Math.random() * (maxWait - minWait + 1)) + minWait + baseTimer;
    console.log(`⏳ Attente: ${waitTime}ms (${(waitTime / 1000).toFixed(1)}s) - simulation de réflexion`);

    await page.waitForTimeout(waitTime);
    console.log('✓ Attente terminée');
}

/**
 * Tente de cliquer sur "Activité suivante" depuis un récapitulatif.
 * @param {import('playwright').Page} page
 * @returns {Promise<boolean>}
 */
async function continueFromRecap(page) {
    const nextButton = await page.$('button:has-text("Activité suivante")');
    if (nextButton) {
        console.log('➡️ Passage à l\'activité suivante de l\'exam...');
        await nextButton.click();

        try {
            await Promise.race([
                page.waitForURL(/\/activity.*/, { timeout: 15000 }),
                page.waitForSelector('[data-testid^="question-"], #question-wrapper', { timeout: 15000 })
            ]);
        } catch {
            // Certaines transitions prennent plus de temps mais la boucle principale reverifiera l'état.
        }

        return true;
    }

    return false;
}

/**
 * Clique sur le bouton Démarrer si une page de consignes est affichée.
 * @param {import('playwright').Page} page
 * @returns {Promise<boolean>}
 */
async function clickStartButtonIfPresent(page) {
    const startButton = await page.$('[data-testid="start-activity-button"], button:has-text("Démarrer"), button:has-text("Commencer")');
    if (!startButton) {
        return false;
    }

    await startButton.click();
    console.log('✓ Bouton "Démarrer" cliqué (exam)');
    try {
        await Promise.race([
            page.waitForSelector('[data-testid^="question-"], #question-wrapper', { timeout: 8000 }),
            page.waitForTimeout(1500)
        ]);
    } catch {
        // Le rendu peut être plus long selon la transition.
    }
    return true;
}

/**
 * Détecte un exercice listening, même sans bouton "Transcription"
 * (photographie / question-réponse inclus).
 * @param {import('playwright').Page} page
 * @returns {Promise<boolean>}
 */
async function isListeningExercise(page) {
    const hasQuestions = await page.$('[data-testid^="question-"], #question-wrapper');
    if (!hasQuestions) {
        return false;
    }

    const section = await getSectionKind(page);
    if (section === 'reading') return false;
    if (section === 'listening') return true;

    const hasMediaPlay = await page.$('[data-testid="media-play"]');
    return !!hasMediaPlay;
}

/**
 * Gestion de la popup de reprise d'exam blanc.
 * @param {import('playwright').Page} page
 * @param {'continue'|'restart'} action
 * @returns {Promise<boolean>}
 */
export async function handleExamResumePopupIfPresent(page, action = 'continue') {
    try {
        await page.waitForSelector('.relative.rounded-size-10.bg-white', { timeout: 2500 });
    } catch {
        // Pas de popup visible, on continue.
    }

    const popup = page.locator('.relative.rounded-size-10.bg-white').filter({ hasText: /continuer cet examen blanc/i }).first();
    const popupCount = await popup.count();
    if (!popupCount) {
        return false;
    }

    const isVisible = await popup.isVisible().catch(() => false);
    if (!isVisible) {
        return false;
    }

    const continueButton = popup.locator('button').filter({ hasText: /^Continuer$/i }).first();
    const restartButton = popup.locator('button').filter({ hasText: /Recommencer depuis le début/i }).first();

    if (action === 'restart' && await restartButton.count()) {
        await restartButton.click({ force: true });
        console.log('✓ Popup exam: "Recommencer depuis le début" cliqué');
    } else if (await continueButton.count()) {
        await continueButton.click({ force: true });
        console.log('✓ Popup exam: "Continuer" cliqué');
    } else if (await restartButton.count()) {
        await restartButton.click({ force: true });
        console.log('⚠ Popup exam: fallback sur "Recommencer depuis le début"');
    } else {
        console.log('⚠ Popup exam détectée mais aucun bouton action trouvé');
        return false;
    }

    await page.waitForTimeout(700);
    return true;
}

/**
 * Résout une activité de type Listening (Conversation/Monologue/Photographie/QR).
 * @param {import('playwright').Page} page
 * @param {{waitEnabled:boolean, waitMinExtra:number, waitMaxExtra:number, examAIEnabled:boolean}} config
 */
async function solveConversationActivity(page, config) {
    let isExerciseComplete = false;

    while (!isExerciseComplete) {
        const currentUrlCheck = page.url();
        if (currentUrlCheck.includes('/result') || !currentUrlCheck.match(/\/activity/)) {
            console.log('✅ Activité listening terminée (page de résultat détectée)');
            break;
        }
        if (await isRecapPage(page)) {
            console.log('✅ Activité listening terminée (récapitulatif détecté)');
            break;
        }

        const data = await solveConversation(page, { extractTranscription: false });
        const progress = await getProgress(page);
        console.log(`\n📊 Progression listening: ${progress.current}/${progress.total}`);

        await waitBasedOnAudio(page, config.waitEnabled, config.waitMinExtra, config.waitMaxExtra);

        const canUseExamAI = config.examAIEnabled && isAIConfigured();
        if (canUseExamAI) {
            const transcriptionForAI = data.transcription?.trim() || '';
            if (transcriptionForAI) {
                console.log('\n🧠 Sélection des réponses avec l\'IA (batch listening exam, avec transcription)...');
            } else {
                console.log('\n🧠 Sélection des réponses avec l\'IA (batch listening exam, sans transcription)...');
            }

            const letters = await getAIAnswersForConversationBatch(transcriptionForAI, data.questions);

            for (let i = 0; i < data.questions.length; i++) {
                const numAnswers = data.questions[i].reponses.length;
                const validLetters = ['A', 'B', 'C', 'D'].slice(0, numAnswers);
                const aiLetter = letters[i] ? letters[i].toUpperCase() : '';
                const letter = validLetters.includes(aiLetter)
                    ? aiLetter
                    : validLetters[Math.floor(Math.random() * numAnswers)];
                await selectAnswerByLetter(page, i, letter);
            }
        } else {
            console.log('\n🎲 Exam: IA désactivée/non configurée, sélection aléatoire (listening)...');
            for (let i = 0; i < data.questions.length; i++) {
                const numAnswers = data.questions[i].reponses.length;
                const randomLetter = ['A', 'B', 'C', 'D'][Math.floor(Math.random() * numAnswers)];
                await selectAnswerByLetter(page, i, randomLetter);
            }
        }

        await validateAnswers(page);
        await waitForTransition(page);

        const currentUrl = page.url();
        if (currentUrl.includes('/result') || !currentUrl.match('/activity/')) {
            isExerciseComplete = true;
            console.log('✅ Activité listening terminée');
        } else if (await isRecapPage(page)) {
            isExerciseComplete = true;
            console.log('✅ Activité listening terminée (récapitulatif détecté)');
        } else {
            const newProgress = await getProgress(page);
            if (newProgress.isResultPage || (newProgress.total > 0 && newProgress.current >= newProgress.total)) {
                isExerciseComplete = true;
                console.log('✅ Activité listening terminée');
            }
        }
    }
}

/**
 * Résout une activité de type Reading Part 5 (phrases à trous).
 * @param {import('playwright').Page} page
 * @param {{waitEnabled:boolean, waitMinExtra:number, waitMaxExtra:number, examAIEnabled:boolean}} config
 */
async function solvePhrasesATrousActivity(page, config) {
    let isExerciseComplete = false;

    while (!isExerciseComplete) {
        const currentUrlCheck = page.url();
        if (currentUrlCheck.includes('/result') || !currentUrlCheck.match(/\/activity/)) {
            console.log('✅ Activité part 5 terminée (page de résultat détectée)');
            break;
        }
        if (await isRecapPage(page)) {
            console.log('✅ Activité part 5 terminée (récapitulatif détecté)');
            break;
        }

        const data = await solvePhrasesATrous(page);
        const progress = await getProgressPAT(page);
        console.log(`\n📊 Progression part 5: ${progress.current}/${progress.total}`);

        await waitRandomTime(page, config.waitEnabled, config.waitMinExtra, config.waitMaxExtra);

        if (config.examAIEnabled && isAIConfigured()) {
            console.log('\n🧠 Sélection des réponses avec l\'IA (batch part 5)...');
            const letters = await getAIAnswersForFillInTheBlankBatch(data.questions);
            for (let i = 0; i < data.questions.length; i++) {
                const letter = letters[i] ? letters[i].toUpperCase() : ['A', 'B', 'C', 'D'][Math.floor(Math.random() * 4)];
                await selectAnswerByLetterPAT(page, i, letter);
            }
        } else {
            console.log('\n🎲 Exam: IA désactivée/non configurée, sélection aléatoire (part 5)...');
            for (let i = 0; i < data.questions.length; i++) {
                const randomLetter = ['A', 'B', 'C', 'D'][Math.floor(Math.random() * 4)];
                await selectAnswerByLetterPAT(page, i, randomLetter);
            }
        }

        await validateAnswersPAT(page);
        await waitForTransition(page);

        const currentUrl = page.url();
        if (currentUrl.includes('/result') || !currentUrl.match('/activity/')) {
            isExerciseComplete = true;
            console.log('✅ Activité part 5 terminée');
        } else if (await isRecapPage(page)) {
            isExerciseComplete = true;
            console.log('✅ Activité part 5 terminée (récapitulatif détecté)');
        } else {
            const newProgress = await getProgressPAT(page);
            if (newProgress.total > 0 && newProgress.current >= newProgress.total) {
                isExerciseComplete = true;
                console.log('✅ Activité part 5 terminée');
            }
        }
    }
}

/**
 * Résout une activité de type Reading Part 6/7 (textes à compléter).
 * @param {import('playwright').Page} page
 * @param {{waitEnabled:boolean, waitMinExtra:number, waitMaxExtra:number, examAIEnabled:boolean}} config
 */
async function solveTextesACompleterActivity(page, config) {
    let isExerciseComplete = false;
    const data = await solveTextesACompleter(page);

    while (!isExerciseComplete) {
        const currentUrlCheck = page.url();
        if (currentUrlCheck.includes('/result') || !currentUrlCheck.match(/\/activity/)) {
            console.log('✅ Activité part 6/7 terminée (page de résultat détectée)');
            break;
        }
        if (await isRecapPage(page)) {
            console.log('✅ Activité part 6/7 terminée (récapitulatif détecté)');
            break;
        }

        const question = await getCurrentQuestion(page);
        if (!question) {
            console.log('⚠ Aucune question détectée sur la page part 6/7, arrêt de la boucle');
            break;
        }

        const progress = await getProgressTAC(page);
        console.log(`\n📊 Progression part 6/7: ${progress.current}/${progress.total}`);

        await waitRandomTime(page, config.waitEnabled, config.waitMinExtra, config.waitMaxExtra);

        let selectedLetter;
        if (config.examAIEnabled && isAIConfigured()) {
            console.log('\n🧠 Sélection de la réponse avec l\'IA (part 6/7)...');
            selectedLetter = await getAIAnswerForTextCompletion(data.texte, question);
        } else {
            console.log('\n🎲 Exam: IA désactivée/non configurée, sélection aléatoire (part 6/7)...');
            selectedLetter = ['A', 'B', 'C', 'D'][Math.floor(Math.random() * 4)];
        }

        await selectAnswerByLetterTAC(page, selectedLetter);
        const buttonResult = await clickNextButton(page);

        await waitForTransition(page);

        const currentUrl = page.url();
        if (currentUrl.includes('/result') || !currentUrl.match('/activity/') || buttonResult === 'finish') {
            isExerciseComplete = true;
            console.log('✅ Activité part 6/7 terminée');
        } else if (await isRecapPage(page)) {
            isExerciseComplete = true;
            console.log('✅ Activité part 6/7 terminée (récapitulatif détecté)');
        } else {
            const newProgress = await getProgressTAC(page);
            if (newProgress.total > 0 && newProgress.current >= newProgress.total) {
                isExerciseComplete = true;
                console.log('✅ Activité part 6/7 terminée');
            }
        }
    }
}

/**
 * Résout un exam TOEIC en chaînant automatiquement ses sous-activités.
 * @param {import('playwright').Page} page
 * @param {{
 *   waitEnabled?: boolean,
 *   waitMinExtra?: number,
 *   waitMaxExtra?: number,
 *   examAIEnabled?: boolean,
 *   resumeAction?: 'continue'|'restart',
 *   maxActivities?: number
 * }} options
 * @returns {Promise<{
 *   popupHandled: boolean,
 *   listening: number,
 *   fillInTheBlank: number,
 *   textCompletion: number,
 *   unknown: number,
 *   solvedActivities: number
 * }>}
 */
export async function solveExam(page, options = {}) {
    const config = {
        waitEnabled: options.waitEnabled !== false,
        waitMinExtra: Number.isFinite(options.waitMinExtra) ? options.waitMinExtra : 2000,
        waitMaxExtra: Number.isFinite(options.waitMaxExtra) ? options.waitMaxExtra : 8000,
        examAIEnabled: typeof options.examAIEnabled === 'boolean'
            ? options.examAIEnabled
            : process.env.EXAM_AI_ENABLED === 'true',
        resumeAction: options.resumeAction || 'continue',
        maxActivities: Number.isFinite(options.maxActivities) ? options.maxActivities : 30
    };

    const summary = {
        popupHandled: false,
        listening: 0,
        fillInTheBlank: 0,
        textCompletion: 0,
        unknown: 0,
        solvedActivities: 0
    };

    summary.popupHandled = await handleExamResumePopupIfPresent(page, config.resumeAction);

    for (let i = 0; i < config.maxActivities; i++) {
        const currentUrl = page.url();

        if (currentUrl.includes('/result') || !currentUrl.match(/\/activity/)) {
            console.log('✅ Fin de l\'exam détectée (sortie des pages activity)');
            break;
        }

        if (await isRecapPage(page)) {
            const moved = await continueFromRecap(page);
            if (!moved) {
                console.log('✅ Récapitulatif final atteint, fin de l\'exam');
                break;
            }
            continue;
        }

        if (await clickStartButtonIfPresent(page)) {
            continue;
        }

        const isConversation = await isConversationExercise(page);
        const isListening = isConversation || await isListeningExercise(page);
        if (isListening) {
            console.log('🎧 Sous-activité détectée: Listening');
            await solveConversationActivity(page, config);
            summary.listening++;
            summary.solvedActivities++;
            continue;
        }

        if (await isPhrasesATrousExercise(page)) {
            console.log('📖 Sous-activité détectée: Reading Part 5');
            await solvePhrasesATrousActivity(page, config);
            summary.fillInTheBlank++;
            summary.solvedActivities++;
            continue;
        }

        if (await isTextesACompleterExercise(page)) {
            console.log('📄 Sous-activité détectée: Reading Part 6/7');
            await solveTextesACompleterActivity(page, config);
            summary.textCompletion++;
            summary.solvedActivities++;
            continue;
        }

        // Dernière tentative: attendre brièvement le rendu des questions puis re-tester.
        const questionLoaded = await page.waitForSelector('[data-testid^="question-"], #question-wrapper', { timeout: 3000 })
            .then(() => true)
            .catch(() => false);
        if (questionLoaded) {
            console.log('ℹ Questions détectées après attente, nouvelle tentative de détection...');
            continue;
        }

        summary.unknown++;
        console.log('⚠ Sous-activité non reconnue, tentative de progression via récapitulatif');

        const moved = await continueFromRecap(page);
        if (!moved) {
            console.log('⚠ Impossible de progresser: arrêt de la résolution d\'exam');
            break;
        }
    }

    console.log(`📘 Résumé exam: listening=${summary.listening}, part5=${summary.fillInTheBlank}, part6/7=${summary.textCompletion}, inconnues=${summary.unknown}`);
    return summary;
}
