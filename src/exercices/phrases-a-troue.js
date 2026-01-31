/**
 * Résout un exercice de type "Phrases à trous" (Reading Partie 5)
 * @param {import('playwright').Page} page - La page Playwright
 * @returns {Promise<Object>} Les données de l'exercice (questions, réponses)
 */
export async function solvePhrasesATrous(page) {
    // Vérifier si on est sur une page de consignes avec bouton "Démarrer"
    await clickStartButtonIfPresent(page);

    // Attendre que la page soit chargée
    await page.waitForSelector('[data-testid^="question-"]', { timeout: 10000 });

    // Récupérer les questions et leurs réponses
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

            // Numéro de la question (ex: "Question 1")
            const numeroElement = questionEl.querySelector('.font-bold.text-size-20');
            questionData.numero = numeroElement?.textContent?.trim() || `Question ${index + 1}`;

            // Texte de la question (phrase avec le trou)
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
                            lettre = allSpans[0]?.textContent?.trim() || '';
                            texte = allSpans[1]?.textContent?.trim() || '';
                        } else if (allSpans.length === 1) {
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
    const selector = `[data-testid="question-${questionIndex}"] [data-testid="exam-answer-${answerIndex + 1}"]`;
    await page.click(selector);
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
    const finishBtn = await page.$('button:has-text("Terminer")');
    const validateBtn = await page.$('button:has-text("Valider")');

    if (finishBtn) {
        await finishBtn.click();
        console.log('✓ Exercice terminé');
        await page.waitForTimeout(1000);
    } else if (validateBtn) {
        await validateBtn.click();
        console.log('✓ Réponses validées');
        await page.waitForTimeout(1000);
    } else {
        console.error('✗ Bouton Valider/Terminer non trouvé');
    }
}

/**
 * Vérifie si on est sur une page d'exercice phrases à trous
 * @param {import('playwright').Page} page - La page Playwright
 * @returns {Promise<boolean>}
 */
export async function isPhrasesATrousExercise(page) {
    const hasQuestions = await page.$('[data-testid^="question-"]');
    const hasNoTranscription = !(await page.$('button:has-text("Transcription")'));
    const isReading = await page.evaluate(() => {
        const sectionImg = document.querySelector('img[src*="reading"]');
        return !!sectionImg;
    });
    return !!(hasQuestions && hasNoTranscription && isReading);
}

/**
 * Récupère le nombre de questions restantes et le total
 * @param {import('playwright').Page} page - La page Playwright
 * @returns {Promise<{current: number, total: number}>}
 */
export async function getProgress(page) {
    const progressText = await page.evaluate(() => {
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
            await page.waitForTimeout(1000);
        } else if (startBtnAlt) {
            await startBtnAlt.click();
            console.log('✓ Bouton "Démarrer" cliqué');
            await page.waitForTimeout(1000);
        }
    } catch (e) {
        // Pas de bouton Démarrer, on continue
    }
}
