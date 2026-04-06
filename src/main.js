import { chromium } from 'playwright';
import dotenv from 'dotenv';
import readline from 'readline';
import { getAllExos, printExosSummary, getExercisesToDo } from './gets/get-all-exos.js';
import { detectExerciceType } from './exercices/exercices-types.js';
import { solveConversation, selectAnswerByLetter, validateAnswers, getProgress, waitBasedOnAudio } from './exercices/conversation.js';
import { solvePhrasesATrous, selectAnswerByLetter as selectAnswerByLetterPAT, validateAnswers as validateAnswersPAT, getProgress as getProgressPAT, } from './exercices/phrases-a-troue.js';
import { solveTextesACompleter, getCurrentQuestion, selectAnswerByLetter as selectAnswerByLetterTAC, clickNextButton, getProgress as getProgressTAC } from './exercices/textes-a-completer.js';
import { isAIConfigured, getAIAnswersForConversationBatch, getAIAnswersForFillInTheBlankBatch, getAIAnswerForTextCompletion } from './ai/ai-provider.js';

dotenv.config();

// Configuration de l'attente
const WAIT_ENABLED = process.env.WAIT_ENABLED !== 'false';
const WAIT_MIN_EXTRA = parseInt(process.env.WAIT_MIN_EXTRA) || 2000;
const WAIT_MAX_EXTRA = parseInt(process.env.WAIT_MAX_EXTRA) || 8000;

// Sections à ignorer
const SECTIONS_TO_SKIP = ['pm-55094', 'pm-55095', 'pm-55098', 'pm-55101', 'pm-55102'];

/**
 * Pose une question à l'utilisateur dans le terminal
 * @param {string} question - La question à poser
 * @returns {Promise<string>} La réponse de l'utilisateur
 */
function askUser(question) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => {
        rl.question(question, answer => {
            rl.close();
            resolve(answer.trim());
        });
    });
}

/**
 * Parse les arguments CLI pour déterminer le mode d'exécution
 * --section : section entière (défaut)
 * --count N ou -n N : N exercices
 * @returns {{ mode: 'section'|'count', count?: number }}
 */
function parseArgs() {
    const args = process.argv.slice(2);
    for (let i = 0; i < args.length; i++) {
        if ((args[i] === '--count' || args[i] === '-n') && args[i + 1]) {
            const n = parseInt(args[i + 1]);
            if (!isNaN(n) && n > 0) return { mode: 'count', count: n };
        }
        if (args[i] === '--section' || args[i] === '-s') return { mode: 'section' };
    }
    // Pas d'argument → mode interactif (prompt)
    return { mode: 'interactive' };
}

/**
 * Attend un temps aléatoire entre chaque validation (simule la réflexion)
 * @param {import('playwright').Page} page - La page Playwright
 * @param {boolean} waitEnabled - Si l'attente est activée
 * @param {number} minWait - Temps minimum en ms
 * @param {number} maxWait - Temps maximum en ms
 */
async function waitRandomTime(page, waitEnabled = true, minWait = 9000, maxWait = 15000) {
    if (!waitEnabled) {
        console.log('⏩ Attente désactivée');
        return;
    }

    const waitTime = Math.floor(Math.random() * (maxWait - minWait + 1)) + minWait + (process.env.WAIT_BASE_TIMER ? parseInt(process.env.WAIT_BASE_TIMER) : 10000);
    console.log(`⏳ Attente: ${waitTime}ms (${(waitTime / 1000).toFixed(1)}s) - simulation de réflexion`);

    await page.waitForTimeout(waitTime);
    console.log('✓ Attente terminée');
}

/**
 * Vérifie si la page de récapitulatif de fin d'exercice est affichée
 * @param {import('playwright').Page} page - La page Playwright
 * @returns {Promise<boolean>} true si la page de récapitulatif est détectée
 */
async function isRecapPage(page) {
    const recapElement = await page.$('[data-testid="your-grade"]');
    return !!recapElement;
}

/**
 * Gère la page de récapitulatif de fin d'exercice.
 * Si shouldContinue est true, clique sur "Activité suivante" pour enchaîner.
 * Sinon, retourne à la liste des exercices.
 * @param {import('playwright').Page} page - La page Playwright
 * @param {boolean} shouldContinue - true pour cliquer sur "Activité suivante"
 * @param {string} exosPageUrl - URL de la liste des exercices (fallback)
 */
async function handleRecapPage(page, shouldContinue, exosPageUrl) {
    try {
        // Attendre que la page de récapitulatif apparaisse
        await page.waitForSelector('[data-testid="your-grade"]', { timeout: 15000 });
        console.log('📋 Page de récapitulatif détectée');

        // Extraire le score
        const score = await page.$eval('[data-testid="your-grade"]', el => el.textContent.trim()).catch(() => null);
        if (score) {
            console.log(`📊 Score: ${score}`);
        }

        if (shouldContinue) {
            // Cliquer sur "Activité suivante" pour enchaîner
            const nextButton = await page.$('button:has-text("Activité suivante")');
            if (nextButton) {
                console.log('➡️ Passage à l\'activité suivante...');
                await nextButton.click();
                // Attendre que la nouvelle activité se charge
                await page.waitForURL(/https:\/\/exam\.global-exam\.com\/training\/activity.*/, { timeout: 15000 });
                console.log('✅ Nouvelle activité chargée');
            } else {
                console.log('⚠ Bouton "Activité suivante" non trouvé, retour à la liste...');
                await page.goto(exosPageUrl);
                await page.waitForURL(exosPageUrl);
            }
        } else {
            // Dernier exercice ou exercice unique : retour à la liste
            console.log('🔙 Retour à la liste des exercices...');
            await page.goto(exosPageUrl);
            await page.waitForURL(exosPageUrl);
        }
    } catch (e) {
        // Page de récapitulatif non détectée, fallback vers la liste
        console.log('⚠ Page de récapitulatif non détectée, retour à la liste...');
        await page.goto(exosPageUrl);
        await page.waitForURL(exosPageUrl);
    }
}

async function runAutomation() {
    const browser = await chromium.launch({
        headless: process.env.BROWSER_HEADLESS === true,
        args: ['--window-size=' + process.env.BROWSER_WIDTH + ',' + process.env.BROWSER_HEIGHT]
    });
    const page = await browser.newPage({ viewport: null });

    try {

        await page.goto('https://auth.global-exam.com/login');

        // Remplir le formulaire de connexion
        await page.fill('input[id="input-2"]', process.env.GLOBAL_EXAM_LOGIN);
        await page.fill('input[id="input-3"]', process.env.GLOBAL_EXAM_PASSWORD);
        await page.click('button[type="submit"]');

        await page.waitForURL('https://exam.global-exam.com/');

        // Fermer les pop-ups si présents, sinon passer à la suite après un délai
        try {
            await page.waitForSelector('button[id="axeptio_btn_acceptAll"]', { timeout: 5000 });
            await page.click('button[id="axeptio_btn_acceptAll"]');
        } catch (e) {
            // Le bouton n'est pas apparu, on continue
        }

        try {
            await page.waitForSelector('button[class="pt-close"]', { timeout: 3000 });
            await page.click('button[class="pt-close"]');
        } catch (e) {
            // Le bouton n'est pas apparu, on continue
        }

        // Naviguer vers les exos
        // Aller vers la page des plannings utilisateur
        await page.click('a[href^="/user-plannings"]');

        // Attendre que la page des exercices soit chargée
        await page.waitForURL(/https:\/\/exam\.global-exam\.com\/user-plannings.*/);
        const exosPageUrl = page.url();

        // Récupérer tous les exercices
        const exosData = await getAllExos(page);

        // Afficher le résumé
        printExosSummary(exosData);

        // Récupérer les exercices à faire (en excluant les sections à ignorer)
        const allExercisesToDo = getExercisesToDo(exosData);
        const exercisesToDo = allExercisesToDo.filter(exo => !SECTIONS_TO_SKIP.includes(exo.sectionId));

        console.log('\n========== EXERCICES À FAIRE ==========');
        console.log(`${exercisesToDo.length} exercice(s) à compléter (${allExercisesToDo.length - exercisesToDo.length} ignorés):`);
        exercisesToDo.forEach((exo, i) => {
            console.log(`  ${i + 1}. [${exo.section}] ${exo.nom}`);
        });

        if (exercisesToDo.length === 0) {
            console.log('\n✅ Aucun exercice à faire dans les sections autorisées.');
            return;
        }

        // Grouper les exercices par section
        const exercisesBySection = {};
        exercisesToDo.forEach(exo => {
            if (!exercisesBySection[exo.sectionId]) {
                exercisesBySection[exo.sectionId] = [];
            }
            exercisesBySection[exo.sectionId].push(exo);
        });

        // Déterminer le mode d'exécution
        let runConfig = parseArgs();

        if (runConfig.mode === 'interactive') {
            console.log('\n========== MODE D\'EXÉCUTION ==========');
            console.log('  1. Section entière (première section disponible)');
            console.log('  2. Un seul exercice');
            console.log('  3. Un nombre précis d\'exercices');
            const choice = await askUser('\nVotre choix (1/2/3) : ');

            if (choice === '2') {
                runConfig = { mode: 'count', count: 1 };
            } else if (choice === '3') {
                const countStr = await askUser('Combien d\'exercices ? : ');
                const count = parseInt(countStr);
                if (isNaN(count) || count < 1) {
                    console.log('⚠ Nombre invalide, mode section entière par défaut.');
                    runConfig = { mode: 'section' };
                } else {
                    runConfig = { mode: 'count', count };
                }
            } else {
                runConfig = { mode: 'section' };
            }
        }

        // Sélectionner les exercices à faire selon le mode
        let selectedExercises;
        let sessionLabel;

        if (runConfig.mode === 'count') {
            // Prendre les N premiers exercices (tous sections confondues)
            selectedExercises = exercisesToDo.slice(0, runConfig.count);
            sessionLabel = runConfig.count === 1
                ? `1 exercice`
                : `${runConfig.count} exercice(s)`;
        } else {
            // Mode section : prendre la première section complète
            const firstSectionId = Object.keys(exercisesBySection)[0];
            selectedExercises = exercisesBySection[firstSectionId];
            sessionLabel = `Section "${selectedExercises[0].section}"`;
        }

        console.log(`\n🎯 Mode: ${sessionLabel} (${selectedExercises.length} exercice(s))`);
        selectedExercises.forEach((exo, i) => {
            console.log(`  ${i + 1}. [${exo.section}] ${exo.nom}`);
        });

        // Statistiques pour le résumé
        let exercicesCompletes = 0;
        let exercicesEchoues = 0;

        // Faire une boucle sur les exercices sélectionnés
        for (let i = 0; i < selectedExercises.length; i++) {
            const exo = selectedExercises[i];
            const isLastExercise = i === selectedExercises.length - 1;
            console.log(`\n--- Démarrage de l'exercice ${i + 1}/${selectedExercises.length}: [${exo.section}] ${exo.nom} ---`);

            // Pour le premier exercice, naviguer depuis la liste
            // Pour les suivants, on y arrive via "Activité suivante"
            // Si on a été redirigé vers la liste suite à une erreur, il faut naviguer à nouveau
            if (i === 0 || !page.url().includes('/training/activity')) {
                // S'assurer d'être sur la page liste
                if (!page.url().includes('/user-plannings')) {
                    await page.goto(exosPageUrl);
                    await page.waitForURL(exosPageUrl);
                }

                // Sélectionner la div qui contient les boutons d'exercices
                const sectionHeader = await page.$(`#${exo.sectionId}`);
                if (!sectionHeader) {
                    console.error(`Section ${exo.sectionId} non trouvée`);
                    continue;
                }

                // Récupérer la grille d'exercices (nextElementSibling)
                const exercisesGrid = await sectionHeader.evaluateHandle(el => el.nextElementSibling);
                const buttons = await exercisesGrid.$$('button');

                // Cliquer sur le bouton à l'index correspondant (index - 1 car l'index est 1-based)
                if (exo.index > 0 && exo.index <= buttons.length) {
                    await buttons[exo.index - 1].click();
                    console.log(`Exercice cliqué: ${exo.nom}`);
                } else {
                    console.error(`Index d'exercice ${exo.index} invalide pour la section ${exo.sectionId}`);
                }

                // Attendre que la nouvelle page soit chargée
                await page.waitForURL(/https:\/\/exam\.global-exam\.com\/training\/activity.*/);
            } // fin if (i === 0)

            // Détection du type d'exercice
            const exerciceType = await detectExerciceType(exo);
            console.log('Type d\'exercice détecté:', exerciceType ? exerciceType.label : 'Inconnu');

            // Résoudre l'exercice selon son type
            if (exerciceType && ['Conversation', 'Monologue', 'QuestionResponse', 'Photograph'].includes(exerciceType.type)) {
                // Boucle pour résoudre toutes les étapes de l'exercice
                let isExerciseComplete = false;

                // Fermer les pop-ups si présents, sinon passer à la suite après un délai
                try {
                    await page.waitForSelector('button[id="axeptio_btn_acceptAll"]', { timeout: 3000 });
                    await page.click('button[id="axeptio_btn_acceptAll"]');
                } catch (e) {
                    // Le bouton n'est pas apparu, on continue
                }


                while (!isExerciseComplete) {
                    // Vérifier si on est sur la page de résultat ou récapitulatif AVANT de tenter de résoudre
                    const currentUrlCheck = page.url();
                    if (currentUrlCheck.includes('/result') || !currentUrlCheck.includes('/training/activity')) {
                        isExerciseComplete = true;
                        console.log('✅ Exercice terminé (page de résultat détectée)');
                        break;
                    }
                    if (await isRecapPage(page)) {
                        isExerciseComplete = true;
                        console.log('✅ Exercice terminé (récapitulatif détecté)');
                        break;
                    }

                    // Récupérer les données de l'exercice (transcription + questions)
                    const data = await solveConversation(page);

                    console.log('\n📝 Transcription:');
                    if (data.transcription && data.transcription.trim()) {
                        console.log(data.transcription);
                    } else {
                        console.log('(vide)');
                    }

                    // Afficher la progression
                    const progress = await getProgress(page);
                    console.log(`\n📊 Progression: ${progress.current}/${progress.total}`);

                    // Attendre le temps de l'audio + temps aléatoire avant de répondre
                    await waitBasedOnAudio(page, WAIT_ENABLED, WAIT_MIN_EXTRA, WAIT_MAX_EXTRA);

                    // Sélectionner les réponses avec l'IA ou aléatoirement
                    // Pour Photograph, pas d'IA (inutile car pas de texte)
                    if (isAIConfigured()) {
                        console.log('\n🧠 Sélection des réponses avec l\'IA (batch)...');
                        const letters = await getAIAnswersForConversationBatch(data.transcription, data.questions);
                        for (let i = 0; i < data.questions.length; i++) {
                            // Vérifier que la lettre est valide pour cette question (certaines n'ont que 3 réponses)
                            const numAnswers = data.questions[i].reponses.length;
                            const validLetters = ['A', 'B', 'C', 'D'].slice(0, numAnswers);
                            const letter = validLetters.includes(letters[i].toUpperCase()) ? letters[i] : validLetters[Math.floor(Math.random() * numAnswers)];
                            await selectAnswerByLetter(page, i, letter);
                        }
                    } else {
                        console.log('\n🎲 Sélection aléatoire...');
                        for (let i = 0; i < data.questions.length; i++) {
                            // Utiliser le nombre réel de réponses pour cette question
                            const numAnswers = data.questions[i].reponses.length;
                            const randomLetter = ['A', 'B', 'C', 'D'][Math.floor(Math.random() * numAnswers)];
                            await selectAnswerByLetter(page, i, randomLetter);
                        }
                    }

                    // Valider les réponses
                    await validateAnswers(page);

                    // Attendre que la page se mette à jour (récap, changement d'URL ou nouvelles questions)
                    console.log('⏳ Attente de la transition de page...');
                    try {
                        await Promise.race([
                            page.waitForSelector('[data-testid="your-grade"]', { timeout: 10000 }),
                            page.waitForURL(/\/result/, { timeout: 10000 }),
                            page.waitForTimeout(5000)
                        ]);
                    } catch (e) {
                        // Timeout atteint, on continue la vérification
                    }

                    // Vérifier si on a terminé l'exercice (redirection vers résultats, récapitulatif ou nouvelle URL)
                    const currentUrl = page.url();
                    if (currentUrl.includes('/result') || !currentUrl.includes('/training/activity')) {
                        isExerciseComplete = true;
                        console.log('✅ Exercice terminé!');
                    } else if (await isRecapPage(page)) {
                        isExerciseComplete = true;
                        console.log('✅ Exercice terminé (récapitulatif détecté)!');
                    } else {
                        // Vérifier si les questions ont changé
                        const newProgress = await getProgress(page);
                        if (newProgress.isResultPage || newProgress.current >= newProgress.total) {
                            isExerciseComplete = true;
                            console.log('✅ Exercice terminé!');
                        }
                    }
                }

                exercicesCompletes++;

            } else if (exerciceType && exerciceType.type === 'FillInTheBlank') {
                // Exercice de type "Phrases à trous" (Reading Partie 5)
                let isExerciseComplete = false;

                while (!isExerciseComplete) {
                    // Vérifier si on est sur la page de résultat ou récapitulatif AVANT de tenter de résoudre
                    const currentUrlCheckPAT = page.url();
                    if (currentUrlCheckPAT.includes('/result') || !currentUrlCheckPAT.includes('/training/activity')) {
                        isExerciseComplete = true;
                        console.log('✅ Exercice terminé (page de résultat détectée)');
                        break;
                    }
                    if (await isRecapPage(page)) {
                        isExerciseComplete = true;
                        console.log('✅ Exercice terminé (récapitulatif détecté)');
                        break;
                    }

                    // Récupérer les données de l'exercice (questions)
                    const data = await solvePhrasesATrous(page);

                    // Afficher la progression
                    const progress = await getProgressPAT(page);
                    console.log(`\n📊 Progression: ${progress.current}/${progress.total}`);

                    // Attendre un temps aléatoire pour simuler la réflexion
                    await waitRandomTime(page, WAIT_ENABLED, WAIT_MIN_EXTRA, WAIT_MAX_EXTRA);

                    // Sélectionner les réponses avec l'IA ou aléatoirement
                    if (isAIConfigured()) {
                        console.log('\n🧠 Sélection des réponses avec l\'IA (batch)...');
                        const letters = await getAIAnswersForFillInTheBlankBatch(data.questions);
                        for (let i = 0; i < data.questions.length; i++) {
                            await selectAnswerByLetterPAT(page, i, letters[i]);
                        }
                    } else {
                        console.log('\n⚠ IA non configurée, sélection aléatoire...');
                        for (let i = 0; i < data.questions.length; i++) {
                            const randomLetter = ['A', 'B', 'C', 'D'][Math.floor(Math.random() * 4)];
                            await selectAnswerByLetterPAT(page, i, randomLetter);
                        }
                    }

                    // Valider les réponses
                    await validateAnswersPAT(page);

                    // Attendre que la page se mette à jour (récap, changement d'URL ou nouvelles questions)
                    console.log('⏳ Attente de la transition de page...');
                    try {
                        await Promise.race([
                            page.waitForSelector('[data-testid="your-grade"]', { timeout: 10000 }),
                            page.waitForURL(/\/result/, { timeout: 10000 }),
                            page.waitForTimeout(5000)
                        ]);
                    } catch (e) {
                        // Timeout atteint, on continue la vérification
                    }

                    // Vérifier si on a terminé l'exercice
                    const currentUrl = page.url();
                    if (currentUrl.includes('/result') || !currentUrl.includes('/training/activity')) {
                        isExerciseComplete = true;
                        console.log('✅ Exercice terminé!');
                    } else if (await isRecapPage(page)) {
                        isExerciseComplete = true;
                        console.log('✅ Exercice terminé (récapitulatif détecté)!');
                    } else {
                        // Vérifier si les questions ont changé
                        const newProgress = await getProgressPAT(page);
                        if (newProgress.current >= newProgress.total) {
                            isExerciseComplete = true;
                            console.log('✅ Exercice terminé!');
                        }
                    }
                }

                exercicesCompletes++;

            } else if (exerciceType && exerciceType.type === 'TextCompletion' || exerciceType.type === 'SimpleTextCompletion' || exerciceType.type === 'MultipleTexts') {
                // Exercice de type "Textes à compléter" (Reading Partie 6)
                let isExerciseComplete = false;

                // Récupérer le texte support une seule fois au début
                const data = await solveTextesACompleter(page);

                while (!isExerciseComplete) {
                    // Vérifier si on est sur la page de résultat ou récapitulatif AVANT de tenter de résoudre
                    const currentUrlCheckTAC = page.url();
                    if (currentUrlCheckTAC.includes('/result') || !currentUrlCheckTAC.includes('/training/activity')) {
                        isExerciseComplete = true;
                        console.log('✅ Exercice terminé (page de résultat détectée)');
                        break;
                    }
                    if (await isRecapPage(page)) {
                        isExerciseComplete = true;
                        console.log('✅ Exercice terminé (récapitulatif détecté)');
                        break;
                    }

                    // Récupérer la question courante
                    const question = await getCurrentQuestion(page);

                    // Afficher la progression
                    const progress = await getProgressTAC(page);
                    console.log(`\n📊 Progression: ${progress.current}/${progress.total}`);

                    // Attendre un temps aléatoire pour simuler la réflexion
                    await waitRandomTime(page, WAIT_ENABLED, WAIT_MIN_EXTRA, WAIT_MAX_EXTRA);

                    // Sélectionner la réponse avec l'IA ou aléatoirement
                    let selectedLetter;
                    if (isAIConfigured()) {
                        console.log('\n🧠 Sélection de la réponse avec l\'IA...');
                        selectedLetter = await getAIAnswerForTextCompletion(data.texte, question);
                    } else {
                        console.log('\n⚠ IA non configurée, sélection aléatoire...');
                        selectedLetter = ['A', 'B', 'C', 'D'][Math.floor(Math.random() * 4)];
                    }
                    await selectAnswerByLetterTAC(page, selectedLetter);

                    // Cliquer sur le bouton suivant (Passer/Valider/Terminer)
                    const buttonResult = await clickNextButton(page);

                    // Attendre que la page se mette à jour (récap, changement d'URL ou nouvelles questions)
                    console.log('⏳ Attente de la transition de page...');
                    try {
                        await Promise.race([
                            page.waitForSelector('[data-testid="your-grade"]', { timeout: 10000 }),
                            page.waitForURL(/\/result/, { timeout: 10000 }),
                            page.waitForTimeout(5000)
                        ]);
                    } catch (e) {
                        // Timeout atteint, on continue la vérification
                    }

                    // Vérifier si on a terminé l'exercice
                    const currentUrl = page.url();
                    if (currentUrl.includes('/result') || !currentUrl.includes('/training/activity') || buttonResult === 'finish') {
                        isExerciseComplete = true;
                        console.log('✅ Exercice terminé!');
                    } else if (await isRecapPage(page)) {
                        isExerciseComplete = true;
                        console.log('✅ Exercice terminé (récapitulatif détecté)!');
                    } else {
                        // Vérifier si on a atteint la fin
                        const newProgress = await getProgressTAC(page);
                        if (newProgress.current >= newProgress.total) {
                            isExerciseComplete = true;
                            console.log('✅ Exercice terminé!');
                        }
                    }
                }

                exercicesCompletes++;
            } else {
                console.log('⚠ Type d\'exercice non supporté:', exerciceType?.label || 'Inconnu');
                exercicesEchoues++;
            }

            // Gérer la page de récapitulatif (continuer ou retourner à la liste)
            await handleRecapPage(page, !isLastExercise, exosPageUrl);
        }

        // Afficher le résumé de la session
        console.log('\n========================================');
        console.log('📊 RÉSUMÉ DE LA SESSION');
        console.log('========================================');
        console.log(`Mode: ${sessionLabel}`);
        console.log(`Exercices complétés: ${exercicesCompletes}/${selectedExercises.length}`);
        if (exercicesEchoues > 0) {
            console.log(`Exercices échoués/non supportés: ${exercicesEchoues}`);
        }
        console.log('========================================');
        console.log('✅ Session terminée!');



    } catch (error) {
        console.error('Erreur:', error);
    } finally {
        // await browser.close();
    }
}

runAutomation();
