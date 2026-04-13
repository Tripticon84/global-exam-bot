import { getAllExos } from '../gets/get-all-exos.js';

/**
 * Parse une durée utilisateur en millisecondes.
 * Formats acceptés: 10m, 30 min, 1h, 90
 * @param {string} value
 * @returns {number}
 */
export function parseDurationInput(value) {
    if (!value || typeof value !== 'string') return -1;

    const normalized = value.trim().toLowerCase().replace(',', '.');
    const compact = normalized.replace(/\s+/g, '');

    const match = compact.match(/^(\d+(?:\.\d+)?)(h|heure|heures|hr|hrs|min|m)?$/i);
    if (!match) return -1;

    const amount = Number(match[1]);
    const unit = (match[2] || 'm').toLowerCase();
    if (!Number.isFinite(amount) || amount <= 0) return -1;

    if (['h', 'heure', 'heures', 'hr', 'hrs'].includes(unit)) {
        return Math.round(amount * 60 * 60 * 1000);
    }

    return Math.round(amount * 60 * 1000);
}

/**
 * Formate une durée en texte lisible.
 * @param {number} ms
 * @returns {string}
 */
export function formatDuration(ms) {
    if (!Number.isFinite(ms) || ms <= 0) return '0 min';

    const totalMinutes = Math.round(ms / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours > 0 && minutes > 0) return `${hours}h${String(minutes).padStart(2, '0')}`;
    if (hours > 0) return `${hours}h`;
    return `${totalMinutes} min`;
}

/**
 * Parse le temps d'activité de GlobalExam (ex: 21h06, 2 h 14, 45 min).
 * @param {string|null|undefined} raw
 * @returns {number|null}
 */
function parseActivityTimeToMs(raw) {
    if (!raw || typeof raw !== 'string') return null;

    const value = raw.trim().toLowerCase().replace(/\s+/g, '');
    if (!value) return null;

    const hCompactMatch = value.match(/^(\d+)h(\d{1,2})$/);
    if (hCompactMatch) {
        const hours = parseInt(hCompactMatch[1], 10);
        const minutes = parseInt(hCompactMatch[2], 10);
        return ((hours * 60) + minutes) * 60000;
    }

    const hoursMatch = value.match(/(\d+)h/);
    const minutesMatch = value.match(/(\d+)(?:min|m)/);

    const hours = hoursMatch ? parseInt(hoursMatch[1], 10) : 0;
    const minutes = minutesMatch ? parseInt(minutesMatch[1], 10) : 0;

    if (hours === 0 && minutes === 0) {
        const asNumber = parseInt(value, 10);
        if (Number.isFinite(asNumber) && asNumber > 0) return asNumber * 60000;
        return null;
    }

    return ((hours * 60) + minutes) * 60000;
}

/**
 * Lit le temps passé depuis la page des exercices.
 * @param {import('playwright').Page} page
 * @param {string} exosPageUrl
 * @returns {Promise<{raw: string|null, ms: number|null}>}
 */
async function readActivityTimeSnapshot(page, exosPageUrl) {
    if (!page.url().includes('/user-plannings')) {
        await page.goto(exosPageUrl);
        await page.waitForURL(/\/user-plannings.*/, { timeout: 20000 });
    }

    const exosData = await getAllExos(page);
    const raw = exosData.globalStats?.tempsPassé || null;
    return {
        raw,
        ms: parseActivityTimeToMs(raw)
    };
}

/**
 * Demande à l'utilisateur de cliquer un exercice vidéo dans la liste,
 * puis retourne la cible enregistrée.
 * @param {import('playwright').Page} page
 * @param {string} exosPageUrl
 * @param {number} timeoutMs
 * @returns {Promise<{sectionId: string, sectionTitle: string, buttonIndex: number, nom: string, type: string}>}
 */
async function waitForUserVideoSelection(page, exosPageUrl, timeoutMs = 180000) {
    if (!page.url().includes('/user-plannings')) {
        await page.goto(exosPageUrl);
        await page.waitForURL(/\/user-plannings.*/, { timeout: 20000 });
    }

    await page.evaluate(() => {
        localStorage.removeItem('__geVideoSelection');

        if (window.__geVideoClickHandler) {
            document.removeEventListener('click', window.__geVideoClickHandler, true);
        }

        const isVideoButton = (button) => {
            const iconSpan = button.querySelector('span[class*="rounded-full"]');
            if (iconSpan) {
                if (iconSpan.classList.contains('border-primary')) return true;
                if (Array.from(iconSpan.classList).some((cls) => cls.includes('video'))) return true;
            }

            const checkSpan = button.querySelector('[class*="text-video"]');
            return !!checkSpan;
        };

        const getSectionData = (button) => {
            let current = button.parentElement;
            while (current) {
                const previous = current.previousElementSibling;
                if (previous && previous.id && previous.id.startsWith('pm-')) {
                    const sectionTitle = previous.querySelector('p')?.textContent?.trim() || '';
                    const directButtons = Array.from(current.children || []).filter((child) => child.tagName === 'BUTTON');
                    return {
                        sectionId: previous.id,
                        sectionTitle,
                        buttonIndex: directButtons.indexOf(button) + 1
                    };
                }
                current = current.parentElement;
            }
            return { sectionId: null, sectionTitle: '', buttonIndex: -1 };
        };

        window.__geVideoClickHandler = (event) => {
            const button = event.target instanceof Element ? event.target.closest('button') : null;
            if (!button) return;

            const sectionData = getSectionData(button);
            const nom = button.querySelector('p')?.textContent?.trim() || button.textContent?.trim() || 'Sans nom';

            const payload = {
                sectionId: sectionData.sectionId,
                sectionTitle: sectionData.sectionTitle,
                buttonIndex: sectionData.buttonIndex,
                nom,
                type: isVideoButton(button) ? 'video' : 'other',
                capturedAt: Date.now()
            };

            localStorage.setItem('__geVideoSelection', JSON.stringify(payload));
        };

        document.addEventListener('click', window.__geVideoClickHandler, true);
    });

    console.log('\n🎬 Sélection vidéo: cliquez maintenant sur un exercice vidéo dans le navigateur.');

    const startedAt = Date.now();
    while ((Date.now() - startedAt) < timeoutMs) {
        try {
            const selected = await page.evaluate(() => {
                const raw = localStorage.getItem('__geVideoSelection');
                if (!raw) return null;
                try {
                    return JSON.parse(raw);
                } catch {
                    return null;
                }
            });

            if (selected) {
                await page.evaluate(() => localStorage.removeItem('__geVideoSelection'));

                const isValid = selected.type === 'video'
                    && typeof selected.sectionId === 'string'
                    && selected.sectionId.length > 0
                    && Number.isInteger(selected.buttonIndex)
                    && selected.buttonIndex > 0;

                if (isValid) {
                    await page.evaluate(() => {
                        if (window.__geVideoClickHandler) {
                            document.removeEventListener('click', window.__geVideoClickHandler, true);
                            window.__geVideoClickHandler = null;
                        }
                    });
                    console.log(`✅ Exercice vidéo sélectionné: [${selected.sectionTitle}] ${selected.nom} (index ${selected.buttonIndex})`);
                    return selected;
                }

                console.log('⚠ Le clic capturé ne correspond pas à un exercice vidéo, veuillez réessayer.');
                if (!page.url().includes('/user-plannings')) {
                    await page.goto(exosPageUrl);
                    await page.waitForURL(/\/user-plannings.*/, { timeout: 20000 });
                }
            }
        } catch {
            // La page peut être en transition: on réessaie.
        }

        await page.waitForTimeout(1000);
    }

    throw new Error('Temps dépassé: aucun exercice vidéo valide sélectionné.');
}

/**
 * Tente de fermer un overlay bloquant sans recharger la page.
 * @param {import('playwright').Page} page
 */
async function closeBlockingOverlay(page) {
    const closeSelectors = [
        'button[aria-label*="Fermer" i]',
        'button[aria-label*="Close" i]',
        'button:has-text("Fermer")',
        'button:has-text("Quitter")',
        '.fa-times',
        '.fa-xmark',
        'button.wisepops-close',
        'button.pt-close',
        'button#axeptio_btn_acceptAll'
    ];

    for (let attempt = 0; attempt < 3; attempt++) {
        const overlay = page.locator('div.bg-black.bg-opacity-50.fixed').first();
        const hasOverlay = await overlay.count();
        if (!hasOverlay) return;

        for (const selector of closeSelectors) {
            const closeBtn = page.locator(selector).first();
            if (await closeBtn.count()) {
                await closeBtn.click({ force: true }).catch(() => { });
                await page.waitForTimeout(200);
            }
        }

        await page.keyboard.press('Escape').catch(() => { });
        await page.waitForTimeout(250);
    }
}

/**
 * Ouvre l'exercice vidéo ciblé depuis la liste.
 * @param {import('playwright').Page} page
 * @param {string} exosPageUrl
 * @param {{sectionId: string, buttonIndex: number, nom: string}} target
 */
async function openVideoExercise(page, exosPageUrl, target) {
    if (!page.url().includes('/user-plannings')) {
        await page.goto(exosPageUrl);
        await page.waitForURL(/\/user-plannings.*/, { timeout: 20000 });
    }

    await closeBlockingOverlay(page);

    const sectionHeader = await page.$(`#${target.sectionId}`);
    if (!sectionHeader) {
        throw new Error(`Section introuvable: ${target.sectionId}`);
    }

    const exercisesGrid = await sectionHeader.evaluateHandle((el) => el.nextElementSibling);
    let buttons = await exercisesGrid.$$(':scope > button');
    if (buttons.length === 0) {
        buttons = await exercisesGrid.$$('button');
    }

    if (target.buttonIndex < 1 || target.buttonIndex > buttons.length) {
        throw new Error(`Index vidéo invalide: ${target.buttonIndex} (disponibles: ${buttons.length})`);
    }

    await buttons[target.buttonIndex - 1].click({ force: true });

    try {
        await page.waitForURL(/\/activity.*/, { timeout: 20000 });
    } catch {
        await page.waitForSelector('video#video, video', { timeout: 20000 });
    }

    console.log(`▶ Activité vidéo ouverte: ${target.nom}`);
}

/**
 * Lance la lecture de la vidéo (avec fallback).
 * @param {import('playwright').Page} page
 */
async function startVideoPlayback(page) {
    await page.waitForSelector('video#video, video', { timeout: 20000 });

    const playSelectors = [
        'i:has(svg[data-icon="play-circle"])',
        'svg[data-icon="play-circle"]',
        '.fa-play-circle',
        'button:has(svg[data-icon="play"])',
        '.fa-play'
    ];

    for (const selector of playSelectors) {
        const candidate = page.locator(selector).first();
        if (await candidate.count()) {
            await candidate.click({ force: true }).catch(() => { });
            break;
        }
    }

    const video = page.locator('video#video, video').first();
    await video.click({ force: true }).catch(() => { });

    // Pas de vérification de l'état de lecture: on suppose la vidéo lancée.
    await page.evaluate(() => {
        const element = document.querySelector('video#video, video');
        if (!element) return;
        try {
            const promise = element.play();
            if (promise && typeof promise.catch === 'function') {
                promise.catch(() => { });
            }
        } catch {
            // ignore
        }
    }).catch(() => { });
}

/**
 * Quitte la popup/activité vidéo puis revient à la liste d'exercices.
 * @param {import('playwright').Page} page
 * @param {string} exosPageUrl
 */
async function exitVideoActivity(page, exosPageUrl) {
    // Comportement demandé: fermer en cliquant hors de la vidéo (backdrop).
    const backdrop = page.locator('div.bg-black.bg-opacity-50.fixed').first();
    if (await backdrop.count()) {
        await backdrop.click({ position: { x: 8, y: 8 }, force: true }).catch(() => { });
        await page.waitForTimeout(1200);
        if (page.url().includes('/user-plannings')) return;
    }

    // Fallback minimal si la modale ne se ferme pas au clic extérieur.
    await page.keyboard.press('Escape').catch(() => { });
    await page.waitForTimeout(1200);

    if (!page.url().includes('/user-plannings')) {
        await page.goto(exosPageUrl);
        await page.waitForURL(/\/user-plannings.*/, { timeout: 20000 });
    }
}

/**
 * Vérifie si le temps passé a augmenté (avec retries + refresh).
 * @param {import('playwright').Page} page
 * @param {string} exosPageUrl
 * @param {{raw: string|null, ms: number|null}} previousSnapshot
 * @param {number} retries
 * @returns {Promise<{snapshot: {raw: string|null, ms: number|null}, deltaMs: number|null, increased: boolean, attempts: number}>}
 */
async function verifyTimeIncrease(page, exosPageUrl, previousSnapshot, retries = 3) {
    let latestSnapshot = previousSnapshot;

    for (let attempt = 1; attempt <= retries; attempt++) {
        const currentSnapshot = await readActivityTimeSnapshot(page, exosPageUrl);
        latestSnapshot = currentSnapshot;

        let deltaMs = null;
        if (previousSnapshot.ms !== null && currentSnapshot.ms !== null) {
            deltaMs = currentSnapshot.ms - previousSnapshot.ms;
        }

        const increased = deltaMs !== null ? deltaMs > 0 : false;
        if (increased) {
            return {
                snapshot: currentSnapshot,
                deltaMs,
                increased: true,
                attempts: attempt
            };
        }

        if (attempt < retries) {
            console.log(`⏳ Temps inchangé (${currentSnapshot.raw || 'N/A'}), nouvelle vérification (${attempt + 1}/${retries})...`);
            await page.waitForTimeout(5000);
            await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => page.goto(exosPageUrl));
            await page.waitForTimeout(1000);
        }
    }

    return {
        snapshot: latestSnapshot,
        deltaMs: (previousSnapshot.ms !== null && latestSnapshot.ms !== null) ? latestSnapshot.ms - previousSnapshot.ms : null,
        increased: false,
        attempts: retries
    };
}

/**
 * Exécute le mode durée vidéo en boucle.
 * @param {import('playwright').Page} page
 * @param {string} exosPageUrl
 * @param {number} targetDurationMs
 * @param {{waitMs?: number}} options
 * @returns {Promise<{launchCount: number, successfulLaunches: number, failedLaunches: number, verifiedIncreases: number, plannedDurationMs: number, elapsedMs: number, initialSnapshot: {raw: string|null, ms: number|null}, finalSnapshot: {raw: string|null, ms: number|null}, totalGainMs: number|null}>}
 */
export async function runVideoDurationMode(page, exosPageUrl, targetDurationMs, options = {}) {
    const waitMs = Number.isFinite(options.waitMs) && options.waitMs > 0 ? options.waitMs : 10 * 60 * 1000;

    const selectedVideo = await waitForUserVideoSelection(page, exosPageUrl);
    const startedAt = Date.now();

    const initialSnapshot = await readActivityTimeSnapshot(page, exosPageUrl);
    console.log(`⏱ Temps initial détecté: ${initialSnapshot.raw || 'N/A'}`);

    let launchCount = 0;
    let successfulLaunches = 0;
    let failedLaunches = 0;
    let verifiedIncreases = 0;
    let lastSnapshot = initialSnapshot;

    while ((Date.now() - startedAt) < targetDurationMs || launchCount === 0) {
        launchCount += 1;
        console.log(`\n🔁 Cycle vidéo ${launchCount} - attente fixe ${Math.round(waitMs / 60000)} min`);

        try {
            await openVideoExercise(page, exosPageUrl, selectedVideo);
            await startVideoPlayback(page);

            // Pendant cette phase, aucune interaction utilisateur simulée: attente pure.
            console.log(`⏳ Attente passive: ${formatDuration(waitMs)}...`);
            await page.waitForTimeout(waitMs);

            await exitVideoActivity(page, exosPageUrl);

            const verification = await verifyTimeIncrease(page, exosPageUrl, lastSnapshot, 3);
            lastSnapshot = verification.snapshot;

            const gainLabel = verification.deltaMs === null ? 'N/A' : formatDuration(Math.max(0, verification.deltaMs));
            if (verification.increased) {
                verifiedIncreases += 1;
                console.log(`✅ Temps augmenté après cycle ${launchCount}: +${gainLabel}`);
            } else {
                console.log(`⚠ Aucun gain confirmé après cycle ${launchCount} (delta: ${gainLabel})`);
            }

            successfulLaunches += 1;
        } catch (error) {
            failedLaunches += 1;
            console.log(`❌ Cycle ${launchCount} en échec: ${error.message}`);

            await exitVideoActivity(page, exosPageUrl).catch(() => { });
        }

        if ((Date.now() - startedAt) >= targetDurationMs) {
            console.log('⏹ Durée cible atteinte, arrêt après fin de cycle.');
            break;
        }
    }

    const finalSnapshot = await readActivityTimeSnapshot(page, exosPageUrl);
    const totalGainMs = (initialSnapshot.ms !== null && finalSnapshot.ms !== null)
        ? Math.max(0, finalSnapshot.ms - initialSnapshot.ms)
        : null;

    return {
        launchCount,
        successfulLaunches,
        failedLaunches,
        verifiedIncreases,
        plannedDurationMs: targetDurationMs,
        elapsedMs: Date.now() - startedAt,
        initialSnapshot,
        finalSnapshot,
        totalGainMs
    };
}
