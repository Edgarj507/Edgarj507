/** UI strings. English is the source of truth and the fallback for any missing key. */
const en = {
  // menu
  'menu.selectCourse': 'Select Course', 'menu.myBag': 'My Bag', 'menu.friends': 'Friends', 'menu.settings': 'Settings',
  // HUD
  'hud.hole': 'Hole', 'hud.par': 'Par', 'hud.strokes': 'Strokes', 'hud.line': 'Line', 'hud.playsLike': 'Plays Like',
  'hud.club': 'Club', 'hud.logShot': 'Log Shot', 'hud.logged': 'Logged', 'hud.next': 'Next', 'hud.finish': 'Finish',
  'hud.puttView': 'Putt View', 'hud.pin': 'Pin', 'hud.up': 'Up', 'hud.down': 'Down', 'hud.flat': 'Flat',
  'hud.communityPin': 'Community pin', 'hud.defaultPin': 'Course default pin', 'hud.front': 'front', 'hud.back': 'back',
  'hud.left': 'left', 'hud.right': 'right', 'hud.centre': 'centre', 'hud.reports': 'reports',
  'hud.target': 'Measured target — tap to clear', 'hud.toPin': 'to pin', 'hud.recenter': 'Recenter on shot',
  // putt view
  'putt.reader': 'LiDAR green reader', 'putt.break': 'Calculated break', 'putt.aim': 'Aim', 'putt.pace': 'Pace for',
  'putt.distance': 'Distance', 'putt.slope': 'Slope', 'putt.elevation': 'Elevation', 'putt.notOnGreen': 'Not on the green yet',
  'putt.readsWithin': 'Putt View reads within 20y.', 'putt.confirmCup': 'Confirm cup position', 'putt.cupShared': 'Cup position shared',
  // round setup
  'setup.title': 'Round Setup', 'setup.course': 'Course', 'setup.search': 'Search courses...', 'setup.holes': 'Holes',
  'setup.18': '18 Holes', 'setup.9': '9 Holes', 'setup.front': 'Front 9', 'setup.back': 'Back 9',
  'setup.front.sub': 'Holes 1–9', 'setup.back.sub': 'Holes 10–18', 'setup.partners': 'Playing Partners',
  'setup.invite': 'Invite Players', 'setup.selected': 'Selected', 'setup.tees': 'Tees', 'setup.format': 'Format',
  'setup.visibility': 'Who can see this round', 'setup.tournament': 'Tournament Mode',
  'setup.tournament.sub': 'Disables slope and wind data', 'setup.start': 'Start Round', 'setup.resume': 'Resume Round · Hole',
  'setup.guestLocal': 'Guest rounds stay on this device.',
  // scorecard
  'card.title': 'Scorecard', 'card.hole': 'Hole', 'card.par': 'Par', 'card.score': 'Score', 'card.out': 'Out', 'card.in': 'In',
  'card.thru': 'Thru', 'card.you': 'You', 'card.end': 'End Round & Return to Menu', 'card.tap': 'Tap a hole to jump to it',
  // course discovery
  'courses.title': 'Your Courses', 'courses.nearYou': 'Near you', 'courses.intro': 'Pick the courses you play. We’ll download their layouts and imagery so they’re ready on the course.',
  'courses.search': 'Search any course worldwide…', 'courses.results': 'Search results', 'courses.noResults': 'No golf courses found.',
  'courses.home': 'Home courses', 'courses.nearby': 'Nearby courses', 'courses.retry': 'Retry', 'courses.offline': 'Saved on this device',
  'courses.download': 'Download course data', 'courses.continue': 'Continue', 'courses.downloading': 'Downloading courses',
  'courses.ready': 'Courses ready', 'courses.step.layout': 'Hole layout & par', 'courses.step.imagery': 'Satellite imagery',
  'courses.step.pins': 'Community pin data', 'courses.signInForPins': 'sign in', 'courses.back': 'Back', 'courses.cancel': 'Cancel',
  'courses.setUpRound': 'Set up round', 'courses.change': 'Find courses', 'courses.skip': 'Skip · play the sample course', 'courses.noneNearby': 'No courses within 10 miles. Use search to find one.',
  // shot outcome / mulligans / hud toggles / recap
  'shot.title': 'Where did it finish?', 'shot.whose': 'Whose ball are we playing?', 'shot.center': 'Center', 'shot.left': 'Left', 'shot.right': 'Right',
  'shot.long': 'Long', 'shot.short': 'Short', 'shot.skip': 'Skip', 'shot.onTarget': 'on target', 'shot.tends': 'tends', 'shot.firstStat': 'Builds your club dispersion stats.',
  'mull.title': 'Mulligans', 'mull.raised': 'raised', 'mull.use': 'Use', 'mull.ledger': 'Ledger', 'mull.left': 'left',
  'hud.voice': 'Voice caddie', 'hud.guardian': 'Course Guardian', 'hud.rain': 'Rain', 'hud.uv': 'UV',
  'setup.scramble': 'Tournament Scramble', 'setup.scramble.sub': 'Best-ball tracking for the group + paid mulligan packs.', 'setup.packs': 'Mulligan packs', 'setup.price': 'Price each',
  'recap.title': 'Round Breakdown', 'recap.sg': 'Strokes Gained vs Tour', 'recap.offTee': 'Off the tee', 'recap.approach': 'Approach', 'recap.aroundGreen': 'Around the green',
  'recap.putting': 'Putting', 'recap.share': 'Share card', 'recap.done': 'Done', 'recap.drives': 'Drives used', 'recap.notEnough': 'Log a few shots to see your breakdown.',
  // settings
  'settings.title': 'Settings', 'settings.language': 'Language', 'settings.detected': 'Detected from your device',
  'settings.units': 'Distance units', 'settings.yards': 'Yards', 'settings.meters': 'Meters',
  'settings.units.sub': 'Applies to every distance in the HUD, scorecard and bag.',
  'settings.account': 'Account', 'settings.profile': 'Profile & Privacy', 'settings.pins': 'Community pins',
  'settings.pins.sub': 'Use crowdsourced cup positions for pin distances.',
} as const;

export type StringKey = keyof typeof en;
type Dict = Partial<Record<StringKey, string>>;

const es: Dict = {
  'menu.selectCourse': 'Elegir campo', 'menu.myBag': 'Mi bolsa', 'menu.friends': 'Amigos', 'menu.settings': 'Ajustes',
  'hud.hole': 'Hoyo', 'hud.par': 'Par', 'hud.strokes': 'Golpes', 'hud.line': 'Línea', 'hud.playsLike': 'Juega como',
  'hud.club': 'Palo', 'hud.logShot': 'Registrar golpe', 'hud.logged': 'Registrado', 'hud.next': 'Sig.', 'hud.finish': 'Fin',
  'hud.puttView': 'Vista putt', 'hud.pin': 'Bandera', 'hud.up': 'Subida', 'hud.down': 'Bajada', 'hud.flat': 'Plano',
  'hud.communityPin': 'Bandera comunidad', 'hud.defaultPin': 'Bandera por defecto', 'hud.front': 'delante', 'hud.back': 'detrás',
  'hud.left': 'izq.', 'hud.right': 'der.', 'hud.centre': 'centro', 'hud.reports': 'reportes',
  'hud.target': 'Objetivo medido — toca para quitar', 'hud.toPin': 'a bandera', 'hud.recenter': 'Recentrar en el golpe',
  'putt.reader': 'Lector de green LiDAR', 'putt.break': 'Caída calculada', 'putt.aim': 'Apunta', 'putt.pace': 'Fuerza para',
  'putt.distance': 'Distancia', 'putt.slope': 'Pendiente', 'putt.elevation': 'Desnivel', 'putt.notOnGreen': 'Aún no estás en el green',
  'putt.readsWithin': 'La vista putt lee a menos de 20 yd.', 'putt.confirmCup': 'Confirmar posición del hoyo', 'putt.cupShared': 'Posición compartida',
  'setup.title': 'Configurar ronda', 'setup.course': 'Campo', 'setup.search': 'Buscar campos...', 'setup.holes': 'Hoyos',
  'setup.18': '18 hoyos', 'setup.9': '9 hoyos', 'setup.front': 'Primeros 9', 'setup.back': 'Segundos 9',
  'setup.front.sub': 'Hoyos 1–9', 'setup.back.sub': 'Hoyos 10–18', 'setup.partners': 'Compañeros',
  'setup.invite': 'Invitar jugadores', 'setup.selected': 'elegidos', 'setup.tees': 'Salidas', 'setup.format': 'Modalidad',
  'setup.visibility': 'Quién puede ver esta ronda', 'setup.tournament': 'Modo torneo',
  'setup.tournament.sub': 'Desactiva pendiente y viento', 'setup.start': 'Empezar ronda', 'setup.resume': 'Continuar · Hoyo',
  'setup.guestLocal': 'Las rondas de invitado se quedan en este dispositivo.',
  'card.title': 'Tarjeta', 'card.hole': 'Hoyo', 'card.par': 'Par', 'card.score': 'Golpes', 'card.out': 'Ida', 'card.in': 'Vuelta',
  'card.thru': 'Tras', 'card.you': 'Tú', 'card.end': 'Terminar ronda y volver', 'card.tap': 'Toca un hoyo para ir a él',
  'courses.title': 'Tus campos', 'courses.nearYou': 'Cerca de ti', 'courses.intro': 'Elige los campos donde juegas. Descargaremos su diseño e imágenes para tenerlos listos en el campo.',
  'courses.search': 'Busca cualquier campo del mundo…', 'courses.results': 'Resultados', 'courses.noResults': 'No se encontraron campos.',
  'courses.home': 'Campos habituales', 'courses.nearby': 'Campos cercanos', 'courses.retry': 'Reintentar', 'courses.offline': 'Guardados en este dispositivo',
  'courses.download': 'Descargar datos', 'courses.continue': 'Continuar', 'courses.downloading': 'Descargando campos',
  'courses.ready': 'Campos listos', 'courses.step.layout': 'Hoyos y par', 'courses.step.imagery': 'Imagen satelital',
  'courses.step.pins': 'Banderas de la comunidad', 'courses.signInForPins': 'inicia sesión', 'courses.back': 'Atrás', 'courses.cancel': 'Cancelar',
  'courses.setUpRound': 'Configurar ronda', 'courses.change': 'Buscar campos', 'courses.skip': 'Omitir · jugar el campo de muestra', 'courses.noneNearby': 'No hay campos a menos de 16 km. Usa la búsqueda.',
  'shot.title': '¿Dónde terminó?', 'shot.whose': '¿Con qué bola jugamos?', 'shot.center': 'Centro', 'shot.left': 'Izq.', 'shot.right': 'Der.',
  'shot.long': 'Largo', 'shot.short': 'Corto', 'shot.skip': 'Omitir', 'shot.onTarget': 'al objetivo', 'shot.tends': 'tiende', 'shot.firstStat': 'Crea tus estadísticas de dispersión por palo.',
  'mull.title': 'Mulligans', 'mull.raised': 'recaudado', 'mull.use': 'Usar', 'mull.ledger': 'Registro', 'mull.left': 'quedan',
  'hud.voice': 'Caddie por voz', 'hud.guardian': 'Course Guardian', 'hud.rain': 'Lluvia', 'hud.uv': 'UV',
  'setup.scramble': 'Scramble de torneo', 'setup.scramble.sub': 'Mejor bola del grupo + paquetes de mulligans pagados.', 'setup.packs': 'Paquetes de mulligans', 'setup.price': 'Precio c/u',
  'recap.title': 'Análisis de la ronda', 'recap.sg': 'Golpes ganados vs Tour', 'recap.offTee': 'Salida', 'recap.approach': 'Aproximación', 'recap.aroundGreen': 'Alrededor del green',
  'recap.putting': 'Putt', 'recap.share': 'Compartir', 'recap.done': 'Listo', 'recap.drives': 'Drives usados', 'recap.notEnough': 'Registra algunos golpes para ver tu análisis.',
  'settings.title': 'Ajustes', 'settings.language': 'Idioma', 'settings.detected': 'Detectado en tu dispositivo',
  'settings.units': 'Unidades de distancia', 'settings.yards': 'Yardas', 'settings.meters': 'Metros',
  'settings.units.sub': 'Se aplica a todas las distancias del HUD, la tarjeta y la bolsa.',
  'settings.account': 'Cuenta', 'settings.profile': 'Perfil y privacidad', 'settings.pins': 'Banderas de la comunidad',
  'settings.pins.sub': 'Usa posiciones del hoyo compartidas por jugadores.',
};

const fr: Dict = {
  'menu.selectCourse': 'Choisir le parcours', 'menu.myBag': 'Mon sac', 'menu.friends': 'Amis', 'menu.settings': 'Réglages',
  'hud.hole': 'Trou', 'hud.par': 'Par', 'hud.strokes': 'Coups', 'hud.line': 'Ligne', 'hud.playsLike': 'Se joue',
  'hud.club': 'Club', 'hud.logShot': 'Noter le coup', 'hud.logged': 'Noté', 'hud.next': 'Suiv.', 'hud.finish': 'Fin',
  'hud.puttView': 'Vue putt', 'hud.pin': 'Drapeau', 'hud.up': 'Montée', 'hud.down': 'Descente', 'hud.flat': 'Plat',
  'hud.communityPin': 'Drapeau communauté', 'hud.defaultPin': 'Drapeau par défaut', 'hud.front': 'devant', 'hud.back': 'derrière',
  'hud.left': 'gauche', 'hud.right': 'droite', 'hud.centre': 'centre', 'hud.reports': 'relevés',
  'putt.reader': 'Lecteur de green LiDAR', 'putt.break': 'Pente calculée', 'putt.aim': 'Viser', 'putt.pace': 'Dosage pour',
  'putt.distance': 'Distance', 'putt.slope': 'Pente', 'putt.elevation': 'Dénivelé', 'putt.notOnGreen': 'Pas encore sur le green',
  'putt.confirmCup': 'Confirmer la position du trou', 'putt.cupShared': 'Position partagée',
  'setup.title': 'Préparer la partie', 'setup.course': 'Parcours', 'setup.holes': 'Trous', 'setup.18': '18 trous', 'setup.9': '9 trous',
  'setup.front': 'Aller', 'setup.back': 'Retour', 'setup.tees': 'Départs', 'setup.format': 'Formule', 'setup.start': 'Commencer',
  'setup.tournament': 'Mode tournoi', 'setup.visibility': 'Qui peut voir cette partie',
  'card.title': 'Carte', 'card.hole': 'Trou', 'card.score': 'Score', 'card.out': 'Aller', 'card.in': 'Retour',
  'settings.title': 'Réglages', 'settings.language': 'Langue', 'settings.detected': 'Détectée sur votre appareil',
  'settings.units': 'Unités de distance', 'settings.yards': 'Yards', 'settings.meters': 'Mètres',
  'settings.units.sub': 'S’applique à toutes les distances du HUD, de la carte et du sac.',
  'settings.account': 'Compte', 'settings.profile': 'Profil et confidentialité', 'settings.pins': 'Drapeaux communautaires',
};

const de: Dict = {
  'menu.selectCourse': 'Platz wählen', 'menu.myBag': 'Mein Bag', 'menu.friends': 'Freunde', 'menu.settings': 'Einstellungen',
  'hud.hole': 'Loch', 'hud.par': 'Par', 'hud.strokes': 'Schläge', 'hud.line': 'Linie', 'hud.playsLike': 'Spielt sich',
  'hud.club': 'Schläger', 'hud.logShot': 'Schlag erfassen', 'hud.logged': 'Erfasst', 'hud.next': 'Weiter', 'hud.finish': 'Ende',
  'hud.puttView': 'Putt-Ansicht', 'hud.pin': 'Fahne', 'hud.up': 'Bergauf', 'hud.down': 'Bergab', 'hud.flat': 'Eben',
  'hud.communityPin': 'Community-Fahne', 'hud.defaultPin': 'Standard-Fahne', 'hud.front': 'vorne', 'hud.back': 'hinten',
  'hud.left': 'links', 'hud.right': 'rechts', 'hud.centre': 'Mitte', 'hud.reports': 'Meldungen',
  'putt.confirmCup': 'Lochposition bestätigen', 'putt.cupShared': 'Position geteilt',
  'setup.title': 'Runde einrichten', 'setup.course': 'Platz', 'setup.holes': 'Löcher', 'setup.18': '18 Löcher', 'setup.9': '9 Löcher',
  'setup.tees': 'Abschläge', 'setup.format': 'Spielform', 'setup.start': 'Runde starten', 'setup.tournament': 'Turniermodus',
  'card.title': 'Scorekarte', 'card.hole': 'Loch', 'card.score': 'Schläge',
  'settings.title': 'Einstellungen', 'settings.language': 'Sprache', 'settings.detected': 'Vom Gerät erkannt',
  'settings.units': 'Entfernungseinheit', 'settings.yards': 'Yards', 'settings.meters': 'Meter',
  'settings.account': 'Konto', 'settings.profile': 'Profil & Datenschutz', 'settings.pins': 'Community-Fahnen',
};

const pt: Dict = {
  'menu.selectCourse': 'Escolher campo', 'menu.myBag': 'Meu saco', 'menu.friends': 'Amigos', 'menu.settings': 'Definições',
  'hud.hole': 'Buraco', 'hud.par': 'Par', 'hud.strokes': 'Pancadas', 'hud.line': 'Linha', 'hud.playsLike': 'Joga como',
  'hud.club': 'Taco', 'hud.logShot': 'Registar pancada', 'hud.logged': 'Registado', 'hud.next': 'Próx.', 'hud.finish': 'Fim',
  'hud.puttView': 'Vista putt', 'hud.pin': 'Bandeira', 'hud.communityPin': 'Bandeira comunidade', 'hud.front': 'frente', 'hud.back': 'trás',
  'hud.left': 'esq.', 'hud.right': 'dir.', 'hud.centre': 'centro',
  'setup.title': 'Configurar volta', 'setup.course': 'Campo', 'setup.holes': 'Buracos', 'setup.18': '18 buracos', 'setup.9': '9 buracos',
  'setup.start': 'Começar volta', 'card.title': 'Cartão',
  'settings.title': 'Definições', 'settings.language': 'Idioma', 'settings.units': 'Unidades', 'settings.yards': 'Jardas', 'settings.meters': 'Metros',
  'settings.profile': 'Perfil e privacidade',
};

export const LANGUAGES = {
  en: { label: 'English', dict: en as Dict },
  es: { label: 'Español', dict: es },
  fr: { label: 'Français', dict: fr },
  de: { label: 'Deutsch', dict: de },
  pt: { label: 'Português', dict: pt },
} as const;
export type Lang = keyof typeof LANGUAGES;

export const translate = (lang: Lang, key: StringKey) => LANGUAGES[lang].dict[key] ?? en[key];
