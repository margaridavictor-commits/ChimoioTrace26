import { useState, useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Leaf, 
  MapPin, 
  QrCode, 
  ShieldCheck, 
  History, 
  User, 
  Camera,
  Search,
  ChevronLeft,
  AlertCircle,
  Phone,
  Lock,
  ArrowRight,
  UserPlus,
  X,
  LocateFixed,
  Mail
} from 'lucide-react';
import { cn, formatDate } from './lib/utils';
import { auth, db } from './lib/firebase';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword
} from 'firebase/auth';
import { doc, getDoc, setDoc, collection, query, where, onSnapshot, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import type { UserProfile, Batch, Farmer } from './types';
import { getDocFromServer } from 'firebase/firestore';
import { storage } from './lib/firebase';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

interface ToastMessage {
  id: string;
  message: string;
  type: 'error' | 'success' | 'info';
}

const TOAST_EVENT = 'app:toast';

function showToast(message: string, type: 'error' | 'success' | 'info' = 'error') {
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: { message, type } }));
}

function getFriendlyFirestoreMessage(error: any): string {
  const code = error?.code;
  switch (code) {
    case 'permission-denied':
      return 'Acesso negado. Você não tem permissão para realizar esta ação (Regras de Segurança).';
    case 'not-found':
      return 'O recurso solicitado não foi encontrado no sistema.';
    case 'unavailable':
      return 'O banco de dados está offline ou temporariamente indisponível.';
    case 'deadline-exceeded':
      return 'O tempo limite da operação foi excedido. Tente novamente.';
    case 'already-exists':
      return 'Já existe um registro com estas informações.';
    case 'unauthenticated':
      return 'Usuário não autenticado. Por favor, faça login novamente.';
    case 'resource-exhausted':
      return 'Cota de requisições excedida. Tente novamente mais tarde.';
    case 'failed-precondition':
      return 'A operação falhou devido a uma pré-condição necessária (ex: índice ausente).';
    case 'cancelled':
      return 'A operação foi cancelada pelo usuário ou pelo sistema.';
    default:
      return `Erro no banco de dados: ${error?.message || 'Ocorreu um erro inesperado'}`;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const friendlyMessage = getFriendlyFirestoreMessage(error);
  showToast(friendlyMessage, 'error');

  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error Detailed:', JSON.stringify(errInfo));
  // We no longer throw here to prevent app crash, unless necessary
}

// Fix for default leaflet icon
const defaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

function Data4MozLogo({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="50" r="48" stroke="#334155" strokeWidth="4"/>
      <path d="M50 50 L50 6 A44 44 0 0 0 6 50 Z" fill="#059669" /> {/* Teal top-left */}
      <path d="M50 50 L6 50 A44 44 0 0 0 60 92 Z" fill="#dc2626" /> {/* Red bottom */}
      <path d="M50 50 L60 92 A44 44 0 0 0 50 6 Z" fill="#f59e0b" /> {/* Yellow right */}
      <circle cx="50" cy="50" r="28" fill="white" stroke="#334155" strokeWidth="3"/>
      <rect x="36" y="52" width="8" height="10" fill="#1e293b" rx="1"/>
      <rect x="48" y="44" width="8" height="18" fill="#10b981" rx="1"/>
      <rect x="60" y="36" width="8" height="26" fill="#f59e0b" rx="1"/>
    </svg>
  );
}

function NavTab({ active, icon: Icon, label, onClick, disabled = false }: { active: boolean, icon: any, label: string, onClick: () => void, disabled?: boolean }) {
  return (
    <button 
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex flex-col items-center gap-1 transition-all duration-300",
        active ? "text-emerald-400 scale-110" : "text-white/40 hover:text-white/60",
        disabled && "opacity-20 cursor-not-allowed"
      )}
    >
      <Icon className={cn("w-6 h-6", active && "stroke-[2.5px]")} />
      <span className="text-[10px] font-bold uppercase tracking-tighter">{label}</span>
    </button>
  );
}

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab ] = useState<'consumer' | 'farmer'>('consumer');
  const [subTab, setSubTab] = useState<'home' | 'map' | 'scan' | 'trace'>('home');
  const [view, setView] = useState<'landing' | 'app'>('landing');
  const [authMode, setAuthMode] = useState<'options' | 'login' | 'register'>('options');
  const [lang] = useState<'pt' | 'en'>('pt');
  const [scannedBatch, setScannedBatch] = useState<Batch | null>(null);

  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    const handleToast = (e: any) => {
      const id = Math.random().toString(36).substring(7);
      setToasts(prev => [...prev, { id, ...e.detail }]);
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, 6000);
    };
    window.addEventListener(TOAST_EVENT, handleToast);
    return () => window.removeEventListener(TOAST_EVENT, handleToast);
  }, []);

  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    }
    testConnection();

    return onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          let userDoc;
          try {
            userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          } catch (e) {
            handleFirestoreError(e, OperationType.GET, `users/${firebaseUser.uid}`);
          }

          if (userDoc?.exists()) {
            setUser(userDoc.data() as UserProfile);
            if (view === 'landing') setView('app');
          } else {
            // New user (likely from Google Login since phone login handles its own creation)
            const newUser: UserProfile = {
              uid: firebaseUser.uid,
              email: firebaseUser.email || '',
              displayName: firebaseUser.displayName || firebaseUser.phoneNumber || 'Usuário',
              role: 'farmer',
              createdAt: new Date().toISOString()
            };
            
            try {
              // Create user doc
              await setDoc(doc(db, 'users', firebaseUser.uid), newUser);
              
              // Ensure farmer doc exists for this user
              const farmerRef = doc(db, 'farmers', firebaseUser.uid);
              await setDoc(farmerRef, {
                farmerId: firebaseUser.uid,
                name: newUser.displayName,
                location: { lat: -19.116, lng: 33.483 },
                province: '',
                certificationStatus: 'pending',
                phoneNumber: firebaseUser.phoneNumber || '',
                photoUrl: ''
              }, { merge: true });
            } catch (e) {
              handleFirestoreError(e, OperationType.WRITE, `users/${firebaseUser.uid} (init)`);
            }

            setUser(newUser);
            if (view === 'landing') setView('app');
          }
        } catch (error) {
          console.error("Auth initialization error:", error);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });
  }, [view]);

  const loginWithGoogle = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      setView('app');
      setActiveTab('farmer');
    } catch (error: any) {
      if (error.code !== 'auth/popup-closed-by-user') {
        console.error('Login error:', error);
        showToast('Erro ao entrar com Google. Por favor, tente novamente.', 'error');
      }
    }
  };

  const loginWithPhone = async () => {
    // This is now handled within LoginForm's internal state or we can pass a finished login function
    setView('app');
    setActiveTab('farmer');
  };

  const handleRegister = async (data: any) => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, data.email, data.password);
      const firebaseUser = userCredential.user;

      const newUser: UserProfile = {
        uid: firebaseUser.uid,
        email: data.email,
        displayName: data.name,
        role: 'farmer',
        phoneNumber: data.phone,
        province: data.location,
        createdAt: new Date().toISOString()
      };

      // Create both documents
      await Promise.all([
        setDoc(doc(db, 'users', firebaseUser.uid), newUser),
        setDoc(doc(db, 'farmers', firebaseUser.uid), {
          farmerId: firebaseUser.uid,
          name: data.name,
          location: { lat: -19.116, lng: 33.483 },
          province: data.location,
          phoneNumber: data.phone,
          certificationStatus: 'pending',
          photoUrl: ''
        }, { merge: true })
      ]);

      setUser(newUser);
      setView('app');
      setActiveTab('farmer');
      showToast('Bem-vindo à plataforma AgroTrace!', 'success');
    } catch (error: any) {
      console.error('Registration error:', error);
      let message = 'Erro ao realizar o registo.';
      if (error.code === 'auth/email-already-in-use') message = 'Este email já está em uso.';
      if (error.code === 'auth/weak-password') message = 'A senha deve ter pelo menos 6 caracteres.';
      if (error.code === 'auth/invalid-email') message = 'Email inválido.';
      showToast(message, 'error');
      throw error;
    }
  };

  const handleEmailLogin = async (data: any) => {
    try {
      await signInWithEmailAndPassword(auth, data.email, data.password);
      setView('app');
      setActiveTab('farmer');
    } catch (error: any) {
      console.error('Login error:', error);
      let message = 'E-mail ou senha incorretos.';
      if (error.code === 'auth/user-not-found') message = 'Usuário não encontrado.';
      if (error.code === 'auth/wrong-password') message = 'Senha incorreta.';
      showToast(message, 'error');
      throw error;
    }
  };

  const logout = () => {
    signOut(auth);
    setView('landing');
    setAuthMode('options');
  };

  if (loading) return (
    <div className="h-screen w-full flex items-center justify-center bg-[#FDFCF9]">
      <motion.div 
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
      >
        <Leaf className="w-8 h-8 text-emerald-600" />
      </motion.div>
    </div>
  );

  if (view === 'landing') {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-[#FDFCF9] md:bg-gray-100 p-0 md:p-8">
        <div className="w-full max-w-md h-full md:h-[844px] bg-white md:rounded-[3rem] overflow-hidden relative flex flex-col shadow-2xl">
          {/* Background Image */}
          <div className="absolute inset-0 z-0">
             <img 
              src="https://images.unsplash.com/photo-1592982537447-7440770cbfc9?auto=format&fit=crop&q=80&w=1200" 
              alt="Background" 
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-emerald-950 via-emerald-900/40 to-transparent"></div>
          </div>

          <div className="flex-1 flex flex-col justify-end p-8 pb-12 z-10 space-y-8">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              <div className="flex items-center gap-4">
                <Data4MozLogo className="w-16 h-16 drop-shadow-xl" />
              </div>
              <div className="space-y-2">
                <h1 className="text-5xl font-bold text-white tracking-tight">AgroTrace</h1>
                <p className="text-emerald-100/80 text-lg font-medium leading-tight">
                  A jornada dos seus alimentos, <br />
                  <span className="text-white italic">transparente e real.</span>
                </p>
              </div>
            </motion.div>

            {authMode === 'options' ? (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="space-y-4"
              >
                <button 
                  onClick={() => { setView('app'); setActiveTab('consumer'); }}
                  className="w-full bg-white text-emerald-900 py-5 rounded-[2rem] font-bold text-sm uppercase tracking-widest shadow-xl active:scale-95 transition-transform"
                >
                  Continuar como Consumidor
                </button>
                <button 
                  onClick={() => setAuthMode('login')}
                  className="w-full bg-emerald-600/30 backdrop-blur-md text-white py-5 rounded-[2rem] font-bold text-sm uppercase tracking-widest border border-white/20 active:scale-95 transition-transform"
                >
                  Portal do Produtor
                </button>
              </motion.div>
            ) : authMode === 'login' ? (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white rounded-[2.5rem] p-8 shadow-2xl"
              >
                <LoginForm 
                  lang={lang} 
                  onBack={() => setAuthMode('options')} 
                  onLogin={loginWithPhone} 
                  onGoogle={loginWithGoogle}
                  onGoRegister={() => setAuthMode('register')}
                  onEmailLogin={handleEmailLogin}
                />
              </motion.div>
            ) : (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white rounded-[2.5rem] p-8 shadow-2xl"
              >
                <RegisterForm 
                  lang={lang} 
                  onBack={() => setAuthMode('login')} 
                  onRegister={handleRegister} 
                />
              </motion.div>
            )}

            <div className="flex justify-center items-center gap-4 opacity-70">
               <div className="h-px flex-1 bg-white/20"></div>
               <div className="flex items-center gap-2">
                 <Data4MozLogo className="w-5 h-5" />
                 <span className="text-[10px] text-white font-bold uppercase tracking-widest italic">Powered by Data4Moz</span>
               </div>
               <div className="h-px flex-1 bg-white/20"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Connection Status Badge */}
      {!isOnline && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
          <div className="bg-amber-500 text-white px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest shadow-lg flex items-center gap-2 animate-bounce">
            <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
            Modo Offline
          </div>
        </div>
      )}

      <div className="min-h-screen bg-[#FDFCF9] flex items-center justify-center p-0 md:p-8">
        {/* Mobile-first Container (Phone Frame on Desktop) */}
        <div className="w-full max-w-md h-screen md:h-[844px] bg-white md:rounded-[3rem] md:shadow-[0_0_0_12px_#1a1a1a,0_20px_50px_rgba(0,0,0,0.2)] overflow-hidden relative flex flex-col border-x border-[#E5E2D9] md:border-none">
          
          {/* Status Bar Mock (iOS style) - Only visible on desktop mockup */}
          <div className="h-12 w-full bg-white/80 backdrop-blur-md items-center justify-between px-8 z-50 sticky top-0 shrink-0 select-none hidden md:flex">
            <span className="text-xs font-bold">9:41</span>
            <div className="flex gap-1.5 items-center">
              <div className="w-4 h-2 bg-black/20 rounded-full"></div>
              <div className="w-2 h-2 bg-black/20 rounded-full"></div>
              <div className="w-5 h-2.5 border border-black/20 rounded-sm relative">
                <div className="absolute right-0.5 top-0.5 bottom-0.5 left-0.5 bg-black rounded-sm"></div>
              </div>
            </div>
          </div>

          <main className="flex-1 overflow-y-auto bg-[#FDFCF9] relative pb-32 invisible-scrollbar">
            {/* Header */}
            <header className="px-6 py-5 flex items-center justify-between sticky top-0 bg-[#FDFCF9]/80 backdrop-blur-md z-40 relative">
              <div className="flex items-center gap-3 min-h-[40px]">
                <AnimatePresence mode="wait">
                  {(activeTab === 'farmer' || (activeTab === 'consumer' && subTab !== 'home')) ? (
                    <motion.button 
                      key="back-button"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      onClick={() => {
                        if (activeTab === 'consumer' && subTab !== 'home') {
                          setSubTab('home');
                        } else {
                          setView('landing');
                        }
                      }}
                      className="absolute left-4 top-1/2 -translate-y-1/2 p-2 hover:bg-emerald-50 rounded-full text-emerald-600 transition-colors z-50"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </motion.button>
                  ) : null}
                </AnimatePresence>
                
                <motion.div 
                  layout 
                  className={cn(
                    "transition-all duration-300",
                    (activeTab === 'farmer' || (activeTab === 'consumer' && subTab !== 'home')) ? "pl-10" : "pl-0"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Data4MozLogo className="w-4 h-4 mt-0.5" />
                    <h1 className="font-bold text-lg tracking-tight leading-none text-emerald-900">
                      {activeTab === 'consumer' ? (subTab === 'home' ? 'AgroTrace' : subTab === 'map' ? 'Explorar' : subTab === 'scan' ? 'Scanner' : 'Rastreio') : 'Portal Produtor'}
                    </h1>
                  </div>
                  <span className="text-[10px] font-bold text-emerald-600/60 uppercase tracking-widest leading-none">Chimoio, MOZ</span>
                </motion.div>
              </div>
              
              <div className="flex items-center gap-3">
                <button 
                  onClick={logout}
                  className="w-10 h-10 rounded-2xl bg-white border border-[#E5E2D9] overflow-hidden flex items-center justify-center hover:bg-red-50 hover:border-red-200 transition-colors active:scale-95 group"
                  title="Sair"
                >
                  {user?.photoUrl ? (
                    <img src={user.photoUrl} className="w-full h-full object-cover group-hover:opacity-20" alt="Profile" />
                  ) : (
                    <User className="w-5 h-5 text-emerald-600 group-hover:text-red-600" />
                  )}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-red-600/10">
                    <X className="w-5 h-5 text-red-600" />
                  </div>
                </button>
              </div>
            </header>

            {/* Content Area */}
            <div className="px-6">
              <AnimatePresence mode="wait">
                {activeTab === 'consumer' ? (
                  <div key="consumer" className="space-y-6">
                    {subTab === 'home' && <HomeView onExplore={() => setSubTab('map')} onScan={() => setSubTab('scan')} />}
                    {subTab === 'map' && <GlobalMapView onSelectBatch={(b) => { setScannedBatch(b); setSubTab('trace'); }} />}
                    {subTab === 'scan' && <ScanView onResult={(batch) => { setScannedBatch(batch); setSubTab('trace'); }} />}
                    {subTab === 'trace' && <TraceView scannedBatch={scannedBatch} />}
                  </div>
                ) : (
                  <FarmerPortal key="farmer" user={user} login={loginWithGoogle} />
                )}
              </AnimatePresence>
            </div>
          </main>

          {/* iOS Style Bottom Home Bar - Desktop Only */}
          <div className="absolute bottom-1 w-32 h-1.5 bg-black/10 rounded-full left-1/2 -translate-x-1/2 z-[60] pointer-events-none hidden md:block"></div>

          {/* Bottom Navigation */}
          <nav className="absolute bottom-6 left-6 right-6 bg-emerald-950/95 backdrop-blur-xl rounded-[2.5rem] p-4 flex items-center justify-between shadow-2xl z-50 border border-white/10">
            <NavTab 
              active={activeTab === 'consumer' && subTab === 'home'} 
              icon={Search} 
              label="Início"
              onClick={() => { setActiveTab('consumer'); setSubTab('home'); }} 
            />
            <NavTab 
              active={activeTab === 'consumer' && subTab === 'map'} 
              icon={MapPin} 
              label="Mapa"
              onClick={() => { setActiveTab('consumer'); setSubTab('map'); }} 
            />
            
            {/* Central Primary Action */}
            <div className="relative">
              <button 
                onClick={() => { setActiveTab('consumer'); setSubTab('scan'); }}
                className="w-16 h-16 bg-emerald-500 rounded-3xl flex items-center justify-center -mt-12 shadow-xl shadow-emerald-500/30 border-[6px] border-[#FDFCF9] group active:scale-90 transition-transform"
              >
                <QrCode className="w-8 h-8 text-white group-hover:rotate-12 transition-transform" />
              </button>
            </div>

            <NavTab 
              active={activeTab === 'farmer'} 
              icon={ShieldCheck} 
              label="Painel"
              onClick={() => setActiveTab('farmer')} 
            />
            <NavTab 
              active={activeTab === 'consumer' && subTab === 'trace' && !!scannedBatch} 
              icon={History} 
              label="Rastro"
              disabled={!scannedBatch}
              onClick={() => { setActiveTab('consumer'); setSubTab('trace'); }} 
            />
          </nav>
        </div>
      </div>

      {/* Notifications Portal */}
      <div className="fixed top-8 right-6 left-6 md:left-auto md:w-80 flex flex-col gap-3 z-[100] pointer-events-none">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 50, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5, transition: { duration: 0.2 } }}
              className={cn(
                "p-4 rounded-2xl shadow-2xl border flex items-start gap-4 pointer-events-auto backdrop-blur-md",
                toast.type === 'error' ? "bg-red-50/95 border-red-100 text-red-900 shadow-red-200/50" : 
                toast.type === 'success' ? "bg-emerald-50/95 border-emerald-100 text-emerald-900 shadow-emerald-200/50" :
                "bg-blue-50/95 border-blue-100 text-blue-900 shadow-blue-200/50"
              )}
            >
              <div className={cn(
                "w-8 h-8 rounded-xl flex items-center justify-center shrink-0",
                toast.type === 'error' ? "bg-red-600 text-white" :
                toast.type === 'success' ? "bg-emerald-600 text-white" :
                "bg-blue-600 text-white"
              )}>
                {toast.type === 'error' ? <AlertCircle className="w-5 h-5" /> : 
                 toast.type === 'success' ? <ShieldCheck className="w-5 h-5" /> : 
                 <Search className="w-5 h-5" />}
              </div>
              <div className="flex-1 pt-0.5">
                <p className="text-[10px] font-black uppercase tracking-tighter opacity-50 mb-0.5">
                  {toast.type === 'error' ? 'Alerta de Erro' : 
                   toast.type === 'success' ? 'Operação Concluída' : 'Notificação'}
                </p>
                <p className="text-xs font-bold leading-tight">{toast.message}</p>
              </div>
              <button 
                onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
                className="p-1 hover:bg-black/5 rounded-lg transition-colors shrink-0"
              >
                <X className="w-4 h-4 opacity-40" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </>
  );
}

function HomeView({ onExplore, onScan }: { onExplore: () => void, onScan: () => void }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-8"
    >
      {/* Hero Welcome */}
      <section className="space-y-2">
        <h2 className="text-3xl font-bold text-emerald-950 tracking-tight leading-tight">
          Bem-vindo ao <br />
          <span className="text-emerald-600">Futuro do Campo.</span>
        </h2>
        <p className="text-sm text-gray-500 font-medium">Rastreabilidade real de Chimoio para si.</p>
      </section>

      {/* Main Feature Card */}
      <section className="relative overflow-hidden group">
        <div className="absolute inset-0 bg-gradient-to-t from-emerald-950/80 to-transparent z-10 rounded-[2.5rem]"></div>
        <img 
          src="https://images.unsplash.com/photo-1592982537447-7440770cbfc9?auto=format&fit=crop&q=80&w=1200" 
          alt="Agriculture" 
          className="w-full h-80 object-cover rounded-[2.5rem] group-hover:scale-105 transition-transform duration-700"
        />
        <div className="absolute bottom-8 left-8 right-8 z-20 space-y-4">
           <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/30 backdrop-blur-md text-white border border-white/20 text-[10px] font-bold uppercase tracking-widest">
             <ShieldCheck className="w-3 h-3" /> Global GAP Certified
           </div>
           <h3 className="text-2xl font-bold text-white leading-tight">Manga de Exportação <br /> Colheita Maio 2024</h3>
           <button 
            onClick={onExplore}
            className="bg-white text-emerald-950 px-6 py-3 rounded-2xl font-bold text-xs uppercase tracking-widest active:scale-95 transition-transform"
           >
             Ver todos os produtores
           </button>
        </div>
      </section>

      {/* Stats Quick Grid */}
      <section className="grid grid-cols-2 gap-4">
        <div className="bg-white p-6 rounded-[2rem] border border-[#E5E2D9] shadow-sm">
          <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center mb-4">
            <Leaf className="w-5 h-5 text-emerald-600" />
          </div>
          <p className="text-[10px] uppercase font-black text-gray-400 tracking-tighter">Produtores</p>
          <h4 className="text-2xl font-bold text-emerald-950">150+</h4>
        </div>
        <div className="bg-white p-6 rounded-[2rem] border border-[#E5E2D9] shadow-sm">
          <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center mb-4">
            <QrCode className="w-5 h-5 text-amber-600" />
          </div>
          <p className="text-[10px] uppercase font-black text-gray-400 tracking-tighter">Lotes</p>
          <h4 className="text-2xl font-bold text-emerald-950">4.2K</h4>
        </div>
      </section>

      {/* Categories / Quick Picks */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
           <h4 className="font-bold text-emerald-950">Categorias em Destaque</h4>
           <button className="text-xs font-bold text-emerald-600 uppercase">Ver tudo</button>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {['Milho', 'Soja', 'Frutas'].map(cat => (
            <button key={cat} className="flex flex-col items-center gap-3 p-4 bg-white rounded-[2rem] border border-[#E5E2D9] active:scale-95 transition-all">
              <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center border border-gray-100">
                <Leaf className="w-6 h-6 text-emerald-500" />
              </div>
              <span className="text-xs font-bold">{cat}</span>
            </button>
          ))}
        </div>
      </section>
      
      <div className="h-12"></div>
    </motion.div>
  );
}

function GlobalMapView({ onSelectBatch }: { onSelectBatch: (b: Batch) => void }) {
  const [batches, setBatches] = useState<Batch[]>([]);

  useEffect(() => {
    const q = collection(db, 'batches');
    const unsubscribe = onSnapshot(q, (snap) => {
      setBatches(snap.docs.map(doc => doc.data() as Batch));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'batches');
    });
    return unsubscribe;
  }, []);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      {!navigator.onLine && (
        <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex items-center gap-3 text-amber-800">
          <AlertCircle className="w-5 h-5" />
          <p className="text-xs font-medium">Você está visualizando dados offline. Algumas informações podem estar desatualizadas.</p>
        </div>
      )}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-serif font-light">Explorar Chimoio</h2>
          <p className="text-gray-500">Veja de onde vêm os seus alimentos e descubra os produtores locais.</p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-gray-100 flex items-center gap-4">
           <div className="flex items-center gap-2">
             <div className="w-3 h-3 rounded-full bg-emerald-600"></div>
             <span className="text-xs font-bold text-gray-600">Pronto para Consumo</span>
           </div>
           <div className="flex items-center gap-2">
             <div className="w-3 h-3 rounded-full bg-amber-500"></div>
             <span className="text-xs font-bold text-gray-600">Em Distribuição</span>
           </div>
        </div>
      </div>

      <div className="h-[400px] sm:h-[500px] md:h-[600px] w-full rounded-[2.5rem] overflow-hidden border border-[#E5E2D9] relative shadow-inner z-0">
        <MapContainer 
          center={[-19.116, 33.483]} 
          zoom={12} 
          style={{ width: '100%', height: '100%' }}
          scrollWheelZoom={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {batches.map(batch => (
            <Marker 
              key={batch.batchId} 
              position={[batch.location.lat, batch.location.lng]}
              icon={defaultIcon}
              eventHandlers={{
                click: () => onSelectBatch(batch),
              }}
            >
              <Popup>
                <div className="font-bold">{batch.cropType}</div>
                <div className="text-xs">{batch.quantity}</div>
                <button 
                  onClick={() => onSelectBatch(batch)}
                  className="mt-2 text-[10px] bg-emerald-600 text-white px-2 py-1 rounded"
                >
                  Ver Rastreio
                </button>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </motion.div>
  );
}

function ScanView({ onResult }: { onResult: (batch: Batch) => void }) {
  const [error, setError] = useState<string | null>(null);

  const fetchBatch = async (batchId: string) => {
    try {
      const docRef = doc(db, 'batches', batchId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        onResult(snap.data() as Batch);
      } else {
        setError("Lote não encontrado no sistema AgroTrace.");
      }
    } catch (err) {
      setError("Erro ao comunicar com o servidor.");
    }
  };

  useEffect(() => {
    const scanner = new Html5QrcodeScanner(
      "reader",
      { fps: 10, qrbox: { width: 250, height: 250 } },
      /* verbose= */ false
    );

    scanner.render(
      (decodedText) => {
        try {
          scanner.clear().then(() => {
             fetchBatch(decodedText);
          });
        } catch (e) {
          console.error(e);
        }
      },
      (err) => {
        // Quiet non-critical errors
        if (err && typeof err === 'string' && !err.includes("NotFoundException")) {
           console.warn("Scanner warning:", err);
        }
      }
    );

    return () => {
      scanner.clear().catch(error => console.error("Failed to clear scanner", error));
    };
  }, []);

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="max-w-xl mx-auto space-y-8"
    >
      <div className="bg-white p-6 sm:p-12 rounded-[2.5rem] sm:rounded-[3rem] border border-[#E5E2D9] shadow-2xl text-center space-y-6 sm:space-y-8">
        <div className="w-16 h-16 sm:w-20 sm:h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto scale-125 sm:scale-150 mb-4 sm:mb-8">
          <QrCode className="w-8 h-8 sm:w-10 sm:h-10 text-emerald-600" />
        </div>
        <h2 className="text-2xl sm:text-3xl font-serif font-light">Digitalize para Rastrear</h2>
        <p className="text-sm sm:text-base text-gray-500">Aponte a câmara para o código QR AgroTrace no produto para ver a sua jornada completa.</p>
        
        <div id="reader" className="aspect-square bg-gray-100 rounded-2xl overflow-hidden border-2 border-dashed border-gray-300 relative">
          {/* Scanner renders here */}
        </div>

        {error && (
          <div className="flex items-center gap-2 p-4 bg-red-50 text-red-700 rounded-xl">
            <AlertCircle className="w-5 h-5" />
            <p className="text-sm">{error}</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}

function TraceView({ scannedBatch }: { scannedBatch: Batch | null }) {
  const [farmer, setFarmer] = useState<Farmer | null>(null);

  useEffect(() => {
    if (scannedBatch) {
      // Use onSnapshot for real-time and offline availability
      const unsubscribe = onSnapshot(doc(db, 'farmers', scannedBatch.farmerId), (doc) => {
        if (doc.exists()) setFarmer(doc.data() as Farmer);
      });
      return unsubscribe;
    }
  }, [scannedBatch]);

  if (!scannedBatch) return (
    <div className="text-center py-20 bg-emerald-50 rounded-3xl border border-emerald-100">
      <Search className="w-12 h-12 text-emerald-300 mx-auto mb-4" />
      <p className="text-emerald-800 font-medium">Nenhum lote selecionado para rastreio.</p>
    </div>
  );

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="grid lg:grid-cols-3 gap-8"
    >
      {/* Left: Product Info */}
      <div className="lg:col-span-1 space-y-6">
        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#E5E2D9] shadow-sm space-y-4">
          <div className="flex justify-between items-start">
            <div className="bg-emerald-600 text-white text-[10px] uppercase font-bold tracking-widest px-3 py-1 rounded-full">
              Autêntico Moz
            </div>
            <p className="text-[10px] text-gray-400 font-mono">ID: {scannedBatch.batchId}</p>
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-emerald-900">{scannedBatch.cropType}</h2>
          <div className="pt-4 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Colheita</span>
              <span className="font-semibold">{formatDate(scannedBatch.harvestDate)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Quantidade</span>
              <span className="font-semibold">{scannedBatch.quantity}</span>
            </div>
            <div className="flex justify-between text-sm border-t pt-3">
              <span className="text-gray-500">Certificado</span>
              <span className="text-emerald-600 font-bold flex items-center gap-1">
                <ShieldCheck className="w-4 h-4" /> Global GAP
              </span>
            </div>
          </div>
        </div>

        {farmer && (
          <div className="bg-white p-8 rounded-3xl border border-[#E5E2D9] shadow-sm space-y-4">
            <div className="flex items-center gap-4">
              <img src={farmer.photoUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${farmer.farmerId}`} className="w-16 h-16 rounded-2xl object-cover bg-emerald-50" />
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-tighter">Produtor</p>
                <h4 className="text-lg font-bold">{farmer.name}</h4>
                <p className="text-sm text-emerald-600 flex items-center gap-1">
                   <MapPin className="w-3 h-3" /> {farmer.province || 'Chimoio, Moçambique'}
                </p>
              </div>
            </div>
            {farmer.bio && (
              <div className="pt-4 border-t border-gray-50">
                <p className="text-xs text-gray-500 leading-relaxed italic">"{farmer.bio}"</p>
              </div>
            )}
            <div className="pt-4 flex items-center gap-2">
               <div className={cn(
                 "px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-widest",
                 farmer.certificationStatus === 'certified' ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
               )}>
                 {farmer.certificationStatus === 'certified' ? 'Certificado GAP' : 'Certificação Pendente'}
               </div>
            </div>
          </div>
        )}
      </div>

      {/* Middle: Map */}
      <div className="lg:col-span-2 space-y-8">
        <div className="h-[300px] sm:h-[400px] bg-gray-100 rounded-[2.5rem] sm:rounded-[3rem] overflow-hidden border border-[#E5E2D9] relative flex items-center justify-center z-0 group">
          <MapContainer 
            center={[scannedBatch.location.lat, scannedBatch.location.lng]} 
            zoom={14} 
            style={{ width: '100%', height: '100%' }}
            scrollWheelZoom={false}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <Marker position={[scannedBatch.location.lat, scannedBatch.location.lng]} icon={L.divIcon({
              className: 'custom-div-icon',
              html: `<div class="relative">
                <div class="absolute -top-10 -left-5 bg-emerald-600 text-white p-2 rounded-full border-4 border-white shadow-2xl animate-bounce">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 21 8 22"></path><path d="M14.1 6a7 7 0 0 1-1.1 4"></path><path d="M9.4 14a7 7 0 0 0-1.1-4"></path><circle cx="12" cy="12" r="10"></circle><path d="m16 8-4-4-4 4"></path><path d="M12 4v12"></path></svg>
                </div>
                <div class="w-3 h-3 bg-emerald-600 rounded-full border-2 border-white shadow-lg absolute -top-1 -left-1"></div>
              </div>`,
              iconSize: [30, 42],
              iconAnchor: [15, 42]
            })}>
              <Popup className="custom-popup">
                <div className="p-2">
                  <div className="font-bold text-emerald-900 text-lg mb-1">{scannedBatch.cropType}</div>
                  <div className="text-xs text-gray-500 flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> Chimoio, Moçambique
                  </div>
                  <div className="mt-2 pt-2 border-t border-gray-100 text-[10px] font-bold text-emerald-600 uppercase">Origem Certificada</div>
                </div>
              </Popup>
            </Marker>
          </MapContainer>

          {/* Legend Overlay */}
          <div className="absolute top-6 left-6 z-10 flex flex-col gap-2">
             <div className="bg-white/95 backdrop-blur px-4 py-2 rounded-2xl shadow-xl border border-white/20 text-xs font-bold leading-none flex items-center gap-3">
               <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
               <span className="text-emerald-900 uppercase tracking-wider">Local da Origem: Chimoio Zone B</span>
             </div>
          </div>

          <div className="absolute bottom-6 right-6 z-10">
            <div className="bg-white/95 backdrop-blur p-4 rounded-[2rem] shadow-xl border border-white/20 space-y-3 min-w-[160px]">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100 pb-2">Legenda do Mapa</p>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-emerald-600 rounded-lg flex items-center justify-center">
                    <div className="w-1.5 h-1.5 bg-white rounded-full"></div>
                  </div>
                  <span className="text-[11px] font-medium text-gray-600">Ponto de Cultivo</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-emerald-100 rounded-lg border border-emerald-200"></div>
                  <span className="text-[11px] font-medium text-gray-600">Raio de Colheita</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white p-8 rounded-3xl border border-[#E5E2D9] shadow-sm">
          <h3 className="text-xl font-bold mb-8 flex items-center gap-2">
            <History className="w-6 h-6 text-emerald-600" /> Jornada do Produto
          </h3>
          <div className="space-y-8 relative before:absolute before:left-3 before:top-4 before:bottom-0 before:w-px before:bg-emerald-100">
            {scannedBatch.journey.map((step, idx) => (
              <div key={idx} className="relative pl-10">
                <div className="absolute left-0 top-1 w-6 h-6 bg-emerald-50 rounded-full border-2 border-emerald-600 flex items-center justify-center z-10 group-hover:bg-emerald-600 transition-colors">
                  <div className="w-2 h-2 bg-emerald-600 rounded-full" />
                </div>
                <div className="flex justify-between items-start">
                  <div>
                    <h5 className="font-bold text-gray-900">{step.location}</h5>
                    <p className="text-sm text-gray-500 mt-1">{step.description}</p>
                  </div>
                  <span className="text-[10px] font-mono text-gray-400 bg-gray-50 px-2 py-1 rounded">
                    {formatDate(step.timestamp)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function FarmerPortal({ user, login }: { user: UserProfile | null, login: () => void }) {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<Batch | null>(null);
  const [farmerData, setFarmerData] = useState<Farmer | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) {
      const q = query(collection(db, 'batches'), where('farmerId', '==', user.uid));
      const unsubscribeBatches = onSnapshot(q, (snap) => {
        setBatches(snap.docs.map(doc => doc.data() as Batch));
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, `batches/farmer/${user.uid}`);
      });
      
      const unsubscribeFarmer = onSnapshot(doc(db, 'farmers', user.uid), (doc) => {
        if (doc.exists()) setFarmerData(doc.data() as Farmer);
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, `farmers/${user.uid}`);
      });

      return () => {
        unsubscribeBatches();
        unsubscribeFarmer();
      };
    }
  }, [user]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setUploading(true);
    try {
      const storageRef = ref(storage, `profile_photos/${user.uid}`);
      await uploadBytes(storageRef, file);
      const photoUrl = await getDownloadURL(storageRef);

      // Update both collections for consistency
      await Promise.all([
        updateDoc(doc(db, 'users', user.uid), { photoUrl }),
        updateDoc(doc(db, 'farmers', user.uid), { photoUrl })
      ]);

      showToast('Foto de perfil atualizada!', 'success');
    } catch (error) {
      console.error('Error uploading photo:', error);
      showToast('Erro ao carregar a foto.', 'error');
    } finally {
      setUploading(false);
    }
  };

  const [filter, setFilter] = useState<'all' | '30d' | '6m' | '1y'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'harvested' | 'distributing' | 'market'>('all');

  const filteredBatches = batches.filter(batch => {
    // Time filter
    let timeMatch = true;
    if (filter !== 'all') {
      const date = new Date(batch.harvestDate);
      const now = new Date();
      const diff = now.getTime() - date.getTime();
      const days = diff / (1000 * 3600 * 24);
      
      if (filter === '30d') timeMatch = days <= 30;
      else if (filter === '6m') timeMatch = days <= 180;
      else if (filter === '1y') timeMatch = days <= 365;
    }

    // Status filter
    let statusMatch = true;
    if (statusFilter !== 'all') {
      statusMatch = batch.status === statusFilter;
    }

    return timeMatch && statusMatch;
  });

  if (!user) {
    return (
      <div className="text-center py-20 bg-white rounded-[3rem] border border-[#E5E2D9] shadow-sm space-y-6">
         <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
            <ShieldCheck className="w-10 h-10 text-emerald-600" />
         </div>
         <h2 className="text-3xl font-bold text-emerald-950">Acesso Restrito</h2>
         <p className="text-gray-500 max-w-sm mx-auto text-sm">Inicie sessão para gerir as suas colheitas e certificados GAP.</p>
         <button onClick={login} className="bg-emerald-600 text-white px-8 py-4 rounded-2xl font-bold shadow-lg shadow-emerald-500/20 active:scale-95 transition-transform">Entrar como Produtor</button>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
      {/* Profile Summary Card */}
      <section className="bg-white p-6 rounded-[2.5rem] border border-[#E5E2D9] shadow-xl relative overflow-hidden group">
        <input 
          type="file" 
          hidden 
          ref={fileInputRef} 
          accept="image/*" 
          onChange={handlePhotoUpload} 
        />
        <div className="absolute top-0 right-0 p-6 flex gap-2">
           <button 
            onClick={() => setShowEditProfile(true)}
            className="p-3 bg-gray-50 rounded-2xl text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 active:scale-90 transition-all shadow-sm"
            title="Editar Perfil"
           >
             <UserPlus className="w-5 h-5" />
           </button>
        </div>

        <div className="flex items-center gap-5">
           <div 
             onClick={() => !uploading && fileInputRef.current?.click()}
             className="w-20 h-20 bg-emerald-100 rounded-[2rem] overflow-hidden border-4 border-white shadow-lg relative cursor-pointer group/avatar"
           >
              {uploading ? (
                <div className="absolute inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-10">
                  <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <div className="absolute inset-0 bg-black/0 group-hover/avatar:bg-black/20 flex items-center justify-center z-10 transition-colors opacity-0 group-hover/avatar:opacity-100">
                  <Camera className="w-6 h-6 text-white" />
                </div>
              )}
              <img 
                src={farmerData?.photoUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`} 
                className="w-full h-full object-cover" 
              />
           </div>
           <div className="space-y-1">
              <h3 className="font-bold text-xl text-emerald-950">{farmerData?.name || user.displayName}</h3>
              <div className="flex items-center gap-2">
                 <span className="px-2 py-0.5 bg-emerald-600 text-white text-[8px] font-black uppercase tracking-widest rounded-md">GAP CERTIFIED</span>
                 <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tighter">{farmerData?.province || 'Chimoio, MOZ'}</p>
              </div>
              {farmerData?.bio && (
                <p className="text-xs text-gray-500 mt-2 line-clamp-2 italic leading-relaxed">
                  "{farmerData.bio}"
                </p>
              )}
           </div>
        </div>

        <div className="mt-6 pt-6 border-t border-gray-100 grid grid-cols-3 gap-4">
           <div className="text-center">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">Lotes</p>
              <p className="font-black text-xl text-emerald-950">{batches.length}</p>
           </div>
           <div className="text-center border-x border-gray-100">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">Status</p>
              <p className="font-black text-xl text-emerald-600">Ativo</p>
           </div>
           <div className="text-center">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">Expira</p>
              <p className="font-black text-xl text-amber-600">12/26</p>
           </div>
        </div>
      </section>

      {/* Batches Section */}
      <section className="space-y-6">
        <div className="flex items-center justify-between">
           <h4 className="font-bold text-emerald-950 text-lg">Minhas Colheitas</h4>
           <button 
            onClick={() => setShowAdd(true)}
            className="w-10 h-10 bg-emerald-600 text-white rounded-xl flex items-center justify-center active:scale-90 transition-transform shadow-lg shadow-emerald-600/20"
           >
             <UserPlus className="w-5 h-5" />
           </button>
        </div>

        {/* Filter Buttons */}
        <div className="space-y-4">
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-2 px-2 invisible-scrollbar">
            {[
              { id: 'all', label: 'Tudo' },
              { id: '30d', label: '30 Dias' },
              { id: '6m', label: '6 Meses' },
              { id: '1y', label: '1 Ano' }
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id as any)}
                className={cn(
                  "px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all shrink-0 border",
                  filter === f.id 
                    ? "bg-emerald-600 text-white border-emerald-600 shadow-md" 
                    : "bg-white text-gray-400 border-[#E5E2D9] hover:border-emerald-200"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="flex gap-2 overflow-x-auto pb-2 -mx-2 px-2 invisible-scrollbar">
            {[
              { id: 'all', label: 'Todos os Status' },
              { id: 'harvested', label: 'Colhido' },
              { id: 'distributing', label: 'Distribuição' },
              { id: 'market', label: 'Mercado' }
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setStatusFilter(f.id as any)}
                className={cn(
                  "px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all shrink-0 border",
                  statusFilter === f.id 
                    ? "bg-amber-500 text-white border-amber-500 shadow-md" 
                    : "bg-white text-gray-400 border-[#E5E2D9] hover:border-amber-200"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          {filteredBatches.map(b => (
            <div 
              key={b.batchId} 
              onClick={() => setSelectedBatch(b)}
              className="bg-white p-4 rounded-[2rem] border border-[#E5E2D9] flex items-center gap-4 active:scale-[0.98] transition-transform cursor-pointer hover:border-emerald-200 group"
            >
              <div className="bg-gray-50 p-2 rounded-2xl border border-gray-100 group-hover:bg-emerald-50 transition-colors">
                <QRCodeSVG value={b.batchId} size={48} level="H" />
              </div>
              <div className="flex-1 min-w-0">
                <h5 className="font-bold text-emerald-900 truncate">{b.cropType}</h5>
                <p className="text-[10px] font-mono text-gray-400">{b.batchId}</p>
              </div>
               <div className="text-right">
                  <span className={cn(
                    "px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded-lg",
                    b.status === 'harvested' ? "bg-emerald-50 text-emerald-700" :
                    b.status === 'distributing' ? "bg-amber-50 text-amber-700" :
                    b.status === 'market' ? "bg-blue-50 text-blue-700" :
                    "bg-gray-50 text-gray-700"
                  )}>
                    {b.status === 'harvested' ? 'Colhido' : 
                     b.status === 'distributing' ? 'Distribuição' :
                     b.status === 'market' ? 'Mercado' : b.status}
                  </span>
                  <p className="text-[10px] text-gray-400 mt-1 font-bold">{b.quantity}</p>
               </div>
            </div>
          ))}

          {filteredBatches.length === 0 && (
            <div className="py-20 text-center bg-gray-50 rounded-[2.5rem] border-2 border-dashed border-gray-200">
               <Leaf className="w-12 h-12 text-gray-300 mx-auto mb-4 animate-pulse" />
               <p className="text-gray-400 font-bold text-sm uppercase tracking-tighter">Sem colheitas registadas</p>
            </div>
          )}
        </div>
      </section>
      
      {showAdd && <AddBatchModal userId={user.uid} onClose={() => setShowAdd(false)} />}
      {showEditProfile && (
        <EditProfileModal 
          farmer={farmerData} 
          userId={user.uid} 
          onClose={() => setShowEditProfile(false)} 
          onSave={(updated) => setFarmerData(updated)}
        />
      )}
      {selectedBatch && (
        <BatchHistoryModal 
          batch={selectedBatch} 
          onClose={() => setSelectedBatch(null)} 
        />
      )}
      <div className="h-20"></div>
    </motion.div>
  );
}

function LoginForm({ lang, onBack, onLogin, onGoogle, onGoRegister, onEmailLogin }: any) {
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verificationId, setVerificationId] = useState<any>(null);
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [loginMethod, setLoginMethod] = useState<'email' | 'phone'>('email');

  const onSendCode = async () => {
    if (!phone || phone.length < 9) return;
    setLoading(true);
    try {
      const verifier = new RecaptchaVerifier(auth, 'recaptcha-container-login', { 'size': 'invisible' });
      let formattedPhone = phone.replace(/\s+/g, '');
      if (!formattedPhone.startsWith('+')) {
        if (formattedPhone.startsWith('258')) formattedPhone = '+' + formattedPhone;
        else formattedPhone = '+258' + formattedPhone;
      }
      const confirmationResult = await signInWithPhoneNumber(auth, formattedPhone, verifier);
      setVerificationId(confirmationResult);
    } catch (error) {
      console.error(error);
      showToast(lang === 'pt' ? 'Erro ao enviar código de acesso por SMS.' : 'Error sending SMS access code.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const onVerifyCode = async () => {
    setLoading(true);
    try {
      await verificationId!.confirm(otp);
      onLogin();
    } catch (error) {
      showToast(lang === 'pt' ? 'Código SMS inválido ou expirado.' : 'Invalid or expired SMS code.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onEmailLogin({ email, password });
    } catch (e) {
      // toast shown in handleEmailLogin
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      className="w-full space-y-6"
    >
      <div className="flex bg-gray-100 p-1 rounded-2xl">
        <button 
          onClick={() => setLoginMethod('email')}
          className={cn("flex-1 py-2 text-[10px] font-bold rounded-xl transition-all", loginMethod === 'email' ? "bg-white text-emerald-600 shadow-sm" : "text-gray-400")}
        >
          EMAIL
        </button>
        <button 
          onClick={() => setLoginMethod('phone')}
          className={cn("flex-1 py-2 text-[10px] font-bold rounded-xl transition-all", loginMethod === 'phone' ? "bg-white text-emerald-600 shadow-sm" : "text-gray-400")}
        >
          SMS
        </button>
      </div>

      {loginMethod === 'email' ? (
        <form onSubmit={handleEmailSubmit} className="space-y-4">
          <div className="relative text-left">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1 mb-1 block">Email</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input 
                type="email" 
                required
                placeholder="exemplo@agrotrace.com"
                className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-4 pl-12 pr-4 focus:ring-2 focus:ring-emerald-600 outline-none transition-all text-sm"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </div>
          </div>
          <div className="relative text-left">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1 mb-1 block">{lang === 'pt' ? "Senha" : "Password"}</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input 
                type="password" 
                required
                placeholder="••••••••"
                className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-4 pl-12 pr-4 focus:ring-2 focus:ring-emerald-600 outline-none transition-all text-sm"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
            </div>
          </div>
          <button 
            type="submit"
            disabled={loading}
            className="w-full bg-emerald-600 text-white py-4 px-6 rounded-2xl font-bold shadow-xl shadow-emerald-600/20 active:scale-95 transition-transform flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? "..." : (lang === 'pt' ? "ENTRAR NO PORTAL" : "LOGIN TO PORTAL")} <ArrowRight className="w-5 h-5" />
          </button>
        </form>
      ) : (
        <div className="space-y-4">
          {!verificationId ? (
            <div className="space-y-4">
              <div className="relative text-left">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1 mb-1 block">{lang === 'pt' ? "Telemóvel" : "Phone"}</label>
                <div className="relative">
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input 
                    type="tel" 
                    placeholder="e.g. 84 123 4567"
                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-4 pl-12 pr-4 focus:ring-2 focus:ring-emerald-600 outline-none transition-all text-sm"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                  />
                </div>
              </div>
              <div id="recaptcha-container-login"></div>
              <button 
                onClick={onSendCode}
                disabled={loading || !phone}
                className="w-full bg-emerald-600 text-white py-4 px-6 rounded-2xl font-bold shadow-xl shadow-emerald-600/20 active:scale-95 transition-transform flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? "..." : (lang === 'pt' ? "ENTRAR COM SMS" : "LOGIN WITH SMS")} <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-center space-y-2">
                <h4 className="font-bold text-emerald-900">{lang === 'pt' ? "Código de Acesso" : "Access Code"}</h4>
                <p className="text-sm text-gray-500">{lang === 'pt' ? "Introduza o código enviado para" : "Enter the code sent to"} <b>{phone}</b></p>
              </div>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input 
                  type="text" 
                  placeholder="000000"
                  maxLength={6}
                  className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-4 pl-12 pr-4 focus:ring-2 focus:ring-emerald-600 outline-none transition-all text-center tracking-[0.5em] font-bold text-xl"
                  value={otp}
                  onChange={e => setOtp(e.target.value)}
                />
              </div>
              <button 
                onClick={onVerifyCode}
                disabled={loading || otp.length < 6}
                className="w-full bg-emerald-600 text-white py-4 px-6 rounded-2xl font-bold shadow-xl shadow-emerald-600/20 active:scale-95 transition-transform flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? "..." : (lang === 'pt' ? "VERIFICAR E ENTRAR" : "VERIFY & LOGIN")}
              </button>
              <button onClick={() => setVerificationId(null)} className="w-full text-xs text-gray-400 font-bold uppercase">
                {lang === 'pt' ? "Mudar número" : "Change number"}
              </button>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-4 py-2">
        <div className="h-px bg-gray-100 flex-1"></div>
        <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{lang === 'pt' ? "Ou Entrar Com" : "Or Login With"}</span>
        <div className="h-px bg-gray-100 flex-1"></div>
      </div>

      <button 
        onClick={onGoogle}
        className="w-full bg-white text-gray-700 py-4 px-6 rounded-2xl font-bold border border-gray-100 shadow-sm active:scale-95 transition-transform flex items-center justify-center gap-2 text-sm"
      >
        <img src="https://www.google.com/favicon.ico" className="w-4 h-4" /> Google
      </button>

      <div className="pt-4 flex flex-col items-center gap-4">
        <button onClick={onGoRegister} className="text-sm font-bold text-emerald-600 hover:underline">
          {lang === 'pt' ? "Não tem conta? Registe-se" : "No account? Register here"}
        </button>
        <button onClick={onBack} className="text-sm font-bold text-gray-400 hover:text-gray-600">
          {lang === 'pt' ? "← Voltar" : "← Back"}
        </button>
      </div>
    </motion.div>
  );
}

function RegisterForm({ lang, onBack, onRegister }: any) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    location: '',
    password: ''
  });
  const [detecting, setDetecting] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email || !formData.password || !formData.phone) {
      showToast(lang === 'pt' ? 'Por favor, preencha todos os campos obrigatórios.' : 'Please fill all required fields.', 'info');
      return;
    }
    
    setLoading(true);
    try {
      await onRegister(formData);
    } catch (error: any) {
      console.error('Registration error:', error);
      showToast(error.message || 'Erro ao realizar o registo.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const detectLocation = () => {
    if (!navigator.geolocation) {
      showToast(lang === 'pt' ? 'Geolocalização não suportada no seu dispositivo.' : 'Geolocation is not supported by your browser.', 'info');
      return;
    }

    setDetecting(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const locString = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
        setFormData(prev => ({ ...prev, location: locString }));
        setDetecting(false);
      },
      (error) => {
        console.error('Error detecting location:', error);
        showToast(lang === 'pt' ? 'Não foi possível detectar a sua localização atual.' : 'Could not detect your location.', 'error');
        setDetecting(false);
      },
      { enableHighAccuracy: true }
    );
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="w-full"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-3">
          <div className="relative text-left">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1 mb-1 block">
              {lang === 'pt' ? "Nome Completo" : "Full Name"} *
            </label>
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input 
                type="text" 
                required
                placeholder="e.g. João Manuel"
                className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-3 pl-12 pr-4 focus:ring-2 focus:ring-emerald-600 outline-none transition-all text-sm"
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
              />
            </div>
          </div>

          <div className="relative text-left">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1 mb-1 block">
              {lang === 'pt' ? "Email" : "Email"} *
            </label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input 
                type="email" 
                required
                placeholder="exemplo@agrotrace.com"
                className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-3 pl-12 pr-4 focus:ring-2 focus:ring-emerald-600 outline-none transition-all text-sm"
                value={formData.email}
                onChange={e => setFormData({...formData, email: e.target.value})}
              />
            </div>
          </div>

          <div className="relative text-left">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1 mb-1 block">
              {lang === 'pt' ? "Telemóvel" : "Phone"} *
            </label>
            <div className="relative">
              <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input 
                type="tel" 
                required
                placeholder="84 000 0000"
                className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-3 pl-12 pr-4 focus:ring-2 focus:ring-emerald-600 outline-none transition-all text-sm"
                value={formData.phone}
                onChange={e => setFormData({...formData, phone: e.target.value})}
              />
            </div>
          </div>

          <div className="relative text-left">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1 mb-1 block">
              {lang === 'pt' ? "Localização / Província" : "Location / Province"}
            </label>
            <div className="relative">
              <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input 
                type="text" 
                placeholder="e.g. Chimoio, Manica"
                className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-3 pl-12 pr-14 focus:ring-2 focus:ring-emerald-600 outline-none transition-all text-sm"
                value={formData.location}
                onChange={e => setFormData({...formData, location: e.target.value})}
              />
              <button 
                type="button"
                onClick={detectLocation}
                disabled={detecting}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-emerald-100 text-emerald-600 rounded-xl hover:bg-emerald-200 transition-colors disabled:opacity-50"
                title={lang === 'pt' ? "Detectar Localização" : "Detect Location"}
              >
                <LocateFixed className={cn("w-4 h-4", detecting && "animate-pulse")} />
              </button>
            </div>
          </div>

          <div className="relative text-left">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1 mb-1 block">
              {lang === 'pt' ? "Senha" : "Password"} *
            </label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input 
                type="password" 
                required
                placeholder="••••••••"
                className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-3 pl-12 pr-4 focus:ring-2 focus:ring-emerald-600 outline-none transition-all text-sm"
                value={formData.password}
                onChange={e => setFormData({...formData, password: e.target.value})}
              />
            </div>
          </div>
        </div>

        <button 
          type="submit"
          disabled={loading}
          className="w-full bg-emerald-600 text-white py-4 px-10 rounded-2xl font-bold shadow-xl shadow-emerald-600/20 active:scale-95 transition-transform flex items-center justify-center gap-2 disabled:opacity-50 mt-4"
        >
          {loading ? (lang === 'pt' ? "A PROCESSAR..." : "PROCESSING...") : (lang === 'pt' ? "CRIAR CONTA PRODUTOR" : "CREATE PRODUCER ACCOUNT")} 
          <UserPlus className="w-5 h-5" />
        </button>
      </form>

      <div className="pt-6 flex flex-col items-center gap-4">
        <button onClick={onBack} className="text-sm font-bold text-gray-400 hover:text-gray-600">
          {lang === 'pt' ? "Já tem conta? Entrar" : "Already have an account? Login"}
        </button>
      </div>
    </motion.div>
  );
}

function EditProfileModal({ farmer, userId, onClose, onSave }: any) {
  const [photoUrl, setPhotoUrl] = useState(farmer?.photoUrl || '');
  const [name, setName] = useState(farmer?.name || '');
  const [bio, setBio] = useState(farmer?.bio || '');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      showToast('A imagem deve ter menos de 2MB.', 'error');
      return;
    }

    setUploading(true);
    try {
      const timestamp = new Date().getTime();
      const storageRef = ref(storage, `profiles/${userId}/${timestamp}_${file.name}`);
      const snapshot = await uploadBytes(storageRef, file);
      const url = await getDownloadURL(snapshot.ref);
      setPhotoUrl(url);
      showToast('Imagem carregada com sucesso!', 'success');
    } catch (error) {
      console.error('Upload error:', error);
      showToast('Erro ao carregar imagem.', 'error');
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    setLoading(true);
    try {
      const updatedData = {
        ...farmer,
        name,
        photoUrl,
        bio,
        farmerId: userId
      };
      try {
        await Promise.all([
          setDoc(doc(db, 'farmers', userId), updatedData, { merge: true }),
          setDoc(doc(db, 'users', userId), { 
            displayName: name,
            photoUrl: photoUrl 
          }, { merge: true })
        ]);
      } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, `farmers/${userId}`);
      }
      onSave(updatedData);
      showToast('Perfil atualizado com sucesso!', 'success');
      onClose();
    } catch (error) {
      console.error('Error updating profile:', error);
      showToast('Erro ao atualizar dados do perfil.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-[2rem] sm:rounded-[2.5rem] w-full max-w-md p-6 sm:p-8 shadow-2xl relative overflow-hidden"
      >
        <div className="absolute top-0 left-0 w-full h-2 bg-emerald-600" />
        
        <button onClick={onClose} className="absolute top-6 right-6 p-2 hover:bg-gray-100 rounded-full transition-colors">
          <X className="w-5 h-5 text-gray-400" />
        </button>

        <div className="mb-8">
           <h3 className="text-2xl font-bold text-emerald-900">Editar Perfil</h3>
           <p className="text-sm text-gray-500">Atualize as informações do seu perfil de produtor.</p>
        </div>

        <div className="space-y-6">
          <div className="flex justify-center mb-6">
            <div className="w-24 h-24 bg-emerald-50 rounded-3xl overflow-hidden border-2 border-emerald-100 shadow-inner">
               <img 
                 src={photoUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${userId}`} 
                 className="w-full h-full object-cover" 
                 onError={(e) => {
                   (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${userId}`;
                 }}
               />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Nome do Produtor</label>
            <input 
              type="text" 
              className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-4 px-5 focus:ring-2 focus:ring-emerald-600 outline-none transition-all"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Nome do Produtor"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Fotografia do Produtor</label>
            <div className="flex items-center gap-4">
               <label className={cn(
                 "flex-1 flex flex-col items-center justify-center p-4 border-2 border-dashed rounded-2xl cursor-pointer transition-all",
                 uploading ? "bg-gray-50 border-emerald-300" : "bg-emerald-50/50 border-emerald-100 hover:border-emerald-300 hover:bg-emerald-50"
               )}>
                 <div className="flex flex-col items-center justify-center pt-1 pb-1">
                   {uploading ? (
                     <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-600 mb-2"></div>
                   ) : (
                     <Camera className="w-6 h-6 text-emerald-600 mb-2" />
                   )}
                   <p className="text-[10px] font-bold text-emerald-900 uppercase tracking-tighter">
                     {uploading ? 'A Carregar...' : 'Carregar do Dispositivo'}
                   </p>
                   <p className="text-[10px] text-gray-400 mt-1">PNG, JPG até 2MB</p>
                 </div>
                 <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload} disabled={uploading} />
               </label>
               {photoUrl && (
                 <button 
                  onClick={() => setPhotoUrl('')}
                  className="p-3 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition-colors"
                  title="Remover Foto"
                 >
                   <X className="w-5 h-5" />
                 </button>
               )}
            </div>
            {photoUrl && (
              <div className="mt-2 py-2 px-3 bg-emerald-50 rounded-lg border border-emerald-100 flex items-center gap-2">
                 <ShieldCheck className="w-3 h-3 text-emerald-600" />
                 <span className="text-[10px] font-bold text-emerald-900 truncate">{photoUrl}</span>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Biografia / Sobre a Quinta</label>
            <textarea 
              className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-4 px-5 focus:ring-2 focus:ring-emerald-600 outline-none transition-all resize-none h-24"
              value={bio}
              onChange={e => setBio(e.target.value)}
              placeholder="Conte aos consumidores sobre o seu processo de cultivo..."
            />
          </div>

          <div className="pt-4 flex gap-4">
            <button 
              onClick={onClose}
              className="flex-1 py-4 text-sm font-bold text-gray-500 hover:bg-gray-50 rounded-2xl transition-colors"
            >
              Cancelar
            </button>
            <button 
              onClick={save}
              disabled={loading}
              className="flex-1 bg-emerald-600 text-white py-4 rounded-2xl font-bold shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 transition-all disabled:opacity-50"
            >
              {loading ? 'A guardar...' : 'Guardar Alterações'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function BatchHistoryModal({ batch, onClose }: { batch: Batch, onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-0 md:p-8">
      <motion.div 
        initial={{ y: "100%", opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: "100%", opacity: 0 }}
        className="w-full max-w-4xl h-full md:h-auto md:max-h-[90vh] bg-[#FDFCF9] md:rounded-[3rem] shadow-2xl relative overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="sticky top-0 bg-white/80 backdrop-blur-xl px-8 py-6 flex items-center justify-between border-b border-[#E5E2D9] z-50 shrink-0">
           <div>
             <h3 className="text-xl font-bold text-emerald-950 leading-none">Histórico Detalhado</h3>
             <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-widest mt-1.5 flex items-center gap-1.5">
               <ShieldCheck className="w-3 h-3" /> Lote Verificado e Rastreado
             </p>
           </div>
           <button 
            onClick={onClose} 
            className="p-3 bg-gray-50 rounded-2xl text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all active:scale-95 shadow-sm"
           >
             <X className="w-5 h-5" />
           </button>
        </div>
        
        {/* Content Container */}
        <div className="flex-1 overflow-y-auto invisible-scrollbar">
           <div className="p-4 sm:p-8 max-w-5xl mx-auto">
              <TraceView scannedBatch={batch} />
           </div>
           
           {/* Summary Info (Producer specific) */}
           <div className="px-8 pb-12">
              <div className="bg-emerald-950 rounded-[2.5rem] p-8 text-white relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-10">
                  <Leaf className="w-32 h-32 rotate-12" />
                </div>
                <div className="relative z-10 space-y-4">
                  <h4 className="text-xl font-bold">Garantia de Qualidade</h4>
                  <p className="text-emerald-100/70 text-xs leading-relaxed max-w-sm">
                    Este lote cumpre com todas as normas de segurança alimentar e boas práticas agrícolas 
                    exigidas para a certificação Global GAP.
                  </p>
                  <div className="flex items-center gap-4 pt-2">
                    <div className="flex -space-x-2">
                      {[1,2,3].map(i => (
                        <div key={i} className="w-8 h-8 rounded-full border-2 border-emerald-950 bg-emerald-800 flex items-center justify-center text-[10px] font-bold">
                          {i}
                        </div>
                      ))}
                    </div>
                    <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">3 Auditorias Realizadas</span>
                  </div>
                </div>
              </div>
           </div>
        </div>
      </motion.div>
    </div>
  );
}

function AddBatchModal({ userId, onClose }: any) {
  const [formData, setFormData] = useState({
    cropType: '',
    quantity: '',
    harvestDate: new Date().toISOString().split('T')[0]
  });

  const save = async () => {
    const id = `BATCH-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
    // Randomized Chimoio location
    const location = { 
        lat: -19.116 + (Math.random() - 0.5) * 0.05, 
        lng: 33.483 + (Math.random() - 0.5) * 0.05 
    };
    
    try {
      await setDoc(doc(db, 'batches', id), {
        ...formData,
        batchId: id,
        farmerId: userId,
        location,
        status: 'harvested',
        journey: [
          { timestamp: new Date().toISOString(), location: 'Chimoio Farm', description: 'Colheita e registo inicial de rastreabilidade.' }
        ],
        qrCode: id
      });
      onClose();
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `batches/${id}`);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4 sm:p-6">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white w-full max-w-lg rounded-[2rem] sm:rounded-[2.5rem] p-6 sm:p-10 space-y-6 shadow-2xl"
      >
        <h3 className="text-2xl font-bold">Registar Lote</h3>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-bold text-gray-400 uppercase">Cultivo</label>
            <input 
              className="w-full mt-1 bg-gray-50 border-none rounded-xl p-4 focus:ring-2 focus:ring-emerald-600 outline-none" 
              placeholder="Ex: Milho, Soja, Manga"
              onChange={e => setFormData({...formData, cropType: e.target.value})}
            />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-400 uppercase">Quantidade</label>
            <input 
              className="w-full mt-1 bg-gray-50 border-none rounded-xl p-4 focus:ring-2 focus:ring-emerald-600 outline-none" 
              placeholder="Ex: 500kg"
              onChange={e => setFormData({...formData, quantity: e.target.value})}
            />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-400 uppercase">Data de Colheita</label>
            <input 
              type="date"
              className="w-full mt-1 bg-gray-50 border-none rounded-xl p-4 focus:ring-2 focus:ring-emerald-600 outline-none" 
              value={formData.harvestDate}
              onChange={e => setFormData({...formData, harvestDate: e.target.value})}
            />
          </div>
        </div>
        <div className="flex gap-4 pt-4">
          <button onClick={onClose} className="flex-1 px-6 py-4 rounded-2xl font-bold text-gray-500 hover:bg-gray-50">Cancelar</button>
          <button onClick={save} className="flex-1 bg-emerald-600 text-white px-6 py-4 rounded-2xl font-bold shadow-lg shadow-emerald-500/20 hover:bg-emerald-700">Gravar Lote</button>
        </div>
      </motion.div>
    </div>
  );
}
