import { extractProgress, extractQuestionsFromPage, getSectionKind } from './dom-parsers.js';

function cleanText(value) {
    return (value || '').replace(/\s+/g, ' ').trim();
}

function toAnswerLetter(index) {
    return `${['A', 'B', 'C', 'D'][index] || 'A'}.`;
}

function parseAnswerText(raw, index) {
    const text = cleanText(raw);
    const match = text.match(/^([A-D])[.)]?\s*(.*)$/i);
    if (match) {
        return {
            lettre: `${match[1].toUpperCase()}.`,
            texte: cleanText(match[2])
        };
    }

    return {
        lettre: toAnswerLetter(index),
        texte: text
    };
}

function collapseRepeatedHalf(text) {
    const normalized = cleanText(text);
    if (!normalized) return '';

    const middle = Math.floor(normalized.length / 2);
    const left = cleanText(normalized.slice(0, middle));
    const right = cleanText(normalized.slice(middle));

    if (left && right && left === right) {
        return left;
    }

    return normalized;
}

function sanitizeSupportText(rawSupport, questionData) {
    if (!rawSupport) return '';

    let text = collapseRepeatedHalf(rawSupport)
        .replace(/\bZoomer\b/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    if (!text) return '';

    if (questionData?.texte) {
        const escapedQuestion = questionData.texte.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        text = text.replace(new RegExp(escapedQuestion, 'gi'), ' ').replace(/\s+/g, ' ').trim();
    }

    if (Array.isArray(questionData?.reponses)) {
        for (const answer of questionData.reponses) {
            const answerText = cleanText(answer?.texte);
            if (!answerText) continue;
            const escapedAnswer = answerText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            text = text.replace(new RegExp(escapedAnswer, 'gi'), ' ').replace(/\s+/g, ' ').trim();
        }
    }

    return text;
}

async function extractSupportText(page) {
    return page.evaluate(() => {
        const isVisible = (el) => {
            if (!el) return false;
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
        };

        const clean = (value) => (value || '').replace(/\s+/g, ' ').trim();

        const extractFrom = (node) => {
            if (!node || !isVisible(node)) return '';

            const clone = node.cloneNode(true);
            clone.querySelectorAll('#question-wrapper, button, input, label, svg, path, img, [aria-hidden="true"]').forEach((el) => el.remove());
            return clean(clone.innerText || clone.textContent || '');
        };

        const candidates = [
            document.querySelector('#supports .wysiwyg'),
            document.querySelector('#supports'),
            document.querySelector('#question-test > div:first-child .wysiwyg'),
            document.querySelector('#question-test > div:first-child .bullet-list'),
            document.querySelector('#question-test > div:first-child')
        ];

        let best = '';
        for (const node of candidates) {
            const text = extractFrom(node);
            if (text.length > best.length) best = text;
        }

        return best;
    }).catch(() => '');
}

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

    // Récupérer la question visible actuelle et ses réponses
    const questionData = await getCurrentQuestion(page);

    const rawSupport = await extractSupportText(page);
    const texteSupport = sanitizeSupportText(rawSupport, questionData);

    console.log('✓ Texte support récupéré');
    console.log('\n📄 Texte:');
    console.log(texteSupport || '(texte support non détecté)');

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
        const isVisible = (el) => {
            if (!el) return false;
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
        };

        const clean = (value) => (value || '').replace(/\s+/g, ' ').trim();
        const wrapper = document.querySelector('#question-wrapper');
        if (!wrapper || !isVisible(wrapper)) {
            return null;
        }

        const questionText = clean(
            wrapper.querySelector('#question-header h2')?.innerText
            || wrapper.querySelector('#question-header p')?.innerText
            || wrapper.querySelector('h2, p')?.innerText
            || ''
        );

        const labels = Array.from(wrapper.querySelectorAll('#question-content label[for], #question-content label'))
            .filter((label) => isVisible(label));

        const uniqueLabels = [];
        const seen = new Set();
        labels.forEach((label) => {
            const key = `${label.getAttribute('for') || ''}|${clean(label.innerText || label.textContent || '')}`;
            if (!seen.has(key)) {
                seen.add(key);
                uniqueLabels.push(label);
            }
        });

        const reponses = uniqueLabels.map((label, index) => {
            const chunks = Array.from(label.querySelectorAll('span'))
                .map((node) => clean(node.textContent || ''))
                .filter(Boolean);

            const longestChunk = chunks.sort((a, b) => b.length - a.length)[0] || '';
            const text = longestChunk || clean(label.innerText || label.textContent || '');
            const forId = label.getAttribute('for');

            return {
                index,
                texte: text,
                selector: forId ? `label[for="${forId}"]` : '',
                value: forId ? (document.getElementById(forId)?.value || '') : ''
            };
        });

        return {
            index: 0,
            numero: 'Question 1',
            texte: questionText,
            reponses
        };
    });

    let normalizedQuestion = questionData;
    if (!normalizedQuestion) {
        const [fallbackQuestion] = await extractQuestionsFromPage(page, { visibleOnly: true });
        normalizedQuestion = fallbackQuestion;
    }

    if (normalizedQuestion) {
        normalizedQuestion.reponses = (normalizedQuestion.reponses || []).map((answer, index) => {
            const parsed = parseAnswerText(answer?.texte || '', index);
            return {
                ...answer,
                lettre: answer?.lettre || parsed.lettre,
                texte: parsed.texte
            };
        });

        console.log(`\n${normalizedQuestion.numero}: ${normalizedQuestion.texte}`);
        normalizedQuestion.reponses.forEach(r => {
            console.log(`  ${r.lettre} ${r.texte}`);
        });
    }

    return normalizedQuestion;
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
