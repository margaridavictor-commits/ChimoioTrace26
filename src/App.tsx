import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Leaf, 
  MapPin, 
  QrCode, 
  ShieldCheck, 
  History, 
  ChevronRight, 
  User, 
  Camera,
  Search,
  LayoutDashboard,
  ChevronLeft,
  PieChart,
  BarChart,
  AlertCircle,
  Phone,
  Lock,
  ArrowRight,
  UserPlus,
  LocateFixed,
  Navigation,
  X
} from 'lucide-react';
import { cn, formatDate } from './lib/utils';
import { auth, db } from './lib/firebase';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  ConfirmationResult
} from 'firebase/auth';
import { doc, getDoc, setDoc, collection, query, where, onSnapshot } from 'firebase/firestore';
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

// Map Components
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { Html5QrcodeScanner } from 'html5-qrcode';

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
      <circle cx="50" cy="50" r="48" stroke="#333" strokeWidth="2"/>
      <path d="M50 50 L50 2 A48 48 0 0 1 98 50 Z" fill="#f59e0b"/>
      <path d="M50 50 L98 50 A48 48 0 0 1 50 98 Z" fill="#b91c1c"/>
      <path d="M50 50 L50 98 A48 48 0 0 0 2 50 A48 48 0 0 0 50 2 Z" fill="#10b981"/>
      <circle cx="50" cy="50" r="25" fill="white" stroke="#333" strokeWidth="2"/>
      <rect x="40" y="55" width="8" height="10" fill="#111" rx="1"/>
      <rect x="52" y="45" width="8" height="20" fill="#10b981" rx="1"/>
      <rect x="64" y="35" width="8" height="30" fill="#f59e0b" rx="1"/>
    </svg>
  );
}

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab ] = useState<'consumer' | 'farmer'>('consumer');
  const [subTab, setSubTab] = useState<'home' | 'map' | 'scan' | 'trace'>('home');
  const [view, setView] = useState<'landing' | 'app'>('landing');
  const [authMode, setAuthMode] = useState<'options' | 'login' | 'register'>('options');
  const [lang, setLang] = useState<'pt' | 'en'>('pt');
  const [scannedBatch, setScannedBatch] = useState<Batch | null>(null);

  const [toasts, setToasts] = useState<ToastMessage[]>([]);

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
          const userDocPath = `users/${firebaseUser.uid}`;
          let userDoc;
          try {
            userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          } catch (e) {
            handleFirestoreError(e, OperationType.GET, userDocPath);
          }

          if (userDoc?.exists()) {
            setUser(userDoc.data() as UserProfile);
            if (view === 'landing') setView('app');
          } else {
            // New user (likely from Google Login since phone login handles its own creation)
            const newUser: UserProfile = {
              uid: firebaseUser.uid,
              email: firebaseUser.email || '',
              displayName: firebaseUser.displayName || 'Usuário',
              role: 'farmer',
              createdAt: new Date().toISOString()
            };
            
            try {
              await setDoc(doc(db, 'users', firebaseUser.uid), newUser);
              
              // Ensure farmer doc exists for this user
              const farmerRef = doc(db, 'farmers', firebaseUser.uid);
              await setDoc(farmerRef, {
                farmerId: firebaseUser.uid,
                name: newUser.displayName,
                location: { lat: -19.116, lng: 33.483 },
                certificationStatus: 'pending',
                phoneNumber: firebaseUser.phoneNumber || '',
                photoUrl: ''
              }, { merge: true });
            } catch (e) {
              handleFirestoreError(e, OperationType.WRITE, 'users/farmers_init');
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

  const registerWithPhone = async (data: { name: string, phone: string, location: string }) => {
    try {
      const firebaseUser = auth.currentUser;
      if (!firebaseUser) return;

      const newUser: UserProfile = {
        uid: firebaseUser.uid,
        email: firebaseUser.email || `${data.phone.replace(/\s+/g, '')}@agrotrace.com`,
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
      showToast('Erro ao finalizar o seu registo como produtor.', 'error');
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
      <div className="min-h-screen bg-white flex flex-col items-center overflow-hidden">
        {/* Header Image with Curve */}
        <div className="relative w-full h-[55vh] overflow-hidden">
          <img 
            src="https://images.unsplash.com/photo-1592982537447-7440770cbfc9?auto=format&fit=crop&q=80&w=1200" 
            alt="Farmer" 
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-black/10"></div>
          
          {/* Language Toggle */}
          <div className="absolute top-6 right-6 flex bg-white/20 backdrop-blur-md rounded-lg p-1 border border-white/30 text-xs font-bold text-white">
             <button 
              onClick={() => setLang('pt')}
              className={cn("px-3 py-1 rounded-md transition-all", lang === 'pt' ? "bg-emerald-600 text-white" : "hover:bg-white/10")}
             >
               PT
             </button>
             <button 
              onClick={() => setLang('en')}
              className={cn("px-3 py-1 rounded-md transition-all", lang === 'en' ? "bg-emerald-600 text-white" : "hover:bg-white/10")}
             >
               EN
             </button>
          </div>

          <div className="absolute bottom-[-1px] left-0 w-full">
            <svg viewBox="0 0 1440 320" className="w-full h-auto translate-y-1">
              <path fill="#ffffff" fillOpacity="1" d="M0,224L80,218.7C160,213,320,203,480,213.3C640,224,800,256,960,256C1120,256,1280,224,1360,208L1440,192L1440,320L1360,320C1280,320,1120,320,960,320C800,320,640,320,480,320C320,320,160,320,80,320L0,320Z"></path>
            </svg>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 w-full max-w-md px-8 flex flex-col items-center justify-center text-center -mt-12 z-10 relative">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4 mb-12 flex flex-col items-center"
          >
            <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mb-4 shadow-xl border border-gray-100 p-2">
               <Data4MozLogo className="w-16 h-16" />
            </div>
            <div>
              <h1 className="text-5xl font-bold text-emerald-700 tracking-tight">AgroTrace</h1>
              <p className="text-gray-500 text-sm font-medium leading-tight">
                {lang === 'pt' 
                  ? "Rastreabilidade de alimentos: do campo à sua mesa"
                  : "Food traceability: from field to your table"}
              </p>
            </div>
          </motion.div>

          {authMode === 'options' ? (
            <motion.div 
               initial={{ opacity: 0, y: 20 }}
               animate={{ opacity: 1, y: 0 }}
               transition={{ delay: 0.1 }}
               className="w-full space-y-4"
            >
              <button 
                onClick={() => { setView('app'); setActiveTab('consumer'); }}
                className="w-full bg-emerald-600 text-white py-4 px-6 rounded-2xl font-bold shadow-xl shadow-emerald-600/20 active:scale-95 transition-transform"
              >
                {lang === 'pt' ? "SOU CONSUMIDOR" : "I AM A CONSUMER"}
              </button>
              <button 
                onClick={() => { setAuthMode('login'); }}
                className="w-full bg-white text-emerald-600 py-4 px-6 rounded-2xl font-bold border-2 border-emerald-600 active:scale-95 transition-transform"
              >
                {lang === 'pt' ? "SOU PRODUTOR" : "I AM A FARMER"}
              </button>
            </motion.div>
          ) : authMode === 'login' ? (
            <LoginForm 
              lang={lang} 
              onBack={() => setAuthMode('options')} 
              onLogin={loginWithPhone} 
              onGoogle={loginWithGoogle}
              onGoRegister={() => setAuthMode('register')}
            />
          ) : (
            <RegisterForm 
              lang={lang} 
              onBack={() => setAuthMode('login')} 
              onRegister={registerWithPhone} 
            />
          )}

          <div className="mt-16 flex flex-col items-center gap-3">
            <div className="flex items-center gap-3 p-4 bg-white rounded-2xl shadow-xl border border-gray-100">
              <Data4MozLogo className="w-10 h-10" />
              <div className="text-left leading-none">
                <p className="text-lg font-black tracking-tighter uppercase text-emerald-900 leading-none">Data4Moz</p>
                <p className="text-[10px] text-emerald-600/60 font-bold uppercase tracking-[0.2em] mt-1">Intelligence</p>
              </div>
            </div>
            <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-gray-400">Powered by Data4Moz</span>
          </div>
        </div>
        
        <div className="h-12 w-full bg-white"></div>
      </div>
    );
  }

  return (
    <>
      <main className="min-h-screen bg-[#FDFCF9] text-[#1A1A1A] font-sans">
      {/* Header */}
      <header className="border-b border-[#E5E2D9] px-6 py-4 flex items-center justify-between sticky top-0 bg-[#FDFCF9]/80 backdrop-blur-md z-50">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setView('landing')}
            className="p-2 hover:bg-emerald-50 rounded-full text-emerald-600 transition-colors"
            title="Voltar"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-2 border-l border-gray-200 pl-4">
            <div className="bg-emerald-600 p-1.5 rounded-lg">
              <Leaf className="w-5 h-5 text-white" />
            </div>
            <h1 className="font-semibold text-lg tracking-tight">AgroTrace</h1>
          </div>
        </div>
        
        <div className="hidden md:flex bg-gray-100 p-1 rounded-xl">
          <button 
            onClick={() => setActiveTab('consumer')}
            className={cn("px-4 py-1.5 rounded-lg text-sm font-medium transition-all", activeTab === 'consumer' ? "bg-white shadow-sm text-emerald-700" : "text-gray-500")}
          >
            Consumidor
          </button>
          <button 
            onClick={() => setActiveTab('farmer')}
            className={cn("px-4 py-1.5 rounded-lg text-sm font-medium transition-all", activeTab === 'farmer' ? "bg-white shadow-sm text-emerald-700" : "text-gray-500")}
          >
            Produtor
          </button>
        </div>

        <div className="flex items-center gap-4">
          {!user && activeTab === 'farmer' ? (
            <button 
              onClick={() => setView('landing')}
              className="bg-[#1A1A1A] text-white px-4 py-2 rounded-full text-sm font-medium hover:bg-emerald-800 transition-colors"
            >
              Portal do Produtor
            </button>
          ) : user ? (
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium">{user.displayName}</p>
                <p className="text-[10px] text-emerald-600 uppercase tracking-widest font-bold">{user.role}</p>
              </div>
              <button 
                onClick={logout}
                className="w-10 h-10 rounded-full border border-[#E5E2D9] overflow-hidden flex items-center justify-center hover:bg-red-50 transition-colors group relative"
                title="Sair"
              >
                {user.photoUrl ? (
                  <img src={user.photoUrl} className="w-full h-full object-cover" alt="Profile" />
                ) : (
                  <div className="bg-emerald-50 w-full h-full flex items-center justify-center">
                    <User className="w-5 h-5 text-emerald-600" />
                  </div>
                )}
                <div className="absolute inset-0 bg-red-600/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                   <X className="w-4 h-4 text-red-600 translate-y-4 group-hover:translate-y-0 transition-transform" />
                </div>
              </button>
              <div className="w-px h-6 bg-gray-200 mx-1"></div>
              <div className="flex items-center gap-2">
                <Data4MozLogo className="w-7 h-7" />
                <span className="text-[10px] font-black tracking-tighter uppercase text-emerald-900 hidden lg:block">Data4Moz</span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 pr-2">
              <Data4MozLogo className="w-6 h-6" />
              <span className="text-[10px] font-black tracking-tighter uppercase text-emerald-900">Data4Moz</span>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8 pb-32">
        <AnimatePresence mode="wait">
          {activeTab === 'consumer' ? (
            <div key="consumer" className="space-y-8">
              <div className="flex gap-4 border-b border-gray-100 overflow-x-auto pb-px">
                <button 
                  onClick={() => setSubTab('home')}
                  className={cn("pb-2 px-1 text-sm font-bold border-b-2 transition-colors whitespace-nowrap", subTab === 'home' ? "border-emerald-600 text-emerald-900" : "border-transparent text-gray-400")}
                >
                  Início
                </button>
                <button 
                  onClick={() => setSubTab('map')}
                  className={cn("pb-2 px-1 text-sm font-bold border-b-2 transition-colors whitespace-nowrap", subTab === 'map' ? "border-emerald-600 text-emerald-900" : "border-transparent text-gray-400")}
                >
                  Mapa de Origem
                </button>
                <button 
                  onClick={() => setSubTab('scan')}
                  className={cn("pb-2 px-1 text-sm font-bold border-b-2 transition-colors whitespace-nowrap", subTab === 'scan' ? "border-emerald-600 text-emerald-900" : "border-transparent text-gray-400")}
                >
                  Digitalizar QR
                </button>
                {scannedBatch && (
                   <button 
                    onClick={() => setSubTab('trace')}
                    className={cn("pb-2 px-1 text-sm font-bold border-b-2 transition-colors whitespace-nowrap", subTab === 'trace' ? "border-emerald-600 text-emerald-900" : "border-transparent text-gray-400")}
                  >
                    Rastreamento
                  </button>
                )}
              </div>
              
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

      {/* Mobile Navigation */}
      <nav className="md:hidden fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#1A1A1A] text-white px-6 py-3 rounded-2xl flex items-center gap-8 shadow-2xl z-50 border border-white/10">
        <NavButton active={activeTab === 'consumer'} icon={Search} onClick={() => setActiveTab('consumer')} />
        <NavButton active={activeTab === 'farmer'} icon={ShieldCheck} onClick={() => setActiveTab('farmer')} />
      </nav>
      </main>

      {/* Notifications Portal */}
      <div className="fixed bottom-24 right-6 left-6 md:left-auto md:w-80 flex flex-col gap-3 z-[100] pointer-events-none">
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
      className="space-y-12"
    >
      <section className="grid lg:grid-cols-2 gap-12 items-center">
        <div className="space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 italic text-sm">
            <ShieldCheck className="w-4 h-4" /> Global GAP Certified Traceability
          </div>
          <h2 className="text-4xl sm:text-5xl md:text-6xl font-serif font-light leading-tight">
            Transparência do <span className="italic">Campo</span> à <span className="font-bold text-emerald-900 underline decoration-emerald-200">Mesa</span>.
          </h2>
          <p className="text-base sm:text-lg text-gray-600 max-w-lg leading-relaxed">
            Plataforma digital para rastrear a origem, qualidade e jornada dos produtos agrícolas de Chimoio, Moçambique.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <button 
              onClick={onScan}
              className="w-full sm:w-auto bg-emerald-600 text-white px-8 py-4 rounded-2xl font-medium shadow-lg shadow-emerald-600/20 hover:scale-[1.02] transition-transform flex items-center justify-center gap-2"
            >
              <QrCode className="w-5 h-5" /> Digitalizar Agora
            </button>
            <button 
              onClick={onExplore}
              className="w-full sm:w-auto bg-white border border-[#E5E2D9] px-8 py-4 rounded-2xl font-medium hover:bg-gray-50 transition-colors"
            >
              Explorar Mapa
            </button>
          </div>
        </div>
        <div className="relative group">
          <div className="absolute inset-0 bg-emerald-600 rounded-[2.5rem] rotate-3 opacity-10 group-hover:rotate-1 transition-transform duration-500"></div>
          <img 
            src="https://images.unsplash.com/photo-1592982537447-7440770cbfc9?auto=format&fit=crop&q=80&w=1200" 
            alt="Agriculture Chimoio" 
            className="rounded-[2.5rem] shadow-2xl relative z-10 w-full h-[300px] sm:h-[400px] md:h-[500px] object-cover -rotate-1 group-hover:rotate-0 transition-transform duration-500"
          />
        </div>
      </section>

      <section className="grid md:grid-cols-3 gap-6 sm:gap-8">
        <StatCard 
          icon={Leaf} 
          title="Produtores Locais" 
          value="150+" 
          subtitle="Registados em Chimoio" 
        />
        <StatCard 
          icon={History} 
          title="Lotes Rastreados" 
          value="4,200" 
          subtitle="Nas últimas colheitas" 
        />
        <StatCard 
          icon={ShieldCheck} 
          title="Certificações" 
          value="98%" 
          subtitle="Taxa de conformidade GAP" 
        />
      </section>
    </motion.div>
  );
}

function StatCard({ icon: Icon, title, value, subtitle }: any) {
  return (
    <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#E5E2D9] hover:border-emerald-200 transition-colors shadow-sm group">
      <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-emerald-600 transition-colors">
        <Icon className="w-6 h-6 text-emerald-600 group-hover:text-white transition-colors" />
      </div>
      <p className="text-[10px] sm:text-xs uppercase tracking-widest font-bold text-gray-400 mb-2">{title}</p>
      <h3 className="text-3xl sm:text-4xl font-bold mb-2">{value}</h3>
      <p className="text-sm text-gray-500 font-medium">{subtitle}</p>
    </div>
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

function NavButton({ active, icon: Icon, onClick }: any) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "p-3 rounded-xl transition-all duration-300",
        active ? "bg-emerald-600 text-white scale-110 shadow-lg shadow-emerald-900/40" : "text-white/40 hover:text-white"
      )}
    >
      <Icon className="w-6 h-6" />
    </button>
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
  const [batch, setBatch] = useState<Batch | null>(scannedBatch);
  const [farmer, setFarmer] = useState<Farmer | null>(null);

  useEffect(() => {
    if (batch) {
      getDoc(doc(db, 'farmers', batch.farmerId)).then(doc => {
        if (doc.exists()) setFarmer(doc.data() as Farmer);
      });
    }
  }, [batch]);

  if (!batch) return (
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
            <p className="text-[10px] text-gray-400 font-mono">ID: {batch.batchId}</p>
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-emerald-900">{batch.cropType}</h2>
          <div className="pt-4 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Colheita</span>
              <span className="font-semibold">{formatDate(batch.harvestDate)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Quantidade</span>
              <span className="font-semibold">{batch.quantity}</span>
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
            center={[batch.location.lat, batch.location.lng]} 
            zoom={14} 
            style={{ width: '100%', height: '100%' }}
            scrollWheelZoom={false}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <Marker position={[batch.location.lat, batch.location.lng]} icon={L.divIcon({
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
                  <div className="font-bold text-emerald-900 text-lg mb-1">{batch.cropType}</div>
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
            {batch.journey.map((step, idx) => (
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
  const [farmerData, setFarmerData] = useState<Farmer | null>(null);

  useEffect(() => {
    if (user) {
      const q = query(collection(db, 'batches'), where('farmerId', '==', user.uid));
      const unsubscribe = onSnapshot(q, (snap) => {
        setBatches(snap.docs.map(doc => doc.data() as Batch));
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, `batches/farmer/${user.uid}`);
      });
      
      getDoc(doc(db, 'farmers', user.uid)).then(doc => {
        if (doc.exists()) setFarmerData(doc.data() as Farmer);
      }).catch(error => {
        handleFirestoreError(error, OperationType.GET, `farmers/${user.uid}`);
      });

      return unsubscribe;
    }
  }, [user]);

  if (!user) {
    return (
      <div className="text-center py-32 bg-white rounded-[3rem] border border-[#E5E2D9] shadow-sm space-y-6">
         <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
            <ShieldCheck className="w-10 h-10 text-emerald-600" />
         </div>
         <h2 className="text-3xl font-serif font-light">Acesso Restrito</h2>
         <p className="text-gray-500 max-w-sm mx-auto">Inicie sessão no Portal do Produtor para gerir as suas colheitas e certificados GAP.</p>
         <button onClick={login} className="bg-emerald-600 text-white px-8 py-4 rounded-2xl font-bold shadow-lg shadow-emerald-500/20">Entrar como Produtor</button>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
      <div className="grid lg:grid-cols-3 gap-6 sm:gap-8">
        <div className="lg:col-span-1 bg-white p-6 sm:p-8 rounded-[2.5rem] border border-[#E5E2D9] shadow-xl space-y-8">
          <div className="flex flex-col items-center text-center space-y-4">
             <div className="w-24 h-24 bg-emerald-100 rounded-3xl flex items-center justify-center text-emerald-600 shadow-inner group overflow-hidden relative">
                <img 
                  src={farmerData?.photoUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`} 
                  className="w-full h-full object-cover" 
                />
                <div 
                  onClick={() => setShowEditProfile(true)}
                  className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
                >
                  <Camera className="w-6 h-6 text-white" />
                </div>
             </div>
             <div className="pt-2">
                <h3 className="font-bold text-2xl text-emerald-900">{farmerData?.name || user.displayName}</h3>
                <p className="text-sm text-emerald-600/60 font-bold uppercase tracking-widest">Produtor Certificado</p>
             </div>
          </div>
          
          <div className="space-y-6 pt-6 border-t border-gray-100">
             {/* Certification Status - Prominent */}
             <div className="bg-emerald-600 text-white p-6 rounded-3xl shadow-lg shadow-emerald-600/20 relative overflow-hidden group">
                <ShieldCheck className="absolute -right-4 -bottom-4 w-24 h-24 text-white/10 rotate-12 group-hover:rotate-0 transition-transform duration-500" />
                <div className="relative z-10">
                   <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-100 mb-1">Status Global GAP</p>
                   <h4 className="text-2xl font-black">CERTIFICADO</h4>
                   <p className="text-xs font-medium text-emerald-50 mt-2 opacity-80">Validade: Dezembro 2026</p>
                </div>
             </div>

             <div className="space-y-5">
                <h4 className="text-[10px] font-black text-emerald-900 border-b border-emerald-100 pb-2 uppercase tracking-tighter">Gestão de Perfil</h4>
                
                <div className="grid grid-cols-1 gap-4">
                   <div className="relative group/field">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block ml-1 mb-1">Nome de Exibição</label>
                      <div className="flex items-center gap-3 py-3 px-4 bg-gray-50 rounded-2xl text-sm font-bold text-gray-700 border border-gray-100 transition-colors group-hover/field:border-emerald-200">
                         <User className="w-4 h-4 text-emerald-600" />
                         <span className="truncate">{farmerData?.name || user.displayName}</span>
                      </div>
                   </div>

                   <div className="relative group/field">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block ml-1 mb-1">Biografia</label>
                      <div className="py-3 px-4 bg-gray-50 rounded-2xl text-xs font-medium text-gray-500 border border-gray-100 transition-colors group-hover/field:border-emerald-200 min-h-[60px]">
                         {farmerData?.bio ? (
                           <p className="italic leading-relaxed">"{farmerData.bio}"</p>
                         ) : (
                           <span className="text-gray-300 italic">Nenhuma biografia definida.</span>
                         )}
                      </div>
                   </div>

                   <div className="relative group/field">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block ml-1 mb-1">Contacto Directo</label>
                      <div className="flex items-center gap-3 py-3 px-4 bg-gray-50 rounded-2xl text-sm font-bold text-gray-700 border border-gray-100 transition-colors group-hover/field:border-emerald-200">
                         <Phone className="w-4 h-4 text-emerald-600" />
                         {farmerData?.phoneNumber || '+258 84 000 0000'}
                      </div>
                   </div>

                   <div className="relative group/field">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block ml-1 mb-1">Localização da Farm</label>
                      <div className="h-40 bg-gray-50 rounded-2xl overflow-hidden border border-gray-100 relative z-0 transition-colors group-hover/field:border-emerald-200">
                      {farmerData?.location ? (
                        <MapContainer 
                          center={[farmerData.location.lat, farmerData.location.lng]} 
                          zoom={13} 
                          style={{ width: '100%', height: '100%' }}
                          zoomControl={false}
                          scrollWheelZoom={false}
                          dragging={false}
                          doubleClickZoom={false}
                        >
                          <TileLayer
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                          />
                          <Marker position={[farmerData.location.lat, farmerData.location.lng]} icon={defaultIcon} />
                        </MapContainer>
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center p-4">
                          <MapPin className="w-6 h-6 text-gray-300 mb-2" />
                          <p className="text-[10px] text-gray-400 font-bold uppercase">{farmerData?.province || 'Localização Não Definida'}</p>
                        </div>
                      )}
                      
                      <div className="absolute bottom-3 left-3 bg-white/90 backdrop-blur px-3 py-1 rounded-full shadow-sm border border-white/20 text-[10px] font-bold text-emerald-900 z-10">
                        {farmerData?.province || 'Chimoio, Moçambique'}
                      </div>
                    </div>
                  </div>
                </div>
             </div>

             <button 
                onClick={() => setShowEditProfile(true)}
                className="w-full py-4 text-sm font-bold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-2xl transition-all shadow-sm"
             >
                Editar Perfil do Produtor
             </button>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <div className="flex justify-between items-center bg-white p-4 sm:p-6 rounded-3xl border border-[#E5E2D9] shadow-sm">
            <h3 className="font-bold text-sm sm:text-base">Colheitas Recentes</h3>
            <button 
              onClick={() => setShowAdd(true)}
              className="bg-emerald-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-emerald-700 transition-colors flex items-center gap-2"
            >
              Registar Colheita +
            </button>
          </div>

          <div className="grid md:grid-cols-2 gap-4 sm:gap-6">
            {batches.map(b => (
              <div key={b.batchId} className="bg-white p-5 sm:p-6 rounded-3xl border border-[#E5E2D9] hover:border-emerald-200 transition-all flex items-center gap-4">
                <div className="bg-emerald-50 p-3 rounded-2xl">
                  <QRCodeSVG value={b.batchId} size={60} level="H" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-bold truncate text-lg">{b.cropType}</h4>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-gray-400 font-mono">{b.batchId}</span>
                    <span className="bg-emerald-100 text-emerald-700 text-[9px] px-2 py-0.5 rounded-full font-bold uppercase">{b.status}</span>
                  </div>
                </div>
              </div>
            ))}

            {batches.length === 0 && (
              <div className="col-span-full py-20 text-center bg-gray-50 rounded-3xl border-2 border-dashed border-gray-200">
                 <Leaf className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                 <p className="text-gray-400 font-medium">Ainda não registou nenhuma colheita.</p>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {showAdd && <AddBatchModal userId={user.uid} onClose={() => setShowAdd(false)} />}
      {showEditProfile && (
        <EditProfileModal 
          farmer={farmerData} 
          userId={user.uid} 
          onClose={() => setShowEditProfile(false)} 
          onSave={(updated) => setFarmerData(updated)}
        />
      )}
    </motion.div>
  );
}

function LoginForm({ lang, onBack, onLogin, onGoogle, onGoRegister }: any) {
  const [phone, setPhone] = useState('');
  const [verificationId, setVerificationId] = useState<ConfirmationResult | null>(null);
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);

  const setUpRecaptcha = () => {
    if ((window as any).recaptchaVerifierLogin) return;
    (window as any).recaptchaVerifierLogin = new RecaptchaVerifier(auth, 'recaptcha-container-login', {
      'size': 'invisible'
    });
  };

  const onSendCode = async () => {
    if (!phone || phone.length < 9) return;
    setLoading(true);
    try {
      setUpRecaptcha();
      const appVerifier = (window as any).recaptchaVerifierLogin;
      let formattedPhone = phone.replace(/\s+/g, '');
      if (!formattedPhone.startsWith('+')) {
        if (formattedPhone.startsWith('258')) formattedPhone = '+' + formattedPhone;
        else formattedPhone = '+258' + formattedPhone;
      }
      const confirmationResult = await signInWithPhoneNumber(auth, formattedPhone, appVerifier);
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

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="w-full space-y-6"
    >
      {!verificationId ? (
        <div className="space-y-4">
          <div className="relative text-left">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1 mb-1 block">{lang === 'pt' ? "Telemóvel" : "Phone"}</label>
            <div className="relative">
              <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input 
                type="text" 
                placeholder="e.g. 84 123 4567"
                className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-4 pl-12 pr-4 focus:ring-2 focus:ring-emerald-600 outline-none transition-all"
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

      <div className="flex items-center gap-4 py-2">
        <div className="h-px bg-gray-100 flex-1"></div>
        <span className="text-xs text-gray-400 font-bold uppercase">{lang === 'pt' ? "OU" : "OR"}</span>
        <div className="h-px bg-gray-100 flex-1"></div>
      </div>

      <button 
        onClick={onGoogle}
        className="w-full bg-white text-gray-700 py-4 px-6 rounded-2xl font-bold border border-gray-100 shadow-sm active:scale-95 transition-transform flex items-center justify-center gap-2"
      >
        <img src="https://www.google.com/favicon.ico" className="w-4 h-4" /> Google Login
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
    phone: '',
    location: '',
    pass: '' // We'll keep password for secondary auth or drop it if purely phone
  });
  const [detecting, setDetecting] = useState(false);
  const [verificationId, setVerificationId] = useState<ConfirmationResult | null>(null);
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);

  const setUpRecaptcha = () => {
    if ((window as any).recaptchaVerifier) return;
    (window as any).recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
      'size': 'invisible',
      'callback': (response: any) => {
        // reCAPTCHA solved, allow signInWithPhoneNumber.
        console.log("Recaptcha solved");
      }
    });
  };

  const onSendCode = async () => {
    if (!formData.phone || formData.phone.length < 9) {
      showToast(lang === 'pt' ? 'Por favor, insira um número de telemóvel válido.' : 'Please enter a valid phone number.', 'info');
      return;
    }
    
    setLoading(true);
    try {
      setUpRecaptcha();
      const appVerifier = (window as any).recaptchaVerifier;
      
      // Format number for Moçambique +258
      let formattedPhone = formData.phone.replace(/\s+/g, '');
      if (!formattedPhone.startsWith('+')) {
        if (formattedPhone.startsWith('258')) formattedPhone = '+' + formattedPhone;
        else formattedPhone = '+258' + formattedPhone;
      }

      const confirmationResult = await signInWithPhoneNumber(auth, formattedPhone, appVerifier);
      setVerificationId(confirmationResult);
      showToast('Código SMS enviado para o seu telemóvel!', 'success');
    } catch (error: any) {
      console.error('Error sending SMS:', error);
      showToast(lang === 'pt' ? 'Erro ao enviar SMS. Verifique se o número está correto.' : 'Error sending SMS. Check number.', 'error');
      if ((window as any).recaptchaVerifier) {
         (window as any).recaptchaVerifier.clear();
         (window as any).recaptchaVerifier = null;
      }
    } finally {
      setLoading(false);
    }
  };

  const onVerifyCode = async () => {
    if (!otp || otp.length < 6) return;
    setLoading(true);
    try {
      await verificationId!.confirm(otp);
      // User is now signed in with phone!
      // Now we finalize the profile
      await onRegister(formData);
    } catch (error: any) {
      console.error('Error verifying OTP:', error);
      showToast('Código SMS inválido ou expirado.', 'error');
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
        // In a real app, we might reverse geocode here. 
        // For now, we'll set it to a descriptive string and keep the coords in data if needed
        const locString = `Lat: ${latitude.toFixed(4)}, Lng: ${longitude.toFixed(4)}`;
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
      className="w-full space-y-5"
    >
      {!verificationId ? (
        <div className="space-y-3">
          <div className="relative text-left">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1 mb-1 block">{lang === 'pt' ? "Nome Completo" : "Full Name"}</label>
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input 
                type="text" 
                placeholder="e.g. João Manuel"
                className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-4 pl-12 pr-4 focus:ring-2 focus:ring-emerald-600 outline-none transition-all"
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
              />
            </div>
          </div>
          <div className="relative text-left">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1 mb-1 block">{lang === 'pt' ? "Telemóvel" : "Phone"}</label>
            <div className="relative">
              <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input 
                type="text" 
                placeholder="e.g. 84 000 0000"
                className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-4 pl-12 pr-4 focus:ring-2 focus:ring-emerald-600 outline-none transition-all"
                value={formData.phone}
                onChange={e => setFormData({...formData, phone: e.target.value})}
              />
            </div>
          </div>
          <div className="relative text-left">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1 mb-1 block">{lang === 'pt' ? "Localização / Endereço" : "Location / Address"}</label>
            <div className="relative">
              <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input 
                type="text" 
                placeholder="e.g. Chimoio, Manica"
                className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-4 pl-12 pr-14 focus:ring-2 focus:ring-emerald-600 outline-none transition-all"
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
                <LocateFixed className={cn("w-5 h-5", detecting && "animate-pulse")} />
              </button>
            </div>
          </div>

          <div id="recaptcha-container"></div>
          
          <button 
            onClick={onSendCode}
            disabled={loading}
            className="w-full bg-emerald-600 text-white py-4 px-10 rounded-2xl font-bold shadow-xl shadow-emerald-600/20 active:scale-95 transition-transform flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? (lang === 'pt' ? "A PROCESSAR..." : "PROCESSING...") : (lang === 'pt' ? "VERIFICAR NÚMERO" : "VERIFY NUMBER")} <Phone className="w-5 h-5" />
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="text-center space-y-2">
            <h4 className="font-bold text-emerald-900">{lang === 'pt' ? "Introduza o Código" : "Enter Code"}</h4>
            <p className="text-sm text-gray-500">{lang === 'pt' ? "Enviámos um SMS para" : "We sent an SMS to"} <span className="font-bold">{formData.phone}</span></p>
          </div>
          
          <div className="relative text-left">
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input 
                type="text" 
                placeholder="123456"
                maxLength={6}
                className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-4 pl-12 pr-4 focus:ring-2 focus:ring-emerald-600 outline-none transition-all text-center tracking-[0.5em] font-bold text-xl"
                value={otp}
                onChange={e => setOtp(e.target.value)}
              />
            </div>
          </div>

          <button 
            onClick={onVerifyCode}
            disabled={loading || otp.length < 6}
            className="w-full bg-emerald-600 text-white py-4 px-10 rounded-2xl font-bold shadow-xl shadow-emerald-600/20 active:scale-95 transition-transform flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? (lang === 'pt' ? "A CONFIRMAR..." : "CONFIRMING...") : (lang === 'pt' ? "CONFIRMAR E REGISTAR" : "CONFIRM & REGISTER")} <ArrowRight className="w-5 h-5" />
          </button>

          <button 
            onClick={() => setVerificationId(null)}
            className="w-full text-sm font-bold text-gray-400 hover:text-gray-600"
          >
            {lang === 'pt' ? "Alterar número" : "Change number"}
          </button>
        </div>
      )}

      <div className="pt-4 flex flex-col items-center gap-4">
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
