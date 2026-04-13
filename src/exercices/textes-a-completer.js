import { extractProgress, extractQuestionsFromPage, getSectionKind } from './dom-parsers.js';

/**
 * Résout un exercice de type "Textes à compléter" (Reading Partie 6)
 * @param {import('playwright').Page} page - La page Playwright
 * @returns {Promise<Object>} Les données de l'exercice (texte, questions, réponses)
 */
export async function solveTextesACompleter(page) {
    // Vérifier si on est sur une page de consignes avec bouton "Démarrer"
    await clickStartButtonIfPresent(page);

    // Attendre que la page soit chargée
    await page.waitForSelector('[data-testid^="question-"], #question-wrapper', { timeout: 15000 });

    // Récupérer le texte support
    const texteSupport = await page.evaluate(() => {
        const supportElement = document.querySelector('#supports .wysiwyg, #supports, #question-test > div:first-child .bullet-list, #question-test > div:first-child');
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
    const [questionData] = await extractQuestionsFromPage(page, { visibleOnly: true });

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
    const currentQuestion = page.locator('#question-wrapper, [data-testid^="question-"]').first();

    // Nouveau DOM: labels radio dans #question-content
    const labelOptions = currentQuestion.locator('#question-content label[for], #question-content label, label[for^="radio-"]');
    const labelCount = await labelOptions.count();
    if (labelCount > answerIndex) {
        await labelOptions.nth(answerIndex).click({ force: true });
        console.log(`✓ Réponse ${answerIndex + 1} sélectionnée`);
        return;
    }

    // Ancien DOM fallback
    const visibleQuestionIndex = await page.evaluate(() => {
        const allQuestions = document.querySelectorAll('[data-testid^="question-"]');
        for (let i = 0; i < allQuestions.length; i++) {
            if (!allQuestions[i].classList.contains('hidden')) return i;
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
    const progress = await extractProgress(page);
    return { current: progress.current, total: progress.total };
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
    const hasQuestions = await page.$('[data-testid^="question-"], #question-wrapper');
    const hasSupports = await page.$('#supports, #question-test .bullet-list');
    const isReading = (await getSectionKind(page)) === 'reading';
    return !!(hasQuestions && hasSupports && isReading);
}
