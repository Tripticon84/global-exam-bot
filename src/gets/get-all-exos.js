/**
 * Récupère toutes les informations sur les exercices de la page de parcours
 * @param {import('playwright').Page} page - La page Playwright
 * @returns {Promise<Object>} Les données des exercices et statistiques globales
 */
export async function getAllExos(page) {
    // Récupérer les statistiques globales (temps passé, activités réalisées)
    const globalStats = await page.evaluate(() => {
        const stats = {};

        // Temps passé en activités
        const timeElement = document.querySelector('.col-span-6 .text-size-26.text-default-80');
        if (timeElement) {
            stats.tempsPassé = timeElement.textContent.trim();
        }

        // Activités réalisées (ex: "23/113")
        const activitiesContainer = document.querySelectorAll('.col-span-6');
        activitiesContainer.forEach(container => {
            const text = container.textContent;
            if (text.includes('Activités réalisées')) {
                const countElement = container.querySelector('.text-size-26.text-default-80');
                const totalMatch = text.match(/(\d+)\/(\d+)/);
                if (countElement && totalMatch) {
                    stats.activitesRealisees = parseInt(totalMatch[1]);
                    stats.activitesTotales = parseInt(totalMatch[2]);
                    stats.activitesRestantes = stats.activitesTotales - stats.activitesRealisees;
                }
            }
        });

        // Progression en pourcentage
        const progressElement = document.querySelector('.relative.bg-default-80');
        if (progressElement) {
            const style = progressElement.getAttribute('style');
            const match = style?.match(/width:\s*(\d+)%/);
            if (match) {
                stats.progression = parseInt(match[1]);
            }
        }

        // Dernier score d'examen
        const scoreElement = document.querySelector('.text-size-26.text-primary-80');
        if (scoreElement) {
            const scoreText = scoreElement.parentElement?.textContent;
            const scoreMatch = scoreText?.match(/(\d+)\/(\d+)/);
            if (scoreMatch) {
                stats.dernierScore = `${scoreMatch[1]}/${scoreMatch[2]}`;
            }
        }

        return stats;
    });

    // Récupérer les sections et leurs exercices
    const sections = await page.evaluate(() => {
        const sectionsData = [];

        // Sélectionner toutes les sections (identifiées par les divs avec id commençant par "pm-")
        const sectionHeaders = document.querySelectorAll('[id^="pm-"]');

        sectionHeaders.forEach((header) => {
            const sectionId = header.id;
            const sectionTitle = header.querySelector('p')?.textContent?.trim() || 'Sans titre';

            // La grille des exercices est le sibling suivant du header
            const exercisesGrid = header.nextElementSibling;
            if (!exercisesGrid) return;

            const exercises = [];

            // Récupérer les boutons d'exercices (activités cliquables)
            const buttons = exercisesGrid.querySelectorAll('button');

            buttons.forEach((button, index) => {
                const exerciseData = {
                    index: index + 1,
                    nom: '',
                    statut: 'non_commencé',
                    score: null,
                    type: null,
                    verrouillé: false
                };

                // Nom de l'exercice
                const nameElement = button.querySelector('p');
                exerciseData.nom = nameElement?.textContent?.trim() || 'Sans nom';

                // Déterminer le statut
                const checkIcon = button.querySelector('.fa-check');
                const chevronIcon = button.querySelector('.fa-chevron-right');
                const lockIcon = button.querySelector('.fa-lock');
                const continueText = button.querySelector('span')?.textContent?.includes('Continuer');

                if (lockIcon) {
                    exerciseData.statut = 'verrouillé';
                    exerciseData.verrouillé = true;
                } else if (checkIcon) {
                    exerciseData.statut = 'terminé';
                } else if (chevronIcon || continueText) {
                    exerciseData.statut = 'en_cours';
                } else {
                    exerciseData.statut = 'non_commencé';
                }

                // Récupérer le score si disponible
                const scoreElement = button.querySelector('.font-bold.text-size-14, .text-size-26');
                if (scoreElement) {
                    const scoreText = scoreElement.textContent.trim();
                    if (scoreText.includes('%')) {
                        exerciseData.score = scoreText;
                    }
                }

                // Déterminer le type d'exercice (listening, reading, video, etc.)
                const iconSpan = button.querySelector('span[class*="rounded-full"]');
                if (iconSpan) {
                    const classList = iconSpan.classList;
                    if (classList.contains('bg-listening')) {
                        exerciseData.type = 'listening';
                    } else if (classList.contains('bg-reading')) {
                        exerciseData.type = 'reading';
                    } else if (classList.contains('bg-neutral')) {
                        exerciseData.type = 'verrouillé';
                    } else if (classList.contains('border-primary')) {
                        exerciseData.type = 'video';
                    }
                }

                // Vérifier aussi la couleur de l'icône de check
                const checkSpan = button.querySelector('[class*="text-video"], [class*="text-listening"], [class*="text-reading"]');
                if (checkSpan) {
                    const classList = checkSpan.classList;
                    if (classList.contains('text-video')) {
                        exerciseData.type = 'video';
                    } else if (classList.contains('text-listening')) {
                        exerciseData.type = 'listening';
                    } else if (classList.contains('text-reading')) {
                        exerciseData.type = 'reading';
                    }
                }

                exercises.push(exerciseData);
            });

            // Vérifier aussi les cartes d'examen (comme "TOEIC 1")
            const examCards = exercisesGrid.querySelectorAll('.card.col-span-12');
            examCards.forEach((card) => {
                const examData = {
                    index: exercises.length + 1,
                    nom: '',
                    statut: 'non_commencé',
                    score: null,
                    type: 'exam',
                    verrouillé: false,
                    lien: null,
                    duree: null,
                    dateTerminé: null
                };

                // Nom de l'examen
                const titleElement = card.querySelector('.font-bold.text-size-22, .font-bold.text-size-26');
                examData.nom = titleElement?.textContent?.trim() || 'Examen';

                // Lien vers la correction ou pour lancer l'examen
                const linkElement = card.querySelector('a[href*="/exam/"], a[href*="/result"]');
                if (linkElement) {
                    examData.lien = linkElement.getAttribute('href');
                    if (examData.lien.includes('/result')) {
                        examData.statut = 'terminé';
                    }
                } else {
                    examData.statut = 'verrouillé';
                    examData.verrouillé = true;
                }

                // Date de completion
                const infoText = card.querySelector('.text-size-14.mb-3')?.textContent;
                if (infoText && infoText.includes('terminé')) {
                    examData.statut = 'terminé';
                    const dateMatch = infoText.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
                    if (dateMatch) {
                        examData.dateTerminé = dateMatch[1];
                    }
                }

                // Durée de l'examen
                const durationElement = card.querySelector('.w-20');
                if (durationElement) {
                    examData.duree = durationElement.textContent.trim();
                }

                if (examData.nom !== 'Examen' || examData.lien) {
                    exercises.push(examData);
                }
            });

            sectionsData.push({
                id: sectionId,
                titre: sectionTitle,
                exercices: exercises,
                stats: {
                    total: exercises.length,
                    terminés: exercises.filter(e => e.statut === 'terminé').length,
                    enCours: exercises.filter(e => e.statut === 'en_cours').length,
                    nonCommencés: exercises.filter(e => e.statut === 'non_commencé').length,
                    verrouillés: exercises.filter(e => e.statut === 'verrouillé').length
                }
            });
        });

        return sectionsData;
    });

    // Calculer les statistiques globales des exercices
    const allExercises = sections.flatMap(s => s.exercices);
    const exerciseStats = {
        total: allExercises.length,
        terminés: allExercises.filter(e => e.statut === 'terminé').length,
        enCours: allExercises.filter(e => e.statut === 'en_cours').length,
        nonCommencés: allExercises.filter(e => e.statut === 'non_commencé').length,
        verrouillés: allExercises.filter(e => e.statut === 'verrouillé').length
    };

    return {
        globalStats,
        exerciseStats,
        sections
    };
}

/**
 * Affiche un résumé des exercices dans la console
 * @param {Object} data - Les données retournées par getAllExos
 */
export function printExosSummary(data) {
    console.log('\n========== STATISTIQUES GLOBALES ==========');
    console.log(`Temps passé en activités : ${data.globalStats.tempsPassé || 'N/A'}`);
    console.log(`Progression : ${data.globalStats.progression || 0}%`);
    console.log(`Activités réalisées : ${data.globalStats.activitesRealisees || 0}/${data.globalStats.activitesTotales || 0}`);
    console.log(`Activités restantes : ${data.globalStats.activitesRestantes || 0}`);
    console.log(`Dernier score d'examen : ${data.globalStats.dernierScore || 'N/A'}`);

    console.log('\n========== RÉSUMÉ DES EXERCICES ==========');
    console.log(`Total : ${data.exerciseStats.total}`);
    console.log(`✅ Terminés : ${data.exerciseStats.terminés}`);
    console.log(`🔄 En cours : ${data.exerciseStats.enCours}`);
    console.log(`⏳ Non commencés : ${data.exerciseStats.nonCommencés}`);
    console.log(`🔒 Verrouillés : ${data.exerciseStats.verrouillés}`);

    console.log('\n========== DÉTAIL PAR SECTION ==========');
    data.sections.forEach(section => {
        console.log(`\n📚 ${section.titre} (${section.id})`);
        console.log(`   Total: ${section.stats.total} | ✅ ${section.stats.terminés} | 🔄 ${section.stats.enCours} | ⏳ ${section.stats.nonCommencés} | 🔒 ${section.stats.verrouillés}`);

        section.exercices.forEach(exo => {
            let statusIcon = '';
            switch (exo.statut) {
                case 'terminé': statusIcon = '✅'; break;
                case 'en_cours': statusIcon = '🔄'; break;
                case 'non_commencé': statusIcon = '⏳'; break;
                case 'verrouillé': statusIcon = '🔒'; break;
            }
            const scoreInfo = exo.score ? ` (${exo.score})` : '';
            const typeInfo = exo.type ? ` [${exo.type}]` : '';
            console.log(`      ${statusIcon} ${exo.nom}${scoreInfo}${typeInfo}`);
        });
    });
}

/**
 * Récupère uniquement les exercices non terminés et non verrouillés
 * @param {Object} data - Les données retournées par getAllExos
 * @returns {Array} Liste des exercices à faire
 */
export function getExercisesToDo(data) {
    const exercisesToDo = [];

    data.sections.forEach(section => {
        section.exercices.forEach(exo => {
            if (exo.statut === 'non_commencé' || exo.statut === 'en_cours') {
                exercisesToDo.push({
                    section: section.titre,
                    sectionId: section.id,
                    ...exo
                });
            }
        });
    });

    return exercisesToDo;
}

/**
 * Clique sur un exercice spécifique
 * @param {import('playwright').Page} page - La page Playwright
 * @param {string} sectionId - L'ID de la section (ex: "pm-55089")
 * @param {number} exerciseIndex - L'index de l'exercice dans la section (1-based)
 */
export async function clickExercise(page, sectionId, exerciseIndex) {
    const sectionHeader = await page.$(`#${sectionId}`);
    if (!sectionHeader) {
        throw new Error(`Section ${sectionId} non trouvée`);
    }

    const exercisesGrid = await sectionHeader.evaluateHandle(el => el.nextElementSibling);
    const buttons = await exercisesGrid.$$('button');

    if (exerciseIndex < 1 || exerciseIndex > buttons.length) {
        throw new Error(`Index d'exercice ${exerciseIndex} invalide. Il y a ${buttons.length} exercices dans cette section.`);
    }

    await buttons[exerciseIndex - 1].click();
}
