// Interface 100% française. Toutes les chaînes UI passent par t().
export const STRINGS = {
  fr: {
    // ----- Commun
    close: 'Fermer',
    save: 'Enregistrer',
    reset: 'Réinitialiser',
    back: 'Retour',
    loading: 'Chargement…',
    unsaved: 'Non enregistré',

    // ----- Minuteur
    start: 'Démarrer',
    resume: 'Reprendre',
    pause: 'Pause',
    modePomodoro: 'Concentration',
    modeShortBreak: 'Pause courte',
    modeLongBreak: 'Pause longue',
    durationsTitle: 'Durées (minutes)',
    intentionLabel: 'Votre intention',
    intentionPlaceholder: 'Sur quoi allez-vous vous concentrer ?',
    cycleBeforeLongBreak: 'avant la pause longue',
    settingsTitle: 'Réglages',
    timerSettings: 'Réglages du minuteur',
    modeSelectorAria: 'Mode du minuteur',
    themeToggle: 'Changer de thème',
    footer: 'Conçu pour la concentration profonde.',
    timerAria: '{m} minutes {s} secondes restantes',

    // ----- Ambiance
    ambience: 'Ambiance',
    play: 'Lecture',
    stop: 'Stop',
    ambientVolume: 'Volume de l’ambiance',
    audioLoading: 'Chargement…',

    // ----- Notation (facultative)
    ratingPromptTitle: 'Comment était votre concentration ?',
    rating1: 'Très dispersé',
    rating3: 'Correct',
    rating5: 'Très concentré',
    ratingHint: 'La note est facultative : votre session est déjà enregistrée.',
    ratingLater: 'Plus tard',
    ratingSave: 'Enregistrer la note',

    // ----- Authentification
    login: 'Connexion',
    logout: 'Déconnexion',
    authIntro: 'Un compte facultatif pour retrouver vos statistiques.',
    email: 'Adresse e-mail',
    password: 'Mot de passe',
    confirmPassword: 'Confirmer le mot de passe',
    showPassword: 'Afficher le mot de passe',
    hidePassword: 'Masquer le mot de passe',
    signIn: 'Se connecter',
    signUp: 'Créer un compte',
    submitting: 'En cours…',
    passwordMismatch: 'Les mots de passe ne correspondent pas.',
    passwordTooShort: '8 caractères minimum.',
    switchToSignUp: 'Pas encore de compte ? Créer un compte',
    switchToSignIn: 'Déjà un compte ? Se connecter',
    errorInvalidCredentials: 'Adresse e-mail ou mot de passe incorrect.',
    errorEmailTaken: 'Un compte existe déjà avec cette adresse.',
    errorInvalidInput: 'Vérifiez les informations saisies.',
    errorTooManyAttempts: 'Trop de tentatives. Réessayez dans quelques minutes.',
    errorServer: 'Une erreur est survenue. Réessayez.',
    errorNetwork: 'Impossible de joindre le serveur.',
    errorUnauthorized: 'Session expirée. Reconnectez-vous.',

    // ----- Tableau de bord
    dashboard: 'Tableau de bord',
    today: 'Aujourd’hui',
    sessions: 'Sessions',
    avgPomodoro: 'Pomodoro moyen',
    remaining: 'Restant',
    dailyGoal: 'Objectif quotidien',
    minutes: 'min',
    goalReached: 'Objectif atteint. Série sécurisée ✅',
    goalHint: 'Atteignez {n} min pour sécuriser votre série.',
    streaks: 'Séries',
    currentStreak: 'Série actuelle',
    bestStreak: 'Meilleure série',
    consistency: 'Régularité',
    day: 'jour',
    days: 'jours',
    safety: 'Objectif du jour',
    inProgress: 'En cours',
    reached: 'Atteint',
    keepStreak: 'Tenez votre série en atteignant l’objectif quotidien.',
    insights: 'Résumé',
    focusRatio: 'Taux de concentration',
    avgLength: 'Durée moyenne',
    rangeFocus: 'Focus période',
    lifetimeFocus: 'Focus total',
    weeklyDelta: 'Évolution hebdo',
    previousWeek: 'vs 7 jours précédents',
    timeline: 'Tendance',
    viewDaily: 'Vue quotidienne',
    viewWeekly: 'Vue hebdomadaire',
    viewMonthly: 'Vue mensuelle',
    totalFocus: 'Focus total',
    pomodoros: 'Pomodoros',
    avgPerDay: 'Moy. / jour',
    span: 'Période',
    emptyTitle: 'Pas encore de données',
    emptyText: 'Lancez votre premier pomodoro pour voir votre progression ici.',
    emptyCta: 'Lancer le minuteur',
    emptyFirstDay: 'Premier jour enregistré : {date}',
    showAll: 'Voir les détails',
    collapse: 'Réduire',
    level: 'Niveau',
    levelProgress: 'Progression du niveau',
    nextLevelIn: 'Prochain niveau dans {n} min',
    globalSummary: 'Bilan global',
    minFocus: 'min de focus',
    activeDays: 'jours actifs',
    minPerDay: 'min / jour',
    monthTotal: 'Total du mois',
    recentSessions: 'Sessions récentes',
    latestCount: 'Dernières {n}',
    colMode: 'Mode',
    colStart: 'Début',
    colEnd: 'Fin',
    colDuration: 'Durée (min)',
    colIntention: 'Intention',
    noSessions: 'Aucune session pour le moment.',
    loadError: 'Impossible de charger les données.',
    reload: 'Recharger',
    range7: '7 jours',
    range30: '30 jours',
    range90: '90 jours',
    range365: '12 mois',
    rangeLifetime: 'Depuis le début',
    rangeAria: 'Période des statistiques',
    chartBarAria: '{label} : {value} minutes',
    chartSummary: 'Graphique du temps de concentration, {range}.',

    // ----- Ajouts (audit UX)
    betaLabel: 'Version bêta',
    timer: 'Minuteur',
    prevMonth: 'Mois précédent',
    nextMonth: 'Mois suivant',
    deepWork: 'travail profond',
    perPomodoro: 'par pomodoro',
    sessionsInline: '{n} sessions',
    durationsLocked: 'Durées verrouillées pendant une session.'
  }
};

// t('clé', { n: 120 }) remplace {n} dans la chaîne.
export function t(key, vars) {
  let str = STRINGS.fr[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.split(`{${k}}`).join(String(v));
    }
  }
  return str;
}

export const LOCALE = 'fr-FR';
