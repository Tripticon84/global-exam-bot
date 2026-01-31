/**
 * Résout un exercice de type "Conversation" (Listening Partie 3)
 * @param {import('playwright').Page} page - La page Playwright
 * @returns {Promise<Object>} Les données de l'exercice (transcription, questions, réponses)
 */
export async function solveConversation(page) {
    // Vérifier si on est sur une page de consignes avec bouton "Démarrer"
    await clickStartButtonIfPresent(page);

    // Attendre que la page soit chargée
    await page.waitForSelector('[data-testid^="question-"]', { timeout: 10000 });

    // 1. Cliquer sur le bouton Transcription
    const transcriptionBtn = await page.$('button:has-text("Transcription")');
    if (transcriptionBtn) {
        await transcriptionBtn.click();
        console.log('✓ Bouton Transcription cliqué');

        // Attendre que la popup s'ouvre
        await page.waitForSelector('.wysiwyg.wysiwyg-spacing', { timeout: 5000 });
    }

    // 2. Récupérer la transcription
    const transcription = await page.evaluate(() => {
        const transcriptionElement = document.querySelector('.wysiwyg.wysiwyg-spacing');
        return transcriptionElement?.innerText?.trim() || '';
    });
    console.log('✓ Transcription récupérée');

    // 3. Fermer la popup
    const closeBtn = await page.$('button.absolute.top-0.right-0');
    if (closeBtn) {
        await closeBtn.click();
        console.log('✓ Popup fermée');
        await page.waitForTimeout(500);
    }

    // 4. Récupérer les questions et leurs réponses
    const questionsData = await page.evaluate(() => {
        const questions = [];
        const questionElements = document.querySelectorAll('[data-testid^="question-"]');

        questionElements.forEach((questionEl, index) => {
            const questionData = {
                index: index,
                numero: '',
                texte: '',
                reponses: []
            };

            // Numéro de la question (ex: "Question 28")
            const numeroElement = questionEl.querySelector('.font-bold.text-size-20');
            questionData.numero = numeroElement?.textContent?.trim() || `Question ${index + 1}`;

            // Texte de la question
            const texteElement = questionEl.querySelector('.text-neutral-80.leading-tight.mb-8 p, .text-neutral-80.leading-tight.mb-8');
            questionData.texte = texteElement?.innerText?.trim() || '';

            // Réponses possibles
            const answerLabels = questionEl.querySelectorAll('[data-testid^="exam-answer-"]');
            answerLabels.forEach((label, answerIndex) => {
                const input = label.querySelector('input[type="radio"]');

                // Récupérer le texte de la réponse de différentes manières
                let lettre = '';
                let texte = '';

                // Méthode 1: chercher les spans dans .text-neutral-80
                const textSpans = label.querySelectorAll('.text-neutral-80 span');
                if (textSpans.length >= 2) {
                    lettre = textSpans[0]?.textContent?.trim() || '';
                    texte = textSpans[1]?.textContent?.trim() || '';
                }

                // Méthode 2: si pas trouvé, chercher directement dans le label
                if (!texte) {
                    const flexDiv = label.querySelector('.flex');
                    if (flexDiv) {
                        const allSpans = flexDiv.querySelectorAll('span');
                        if (allSpans.length >= 2) {
                            // Premier span = lettre (A., B., etc.), deuxième = texte
                            lettre = allSpans[0]?.textContent?.trim() || '';
                            texte = allSpans[1]?.textContent?.trim() || '';
                        } else if (allSpans.length === 1) {
                            // Un seul span contient tout le texte
                            const fullText = allSpans[0]?.textContent?.trim() || '';
                            const match = fullText.match(/^([A-D]\.?)\s*(.*)$/);
                            if (match) {
                                lettre = match[1];
                                texte = match[2];
                            } else {
                                texte = fullText;
                            }
                        }
                    }
                }

                // Méthode 3: récupérer tout le texte du label et parser
                if (!texte) {
                    const fullText = label.textContent?.trim() || '';
                    const match = fullText.match(/^([A-D]\.?)\s*(.*)$/);
                    if (match) {
                        lettre = match[1];
                        texte = match[2];
                    } else {
                        texte = fullText;
                        lettre = ['A.', 'B.', 'C.', 'D.'][answerIndex] || '';
                    }
                }

                // Si toujours pas de lettre, assigner par défaut
                if (!lettre) {
                    lettre = ['A.', 'B.', 'C.', 'D.'][answerIndex] || '';
                }

                questionData.reponses.push({
                    index: answerIndex,
                    lettre: lettre,
                    texte: texte,
                    value: input?.value || '',
                    selector: `[data-testid="question-${index}"] [data-testid="exam-answer-${answerIndex + 1}"]`
                });
            });

            questions.push(questionData);
        });

        return questions;
    });

    console.log(`✓ ${questionsData.length} questions récupérées`);

    // Afficher les questions dans la console
    questionsData.forEach(q => {
        console.log(`\n${q.numero}: ${q.texte}`);
        q.reponses.forEach(r => {
            console.log(`  ${r.lettre} ${r.texte}`);
        });
    });

    return {
        transcription,
        questions: questionsData
    };
}

/**
 * Sélectionne une réponse pour une question donnée
 * @param {import('playwright').Page} page - La page Playwright
 * @param {number} questionIndex - L'index de la question (0-based)
 * @param {number} answerIndex - L'index de la réponse (0-based, 0=A, 1=B, 2=C, 3=D)
 */
export async function selectAnswer(page, questionIndex, answerIndex) {
    // D'abord vérifier que la question existe
    const questionSelector = `[data-testid="question-${questionIndex}"]`;
    const questionElement = await page.$(questionSelector);

    if (!questionElement) {
        console.log(`⚠️ Question ${questionIndex + 1} non trouvée sur la page, ignorée`);
        return;
    }

    const selector = `[data-testid="question-${questionIndex}"] [data-testid="exam-answer-${answerIndex + 1}"]`;

    // Vérifier que l'élément existe avant de cliquer (avec timeout court)
    const element = await page.$(selector);
    if (!element) {
        // Si l'élément n'existe pas, compter les réponses disponibles et choisir aléatoirement
        const availableAnswers = await page.$$(`[data-testid="question-${questionIndex}"] [data-testid^="exam-answer-"]`);
        const numAnswers = availableAnswers.length;
        if (numAnswers === 0) {
            console.log(`⚠️ Aucune réponse trouvée pour la question ${questionIndex + 1}, ignorée`);
            return;
        }
        const fallbackIndex = Math.floor(Math.random() * numAnswers);
        const fallbackSelector = `[data-testid="question-${questionIndex}"] [data-testid="exam-answer-${fallbackIndex + 1}"]`;
        await page.click(fallbackSelector, { timeout: 5000 });
        console.log(`⚠️ Réponse ${answerIndex + 1} non trouvée, fallback sur réponse ${fallbackIndex + 1} pour la question ${questionIndex + 1}`);
        return;
    }

    await page.click(selector, { timeout: 5000 });
    console.log(`✓ Réponse ${answerIndex + 1} sélectionnée pour la question ${questionIndex + 1}`);
}

/**
 * Sélectionne une réponse par sa lettre (A, B, C, D)
 * @param {import('playwright').Page} page - La page Playwright
 * @param {number} questionIndex - L'index de la question (0-based)
 * @param {string} letter - La lettre de la réponse (A, B, C ou D)
 */
export async function selectAnswerByLetter(page, questionIndex, letter) {
    const letterIndex = ['A', 'B', 'C', 'D'].indexOf(letter.toUpperCase());
    if (letterIndex === -1) {
        throw new Error(`Lettre invalide: ${letter}. Utilisez A, B, C ou D.`);
    }
    await selectAnswer(page, questionIndex, letterIndex);
}

/**
 * Clique sur le bouton Valider pour soumettre les réponses
 * @param {import('playwright').Page} page - La page Playwright
 */
export async function validateAnswers(page) {
    const validateBtn = await page.$('button:has-text("Valider")');
    const FinishBtn = await page.$('button:has-text("Terminer")');
    if (FinishBtn) {
        await FinishBtn.click();
        console.log('✓ Exercice terminé');
        // Attendre que la page de résumé s'affiche
        await page.waitForTimeout(1000);
    }
    if (validateBtn) {
        await validateBtn.click();
        console.log('✓ Réponses validées');
        // Attendre que les nouvelles questions se chargent
        await page.waitForTimeout(1000);
    } {
        console.error('✗ Bouton Valider non trouvé');
    }
}

/**
 * Résout automatiquement l'étape actuelle avec des réponses aléatoires
 * (à remplacer par une vraie logique de résolution basée sur la transcription)
 * @param {import('playwright').Page} page - La page Playwright
 * @param {Object} answers - Objet avec les réponses {questionIndex: letterOrIndex}
 */
export async function solveCurrentStep(page, answers = null) {
    // Récupérer les données de l'exercice
    const data = await solveConversation(page);

    // Si pas de réponses fournies, sélectionner des réponses aléatoires
    if (!answers) {
        console.log('\n⚠ Aucune réponse fournie, sélection aléatoire...');
        for (let i = 0; i < data.questions.length; i++) {
            const randomIndex = Math.floor(Math.random() * 4);
            await selectAnswer(page, i, randomIndex);
        }
    } else {
        // Utiliser les réponses fournies
        for (const [questionIndex, answer] of Object.entries(answers)) {
            const qIndex = parseInt(questionIndex);
            if (typeof answer === 'string') {
                await selectAnswerByLetter(page, qIndex, answer);
            } else {
                await selectAnswer(page, qIndex, answer);
            }
        }
    }

    // Valider les réponses
    await validateAnswers(page);

    return data;
}

/**
 * Vérifie si on est sur une page d'exercice conversation
 * @param {import('playwright').Page} page - La page Playwright
 * @returns {Promise<boolean>}
 */
export async function isConversationExercise(page) {
    const hasQuestions = await page.$('[data-testid^="question-"]');
    const hasTranscription = await page.$('button:has-text("Transcription")');
    return !!(hasQuestions && hasTranscription);
}

/**
 * Récupère le nombre de questions restantes et le total
 * @param {import('playwright').Page} page - La page Playwright
 * @returns {Promise<{current: number, total: number}>}
 */
export async function getProgress(page) {
    const progressText = await page.evaluate(() => {
        // Chercher le texte type "27/39"
        const progressElement = document.querySelector('.text-size-12.text-primary-80');
        return progressElement?.textContent?.trim() || '';
    });

    const match = progressText.match(/(\d+)\/(\d+)/);
    if (match) {
        return {
            current: parseInt(match[1]),
            total: parseInt(match[2])
        };
    }

    return { current: 0, total: 0 };
}

/**
 * Récupère le temps restant
 * @param {import('playwright').Page} page - La page Playwright
 * @returns {Promise<string>}
 */
export async function getTimeRemaining(page) {
    const time = await page.evaluate(() => {
        const timeElement = document.querySelector('.w-16.text-size-14.text-center');
        return timeElement?.textContent?.trim() || '';
    });
    return time;
}

/**
 * Récupère la durée totale de l'audio en millisecondes
 * @param {import('playwright').Page} page - La page Playwright
 * @returns {Promise<number>} La durée en millisecondes
 */
export async function getAudioDuration(page) {
    const durationText = await page.evaluate(() => {
        // Chercher le span avec le format "00:00 / XX:XX"
        const timeSpan = document.querySelector('.w-24.shrink-0.text-size-14');
        if (!timeSpan) return '';

        const text = timeSpan.textContent?.trim() || '';
        // Extraire la partie après le "/"
        const match = text.match(/\/\s*(\d{1,2}):(\d{2})/);
        if (match) {
            return `${match[1]}:${match[2]}`;
        }
        return '';
    });

    if (!durationText) {
        console.log('⚠ Durée audio non trouvée, utilisation de 0ms');
        return 0;
    }

    // Convertir MM:SS en millisecondes
    const [minutes, seconds] = durationText.split(':').map(Number);
    const durationMs = (minutes * 60 + seconds) * 1000;
    console.log(`🎵 Durée audio: ${durationText} (${durationMs}ms)`);
    return durationMs;
}

/**
 * Attend un temps basé sur la durée de l'audio + un temps aléatoire
 * @param {import('playwright').Page} page - La page Playwright
 * @param {boolean} waitEnabled - Si l'attente est activée
 * @param {number} minExtra - Temps minimum supplémentaire en ms
 * @param {number} maxExtra - Temps maximum supplémentaire en ms
 */
export async function waitBasedOnAudio(page, waitEnabled = true, minExtra = 2000, maxExtra = 8000) {
    if (!waitEnabled) {
        console.log('⏩ Attente désactivée');
        return;
    }

    const audioDuration = await getAudioDuration(page);
    const extraTime = Math.floor(Math.random() * (maxExtra - minExtra + 1)) + minExtra;
    const totalWait = audioDuration + extraTime;

    console.log(`⏳ Attente: ${audioDuration}ms (audio) + ${extraTime}ms (aléatoire) = ${totalWait}ms (${(totalWait / 1000).toFixed(1)}s)`);

    await page.waitForTimeout(totalWait);
    console.log('✓ Attente terminée');
}

/**
 * Clique sur le bouton "Démarrer" si présent (page de consignes)
 * @param {import('playwright').Page} page - La page Playwright
 */
export async function clickStartButtonIfPresent(page) {
    try {
        const startBtn = await page.$('[data-testid="start-activity-button"]');
        const startBtnAlt = await page.$('button:has-text("Démarrer")');
        if (startBtn) {
            await startBtn.click();
            console.log('✓ Bouton "Démarrer" cliqué');
            // Attendre que la page de l'exercice se charge
            await page.waitForTimeout(1000);
        } else if (startBtnAlt) {
            await startBtnAlt.click();
            console.log('✓ Bouton "Démarrer" cliqué');
            // Attendre que la page de l'exercice se charge
            await page.waitForTimeout(1000);
        }
    } catch (e) {
        // Pas de bouton Démarrer, on continue
    }
}
