export type UserRole = 'farmer' | 'buyer' | 'certifier' | 'admin';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  createdAt: string;
  phoneNumber?: string;
  province?: string;
  photoUrl?: string;
}

export interface Farmer {
  farmerId: string;
  name: string;
  location: { lat: number; lng: number };
  province?: string;
  certificationStatus: 'none' | 'pending' | 'certified' | 'expired';
  gapId?: string;
  photoUrl?: string;
  bio?: string;
  phoneNumber?: string;
}

export interface Batch {
  batchId: string;
  farmerId: string;
  cropType: string;
  harvestDate: string;
  quantity: string;
  location: { lat: number; lng: number };
  status: 'harvested' | 'distributing' | 'market' | 'consumed';
  certificationId?: string;
  journey: { timestamp: string; location: string; description: string }[];
  qrCode: string;
}

export interface AuditLog {
  logId: string;
  farmerId: string;
  certifierId: string;
  date: string;
  result: 'pass' | 'fail' | 'needs_improvement';
  notes: string;
}
