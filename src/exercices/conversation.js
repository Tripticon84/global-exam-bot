/**
 * Résout un exercice de type "Conversation" (Listening Partie 3)
 * @param {import('playwright').Page} page - La page Playwright
 * @param {{ extractTranscription?: boolean }} [options] - Options de résolution
 * @returns {Promise<Object>} Les données de l'exercice (transcription, questions, réponses)
 */
export async function solveConversation(page, options = {}) {
    const shouldExtractTranscription = options.extractTranscription !== false;

    // Vérifier si on est sur une page de consignes avec bouton "Démarrer"
    await clickStartButtonIfPresent(page);

    // Attendre que la page soit chargée
    await page.waitForSelector('[data-testid^="question-"], #question-wrapper', { timeout: 15000 });

    let transcription = '';

    if (shouldExtractTranscription) {

        // 1. Snapshot du texte visible AVANT ouverture transcript (pour comparaison)
        const baselineTextsByFrame = new Map();
        for (const frame of page.frames()) {
            try {
                const texts = await frame.evaluate(() => {
                    const isVisible = (el) => {
                        if (!el) return false;
                        const style = window.getComputedStyle(el);
                        const rect = el.getBoundingClientRect();
                        return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
                    };

                    const clean = (value) => (value || '').replace(/\s+/g, ' ').trim();
                    const nodes = document.querySelectorAll('p, div, span, article, section, li');
                    const result = [];

                    nodes.forEach((node) => {
                        if (!isVisible(node)) return;
                        const text = clean(node.textContent || '');
                        if (text.length >= 40 && text.length <= 4000) {
                            result.push(text);
                        }
                    });

                    return Array.from(new Set(result));
                });

                baselineTextsByFrame.set(frame, new Set(texts));
            } catch {
                baselineTextsByFrame.set(frame, new Set());
            }
        }

        const transcriptResponsePromise = page.waitForResponse((response) => {
            try {
                if (!response.ok()) return false;
                const url = response.url().toLowerCase();
                const contentType = (response.headers()['content-type'] || '').toLowerCase();
                const isCandidateUrl = /(transcript|support|activity|question|media|user-activit)/.test(url);
                const isReadableType = /(json|text|javascript|html)/.test(contentType);
                return isCandidateUrl && isReadableType;
            } catch {
                return false;
            }
        }, { timeout: 7000 }).catch(() => null);

        // 2. Cliquer sur le bouton Transcription
        const transcriptionBtn = page.locator('button').filter({ hasText: /Transcription|Transcript|Voir le transcript/i }).first();
        if (await transcriptionBtn.count()) {
            await transcriptionBtn.click();
            console.log('✓ Bouton Transcription cliqué');

            // Attendre que la popup s'ouvre
            try {
                await page.waitForSelector('.wysiwyg.wysiwyg-spacing, [data-testid="transcript-content"], [role="dialog"], [data-testid*="transcript"]', { timeout: 7000 });
                await page.waitForTimeout(300);
            } catch {
                // Certaines interfaces affichent le transcript inline
                await page.waitForTimeout(800);
            }
        } else {
            console.log('⚠️ Bouton Transcription non trouvé');
        }

        // 3. Récupérer la transcription (DOM connu + fallback delta de texte + fallback réseau, multi-frame)
        let transcriptionResult = { text: '', source: 'none' };

        const transcriptResponse = await transcriptResponsePromise;
        if (transcriptResponse) {
            try {
                const payloadText = await transcriptResponse.text();

                const htmlToText = (value) => (value || '')
                    .replace(/<[^>]*>/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();

                const collectStrings = (input, out = []) => {
                    if (typeof input === 'string') {
                        const text = htmlToText(input);
                        if (text.length >= 40) out.push(text);
                        return out;
                    }
                    if (Array.isArray(input)) {
                        input.forEach((item) => collectStrings(item, out));
                        return out;
                    }
                    if (input && typeof input === 'object') {
                        Object.entries(input).forEach(([key, value]) => {
                            if (typeof value === 'string') {
                                const cleaned = htmlToText(value);
                                if (cleaned.length >= 40 && /(transcript|script|text|content|dialog|modal)/i.test(key)) {
                                    out.push(cleaned);
                                }
                            }
                            collectStrings(value, out);
                        });
                    }
                    return out;
                };

                let candidates = [];
                try {
                    const parsed = JSON.parse(payloadText);
                    candidates = collectStrings(parsed);
                } catch {
                    candidates = collectStrings(payloadText);
                }

                if (candidates.length) {
                    candidates = Array.from(new Set(candidates));
                    candidates.sort((a, b) => b.length - a.length);
                    const best = candidates[0];
                    if (best && best.length > transcriptionResult.text.length) {
                        transcriptionResult = {
                            text: best,
                            source: `network:${transcriptResponse.url()}`
                        };
                    }
                }
            } catch {
                // ignore parsing errors
            }
        }

        for (const frame of page.frames()) {
            try {
                const bySelectors = await frame.evaluate(() => {
                    const isVisible = (el) => {
                        if (!el) return false;
                        const style = window.getComputedStyle(el);
                        const rect = el.getBoundingClientRect();
                        return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
                    };

                    const extractCleanText = (el) => {
                        if (!el) return '';
                        const clone = el.cloneNode(true);
                        clone.querySelectorAll('button, svg, path, [aria-hidden="true"]').forEach((node) => node.remove());
                        return (clone.textContent || '').replace(/\s+/g, ' ').trim();
                    };

                    const selectors = [
                        '[data-testid="transcript-content"]',
                        '.wysiwyg.wysiwyg-spacing',
                        '[role="dialog"] .wysiwyg',
                        '[data-testid*="transcript"]',
                        '[class*="transcript"]',
                        '[role="dialog"]',
                        '[aria-modal="true"]'
                    ];

                    const matches = [];
                    for (const selector of selectors) {
                        const elements = document.querySelectorAll(selector);
                        elements.forEach((el) => {
                            if (!isVisible(el)) return;
                            const text = extractCleanText(el);
                            if (text.length >= 40) {
                                matches.push({ text, source: selector });
                            }
                        });
                    }

                    if (!matches.length) return { text: '', source: 'none' };
                    matches.sort((a, b) => b.text.length - a.text.length);
                    return matches[0];
                });

                if (bySelectors.text && bySelectors.text.length > transcriptionResult.text.length) {
                    transcriptionResult = bySelectors;
                }
            } catch {
                // ignore frame inaccessible
            }
        }

        if (!transcriptionResult.text) {
            for (const frame of page.frames()) {
                try {
                    const before = baselineTextsByFrame.get(frame) || new Set();
                    const byDelta = await frame.evaluate((beforeArray) => {
                        const beforeSet = new Set(beforeArray);
                        const isVisible = (el) => {
                            if (!el) return false;
                            const style = window.getComputedStyle(el);
                            const rect = el.getBoundingClientRect();
                            return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
                        };

                        const clean = (value) => (value || '').replace(/\s+/g, ' ').trim();
                        const nodes = document.querySelectorAll('p, div, span, article, section, li');
                        const candidates = [];

                        nodes.forEach((node) => {
                            if (!isVisible(node)) return;
                            const text = clean(node.textContent || '');
                            if (text.length >= 40 && text.length <= 4000 && !beforeSet.has(text)) {
                                candidates.push(text);
                            }
                        });

                        if (!candidates.length) return { text: '', source: 'delta:none' };
                        candidates.sort((a, b) => b.length - a.length);
                        return { text: candidates[0], source: 'delta:text-visible' };
                    }, Array.from(before));

                    if (byDelta.text && byDelta.text.length > transcriptionResult.text.length) {
                        transcriptionResult = byDelta;
                    }
                } catch {
                    // ignore frame inaccessible
                }
            }
        }

        transcription = transcriptionResult.text;
        if (transcription) {
            console.log(`✓ Transcription récupérée (${transcription.length} caractères, source: ${transcriptionResult.source})`);
        } else {
            console.log('⚠️ Transcription vide: aucun contenu texte détecté dans la popup/zone transcript');
        }

        // 3. Fermer la popup
        const closeSelector = 'button[data-testid="close-modal"], button[aria-label*="Fermer" i], button[aria-label*="Close" i], button.absolute.top-0.right-0';
        const modalCloseBtn = page.locator(`[role="dialog"] ${closeSelector}, [data-testid="modal"] ${closeSelector}`).first();

        let popupClosed = false;

        if (await modalCloseBtn.count()) {
            try {
                await modalCloseBtn.click({ force: true, timeout: 5000 });
                popupClosed = true;
            } catch {
                // fallback ci-dessous
            }
        }

        if (!popupClosed) {
            popupClosed = await page.evaluate((selector) => {
                const btn = document.querySelector(selector);
                if (!btn) return false;
                btn.click();
                return true;
            }, closeSelector).catch(() => false);
        }

        if (!popupClosed) {
            await page.keyboard.press('Escape').catch(() => { });
        }

        console.log('✓ Popup fermée');
        await page.waitForTimeout(500);
    } else {
        console.log('ℹ️ Mode sans transcription activé');
    }

    // 4. Récupérer les questions et leurs réponses
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

            // Numéro de la question (ex: "Question 28")
            const numeroElement = questionEl.querySelector('[data-testid="question-number"], #question-header > span, #question-header span, .font-bold.text-size-20');
            questionData.numero = numeroElement?.textContent?.trim() || `Question ${index + 1}`;

            // Texte de la question
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

async function safeWaitForTimeout(page, timeoutMs, label) {
    if (!page || page.isClosed()) {
        console.log(`⚠ Attente ignorée${label ? ` (${label})` : ''}: page fermée`);
        return;
    }

    try {
        await page.waitForTimeout(timeoutMs);
    } catch (error) {
        const message = error && error.message ? error.message : '';
        if (message.includes('Target page') || message.includes('has been closed')) {
            console.log(`⚠ Attente interrompue${label ? ` (${label})` : ''}: page fermée`);
            return;
        }
        throw error;
    }
}

/**
 * Clique sur le bouton Valider pour soumettre les réponses
 * @param {import('playwright').Page} page - La page Playwright
 */
export async function validateAnswers(page) {
    const validateSelector = 'button:has-text("Valider"), button:has-text("Suivant"), button:has-text("Continuer"), button:has-text("Confirm"), button:has-text("Next")';
    const finishSelector = 'button:has-text("Terminer"), button:has-text("Finish")';

    const FinishBtn = await page.$(finishSelector);
    if (FinishBtn) {
        await FinishBtn.click();
        console.log('✓ Exercice terminé');
        // Attendre que la page de résumé s'affiche
        await safeWaitForTimeout(page, 1000, 'resume');
        return;
    }

    const validateBtn = await page.$(validateSelector);
    if (validateBtn) {
        await validateBtn.click();
        console.log('✓ Réponses validées / Suivant');
        // Attendre que les nouvelles questions se chargent
        await safeWaitForTimeout(page, 1000, 'validation');
    } else {
        console.error('✗ Bouton Valider/Suivant non trouvé');
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
    const hasQuestions = await page.$('[data-testid^="question-"], #question-wrapper');
    const hasTranscription = await page.$('button:has-text("Transcription"), button:has-text("Transcript"), button:has-text("Voir le transcript")');
    return !!(hasQuestions && hasTranscription);
}

/**
 * Récupère le nombre de questions restantes et le total
 * @param {import('playwright').Page} page - La page Playwright
 * @returns {Promise<{current: number, total: number}>}
 */
export async function getProgress(page) {
    // Vérifier d'abord si on est sur la page de résultat
    const currentUrl = page.url();
    if (currentUrl.includes('/result')) {
        return { current: 0, total: 0, isResultPage: true };
    }

    const progressText = await page.evaluate(() => {
        // Chercher le texte type "27/39" dans l'élément dédié
        const exact = document.querySelector('.text-size-12.text-primary-80')?.textContent?.trim();
        if (exact && /(\d+)\/(\d+)/.test(exact)) return exact;

        // Fallback: chercher uniquement dans les éléments visibles de petite taille (pas les scripts/json)
        const candidates = Array.from(document.querySelectorAll('p, span'))
            .filter(el => {
                const rect = el.getBoundingClientRect();
                const style = window.getComputedStyle(el);
                return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
            })
            .map(el => el.textContent?.trim() || '')
            .filter(txt => {
                if (!txt || txt.length > 20) return false; // Le texte de progression est court
                const m = txt.match(/(\d+)\/(\d+)/);
                if (!m) return false;
                const total = parseInt(m[2]);
                return total > 0 && total <= 200; // Limiter à des valeurs raisonnables
            });

        return candidates[0] || '';
    });

    const match = progressText.match(/(\d+)\/(\d+)/);
    if (match) {
        return {
            current: parseInt(match[1]),
            total: parseInt(match[2]),
            isResultPage: false
        };
    }

    return { current: 0, total: 0, isResultPage: false };
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
        // Chercher le texte avec le format "00:00 / XX:XX"
        const direct = document.querySelector('.w-24.shrink-0.text-size-14, p.shrink-0.font-normal.leading-4.text-14');
        if (direct) {
            const text = direct.textContent?.trim() || '';
            const match = text.match(/\/\s*(\d{1,2}):(\d{2})/);
            if (match) {
                return `${match[1]}:${match[2]}`;
            }
        }

        const allTexts = Array.from(document.querySelectorAll('p, span, div'))
            .map((el) => el.textContent?.trim() || '');
        const found = allTexts.find((txt) => /\d{1,2}:\d{2}\s*\/\s*\d{1,2}:\d{2}/.test(txt));
        if (!found) return '';
        const match = found.match(/\/\s*(\d{1,2}):(\d{2})/);
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

    if (!page || page.isClosed()) {
        console.log('⚠ Attente ignorée: page fermée');
        return;
    }

    const audioDuration = await getAudioDuration(page);
    const baseTimer = Number.isFinite(parseInt(process.env.WAIT_BASE_TIMER, 10))
        ? parseInt(process.env.WAIT_BASE_TIMER, 10)
        : 15000;
    const extraTime = Math.floor(Math.random() * (maxExtra - minExtra + 1)) + minExtra;
    const effectiveAudioTime = audioDuration > 0 ? audioDuration : baseTimer;
    const totalWait = effectiveAudioTime + extraTime;

    if (audioDuration > 0) {
        console.log(`⏳ Attente: ${audioDuration}ms (audio) + ${extraTime}ms (aléatoire) = ${totalWait}ms (${(totalWait / 1000).toFixed(1)}s)`);
    } else {
        console.log(`⏳ Pas d'audio détecté: ${baseTimer}ms (WAIT_BASE_TIMER) + ${extraTime}ms (aléatoire) = ${totalWait}ms (${(totalWait / 1000).toFixed(1)}s)`);
    }

    await safeWaitForTimeout(page, totalWait, 'audio');
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
