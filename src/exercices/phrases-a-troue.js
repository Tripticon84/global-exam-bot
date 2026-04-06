/**
 * Résout un exercice de type "Phrases à trous" (Reading Partie 5)
 * @param {import('playwright').Page} page - La page Playwright
 * @returns {Promise<Object>} Les données de l'exercice (questions, réponses)
 */
export async function solvePhrasesATrous(page) {
    // Vérifier si on est sur une page de consignes avec bouton "Démarrer"
    await clickStartButtonIfPresent(page);

    // Attendre que la page soit chargée
    await page.waitForSelector('[data-testid^="question-"], #question-wrapper', { timeout: 10000 });

    // Récupérer les questions et leurs réponses
    const questionsData = await page.evaluate(() => {
        const questions = [];
        const questionElements = document.querySelectorAll('[data-testid^="question-"], #question-wrapper');

        questionElements.forEach((questionEl, index) => {
            const questionData = {
                index: index,
                numero: '',
                texte: '',
                reponses: []
            };

            // Numéro de la question (ex: "Question 1")
            const numeroElement = questionEl.querySelector('[data-testid="question-number"], #question-header > span, #question-header span, .font-bold.text-size-20');
            questionData.numero = numeroElement?.textContent?.trim() || `Question ${index + 1}`;

            // Texte de la question (phrase avec le trou)
            const texteElement = questionEl.querySelector('[data-testid="question-text"], #question-header h2, #question-header p, .text-neutral-80.leading-tight.mb-8 p, .text-neutral-80.leading-tight.mb-8');
            questionData.texte = texteElement?.innerText?.trim() || '';

            // Réponses possibles
            const answerLabels = questionEl.querySelectorAll('[data-testid^="exam-answer-"], #question-content label[for], #question-content label, label[for^="radio-"]');
            answerLabels.forEach((label, answerIndex) => {
                const labelElement = label.matches('label') ? label : (label.querySelector('label') || label);
                const labelFor = labelElement.getAttribute('for');
                const input = labelFor
                    ? document.getElementById(labelFor)
                    : labelElement.querySelector('input[type="radio"]');

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
                    const fullText = labelElement.textContent?.trim() || '';
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
                    selector: labelFor
                        ? `label[for="${labelFor}"]`
                        : `[data-testid="question-${index}"] [data-testid="exam-answer-${answerIndex + 1}"]`
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
    // Priorité au format historique data-testid
    const questionSelector = `[data-testid="question-${questionIndex}"]`;
    const questionElement = await page.$(questionSelector);
    if (questionElement) {
        const selector = `[data-testid="question-${questionIndex}"] [data-testid="exam-answer-${answerIndex + 1}"]`;
        const element = await page.$(selector);
        if (element) {
            await page.click(selector, { timeout: 5000 });
            console.log(`✓ Réponse ${answerIndex + 1} sélectionnée pour la question ${questionIndex + 1}`);
            return;
        }

        const availableAnswers = await page.$$(`[data-testid="question-${questionIndex}"] [data-testid^="exam-answer-"]`);
        const numAnswers = availableAnswers.length;
        if (numAnswers > 0) {
            const fallbackIndex = Math.floor(Math.random() * numAnswers);
            const fallbackSelector = `[data-testid="question-${questionIndex}"] [data-testid="exam-answer-${fallbackIndex + 1}"]`;
            await page.click(fallbackSelector, { timeout: 5000 });
            console.log(`⚠️ Réponse ${answerIndex + 1} non trouvée, fallback sur réponse ${fallbackIndex + 1} pour la question ${questionIndex + 1}`);
            return;
        }
    }

    // Fallback pour le nouveau DOM (question-wrapper + labels radio)
    const questionWrappers = page.locator('#question-wrapper');
    const questionCount = await questionWrappers.count();
    if (questionCount === 0 || questionIndex >= questionCount) {
        console.log(`⚠️ Question ${questionIndex + 1} non trouvée sur la page, ignorée`);
        return;
    }

    const currentQuestion = questionWrappers.nth(questionIndex);
    const answerLabels = currentQuestion.locator('#question-content label[for], #question-content label, label[for^="radio-"]');
    const numAnswers = await answerLabels.count();
    if (numAnswers === 0) {
        console.log(`⚠️ Aucune réponse trouvée pour la question ${questionIndex + 1}, ignorée`);
        return;
    }

    const safeIndex = answerIndex < numAnswers ? answerIndex : Math.floor(Math.random() * numAnswers);
    const answerLabel = answerLabels.nth(safeIndex);
    await answerLabel.scrollIntoViewIfNeeded();

    const escapeCssId = (value) => value.replace(/([ #;?%&,.+*~\':"!^$\[\]()=>|/@])/g, '\\$1');

    try {
        await answerLabel.click({ timeout: 5000 });
    } catch (error) {
        const forId = await answerLabel.getAttribute('for');
        if (forId) {
            const inputSelector = `#${escapeCssId(forId)}`;
            const input = currentQuestion.locator(inputSelector);
            await input.scrollIntoViewIfNeeded();

            try {
                const linkedLabel = currentQuestion.locator(`label[for="${forId}"]`);
                await linkedLabel.click({ timeout: 5000, force: true });
            } catch (labelError) {
                // Fall back to direct input interaction when label click fails.
                await input.click({ timeout: 5000, force: true });
            }

            const isChecked = await input.isChecked().catch(() => false);
            if (!isChecked) {
                await input.evaluate((element) => {
                    element.checked = true;
                    element.dispatchEvent(new Event('input', { bubbles: true }));
                    element.dispatchEvent(new Event('change', { bubbles: true }));
                });
            }
        } else {
            await answerLabel.click({ timeout: 5000, force: true });
        }
    }
    if (safeIndex !== answerIndex) {
        console.log(`⚠️ Réponse ${answerIndex + 1} non trouvée, fallback sur réponse ${safeIndex + 1} pour la question ${questionIndex + 1}`);
    } else {
        console.log(`✓ Réponse ${answerIndex + 1} sélectionnée pour la question ${questionIndex + 1}`);
    }
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
    const validateBtn = await page.$('button:has-text("Valider"), button:has-text("Suivant"), button:has-text("Continuer")');

    if (finishBtn) {
        await finishBtn.click();
        console.log('✓ Exercice terminé');
        await page.waitForTimeout(1000);
    } else if (validateBtn) {
        await validateBtn.click();
        console.log('✓ Réponses validées / Suivant');
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
    const hasQuestions = await page.$('[data-testid^="question-"], #question-wrapper');
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
