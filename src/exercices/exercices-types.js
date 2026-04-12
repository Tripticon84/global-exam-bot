export const EXERCICE_TYPES = [
    {
        category: "Listening",
        type: "Photograph",
        label: "Photographie"
    },
    {
        category: "Listening",
        type: "QuestionResponse",
        label: "Question - Réponse"
    },
    {
        category: "Listening",
        type: "Conversation",
        label: "Conversations"
    },
    {
        category: "Listening",
        type: "Monologue",
        label: "Monologues"
    },
    {
        category: "Reading",
        type: "FillInTheBlank",
        label: "Phrases à trous"
    },
    {
        category: "Reading",
        type: "TextCompletion",
        label: "Textes à compléter"
    },
    {
        category: "Reading",
        type: "SimpleTextCompletion",
        label: "Textes simples"
    },
    {
        category: "Reading",
        type: "MultipleTexts",
        label: "Textes multiples"
    },
    {
        category: "Exam",
        type: "TOEICExam1",
        label: "[TOEIC 1]"
    },
    {
        category: "Exam",
        type: "TOEICExam2",
        label: "[TOEIC 2]"
    },
    {
        category: "Exam",
        type: "TOEICExam3",
        label: "[TOEIC 3]"
    },
    {
        category: "Exam",
        type: "TOEICExam4",
        label: "[TOEIC 4]"
    },
    {
        category: "Exam",
        type: "Exam",
        label: "Examen"
    }
];

export const getExerciceType = (id) => EXERCICE_TYPES.find((t) => t.id === id) || null;

// Détection du type d'exercice
export const detectExerciceType = async (exo) => {
    if (!exo?.nom) {
        return null;
    }

    // Priorité aux tags explicites [TOEIC 1..4]
    const toeicMatch = exo.nom.match(/\[TOEIC\s*([1-4])\]/i);
    if (toeicMatch) {
        return EXERCICE_TYPES.find((t) => t.type === `TOEICExam${toeicMatch[1]}`) || null;
    }

    return EXERCICE_TYPES.find((t) => exo.nom && exo.nom.includes(t.label)) || null;
}
