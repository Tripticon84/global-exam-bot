import { chromium } from 'playwright';
import dotenv from 'dotenv';
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

async function runAutomation() {
    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();

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

        // Prendre uniquement la première section disponible
        const firstSectionId = Object.keys(exercisesBySection)[0];
        const currentSectionExercises = exercisesBySection[firstSectionId];
        const currentSectionName = currentSectionExercises[0].section;

        console.log(`\n🎯 Section en cours: ${currentSectionName} (${currentSectionExercises.length} exercices)`);

        // Statistiques pour le résumé
        let exercicesCompletes = 0;
        let exercicesEchoues = 0;

        // Faire une boucle sur les exercices de la section courante
        for (const exo of currentSectionExercises) {
            console.log(`\n--- Démarrage de l'exercice: [${exo.section}] ${exo.nom} ---`);

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

            // Détection du type d'exercice
            const exerciceType = await detectExerciceType(exo);
            console.log('Type d\'exercice détecté:', exerciceType ? exerciceType.label : 'Inconnu');

            // Résoudre l'exercice selon son type
            if (exerciceType && exerciceType.type === 'Conversation' || exerciceType.type === 'Monologue' || exerciceType.type === 'QuestionResponse' || exerciceType.type === 'Photograph') {
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
                    // Récupérer les données de l'exercice (transcription + questions)
                    const data = await solveConversation(page);

                    console.log('\n📝 Transcription:');
                    console.log(data.transcription);

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

                    // Attendre un peu pour que la page se mette à jour
                    await page.waitForTimeout(1000);

                    // Vérifier si on a terminé l'exercice (redirection vers résultats ou nouvelle URL)
                    const currentUrl = page.url();
                    if (currentUrl.includes('/result') || !currentUrl.includes('/training/activity')) {
                        isExerciseComplete = true;
                        console.log('✅ Exercice terminé!');
                    } else {
                        // Vérifier si les questions ont changé
                        const newProgress = await getProgress(page);
                        if (newProgress.current === progress.total) {
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

                    // Attendre un peu pour que la page se mette à jour
                    await page.waitForTimeout(1000);

                    // Vérifier si on a terminé l'exercice
                    const currentUrl = page.url();
                    if (currentUrl.includes('/result') || !currentUrl.includes('/training/activity')) {
                        isExerciseComplete = true;
                        console.log('✅ Exercice terminé!');
                    } else {
                        // Vérifier si les questions ont changé
                        const newProgress = await getProgressPAT(page);
                        if (newProgress.current === progress.total) {
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

                    // Attendre un peu pour que la page se mette à jour
                    await page.waitForTimeout(1000);

                    // Vérifier si on a terminé l'exercice
                    const currentUrl = page.url();
                    if (currentUrl.includes('/result') || !currentUrl.includes('/training/activity') || buttonResult === 'finish') {
                        isExerciseComplete = true;
                        console.log('✅ Exercice terminé!');
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

            // Retourner à la page des exercices
            await page.goto(exosPageUrl);
            await page.waitForURL(exosPageUrl);
        }

        // Afficher le résumé de la section
        console.log('\n========================================');
        console.log('📊 RÉSUMÉ DE LA SESSION');
        console.log('========================================');
        console.log(`Section: ${currentSectionName}`);
        console.log(`Exercices complétés: ${exercicesCompletes}/${currentSectionExercises.length}`);
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
