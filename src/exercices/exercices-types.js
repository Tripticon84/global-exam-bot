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
];

export const getExerciceType = (id) => EXERCICE_TYPES.find((t) => t.id === id) || null;

// Détection du type d'exercice
export const detectExerciceType = async (exo) => {
    return EXERCICE_TYPES.find((t) => exo.nom && exo.nom.includes(t.label)) || null;
}
