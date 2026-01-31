/**
 * Résout un exercice de type "Textes à compléter" (Reading Partie 6)
 * @param {import('playwright').Page} page - La page Playwright
 * @returns {Promise<Object>} Les données de l'exercice (texte, questions, réponses)
 */
export async function solveTextesACompleter(page) {
    // Vérifier si on est sur une page de consignes avec bouton "Démarrer"
    await clickStartButtonIfPresent(page);

    // Attendre que la page soit chargée
    await page.waitForSelector('[data-testid^="question-"]', { timeout: 10000 });

    // Récupérer le texte support
    const texteSupport = await page.evaluate(() => {
        const supportElement = document.querySelector('#supports .wysiwyg');
        return supportElement?.innerText?.trim() || '';
    });

    console.log('✓ Texte support récupéré');
    console.log('\n📄 Texte:');
    console.log(texteSupport);

    // Récupérer la question visible actuelle et ses réponses
    const questionData = await getCurrentQuestion(page);

    return {
        texte: texteSupport,
        question: questionData
    };
}

/**
 * Récupère la question actuellement visible
 * @param {import('playwright').Page} page - La page Playwright
 * @returns {Promise<Object>} Les données de la question courante
 */
export async function getCurrentQuestion(page) {
    const questionData = await page.evaluate(() => {
        // Trouver la question visible (celle qui n'a pas la classe "hidden")
        const allQuestions = document.querySelectorAll('[data-testid^="question-"]');
        let visibleQuestion = null;
        let visibleIndex = -1;

        for (let i = 0; i < allQuestions.length; i++) {
            if (!allQuestions[i].classList.contains('hidden')) {
                visibleQuestion = allQuestions[i];
                visibleIndex = i;
                break;
            }
        }

        if (!visibleQuestion) {
            return null;
        }

        const data = {
            index: visibleIndex,
            numero: '',
            texte: '',
            reponses: []
        };

        // Numéro de la question
        const numeroElement = visibleQuestion.querySelector('.font-bold.text-size-20');
        data.numero = numeroElement?.textContent?.trim() || `Question ${visibleIndex + 1}`;

        // Texte de la question
        const texteElement = visibleQuestion.querySelector('.text-neutral-80.leading-tight.mb-8 p, .text-neutral-80.leading-tight.mb-8');
        data.texte = texteElement?.innerText?.trim() || '';

        // Réponses possibles
        const answerLabels = visibleQuestion.querySelectorAll('[data-testid^="exam-answer-"]');
        answerLabels.forEach((label, answerIndex) => {
            const input = label.querySelector('input[type="radio"]');

            let lettre = '';
            let texte = '';

            // Méthode 1: chercher les spans dans .text-neutral-80
            const textSpans = label.querySelectorAll('.text-neutral-80 span');
            if (textSpans.length >= 2) {
                lettre = textSpans[0]?.textContent?.trim() || '';
                texte = textSpans[1]?.textContent?.trim() || '';
            }

            // Méthode 2: chercher dans .flex
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

            // Méthode 3: parser tout le texte du label
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

            if (!lettre) {
                lettre = ['A.', 'B.', 'C.', 'D.'][answerIndex] || '';
            }

            data.reponses.push({
                index: answerIndex,
                lettre: lettre,
                texte: texte,
                value: input?.value || '',
                selector: `[data-testid="question-${visibleIndex}"] [data-testid="exam-answer-${answerIndex + 1}"]`
            });
        });

        return data;
    });

    if (questionData) {
        console.log(`\n${questionData.numero}: ${questionData.texte}`);
        questionData.reponses.forEach(r => {
            console.log(`  ${r.lettre} ${r.texte}`);
        });
    }

    return questionData;
}

/**
 * Sélectionne une réponse pour la question visible
 * @param {import('playwright').Page} page - La page Playwright
 * @param {number} answerIndex - L'index de la réponse (0-based, 0=A, 1=B, 2=C, 3=D)
 */
export async function selectAnswer(page, answerIndex) {
    // Trouver la question visible
    const visibleQuestionIndex = await page.evaluate(() => {
        const allQuestions = document.querySelectorAll('[data-testid^="question-"]');
        for (let i = 0; i < allQuestions.length; i++) {
            if (!allQuestions[i].classList.contains('hidden')) {
                return i;
            }
        }
        return 0;
    });

    const selector = `[data-testid="question-${visibleQuestionIndex}"] [data-testid="exam-answer-${answerIndex + 1}"]`;
    await page.click(selector);
    console.log(`✓ Réponse ${answerIndex + 1} sélectionnée pour la question ${visibleQuestionIndex + 1}`);
}

/**
 * Sélectionne une réponse par sa lettre (A, B, C, D)
 * @param {import('playwright').Page} page - La page Playwright
 * @param {string} letter - La lettre de la réponse (A, B, C ou D)
 */
export async function selectAnswerByLetter(page, letter) {
    const letterIndex = ['A', 'B', 'C', 'D'].indexOf(letter.toUpperCase());
    if (letterIndex === -1) {
        throw new Error(`Lettre invalide: ${letter}. Utilisez A, B, C ou D.`);
    }
    await selectAnswer(page, letterIndex);
}

/**
 * Clique sur le bouton suivant (Passer/Valider/Terminer)
 * @param {import('playwright').Page} page - La page Playwright
 */
export async function clickNextButton(page) {
    // Chercher les différents boutons possibles
    const finishBtn = await page.$('button:has-text("Terminer")');
    const validateBtn = await page.$('button:has-text("Valider")');
    const skipBtn = await page.$('button:has-text("Passer")');
    const nextBtn = await page.$('button:has-text("Suivant")');

    if (finishBtn) {
        await finishBtn.click();
        console.log('✓ Exercice terminé');
        await page.waitForTimeout(1000);
        return 'finish';
    } else if (validateBtn) {
        await validateBtn.click();
        console.log('✓ Réponse validée');
        await page.waitForTimeout(1000);
        return 'validate';
    } else if (nextBtn) {
        await nextBtn.click();
        console.log('✓ Question suivante');
        await page.waitForTimeout(1000);
        return 'next';
    } else if (skipBtn) {
        await skipBtn.click();
        console.log('✓ Question passée');
        await page.waitForTimeout(1000);
        return 'skip';
    } else {
        console.error('✗ Aucun bouton de navigation trouvé');
        return null;
    }
}

/**
 * Récupère le nombre de questions et la progression
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

/**
 * Vérifie si on est sur une page d'exercice textes à compléter
 * @param {import('playwright').Page} page - La page Playwright
 * @returns {Promise<boolean>}
 */
export async function isTextesACompleterExercise(page) {
    const hasQuestions = await page.$('[data-testid^="question-"]');
    const hasSupports = await page.$('#supports');
    const isReading = await page.evaluate(() => {
        const sectionImg = document.querySelector('img[src*="reading"]');
        return !!sectionImg;
    });
    return !!(hasQuestions && hasSupports && isReading);
}
