import { useState } from 'react';
import {
  ChevronLeft, Search, Check, Wind, Sun, Trophy, Users, MapPin,
  Target, ChevronRight, Briefcase, Share2, QrCode, UserPlus, ScanLine,
  MessageCircle, AtSign, Link2, Settings
} from 'lucide-react';
import { CaddieHud } from './hud/CaddieHud';
import { MapPlaceholder } from './hud/MapPlaceholder';
import { Scorecard } from './views/Scorecard';
import { BagWizard } from './views/BagWizard';
import { COURSE, PAR_BY_HOLE as PARS, TEES, holesFor, type TeeId } from './data/course';
import { FORMATS, hasStrokes, holeRange, sameConfig, type Format, type RoundConfig, type RoundLength } from './lib/round';
import { mockPartnerScore, summarize } from './lib/scoring';
import { useBag, useRound } from './lib/hooks';
import { useAuth, type Visibility } from './auth/AuthContext';
import { SignIn } from './views/SignIn';
import { ProfileView, VisibilityPicker } from './views/Profile';
import { SettingsView } from './views/Settings';
import { usePrefs } from './i18n/prefs';
import { completeRemoteRound, useRoundSync } from './lib/sync';

const FORMAT_HELP: Record<Format, string> = {
  'Stroke Play': 'Every stroke counts. Total vs par.',
  'Match Play': 'Win, lose or halve each hole against your opponent.',
  'Stableford': 'Points per hole: bogey 1, par 2, birdie 3, eagle 4.',
  'Scramble': 'Team picks the best shot each time; one team score.',
  'Best Ball': 'Each plays their own ball; the lower score counts for the team.',
  'Alt Shot': 'Partners alternate shots on one ball; one team score.',
};
const NEEDS_PARTNER: Format[] = ['Match Play', 'Best Ball'];

type View = 'menu' | 'course' | 'invite' | 'bag' | 'friends' | 'hud' | 'scorecard' | 'profile' | 'settings';

const MOCK_DATA = {
  friends: {
    leaderboard: [
      { rank: 1, name: 'Alex Thompson', handle: '@alex_t', score: '-3' },
      { rank: 2, name: 'Edgar Chavira Rios', handle: '@Exclusive.Golf', score: 'E', isUser: true },
      { rank: 3, name: 'Marcus Chen', handle: '@marcus.c', score: '+2' },
      { rank: 4, name: 'Sarah Jenkins', handle: '@s_jenks', score: '+4' },
    ],
    network: [
      { id: 'f1', name: 'Jordan Spieth', handle: '@jspieth', liveScore: '-1', hcp: 2.1 },
      { id: 'f2', name: 'Justin Thomas', handle: '@jthomas', liveScore: 'E', hcp: 3.4 },
      { id: 'f3', name: 'Rickie Fowler', handle: '@rickief', liveScore: '+1', hcp: 5.0 },
      { id: 'f4', name: 'Max Homa', handle: '@max.homa', liveScore: '+2', hcp: 1.8 }
    ]
  }
};

export default function App() {
  // Navigation State
  const [currentView, setCurrentView] = useState<View>('menu'); // 'menu', 'course', 'invite', 'bag', 'friends', 'hud'
  
  // Select Course / Round State
  const [courseSetup, setCourseSetup] = useState({
    tee: 'blue' as TeeId,
    format: 'Stroke Play' as Format,
    length: '18' as RoundLength,
    tournamentMode: false,
    visibility: null as Visibility | null, // null → profile default
    selectedFriends: [] as string[]
  });
  const auth = useAuth();
  const { t, d, u } = usePrefs();
  const roundVisibility: Visibility = courseSetup.visibility ?? auth.profile.stats_visibility;
  const setupConfig: RoundConfig = { tee: courseSetup.tee, format: courseSetup.format, length: courseSetup.length };

  const [round, dispatch] = useRound();
  const sync = useRoundSync(round, dispatch, {
    userId: auth.status === 'signedIn' ? auth.user?.id ?? null : null,
    visibility: roundVisibility,
  });
  const { bag, gear, setGear, setCarry, resetCarry } = useBag();

  const startRound = () => {
    if (hasStrokes(round) && sameConfig(round.config, setupConfig)) return setCurrentView('hud');
    if (hasStrokes(round) && !window.confirm('Start a new round with these settings? Current scores will be cleared.')) return;
    dispatch({ type: 'start', config: setupConfig });
    setCurrentView('hud');
  };

  // Friends State
  const [friendsTab, setFriendsTab] = useState<'leaderboard' | 'network'>('leaderboard'); // 'leaderboard', 'network'
  const [networkSubView, setNetworkSubView] = useState<'list' | 'scan' | 'qr' | 'share'>('list'); // 'list', 'scan', 'qr', 'share'

  const WeatherWidgets = () => (
    <div className="flex flex-col gap-1.5 shrink-0 items-end pointer-events-auto z-20">
      <div className="flex items-center bg-black/40 backdrop-blur-md border border-white/10 rounded-full px-2.5 py-1.5 shadow-sm">
        <span className="text-white font-bold text-[10px] tracking-tight mr-2">72°</span>
        <div className="w-px h-3 bg-white/20 mr-2"></div>
        <div className="flex items-center gap-1 text-white/90 font-medium">
          <Wind size={10} className="text-sky-300" />
          <span className="text-[10px]">12mph</span>
        </div>
      </div>
      <div className="flex items-center bg-black/40 backdrop-blur-md border border-white/10 rounded-full px-2.5 py-1.5 shadow-sm">
        <div className="flex items-center gap-1 text-white/90 font-medium">
          <span className="text-[10px] leading-none text-blue-300">☔</span>
          <span className="text-[10px]">20%</span>
        </div>
        <div className="w-px h-3 bg-white/20 mx-2"></div>
        <div className="flex items-center gap-1 text-white/90 font-medium">
          <Sun size={10} className="text-amber-400" />
          <span className="text-[10px]">UV 6</span>
        </div>
      </div>
    </div>
  );

  const ViewMenu = () => (
    <div className="relative w-full h-full flex flex-col p-5 pb-8 justify-between">
      <div className="flex justify-between items-start z-10 w-full">
        <div className="flex flex-col items-start mt-2">
          <div className="w-8 h-8 rounded-full border border-white/10 bg-white/5 flex items-center justify-center mb-2 backdrop-blur-sm shadow-lg">
             <Target size={14} className="text-emerald-400" />
          </div>
          <h1 className="text-xs font-black text-white tracking-[0.25em] drop-shadow-md">EXCLUSIVE.GOLF</h1>
          <div className="h-[2px] w-6 bg-emerald-500 mt-2 rounded-full opacity-80"></div>
        </div>
        {WeatherWidgets()}
      </div>

      <div className="flex flex-col gap-3 z-10 mt-auto">
        {[
          { id: 'course', label: t('menu.selectCourse'), icon: <MapPin size={14} /> },
          { id: 'bag', label: t('menu.myBag'), icon: <Briefcase size={14} /> },
          { id: 'friends', label: t('menu.friends'), icon: <Users size={14} /> },
          { id: 'settings', label: t('menu.settings'), icon: <Settings size={14} /> }
        ].map(item => (
          <button
            key={item.id}
            onClick={() => setCurrentView(item.id as View)}
            className="w-full bg-black/40 hover:bg-black/60 backdrop-blur-md border border-white/10 rounded-2xl p-4 flex items-center justify-between transition-all active:scale-[0.98] shadow-sm"
          >
            <div className="flex items-center gap-3">
              <div className="bg-white/10 p-2 rounded-xl text-white/80">
                {item.icon}
              </div>
              <span className="text-white font-semibold text-[13px] tracking-wide uppercase">{item.label}</span>
            </div>
            <ChevronRight size={16} className="text-white/30" />
          </button>
        ))}
      </div>
    </div>
  );

  const ViewInvite = () => {
    const toggleFriend = (id: string) => {
      setCourseSetup(prev => ({
        ...prev,
        selectedFriends: prev.selectedFriends.includes(id) 
          ? prev.selectedFriends.filter(fid => fid !== id)
          : [...prev.selectedFriends, id]
      }));
    };

    return (
      <div className="relative w-full h-full flex flex-col p-5">
        <div className="flex items-center gap-3 z-10 mb-6">
          <button onClick={() => setCurrentView('course')} className="h-8 w-8 rounded-full bg-black/40 backdrop-blur-md border border-white/10 flex items-center justify-center text-white/80 hover:bg-white/10 transition-colors active:scale-95">
            <ChevronLeft size={16} />
          </button>
          <h2 className="text-white font-bold text-xs tracking-widest uppercase">Invite Players</h2>
        </div>

        <div className="flex flex-col gap-5 z-10 overflow-y-auto no-scrollbar pb-24">
          <button className="w-full bg-emerald-500/10 border border-emerald-500/30 backdrop-blur-md rounded-xl p-4 flex flex-col items-center justify-center gap-2 hover:bg-emerald-500/20 transition-colors">
            <ScanLine size={24} className="text-emerald-400" />
            <span className="text-emerald-400 font-bold text-xs uppercase tracking-widest">Scan QR Code</span>
            <span className="text-emerald-400/60 text-[9px] text-center">Add a new player nearby</span>
          </button>

          <div className="flex flex-col gap-2 mt-2">
            <span className="text-[10px] text-white/50 uppercase font-bold tracking-widest pl-1">Your Network</span>
            {MOCK_DATA.friends.network.map(friend => {
              const isSelected = courseSetup.selectedFriends.includes(friend.id);
              return (
                <div key={friend.id} onClick={() => toggleFriend(friend.id)} className={`flex items-center justify-between p-3 rounded-xl border backdrop-blur-md cursor-pointer transition-all ${isSelected ? 'bg-emerald-900/20 border-emerald-500/40' : 'bg-black/40 border-white/10 hover:bg-white/5'}`}>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center border border-white/5">
                      <span className="text-white/70 font-bold text-[10px]">{friend.name.split(' ').map(n=>n[0]).join('')}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className={`font-bold text-[11px] ${isSelected ? 'text-emerald-400' : 'text-white/90'}`}>{friend.name}</span>
                      <span className="text-white/40 text-[9px]">{friend.handle}</span>
                    </div>
                  </div>
                  <div className={`w-5 h-5 rounded-md border flex items-center justify-center ${isSelected ? 'bg-emerald-500 border-emerald-500' : 'border-white/20'}`}>
                    {isSelected && <Check size={12} className="text-white" />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="absolute bottom-6 left-5 right-5 z-20">
          <div className="bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl p-1.5">
            <button onClick={() => setCurrentView('course')} className="w-full bg-white/10 text-white rounded-xl py-3.5 font-bold text-xs tracking-widest uppercase hover:bg-white/20 active:scale-[0.98] transition-all border border-white/5">
              Save & Return
            </button>
          </div>
        </div>
      </div>
    );
  };

  const ViewCourse = () => {
    const teeOptions: { id: TeeId; color: string; border: string }[] = [
      { id: 'black', color: 'bg-zinc-900', border: 'border-zinc-700' },
      { id: 'blue', color: 'bg-blue-600', border: 'border-blue-400' },
      { id: 'white', color: 'bg-gray-100', border: 'border-white' },
      { id: 'red', color: 'bg-red-600', border: 'border-red-400' },
    ];
    const setupRange = holeRange(courseSetup.length);
    const teeYards = (tee: TeeId) =>
      holesFor(tee).slice(setupRange.start, setupRange.end + 1).reduce((a, h) => a + h.yards, 0);
    const setupPar = PARS.slice(setupRange.start, setupRange.end + 1).reduce((a, b) => a + b, 0);
    const is9 = courseSetup.length !== '18';
    const resuming = hasStrokes(round) && sameConfig(round.config, setupConfig);
    const pill = (active: boolean) =>
      `flex-1 py-2 rounded-lg text-[10px] font-bold tracking-widest uppercase transition-all border ${
        active ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400' : 'border-transparent text-white/50 hover:text-white/80'
      }`;

    return (
      <div className="relative w-full h-full flex flex-col p-5">
        <div className="flex items-center gap-3 z-10 mb-6">
          <button onClick={() => setCurrentView('menu')} className="h-8 w-8 rounded-full bg-black/40 backdrop-blur-md border border-white/10 flex items-center justify-center text-white/80 hover:bg-white/10 transition-colors active:scale-95">
            <ChevronLeft size={16} />
          </button>
          <h2 className="text-white font-bold text-xs tracking-widest uppercase">{t('setup.title')}</h2>
        </div>

        <div className="flex flex-col gap-5 z-10 overflow-y-auto no-scrollbar pb-24">
          
          <div className="flex flex-col gap-2">
            <span className="text-[10px] text-white/50 uppercase font-bold tracking-widest pl-1">{t('setup.course')}</span>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search size={14} className="text-white/40" />
              </div>
              <input type="text" placeholder={t('setup.search')} className="w-full bg-black/40 backdrop-blur-md border border-white/10 rounded-xl py-3 pl-9 pr-3 text-xs text-white placeholder-white/30 focus:outline-none focus:border-emerald-500/50" />
            </div>
            <button className="self-start mt-1 bg-white/10 border border-white/10 rounded-full px-3 py-1.5 flex items-center gap-1.5 hover:bg-white/20 transition-colors">
              <MapPin size={10} className="text-emerald-400" />
              <span className="text-[11px] font-medium text-white/90">{COURSE.name}</span>
            </button>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-[10px] text-white/50 uppercase font-bold tracking-widest pl-1">{t('setup.holes')}</span>
            <div role="radiogroup" aria-label="Round length" className="flex gap-1 bg-black/40 backdrop-blur-md border border-white/10 rounded-xl p-1">
              <button role="radio" aria-checked={!is9} onClick={() => setCourseSetup({ ...courseSetup, length: '18' })} className={pill(!is9)}>{t('setup.18')}</button>
              <button role="radio" aria-checked={is9} onClick={() => setCourseSetup({ ...courseSetup, length: is9 ? courseSetup.length : 'front' })} className={pill(is9)}>{t('setup.9')}</button>
            </div>
            {is9 && (
              <div role="radiogroup" aria-label="Which nine" className="grid grid-cols-2 gap-2">
                {([['front', t('setup.front'), t('setup.front.sub')], ['back', t('setup.back'), t('setup.back.sub')]] as const).map(([id, label, sub]) => (
                  <button
                    key={id}
                    role="radio"
                    aria-checked={courseSetup.length === id}
                    onClick={() => setCourseSetup({ ...courseSetup, length: id })}
                    className={`rounded-xl border px-3 py-2.5 text-left backdrop-blur-md transition-all ${courseSetup.length === id ? 'bg-emerald-500/15 border-emerald-500/50' : 'bg-black/40 border-white/10 hover:bg-white/5'}`}
                  >
                    <div className={`text-[11px] font-bold uppercase tracking-wider ${courseSetup.length === id ? 'text-emerald-400' : 'text-white/80'}`}>{label}</div>
                    <div className="text-[9px] text-white/40 mt-0.5">{sub}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-[10px] text-white/50 uppercase font-bold tracking-widest pl-1">{t('setup.partners')}</span>
            <button onClick={() => setCurrentView('invite')} className="w-full bg-black/40 backdrop-blur-md border border-white/10 hover:border-emerald-500/30 rounded-xl p-3 flex items-center justify-between transition-colors">
              <div className="flex items-center gap-2">
                <UserPlus size={16} className="text-emerald-400" />
                <span className="text-[11px] text-white/80 font-bold uppercase tracking-wider">{t('setup.invite')}</span>
              </div>
              <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                {courseSetup.selectedFriends.length} {t('setup.selected')}
              </span>
            </button>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-[10px] text-white/50 uppercase font-bold tracking-widest pl-1">{t('setup.tees')}</span>
            <div className="bg-black/40 backdrop-blur-md border border-white/10 rounded-xl p-3">
              <div className="flex items-center justify-between px-1">
                {teeOptions.map(tee => (
                  <button
                    key={tee.id}
                    aria-label={`${TEES[tee.id].label} tees`}
                    aria-pressed={courseSetup.tee === tee.id}
                    onClick={() => setCourseSetup({...courseSetup, tee: tee.id})}
                    className="flex flex-col items-center gap-1.5"
                  >
                    <span className={`w-8 h-8 rounded-full transition-all ${tee.color} ${tee.border} border-2 ${courseSetup.tee === tee.id ? 'ring-2 ring-emerald-500 ring-offset-2 ring-offset-zinc-900 scale-110' : 'opacity-60'}`} />
                    <span className={`font-mono text-[10px] ${courseSetup.tee === tee.id ? 'text-white' : 'text-white/40'}`}>{d(teeYards(tee.id)).toLocaleString()}{u}</span>
                  </button>
                ))}
              </div>
              <div className="mt-3 flex justify-between border-t border-white/10 pt-2 text-[9px] font-bold uppercase tracking-widest text-white/40">
                <span>{TEES[courseSetup.tee].label} · Par {setupPar}</span>
                <span>Rating {TEES[courseSetup.tee].rating} / Slope {TEES[courseSetup.tee].slope}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-[10px] text-white/50 uppercase font-bold tracking-widest pl-1">{t('setup.format')}</span>
            <div className="grid grid-cols-3 gap-2">
              {FORMATS.map(format => (
                <button
                  key={format}
                  onClick={() => setCourseSetup({...courseSetup, format})}
                  className={`py-2 px-1 text-center rounded-xl text-[10px] font-bold tracking-wide transition-all border ${
                    courseSetup.format === format ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400' : 'bg-black/40 border-white/10 text-white/60 hover:bg-white/10'
                  }`}
                >
                  {format}
                </button>
              ))}
            </div>
            <p className="px-1 text-[10px] leading-snug text-white/50">
              {FORMAT_HELP[courseSetup.format]}
              {NEEDS_PARTNER.includes(courseSetup.format) && (
                <span className="text-emerald-400/80">
                  {' '}{courseSetup.selectedFriends.length
                    ? `Partner: ${MOCK_DATA.friends.network.find(f => f.id === courseSetup.selectedFriends[0])?.name}.`
                    : courseSetup.format === 'Match Play' ? 'No player invited: you play against par.' : 'Invite a player to pair up.'}
                </span>
              )}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-[10px] text-white/50 uppercase font-bold tracking-widest pl-1">{t('setup.visibility')}</span>
            <VisibilityPicker label="Round visibility" value={roundVisibility} onChange={v => setCourseSetup({ ...courseSetup, visibility: v })} />
            {auth.status !== 'signedIn' && <p className="px-1 text-[9px] text-white/40">{t('setup.guestLocal')}</p>}
          </div>

          <div className="flex items-center justify-between bg-black/40 backdrop-blur-md border border-white/10 rounded-xl p-4 mb-2">
            <div className="flex flex-col">
              <span className="text-[11px] font-bold text-white tracking-wide uppercase">{t('setup.tournament')}</span>
              <span className="text-[9px] text-white/50 mt-0.5">{t('setup.tournament.sub')}</span>
            </div>
            <button onClick={() => setCourseSetup({...courseSetup, tournamentMode: !courseSetup.tournamentMode})} className={`w-10 h-5 rounded-full relative transition-colors ${courseSetup.tournamentMode ? 'bg-emerald-500' : 'bg-white/10 border border-white/10'}`}>
              <div className={`absolute top-[1.5px] left-[2px] w-4 h-4 bg-white rounded-full transition-transform ${courseSetup.tournamentMode ? 'translate-x-[18px]' : 'translate-x-0'}`} />
            </button>
          </div>
        </div>

        <div className="absolute bottom-6 left-5 right-5 z-20">
          <div className="bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl p-1.5 shadow-2xl">
            <button onClick={startRound} className="w-full bg-emerald-500 text-white rounded-xl py-3.5 font-bold text-xs tracking-widest uppercase hover:bg-emerald-400 active:scale-[0.98] transition-all">
              {resuming ? `${t('setup.resume')} ${round.current + 1}` : t('setup.start')}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const ViewFriends = () => {
    
    // Sub-views for the Network tab
    const NetworkTabs = () => (
      <div className="flex items-center gap-1.5 mb-4 overflow-x-auto no-scrollbar pb-1">
        {[
          { id: 'list', label: 'List' },
          { id: 'scan', label: 'Scan QR' },
          { id: 'qr', label: 'My QR' },
          { id: 'share', label: 'Share' }
        ].map(tab => (
          <button 
            key={tab.id}
            onClick={() => setNetworkSubView(tab.id as typeof networkSubView)}
            className={`whitespace-nowrap px-3 py-1.5 rounded-full text-[9px] font-bold tracking-widest uppercase transition-all ${networkSubView === tab.id ? 'bg-white/20 text-white border border-white/10' : 'bg-black/20 text-white/50 border border-transparent hover:bg-white/5'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    );

    return (
      <div className="relative w-full h-full flex flex-col p-5">
        <div className="flex items-center gap-3 z-10 mb-6 shrink-0">
          <button onClick={() => setCurrentView('menu')} className="h-8 w-8 rounded-full bg-black/40 backdrop-blur-md border border-white/10 flex items-center justify-center text-white/80 hover:bg-white/10 active:scale-95">
            <ChevronLeft size={16} />
          </button>
          <h2 className="text-white font-bold text-xs tracking-widest uppercase">Friends</h2>
        </div>

        <div className="flex bg-black/40 backdrop-blur-md border border-white/10 rounded-xl p-1 mb-4 z-10 shrink-0">
          <button onClick={() => setFriendsTab('leaderboard')} className={`flex-1 py-2 text-center rounded-lg text-[10px] font-bold tracking-wide uppercase transition-all ${friendsTab === 'leaderboard' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-white/50 border border-transparent'}`}>Leaderboard</button>
          <button onClick={() => setFriendsTab('network')} className={`flex-1 py-2 text-center rounded-lg text-[10px] font-bold tracking-wide uppercase transition-all ${friendsTab === 'network' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-white/50 border border-transparent'}`}>Network</button>
        </div>

        <div className="flex flex-col z-10 overflow-y-auto no-scrollbar pb-10 flex-1">
          {friendsTab === 'leaderboard' ? (
            <div className="flex flex-col gap-2">
              {MOCK_DATA.friends.leaderboard.map(player => (
                <div key={player.handle} className={`flex items-center justify-between p-4 rounded-xl border backdrop-blur-sm ${player.isUser ? 'bg-emerald-900/20 border-emerald-500/40' : 'bg-black/40 border-white/10'}`}>
                  <div className="flex items-center gap-3">
                    <div className="w-6 flex justify-center">
                      {player.rank === 1 ? <Trophy size={16} className="text-amber-400" /> : <span className="text-white/60 font-black text-sm">{player.rank}</span>}
                    </div>
                    <div className="flex flex-col">
                      <span className={`font-bold text-xs ${player.isUser ? 'text-emerald-400' : 'text-white/90'}`}>{player.name}</span>
                      <span className="text-white/40 text-[9px] tracking-wide">{player.handle}</span>
                    </div>
                  </div>
                  <span className={`font-black text-sm ${player.score.startsWith('-') ? 'text-red-400' : player.score === 'E' ? 'text-emerald-400' : 'text-white/80'}`}>{player.score}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col h-full">
              {NetworkTabs()}
              
              {/* Network: List View */}
              {networkSubView === 'list' && (
                <div className="flex flex-col gap-4">
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Search size={14} className="text-white/40" />
                    </div>
                    <input type="text" placeholder="Search Golfers..." className="w-full bg-black/40 backdrop-blur-md border border-white/10 rounded-xl py-3 pl-9 pr-3 text-xs text-white placeholder-white/30 focus:outline-none focus:border-emerald-500/50" />
                  </div>
                  <div className="flex flex-col gap-2">
                    {MOCK_DATA.friends.network.map(friend => (
                      <div key={friend.id} className="flex items-center justify-between p-3 bg-black/40 backdrop-blur-md border border-white/10 rounded-xl">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center border border-white/5">
                            <span className="text-white/70 font-bold text-[10px]">{friend.name.split(' ').map(n=>n[0]).join('')}</span>
                          </div>
                          <div className="flex flex-col">
                            <span className="font-bold text-[11px] text-white/90">{friend.name}</span>
                            <span className="text-white/40 text-[9px]">{friend.handle} · {friend.hcp} HCP</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Network: Scan QR */}
              {networkSubView === 'scan' && (
                <div className="flex-1 flex flex-col items-center justify-center gap-4 bg-black/20 rounded-2xl border border-white/5 p-6">
                  <div className="relative w-48 h-48 border-2 border-emerald-500/50 rounded-2xl flex items-center justify-center bg-black/40 overflow-hidden">
                    <div className="absolute inset-0 bg-emerald-500/10 animate-pulse"></div>
                    <ScanLine size={48} className="text-emerald-400" />
                    {/* Scanner corner brackets */}
                    <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-emerald-400 rounded-tl-xl"></div>
                    <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-emerald-400 rounded-tr-xl"></div>
                    <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-emerald-400 rounded-bl-xl"></div>
                    <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-emerald-400 rounded-br-xl"></div>
                  </div>
                  <p className="text-center text-[10px] text-white/60 tracking-wider">Position QR code within the frame to add friend.</p>
                </div>
              )}

              {/* Network: My QR */}
              {networkSubView === 'qr' && (
                <div className="flex-1 flex flex-col items-center justify-center gap-6 bg-black/20 rounded-2xl border border-white/5 p-6">
                  <div className="bg-white p-4 rounded-2xl shadow-xl">
                    <QrCode size={160} className="text-zinc-900" strokeWidth={1} />
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="text-white font-bold tracking-wide">Edgar Chavira Rios</span>
                    <span className="text-emerald-400 text-[11px] font-bold tracking-widest uppercase mt-1">@Exclusive.Golf</span>
                  </div>
                </div>
              )}

              {/* Network: Share App */}
              {networkSubView === 'share' && (
                <div className="flex flex-col gap-3">
                  <p className="text-[11px] text-white/60 px-1 mb-2">Share the app with your network.</p>
                  {[
                    { icon: <MessageCircle size={18} />, label: 'Messages', color: 'bg-green-500/20 text-green-400' },
                    { icon: <Share2 size={18} />, label: 'Facebook / Messenger', color: 'bg-blue-600/20 text-blue-400' },
                    { icon: <AtSign size={18} />, label: 'X (Twitter)', color: 'bg-white/10 text-white' },
                    { icon: <Link2 size={18} />, label: 'Copy Link', color: 'bg-zinc-700/50 text-white/80' }
                  ].map((btn, idx) => (
                    <button key={idx} className="w-full flex items-center gap-4 bg-black/40 backdrop-blur-md border border-white/10 rounded-xl p-4 hover:bg-white/5 transition-all">
                      <div className={`p-2 rounded-lg ${btn.color}`}>
                        {btn.icon}
                      </div>
                      <span className="font-bold text-[11px] text-white/90">{btn.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  const hudBuddies = courseSetup.selectedFriends
    .map(id => MOCK_DATA.friends.network.find(f => f.id === id))
    .filter((f): f is (typeof MOCK_DATA.friends.network)[number] => Boolean(f));

  // --- Live round derivations (tee → yardages, length → hole range, format → scoring) ---
  const roundHoles = holesFor(round.config.tee);
  const range = holeRange(round.config.length);
  const rangeIdx = Array.from({ length: range.end - range.start + 1 }, (_, k) => range.start + k);
  const partner = hudBuddies[0];
  const scoreRound = (excludeCurrent: boolean) => summarize({
    format: round.config.format,
    pars: rangeIdx.map(i => PARS[i]),
    mine: rangeIdx.map(i => (excludeCurrent && i === round.current) || !round.shots[i].length ? null : round.shots[i].length),
    partner: rangeIdx.map(i => (partner ? mockPartnerScore(partner.id, i + 1, PARS[i]) : null)),
    partnerName: partner?.name.split(' ')[0],
  });
  // Buddies' running score over the holes you've finished (mock pace-matched sync).
  const liveBuddies = hudBuddies.map(b => {
    const d = rangeIdx
      .filter(i => i !== round.current && round.shots[i].length)
      .reduce((a, i) => a + mockPartnerScore(b.id, i + 1, PARS[i]) - PARS[i], 0);
    return { ...b, liveScore: d === 0 ? 'E' : d > 0 ? `+${d}` : `${d}` };
  });

  const gated = auth.status === 'loading' || auth.status === 'signedOut';

  return (
    <div className="h-dvh w-full bg-black font-sans selection:bg-emerald-500/30 desktop:flex desktop:items-center desktop:justify-center desktop:bg-zinc-950 desktop:p-4">
      <div className="relative h-full w-full overflow-hidden bg-black desktop:aspect-[9/19.5] desktop:h-[min(860px,calc(100dvh-2rem))] desktop:w-auto desktop:rounded-[3rem] desktop:border-[8px] desktop:border-zinc-900 desktop:shadow-[0_0_50px_rgba(0,0,0,0.5)]">
        {gated ? (
          <>
            <div className="absolute inset-0 z-0">
              <MapPlaceholder />
              <div className="absolute inset-0 bg-black/40" />
            </div>
            <div className="relative z-20 h-full w-full p-safe-inset">
              {auth.status === 'signedOut' && <SignIn />}
            </div>
          </>
        ) : currentView === 'hud' ? (
          <CaddieHud
            hole={roundHoles[round.current]}
            tee={round.config.tee}
            strokes={round.shots[round.current].length}
            roundScore={scoreRound(true).headline}
            format={round.config.format}
            isLastHole={round.current === range.end}
            bag={bag}
            onLog={shot => dispatch({ type: 'log', shot })}
            onUndo={() => dispatch({ type: 'undo' })}
            onNext={() => {
              if (round.current !== range.end) return dispatch({ type: 'next' });
              void sync.flush(round.current);
              setCurrentView('scorecard');
            }}
            sync={sync.status}
            remoteRoundId={round.remoteId}
            onScorecard={() => setCurrentView('scorecard')}
            onExit={() => setCurrentView('menu')}
            buddies={liveBuddies}
            tournamentMode={courseSetup.tournamentMode}
          />
        ) : (
          <>
            <div className="absolute inset-0 z-0">
              <MapPlaceholder />
              <div className="absolute inset-0 bg-black/50 backdrop-blur-md" />
            </div>
            <div className="relative z-20 h-full w-full p-safe-inset">
              {currentView === 'menu' && ViewMenu()}
              {currentView === 'course' && ViewCourse()}
              {currentView === 'invite' && ViewInvite()}
              {currentView === 'bag' && <BagWizard bag={bag} gear={gear} setGear={setGear} setCarry={setCarry} resetCarry={resetCarry} onExit={() => setCurrentView('menu')} />}
              {currentView === 'friends' && ViewFriends()}
              {currentView === 'profile' && <ProfileView onBack={() => setCurrentView('settings')} />}
              {currentView === 'settings' && <SettingsView onBack={() => setCurrentView('menu')} onProfile={() => setCurrentView('profile')} />}
              {currentView === 'scorecard' && (
                <Scorecard
                  round={round}
                  holes={roundHoles}
                  summary={scoreRound(false)}
                  onBack={() => setCurrentView('hud')}
                  onSelectHole={i => { dispatch({ type: 'goto', hole: i }); setCurrentView('hud'); }}
                  onNewRound={() => {
                    if (window.confirm('End this round and clear all scores?')) {
                      if (round.remoteId) void completeRemoteRound(round.remoteId);
                      dispatch({ type: 'start', config: round.config });
                      setCurrentView('menu');
                    }
                  }}
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
