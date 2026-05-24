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
  Plus,
  Check,
  X,
  LocateFixed,
  Mail,
  Edit,
  Save,
  Eye,
  EyeOff,
  Filter,
  Sparkles,
  LogOut,
  Trash2,
  Home,
  Globe,
  Wifi,
  WifiOff,
  RefreshCw,
  Share2
} from 'lucide-react';
import { cn, formatDate } from './lib/utils';
import { auth, db } from './lib/firebase';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  deleteUser
} from 'firebase/auth';
import { doc, getDoc, getDocs, setDoc, collection, query, where, onSnapshot, updateDoc, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import type { UserProfile, Batch, Farmer } from './types';
import { getDocFromServer } from 'firebase/firestore';
import { storage } from './lib/firebase';
import NetworkGraphView from './components/NetworkGraphView';

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

export interface NetworkInfo {
  network: 'mcel' | 'vodacom' | 'movitel' | 'international' | 'none';
  formatted: string;
  isValid: boolean;
  label: string;
  color: string;
}

export function parseAndValidatePhone(phone: string): NetworkInfo {
  const clean = phone.replace(/[^0-9+]/g, '');
  
  if (!clean) {
    return { network: 'none', formatted: '', isValid: false, label: 'Nenhum', color: 'text-gray-400 bg-gray-100 border-gray-200' };
  }

  // Check if it starts with +
  if (clean.startsWith('+')) {
    const withoutPlus = clean.substring(1);
    // Is it Mozambique?
    if (withoutPlus.startsWith('258')) {
      const mzDigits = withoutPlus.substring(3);
      if (mzDigits.length === 9) {
        const prefix2 = mzDigits.substring(0, 2);
        if (['82', '83'].includes(prefix2)) {
          return { network: 'mcel', formatted: clean, isValid: true, label: 'M-Cel (Moçambique)', color: 'text-emerald-700 bg-emerald-50 border border-emerald-200' };
        } else if (['84', '85'].includes(prefix2)) {
          return { network: 'vodacom', formatted: clean, isValid: true, label: 'Vodacom (Moçambique)', color: 'text-red-700 bg-red-50 border border-red-200' };
        } else if (['86', '87'].includes(prefix2)) {
          return { network: 'movitel', formatted: clean, isValid: true, label: 'Movitel (Moçambique)', color: 'text-orange-700 bg-orange-50 border border-orange-200' };
        }
      }
    }
    // Any other international number
    const isValidInt = clean.length >= 8 && clean.length <= 15;
    return { network: 'international', formatted: clean, isValid: isValidInt, label: isValidInt ? 'Internacional' : 'Número incompleto', color: 'text-indigo-700 bg-indigo-50 border border-indigo-200' };
  }

  // If it starts with 258 (and doesn't have +)
  if (clean.startsWith('258')) {
    const mzDigits = clean.substring(3);
    if (mzDigits.length === 9) {
      const prefix2 = mzDigits.substring(0, 2);
      const formatted = `+${clean}`;
      if (['82', '83'].includes(prefix2)) {
        return { network: 'mcel', formatted, isValid: true, label: 'M-Cel (Moçambique)', color: 'text-emerald-700 bg-emerald-50 border border-emerald-200' };
      } else if (['84', '85'].includes(prefix2)) {
        return { network: 'vodacom', formatted, isValid: true, label: 'Vodacom (Moçambique)', color: 'text-red-700 bg-red-50 border border-red-200' };
      } else if (['86', '87'].includes(prefix2)) {
        return { network: 'movitel', formatted, isValid: true, label: 'Movitel (Moçambique)', color: 'text-orange-700 bg-orange-50 border border-orange-200' };
      }
    }
  }

  // If it is 9 digits (Mozambique domestic local user, e.g., "841234567")
  if (clean.length === 9 && !clean.startsWith('258')) {
    const prefix2 = clean.substring(0, 2);
    const formatted = `+258${clean}`;
    if (['82', '83'].includes(prefix2)) {
      return { network: 'mcel', formatted, isValid: true, label: 'M-Cel (Moçambique)', color: 'text-emerald-700 bg-emerald-50 border border-emerald-200' };
    } else if (['84', '85'].includes(prefix2)) {
      return { network: 'vodacom', formatted, isValid: true, label: 'Vodacom (Moçambique)', color: 'text-red-700 bg-red-50 border border-red-200' };
    } else if (['86', '87'].includes(prefix2)) {
      return { network: 'movitel', formatted, isValid: true, label: 'Movitel (Moçambique)', color: 'text-orange-700 bg-orange-50 border border-orange-200' };
    }
  }

  // If it's starting with 82, 83, 84, 85, 86, 87 and is typing (between 2 and 9 digits)
  if (clean.length >= 2 && clean.length <= 9 && !clean.startsWith('258') && !clean.startsWith('+')) {
    const prefix2 = clean.substring(0, 2);
    if (['82', '83'].includes(prefix2)) {
      return { network: 'mcel', formatted: `+258${clean}`, isValid: clean.length === 9, label: 'M-Cel (Moçambique)', color: 'text-emerald-700 bg-emerald-50 border border-emerald-200' };
    } else if (['84', '85'].includes(prefix2)) {
      return { network: 'vodacom', formatted: `+258${clean}`, isValid: clean.length === 9, label: 'Vodacom (Moçambique)', color: 'text-red-700 bg-red-50 border border-red-200' };
    } else if (['86', '87'].includes(prefix2)) {
      return { network: 'movitel', formatted: `+258${clean}`, isValid: clean.length === 9, label: 'Movitel (Moçambique)', color: 'text-orange-700 bg-orange-50 border border-orange-200' };
    }
  }

  // Otherwise, assume international.
  const hasPlusPrefix = clean.startsWith('+');
  const formatted = hasPlusPrefix ? clean : `+${clean}`;
  const isValidInt = clean.length >= 8 && clean.length <= 15;
  return { network: 'international', formatted, isValid: isValidInt, label: isValidInt ? 'Internacional / Outro' : 'Número incompleto', color: 'text-indigo-700 bg-indigo-50 border border-indigo-200' };
}

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

const getMarkerIcon = (productType: string) => {
  let colorClass = 'bg-emerald-600';
  let pulseClass = 'bg-emerald-500/40';

  if (productType === 'fruta') {
    colorClass = 'bg-amber-500';
    pulseClass = 'bg-amber-400/40';
  } else if (productType === 'grão') {
    colorClass = 'bg-yellow-600';
    pulseClass = 'bg-yellow-500/40';
  } else if (productType === 'vegetal') {
    colorClass = 'bg-emerald-600';
    pulseClass = 'bg-emerald-500/40';
  }

  return L.divIcon({
    className: 'custom-leaflet-marker',
    html: `
      <div class="relative flex items-center justify-center w-8 h-8">
        <div class="absolute inset-0 rounded-full animate-ping ${pulseClass} opacity-75" style="animation-duration: 3s"></div>
        <div class="relative w-5 h-5 rounded-full ${colorClass} border-2 border-white shadow-md flex items-center justify-center">
          <div class="w-1.5 h-1.5 rounded-full bg-white"></div>
        </div>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -10],
  });
};

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
  const [subTab, setSubTab] = useState<'home' | 'map' | 'scan' | 'trace' | 'network'>('home');
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
            const data = userDoc.data() as UserProfile;
            if (!data.photoUrl && firebaseUser.photoURL) {
              data.photoUrl = firebaseUser.photoURL;
              try {
                await updateDoc(doc(db, 'users', firebaseUser.uid), { photoUrl: firebaseUser.photoURL });
                await updateDoc(doc(db, 'farmers', firebaseUser.uid), { photoUrl: firebaseUser.photoURL });
              } catch (e) {
                console.error("Failed to sync photoUrl from Google:", e);
              }
            }
            setUser(data);
            if (view === 'landing') setView('app');
          } else {
            // New user (likely from Google Login since phone login handles its own creation)
            const newUser: UserProfile = {
              uid: firebaseUser.uid,
              email: firebaseUser.email || '',
              displayName: firebaseUser.displayName || firebaseUser.phoneNumber || 'Usuário',
              role: 'farmer',
              photoUrl: firebaseUser.photoURL || '',
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
                photoUrl: firebaseUser.photoURL || ''
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

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'notifications'), 
      where('targetUserId', '==', user.uid),
      where('read', '==', false)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docs.forEach(async (docSnap) => {
        const notif = docSnap.data();
        
        showToast(
          `🔔 Novo Lote! O produtor ${notif.farmerName} registou um novo lote de ${notif.cropType}.`,
          'info'
        );

        try {
          await updateDoc(docSnap.ref, { read: true });
        } catch (err) {
          console.error("Error marking notification as read:", err);
        }
      });
    }, (error) => {
      console.error("Error in notifications subscriber:", error);
    });

    return unsubscribe;
  }, [user]);

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
      let emailToUse = data.email?.trim() || '';
      
      if (data.noEmail) {
        const parsed = parseAndValidatePhone(data.phone);
        if (!parsed.isValid) {
          showToast('Por favor, insira um número de telemóvel válido.', 'error');
          return;
        }
        emailToUse = `${parsed.formatted}@celular.agrotrace.com`;
      }

      const userCredential = await createUserWithEmailAndPassword(auth, emailToUse, data.password);
      const firebaseUser = userCredential.user;

      const newUser: UserProfile = {
        uid: firebaseUser.uid,
        email: emailToUse,
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
      if (error.code === 'auth/email-already-in-use') message = 'Este email ou número de telemóvel já está em uso.';
      if (error.code === 'auth/weak-password') message = 'A senha deve ter pelo menos 6 caracteres.';
      if (error.code === 'auth/invalid-email') message = 'Email ou telemóvel inválido.';
      showToast(message, 'error');
      throw error;
    }
  };

  const handleEmailLogin = async (data: any) => {
    let emailToUse = data.email.trim();
    if (!emailToUse.includes('@')) {
      const parsed = parseAndValidatePhone(emailToUse);
      if (parsed.isValid) {
        emailToUse = `${parsed.formatted}@celular.agrotrace.com`;
      } else {
        showToast('Por favor, introduza um e-mail válido ou telemóvel registado.', 'error');
        return;
      }
    }
    try {
      await signInWithEmailAndPassword(auth, emailToUse, data.password);
      setView('app');
      setActiveTab('farmer');
    } catch (error: any) {
      let message = 'E-mail/Telemóvel ou senha incorretos.';
      if (error.code === 'auth/user-not-found') {
        message = 'Usuário não encontrado.';
      } else if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        message = 'E-mail/Telemóvel ou senha incorretos.';
      } else if (error.code === 'auth/invalid-email') {
        message = 'E-mail ou telemóvel inválido.';
      } else {
        console.error('Login error:', error);
      }
      showToast(message, 'error');
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
                      {activeTab === 'consumer' ? (subTab === 'home' ? 'AgroTrace' : subTab === 'map' ? 'Explorar' : subTab === 'network' ? 'Ecossistema de Produção' : subTab === 'scan' ? 'Scanner' : 'Rastreio') : 'Portal Produtor'}
                    </h1>
                    {!isOnline && (
                      <div className="flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wide uppercase ml-2 animate-pulse" title="Ligação perdida. Os dados exibidos estão em cache e podem não ser em tempo real.">
                        <WifiOff className="w-3 h-3 text-amber-600 shrink-0" />
                        <span>Dados em Cache</span>
                      </div>
                    )}
                  </div>
                  <span className="text-[10px] font-bold text-emerald-600/60 uppercase tracking-widest leading-none">Moçambique</span>
                </motion.div>
              </div>
              
              <div className="flex items-center gap-3">
                {/* Profile Display */}
                {user && (
                  <div className="flex items-center gap-2 bg-[#FAF8F2] border border-[#E5E2D9] py-1 pl-2 pr-3 rounded-2xl shadow-sm h-10">
                    <div className="w-6 h-6 rounded-lg bg-white border border-[#E5E2D9] overflow-hidden flex items-center justify-center shrink-0">
                      {user.photoUrl ? (
                        <img src={user.photoUrl} className="w-full h-full object-cover" alt="Profile" />
                      ) : (
                        <User className="w-3.5 h-3.5 text-emerald-600" />
                      )}
                    </div>
                    <div className="flex flex-col text-left">
                      <span className="text-[10px] font-bold text-[#3C3A34] truncate max-w-[80px] leading-tight">
                        {user.name || user.email?.split('@')[0]}
                      </span>
                      <span className="text-[8px] font-bold text-emerald-600 uppercase tracking-widest leading-none">
                        {user.role === 'farmer' ? 'Produtor' : 'Consumidor'}
                      </span>
                    </div>
                  </div>
                )}

                {/* Separate Logout button in the corner */}
                <button 
                  onClick={logout}
                  className="h-10 px-3.5 rounded-2xl bg-white hover:bg-red-50 text-red-600 border border-[#E5E2D9] hover:border-red-200 transition-colors active:scale-95 flex items-center gap-1.5 shadow-sm font-bold text-[10px] uppercase tracking-wider"
                  title="Sair"
                >
                  <LogOut className="w-3.5 h-3.5 text-red-500" />
                  <span>Sair</span>
                </button>
              </div>
            </header>

            {/* Content Area */}
            <div className="px-6">
              <AnimatePresence mode="wait">
                {activeTab === 'consumer' ? (
                  <div key="consumer" className="space-y-6">
                    {subTab === 'home' && (
                      <HomeView 
                        onExplore={() => setSubTab('map')} 
                        onSelectBatch={(b) => { setScannedBatch(b); setSubTab('trace'); }} 
                        onViewNetwork={() => setSubTab('network')}
                      />
                    )}
                    {subTab === 'map' && <GlobalMapView onSelectBatch={(b) => { setScannedBatch(b); setSubTab('trace'); }} />}
                    {subTab === 'network' && <NetworkGraphView />}
                    {subTab === 'scan' && <ScanView onResult={(batch) => { setScannedBatch(batch); setSubTab('trace'); }} />}
                    {subTab === 'trace' && <TraceView scannedBatch={scannedBatch} forceSingleColumn={true} />}
                  </div>
                ) : (
                  <FarmerPortal key="farmer" user={user} login={() => { setView('landing'); setAuthMode('login'); }} logout={logout} />
                )}
              </AnimatePresence>
            </div>
          </main>

          {/* iOS Style Bottom Home Bar - Desktop Only */}
          <div className="absolute bottom-1 w-32 h-1.5 bg-black/10 rounded-full left-1/2 -translate-x-1/2 z-[60] pointer-events-none hidden md:block"></div>

          {/* Bottom Navigation */}
          <nav className="absolute bottom-6 left-6 right-6 bg-emerald-950/95 backdrop-blur-xl rounded-[2.5rem] p-4 flex items-center justify-around shadow-2xl z-50 border border-white/10">
            <NavTab 
              active={activeTab === 'consumer' && subTab === 'home'} 
              icon={Home} 
              label="Início"
              onClick={() => { setActiveTab('consumer'); setSubTab('home'); }} 
            />
            <NavTab 
              active={activeTab === 'consumer' && subTab === 'map'} 
              icon={MapPin} 
              label="Mapa"
              onClick={() => { setActiveTab('consumer'); setSubTab('map'); }} 
            />
            <NavTab 
              active={activeTab === 'consumer' && subTab === 'network'} 
              icon={Share2} 
              label="Rede"
              onClick={() => { setActiveTab('consumer'); setSubTab('network'); }} 
            />
            
            {user?.role === 'farmer' && (
              <NavTab 
                active={activeTab === 'farmer'} 
                icon={ShieldCheck} 
                label="Painel"
                onClick={() => setActiveTab('farmer')} 
              />
            )}
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

function HomeView({ onExplore, onSelectBatch, onViewNetwork }: { onExplore: () => void, onSelectBatch: (b: Batch) => void, onViewNetwork: () => void }) {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [farmers, setFarmers] = useState<Record<string, Farmer>>({});
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'vegetal' | 'fruta' | 'grão'>('all');
  const [selectedFarmerId, setSelectedFarmerId] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<'all' | 'harvested' | 'distributing' | 'market'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [manualBatchId, setManualBatchId] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Immediate Offline fallback from local device cache
    try {
      const cachedBatches = JSON.parse(localStorage.getItem('agrotrace_cached_batches') || '{}');
      const cachedFarmers = JSON.parse(localStorage.getItem('agrotrace_cached_farmers') || '{}');
      if (Object.keys(cachedBatches).length > 0) {
        setBatches(Object.values(cachedBatches));
        setLoading(false);
      }
      if (Object.keys(cachedFarmers).length > 0) {
        setFarmers(cachedFarmers);
      }
    } catch (e) {
      console.error('Error fetching offline cache:', e);
    }

    // Live subscription of products/batches
    const qBatches = collection(db, 'batches');
    const unsubBatches = onSnapshot(qBatches, (snap) => {
      const liveBatches = snap.docs.map(doc => doc.data() as Batch);
      setBatches(liveBatches);
      setLoading(false);

      // Save to cache
      try {
        const cached = JSON.parse(localStorage.getItem('agrotrace_cached_batches') || '{}');
        liveBatches.forEach(b => {
          cached[b.batchId] = b;
        });
        localStorage.setItem('agrotrace_cached_batches', JSON.stringify(cached));
      } catch (e) {
        console.error(e);
      }
    }, (error) => {
      console.error("HomeView: Failed to load batches:", error);
      setLoading(false);
    });

    // Live subscription of registered producers
    const qFarmers = collection(db, 'farmers');
    const unsubFarmers = onSnapshot(qFarmers, (snap) => {
      const farmerMap: Record<string, Farmer> = {};
      snap.docs.forEach(doc => {
        const f = doc.data() as Farmer;
        farmerMap[f.farmerId] = f;
      });
      setFarmers(farmerMap);

      // Save to cache
      try {
        const cached = JSON.parse(localStorage.getItem('agrotrace_cached_farmers') || '{}');
        Object.values(farmerMap).forEach(f => {
          cached[f.farmerId] = f;
        });
        localStorage.setItem('agrotrace_cached_farmers', JSON.stringify(cached));
      } catch (e) {
        console.error(e);
      }
    }, (error) => {
      console.error("HomeView: Failed to load farmers:", error);
    });

    return () => {
      unsubBatches();
      unsubFarmers();
    };
  }, []);

  const handleManualSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualBatchId.trim()) return;
    const cleanId = manualBatchId.trim().toUpperCase();
    try {
      const docRef = doc(db, 'batches', cleanId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data() as Batch;
        onSelectBatch(data);
        showToast('Lote localizado com sucesso!', 'success');
      } else {
        // Fallback search in cache
        const cached = JSON.parse(localStorage.getItem('agrotrace_cached_batches') || '{}');
        if (cached[cleanId]) {
          onSelectBatch(cached[cleanId]);
          showToast('Lote localizado do cache local!', 'success');
        } else {
          showToast('Lote não encontrado. Verifique o código.', 'error');
        }
      }
    } catch (err) {
      showToast('Erro ao procurar o lote.', 'error');
    }
  };

  // Filter batches based on state
  const filteredBatches = batches.filter(b => {
    const matchesCategory = selectedCategory === 'all' || b.productType === selectedCategory;
    const matchesFarmer = !selectedFarmerId || b.farmerId === selectedFarmerId;
    const matchesStatus = selectedStatus === 'all' || b.status === selectedStatus;
    const farmerName = farmers[b.farmerId]?.name || '';
    const matchesSearch = searchQuery === '' || 
      b.cropType.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.batchId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      farmerName.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesCategory && matchesFarmer && matchesStatus && matchesSearch;
  });

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-8"
      id="consumer-home-container"
    >
      {/* Hero Welcome */}
      <section className="space-y-1.5" id="welcome-message-header">
        <h2 className="text-3xl font-extrabold text-emerald-950 tracking-tight leading-tight">
          Saber de onde <br />
          <span className="text-emerald-600">Vem o seu Alimento.</span>
        </h2>
        <p className="text-xs text-[#7C7A74] font-semibold tracking-wide uppercase">Moçambique • AgroTrace Rastreabilidade</p>
      </section>

      {/* Main Premium Banner - Redesigned as a resilient flexbox-directed container */}
      <section className="relative overflow-hidden group shadow-md rounded-[2rem] flex flex-col justify-between min-h-[21rem] md:min-h-[23rem]" id="showcase-banner">
        {/* Fully responsive absolute layout cover picture */}
        <img 
          src="https://images.unsplash.com/photo-1592982537447-7440770cbfc9?auto=format&fit=crop&q=80&w=1200" 
          alt="Agriculture" 
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
        />
        {/* Deep, rich gradient cover ensuring full readability across text blocks */}
        <div className="absolute inset-0 bg-gradient-to-t from-emerald-950/95 via-emerald-950/50 to-transparent z-10"></div>
        
        {/* Top interactive row containing certifications and the compact floating sticker */}
        <div className="relative z-20 p-4 sm:p-6 flex justify-between items-start w-full gap-4">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/30 backdrop-blur-md text-white border border-white/20 text-[9px] font-bold uppercase tracking-wider">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Global GAP Moçambique
          </div>
          
          {/* Resolute, elegant and non-crowding floating sticker */}
          <div className="bg-amber-400 text-emerald-950 p-2 sm:p-2.5 rounded-full flex flex-col items-center justify-center border border-dashed border-amber-600 shadow-xl select-none rotate-12 scale-95 sm:scale-100 hover:rotate-6 transition-all duration-300 w-16 h-16 sm:w-20 sm:h-20 text-center shrink-0">
            <Globe className="w-3.5 h-3.5 text-emerald-900 mb-0.5" />
            <span className="text-[7px] sm:text-[8px] font-black tracking-tighter uppercase leading-none text-emerald-950">100% Rastreável</span>
            <span className="text-[5.5px] sm:text-[6px] font-bold tracking-tight uppercase text-emerald-900 leading-none mt-0.5">Moçambique</span>
          </div>
        </div>

        {/* Bottom descriptive and CTA action row */}
        <div className="relative z-20 p-5 sm:p-6 pt-0 space-y-3 mt-auto w-full">
          <h3 className="text-lg sm:text-2xl font-bold text-white leading-snug tracking-tight">
            Segurança Alimentar e Rastreio Total do Produtor à Mesa
          </h3>
          <p className="text-emerald-100/90 text-[10px] sm:text-xs max-w-sm leading-normal">
            A tecnologia blockchain e de registos distribuídos garante que a integridade deste alimento nunca seja comprometida.
          </p>
          <div className="flex flex-col sm:flex-row gap-2 pt-1">
             <button 
               id="explore_all_producers_btn"
               onClick={onExplore}
               className="w-full sm:w-auto bg-white hover:bg-emerald-50 text-emerald-900 px-4 py-2.5 rounded-xl font-bold text-[10px] uppercase tracking-wider active:scale-95 transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer h-10"
             >
               <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> Explorar no Mapa
             </button>
             <button 
               id="view_ecosystem_network_btn"
               onClick={onViewNetwork}
               className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl font-bold text-[10px] uppercase tracking-wider active:scale-95 transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer h-10"
             >
               <Share2 className="w-3.5 h-3.5 text-white animate-pulse shrink-0" /> Ver Ecossistema de Produção
             </button>
          </div>
        </div>
      </section>

      {/* Real-time Dynamic Stats - Reorganized into beautiful, highly resilient Bento Grid blocks to prevent any overlapping on small screens */}
      <section className="grid grid-cols-2 gap-3" id="home-stats-counters">
        {/* Card 1: Produtores */}
        <div className="bg-white p-3.5 rounded-2xl border border-[#E5E2D9] shadow-sm flex flex-col justify-between hover:border-emerald-500/20 hover:shadow-md transition-all h-[92px]">
          <div className="flex items-center justify-between w-full">
            <div className="w-8 h-8 bg-emerald-50 rounded-xl flex items-center justify-center border border-emerald-100 shrink-0">
              <User className="w-4 h-4 text-emerald-600" />
            </div>
            <span className="text-[7.5px] font-black bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded-md uppercase tracking-wider leading-none">Ao Vivo</span>
          </div>
          <div className="mt-2 text-left">
            <h4 className="text-lg font-black text-emerald-950 leading-none mb-0.5">{Object.keys(farmers).length}</h4>
            <p className="text-[8px] uppercase font-bold text-[#8C8A84] tracking-wider leading-none">PRODUTORES</p>
          </div>
        </div>

        {/* Card 2: No Mercado */}
        <div className="bg-white p-3.5 rounded-2xl border border-[#E5E2D9] shadow-sm flex flex-col justify-between hover:border-emerald-500/20 hover:shadow-md transition-all h-[92px]">
          <div className="flex items-center justify-between w-full">
            <div className="w-8 h-8 bg-amber-50 rounded-xl flex items-center justify-center border border-amber-100 shrink-0">
              <Globe className="w-4 h-4 text-amber-600 animate-pulse" />
            </div>
            <span className="text-[7.5px] font-black bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded-md uppercase tracking-wider leading-none">Ativos</span>
          </div>
          <div className="mt-2 text-left">
            <h4 className="text-lg font-black text-emerald-950 leading-none mb-0.5">{batches.filter(b => b.status === 'market').length}</h4>
            <p className="text-[8px] uppercase font-bold text-[#8C8A84] tracking-wider leading-none">NO MERCADO</p>
          </div>
        </div>

        {/* Card 3: Em Trânsito */}
        <div className="bg-white p-3.5 rounded-2xl border border-[#E5E2D9] shadow-sm flex flex-col justify-between hover:border-emerald-500/20 hover:shadow-md transition-all h-[92px]">
          <div className="flex items-center justify-between w-full">
            <div className="w-8 h-8 bg-indigo-50 rounded-xl flex items-center justify-center border border-indigo-100 shrink-0">
              <History className="w-4 h-4 text-indigo-600" />
            </div>
            <span className="text-[7.5px] font-black bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded-md uppercase tracking-wider leading-none">Na Estrada</span>
          </div>
          <div className="mt-2 text-left">
            <h4 className="text-lg font-black text-emerald-950 leading-none mb-0.5">{batches.filter(b => b.status === 'distributing').length}</h4>
            <p className="text-[8px] uppercase font-bold text-[#8C8A84] tracking-wider leading-none">EM TRÂNSITO</p>
          </div>
        </div>

        {/* Card 4: Certificados */}
        <div className="bg-white p-3.5 rounded-2xl border border-[#E5E2D9] shadow-sm flex flex-col justify-between hover:border-emerald-500/20 hover:shadow-md transition-all h-[92px]">
          <div className="flex items-center justify-between w-full">
            <div className="w-8 h-8 bg-yellow-50 rounded-xl flex items-center justify-center border border-yellow-100 shrink-0">
              <ShieldCheck className="w-4 h-4 text-yellow-600" />
            </div>
            <span className="text-[7.5px] font-black bg-yellow-50 text-yellow-700 px-1.5 py-0.5 rounded-md uppercase tracking-wider leading-none">Selo GAP</span>
          </div>
          <div className="mt-2 text-left">
            <h4 className="text-lg font-black text-emerald-950 leading-none mb-0.5">
              {Object.values(farmers).filter(f => f.certificationStatus === 'certified').length}
            </h4>
            <p className="text-[8px] uppercase font-bold text-[#8C8A84] tracking-wider leading-none">CERTIFICADOS</p>
          </div>
        </div>
      </section>

      {/* Featured Real-Time Farmers Scrolling Row */}
      <section className="space-y-3" id="home-realtime-farmers-section">
        <div className="flex justify-between items-center">
          <h4 className="font-extrabold text-[#2C2B29] text-xs uppercase tracking-widest leading-none">
            Produtores Registados <span className="text-emerald-600 font-bold">• AgroTrace</span>
          </h4>
          {selectedFarmerId && (
            <button
              onClick={() => setSelectedFarmerId(null)}
              className="text-[9px] font-black uppercase text-red-500 bg-red-50 hover:bg-red-100 px-2 py-1 rounded-xl transition-all"
            >
              Ver Todos
            </button>
          )}
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2.5 pt-0.5 invisible-scrollbar" id="producers-scroll-row">
          {/* Card "Todos" */}
          <button
            onClick={() => setSelectedFarmerId(null)}
            className={cn(
              "p-3 rounded-2xl transition-all duration-300 border flex flex-col items-center justify-center text-center w-24 shrink-0 shadow-sm active:scale-95 cursor-pointer",
              !selectedFarmerId 
                ? "bg-emerald-900 border-emerald-950 text-white"
                : "bg-white hover:bg-gray-50 border-gray-200 text-[#5C5A54]"
            )}
          >
            <div className="w-10 h-10 rounded-full bg-emerald-100 border border-emerald-200 text-emerald-800 flex items-center justify-center text-[10px] font-black mb-2">
              <Globe className="w-5 h-5 shrink-0" />
            </div>
            <span className="text-[10px] font-extrabold truncate w-full leading-none">Todos</span>
            <span className={cn("text-[8px] font-medium block mt-1.5 leading-none", !selectedFarmerId ? "text-emerald-200" : "text-[#7C7A70]")}>
              {batches.filter(b => b.status === 'market').length} lotes
            </span>
          </button>

          {/* Loop over farmers */}
          {Object.values(farmers).map(f => {
            const isSelected = selectedFarmerId === f.farmerId;
            const farmerMarketLots = batches.filter(b => b.farmerId === f.farmerId && b.status === 'market').length;
            
            return (
              <button
                key={f.farmerId}
                onClick={() => setSelectedFarmerId(isSelected ? null : f.farmerId)}
                className={cn(
                  "p-3 rounded-2xl transition-all duration-300 border flex flex-col items-center text-center w-28 shrink-0 shadow-sm relative active:scale-95 cursor-pointer",
                  isSelected
                    ? "bg-emerald-50/90 border-emerald-500 ring-2 ring-emerald-500/20 text-[#2C2B29]"
                    : "bg-white hover:bg-gray-50 border-gray-200 text-[#5C5A54]"
                )}
              >
                {/* Available lot count ribbon */}
                {farmerMarketLots > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-emerald-600 text-white text-[7.5px] font-black px-1.5 py-0.5 rounded-full shadow-md animate-bounce">
                    {farmerMarketLots}
                  </span>
                )}
                
                {f.photoUrl ? (
                  <img 
                    src={f.photoUrl}
                    alt={f.name}
                    className="w-10 h-10 object-cover rounded-full border border-gray-150 mb-2 shrink-0 bg-emerald-50"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full border border-gray-150 bg-gradient-to-br from-emerald-600 to-teal-750 text-white font-extrabold flex items-center justify-center text-center text-[10px] mb-2 shrink-0 shadow-sm leading-none select-none uppercase">
                    {getInitials(f.name)}
                  </div>
                )}
                <span className="text-[10px] font-extrabold truncate w-full leading-none text-emerald-950">{f.name}</span>
                <span className="text-[8px] font-bold text-gray-400 block mt-1 uppercase tracking-wider truncate w-full leading-none">
                  {f.province || 'Moçambique'}
                </span>

                {/* Certification indicator */}
                <div className="mt-1.5">
                  {f.certificationStatus === 'certified' ? (
                    <span className="text-[7px] font-black bg-yellow-105 text-yellow-800 px-1 py-0.5 rounded-md uppercase tracking-wider">GAP Certificado</span>
                  ) : (
                    <span className="text-[7px] font-medium bg-gray-100 text-gray-500 px-1 py-0.5 rounded-md uppercase tracking-wider">Registado</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Live Filtering & Search */}
      <section className="space-y-4" id="live-search-filter-section">
        {/* Categorias Dropdown as single filter */}
        <div className="relative" id="home-category-dropdown">
          <select
            id="category-select-dropdown"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value as any)}
            className="w-full bg-[#FAF8F5] border border-[#E5E2D9] p-3.5 pl-4 pr-10 rounded-2xl text-[11px] font-extrabold uppercase tracking-wide text-emerald-900 outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent transition-all shadow-sm appearance-none cursor-pointer"
          >
            <option value="all">Todas as Categorias de Alimentos</option>
            <option value="vegetal">Vegetais 🥦</option>
            <option value="fruta">Frutas 🍎</option>
            <option value="grão">Grãos 🌾</option>
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3.5 text-emerald-700">
            <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
              <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
            </svg>
          </div>
        </div>

        {/* Real-Time Status Filter Pills */}
        <div className="flex items-center gap-1.5 bg-gray-150/70 p-1 rounded-2xl w-full max-w-sm" id="status-quick-pills">
          {[
            { id: 'all', label: 'Todos os Lotes' },
            { id: 'market', label: 'Disponíveis no Mercado' },
            { id: 'distributing', label: 'Em Trânsito' }
          ].map(pill => {
            const isSelected = selectedStatus === pill.id;
            return (
              <button
                key={pill.id}
                type="button"
                onClick={() => setSelectedStatus(pill.id as any)}
                className={cn(
                  "flex-1 text-center py-2.5 rounded-xl text-[9.5px] font-black uppercase tracking-wider transition-all duration-200 active:scale-95 cursor-pointer",
                  isSelected
                    ? "bg-[#2C2B29] text-white shadow-sm font-black"
                    : "text-gray-500 hover:text-gray-800"
                )}
              >
                {pill.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* Dynamic List Grid of Farmers and Batches */}
      <section className="space-y-4" id="recent-lots-list-section">
        <div className="flex items-center justify-between">
           <h4 className="font-extrabold text-sm text-emerald-950 uppercase tracking-widest leading-none">
             {selectedStatus === 'market' ? 'Lotes no Mercado' : selectedStatus === 'distributing' ? 'Lotes em Trânsito' : 'Lotes Disponíveis'}
           </h4>
           <span className="text-[10px] bg-emerald-50 text-emerald-800 border border-emerald-100 font-bold px-3 py-1 rounded-full uppercase">
             {filteredBatches.length} Encontrados
           </span>
        </div>

        {loading ? (
          <div className="py-12 text-center" id="batches-loader-spinner">
            <div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
            <p className="text-xs text-[#8C8A84] font-medium">Lendo dados das cooperativas...</p>
          </div>
        ) : filteredBatches.length === 0 ? (
          <div className="py-12 text-center bg-gray-50/50 rounded-[2rem] border border-dashed border-[#E5E2D9] px-6" id="empty-batches-placeholder">
            <Leaf className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-xs font-bold text-gray-500">Nenhum lote corresponde à pesquisa</p>
            <p className="text-[11px] text-gray-400 mt-1">Experimente mudar o filtro de categoria/produtor ou redefinir a busca.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" id="batches-cards-grid">
            <AnimatePresence mode="popLayout">
              {filteredBatches.map(b => {
                const farmer = farmers[b.farmerId];
                const fallbackImages = {
                  grão: 'https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?auto=format&fit=crop&q=80&w=600',
                  fruta: 'https://images.unsplash.com/photo-1619546813926-a78fa6372cd2?auto=format&fit=crop&q=80&w=600',
                  vegetal: 'https://images.unsplash.com/photo-1566385101042-1a0104b2d37b?auto=format&fit=crop&q=80&w=600'
                };
                const photoSrc = b.photoUrl || fallbackImages[b.productType || 'vegetal'];

                const statusBadges = {
                  harvested: { text: 'Colhido', class: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
                  distributing: { text: 'Em Trânsito', class: 'bg-indigo-50 text-indigo-700 border-indigo-100' },
                  market: { text: 'Mercado', class: 'bg-amber-50 text-amber-700 border-amber-100' },
                  consumed: { text: 'Consumido', class: 'bg-gray-100 text-gray-700 border-gray-150' }
                };
                const statusInfo = statusBadges[b.status] || { text: b.status, class: 'bg-gray-50 text-gray-600 border-transparent' };

                return (
                  <motion.div
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    onClick={() => onSelectBatch(b)}
                    className="bg-white rounded-3xl border border-[#E5E2D9] hover:border-emerald-600 overflow-hidden shadow-sm transition-all duration-300 hover:shadow-md cursor-pointer flex flex-col group h-full"
                    key={b.batchId}
                    id={`batch-card-${b.batchId}`}
                  >
                    {/* Crop Image View */}
                    <div className="relative h-40 w-full overflow-hidden shrink-0">
                      <img 
                        src={photoSrc} 
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                        alt={b.cropType} 
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute top-3 left-3 flex gap-2">
                        <span className={cn("text-[9px] font-extrabold uppercase tracking-widest px-2.5 py-1 rounded-full border shadow-sm backdrop-blur-sm", statusInfo.class)}>
                          {statusInfo.text}
                        </span>
                      </div>
                      <div className="absolute top-3 right-3">
                        <span className="text-[8px] font-mono font-bold bg-black/50 text-white px-2 py-0.5 rounded-md backdrop-blur-sm uppercase">
                          {b.productType || 'Vegetal'}
                        </span>
                      </div>
                    </div>

                    {/* Meta info and Farmer Details */}
                    <div className="p-4 flex-grow flex flex-col justify-between space-y-3">
                      <div>
                        <p className="text-[10px] text-[#8C8A84] font-mono leading-none mb-1">CÓD: {b.batchId.slice(0, 10).toUpperCase()}...</p>
                        <h5 className="text-lg font-bold text-emerald-950 group-hover:text-emerald-700 transition-colors leading-tight">{b.cropType}</h5>
                        <p className="text-xs text-[#5C5A54] mt-0.5 flex justify-between">
                          <span>Qtd: <strong className="font-semibold text-[#1C1B19]">{b.quantity}</strong></span>
                          <span>Colheita: <strong className="font-semibold text-[#1C1B19]">{formatDate(b.harvestDate)}</strong></span>
                        </p>
                      </div>

                      {/* Farmer Avatar/Name bottom bar */}
                      <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          {farmer?.photoUrl ? (
                            <img 
                              src={farmer.photoUrl} 
                              className="w-7 h-7 rounded-lg object-cover bg-emerald-50 shrink-0 border border-emerald-100" 
                              alt={farmer?.name || 'Cooperativa'} 
                            />
                          ) : (
                            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-600 to-teal-750 text-white font-extrabold flex items-center justify-center text-center text-[10px] shrink-0 border border-emerald-100 uppercase select-none leading-none">
                              {getInitials(farmer?.name || 'Produtor AgroTrace')}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-[8px] font-bold text-[#8C8A84] uppercase tracking-tighter leading-none">Origem</p>
                            <p className="text-[10.5px] font-bold text-emerald-950 truncate max-w-[110px]">{farmer?.name || 'Produtor AgroTrace'}</p>
                          </div>
                        </div>
                        <span className="text-[9px] font-extrabold text-[#7C7A70] group-hover:text-emerald-700 uppercase tracking-widest flex items-center gap-1 shrink-0">
                          Rastrear <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                        </span>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </section>

      {/* Manual Trace Verification Card */}
      <section className="bg-[#FAF8F2] border border-[#E5E2D9] rounded-[2rem] p-5 sm:p-6 space-y-4" id="manual-trace-card">
         <div className="flex items-center gap-3">
           <div className="w-10 h-10 bg-emerald-100/50 rounded-xl flex items-center justify-center shrink-0">
             <QrCode className="w-5 h-5 text-emerald-700" />
           </div>
           <div>
             <h4 className="font-bold text-emerald-950 text-sm leading-tight">Procurar por Código Lote</h4>
             <p className="text-[10px] text-gray-500 font-medium">Não tem câmara? Cole o ID impresso no produto no campo abaixo.</p>
           </div>
         </div>
         
         <form onSubmit={handleManualSearchSubmit} className="flex gap-2">
           <input 
             id="manual-id-home-input"
             type="text"
             className="flex-1 bg-white border border-[#E5E2D9] rounded-xl px-4 py-3 placeholder:text-gray-400 font-mono text-xs focus:ring-1 focus:ring-emerald-600 outline-none uppercase"
             placeholder="Introduzir código de lote (Ex: l3aK...)"
             value={manualBatchId}
             onChange={(e) => setManualBatchId(e.target.value)}
           />
           <button 
             id="manual-id-home-submit-btn"
             type="submit"
             className="bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl px-4 text-xs font-bold uppercase transition-colors whitespace-nowrap"
           >
             Buscar
           </button>
         </form>
      </section>

      <div className="h-12"></div>
    </motion.div>
  );
}

function GlobalMapView({ onSelectBatch }: { onSelectBatch: (b: Batch) => void }) {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [farmers, setFarmers] = useState<Record<string, Farmer>>({});
  const [selectedPreviewBatch, setSelectedPreviewBatch] = useState<Batch | null>(null);

  useEffect(() => {
    // Live batches collection
    const q = collection(db, 'batches');
    const unsubscribe = onSnapshot(q, (snap) => {
      setBatches(snap.docs.map(doc => doc.data() as Batch));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'batches');
    });

    // Live farmers collection
    const qFarmers = collection(db, 'farmers');
    const unsubFarmers = onSnapshot(qFarmers, (snap) => {
      const farmerMap: Record<string, Farmer> = {};
      snap.docs.forEach(doc => {
        const f = doc.data() as Farmer;
        farmerMap[f.farmerId] = f;
      });
      setFarmers(farmerMap);
    }, (error) => {
      console.error("GlobalMapView: Failed to load farmers:", error);
    });

    return () => {
      unsubscribe();
      unsubFarmers();
    };
  }, []);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6" id="map-explore-view">
      {!navigator.onLine && (
        <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex items-center gap-3 text-amber-800" id="offline-map-banner">
          <AlertCircle className="w-5 h-5 animate-pulse" />
          <p className="text-xs font-medium">Você está visualizando dados offline. Algumas localizações podem estar desatualizadas.</p>
        </div>
      )}

      {/* Title Header area */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4" id="map-header">
        <div>
          <h2 className="text-3xl font-extrabold text-emerald-950 tracking-tight">Explorar Origens</h2>
          <p className="text-[#5C5A54] text-xs font-semibold uppercase tracking-wider mt-1">Conheça de onde floresce o seu alimento no campo</p>
        </div>
        
        {/* Indicators map legend */}
        <div className="bg-white px-4 py-3 rounded-2xl border border-[#E5E2D9] flex flex-wrap gap-x-4 gap-y-2 shadow-sm self-start md:self-auto" id="map-markers-legend">
           <div className="flex items-center gap-2">
             <div className="w-2.5 h-2.5 rounded-full bg-emerald-600"></div>
             <span className="text-[10px] font-bold text-[#5C5A54] uppercase tracking-wider">Vegetais</span>
           </div>
           <div className="flex items-center gap-2">
             <div className="w-2.5 h-2.5 rounded-full bg-amber-500"></div>
             <span className="text-[10px] font-bold text-[#5C5A54] uppercase tracking-wider">Frutas</span>
           </div>
           <div className="flex items-center gap-2">
             <div className="w-2.5 h-2.5 rounded-full bg-yellow-600"></div>
             <span className="text-[10px] font-bold text-[#5C5A54] uppercase tracking-wider">Grãos</span>
           </div>
        </div>
      </div>

      {/* Map wrapping area */}
      <div className="relative" id="interactive-map-wrapper">
        <div className="h-[400px] sm:h-[480px] md:h-[550px] w-full rounded-[2.5rem] overflow-hidden border border-[#E5E2D9] relative shadow-lg z-0">
          <MapContainer 
            center={batches.length > 0 && batches[0].location?.lat ? [batches[0].location.lat, batches[0].location.lng] : [-19.116, 33.483]} 
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
                icon={getMarkerIcon(batch.productType || 'vegetal')}
                eventHandlers={{
                  click: () => {
                    setSelectedPreviewBatch(batch);
                  },
                }}
              >
                <Popup>
                  <div className="font-bold text-emerald-950 text-sm">{batch.cropType}</div>
                  <div className="text-xs text-gray-500 mt-1">Lote: {batch.quantity}</div>
                  <div className="text-[9px] text-[#8C8A84] tracking-tighter uppercase font-medium mt-1">Clique para ver o rastro abaixo</div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>

        {/* Floating preview card overlay - Native look feel */}
        <AnimatePresence>
          {selectedPreviewBatch && (
            <motion.div 
              initial={{ y: 80, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 80, opacity: 0 }}
              className="absolute bottom-4 left-4 right-4 bg-white/95 backdrop-blur-md p-4 rounded-3xl shadow-2xl border border-[#E5E2D9] z-[1000] flex flex-col xs:flex-row gap-4 items-center justify-between"
              id={`map-float-card-${selectedPreviewBatch.batchId}`}
            >
              <div className="flex items-center gap-3 w-full xs:w-auto">
                <div className="w-14 h-14 rounded-2xl overflow-hidden shrink-0 border border-gray-100 shadow-sm">
                  <img 
                    src={selectedPreviewBatch.photoUrl || (selectedPreviewBatch.productType === 'grão' ? 'https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?auto=format&fit=crop&q=80&w=200' : selectedPreviewBatch.productType === 'fruta' ? 'https://images.unsplash.com/photo-1619546813926-a78fa6372cd2?auto=format&fit=crop&q=80&w=200' : 'https://images.unsplash.com/photo-1566385101042-1a0104b2d37b?auto=format&fit=crop&q=80&w=200')} 
                    className="w-full h-full object-cover" 
                    alt={selectedPreviewBatch.cropType} 
                    referrerPolicy="no-referrer"
                  />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[8px] font-black uppercase tracking-widest bg-emerald-50 text-emerald-800 border border-emerald-100 px-1.5 py-0.5 rounded">
                      {selectedPreviewBatch.status === 'harvested' ? 'Colhido' : 'Em Trânsito'}
                    </span>
                    <span className="text-[9px] font-mono text-gray-400">ID: {selectedPreviewBatch.batchId.slice(0, 10).toUpperCase()}...</span>
                  </div>
                  <h4 className="text-base font-bold text-emerald-950 truncate leading-snug">{selectedPreviewBatch.cropType}</h4>
                  <p className="text-[10px] text-gray-500 font-bold leading-tight uppercase tracking-wider mt-0.5">
                    Origem: <span className="text-[#3C3A34]">{farmers[selectedPreviewBatch.farmerId]?.name || 'Produtor AgroTrace'}</span>
                  </p>
                </div>
              </div>

              {/* Action buttons on the right */}
              <div className="flex items-center gap-2 w-full xs:w-auto justify-end shrink-0 pt-2 xs:pt-0">
                <button
                  id="map-preview-trace-btn"
                  onClick={() => onSelectBatch(selectedPreviewBatch)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] uppercase tracking-wider px-4 py-3 rounded-xl shadow-md flex items-center gap-1 transition-all active:scale-95"
                >
                  Rastrear Lote <ArrowRight className="w-3.5 h-3.5" />
                </button>
                <button 
                  id="map-preview-close-btn"
                  onClick={() => setSelectedPreviewBatch(null)}
                  className="p-3 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl text-gray-400 hover:text-red-500 transition-colors"
                  title="Fechar"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function ScanView({ onResult }: { onResult: (batch: Batch) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [manualId, setManualId] = useState('');
  const [cachedList, setCachedList] = useState<Batch[]>([]);

  // Fetch standard list of cached batches on mount
  useEffect(() => {
    try {
      const cached = JSON.parse(localStorage.getItem('agrotrace_cached_batches') || '{}');
      setCachedList(Object.values(cached));
    } catch (e) {
      console.error('Error listing offline cached batches:', e);
    }
  }, []);

  const fetchBatch = async (batchId: string) => {
    try {
      const docRef = doc(db, 'batches', batchId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const b = snap.data() as Batch;
        onResult(b);
        // Add to cache
        try {
          const cached = JSON.parse(localStorage.getItem('agrotrace_cached_batches') || '{}');
          cached[batchId] = b;
          localStorage.setItem('agrotrace_cached_batches', JSON.stringify(cached));
          setCachedList(Object.values(cached));
        } catch (e) {
          console.error(e);
        }
        showToast('Lote localizado com sucesso de forma online!', 'success');
      } else {
        // Look up in cache even if snap doesn't exist (offline fallback list)
        const cached = JSON.parse(localStorage.getItem('agrotrace_cached_batches') || '{}');
        if (cached[batchId]) {
          onResult(cached[batchId]);
          showToast('Lote recuperado do cache offline local!', 'success');
        } else {
          setError("Lote não encontrado no sistema AgroTrace. Por favor, verifique o código ou a sua ligação.");
        }
      }
    } catch (err) {
      // Offline fallback: check cache if network error
      try {
        const cached = JSON.parse(localStorage.getItem('agrotrace_cached_batches') || '{}');
        if (cached[batchId]) {
          onResult(cached[batchId]);
          showToast('Modo Offline: Lote recuperado do cache local!', 'success');
          return;
        }
      } catch (e) {
        console.error(e);
      }
      setError("Sem conexão ao servidor AgroTrace. Não foi possível localizar este lote localmente.");
    }
  };

  const handleManualSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualId.trim()) return;
    setError(null);
    fetchBatch(manualId.trim().toUpperCase());
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
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="max-w-xl mx-auto space-y-8"
      id="trace-scanner-container"
    >
      <div className="bg-white p-6 sm:p-12 rounded-[2.5rem] sm:rounded-[3rem] border border-[#E5E2D9] shadow-2xl text-center space-y-6 sm:space-y-8">
        <div className="w-16 h-16 sm:w-20 sm:h-20 bg-emerald-100/60 rounded-full flex items-center justify-center mx-auto scale-110 sm:scale-125 mb-4">
          <QrCode className="w-8 h-8 sm:w-10 sm:h-10 text-emerald-700 animate-pulse" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-emerald-950 tracking-tight leading-none">Rastreio Inteligente</h2>
          <p className="text-xs sm:text-sm text-gray-500 leading-relaxed max-w-sm mx-auto">Aponte a sua câmara para o código QR do lote ou digite o código do produto correspondente abaixo.</p>
        </div>
        
        <div id="reader" className="aspect-square bg-gray-50 rounded-3xl overflow-hidden border-2 border-dashed border-gray-200 relative shadow-inner">
          {/* Scanner renders here */}
        </div>

        {/* Divider separator */}
        <div className="relative flex py-2 items-center" id="scan-view-divider">
            <div className="flex-grow border-t border-[#E5E2D9]"></div>
            <span className="flex-shrink mx-4 text-[9px] font-extrabold text-[#9C9A94] uppercase tracking-wider">Ou digite manualmente</span>
            <div className="flex-grow border-t border-[#E5E2D9]"></div>
        </div>

        {/* Manual search form */}
        <form onSubmit={handleManualSearch} className="space-y-3" id="manual-scan-form">
          <input 
            id="scanner-manual-input"
            className="w-full bg-gray-50 border border-[#E5E2D9] rounded-2xl p-4 focus:ring-2 focus:ring-emerald-600 focus:outline-none focus:border-transparent text-center font-mono text-xs uppercase tracking-wider text-[#2C2B29] transition-all" 
            placeholder="Ex: GR-981-CH (Código do lote)"
            value={manualId}
            onChange={e => setManualId(e.target.value)}
          />
          <button
            id="scanner-manual-btn"
            type="submit"
            className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-bold py-4 rounded-2xl transition-all shadow-md flex items-center justify-center gap-2 uppercase tracking-widest text-[10px]"
          >
            <Search className="w-4 h-4" /> Rastrear por ID Lote
          </button>
        </form>

        {error && (
          <div className="flex items-center gap-2.5 p-4 bg-red-50 text-red-700 rounded-2xl border border-red-100 text-left" id="scanner-error-message">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <p className="text-xs font-bold leading-snug">{error}</p>
          </div>
        )}

        {/* Cached Batches Section for Offline capability */}
        {cachedList.length > 0 && (
          <div className="pt-6 border-t border-[#E5E2D9] text-left" id="cached-batches-offline-list">
            <h4 className="text-[10px] font-extrabold text-[#7C7A74] uppercase tracking-widest mb-4 flex items-center justify-between">
              <span>Lotes Disponíveis Offline ({cachedList.length})</span>
              <span className="bg-amber-100 text-amber-800 text-[8px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-wide">Cache Ativo</span>
            </h4>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {cachedList.map((cb) => (
                <button
                  type="button"
                  key={cb.batchId}
                  onClick={() => onResult(cb)}
                  className="w-full bg-gray-50 hover:bg-emerald-50/45 border border-gray-150 hover:border-emerald-200 px-3 py-2.5 rounded-2xl transition-all flex items-center justify-between text-left group active:scale-[0.99] cursor-pointer"
                >
                  <div className="min-w-0 flex-1 pr-2">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-xs text-[#2C2B29] group-hover:text-emerald-850">{cb.cropType}</span>
                      <span className="font-mono text-[9px] text-gray-400">({cb.batchId})</span>
                    </div>
                    <p className="text-[10px] text-gray-500 mt-0.5">Colheita: {formatDate(cb.harvestDate)} • Qtd: {cb.quantity}</p>
                  </div>
                  <ChevronLeft className="w-4 h-4 text-gray-400 group-hover:text-emerald-600 rotate-180 transition-transform duration-200 group-hover:translate-x-1 shrink-0" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

function MapResizeTrigger() {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize();
    const timer1 = setTimeout(() => {
      map.invalidateSize();
    }, 150);
    const timer2 = setTimeout(() => {
      map.invalidateSize();
    }, 500);
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, [map]);
  return null;
}

function TraceView({ scannedBatch, forceSingleColumn = false }: { scannedBatch: Batch | null, forceSingleColumn?: boolean }) {
  const [farmer, setFarmer] = useState<Farmer | null>(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [simulatedOffline, setSimulatedOffline] = useState(false);

  // Active offline state triggers if physical connection is lost or user forces simulated offline mode
  const activeOffline = isOffline || simulatedOffline;

  // Sync actual online/offline status
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Guarantee that whatever scannedBatch is parsed, we automatically cache it on local storage
  useEffect(() => {
    if (scannedBatch) {
      try {
        const cachedBatches = JSON.parse(localStorage.getItem('agrotrace_cached_batches') || '{}');
        cachedBatches[scannedBatch.batchId] = scannedBatch;
        localStorage.setItem('agrotrace_cached_batches', JSON.stringify(cachedBatches));
      } catch (e) {
        console.error('Error saving batch copy to device cache:', e);
      }
    }
  }, [scannedBatch]);

  // Register that the logged-in user viewed batches from this farmer
  useEffect(() => {
    if (scannedBatch && auth.currentUser) {
      const curUser = auth.currentUser;
      const viewId = `${curUser.uid}_${scannedBatch.farmerId}`;
      const viewRef = doc(db, 'farmer_views', viewId);
      setDoc(viewRef, {
        viewId,
        userId: curUser.uid,
        farmerId: scannedBatch.farmerId,
        userDisplayName: curUser.displayName || curUser.email || 'Consumidor',
        viewedAt: new Date().toISOString()
      }, { merge: true }).catch(err => {
        console.error('Error logging farmer view:', err);
      });
    }
  }, [scannedBatch]);

  // Handle Loading/fetching of farmer dataset, integrated with offline fallback from local cache
  useEffect(() => {
    if (scannedBatch) {
      // Step A: Instant check for local storage cached farmer
      try {
        const cachedFarmers = JSON.parse(localStorage.getItem('agrotrace_cached_farmers') || '{}');
        if (cachedFarmers[scannedBatch.farmerId]) {
          setFarmer(cachedFarmers[scannedBatch.farmerId]);
        }
      } catch (e) {
        console.error('Error listing offline cached farmers:', e);
      }

      // Step B: Regular reactive snapshot mapping
      const unsubscribe = onSnapshot(doc(db, 'farmers', scannedBatch.farmerId), (docSnap) => {
        if (docSnap.exists()) {
          const fData = docSnap.data() as Farmer;
          setFarmer(fData);
          // Cache the loaded data
          try {
            const cachedFarmers = JSON.parse(localStorage.getItem('agrotrace_cached_farmers') || '{}');
            cachedFarmers[scannedBatch.farmerId] = fData;
            localStorage.setItem('agrotrace_cached_farmers', JSON.stringify(cachedFarmers));
          } catch (e) {
            console.error(e);
          }
        }
      }, (error) => {
        console.warn('Network offline or denied snapshot read fallback to localStorage:', error);
        // Step C: If snapshots fails because of connection status, use Cache again
        try {
          const cachedFarmers = JSON.parse(localStorage.getItem('agrotrace_cached_farmers') || '{}');
          if (cachedFarmers[scannedBatch.farmerId]) {
            setFarmer(cachedFarmers[scannedBatch.farmerId]);
          }
        } catch (e) {
          console.error(e);
        }
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
      className={cn(
        "grid gap-6", 
        forceSingleColumn ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-3 lg:gap-8"
      )}
    >
      {/* Offline Status Indicator Bar */}
      <div className={cn(
        "col-span-1 flex flex-col sm:flex-row justify-between items-center gap-4 p-5 rounded-3xl border shadow-sm transition-all duration-300",
        forceSingleColumn ? "" : "lg:col-span-3",
        activeOffline 
          ? "bg-amber-50/70 border-amber-200/60" 
          : "bg-emerald-50/40 border-emerald-100/50"
      )}>
        <div className="flex items-center gap-3.5 text-left w-full sm:w-auto">
          <div className={cn(
            "p-3 rounded-2xl flex items-center justify-center shrink-0 border shadow-inner",
            activeOffline 
              ? "bg-amber-100 border-amber-200 text-amber-700 font-bold" 
              : "bg-emerald-100 border-emerald-200 text-emerald-700 font-bold"
          )}>
            {activeOffline ? <WifiOff className="w-5 h-5 animate-pulse" /> : <Wifi className="w-5 h-5 text-emerald-600" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h5 className="font-extrabold text-[#2C2B29] text-sm uppercase tracking-wide leading-none">
                {activeOffline ? "Acesso Completamente Offline" : "Sincronização em Tempo Real"}
              </h5>
              <span className={cn(
                "w-2.5 h-2.5 rounded-full inline-block",
                activeOffline ? "bg-amber-500 animate-ping" : "bg-emerald-500"
              )} />
            </div>
            <p className="text-xs text-gray-500 mt-1 leading-normal max-w-2xl">
              {activeOffline 
                ? "Dispositivo offline. Exibindo informações detalhadas e históricos de movimentação do produto a partir dos dados guardados localmente." 
                : "A sua ligação com a rede AgroTrace está ativa. Todos os passos da cadeia logística estão sincronizados com segurança."}
            </p>
          </div>
        </div>
        <button
          onClick={() => setSimulatedOffline(!simulatedOffline)}
          className={cn(
            "w-full sm:w-auto px-4.5 py-3 text-[10px] font-black uppercase tracking-widest rounded-2xl transition-all shadow-sm active:scale-95 cursor-pointer flex items-center justify-center gap-2 shrink-0 border-b-2",
            simulatedOffline 
              ? "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-800"
              : "bg-amber-500 hover:bg-amber-600 text-white border-amber-700"
          )}
          title={simulatedOffline ? "Voltar ao estado normal online" : "Testar comportamento offline com cache do dispositivo"}
        >
          {simulatedOffline ? (
            <>
              <Wifi className="w-4 h-4" /> Restaurar Online
            </>
          ) : (
            <>
              <WifiOff className="w-4 h-4" /> Forçar Simulação Offline
            </>
          )}
        </button>
      </div>

      {/* Left: Product Info */}
      <div className={cn("space-y-6", forceSingleColumn ? "" : "lg:col-span-1")}>
        <div className="bg-white p-5 sm:p-8 rounded-3xl border border-[#E5E2D9] shadow-sm space-y-4">
          <div className="flex justify-between items-start">
            <div className="bg-emerald-600 text-white text-[10px] uppercase font-bold tracking-widest px-3 py-1 rounded-full">
              Autêntico Moz
            </div>
            <p className="text-[10px] text-gray-400 font-mono">ID: {scannedBatch.batchId}</p>
          </div>
          {scannedBatch.photoUrl && (
            <div className="w-full h-44 rounded-2xl overflow-hidden border border-gray-100 shadow-sm mt-3 relative">
              <img src={scannedBatch.photoUrl} className="w-full h-full object-cover" alt={scannedBatch.cropType} referrerPolicy="no-referrer" />
            </div>
          )}
          <h2 className="text-2xl sm:text-4xl font-bold text-emerald-900 tracking-tight leading-tight">{scannedBatch.cropType}</h2>
          <div className="pt-2 space-y-2 text-xs sm:text-sm">
            <div className="flex justify-between items-center py-1.5">
              <span className="text-gray-500">Colheita</span>
              <span className="font-semibold">{formatDate(scannedBatch.harvestDate)}</span>
            </div>
            <div className="flex justify-between items-center py-1.5 border-t border-gray-100">
              <span className="text-gray-500">Quantidade</span>
              <span className="font-semibold">{scannedBatch.quantity}</span>
            </div>
            <div className="flex justify-between items-center py-1.5 border-t border-gray-100">
              <span className="text-gray-500">Certificado</span>
              <span className="text-emerald-600 font-bold flex items-center gap-1">
                <ShieldCheck className="w-4 h-4" /> Global GAP
              </span>
            </div>
            {scannedBatch.productType && (
              <div className="flex justify-between items-center py-1.5 border-t border-gray-100">
                <span className="text-gray-500">Tipo de Produto</span>
                <span className="font-semibold capitalize text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-lg text-xs">{scannedBatch.productType}</span>
              </div>
            )}
            {scannedBatch.pesticides && (
              <div className="flex justify-between items-center py-1.5 border-t border-gray-100">
                <span className="text-gray-500">Pesticidas</span>
                <span className="font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-lg text-xs truncate max-w-[150px]" title={scannedBatch.pesticides}>{scannedBatch.pesticides}</span>
              </div>
            )}
          </div>
        </div>

        {farmer && (
          <div className="bg-white p-5 sm:p-8 rounded-3xl border border-[#E5E2D9] shadow-sm space-y-4">
            <div className="flex items-center gap-4">
              {farmer.photoUrl ? (
                <img src={farmer.photoUrl} className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl object-cover bg-emerald-50 shrink-0 border border-emerald-100 shadow-sm" alt={farmer.name} />
              ) : (
                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-750 text-white font-extrabold flex items-center justify-center text-center text-lg shrink-0 border border-emerald-100 shadow-sm uppercase select-none leading-none">
                  {getInitials(farmer.name)}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">Produtor Autorizado</p>
                <h4 className="text-base sm:text-lg font-bold truncate text-emerald-950">{farmer.name}</h4>
                <p className="text-xs text-emerald-600 flex items-center gap-1">
                   <MapPin className="w-3 h-3 shrink-0" /> <span className="truncate">{farmer.province || 'Localização não declarada'}</span>
                </p>
              </div>
            </div>

            {farmer.bio && (
              <div className="pt-3 border-t border-gray-100">
                <p className="text-xs text-gray-600 leading-relaxed italic bg-emerald-50/10 p-3 rounded-xl border border-emerald-100/10">"{farmer.bio}"</p>
              </div>
            )}

            <div className="pt-2 space-y-2 border-t border-gray-100">
               <div className="flex flex-wrap gap-2">
                  <div className={cn(
                    "px-2 py-1 rounded-md text-[9px] sm:text-[10px] font-black uppercase tracking-widest leading-none text-white shadow-sm",
                    (farmer.certificationStatus === 'certified' || !farmer.certificationStatus) ? "bg-emerald-600" :
                    farmer.certificationStatus === 'pending' ? "bg-amber-500" :
                    farmer.certificationStatus === 'expired' ? "bg-red-500" : "bg-gray-500"
                  )}>
                     {(farmer.certificationStatus === 'certified' || !farmer.certificationStatus) ? 'Certificado GAP' :
                      farmer.certificationStatus === 'pending' ? 'Certificação Pendente' :
                      farmer.certificationStatus === 'expired' ? 'Certificado Expirado' : 'Sem Certificado'}
                  </div>
                  
                  {farmer.gapId && (
                    <div className="bg-gray-50 text-gray-650 px-2 py-1 rounded-md text-[9px] sm:text-[10px] font-mono leading-none border border-gray-200">
                      GGN: {farmer.gapId}
                    </div>
                  )}
               </div>

               {farmer.phoneNumber && (
                 <a 
                   href={`tel:${farmer.phoneNumber}`}
                   className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold rounded-xl transition-all text-xs border border-emerald-100"
                 >
                   <Phone className="w-3.5 h-3.5 text-emerald-600" /> Direct Trade: Ligar ao Produtor
                 </a>
               )}
            </div>
          </div>
        )}
      </div>

      {/* Middle/Right: Map & Timeline */}
      <div className={cn("space-y-6", forceSingleColumn ? "" : "lg:col-span-2 sm:space-y-8")}>
        <div className="h-[280px] sm:h-[400px] w-full bg-[#FAF9F5] rounded-[2rem] sm:rounded-[3rem] overflow-hidden border border-[#E5E2D9] relative flex flex-col items-center justify-center z-0 group p-6 text-center">
          {activeOffline ? (
            <div className="space-y-4 max-w-sm">
              <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto border border-amber-100 shadow-sm">
                <MapPin className="w-8 h-8 text-amber-600 animate-bounce" />
              </div>
              <h4 className="text-base font-extrabold text-[#2C2B29] uppercase tracking-wider">Localização Registada</h4>
              <p className="text-xs text-gray-500 leading-relaxed">
                As coordenadas geográficas seguras deste lote foram verificadas e encontram-se salvas no cache do seu dispositivo:
              </p>
              <div className="bg-white px-4 py-2 rounded-xl border border-gray-150 inline-block font-mono text-xs text-[#2C2B29]">
                Lat: {scannedBatch.location.lat.toFixed(6)} • Lng: {scannedBatch.location.lng.toFixed(6)}
              </div>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest leading-none pt-2">
                Mapa Interativo suspenso em modo offline
              </p>
            </div>
          ) : (
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
              <MapResizeTrigger />
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
                    <div className="font-bold text-emerald-900 text-base mb-1">{scannedBatch.cropType}</div>
                    <div className="text-[11px] text-gray-500 flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> {scannedBatch.locationName || 'Moçambique'}
                    </div>
                    <div className="mt-2 pt-2 border-t border-gray-100 text-[9px] font-bold text-emerald-600 uppercase tracking-wider">Origem Certificada</div>
                  </div>
                </Popup>
              </Marker>
            </MapContainer>
          )}

          {/* Simple Compact Legend Overlay (Perfect on Mobile too!) */}
          {!activeOffline && (
            <div className="absolute top-4 left-4 z-10 flex flex-col gap-2 pointer-events-none select-none">
               <div className="bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-xl shadow-md border border-gray-100/50 text-[10px] font-bold leading-none flex items-center gap-2">
                 <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                 <span className="text-emerald-900 uppercase tracking-widest">Origem: {scannedBatch.locationName || 'Moçambique'}</span>
               </div>
            </div>
          )}

          {/* Large legend overlay ONLY on wide layout (not forced single-column) */}
          {!activeOffline && !forceSingleColumn && (
            <div className="absolute bottom-6 right-6 z-10 hidden sm:block">
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
          )}
        </div>

        {/* Small Inline Legend below the map (For Mobile/Container-constrained maps to save visual space on screen) */}
        {forceSingleColumn && (
          <div className="bg-white px-5 py-3.5 rounded-2xl border border-[#E5E2D9] flex items-center justify-around gap-2 text-[10px] font-bold uppercase tracking-widest shadow-sm">
            <div className="flex items-center gap-2">
              <div className="w-3.5 h-3.5 bg-emerald-600 rounded-lg flex items-center justify-center">
                <div className="w-1.5 h-1.5 bg-white rounded-full"></div>
              </div>
              <span className="text-gray-500">Ponto de Cultivo</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3.5 h-3.5 bg-emerald-100 rounded-lg border border-emerald-200"></div>
              <span className="text-gray-500">Raio de Colheita</span>
            </div>
          </div>
        )}

        <div className="bg-white p-5 sm:p-8 rounded-3xl border border-[#E5E2D9] shadow-sm">
          <h3 className="text-lg sm:text-xl font-bold mb-6 flex items-center gap-2">
            <History className="w-5 h-5 text-emerald-600" /> Jornada do Produto
          </h3>
          <div className="space-y-6 relative before:absolute before:left-3 before:top-4 before:bottom-0 before:w-px before:bg-emerald-100">
            {scannedBatch.journey.map((step, idx) => (
              <div key={idx} className="relative pl-8">
                <div className="absolute left-0 top-1 w-6 h-6 bg-emerald-50 rounded-full border-2 border-emerald-600 flex items-center justify-center z-10">
                  <div className="w-2 h-2 bg-emerald-600 rounded-full" />
                </div>
                <div className="flex flex-col sm:flex-row justify-between items-start gap-1">
                  <div className="min-w-0 flex-1">
                    <h5 className="font-bold text-sm sm:text-base text-gray-900 truncate">{step.location}</h5>
                    <p className="text-xs text-gray-500 mt-1 leading-normal">{step.description}</p>
                  </div>
                  <span className="text-[9px] font-mono text-gray-400 bg-gray-50 px-2 py-0.5 rounded border border-gray-100 shrink-0 self-start sm:self-center">
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

function getInitials(name: string) {
  if (!name) return 'U';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase().substring(0, 2);
}

function dataURLtoBlob(dataurl: string) {
  const arr = dataurl.split(',');
  const mimeMatch = arr[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

interface CameraCaptureModalProps {
  onCapture: (base64Image: string) => void;
  onClose: () => void;
  defaultFacingMode?: 'user' | 'environment';
  title?: string;
  subtitle?: string;
}

function CameraCaptureModal({ 
  onCapture, 
  onClose, 
  defaultFacingMode = 'user',
  title = 'Câmara AgroTrace',
  subtitle = 'Fotografe uma foto nítida e profissional.'
}: CameraCaptureModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [errorStatus, setErrorStatus] = useState<string | null>(null);
  const [captured, setCaptured] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>(defaultFacingMode);

  useEffect(() => {
    let activeStream: MediaStream | null = null;
    setErrorStatus(null);

    const initCamera = async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ 
          video: { 
            width: { ideal: 640 },
            height: { ideal: 640 },
            facingMode: facingMode 
          } 
        });
        activeStream = s;
        setStream(s);
        if (videoRef.current) {
          videoRef.current.srcObject = s;
        }
      } catch (err) {
        console.warn("First camera constraint failed, retrying with simple constraints", err);
        try {
          const s = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: facingMode } 
          });
          activeStream = s;
          setStream(s);
          if (videoRef.current) {
            videoRef.current.srcObject = s;
          }
        } catch (err2) {
          console.warn("Second camera constraint failed, trying generic video", err2);
          try {
            const s = await navigator.mediaDevices.getUserMedia({ video: true });
            activeStream = s;
            setStream(s);
            if (videoRef.current) {
              videoRef.current.srcObject = s;
            }
          } catch (err3) {
            console.error("All camera initialization attempts failed", err3);
            setErrorStatus("Não foi possível acessar a câmera do telemóvel. Certifique-se de que forneceu as permissões necessárias no seu navegador.");
          }
        }
      }
    };

    if (!captured) {
      initCamera();
    }

    return () => {
      if (activeStream) {
        activeStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [facingMode, captured]);

  const toggleFacingMode = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
  };

  const takePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const size = Math.min(video.videoWidth, video.videoHeight);
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const startX = (video.videoWidth - size) / 2;
        const startY = (video.videoHeight - size) / 2;
        ctx.drawImage(video, startX, startY, size, size, 0, 0, size, size);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        setCaptured(dataUrl);
        if (stream) {
          stream.getTracks().forEach(track => track.stop());
        }
      }
    }
  };

  const handleConfirm = () => {
    if (captured) {
      onCapture(captured);
    }
  };

  const retakePhoto = () => {
    setCaptured(null);
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
      <div className="bg-[#1C1B19] text-white rounded-[2rem] w-full max-w-md p-6 relative overflow-hidden border border-[#2C2B29] shadow-2xl">
        <button onClick={onClose} className="absolute top-4 right-4 p-2 hover:bg-white/10 rounded-full transition-colors z-10">
          <X className="w-5 h-5 text-gray-400" />
        </button>

        <div className="mb-4 text-center">
          <h3 className="text-lg font-bold">{title}</h3>
          <p className="text-[11px] text-[#8C8A84]">{subtitle}</p>
        </div>

        <div className="relative aspect-square w-full rounded-2xl overflow-hidden bg-black flex items-center justify-center border border-[#2C2B29]">
          {errorStatus ? (
            <div className="p-4 text-center space-y-2">
              <Camera className="w-12 h-12 text-red-500 mx-auto opacity-50" />
              <p className="text-xs text-red-400 font-semibold">{errorStatus}</p>
            </div>
          ) : captured ? (
            <img src={captured} className="w-full h-full object-cover" alt="Captured" />
          ) : (
            <>
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                muted
                className={cn("w-full h-full object-cover", facingMode === 'user' ? "scale-x-[-1]" : "")} 
              />
              <div className="absolute inset-0 border-[24px] border-black/40 pointer-events-none rounded-2xl" />
              <div className="absolute top-4 left-4 flex items-center gap-1.5 bg-black/60 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider backdrop-blur-sm border border-white/5">
                <span className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-ping" />
                <span>Em Direto</span>
              </div>
              
              <button
                type="button"
                onClick={toggleFacingMode}
                className="absolute top-4 right-4 bg-black/60 hover:bg-black/80 text-white p-2 rounded-xl transition-all border border-white/5 active:scale-95 flex items-center gap-1.5 text-xs font-bold z-20"
                title="Inverter Câmara"
              >
                <RefreshCw className="w-4 h-4" />
                <span className="hidden sm:inline">Inverter</span>
              </button>
            </>
          )}
        </div>

        <canvas ref={canvasRef} className="hidden" />

        <div className="mt-5 flex gap-3">
          {captured ? (
            <>
              <button 
                type="button"
                onClick={retakePhoto}
                className="flex-1 py-3 px-4 bg-white/10 hover:bg-white/15 text-white rounded-xl text-xs font-bold transition-all uppercase tracking-wider active:scale-95"
              >
                Tentar De Novo
              </button>
              <button 
                type="button"
                onClick={handleConfirm}
                className="flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all uppercase tracking-wider shadow-lg shadow-emerald-600/20 active:scale-95"
              >
                Guardar Foto
              </button>
            </>
          ) : (
            <>
              <button 
                type="button"
                onClick={onClose}
                className="flex-1 py-3 px-4 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white rounded-xl text-xs font-bold transition-all uppercase tracking-wider active:scale-95"
              >
                Cancelar
              </button>
              <button 
                type="button"
                disabled={!!errorStatus}
                onClick={takePhoto}
                className="flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-800 disabled:text-gray-500 text-white rounded-xl text-xs font-bold transition-all uppercase tracking-wider shadow-lg shadow-emerald-600/20 active:scale-95 flex items-center justify-center gap-1.5"
              >
                <Camera className="w-4 h-4" />
                <span>Capturar</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function PhotoActionModal({ isOpen, onClose, onSelectUpload, onSelectCamera, onRemovePhoto, hasPhoto }: any) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-[2rem] w-full max-w-sm p-6 shadow-2xl relative overflow-hidden text-center border border-gray-100"
      >
        <button onClick={onClose} className="absolute top-4 right-4 p-2 hover:bg-gray-100 rounded-full transition-colors">
          <X className="w-5 h-5 text-gray-400" />
        </button>

        <h3 className="text-lg font-bold text-emerald-950 mb-1">Foto de Perfil</h3>
        <p className="text-xs text-gray-500 mb-5 text-[11px]">Escolha como deseja atualizar a fotografia do seu perfil de produtor.</p>

        <div className="space-y-3">
          <button 
            type="button"
            onClick={() => {
              onSelectUpload();
              onClose();
            }}
            className="w-full py-3.5 px-4 bg-emerald-50 hover:bg-emerald-100 border border-emerald-150 rounded-xl text-xs font-bold text-emerald-800 transition-all uppercase tracking-wider flex items-center justify-center gap-2 active:scale-95 duration-200"
          >
            <Upload className="w-4 h-4 text-emerald-600" />
            <span>Computador ou Telemóvel</span>
          </button>

          <button 
            type="button"
            onClick={() => {
              onSelectCamera();
              onClose();
            }}
            className="w-full py-3.5 px-4 bg-emerald-750 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold transition-all uppercase tracking-wider flex items-center justify-center gap-2 shadow-md shadow-emerald-750/10 active:scale-95 duration-200"
          >
            <Camera className="w-4 h-4 text-white" />
            <span>Câmara Fotográfica</span>
          </button>

          {hasPhoto && (
            <button 
              type="button"
              onClick={() => {
                onRemovePhoto();
                onClose();
              }}
              className="w-full py-3.5 px-4 bg-red-50 hover:bg-red-100 text-red-700 rounded-xl text-xs font-bold transition-all uppercase tracking-wider flex items-center justify-center gap-2 active:scale-95 duration-200"
            >
              <Trash2 className="w-4 h-4 text-red-600" />
              <span>Remover Foto Atual</span>
            </button>
          )}

          <button 
            type="button"
            onClick={onClose}
            className="w-full py-3.5 px-4 bg-gray-50 hover:bg-gray-100 text-gray-400 hover:text-gray-700 rounded-xl text-xs font-bold transition-all uppercase tracking-wider flex items-center justify-center gap-2 active:scale-95 duration-200"
          >
            Fechar
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function FarmerPortal({ user, login, logout }: { user: UserProfile | null, login: () => void, logout: () => void }) {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<Batch | null>(null);
  const [farmerData, setFarmerData] = useState<Farmer | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showPhotoSelector, setShowPhotoSelector] = useState(false);
  const [showCamera, setShowCamera] = useState(false);

  const handleCameraCapture = async (base64Data: string) => {
    if (!user) return;
    setUploading(true);
    setShowCamera(false);
    try {
      const blob = dataURLtoBlob(base64Data);
      const timestamp = new Date().getTime();
      const storageRef = ref(storage, `profile_photos/${user.uid}/${timestamp}_camera.jpg`);
      await uploadBytes(storageRef, blob);
      const photoUrl = await getDownloadURL(storageRef);

      await Promise.all([
        updateDoc(doc(db, 'users', user.uid), { photoUrl }),
        updateDoc(doc(db, 'farmers', user.uid), { photoUrl })
      ]);

      showToast('Foto do perfil capturada com sucesso!', 'success');
    } catch (error) {
      console.error('Error uploading camera capture:', error);
      showToast('Erro ao carregar a foto da câmara.', 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleRemovePhoto = async () => {
    if (!user) return;
    setUploading(true);
    try {
      await Promise.all([
        updateDoc(doc(db, 'users', user.uid), { photoUrl: '' }),
        updateDoc(doc(db, 'farmers', user.uid), { photoUrl: '' })
      ]);
      showToast('Foto de perfil removida!', 'success');
    } catch (error) {
      console.error('Error removing photo:', error);
      showToast('Erro ao remover foto.', 'error');
    } finally {
      setUploading(false);
    }
  };

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
  const [searchQuery, setSearchQuery] = useState('');
  const [showGuide, setShowGuide] = useState(() => {
    return localStorage.getItem('farmer_guide_visible') !== 'false';
  });

  const updateBatchStatus = async (batchId: string, newStatus: string) => {
    try {
      const batch = batches.find(b => b.batchId === batchId);
      const currentJourney = batch && batch.journey ? [...batch.journey] : [];
      let newStepDesc = '';
      const newStepLocation = farmerData?.province || 'Chimoio, MOZ';
      
      if (newStatus === 'distributing') {
        newStepDesc = 'Lote despachado para trânsito/distribuição. Transporte iniciado para os centros logísticos selecionados.';
      } else if (newStatus === 'market') {
        newStepDesc = 'Lote entregue com sucesso e colocado em exposição para os consumidores finais no mercado.';
      } else if (newStatus === 'consumed') {
        newStepDesc = 'Ciclo de vendas e consumo do lote finalizado com sucesso.';
      }
      
      if (newStepDesc) {
        currentJourney.push({
          timestamp: new Date().toISOString(),
          location: newStepLocation,
          description: newStepDesc
        });
      }
      
      const batchRef = doc(db, 'batches', batchId);
      await updateDoc(batchRef, { 
        status: newStatus,
        journey: currentJourney
      });
      showToast('Status do lote atualizado!', 'success');
    } catch (e) {
      console.error('Error updating status:', e);
      showToast('Erro ao atualizar o status.', 'error');
    }
  };

  const filteredBatches = batches.filter(batch => {
    const searchMatch = searchQuery.trim() === '' || 
      batch.cropType.toLowerCase().includes(searchQuery.toLowerCase()) || 
      batch.batchId.toLowerCase().includes(searchQuery.toLowerCase());

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

    return searchMatch && timeMatch && statusMatch;
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
        <div className="absolute top-4 right-4 z-10 flex gap-2">
           <button 
            onClick={() => setShowEditProfile(true)}
            className="p-2.5 bg-[#FAF8F5] border border-[#E5E2D9] rounded-xl text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 hover:border-emerald-250 active:scale-95 transition-all shadow-sm flex items-center justify-center"
            title="Editar Perfil"
           >
             <Edit className="w-4 h-4" />
           </button>
        </div>

        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
           <div 
             onClick={() => !uploading && setShowPhotoSelector(true)}
             className="w-24 h-24 sm:w-28 sm:h-28 bg-emerald-100 rounded-[2.5rem] overflow-hidden border-4 border-white shadow-xl relative cursor-pointer group/avatar shrink-0 transform hover:rotate-2 transition-transform"
           >
              {uploading ? (
                <div className="absolute inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-10">
                  <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <div className="absolute inset-0 bg-black/0 group-hover/avatar:bg-black/20 flex items-center justify-center z-10 transition-colors opacity-0 group-hover/avatar:opacity-100">
                  <Camera className="w-8 h-8 text-white" />
                </div>
              )}
              {farmerData?.photoUrl ? (
                <img 
                  src={farmerData.photoUrl} 
                  className="w-full h-full object-cover animate-none" 
                  alt={farmerData.name || user.displayName || 'Produtor'}
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-emerald-600 to-teal-750 text-white font-extrabold flex items-center justify-center text-center text-3xl uppercase leading-none select-none">
                  {getInitials(farmerData?.name || user.displayName || '')}
                </div>
              )}
           </div>
           <div className="flex-1 text-center sm:text-left space-y-3 pr-10 sm:pr-14">
              <div className="space-y-1">
                 <h3 className="font-bold text-2xl text-emerald-950 tracking-tight">{farmerData?.name || user.displayName}</h3>
                 <div className="flex items-center justify-center sm:justify-start gap-2">
                    <span className={cn(
                      "px-2 py-0.5 text-[8px] font-black uppercase tracking-widest rounded-md text-white shadow-sm",
                      (farmerData?.certificationStatus === 'certified' || !farmerData?.certificationStatus) ? "bg-emerald-600" :
                      farmerData?.certificationStatus === 'pending' ? "bg-amber-500" :
                      farmerData?.certificationStatus === 'expired' ? "bg-red-500" : "bg-gray-500"
                    )}>
                      {(farmerData?.certificationStatus === 'certified' || !farmerData?.certificationStatus) ? 'GAP CERTIFIED' :
                       farmerData?.certificationStatus === 'pending' ? 'GAP PENDENTE' :
                       farmerData?.certificationStatus === 'expired' ? 'GAP EXPIRADO' : 'SEM REGISTO'}
                    </span>
                    <div className="flex items-center gap-1 text-gray-400">
                       <MapPin className="w-3 h-3" />
                       <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tighter">{farmerData?.province || 'Chimoio, MOZ'}</p>
                    </div>
                 </div>
              </div>
              {farmerData?.bio && (
                <div className="bg-emerald-50/50 p-4 rounded-2xl border border-emerald-100/50 relative">
                   <p className="text-xs text-emerald-800 italic leading-relaxed text-left">
                     "{farmerData.bio}"
                   </p>
                </div>
              )}
           </div>
        </div>
      </section>

      {/* Batches Section */}
      <section className="space-y-6">
        <div className="flex flex-col xs:flex-row xs:items-center justify-between gap-4">
           <div className="space-y-0.5 text-left">
             <h4 className="font-black text-emerald-950 text-xl tracking-tight">O Meu Inventário</h4>
             <p className="text-xs text-gray-400">Gerir e monitorizar o estado de distribuição dos seus lotes agrícolas</p>
           </div>
           <button 
            onClick={() => setShowAdd(true)}
            className="px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[11px] uppercase tracking-wider rounded-2xl flex items-center justify-center gap-2 shadow-xl shadow-emerald-600/20 hover:shadow-emerald-600/30 active:scale-95 transition-all text-center shrink-0 border-b-2 border-emerald-800"
            title="Adicionar Novo Lote"
           >
             <Plus className="w-4 h-4" />
             <span>Adicionar Novo Lote</span>
           </button>
        </div>

        {/* Search & Filter Container */}
        <div className="space-y-3.5">
          <div className="relative">
            <Search className="w-5 h-5 text-gray-400 absolute left-4.5 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="Pesquisar por ID do lote (Ex: BATCH)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white border border-[#E5E2D9] rounded-2xl py-4 pl-12 pr-12 text-sm outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent transition-all shadow-sm font-medium"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1.5 rounded-full hover:bg-gray-100 transition-colors"
                title="Limpar pesquisa"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="relative">
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value as any)}
                className="w-full bg-[#FAF8F5] border border-[#E5E2D9] rounded-2xl py-3.5 pl-4 pr-10 text-[11px] font-bold uppercase tracking-wider text-emerald-900 outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent transition-all shadow-sm appearance-none cursor-pointer"
              >
                <option value="all">Todos os Períodos</option>
                <option value="30d">Últimos 30 dias</option>
                <option value="6m">6 Meses</option>
                <option value="1y">1 Ano</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3.5 text-emerald-700">
                <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                  <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                </svg>
              </div>
            </div>

            <div className="relative">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="w-full bg-[#FAF8F5] border border-[#E5E2D9] rounded-2xl py-3.5 pl-4 pr-10 text-[11px] font-bold uppercase tracking-wider text-amber-900 outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all shadow-sm appearance-none cursor-pointer"
              >
                <option value="all">Todos os Status</option>
                <option value="harvested">Colhido</option>
                <option value="distributing">Em Trânsito</option>
                <option value="market">Mercado</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3.5 text-amber-700">
                <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                  <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-3.5 font-sans">
          {filteredBatches.map(b => (
            <div 
              key={b.batchId} 
              onClick={() => setSelectedBatch(b)}
              className="bg-white p-5 rounded-[2rem] border border-[#E5E2D9] hover:border-emerald-300 hover:shadow-md transition-all cursor-pointer group relative overflow-hidden pl-6"
            >
              {/* Barra de estado na borda esquerda */}
              <div className={cn(
                "absolute left-0 top-0 bottom-0 w-2 transition-all group-hover:w-2.5",
                b.status === 'harvested' ? "bg-emerald-500" :
                b.status === 'distributing' ? "bg-amber-500" :
                b.status === 'market' ? "bg-blue-500" : "bg-gray-400"
              )} />

              {/* Conteúdo Principal do Cartão */}
              <div className="flex flex-col gap-3.5 text-left">
                
                {/* Linha de Cabeçalho: Foto + Título + Status Único */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3.5 min-w-0">
                    {b.photoUrl ? (
                      <div className="w-12 h-12 rounded-2xl overflow-hidden border border-gray-150 shrink-0 shadow-sm relative group-hover:scale-105 transition-transform duration-300">
                        <img src={b.photoUrl} className="w-full h-full object-cover" alt={b.cropType} referrerPolicy="no-referrer" />
                      </div>
                    ) : (
                      <div className="w-12 h-12 bg-emerald-50 text-emerald-700 rounded-2xl flex items-center justify-center border border-emerald-100 shrink-0">
                        <Leaf className="w-5.5 h-5.5" />
                      </div>
                    )}
                    
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {b.productType && (
                          <span className={cn(
                            "text-[8.5px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md",
                            b.productType === 'vegetal' ? "bg-emerald-50 text-emerald-700 border border-emerald-100" :
                            b.productType === 'fruta' ? "bg-amber-50 text-amber-700 border border-amber-100" :
                            "bg-orange-50 text-orange-800 border border-orange-100"
                          )}>
                            {b.productType}
                          </span>
                        )}
                        <span className="text-[10px] font-mono text-gray-400 font-bold">
                          ID: {b.batchId}
                        </span>
                      </div>
                      
                      <h4 className="font-extrabold text-[#2C2B29] text-base leading-tight mt-1 truncate group-hover:text-emerald-950 transition-colors">
                        {b.cropType}
                      </h4>
                    </div>
                  </div>

                  {/* Crachá de Estado Compacto e Focado */}
                  <span className={cn(
                    "text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-xl border shadow-sm shrink-0 flex items-center gap-1.5",
                    b.status === 'harvested' ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                    b.status === 'distributing' ? "bg-amber-50 text-amber-700 border-amber-200" :
                    b.status === 'market' ? "bg-blue-50 text-blue-700 border-blue-200" :
                    "bg-gray-50 text-gray-500 border-gray-200"
                  )}>
                    <span className={cn(
                      "w-1.5 h-1.5 rounded-full",
                      b.status === 'harvested' ? "bg-emerald-500 animate-pulse" :
                      b.status === 'distributing' ? "bg-amber-550 animate-pulse" :
                      b.status === 'market' ? "bg-blue-500 animate-pulse" : "bg-gray-450"
                    )} />
                    <span>
                      {b.status === 'harvested' ? 'Colhido' :
                       b.status === 'distributing' ? 'Em Trânsito' :
                       b.status === 'market' ? 'No Mercado' : 'Concluído'}
                    </span>
                  </span>
                </div>

                {/* Secção de Estatísticas em Grelha Limpa */}
                <div className="grid grid-cols-2 gap-4 py-3 border-t border-b border-gray-100 my-0.5">
                  <div>
                    <span className="block text-[9px] font-extrabold text-gray-400 uppercase tracking-widest">Quantidade</span>
                    <span className="text-sm font-black text-emerald-950 block mt-0.5">
                      {b.quantity}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[9px] font-extrabold text-gray-400 uppercase tracking-widest">Colheita</span>
                    <span className="text-xs font-bold text-gray-600 block mt-1">
                      {formatDate(b.harvestDate)}
                    </span>
                  </div>
                </div>

                {/* Linha debaixo: Atalho QR + Botões de Ação */}
                <div className="flex items-center justify-between gap-3">
                  
                  {/* Digitalização de Lote */}
                  <div className="flex items-center gap-2">
                    <div className="bg-gray-50 p-1.5 rounded-xl border border-gray-100 shrink-0 group-hover:bg-emerald-50/40 transition-colors">
                      <QRCodeSVG value={b.batchId} size={32} level="H" />
                    </div>
                    <span className="text-[9px] font-mono text-gray-400 leading-tight hidden xs:block">
                      Rastreio<br />Garantido
                    </span>
                  </div>

                  {/* Botões do Lote */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedBatch(b);
                      }}
                      className="px-3.5 py-2 bg-gray-50 hover:bg-emerald-50 text-[#3C3A34] hover:text-emerald-700 font-extrabold text-[10px] uppercase tracking-wider rounded-xl transition-all border border-gray-150 hover:border-emerald-250 flex items-center gap-1.5 shadow-sm"
                      title="Gerir lote e ver histórico"
                    >
                      <Edit className="w-3.5 h-3.5" />
                      <span>Gerir</span>
                    </button>

                    {b.status === 'harvested' && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          updateBatchStatus(b.batchId, 'distributing');
                        }}
                        className="px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-[10px] uppercase tracking-wider rounded-xl flex items-center gap-1.5 shadow-md hover:shadow-lg hover:shadow-amber-500/15 active:scale-95 transition-all text-center border-b-2 border-amber-700"
                        title="Despachar lote para distribuição"
                      >
                        <span>Despachar</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {b.status === 'distributing' && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          updateBatchStatus(b.batchId, 'market');
                        }}
                        className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-[10px] uppercase tracking-wider rounded-xl flex items-center gap-1.5 shadow-md hover:shadow-lg hover:shadow-blue-600/15 active:scale-95 transition-all text-center border-b-2 border-blue-800"
                        title="Entregar lote ao mercado de destino"
                      >
                        <span>Entregar</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {b.status === 'market' && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          updateBatchStatus(b.batchId, 'consumed');
                        }}
                        className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[10px] uppercase tracking-wider rounded-xl flex items-center gap-1.5 shadow-md hover:shadow-lg hover:shadow-emerald-600/15 active:scale-95 transition-all text-center border-b-2 border-emerald-800"
                        title="Concluir vendas deste lote"
                      >
                        <span>Concluir</span>
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                </div>

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
          onDeleteAccount={() => {
            setShowEditProfile(false);
            logout();
          }}
        />
      )}
      {selectedBatch && (
        <BatchHistoryModal 
          batch={batches.find(b => b.batchId === selectedBatch.batchId) || selectedBatch} 
          onClose={() => setSelectedBatch(null)} 
          
        />
      )}
      {showPhotoSelector && (
        <PhotoActionModal 
          isOpen={showPhotoSelector}
          onClose={() => setShowPhotoSelector(false)}
          onSelectUpload={() => fileInputRef.current?.click()}
          onSelectCamera={() => setShowCamera(true)}
          onRemovePhoto={handleRemovePhoto}
          hasPhoto={!!farmerData?.photoUrl}
        />
      )}
      {showCamera && (
        <CameraCaptureModal 
          onCapture={handleCameraCapture}
          onClose={() => setShowCamera(false)}
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
  const [showPassword, setShowPassword] = useState(false);
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
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1 mb-1 block">
              {lang === 'pt' ? "E-mail ou Telemóvel" : "Email or Phone"}
            </label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input 
                type="text" 
                required
                placeholder={lang === 'pt' ? "exemplo@agrotrace.com ou 84 123 4567" : "example@agrotrace.com or 84 123 4567"}
                className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-4 pl-12 pr-4 focus:ring-2 focus:ring-emerald-600 outline-none transition-all text-sm font-medium"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </div>
            {email && !email.includes('@') && (
              <div className="mt-2 flex items-center gap-2 pl-1 animate-fade-in">
                <span className={cn("px-2.5 py-0.5 text-[8px] font-black uppercase rounded-md tracking-wider shadow-sm", parseAndValidatePhone(email).color)}>
                  {parseAndValidatePhone(email).label}
                </span>
                {parseAndValidatePhone(email).isValid ? (
                  <span className="text-[9px] text-emerald-600 font-bold uppercase tracking-tight">✓ Pronto para entrar</span>
                ) : (
                  <span className="text-[9px] text-amber-600 font-bold uppercase tracking-tight">Incompleto</span>
                )}
              </div>
            )}
          </div>
          <div className="relative text-left">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1 mb-1 block">{lang === 'pt' ? "Senha" : "Password"}</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input 
                type={showPassword ? "text" : "password"} 
                required
                placeholder="••••••••"
                className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-4 pl-12 pr-12 focus:ring-2 focus:ring-emerald-600 outline-none transition-all text-sm"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 transition-colors focus:outline-none"
                title={showPassword ? (lang === 'pt' ? "Ocultar senha" : "Hide password") : (lang === 'pt' ? "Mostrar senha" : "Show password")}
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
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
  const [coords, setCoords] = useState<{ lat: number, lng: number } | null>(null);
  const [noEmail, setNoEmail] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showRegPassword, setShowRegPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || (!noEmail && !formData.email) || !formData.password || !formData.phone) {
      showToast(lang === 'pt' ? 'Por favor, preencha todos os campos obrigatórios.' : 'Please fill all required fields.', 'info');
      return;
    }

    const phoneValidation = parseAndValidatePhone(formData.phone);
    if (!phoneValidation.isValid) {
      showToast(
        lang === 'pt' 
          ? 'Por favor, introduza um número de telemóvel válido.' 
          : 'Please enter a valid phone number.', 
        'error'
      );
      return;
    }
    
    setLoading(true);
    try {
      await onRegister({
        ...formData,
        coords,
        noEmail
      });
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
      async (position) => {
        const { latitude, longitude } = position.coords;
        setCoords({ lat: latitude, lng: longitude });
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=12&addressdetails=1`, {
            headers: { 'Accept-Language': 'pt' }
          });
          if (res.ok) {
            const data = await res.json();
            const address = data.address || {};
            const cityOrTown = address.city || address.town || address.village || address.municipality || address.suburb || address.city_district || '';
            const stateOrProvince = address.state || address.region || address.county || '';
            let placeName = '';
            if (cityOrTown && stateOrProvince) {
              placeName = `${cityOrTown}, ${stateOrProvince}`;
            } else if (stateOrProvince) {
              placeName = stateOrProvince;
            } else {
              placeName = data.display_name?.split(',').slice(0, 2).join(',') || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
            }
            setFormData(prev => ({ ...prev, location: placeName }));
            showToast(lang === 'pt' ? `Localização detetada: ${placeName}` : `Location detected: ${placeName}`, 'success');
          } else {
            setFormData(prev => ({ ...prev, location: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}` }));
          }
        } catch (err) {
          console.error('Error reverse geocoding:', err);
          setFormData(prev => ({ ...prev, location: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}` }));
        } finally {
          setDetecting(false);
        }
      },
      (error) => {
        console.error('Error detecting location:', error);
        showToast(lang === 'pt' ? 'Não foi possível detectar a sua localização atual.' : 'Could not detect your location.', 'error');
        setDetecting(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const phoneInfo = parseAndValidatePhone(formData.phone);

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

          <div className="flex items-center gap-2 pl-1 py-1">
            <input 
              type="checkbox"
              id="no-email-checkbox"
              className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-650 border-gray-300 transition-all cursor-pointer"
              checked={noEmail}
              onChange={e => {
                setNoEmail(e.target.checked);
                if (e.target.checked) {
                  setFormData(prev => ({ ...prev, email: '' }));
                }
              }}
            />
            <label htmlFor="no-email-checkbox" className="text-xs font-bold text-gray-500 cursor-pointer select-none">
              {lang === 'pt' ? "Não tenho endereço de e-mail" : "I do not have an email address"}
            </label>
          </div>

          {!noEmail ? (
            <div className="relative text-left">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1 mb-1 block">
                {lang === 'pt' ? "Email" : "Email"} *
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input 
                  type="email" 
                  required={!noEmail}
                  placeholder="exemplo@agrotrace.com"
                  className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-3 pl-12 pr-4 focus:ring-2 focus:ring-emerald-600 outline-none transition-all text-sm font-medium"
                  value={formData.email}
                  onChange={e => setFormData({...formData, email: e.target.value})}
                />
              </div>
            </div>
          ) : (
            <div className="bg-emerald-50/50 border border-emerald-100 p-3.5 rounded-2xl text-left text-xs space-y-1 animate-fade-in">
              <div className="font-black flex items-center gap-1.5 text-emerald-900 uppercase tracking-wide text-[10px]">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                {lang === 'pt' ? "REGISTO SEM E-MAIL ATIVADO" : "E-MAIL FREE SIGN UP ENABLED"}
              </div>
              <p className="text-emerald-700/80 font-medium leading-relaxed">
                {lang === 'pt' 
                  ? "Sua conta será vinculada diretamente ao seu telemóvel. Use o número para fazer login futuramente." 
                  : "Your account will be securely linked to your mobile phone number. Use it to log in in the future."}
              </p>
            </div>
          )}

          <div className="relative text-left">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1 mb-1 block">
              {lang === 'pt' ? "Telemóvel" : "Phone"} *
            </label>
            <div className="relative">
              <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input 
                type="tel" 
                required
                placeholder={lang === 'pt' ? "e.g. 84 123 4567" : "e.g. 84 123 4567"}
                className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-3 pl-12 pr-4 focus:ring-2 focus:ring-emerald-600 outline-none transition-all text-sm font-medium"
                value={formData.phone}
                onChange={e => setFormData({...formData, phone: e.target.value})}
              />
            </div>
            {formData.phone && (
              <div className="mt-2 flex items-center gap-2 pl-1 animate-fade-in">
                <span className={cn("px-2.5 py-0.5 text-[8px] font-black uppercase rounded-md tracking-wider shadow-sm", phoneInfo.color)}>
                  {phoneInfo.label}
                </span>
                {phoneInfo.isValid ? (
                  <span className="text-[9px] text-emerald-600 font-bold uppercase tracking-tight">✓ Número Válido</span>
                ) : (
                  <span className="text-[9px] text-amber-600 font-bold uppercase tracking-tight">Formato incompleto</span>
                )}
              </div>
            )}
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
                type={showRegPassword ? "text" : "password"} 
                required
                placeholder="••••••••"
                className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-3 pl-12 pr-12 focus:ring-2 focus:ring-emerald-600 outline-none transition-all text-sm font-medium"
                value={formData.password}
                onChange={e => setFormData({...formData, password: e.target.value})}
              />
              <button
                type="button"
                onClick={() => setShowRegPassword(!showRegPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 transition-colors focus:outline-none"
                title={showRegPassword ? (lang === 'pt' ? "Ocultar senha" : "Hide password") : (lang === 'pt' ? "Mostrar senha" : "Show password")}
              >
                {showRegPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
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

function EditProfileModal({ farmer, userId, onClose, onSave, onDeleteAccount }: any) {
  const [photoUrl, setPhotoUrl] = useState(farmer?.photoUrl || '');
  const [name, setName] = useState(farmer?.name || '');
  const [bio, setBio] = useState(farmer?.bio || '');
  const [province, setProvince] = useState(farmer?.province || '');
  const [coords, setCoords] = useState<{ lat: number, lng: number } | null>(farmer?.location || null);
  const [detectingLoc, setDetectingLoc] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState(farmer?.phoneNumber || '');
  const [gapId, setGapId] = useState(farmer?.gapId || '');
  const [certificationStatus, setCertificationStatus] = useState(farmer?.certificationStatus || 'certified');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showPhotoSelector, setShowPhotoSelector] = useState(false);
  const [showCamera, setShowCamera] = useState(false);

  const detectProfileLocation = () => {
    if (!navigator.geolocation) {
      showToast('Geolocalização não suportada no seu dispositivo.', 'info');
      return;
    }

    setDetectingLoc(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        setCoords({ lat: latitude, lng: longitude });
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=12&addressdetails=1`, {
            headers: { 'Accept-Language': 'pt' }
          });
          if (res.ok) {
            const data = await res.json();
            const address = data.address || {};
            const cityOrTown = address.city || address.town || address.village || address.municipality || address.suburb || address.city_district || '';
            const stateOrProvince = address.state || address.region || address.county || '';
            let placeName = '';
            if (cityOrTown && stateOrProvince) {
              placeName = `${cityOrTown}, ${stateOrProvince}`;
            } else if (stateOrProvince) {
              placeName = stateOrProvince;
            } else {
              placeName = data.display_name?.split(',').slice(0, 2).join(',') || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
            }
            setProvince(placeName);
            showToast(`Localização detetada: ${placeName}`, 'success');
          } else {
            setProvince(`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
          }
        } catch (err) {
          console.error("Reverse geocoding failed", err);
          setProvince(`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
        } finally {
          setDetectingLoc(false);
        }
      },
      (error) => {
        console.error('Error detecting location:', error);
        showToast('Não foi possível obter a sua localização atual do telemóvel.', 'error');
        setDetectingLoc(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleCameraCapture = async (base64Data: string) => {
    setUploading(true);
    setShowCamera(false);
    try {
      const blob = dataURLtoBlob(base64Data);
      const timestamp = new Date().getTime();
      const storageRef = ref(storage, `profiles/${userId}/${timestamp}_camera.jpg`);
      const snapshot = await uploadBytes(storageRef, blob);
      const url = await getDownloadURL(snapshot.ref);
      setPhotoUrl(url);
      showToast('Foto da câmara capturada!', 'success');
    } catch (error) {
      console.error('Error uploading camera capture:', error);
      showToast('Erro ao carregar a foto da câmara.', 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleRemovePhoto = () => {
    setPhotoUrl('');
    showToast('Foto removida no editor.', 'info');
  };

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  const handleDeleteAccount = async () => {
    setDeletingAccount(true);
    try {
      // 1. Fetch and delete batches associated with this farmer
      const q = query(collection(db, 'batches'), where('farmerId', '==', userId));
      const batchSnap = await getDocs(q);
      const deletePromises = batchSnap.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(deletePromises);

      // 2. Delete farmer and user profile documentation
      await Promise.all([
        deleteDoc(doc(db, 'farmers', userId)),
        deleteDoc(doc(db, 'users', userId))
      ]);

      // 3. Try deleting user account in Firebase Auth
      const currentUser = auth.currentUser;
      if (currentUser) {
        try {
          await deleteUser(currentUser);
        } catch (authErr) {
          console.warn('Authentication user deletion postponed or requiring reauth:', authErr);
        }
      }

      showToast('O seu perfil de produtor foi permanentemente removido com sucesso.', 'success');
      onDeleteAccount();
    } catch (err) {
      console.error('Error deleting account:', err);
      showToast('Ocorreu um erro ao excluir a sua conta.', 'error');
    } finally {
      setDeletingAccount(false);
    }
  };

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
    if (!name.trim()) {
      showToast('O nome do produtor é obrigatório.', 'error');
      return;
    }
    setLoading(true);
    try {
      const updatedData = {
        ...farmer,
        name,
        photoUrl,
        bio,
        province,
        phoneNumber,
        gapId,
        certificationStatus,
        location: coords,
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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-[2rem] sm:rounded-[2.5rem] w-full max-w-lg p-6 sm:p-8 shadow-2xl relative overflow-hidden"
      >
        <div className="absolute top-0 left-0 w-full h-2 bg-emerald-600" />
        
        <button onClick={onClose} className="absolute top-6 right-6 p-2 hover:bg-gray-100 rounded-full transition-colors z-10">
          <X className="w-5 h-5 text-gray-400" />
        </button>

        <div className="mb-6">
           <h3 className="text-2xl font-bold text-emerald-900">Editar Perfil</h3>
           <p className="text-xs text-gray-500">Atualize as informações do seu perfil de produtor.</p>
        </div>

        <div className="space-y-4 overflow-y-auto max-h-[70vh] pr-1 scrollbar-thin">
          <div className="flex flex-col sm:flex-row items-center gap-6 bg-emerald-50/50 p-4 rounded-2xl border border-emerald-100/30">
            <div 
              onClick={() => !uploading && setShowPhotoSelector(true)}
              className="w-20 h-20 bg-emerald-100 rounded-2xl overflow-hidden border-2 border-white shadow-md shrink-0 cursor-pointer hover:opacity-85"
            >
               {photoUrl ? (
                 <img 
                   src={photoUrl} 
                   className="w-full h-full object-cover" 
                   alt="Foto do Produtor"
                 />
               ) : (
                 <div className="w-full h-full bg-gradient-to-br from-emerald-600 to-teal-750 text-white font-extrabold flex items-center justify-center text-center text-2xl uppercase select-none leading-none">
                   {getInitials(name || 'Produtor')}
                 </div>
               )}
            </div>
            <div className="flex-1 w-full space-y-2">
              <label className="text-[10px] font-bold text-emerald-800 uppercase tracking-widest ml-1">Fotografia do Produtor</label>
              <div className="flex items-center gap-2">
                <button 
                  type="button"
                  onClick={() => !uploading && setShowPhotoSelector(true)}
                  className={cn(
                    "flex-1 flex flex-row items-center justify-center gap-2 p-3 border-2 border-dashed rounded-xl cursor-pointer transition-all bg-white text-emerald-950",
                    uploading ? "border-emerald-300 opacity-70" : "border-emerald-200 hover:border-emerald-400"
                  )}
                  disabled={uploading}
                >
                  {uploading ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-emerald-600"></div>
                  ) : (
                    <Camera className="w-4 h-4 text-emerald-600" />
                  )}
                  <span className="text-[10px] font-bold uppercase tracking-wider">
                    {uploading ? 'A Carregar...' : 'Alterar Foto'}
                  </span>
                </button>
                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileUpload} />
                {photoUrl && (
                  <button 
                   type="button"
                   onClick={() => setPhotoUrl('')}
                   className="p-3 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition-colors"
                   title="Remover Foto"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Nome do Produtor</label>
              <input 
                type="text" 
                className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-emerald-600 outline-none transition-all"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Nome do Produtor"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Localização / Província</label>
                <div className="relative">
                  <input 
                    type="text" 
                    className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 pl-4 pr-12 text-sm focus:ring-2 focus:ring-emerald-600 outline-none transition-all font-medium"
                    value={province}
                    onChange={e => setProvince(e.target.value)}
                    placeholder="e.g. Chimoio, Manica"
                  />
                  <button 
                    type="button"
                    onClick={detectProfileLocation}
                    disabled={detectingLoc}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-emerald-100 text-emerald-600 rounded-xl hover:bg-emerald-200 transition-colors disabled:opacity-50"
                    title="Detectar com GPS do telemóvel"
                  >
                    <LocateFixed className={cn("w-4 h-4", detectingLoc && "animate-pulse")} />
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Telemóvel / Contacto</label>
                <input 
                  type="text" 
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-emerald-600 outline-none transition-all font-mono"
                  value={phoneNumber}
                  onChange={e => setPhoneNumber(e.target.value)}
                  placeholder="e.g. +258 84 123 4567"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Código Global G.A.P.</label>
                <input 
                  type="text" 
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-emerald-600 outline-none transition-all font-mono"
                  value={gapId}
                  onChange={e => setGapId(e.target.value)}
                  placeholder="GGN 4050607..."
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Estado de Certificação</label>
                <select 
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-3.5 text-sm focus:ring-2 focus:ring-emerald-600 outline-none transition-all"
                  value={certificationStatus}
                  onChange={e => setCertificationStatus(e.target.value as any)}
                >
                  <option value="certified">Certificado (GAP Ativo)</option>
                  <option value="pending">Pendente (Em Auditoria)</option>
                  <option value="none">Não Certificado</option>
                  <option value="expired">Certificado Expirado</option>
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Biografia / Sobre a Quinta</label>
              <textarea 
                className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-emerald-600 outline-none transition-all resize-none h-20"
                value={bio}
                onChange={e => setBio(e.target.value)}
                placeholder="Conte aos consumidores sobre o seu processo de cultivo e história em Chimoio..."
              />
            </div>

            {/* Danger Zone: Account Deletion */}
            <div className="pt-4 border-t border-red-100 bg-red-50/40 p-4 rounded-2xl border border-red-100/50 space-y-3 text-left">
              <div className="flex items-center gap-2">
                <Trash2 className="w-4 h-4 text-red-600 shrink-0" />
                <span className="text-[10px] font-black text-red-850 uppercase tracking-widest">Deseja apagar a sua conta?</span>
              </div>
              <p className="text-[10.5px] text-red-700/80 leading-relaxed">
                Se não pretender continuar a fazer parte do AgroTrace, pode eliminar a sua conta de produtor de forma permanente.
              </p>
              
              {!showDeleteConfirm ? (
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="w-full bg-white hover:bg-red-50 text-red-650 border border-red-200 hover:border-red-300 py-2.5 rounded-xl font-bold text-xs transition-colors shadow-sm cursor-pointer"
                >
                  Desejo Eliminar o Meu Registo do Mercado
                </button>
              ) : (
                <div className="space-y-3 bg-red-105 bg-red-50 p-3.5 rounded-xl border border-red-200/40">
                  <p className="text-[10.5px] font-black text-red-900 leading-normal uppercase">
                    ⚠️ Atenção: Esta ação é definitiva e irreversível!
                  </p>
                  <p className="text-[10px] text-red-750 leading-normal font-bold">
                    Todos os seus lotes ativos e histórico de produtor serão completamente apagados em tempo real do mercado.
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={deletingAccount}
                      onClick={() => setShowDeleteConfirm(false)}
                      className="flex-1 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 py-2 rounded-lg font-bold text-[10.5px] transition-all shadow-sm cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      disabled={deletingAccount}
                      onClick={handleDeleteAccount}
                      className="flex-1 bg-red-600 hover:bg-red-750 text-white py-2 rounded-lg font-black text-[10.5px] transition-all flex items-center justify-center gap-1 shadow-md shadow-red-500/10 cursor-pointer"
                    >
                      {deletingAccount ? (
                        <div className="animate-spin rounded-full h-3 w-3 border-2 border-white border-t-transparent" />
                      ) : (
                        'Apagar para Sempre'
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="pt-2 flex gap-4">
            <button 
              onClick={onClose}
              className="flex-1 py-3 text-sm font-bold text-gray-500 hover:bg-gray-50 rounded-xl transition-colors"
            >
              Cancelar
            </button>
            <button 
              onClick={save}
              disabled={loading}
              className="flex-1 bg-emerald-600 text-white py-3 rounded-xl font-bold shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 transition-all disabled:opacity-50 text-sm"
            >
              {loading ? 'A guardar...' : 'Guardar Alterações'}
            </button>
          </div>
        </div>
      </motion.div>
      {showPhotoSelector && (
        <PhotoActionModal 
          isOpen={showPhotoSelector}
          onClose={() => setShowPhotoSelector(false)}
          onSelectUpload={() => fileInputRef.current?.click()}
          onSelectCamera={() => setShowCamera(true)}
          onRemovePhoto={handleRemovePhoto}
          hasPhoto={!!photoUrl}
        />
      )}
      {showCamera && (
        <CameraCaptureModal 
          onCapture={handleCameraCapture}
          onClose={() => setShowCamera(false)}
        />
      )}
    </div>
  );
}

function BatchHistoryModal({ batch, onClose }: { batch: Batch, onClose: () => void }) {
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState('');

  const handleDelete = async () => {
    try {
      await deleteDoc(doc(db, 'batches', batch.batchId));
      showToast('Lote excluído com sucesso!', 'success');
      setShowDeleteConfirm(false);
      onClose();
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `batches/${batch.batchId}`);
    }
  };

  const [formData, setFormData] = useState({
    cropType: batch.cropType,
    quantity: batch.quantity,
    harvestDate: batch.harvestDate,
    pesticides: batch.pesticides || '',
    productType: (batch.productType || 'vegetal') as 'vegetal' | 'fruta' | 'grão',
    status: batch.status,
    photoUrl: batch.photoUrl || '',
    lat: batch.location?.lat || -19.116,
    lng: batch.location?.lng || 33.483,
    locationName: batch.journey?.[0]?.location || 'Quinta do Chimoio',
  });

  const [stepLocation, setStepLocation] = useState('');
  const [stepDescription, setStepDescription] = useState('');
  const [stepTimestamp, setStepTimestamp] = useState(new Date().toISOString().slice(0, 16));
  const [addedSteps, setAddedSteps] = useState<{ timestamp: string; location: string; description: string }[]>([]);

  const [showLiveCamera, setShowLiveCamera] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    setFormData({
      cropType: batch.cropType,
      quantity: batch.quantity,
      harvestDate: batch.harvestDate,
      pesticides: batch.pesticides || '',
      productType: (batch.productType || 'vegetal') as 'vegetal' | 'fruta' | 'grão',
      status: batch.status,
      photoUrl: batch.photoUrl || '',
      lat: batch.location?.lat || -19.116,
      lng: batch.location?.lng || 33.483,
      locationName: batch.journey?.[0]?.location || 'Quinta do Chimoio',
    });
    setAddedSteps([]);
    setStepLocation('');
    setStepDescription('');
    setStepTimestamp(new Date().toISOString().slice(0, 16));
  }, [batch]);

  const compressImage = (base64Str: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = base64Str;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 400;
        const MAX_HEIGHT = 400;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = () => {
        resolve(base64Str);
      };
    });
  };

  const startCamera = async () => {
    try {
      setShowLiveCamera(true);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 400 }, height: { ideal: 300 } }
      });
      streamRef.current = stream;
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, 150);
    } catch (err) {
      console.error("Camera access error:", err);
      showToast("Acesso à câmara não permitido ou indisponível. Por favor, use a opção de carregar ficheiro.");
      setShowLiveCamera(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setShowLiveCamera(false);
  };

  const captureSnapshot = () => {
    if (videoRef.current) {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 400;
      canvas.height = video.videoHeight || 300;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const base64 = canvas.toDataURL('image/jpeg', 0.7);
        compressImage(base64).then((compressed) => {
          setFormData(prev => ({ ...prev, photoUrl: compressed }));
          stopCamera();
        });
      }
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        compressImage(base64).then((compressed) => {
          setFormData(prev => ({ ...prev, photoUrl: compressed }));
        });
      };
      reader.readAsDataURL(file);
    }
  };

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const save = async () => {
    if (!formData.cropType) {
      showToast('O tipo de cultivo é obrigatório.');
      return;
    }
    if (!formData.quantity) {
      showToast('A quantidade é obrigatória.');
      return;
    }

    try {
      const updatedJourney = [...(batch.journey || [])];
      if (updatedJourney.length > 0) {
        updatedJourney[0] = {
          ...updatedJourney[0],
          location: formData.locationName,
          description: `Colheita e registo inicial de rastreabilidade. Lote classificado como ${formData.productType} com utilização de: ${formData.pesticides || 'Sem pesticidas declarados'}.`
        };
      }

      // Append manually typed but not yet explicitly pushed step if both fields are filled
      if (stepLocation.trim() && stepDescription.trim()) {
        updatedJourney.push({
          timestamp: new Date(stepTimestamp).toISOString(),
          location: stepLocation.trim(),
          description: stepDescription.trim()
        });
      }

      // Append all from addedSteps list
      addedSteps.forEach(step => {
        updatedJourney.push(step);
      });

      await updateDoc(doc(db, 'batches', batch.batchId), {
        cropType: formData.cropType,
        quantity: formData.quantity,
        harvestDate: formData.harvestDate,
        pesticides: formData.pesticides,
        productType: formData.productType,
        status: formData.status,
        photoUrl: formData.photoUrl || '',
        location: {
          lat: Number(formData.lat) || -19.116,
          lng: Number(formData.lng) || 33.483,
        },
        journey: updatedJourney
      });

      showToast('Lote atualizado com sucesso!', 'success');
      setStepLocation('');
      setStepDescription('');
      setAddedSteps([]);
      setIsEditing(false);
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `batches/${batch.batchId}`);
    }
  };

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
              <h3 className="text-xl font-bold text-emerald-950 leading-none">
                {isEditing ? "Modificar Lote" : "Histórico Detalhado"}
              </h3>
              <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-widest mt-1.5 flex items-center gap-1.5">
                {isEditing ? "Altere as informações de rastreabilidade" : <><ShieldCheck className="w-3 h-3" /> Lote Verificado e Rastreado</>}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <button 
                onClick={() => { setDeleteConfirmInput(''); setShowDeleteConfirm(true); }}
                className="py-2.5 px-3 bg-red-50 text-red-700 hover:bg-red-100 transition-all rounded-xl active:scale-95 shadow-sm flex items-center gap-1.5 font-bold text-xs uppercase tracking-wider"
                title="Excluir Lote"
              >
                <Trash2 className="w-3.5 h-3.5 text-red-600" /> Excluir Lote
              </button>
              {!isEditing ? (
                <button 
                 onClick={() => setIsEditing(true)}
                 className="py-2.5 px-4 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-all rounded-xl active:scale-95 shadow-sm flex items-center gap-1.5 font-bold text-xs uppercase tracking-wider"
                 title="Editar Detalhes"
                >
                  <Edit className="w-3.5 h-3.5" /> Editar Lote
                </button>
              ) : (
                <button 
                 onClick={() => setIsEditing(false)}
                 className="py-2.5 px-4 bg-amber-50 text-amber-700 hover:bg-amber-100 transition-all rounded-xl active:scale-95 shadow-sm flex items-center gap-1.5 font-bold text-xs uppercase tracking-wider"
                 title="Ver Rastreabilidade"
                >
                  <Eye className="w-3.5 h-3.5" /> Ver Detalhes
                </button>
              )}
               <button 
                onClick={onClose} 
                className="p-2.5 bg-gray-50 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all active:scale-95 shadow-sm"
               >
                 <X className="w-5 h-5" />
               </button>
            </div>
         </div>
        
        {/* Content Container */}
        <div className="flex-1 overflow-y-auto invisible-scrollbar">
          {!isEditing ? (
            <>
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
            </>
          ) : (
            <div className="p-6 sm:p-8 max-w-xl mx-auto space-y-5">
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase">Cultivo</label>
                <input 
                  className="w-full mt-1 bg-gray-50 border-none rounded-xl p-4 focus:ring-2 focus:ring-emerald-600 outline-none" 
                  placeholder="Ex: Milho, Soja, Manga"
                  value={formData.cropType}
                  onChange={e => setFormData({...formData, cropType: e.target.value})}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase">Quantidade</label>
                  <input 
                    className="w-full mt-1 bg-gray-50 border-none rounded-xl p-4 focus:ring-2 focus:ring-emerald-600 outline-none" 
                    placeholder="Ex: 500kg"
                    value={formData.quantity}
                    onChange={e => setFormData({...formData, quantity: e.target.value})}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase">Data de Colheita</label>
                  <input 
                    type="date"
                    className="w-full mt-1 bg-gray-50 border-none rounded-xl p-4 focus:ring-2 focus:ring-emerald-600 outline-none text-xs sm:text-sm" 
                    value={formData.harvestDate}
                    onChange={e => setFormData({...formData, harvestDate: e.target.value})}
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-400 uppercase block mb-1">Status do Lote</label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { id: 'harvested', label: 'Colhido' },
                    { id: 'distributing', label: 'Em Trânsito' },
                    { id: 'market', label: 'Mercado' },
                    { id: 'consumed', label: 'Consumido' }
                  ].map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setFormData({...formData, status: s.id as any})}
                      className={cn(
                        "py-3 px-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all border text-center",
                        formData.status === s.id 
                          ? "bg-amber-500 text-white border-amber-500 shadow-md"
                          : "bg-gray-50 text-gray-500 border-transparent hover:bg-gray-100"
                      )}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-400 uppercase block mb-1">Tipo de Produto</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['vegetal', 'fruta', 'grão'] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setFormData({...formData, productType: type})}
                      className={cn(
                        "py-3 px-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border",
                        formData.productType === type 
                          ? "bg-emerald-600 text-white border-emerald-600 shadow-md"
                          : "bg-gray-50 text-gray-500 border-transparent hover:bg-gray-100"
                      )}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-400 uppercase">Pesticidas Usados</label>
                <input 
                  className="w-full mt-1 bg-gray-50 border-none rounded-xl p-4 focus:ring-2 focus:ring-emerald-600 outline-none" 
                  placeholder="Ex: Nenhum / Orgânico, Glifosato"
                  value={formData.pesticides}
                  onChange={e => setFormData({...formData, pesticides: e.target.value})}
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-400 uppercase block mb-2 flex items-center gap-2">
                  <Camera className="w-4 h-4 text-emerald-600" /> Imagem do Lote / Tirar Foto
                </label>
                <div className="space-y-3">
                  {showLiveCamera ? (
                    <div className="relative border-2 border-emerald-500 rounded-2xl overflow-hidden bg-black h-48 flex flex-col items-center justify-center">
                      <video 
                        ref={videoRef} 
                        autoPlay 
                        playsInline 
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-3">
                        <button
                          type="button"
                          onClick={captureSnapshot}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase px-4 py-2 rounded-xl shadow-lg"
                        >
                          Capturar Foto
                        </button>
                        <button
                          type="button"
                          onClick={stopCamera}
                          className="bg-gray-800 hover:bg-gray-700 text-white font-bold text-xs uppercase px-4 py-2 rounded-xl shadow-lg"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="relative border-2 border-dashed border-gray-200 hover:border-emerald-500 rounded-2xl overflow-hidden h-40 flex flex-col items-center justify-center bg-gray-50/50 transition-all">
                      {formData.photoUrl ? (
                        <>
                          <img src={formData.photoUrl} className="w-full h-full object-cover" alt="Lote" referrerPolicy="no-referrer" />
                          <button
                            type="button"
                            onClick={() => setFormData(prev => ({ ...prev, photoUrl: '' }))}
                            className="absolute top-2 right-2 bg-black/60 hover:bg-red-600 text-white p-1.5 rounded-full transition-colors backdrop-blur-sm shadow-md"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </>
                      ) : (
                        <div className="text-center p-4">
                          <Camera className="w-8 h-8 text-gray-300 mx-auto mb-1 animate-pulse" />
                          <p className="text-xs font-bold text-gray-500">Nenhuma imagem adicionada</p>
                          <p className="text-[10px] text-gray-400 mt-1">Carregue ou utilize um dos atalhos abaixo</p>
                        </div>
                      )}
                    </div>
                  )}

                  {!showLiveCamera && (
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={startCamera}
                        className="flex items-center justify-center gap-2 py-3 px-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors border border-emerald-200/50"
                      >
                        <Camera className="w-4 h-4" />
                        Câmara em Directo
                      </button>

                      <label className="flex items-center justify-center gap-2 py-3 px-3 bg-gray-50 hover:bg-gray-100 text-gray-600 rounded-xl cursor-pointer text-xs font-bold uppercase tracking-wider transition-colors border border-gray-200 text-center">
                        Ficheiro / Foto
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="hidden"
                          onChange={handleImageUpload}
                        />
                      </label>
                    </div>
                  )}

                  <div className="flex gap-1 overflow-x-auto py-1 invisible-scrollbar">
                    <span className="text-[10px] text-gray-400 font-bold uppercase shrink-0 py-1 mr-1">Exemplos:</span>
                    {[
                      { name: 'Vegetal', url: 'https://images.unsplash.com/photo-1566385101042-1a0104b2d37b?auto=format&fit=crop&w=400&q=80' },
                      { name: 'Fruta', url: 'https://images.unsplash.com/photo-1619546813926-a78fa6372cd2?auto=format&fit=crop&w=400&q=80' },
                      { name: 'Grão/Milho', url: 'https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?auto=format&fit=crop&w=400&q=80' }
                    ].map(item => (
                      <button
                        key={item.name}
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, photoUrl: item.url }))}
                        className="text-[10px] font-bold bg-gray-150 hover:bg-emerald-50 text-gray-500 hover:text-emerald-700 px-2.5 py-1 rounded-lg border border-transparent hover:border-emerald-200 transition-all shrink-0"
                      >
                        + {item.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-100 pt-4 space-y-4">
                <h4 className="text-xs font-bold text-gray-455 uppercase tracking-widest">Localização de Origem</h4>
                
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase">Nome da Quinta / Local</label>
                  <input 
                    className="w-full mt-1 bg-gray-50 border-none rounded-xl p-4 focus:ring-2 focus:ring-emerald-600 outline-none" 
                    placeholder="Ex: Quinta do Chimoio, Setor C"
                    value={formData.locationName}
                    onChange={e => setFormData({...formData, locationName: e.target.value})}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-gray-400 uppercase">Latitude</label>
                    <input 
                      type="number"
                      step="any"
                      className="w-full mt-1 bg-gray-50 border-none rounded-xl p-4 focus:ring-2 focus:ring-emerald-600 outline-none font-mono text-xs" 
                      value={formData.lat}
                      onChange={e => setFormData({...formData, lat: parseFloat(e.target.value) || 0})}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-400 uppercase">Longitude</label>
                    <input 
                      type="number"
                      step="any"
                      className="w-full mt-1 bg-gray-50 border-none rounded-xl p-4 focus:ring-2 focus:ring-emerald-600 outline-none font-mono text-xs" 
                      value={formData.lng}
                      onChange={e => setFormData({...formData, lng: parseFloat(e.target.value) || 0})}
                    />
                  </div>
                </div>
              </div>

              {/* Journey Steps Section */}
              <div className="border-t border-gray-100 pt-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-gray-450 uppercase tracking-widest">Jornada do Lote</h4>
                  <span className="text-[10px] bg-emerald-50 text-emerald-800 border border-emerald-100 font-bold px-2.5 py-1 rounded-full uppercase">
                    {(batch.journey?.length || 0) + addedSteps.length} Passos no Total
                  </span>
                </div>

                {/* Timeline Preview of current + pending steps */}
                <div className="space-y-3 max-h-56 overflow-y-auto pr-1 invisible-scrollbar">
                  {(batch.journey || []).map((step, idx) => (
                    <div key={idx} className="bg-gray-50 p-4 rounded-2xl border border-gray-100 flex flex-col gap-1 text-left relative">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-emerald-950 uppercase tracking-wide truncate max-w-[200px]">{step.location}</span>
                        <span className="text-[10px] font-mono text-gray-400">{formatDate(step.timestamp)}</span>
                      </div>
                      <p className="text-xs text-[#5C5A54] leading-relaxed mt-1">{step.description}</p>
                    </div>
                  ))}
                  {addedSteps.map((step, idx) => (
                    <div key={`added-${idx}`} className="bg-emerald-50/50 p-4 rounded-2xl border border-emerald-100/30 flex flex-col gap-1 text-left relative group">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-emerald-800 uppercase tracking-wide truncate max-w-[200px]">{step.location} (A Adicionar)</span>
                        <span className="text-[10.5px] font-mono text-emerald-600/70">{formatDate(step.timestamp)}</span>
                      </div>
                      <p className="text-xs text-[#2C2B29] leading-relaxed mt-1">{step.description}</p>
                      <button
                        type="button"
                        onClick={() => setAddedSteps(prev => prev.filter((_, i) => i !== idx))}
                        className="absolute right-3 bottom-3 text-[10px] text-red-600 font-bold bg-white hover:bg-red-50 px-2.5 py-1 rounded-xl shadow-sm border border-red-100 transition-colors"
                      >
                        Remover
                      </button>
                    </div>
                  ))}
                </div>

                {/* Add new journey step fields */}
                <div className="bg-[#FAF8F2] border border-[#E5E2D9] p-5 rounded-3xl space-y-4">
                  <div className="flex items-center gap-2">
                    <History className="w-4 h-4 text-emerald-700" />
                    <span className="text-xs font-extrabold text-[#3C3A34] uppercase tracking-wider">Adicionar Novo Passo de Rastreio</span>
                  </div>
                  
                  <div className="space-y-3">
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Localização (Cidade, Fábrica, Porto...)</label>
                      <input 
                        className="w-full bg-white border border-[#E5E2D9] rounded-xl px-4 py-3 text-xs text-[#2C2B29] font-medium focus:ring-2 focus:ring-emerald-600 focus:border-transparent outline-none transition-all" 
                        placeholder="Ex: Porto da Beira, Terminal de Carga"
                        value={stepLocation}
                        onChange={e => setStepLocation(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Descrição das Atividades / Evento</label>
                      <textarea 
                        className="w-full bg-white border border-[#E5E2D9] rounded-xl px-4 py-3 text-xs text-[#2C2B29] font-medium focus:ring-2 focus:ring-emerald-600 focus:border-transparent outline-none h-20 resize-none transition-all" 
                        placeholder="Ex: Lote embalado por vácuo e colocado em contentor refrigerado pronto para exportação marítima."
                        value={stepDescription}
                        onChange={e => setStepDescription(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Data e Hora do Evento</label>
                      <input 
                        type="datetime-local"
                        className="w-full bg-white border border-[#E5E2D9] rounded-xl px-4 py-3 text-xs text-gray-600 font-semibold focus:ring-2 focus:ring-emerald-600 focus:border-transparent outline-none transition-all" 
                        value={stepTimestamp}
                        onChange={e => setStepTimestamp(e.target.value)}
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        if (!stepLocation.trim() || !stepDescription.trim()) {
                          showToast('Localização e descrição são obrigatórias para criar o novo passo.');
                          return;
                        }
                        const stepObj = {
                          timestamp: new Date(stepTimestamp).toISOString(),
                          location: stepLocation.trim(),
                          description: stepDescription.trim()
                        };
                        setAddedSteps(prev => [...prev, stepObj]);
                        setStepLocation('');
                        setStepDescription('');
                        setStepTimestamp(new Date().toISOString().slice(0, 16));
                        showToast('Passo adicionado com sucesso!', 'success');
                      }}
                      className="w-full bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 py-3.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all active:scale-95 shadow-sm"
                    >
                      + Confirmar e Adicionar Passo
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex gap-4 pt-4 border-t border-gray-100 shrink-0">
                <button 
                  type="button"
                  onClick={() => setIsEditing(false)} 
                  className="flex-1 py-3.5 sm:py-4 rounded-xl font-bold text-gray-500 hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  type="button"
                  onClick={save} 
                  className="flex-1 bg-emerald-600/95 text-white py-3.5 sm:py-4 rounded-xl font-bold shadow-lg shadow-emerald-500/20 hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2"
                >
                  <Save className="w-4 h-4" /> Gravar Alterações
                </button>
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {/* Confirmation Modal overlay */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-[200] flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#FDFCF9] rounded-[2rem] p-8 max-w-md w-full shadow-2xl border border-[#E5E2D9] text-center space-y-6 animate-in fade-in"
            >
              <div className="w-14 h-14 bg-red-50 border border-red-150 rounded-full flex items-center justify-center mx-auto text-red-600">
                <Trash2 className="w-6 h-6" />
              </div>
              <div className="space-y-2">
                <h4 className="text-lg font-bold text-gray-900">Excluir Lote</h4>
                <p className="text-xs text-[#5C5A54] leading-relaxed">
                  Tem certeza que deseja excluir o lote de <strong className="text-red-700">{batch.cropType}</strong>? Esta ação é definitiva e removerá todos os dados de rastreio de forma permanente.
                </p>
              </div>

              <div className="space-y-2 text-left bg-gray-50/50 border border-[#E5E2D9] p-4 rounded-2xl">
                <label className="block text-[10px] font-black text-gray-450 uppercase tracking-widest">
                  Confirme o tipo de cultivo para continuar:
                </label>
                <input
                  type="text"
                  placeholder={`Escreva "${batch.cropType}"`}
                  value={deleteConfirmInput}
                  onChange={(e) => setDeleteConfirmInput(e.target.value)}
                  className="w-full mt-1.5 bg-white border border-[#E5E2D9] rounded-xl px-4 py-3 text-xs text-[#2C2B29] font-semibold focus:ring-2 focus:ring-red-500 outline-none transition-all placeholder:text-gray-300"
                />
                <p className="text-[9.5px] text-gray-400 mt-1 leading-relaxed">
                  Digite <strong className="text-red-650 font-bold select-all">{batch.cropType}</strong> no campo acima para confirmar a segurança da operação.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 py-3.5 px-4 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-500 hover:text-gray-755 transition-all uppercase tracking-wider active:scale-95"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={deleteConfirmInput.trim().toLowerCase() !== batch.cropType.trim().toLowerCase()}
                  onClick={handleDelete}
                  className="flex-1 py-3.5 px-4 bg-red-650 hover:bg-red-700 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed select-none text-white rounded-xl text-xs font-bold transition-all uppercase tracking-wider shadow-lg shadow-red-600/10 active:scale-95"
                >
                  Confirmar e Excluir
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function AddBatchModal({ userId, onClose }: any) {
  const [formData, setFormData] = useState({
    cropType: '',
    quantity: '',
    harvestDate: new Date().toISOString().split('T')[0],
    pesticides: '',
    productType: 'vegetal' as 'vegetal' | 'fruta' | 'grão',
    locationName: 'Quinta do Chimoio',
    photoUrl: '',
    lat: Number((-19.116 + (Math.random() - 0.5) * 0.05).toFixed(6)),
    lng: Number((33.483 + (Math.random() - 0.5) * 0.05).toFixed(6))
  });

  const [stepLocation, setStepLocation] = useState('');
  const [stepDescription, setStepDescription] = useState('');
  const [stepTimestamp, setStepTimestamp] = useState(new Date().toISOString().slice(0, 16));
  const [addedSteps, setAddedSteps] = useState<{ timestamp: string; location: string; description: string }[]>([]);

  const [showCameraModal, setShowCameraModal] = useState(false);

  const compressImage = (base64Str: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = base64Str;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 400;
        const MAX_HEIGHT = 400;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = () => {
        resolve(base64Str);
      };
    });
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        compressImage(base64).then((compressed) => {
          setFormData(prev => ({ ...prev, photoUrl: compressed }));
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const save = async () => {
    const id = `BATCH-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
    const location = { 
        lat: Number(formData.lat) || -19.116, 
        lng: Number(formData.lng) || 33.483 
    };
    
    try {
      const journey = [
        { 
          timestamp: new Date().toISOString(), 
          location: formData.locationName, 
          description: `Colheita e registo inicial de rastreabilidade. Lote classificado como ${formData.productType} com utilização de: ${formData.pesticides || 'Sem pesticidas declarados'}.` 
        }
      ];

      // Append manually typed but not yet explicitly pushed step if both fields are filled
      if (stepLocation.trim() && stepDescription.trim()) {
        journey.push({
          timestamp: new Date(stepTimestamp).toISOString(),
          location: stepLocation.trim(),
          description: stepDescription.trim()
        });
      }

      // Append all from addedSteps list
      addedSteps.forEach(step => {
        journey.push(step);
      });

      await setDoc(doc(db, 'batches', id), {
        cropType: formData.cropType,
        quantity: formData.quantity,
        harvestDate: formData.harvestDate,
        pesticides: formData.pesticides,
        productType: formData.productType,
        photoUrl: formData.photoUrl || '',
        batchId: id,
        farmerId: userId,
        location,
        status: 'harvested',
        journey,
        qrCode: id
      });

      // Send real-time notifications to any consumers who have previously viewed this farmer
      try {
        const q = query(collection(db, 'farmer_views'), where('farmerId', '==', userId));
        const querySnapshot = await getDocs(q);
        
        let farmerName = 'Um produtor';
        try {
          const farmerDoc = await getDoc(doc(db, 'farmers', userId));
          if (farmerDoc.exists()) {
            farmerName = farmerDoc.data().name || farmerName;
          }
        } catch (err) {
          console.error("Error fetching farmer name for notification:", err);
        }

        const viewerPromises = querySnapshot.docs.map(async (docSnap) => {
          const viewData = docSnap.data();
          const targetUserId = viewData.userId;
          
          if (targetUserId === userId) return;

          const notifId = `NOTIF-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;

          await setDoc(doc(db, 'notifications', notifId), {
            notificationId: notifId,
            targetUserId,
            farmerId: userId,
            farmerName,
            cropType: formData.cropType,
            batchId: id,
            createdAt: new Date().toISOString(),
            read: false
          });
        });
        await Promise.all(viewerPromises);
      } catch (notifyErr) {
        console.error("Error sending notifications to viewers:", notifyErr);
      }

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
        className="bg-white w-full max-w-lg rounded-[2rem] sm:rounded-[2.5rem] p-6 sm:p-8 flex flex-col max-h-[90vh] shadow-2xl overflow-hidden"
      >
        <div className="pb-4 border-b border-gray-100 shrink-0">
          <h3 className="text-xl sm:text-2xl font-bold text-emerald-950">Registar Lote</h3>
          <p className="text-xs text-gray-400 mt-1">Preencha os dados de rastreabilidade do seu cultivo</p>
        </div>

        <div className="flex-1 overflow-y-auto py-4 space-y-5 pr-1 invisible-scrollbar">
          <div>
            <label className="text-xs font-bold text-gray-400 uppercase">Cultivo</label>
            <input 
              className="w-full mt-1 bg-gray-50 border-none rounded-xl p-4 focus:ring-2 focus:ring-emerald-600 outline-none" 
              placeholder="Ex: Milho, Soja, Manga"
              value={formData.cropType}
              onChange={e => setFormData({...formData, cropType: e.target.value})}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase">Quantidade</label>
              <input 
                className="w-full mt-1 bg-gray-50 border-none rounded-xl p-4 focus:ring-2 focus:ring-emerald-600 outline-none" 
                placeholder="Ex: 500kg"
                value={formData.quantity}
                onChange={e => setFormData({...formData, quantity: e.target.value})}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase">Data de Colheita</label>
              <input 
                type="date"
                className="w-full mt-1 bg-gray-50 border-none rounded-xl p-4 focus:ring-2 focus:ring-emerald-600 outline-none text-xs sm:text-sm" 
                value={formData.harvestDate}
                onChange={e => setFormData({...formData, harvestDate: e.target.value})}
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-400 uppercase block mb-1">Tipo de Produto</label>
            <div className="grid grid-cols-3 gap-2">
              {(['vegetal', 'fruta', 'grão'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setFormData({...formData, productType: type})}
                  className={cn(
                    "py-3 px-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border",
                    formData.productType === type 
                      ? "bg-emerald-600 text-white border-emerald-600 shadow-md"
                      : "bg-gray-50 text-gray-500 border-transparent hover:bg-gray-100"
                  )}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-400 uppercase">Pesticidas Usados</label>
            <input 
              className="w-full mt-1 bg-gray-50 border-none rounded-xl p-4 focus:ring-2 focus:ring-emerald-600 outline-none" 
              placeholder="Ex: Nenhum / Orgânico, Glifosato"
              value={formData.pesticides}
              onChange={e => setFormData({...formData, pesticides: e.target.value})}
            />
          </div>

          <div>
            <label className="text-xs font-bold text-gray-400 uppercase block mb-2 flex items-center gap-2">
              <Camera className="w-4 h-4 text-emerald-600" /> Imagem do Lote / Tirar Foto
            </label>
            <div className="space-y-3">
              <div className="relative border-2 border-dashed border-gray-200 hover:border-emerald-500 rounded-2xl overflow-hidden h-40 flex flex-col items-center justify-center bg-gray-50/50 transition-all">
                {formData.photoUrl ? (
                  <>
                    <img src={formData.photoUrl} className="w-full h-full object-cover" alt="Lote" referrerPolicy="no-referrer" />
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, photoUrl: '' }))}
                      className="absolute top-2 right-2 bg-black/60 hover:bg-red-600 text-white p-1.5 rounded-full transition-colors backdrop-blur-sm shadow-md"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </>
                ) : (
                  <div className="text-center p-4">
                    <Camera className="w-8 h-8 text-gray-300 mx-auto mb-1 animate-pulse" />
                    <p className="text-xs font-bold text-gray-500">Nenhuma imagem adicionada</p>
                    <p className="text-[10px] text-gray-400 mt-1">Carregue ou utilize um dos atalhos abaixo</p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setShowCameraModal(true)}
                  className="flex items-center justify-center gap-2 py-3 px-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors border border-emerald-200/50"
                >
                  <Camera className="w-4 h-4" />
                  Câmara em Directo
                </button>

                <label className="flex items-center justify-center gap-2 py-3 px-3 bg-gray-50 hover:bg-gray-100 text-gray-600 rounded-xl cursor-pointer text-xs font-bold uppercase tracking-wider transition-colors border border-gray-200 text-center">
                  Ficheiro / Foto
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handleImageUpload}
                  />
                </label>
              </div>

              {showCameraModal && (
                <CameraCaptureModal
                  defaultFacingMode="environment"
                  title="Fotografar Lote"
                  subtitle="Tire uma foto nítida dos seus produtos agrícolas para o lote."
                  onCapture={(base64) => {
                    setFormData(prev => ({ ...prev, photoUrl: base64 }));
                    setShowCameraModal(false);
                  }}
                  onClose={() => setShowCameraModal(false)}
                />
              )}

              <div className="flex gap-1 overflow-x-auto py-1 invisible-scrollbar">
                <span className="text-[10px] text-gray-400 font-bold uppercase shrink-0 py-1 mr-1">Exemplos:</span>
                {[
                  { name: 'Vegetal', url: 'https://images.unsplash.com/photo-1566385101042-1a0104b2d37b?auto=format&fit=crop&w=400&q=80' },
                  { name: 'Fruta', url: 'https://images.unsplash.com/photo-1619546813926-a78fa6372cd2?auto=format&fit=crop&w=400&q=80' },
                  { name: 'Grão/Milho', url: 'https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?auto=format&fit=crop&w=400&q=80' }
                ].map(item => (
                  <button
                    key={item.name}
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, photoUrl: item.url }))}
                    className="text-[10px] font-bold bg-gray-150 hover:bg-emerald-50 text-gray-500 hover:text-emerald-700 px-2.5 py-1 rounded-lg border border-transparent hover:border-emerald-200 transition-all shrink-0"
                  >
                    + {item.name}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4 space-y-4">
            <h4 className="text-xs font-bold text-gray-450 uppercase tracking-widest">Localização de Origem</h4>
            
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase">Nome da Quinta / Local</label>
              <input 
                className="w-full mt-1 bg-gray-50 border-none rounded-xl p-4 focus:ring-2 focus:ring-emerald-600 outline-none" 
                placeholder="Ex: Quinta do Chimoio, Setor C"
                value={formData.locationName}
                onChange={e => setFormData({...formData, locationName: e.target.value})}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase">Latitude</label>
                <input 
                  type="number"
                  step="any"
                  className="w-full mt-1 bg-gray-50 border-none rounded-xl p-4 focus:ring-2 focus:ring-emerald-600 outline-none font-mono text-xs" 
                  value={formData.lat}
                  onChange={e => setFormData({...formData, lat: parseFloat(e.target.value) || 0})}
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase">Longitude</label>
                <input 
                  type="number"
                  step="any"
                  className="w-full mt-1 bg-gray-50 border-none rounded-xl p-4 focus:ring-2 focus:ring-emerald-600 outline-none font-mono text-xs" 
                  value={formData.lng}
                  onChange={e => setFormData({...formData, lng: parseFloat(e.target.value) || 0})}
                />
              </div>
            </div>
          </div>

          {/* Journey Steps Section */}
          <div className="border-t border-gray-100 pt-4 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Passos Adicionais da Jornada</h4>
              <span className="text-[10px] bg-emerald-50 text-emerald-800 border border-emerald-100 font-bold px-2.5 py-1 rounded-full uppercase">
                {addedSteps.length + 1} Passos no Total
              </span>
            </div>

            {/* List of current added steps */}
            <div className="space-y-2 max-h-40 overflow-y-auto pr-1 invisible-scrollbar">
              <div className="bg-gray-50 p-3 rounded-xl border border-gray-100/50 flex flex-col gap-1 text-left relative">
                <span className="text-[10px] font-bold text-[#5C5A54] uppercase tracking-wide truncate max-w-[200px]">{formData.locationName || 'Quinta do Chimoio'} (Origem)</span>
                <p className="text-[11px] text-[#2C2B29] font-medium leading-normal line-clamp-2">Colheita e registo inicial de rastreabilidade do lote.</p>
              </div>
              {addedSteps.map((step, idx) => (
                <div key={`added-${idx}`} className="bg-emerald-50/50 p-3 rounded-xl border border-emerald-100/30 flex flex-col gap-1 text-left relative group">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wide truncate max-w-[150px]">{step.location}</span>
                    <span className="text-[9px] font-mono text-emerald-600/60">{formatDate(step.timestamp)}</span>
                  </div>
                  <p className="text-[11px] text-[#2C2B29] font-medium leading-normal line-clamp-2">{step.description}</p>
                  <button
                    type="button"
                    onClick={() => setAddedSteps(prev => prev.filter((_, i) => i !== idx))}
                    className="absolute right-2 bottom-2 text-[9px] text-red-500 font-bold hover:underline bg-white px-2 py-0.5 rounded shadow-sm border border-red-105"
                  >
                    Remover
                  </button>
                </div>
              ))}
            </div>

            {/* Inputs to add a new step */}
            <div className="bg-[#FAF8F2] border border-[#E5E2D9] p-4 rounded-2xl space-y-3">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1">Novo Passo da Jornada (Opcional)</span>
              
              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase">Localização (ex: Cooperativa, Armazém, Porto...)</label>
                <input 
                  className="w-full mt-1 bg-white border border-[#E5E2D9] rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-emerald-600 outline-none" 
                  placeholder="Ex: Cooperativa Agrícola de Chimoio"
                  value={stepLocation}
                  onChange={e => setStepLocation(e.target.value)}
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase">Descrição do Evento / Atividades</label>
                <textarea 
                  className="w-full mt-1 bg-white border border-[#E5E2D9] rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-emerald-600 outline-none h-16 resize-none" 
                  placeholder="Ex: Lote higienizado, selecionado e embalado pronto para distribuição."
                  value={stepDescription}
                  onChange={e => setStepDescription(e.target.value)}
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase">Data e Hora do Evento</label>
                <input 
                  type="datetime-local"
                  className="w-full mt-1 bg-white border border-[#E5E2D9] rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-emerald-600 outline-none text-gray-600" 
                  value={stepTimestamp}
                  onChange={e => setStepTimestamp(e.target.value)}
                />
              </div>

              <button
                type="button"
                onClick={() => {
                  if (!stepLocation.trim() || !stepDescription.trim()) {
                    showToast('Localização e descrição do passo são obrigatórias.');
                    return;
                  }
                  const stepObj = {
                    timestamp: new Date(stepTimestamp).toISOString(),
                    location: stepLocation.trim(),
                    description: stepDescription.trim()
                  };
                  setAddedSteps(prev => [...prev, stepObj]);
                  setStepLocation('');
                  setStepDescription('');
                  setStepTimestamp(new Date().toISOString().slice(0, 16));
                  showToast('Passo adicionado à lista!', 'success');
                }}
                className="w-full bg-emerald-990 hover:bg-emerald-900 border border-emerald-950 text-emerald-800 hover:text-white py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-colors active:scale-95 shadow-sm"
              >
                + Adicionar Passo à Lista
              </button>
            </div>
          </div>
        </div>

        <div className="flex gap-4 pt-4 border-t border-gray-100 shrink-0">
          <button 
            type="button"
            onClick={onClose} 
            className="flex-1 py-3.5 sm:py-4 rounded-xl font-bold text-gray-500 hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button 
            type="button"
            onClick={save} 
            className="flex-1 bg-emerald-600 text-white py-3.5 sm:py-4 rounded-xl font-bold shadow-lg shadow-emerald-500/20 hover:bg-emerald-700 transition-colors"
          >
            Gravar Lote
          </button>
        </div>
      </motion.div>
    </div>
  );
}
