import { includesNormalized } from './dom-parsers.js';

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

export const getExerciceType = (value) => {
    if (!value) return null;
    return EXERCICE_TYPES.find((t) => t.type === value || t.label === value || t.id === value) || null;
};

// Détection du type d'exercice
export const detectExerciceType = async (exo) => {
    if (!exo) return null;

    const nom = exo.nom || '';
    const exoType = (exo.type || '').toLowerCase();

    // Priorité aux tags explicites [TOEIC 1..4]
    const toeicMatch = nom.match(/\[TOEIC\s*([1-4])\]/i);
    if (toeicMatch) {
        return EXERCICE_TYPES.find((t) => t.type === `TOEICExam${toeicMatch[1]}`) || null;
    }

    if (exoType === 'exam') {
        return EXERCICE_TYPES.find((t) => t.type === 'Exam') || null;
    }

    const byLabel = EXERCICE_TYPES.find((t) => includesNormalized(nom, t.label));
    if (byLabel) return byLabel;

    if (exoType === 'listening') {
        return EXERCICE_TYPES.find((t) => t.type === 'Conversation') || null;
    }

    return null;
};

