function toAsciiText(value) {
    return (value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

function cleanText(value) {
    return (value || '').replace(/\s+/g, ' ').trim();
}

function parseChoiceText(raw, index) {
    const text = cleanText(raw);
    const letterMatch = text.match(/^([A-D])[.)]?\s*(.*)$/i);

    if (letterMatch) {
        return {
            lettre: `${letterMatch[1].toUpperCase()}.`,
            texte: cleanText(letterMatch[2])
        };
    }

    return {
        lettre: `${['A', 'B', 'C', 'D'][index] || 'A'}.`,
        texte: text
    };
}

export async function getSectionKind(page) {
    return page.evaluate(() => {
        const textCandidates = Array.from(document.querySelectorAll('p, span'))
            .map((el) => (el.textContent || '').trim())
            .filter(Boolean);

        const sectionText = textCandidates.find((txt) => /section\s*:/i.test(txt)) || '';
        if (/listening/i.test(sectionText)) return 'listening';
        if (/reading/i.test(sectionText)) return 'reading';

        const readingImg = document.querySelector('img[src*="reading"]');
        if (readingImg) return 'reading';

        const listeningImg = document.querySelector('img[src*="listening"]');
        if (listeningImg) return 'listening';

        return 'unknown';
    }).catch(() => 'unknown');
}

export async function extractAudioDuration(page) {
    const payload = await page.evaluate(() => {
        const parseTime = (token) => {
            const parts = token.split(':').map((p) => parseInt(p, 10));
            if (parts.some((n) => !Number.isFinite(n))) return 0;
            if (parts.length === 2) return (parts[0] * 60 + parts[1]) * 1000;
            if (parts.length === 3) return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
            return 0;
        };

        const parseRange = (value) => {
            const match = value.match(/(\d{1,2}(?::\d{2}){1,2})\s*\/\s*(\d{1,2}(?::\d{2}){1,2})/);
            if (!match) return { totalMs: 0, totalText: '' };
            return { totalMs: parseTime(match[2]), totalText: match[2] };
        };

        const isVisible = (el) => {
            if (!el) return false;
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
        };

        const selectors = [
            'p.shrink-0.font-normal.leading-4.text-14',
            '[data-testid="timer"] span',
            '[data-testid="media-play"] ~ p',
            '[data-testid="media-play"]:not([hidden])'
        ];

        for (const selector of selectors) {
            const nodes = Array.from(document.querySelectorAll(selector));
            for (const node of nodes) {
                const text = (node.textContent || '').trim();
                const parsed = parseRange(text);
                if (parsed.totalMs > 0) {
                    return { durationMs: parsed.totalMs, durationText: parsed.totalText, source: `text:${selector}` };
                }
            }
        }

        const textNodes = Array.from(document.querySelectorAll('p, span, div'))
            .filter((el) => isVisible(el))
            .map((el) => (el.textContent || '').trim())
            .filter((txt) => txt.length > 0 && txt.length <= 30 && txt.includes('/'));

        for (const txt of textNodes) {
            const parsed = parseRange(txt);
            if (parsed.totalMs > 0) {
                return { durationMs: parsed.totalMs, durationText: parsed.totalText, source: 'text:global-scan' };
            }
        }

        const mediaProgress = document.querySelector('button[data-testid="media-play"]')
            ? document.querySelector('progress[max]')
            : null;
        if (mediaProgress) {
            const maxValue = parseFloat(mediaProgress.getAttribute('max') || '0');
            if (Number.isFinite(maxValue) && maxValue > 0) {
                const durationMs = Math.round(maxValue * 1000);
                return {
                    durationMs,
                    durationText: `${Math.floor(maxValue / 60)}:${String(Math.floor(maxValue % 60)).padStart(2, '0')}`,
                    source: 'progress:max'
                };
            }
        }

        const mediaElements = Array.from(document.querySelectorAll('audio, video'));
        const withDuration = mediaElements
            .map((el) => Number(el.duration || 0))
            .filter((d) => Number.isFinite(d) && d > 0);

        if (withDuration.length) {
            const best = Math.max(...withDuration);
            return {
                durationMs: Math.round(best * 1000),
                durationText: `${Math.floor(best / 60)}:${String(Math.floor(best % 60)).padStart(2, '0')}`,
                source: 'media:duration'
            };
        }

        return { durationMs: 0, durationText: '', source: 'none' };
    }).catch(() => ({ durationMs: 0, durationText: '', source: 'error' }));

    return {
        durationMs: Number(payload.durationMs) || 0,
        durationText: payload.durationText || '',
        source: payload.source || 'none'
    };
}

export async function extractProgress(page) {
    const payload = await page.evaluate(() => {
        const isVisible = (el) => {
            if (!el) return false;
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
        };

        const values = [];
        const pushMatch = (raw, source) => {
            if (!raw) return;
            const match = raw.replace(/\s+/g, '').match(/(\d+)\/(\d+)/);
            if (!match) return;
            const current = parseInt(match[1], 10);
            const total = parseInt(match[2], 10);
            if (!Number.isFinite(current) || !Number.isFinite(total) || total <= 0 || current > total || total > 200) return;
            values.push({ current, total, source, raw });
        };

        const fixedSelectors = [
            '.text-size-12.text-primary-80',
            '[id^="progressBarProgressLabel-"]',
            '[id^="progressBarTooltip-"]'
        ];

        fixedSelectors.forEach((selector) => {
            document.querySelectorAll(selector).forEach((el) => {
                if (!isVisible(el)) return;
                pushMatch((el.textContent || '').trim(), `selector:${selector}`);
            });
        });

        const progressBar = document.querySelector('[data-testid="progress-bar"]');
        if (progressBar) {
            progressBar.querySelectorAll('p, span').forEach((el) => {
                if (!isVisible(el)) return;
                pushMatch((el.textContent || '').trim(), 'progress-bar:text');
            });
        }

        if (!values.length) return { current: 0, total: 0, source: 'none' };
        values.sort((a, b) => b.total - a.total || b.current - a.current);
        return values[0];
    }).catch(() => ({ current: 0, total: 0, source: 'error' }));

    return {
        current: Number(payload.current) || 0,
        total: Number(payload.total) || 0,
        source: payload.source || 'none'
    };
}

export async function extractQuestionsFromPage(page, options = {}) {
    const payload = await page.evaluate((opts) => {
        const isVisible = (el) => {
            if (!el) return false;
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
        };

        const clean = (value) => (value || '').replace(/\s+/g, ' ').trim();

        const baseQuestionNodes = Array.from(document.querySelectorAll('[data-testid^="question-"]'));
        const wrapperNodes = Array.from(document.querySelectorAll('#question-wrapper'));

        let questionNodes = baseQuestionNodes.length ? baseQuestionNodes : wrapperNodes;
        if (opts.visibleOnly) {
            const visibleOnly = questionNodes.filter((el) => isVisible(el));
            if (visibleOnly.length) {
                questionNodes = visibleOnly;
            }
        }

        const deduped = [];
        questionNodes.forEach((node) => {
            if (deduped.includes(node)) return;
            if (deduped.some((existing) => existing.contains(node))) return;
            deduped.push(node);
        });

        const questions = [];

        deduped.forEach((questionEl, index) => {
            const numeroElement = questionEl.querySelector('[data-testid="question-number"], #question-header > span, #question-header span, .font-bold.text-size-20');
            const textElement = questionEl.querySelector('[data-testid="question-text"], #question-header h2, #question-header p, h2, p');

            const answerNodeCandidates = Array.from(questionEl.querySelectorAll('[data-testid^="exam-answer-"], #question-content label[for], #question-content label, label[for^="radio-"]'));
            const answerLabels = [];
            answerNodeCandidates.forEach((node) => {
                const label = node.matches('label') ? node : node.querySelector('label');
                if (!label) return;
                if (!answerLabels.includes(label)) answerLabels.push(label);
            });

            const reponses = answerLabels.map((label, answerIndex) => {
                const labelFor = label.getAttribute('for');
                const textCandidates = Array.from(label.querySelectorAll('span'))
                    .map((el) => clean(el.textContent || ''))
                    .filter(Boolean);

                let rawText = textCandidates.length
                    ? textCandidates.sort((a, b) => b.length - a.length)[0]
                    : clean(label.textContent || '');

                const match = rawText.match(/^([A-D])[.)]?\s*(.*)$/i);
                let lettre = `${['A', 'B', 'C', 'D'][answerIndex] || 'A'}.`;
                let texte = rawText;

                if (match) {
                    lettre = `${match[1].toUpperCase()}.`;
                    texte = clean(match[2]);
                }

                return {
                    index: answerIndex,
                    lettre,
                    texte,
                    value: labelFor ? (document.getElementById(labelFor)?.value || '') : '',
                    selector: labelFor
                        ? `label[for="${labelFor}"]`
                        : `[data-testid="question-${index}"] [data-testid="exam-answer-${answerIndex + 1}"]`
                };
            });

            questions.push({
                index,
                numero: clean(numeroElement?.textContent || `Question ${index + 1}`),
                texte: clean(textElement?.innerText || textElement?.textContent || ''),
                reponses
            });
        });

        return questions;
    }, { visibleOnly: options.visibleOnly === true }).catch(() => []);

    return payload.map((question, index) => {
        const cleanedAnswers = (question.reponses || []).map((answer, answerIndex) => {
            const parsed = parseChoiceText(answer.texte || '', answerIndex);
            const normalizedLetter = answer.lettre || parsed.lettre;
            const normalizedText = parsed.texte || answer.texte || '';
            return {
                ...answer,
                lettre: normalizedLetter,
                texte: normalizedText
            };
        });

        return {
            index,
            numero: cleanText(question.numero) || `Question ${index + 1}`,
            texte: cleanText(question.texte),
            reponses: cleanedAnswers
        };
    });
}

export function includesNormalized(haystack, needle) {
    const normalizedHaystack = toAsciiText(haystack);
    const normalizedNeedle = toAsciiText(needle);
    return normalizedNeedle && normalizedHaystack.includes(normalizedNeedle);
}


