# GlobalExam Bot 🤖

Bot d'automatisation pour compléter les exercices sur GlobalExam (TOEIC).

## 📋 Fonctionnalités

- ✅ Connexion automatique à GlobalExam
- ✅ Navigation vers les plannings d'exercices
- ✅ Détection et filtrage des exercices à faire
- ✅ Support de plusieurs types d'exercices
  - **Photographie** (réponses aléatoires - pas d'IA)
  - **Question-Réponse**
  - **Conversation**
  - **Monologue**
  - **Phrases à trous**
  - **Textes à compléter**
  - **Textes simples**
  - **Textes multiples**
- ✅ Support des examens TOEIC (`[TOEIC 1]` à `[TOEIC 4]`)
  - Détection dédiée des cartes d'exam
  - Gestion de la popup "continuer cet examen blanc"
  - Orchestration automatique des sous-activités Listening/Reading
- ✅ Attente réaliste basée sur la durée de l'audio (Listening)
- ✅ Temps de réflexion aléatoire configurable
- ✅ Exécution par section (une section par lancement)
- ✅ Mode durée vidéo (10 min, 30 min, 1h, personnalisé)
  - Sélection manuelle d'un exercice vidéo par clic utilisateur
  - Boucles de 10 minutes avec contrôle du temps d'activité gagné
  - Récapitulatif des lancements et du gain observé
- ✅ Résumé de session à la fin
- ✅ **Intégration IA** (ChatGPT / Gemini) pour sélectionner les bonnes réponses
  - Requêtes batch (un seul appel API pour toutes les questions d'un exercice)
  - Fallback automatique en réponse aléatoire si erreur API

## 🚀 Installation

```bash
# Cloner le repository
git clone https://github.com/Tripticon84/global-exam-bot.git
cd global-exam-bot

# Installer les dépendances
npm install

# Installer les navigateurs Playwright
npx playwright install chromium
```

## ⚙️ Configuration

Créer un fichier `.env` à la racine du projet (voir `.env.example`) :

```env
# Identifiants GlobalExam
GLOBAL_EXAM_LOGIN=votre.email@example.com
GLOBAL_EXAM_PASSWORD=votre_mot_de_passe

# Attente entre chaque validation de questions
# true = attendre la durée de l'audio + temps aléatoire
# false = pas d'attente
WAIT_ENABLED=true

# Temps aléatoire supplémentaire (en millisecondes)
# Le temps d'attente sera: durée audio + random(WAIT_MIN_EXTRA, WAIT_MAX_EXTRA)
WAIT_MIN_EXTRA=2000
WAIT_MAX_EXTRA=8000

# Temps de base pour les exercices sans audio (en millisecondes)
WAIT_BASE_TIMER=15000

# Mode durée vidéo: attente passive par cycle (10 min par défaut)
VIDEO_LOOP_WAIT_MS=600000

# Taille de la fenêtre du navigateur
BROWSER_WIDTH=1280
BROWSER_HEIGHT=800
HEADLESS=false

# Configuration IA
# Provider: 'openai' ou 'gemini'
AI_PROVIDER=gemini

# IA dans les examens TOEIC
# false = réponses aléatoires dans les exams
# true = autorise l'IA dans les exams (si configurée)
EXAM_AI_ENABLED=false

# OpenAI (ChatGPT)
# Obtenez votre clé sur https://platform.openai.com/api-keys
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini

# Google Gemini
# Obtenez votre clé sur https://aistudio.google.com/app/apikey
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.0-flash
GEMINI_MAX_OUTPUT_TOKENS=256
GEMINI_MAX_RETRIES=2
GEMINI_THINKING_BUDGET=0

# Limites de taille du prompt IA
AI_TRANSCRIPTION_MAX_CHARS=1800
AI_QUESTION_MAX_CHARS=220
AI_CHOICE_MAX_CHARS=160
```

## 🎮 Utilisation

```bash
# Lancer le bot
npm start

# Lancer directement le mode durée (10 min)
npm run start:duration10

# Lancer en mode durée via argument CLI
npm start -- --duration 30m
```

Le bot va :

1. Se connecter à GlobalExam
2. Récupérer la liste des exercices à faire
3. Exécuter le mode choisi (section, nombre d'exercices, durée vidéo)
4. Afficher un résumé de la session

### Modes interactifs

Au démarrage (sans argument CLI), vous pouvez choisir:

1. Section entière (première section disponible)
2. Un seul exercice
3. Un nombre précis d'exercices
4. Durée vidéo (10 min, 30 min, 1h, personnalisé)

En mode durée, le bot vous demande de cliquer un exercice vidéo dans le navigateur, lance la vidéo, attend par cycles de 10 minutes, sort de l'activité, vérifie l'évolution du temps passé, puis recommence jusqu'à la durée cible.

## 📁 Structure du projet

```text
global-exam-bot/
├── src/
│   ├── main.js                 # Point d'entrée principal
│   ├── ai/
│   │   └── ai-provider.js      # Module IA (ChatGPT / Gemini)
│   ├── gets/
│   │   └── get-all-exos.js     # Récupération des exercices
│   └── exercices/
│       ├── exercices-types.js  # Définition des types d'exercices
│       ├── conversation.js     # Handler Conversation/Monologue
│       ├── phrases-a-troue.js  # Handler Phrases à trous
│       ├── textes-a-completer.js # Handler Textes à compléter
│       └── exam-solver.js      # Orchestrateur des examens TOEIC
├── .env.example                # Exemple de configuration
├── package.json
└── README.md
```

## 🤖 Configuration IA

Le bot peut utiliser une IA pour sélectionner les bonnes réponses. Deux providers sont supportés :

### OpenAI (ChatGPT)

1. Obtenez une clé API sur [OpenAI Platform](https://platform.openai.com/api-keys)
2. Configurez dans `.env` :

```env
AI_PROVIDER=openai
OPENAI_API_KEY=sk-votre-cle-api
OPENAI_MODEL=gpt-4o-mini
```

### Google Gemini

1. Obtenez une clé API sur [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Configurez dans `.env` :

```env
AI_PROVIDER=gemini
GEMINI_API_KEY=votre-cle-api
GEMINI_MODEL=gemini-2.0-flash
GEMINI_MAX_OUTPUT_TOKENS=256
GEMINI_MAX_RETRIES=2
GEMINI_THINKING_BUDGET=0

AI_TRANSCRIPTION_MAX_CHARS=1800
AI_QUESTION_MAX_CHARS=220
AI_CHOICE_MAX_CHARS=160
```

`GEMINI_THINKING_BUDGET=0` aide a eviter les reponses vides avec `finishReason=MAX_TOKENS` sur certains modeles Gemini 2.5.

> 💡 **Sans configuration IA**, le bot sélectionnera des réponses aléatoires.
> 📸 **Note** : Les exercices **Photographie** utilisent toujours des réponses aléatoires (l'IA n'est pas utile sans texte/transcription).
> 🧪 **Exam TOEIC** : vous pouvez forcer le mode aléatoire avec `EXAM_AI_ENABLED=false`.

## 🔧 Configuration avancée

### Sections ignorées

Dans `main.js`, certaines sections peuvent être ignorées :

```javascript
const SECTIONS_TO_SKIP = [
  "pm-55094",
  "pm-55095",
  "pm-55098",
  "pm-55101",
  "pm-55102",
];
```

## 📝 TODO

- [ ] Support de l'analyse d'images pour les exercices Photographie (vision API)
