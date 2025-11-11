// lib/firebase.ts - Unified Firebase configuration for RallySphere
// Combines all Firebase functionality with Expo compatibility and persistence
import { initializeApp, getApps } from 'firebase/app';
import { 
  initializeAuth, 
  getAuth, 
  getReactNativePersistence, 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  updateProfile, 
  type User as FirebaseUser,
  type UserCredential,
  type Auth
} from 'firebase/auth';
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  updateDoc, 
  collection, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  getDocs, 
  arrayUnion, 
  arrayRemove, 
  serverTimestamp, 
  onSnapshot,
  type Timestamp 
} from 'firebase/firestore';
import { 
  getStorage, 
  ref, 
  uploadBytes, 
  getDownloadURL, 
  deleteObject 
} from 'firebase/storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

// --- 1. Types for environment configuration ---
type Extra = {
  EXPO_PUBLIC_API_KEY: string;
  EXPO_PUBLIC_AUTH_DOMAIN: string;
  EXPO_PUBLIC_PROJECT_ID: string;
  EXPO_PUBLIC_STORAGE_BUCKET: string;
  EXPO_PUBLIC_MESSAGING_SENDER_ID: string;
  EXPO_PUBLIC_APP_ID: string;
  EXPO_PUBLIC_MEASUREMENT_ID: string;
};

// --- 2. Application Types ---
export interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  createdAt?: Timestamp;
  profile?: UserProfile;
}

export interface UserProfile {
  firstName: string;
  lastName: string;
  bio?: string;
  avatar?: string;
  savedAddresses?: ShippingAddress[];
}

export interface ShippingAddress {
  id: string;
  fullName: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  phone: string;
  isDefault: boolean;
}

export interface Club {
  id: string;
  name: string;
  description: string;
  category: string;
  coverImage?: string;
  logo?: string;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  members: string[];
  admins: string[];
  isPublic: boolean;
  tags?: string[];
  contactEmail?: string;
  socialLinks?: {
    website?: string;
    instagram?: string;
    twitter?: string;
    discord?: string;
  };
  // Stripe Connect for payouts
  stripeAccountId?: string;
  stripeAccountStatus?: 'pending' | 'active' | 'disabled';
  stripeOnboardingComplete?: boolean;
}

export interface Event {
  id: string;
  title: string;
  description: string;
  clubId: string;
  clubName: string;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  startDate: Timestamp;
  endDate: Timestamp;
  location: string;
  isVirtual: boolean;
  virtualLink?: string;
  maxAttendees?: number;
  attendees: string[];
  waitlist: string[];
  likes: string[];
  coverImage?: string;
  tags?: string[];
  requiresApproval: boolean;
  isPublic: boolean;
  ticketPrice?: number;
  currency?: string;
}

export interface ClubJoinRequest {
  id: string;
  clubId: string;
  userId: string;
  userEmail: string;
  userName: string;
  message?: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: Timestamp;
  respondedAt?: Timestamp;
  respondedBy?: string;
}

export interface FeaturedEvent {
  id: string;
  eventId: string;
  pricePerDay: number;
  startDate: Timestamp;
  endDate: Timestamp;
  totalCost: number;
  status: 'active' | 'scheduled' | 'expired';
  createdBy: string;
  createdAt: Timestamp;
  placement: 'home_feed' | 'category_feed' | 'search_results' | 'all';
  impressions?: number;
  clicks?: number;
}

export interface StoreItemVariant {
  id: string;
  name: string;  // e.g., "Size", "Color"
  options: string[];  // e.g., ["S", "M", "L"] or ["Red", "Blue"]
}

export interface StoreItem {
  id: string;
  clubId: string;
  clubName: string;
  name: string;
  description: string;
  images: string[];  // URLs to Firebase Storage
  price: number;
  taxRate: number;  // percentage
  shippingCost: number | null;  // null if pickup only
  allowPickup: boolean;
  pickupOnly: boolean;
  inventory: number;
  sold: number;
  variants: StoreItemVariant[];
  isActive: boolean;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface StoreOrder {
  id: string;
  itemId: string;
  clubId: string;
  clubName: string;
  userId: string;
  userName: string;
  userEmail: string;
  itemName: string;
  itemImage?: string;
  quantity: number;
  selectedVariants: { [variantName: string]: string };  // e.g., {"Size": "M", "Color": "Blue"}
  price: number;
  tax: number;
  shipping: number;
  totalAmount: number;
  deliveryMethod: 'shipping' | 'pickup';
  shippingAddress?: ShippingAddress;
  status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'picked_up' | 'cancelled';
  paymentIntentId: string;
  stripeSessionId?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  shippedAt?: Timestamp;
  deliveredAt?: Timestamp;
}

// --- 3. Firebase Configuration ---
// Try environment variables first, fall back to Constants
const getFirebaseConfig = () => {
  const extra = Constants.expoConfig?.extra as Extra | undefined;
  
  const config = {
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || extra?.EXPO_PUBLIC_API_KEY,
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || extra?.EXPO_PUBLIC_AUTH_DOMAIN,
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || extra?.EXPO_PUBLIC_PROJECT_ID,
    storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || extra?.EXPO_PUBLIC_STORAGE_BUCKET,
    messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || extra?.EXPO_PUBLIC_MESSAGING_SENDER_ID,
    appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || extra?.EXPO_PUBLIC_APP_ID,
    measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID || extra?.EXPO_PUBLIC_MEASUREMENT_ID,
  };

  // Validate that required config values are present
  if (!config.apiKey) {
    throw new Error('Firebase API Key is missing. Please set EXPO_PUBLIC_FIREBASE_API_KEY in your .env file.');
  }

  return config;
};

const firebaseConfig = getFirebaseConfig();

// --- 4. Initialize Firebase ---
console.log("Firebase config:", firebaseConfig);

// Initialize Firebase App
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// Initialize Auth with proper persistence
let auth: Auth;
try {
  // For React Native, use AsyncStorage persistence
  if (Platform.OS !== 'web') {
    auth = initializeAuth(app, {
      persistence: getReactNativePersistence(ReactNativeAsyncStorage),
    });
  } else {
    auth = getAuth(app);
  }
} catch (error) {
  // If auth is already initialized, get the existing instance
  auth = getAuth(app);
}

// Initialize Firestore and Storage
const db = getFirestore(app);
const storage = getStorage(app);

// --- 5. Authentication Functions ---
export const onAuthStateChange = (callback: (user: User | null) => void) => {
  return onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
    if (firebaseUser) {
      try {
        // Get additional user data from Firestore
        const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
        const userData = userDoc.data();
        
        const user: User = {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
          photoURL: firebaseUser.photoURL,
          ...userData
        };
        callback(user);
      } catch (error) {
        console.error('Error getting user data:', error);
        // Return basic user info if Firestore fails
        const user: User = {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
          photoURL: firebaseUser.photoURL,
        };
        callback(user);
      }
    } else {
      callback(null);
    }
  });
};

export const signIn = async (email: string, password: string) => {
  try {
    const result = await signInWithEmailAndPassword(auth, email, password);
    return { success: true, user: result.user };
  } catch (error: any) {
    console.error('Sign in error:', error);
    return { success: false, error: error.message };
  }
};

export async function signUp(
  email: string,
  password: string,
  profile: UserProfile
): Promise<{ success: boolean; error?: string; user?: FirebaseUser }> {
  try {
    const cred: UserCredential = await createUserWithEmailAndPassword(
      auth,
      email,
      password
    );
    const user = cred.user;

    // Update display name
    await updateProfile(user, {
      displayName: `${profile.firstName} ${profile.lastName}`
    });

    // Create user document in Firestore
    await setDoc(doc(db, "users", user.uid), {
      email,
      profile,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    return { success: true, user };
  } catch (err: any) {
    console.error("Firebase signup error:", err);
    return { success: false, error: err.message };
  }
}

export const logout = async () => {
  try {
    await signOut(auth);
    return { success: true };
  } catch (error: any) {
    console.error('Logout error:', error);
    return { success: false, error: error.message };
  }
};

// --- 6. User Profile Functions ---
export const getUserProfile = async (userId: string): Promise<UserProfile | null> => {
  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    
    if (userDoc.exists()) {
      const data = userDoc.data();
      return data?.profile || null;
    }
    return null;
  } catch (error) {
    console.error('Error getting user profile:', error);
    return null;
  }
};

export const updateUserProfile = async (userId: string, profile: Partial<UserProfile>) => {
  try {
    await updateDoc(doc(db, 'users', userId), {
      profile,
      updatedAt: serverTimestamp()
    });
    return { success: true };
  } catch (error: any) {
    console.error('Error updating user profile:', error);
    return { success: false, error: error.message };
  }
};

// --- 7. Club Functions ---
export const createClub = async (clubData: any) => {
  try {
    const club: any = {
      // Map to database field names for consistency
      clubName: clubData.name,
      description: clubData.description,
      category: clubData.category,
      clubOwner: clubData.createdBy,
      isPublic: clubData.isPublic,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      clubMembers: [clubData.createdBy],
      clubAdmins: [clubData.createdBy]
    };

    // Only add optional fields if they exist
    if (clubData.contactEmail) {
      club.contactEmail = clubData.contactEmail;
    }
    if (clubData.coverImage) {
      club.coverImage = clubData.coverImage;
    }
    if (clubData.logo) {
      club.logo = clubData.logo;
    }
    if (clubData.tags && clubData.tags.length > 0) {
      club.tags = clubData.tags;
    }
    if (clubData.socialLinks && Object.keys(clubData.socialLinks).length > 0) {
      club.socialLinks = clubData.socialLinks;
    }
    
    const docRef = await addDoc(collection(db, 'clubs'), club);
    
    return { success: true, clubId: docRef.id };
  } catch (error: any) {
    console.error('Error creating club:', error);
    return { success: false, error: error.message };
  }
};

export const getClubs = async (userId?: string) => {
  try {
    // Simple query without orderBy to avoid index requirements
    let q;
    
    if (userId) {
      q = query(
        collection(db, 'clubs'),
        where('clubMembers', 'array-contains', userId)
      );
    } else {
      q = query(
        collection(db, 'clubs'),
        where('isPublic', '==', true)
      );
    }
    
    const querySnapshot = await getDocs(q);
    const clubs: Club[] = [];
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      // Map database fields to app fields
      const club: Club = {
        id: doc.id,
        name: data.clubName || data.name,
        description: data.description,
        category: data.category,
        coverImage: data.coverImage,
        logo: data.logo,
        createdBy: data.clubOwner || data.createdBy,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        members: data.clubMembers || data.members || [],
        admins: data.clubAdmins || data.admins || [],
        isPublic: data.isPublic,
        tags: data.tags,
        contactEmail: data.contactEmail,
        socialLinks: data.socialLinks,
        // Stripe Connect fields
        stripeAccountId: data.stripeAccountId,
        stripeAccountStatus: data.stripeAccountStatus,
        stripeOnboardingComplete: data.stripeOnboardingComplete
      };
      clubs.push(club);
    });
    
    // Sort in JavaScript instead of Firestore
    clubs.sort((a, b) => {
      const dateA = a.updatedAt?.toDate ? a.updatedAt.toDate() : new Date(a.updatedAt);
      const dateB = b.updatedAt?.toDate ? b.updatedAt.toDate() : new Date(b.updatedAt);
      return dateB.getTime() - dateA.getTime();
    });
    
    return { success: true, clubs };
  } catch (error: any) {
    console.error('Error getting clubs:', error);
    return { success: false, error: error.message, clubs: [] };
  }
};

export const getClub = async (clubId: string) => {
  try {
    const clubDoc = await getDoc(doc(db, 'clubs', clubId));

    if (clubDoc.exists()) {
      const data = clubDoc.data();
      const club: Club = {
        id: clubDoc.id,
        name: data.clubName || data.name,
        description: data.description,
        category: data.category,
        coverImage: data.coverImage,
        logo: data.logo,
        createdBy: data.clubOwner || data.createdBy,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        members: data.clubMembers || data.members || [],
        admins: data.clubAdmins || data.admins || [],
        isPublic: data.isPublic,
        tags: data.tags,
        contactEmail: data.contactEmail,
        socialLinks: data.socialLinks,
        // Stripe Connect fields
        stripeAccountId: data.stripeAccountId,
        stripeAccountStatus: data.stripeAccountStatus,
        stripeOnboardingComplete: data.stripeOnboardingComplete
      };
      return { success: true, club };
    }
    return { success: false, error: 'Club not found' };
  } catch (error: any) {
    console.error('Error getting club:', error);
    return { success: false, error: error.message };
  }
};

export const joinClub = async (clubId: string, userId: string, userEmail: string, userName: string, message?: string) => {
  try {
    // Check if club requires approval
    const clubResult = await getClub(clubId);
    if (!clubResult.success || !clubResult.club) {
      return { success: false, error: 'Club not found' };
    }
    
    const club = clubResult.club;
    
    // If club is public, add user directly
    if (club.isPublic) {
      await updateDoc(doc(db, 'clubs', clubId), {
        clubMembers: arrayUnion(userId),
        updatedAt: serverTimestamp()
      });
      return { success: true, approved: true };
    } else {
      // Create join request
      await addDoc(collection(db, 'clubJoinRequests'), {
        clubId,
        userId,
        userEmail,
        userName,
        message: message || '',
        status: 'pending',
        createdAt: serverTimestamp()
      });
      return { success: true, approved: false };
    }
  } catch (error: any) {
    console.error('Error joining club:', error);
    return { success: false, error: error.message };
  }
};

export const leaveClub = async (clubId: string, userId: string) => {
  try {
    await updateDoc(doc(db, 'clubs', clubId), {
      clubMembers: arrayRemove(userId),
      clubAdmins: arrayRemove(userId),
      updatedAt: serverTimestamp()
    });
    return { success: true };
  } catch (error: any) {
    console.error('Error leaving club:', error);
    return { success: false, error: error.message };
  }
};

// Update club function
export const updateClub = async (clubId: string, clubData: any) => {
  try {
    const updateData: any = {
      updatedAt: serverTimestamp()
    };

    // Map UI fields to database fields
    if (clubData.name !== undefined) {
      updateData.clubName = clubData.name;
    }
    if (clubData.description !== undefined) {
      updateData.description = clubData.description;
    }
    if (clubData.category !== undefined) {
      updateData.category = clubData.category;
    }
    if (clubData.contactEmail !== undefined) {
      updateData.contactEmail = clubData.contactEmail;
    }
    if (clubData.coverImage !== undefined) {
      updateData.coverImage = clubData.coverImage;
    }
    if (clubData.logo !== undefined) {
      updateData.logo = clubData.logo;
    }
    if (clubData.tags !== undefined) {
      updateData.tags = clubData.tags;
    }
    if (clubData.socialLinks !== undefined) {
      updateData.socialLinks = clubData.socialLinks;
    }
    if (clubData.isPublic !== undefined) {
      updateData.isPublic = clubData.isPublic;
    }
    // Stripe Connect fields
    if (clubData.stripeAccountId !== undefined) {
      updateData.stripeAccountId = clubData.stripeAccountId;
    }
    if (clubData.stripeAccountStatus !== undefined) {
      updateData.stripeAccountStatus = clubData.stripeAccountStatus;
    }
    if (clubData.stripeOnboardingComplete !== undefined) {
      updateData.stripeOnboardingComplete = clubData.stripeOnboardingComplete;
    }

    await updateDoc(doc(db, 'clubs', clubId), updateData);
    return { success: true };
  } catch (error: any) {
    console.error('Error updating club:', error);
    return { success: false, error: error.message };
  }
};

// --- 8. Event Functions ---
export const createEvent = async (eventData: Omit<Event, 'id' | 'createdAt' | 'updatedAt' | 'attendees' | 'waitlist' | 'likes'>) => {
  try {
    const event = {
      ...eventData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      attendees: [],
      waitlist: [],
      likes: []
    };

    const docRef = await addDoc(collection(db, 'events'), event);

    return { success: true, eventId: docRef.id };
  } catch (error: any) {
    console.error('Error creating event:', error);
    return { success: false, error: error.message };
  }
};

// Get all events (public or for a specific club) with optional featured events
export const getAllEvents = async (includeFeatured: boolean = false) => {
  try {
    const q = query(
      collection(db, 'events'),
      where('isPublic', '==', true)
    );

    const querySnapshot = await getDocs(q);
    const events: Event[] = [];

    querySnapshot.forEach((doc) => {
      events.push({ id: doc.id, ...doc.data() } as Event);
    });

    // Sort by start date
    events.sort((a, b) => {
      const dateA = a.startDate?.toDate ? a.startDate.toDate() : new Date(a.startDate);
      const dateB = b.startDate?.toDate ? b.startDate.toDate() : new Date(b.startDate);
      return dateA.getTime() - dateB.getTime();
    });

    // If includeFeatured, get active featured events and merge them
    if (includeFeatured) {
      const featuredResult = await getActiveFeaturedEvents('home_feed');
      if (featuredResult.success && featuredResult.featured.length > 0) {
        // Get the actual event data for featured events
        const featuredEventIds = featuredResult.featured.map(f => f.eventId);
        const featuredEvents = events.filter(e => featuredEventIds.includes(e.id));
        const nonFeaturedEvents = events.filter(e => !featuredEventIds.includes(e.id));

        // Interleave featured events (every 3rd event is featured)
        const mergedEvents: Event[] = [];
        let featuredIndex = 0;

        nonFeaturedEvents.forEach((event, index) => {
          mergedEvents.push(event);
          if ((index + 1) % 3 === 0 && featuredIndex < featuredEvents.length) {
            mergedEvents.push(featuredEvents[featuredIndex]);
            featuredIndex++;
          }
        });

        // Add remaining featured events at the end
        while (featuredIndex < featuredEvents.length) {
          mergedEvents.push(featuredEvents[featuredIndex]);
          featuredIndex++;
        }

        return { success: true, events: mergedEvents };
      }
    }

    return { success: true, events };
  } catch (error: any) {
    console.error('Error getting all events:', error);
    return { success: false, error: error.message, events: [] };
  }
};

export const getEvents = async (clubId?: string) => {
  try {
    // Simple query without orderBy to avoid index requirements
    let q;
    
    if (clubId) {
      q = query(
        collection(db, 'events'),
        where('clubId', '==', clubId)
      );
    } else {
      q = query(
        collection(db, 'events'),
        where('isPublic', '==', true)
      );
    }
    
    const querySnapshot = await getDocs(q);
    const events: Event[] = [];
    
    querySnapshot.forEach((doc) => {
      events.push({ id: doc.id, ...doc.data() } as Event);
    });
    
    // Sort in JavaScript instead of Firestore
    events.sort((a, b) => {
      const dateA = a.startDate?.toDate ? a.startDate.toDate() : new Date(a.startDate);
      const dateB = b.startDate?.toDate ? b.startDate.toDate() : new Date(b.startDate);
      return dateA.getTime() - dateB.getTime();
    });
    
    return { success: true, events };
  } catch (error: any) {
    console.error('Error getting events:', error);
    return { success: false, error: error.message, events: [] };
  }
};

export const joinEvent = async (eventId: string, userId: string) => {
  try {
    const eventDoc = await getDoc(doc(db, 'events', eventId));
    
    if (!eventDoc.exists()) {
      return { success: false, error: 'Event not found' };
    }
    
    const event = eventDoc.data() as Event;
    
    // Check if user is already attending
    if (event.attendees.includes(userId)) {
      return { success: false, error: 'Already attending this event' };
    }
    
    // Check capacity
    if (event.maxAttendees && event.attendees.length >= event.maxAttendees) {
      // Add to waitlist
      await updateDoc(doc(db, 'events', eventId), {
        waitlist: arrayUnion(userId),
        updatedAt: serverTimestamp()
      });
      return { success: true, waitlisted: true };
    } else {
      // Add to attendees
      await updateDoc(doc(db, 'events', eventId), {
        attendees: arrayUnion(userId),
        updatedAt: serverTimestamp()
      });
      return { success: true, waitlisted: false };
    }
  } catch (error: any) {
    console.error('Error joining event:', error);
    return { success: false, error: error.message };
  }
};

export const leaveEvent = async (eventId: string, userId: string) => {
  try {
    await updateDoc(doc(db, 'events', eventId), {
      attendees: arrayRemove(userId),
      waitlist: arrayRemove(userId),
      updatedAt: serverTimestamp()
    });
    return { success: true };
  } catch (error: any) {
    console.error('Error leaving event:', error);
    return { success: false, error: error.message };
  }
};

export const getEventById = async (eventId: string) => {
  try {
    const eventDoc = await getDoc(doc(db, 'events', eventId));

    if (!eventDoc.exists()) {
      return { success: false, error: 'Event not found' };
    }

    const data = eventDoc.data();
    const event: Event = {
      id: eventDoc.id,
      ...data
    } as Event;

    return { success: true, event };
  } catch (error: any) {
    console.error('Error getting event:', error);
    return { success: false, error: error.message };
  }
};

export const bookmarkEvent = async (eventId: string, userId: string) => {
  try {
    const userDoc = doc(db, 'users', userId);
    await updateDoc(userDoc, {
      bookmarkedEvents: arrayUnion(eventId)
    });
    return { success: true };
  } catch (error: any) {
    console.error('Error bookmarking event:', error);
    return { success: false, error: error.message };
  }
};

export const unbookmarkEvent = async (eventId: string, userId: string) => {
  try {
    const userDoc = doc(db, 'users', userId);
    await updateDoc(userDoc, {
      bookmarkedEvents: arrayRemove(eventId)
    });
    return { success: true };
  } catch (error: any) {
    console.error('Error unbookmarking event:', error);
    return { success: false, error: error.message };
  }
};

export const getUserBookmarks = async (userId: string) => {
  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (!userDoc.exists()) {
      return { success: false, error: 'User not found', bookmarks: [] };
    }

    const data = userDoc.data();
    const bookmarks = data.bookmarkedEvents || [];
    return { success: true, bookmarks };
  } catch (error: any) {
    console.error('Error getting bookmarks:', error);
    return { success: false, error: error.message, bookmarks: [] };
  }
};
//--------------------Handldle Like----------------------//
export const likeEvent = async (eventId: string, userId: string) => {
  try {
    // Add to user's liked events
    const userDoc = doc(db, 'users', userId);
    await updateDoc(userDoc, {
      likedEvents: arrayUnion(eventId)
    });

    // Add user to event's likes array
    const eventDoc = doc(db, 'events', eventId);
    await updateDoc(eventDoc, {
      likes: arrayUnion(userId),
      updatedAt: serverTimestamp()
    });

    return { success: true };
  } catch (error: any) {
    console.error('Error liking event:', error);
    return { success: false, error: error.message };
  }
};

export const unlikeEvent = async (eventId: string, userId: string) => {
  try {
    // Remove from user's liked events
    const userDoc = doc(db, 'users', userId);
    await updateDoc(userDoc, {
      likedEvents: arrayRemove(eventId)
    });

    // Remove user from event's likes array
    const eventDoc = doc(db, 'events', eventId);
    await updateDoc(eventDoc, {
      likes: arrayRemove(userId),
      updatedAt: serverTimestamp()
    });

    return { success: true };
  } catch (error: any) {
    console.error('Error unliking event:', error);
    return { success: false, error: error.message };
  }
};

export const getUserLikes = async (userId: string) => {
  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (!userDoc.exists()) {
      return { success: false, error: 'User not found', likes: [] };
    }

    const data = userDoc.data();
    const likes = data.likedEvents || [];
    return { success: true, likes };
  } catch (error: any) {
    console.error('Error getting likes:', error);
    return { success: false, error: error.message, likes: [] };
  }
};

// --- 9. Storage Functions ---
// Test storage configuration
export const testStorageConnection = async (): Promise<{ success: boolean; error?: string; details?: any }> => {
  try {
    console.log('=== STORAGE DIAGNOSTIC ===');
    console.log('Firebase app name:', app.name);
    console.log('Project ID:', app.options.projectId);
    console.log('Storage bucket from config:', app.options.storageBucket);
    console.log('Auth domain:', app.options.authDomain);
    console.log('Storage instance bucket:', storage.app.options.storageBucket);
    console.log('Storage._bucket:', storage._bucket);
    
    // Check if storage bucket is configured
    if (!app.options.storageBucket) {
      return {
        success: false,
        error: 'No storage bucket configured in Firebase config',
        details: { configMissing: true }
      };
    }
    
    // Try to create a simple reference (this should not fail even if storage is disabled)
    console.log('Creating storage reference...');
    const testRef = ref(storage, 'diagnostic-test.txt');
    console.log('Reference created:', testRef.toString());
    console.log('Reference bucket:', testRef.bucket);
    console.log('Reference fullPath:', testRef.fullPath);
    
    // Try a simple upload using proper React Native blob creation
    console.log('Attempting upload...');
    
    // Create a simple text blob using fetch (React Native compatible)
    const testString = 'Hello from Firebase Storage test!';
    const response = await fetch(`data:text/plain;base64,${btoa(testString)}`);
    const blob = await response.blob();
    
    console.log('Blob created successfully, size:', blob.size, 'type:', blob.type);
    
    const uploadResult = await uploadBytes(testRef, blob);
    console.log('Upload successful! Metadata:', {
      name: uploadResult.metadata.name,
      bucket: uploadResult.metadata.bucket,
      fullPath: uploadResult.metadata.fullPath,
      size: uploadResult.metadata.size
    });
    
    // Try to get download URL
    const downloadURL = await getDownloadURL(testRef);
    console.log('Download URL obtained successfully');
    
    // Clean up test file
    try {
      await deleteObject(testRef);
      console.log('Test file cleaned up');
    } catch (deleteError) {
      console.log('Could not delete test file (this is normal):', deleteError);
    }
    
    return { success: true };
  } catch (error: any) {
    console.error('=== STORAGE ERROR ===');
    console.error('Error code:', error.code);
    console.error('Error message:', error.message);
    console.error('Error name:', error.name);
    console.error('Full error:', error);
    
    return { 
      success: false, 
      error: `${error.code || 'unknown'}: ${error.message}`,
      details: {
        errorCode: error.code,
        errorMessage: error.message,
        hasServerResponse: !!error.serverResponse,
        errorName: error.name
      }
    };
  }
};

export const uploadImage = async (uri: string, path: string): Promise<string | null> => {
  try {
    console.log('Starting image upload:', { uri, path });
    console.log('Storage bucket:', storage.app.options.storageBucket);
    
    // Convert URI to blob using React Native compatible method
    console.log('Fetching image from URI...');
    const response = await fetch(uri);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
    }
    
    const blob = await response.blob();
    console.log('Blob created successfully:', {
      size: blob.size, 
      type: blob.type,
      sizeInMB: (blob.size / (1024 * 1024)).toFixed(2)
    });
    
    // Create a reference to the file in Firebase Storage
    const storageRef = ref(storage, path);
    console.log('Storage reference created:', path);
    
    // Upload the file with metadata
    const metadata = {
      contentType: blob.type || 'image/jpeg',
      cacheControl: 'public,max-age=3600',
    };
    
    console.log('Starting upload with metadata:', metadata);
    const uploadResult = await uploadBytes(storageRef, blob, metadata);
    console.log('Upload completed successfully:', {
      name: uploadResult.metadata.name,
      bucket: uploadResult.metadata.bucket,
      size: uploadResult.metadata.size,
      contentType: uploadResult.metadata.contentType
    });
    
    // Get the download URL
    const downloadURL = await getDownloadURL(storageRef);
    console.log('Download URL obtained successfully');
    
    return downloadURL;
  } catch (error: any) {
    console.error('Error uploading image:', error);
    console.error('Error details:', {
      code: error.code,
      message: error.message,
      serverResponse: error.serverResponse,
      customData: error.customData,
      name: error.name,
      stack: error.stack?.substring(0, 200) + '...' // Truncate stack for readability
    });
    return null;
  }
};

export const deleteImage = async (path: string) => {
  try {
    const storageRef = ref(storage, path);
    await deleteObject(storageRef);
    return { success: true };
  } catch (error: any) {
    console.error('Error deleting image:', error);
    return { success: false, error: error.message };
  }
};

// --- 10. Real-time Listeners ---
export const subscribeToClubs = (userId: string, callback: (clubs: Club[]) => void) => {
  try {
    const q = query(
      collection(db, 'clubs'),
      where('clubMembers', 'array-contains', userId)
    );
    
    // Use onSnapshot for real-time updates if possible
    return onSnapshot(q, (querySnapshot) => {
      const clubs: Club[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        // Map database fields to app fields
        const club: Club = {
          id: doc.id,
          name: data.clubName || data.name,
          description: data.description,
          category: data.category,
          coverImage: data.coverImage,
          logo: data.logo,
          createdBy: data.clubOwner || data.createdBy,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
          members: data.clubMembers || data.members || [],
          admins: data.clubAdmins || data.admins || [],
          isPublic: data.isPublic,
          tags: data.tags,
          contactEmail: data.contactEmail,
          socialLinks: data.socialLinks,
          // Stripe Connect fields
          stripeAccountId: data.stripeAccountId,
          stripeAccountStatus: data.stripeAccountStatus,
          stripeOnboardingComplete: data.stripeOnboardingComplete
        };
        clubs.push(club);
      });
      
      // Sort in JavaScript
      clubs.sort((a, b) => {
        const dateA = a.updatedAt?.toDate ? a.updatedAt.toDate() : new Date(a.updatedAt);
        const dateB = b.updatedAt?.toDate ? b.updatedAt.toDate() : new Date(b.updatedAt);
        return dateB.getTime() - dateA.getTime();
      });
      
      callback(clubs);
    }, (error) => {
      console.error('Error in clubs subscription:', error);
      // Fall back to polling approach
      const pollClubs = async () => {
        try {
          const result = await getClubs(userId);
          if (result.success) {
            callback(result.clubs);
          }
        } catch (error) {
          console.error('Error in clubs polling:', error);
        }
      };
      
      // Initial load
      pollClubs();
      
      // Poll every 30 seconds
      const interval = setInterval(pollClubs, 30000);
      
      // Return cleanup function
      return () => clearInterval(interval);
    });
  } catch (error) {
    console.error('Error setting up clubs subscription:', error);
    return () => {};
  }
};

export const subscribeToEvents = (clubId: string, callback: (events: Event[]) => void) => {
  try {
    const q = query(
      collection(db, 'events'),
      where('clubId', '==', clubId)
    );

    // Use onSnapshot for real-time updates if possible
    return onSnapshot(q, (querySnapshot) => {
      const events: Event[] = [];
      querySnapshot.forEach((doc) => {
        events.push({ id: doc.id, ...doc.data() } as Event);
      });

      // Sort in JavaScript
      events.sort((a, b) => {
        const dateA = a.startDate?.toDate ? a.startDate.toDate() : new Date(a.startDate);
        const dateB = b.startDate?.toDate ? b.startDate.toDate() : new Date(b.startDate);
        return dateA.getTime() - dateB.getTime();
      });

      callback(events);
    }, (error) => {
      console.error('Error in events subscription:', error);
      // Fall back to polling approach
      const pollEvents = async () => {
        try {
          const result = await getEvents(clubId);
          if (result.success) {
            callback(result.events);
          }
        } catch (error) {
          console.error('Error in events polling:', error);
        }
      };

      // Initial load
      pollEvents();

      // Poll every 30 seconds
      const interval = setInterval(pollEvents, 30000);

      // Return cleanup function
      return () => clearInterval(interval);
    });
  } catch (error) {
    console.error('Error setting up events subscription:', error);
    return () => {};
  }
};

// --- Featured Event Functions ---
export const createFeaturedEvent = async (featuredData: Omit<FeaturedEvent, 'id' | 'createdAt' | 'status' | 'totalCost'>) => {
  try {
    // Calculate total cost based on date range
    const startDate = featuredData.startDate.toDate ? featuredData.startDate.toDate() : new Date(featuredData.startDate);
    const endDate = featuredData.endDate.toDate ? featuredData.endDate.toDate() : new Date(featuredData.endDate);
    const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const totalCost = days * featuredData.pricePerDay;

    // Determine status based on dates
    const now = new Date();
    let status: 'active' | 'scheduled' | 'expired';
    if (now >= startDate && now <= endDate) {
      status = 'active';
    } else if (now < startDate) {
      status = 'scheduled';
    } else {
      status = 'expired';
    }

    const featured = {
      ...featuredData,
      totalCost,
      status,
      createdAt: serverTimestamp(),
      impressions: 0,
      clicks: 0
    };

    const docRef = await addDoc(collection(db, 'featuredEvents'), featured);

    return { success: true, featuredId: docRef.id };
  } catch (error: any) {
    console.error('Error creating featured event:', error);
    return { success: false, error: error.message };
  }
};

export const getActiveFeaturedEvents = async (placement?: 'home_feed' | 'category_feed' | 'search_results' | 'all') => {
  try {
    const now = new Date();
    let q;

    if (placement && placement !== 'all') {
      q = query(
        collection(db, 'featuredEvents'),
        where('status', '==', 'active'),
        where('placement', 'in', [placement, 'all'])
      );
    } else {
      q = query(
        collection(db, 'featuredEvents'),
        where('status', '==', 'active')
      );
    }

    const querySnapshot = await getDocs(q);
    const featured: FeaturedEvent[] = [];

    querySnapshot.forEach((doc) => {
      const data = { id: doc.id, ...doc.data() } as FeaturedEvent;
      // Double-check dates in case status is stale
      const endDate = data.endDate.toDate ? data.endDate.toDate() : new Date(data.endDate);
      if (endDate >= now) {
        featured.push(data);
      }
    });

    return { success: true, featured };
  } catch (error: any) {
    console.error('Error getting featured events:', error);
    return { success: false, error: error.message, featured: [] };
  }
};

export const trackFeaturedImpression = async (featuredId: string) => {
  try {
    const featuredRef = doc(db, 'featuredEvents', featuredId);
    const featuredDoc = await getDoc(featuredRef);

    if (featuredDoc.exists()) {
      const currentImpressions = featuredDoc.data().impressions || 0;
      await updateDoc(featuredRef, {
        impressions: currentImpressions + 1
      });
    }

    return { success: true };
  } catch (error: any) {
    console.error('Error tracking impression:', error);
    return { success: false, error: error.message };
  }
};

export const trackFeaturedClick = async (featuredId: string) => {
  try {
    const featuredRef = doc(db, 'featuredEvents', featuredId);
    const featuredDoc = await getDoc(featuredRef);

    if (featuredDoc.exists()) {
      const currentClicks = featuredDoc.data().clicks || 0;
      await updateDoc(featuredRef, {
        clicks: currentClicks + 1
      });
    }

    return { success: true };
  } catch (error: any) {
    console.error('Error tracking click:', error);
    return { success: false, error: error.message };
  }
};

// --- 11. RallyStore Functions ---

/**
 * Create a new store item
 */
export const createStoreItem = async (item: Omit<StoreItem, 'id' | 'createdAt' | 'updatedAt' | 'sold'>) => {
  try {
    const itemRef = collection(db, 'storeItems');
    const docRef = await addDoc(itemRef, {
      ...item,
      sold: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    return { success: true, itemId: docRef.id };
  } catch (error: any) {
    console.error('Error creating store item:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Update a store item
 */
export const updateStoreItem = async (itemId: string, updates: Partial<StoreItem>) => {
  try {
    const itemRef = doc(db, 'storeItems', itemId);
    await updateDoc(itemRef, {
      ...updates,
      updatedAt: serverTimestamp()
    });

    return { success: true };
  } catch (error: any) {
    console.error('Error updating store item:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Get a single store item
 */
export const getStoreItem = async (itemId: string) => {
  try {
    const itemRef = doc(db, 'storeItems', itemId);
    const itemDoc = await getDoc(itemRef);

    if (!itemDoc.exists()) {
      return { success: false, error: 'Item not found' };
    }

    const item = { id: itemDoc.id, ...itemDoc.data() } as StoreItem;
    return { success: true, item };
  } catch (error: any) {
    console.error('Error getting store item:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Get all store items for a club
 */
export const getClubStoreItems = async (clubId: string, activeOnly: boolean = false) => {
  try {
    const itemsRef = collection(db, 'storeItems');
    let q = query(itemsRef, where('clubId', '==', clubId), orderBy('createdAt', 'desc'));

    if (activeOnly) {
      q = query(itemsRef, where('clubId', '==', clubId), where('isActive', '==', true), orderBy('createdAt', 'desc'));
    }

    const querySnapshot = await getDocs(q);
    const items: StoreItem[] = [];

    querySnapshot.forEach((doc) => {
      items.push({ id: doc.id, ...doc.data() } as StoreItem);
    });

    return { success: true, items };
  } catch (error: any) {
    console.error('Error getting club store items:', error);
    return { success: false, error: error.message, items: [] };
  }
};

/**
 * Get all active store items (for global store view)
 */
export const getAllStoreItems = async () => {
  try {
    const itemsRef = collection(db, 'storeItems');
    const q = query(itemsRef, where('isActive', '==', true), orderBy('createdAt', 'desc'));

    const querySnapshot = await getDocs(q);
    const items: StoreItem[] = [];

    querySnapshot.forEach((doc) => {
      items.push({ id: doc.id, ...doc.data() } as StoreItem);
    });

    return { success: true, items };
  } catch (error: any) {
    console.error('Error getting all store items:', error);
    return { success: false, error: error.message, items: [] };
  }
};

/**
 * Delete a store item
 */
export const deleteStoreItem = async (itemId: string) => {
  try {
    const itemRef = doc(db, 'storeItems', itemId);
    const itemDoc = await getDoc(itemRef);

    if (!itemDoc.exists()) {
      return { success: false, error: 'Item not found' };
    }

    const itemData = itemDoc.data() as StoreItem;

    // Delete images from storage
    if (itemData.images && itemData.images.length > 0) {
      for (const imageUrl of itemData.images) {
        try {
          const imageRef = ref(storage, imageUrl);
          await deleteObject(imageRef);
        } catch (error) {
          console.warn('Failed to delete image:', imageUrl);
        }
      }
    }

    // Delete the item document
    await updateDoc(itemRef, { isActive: false });

    return { success: true };
  } catch (error: any) {
    console.error('Error deleting store item:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Create a store order
 */
export const createStoreOrder = async (order: Omit<StoreOrder, 'id' | 'createdAt' | 'updatedAt'>) => {
  try {
    const orderRef = collection(db, 'storeOrders');
    const docRef = await addDoc(orderRef, {
      ...order,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    // Update item sold count
    const itemRef = doc(db, 'storeItems', order.itemId);
    const itemDoc = await getDoc(itemRef);

    if (itemDoc.exists()) {
      const currentSold = itemDoc.data().sold || 0;
      await updateDoc(itemRef, {
        sold: currentSold + order.quantity
      });
    }

    return { success: true, orderId: docRef.id };
  } catch (error: any) {
    console.error('Error creating store order:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Update store order status
 */
export const updateStoreOrderStatus = async (
  orderId: string,
  status: StoreOrder['status'],
  additionalUpdates?: Partial<StoreOrder>
) => {
  try {
    const orderRef = doc(db, 'storeOrders', orderId);
    const updates: any = {
      status,
      updatedAt: serverTimestamp(),
      ...additionalUpdates
    };

    if (status === 'shipped') {
      updates.shippedAt = serverTimestamp();
    } else if (status === 'delivered' || status === 'picked_up') {
      updates.deliveredAt = serverTimestamp();
    }

    await updateDoc(orderRef, updates);

    return { success: true };
  } catch (error: any) {
    console.error('Error updating order status:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Get user's store orders
 */
export const getUserStoreOrders = async (userId: string) => {
  try {
    const ordersRef = collection(db, 'storeOrders');
    const q = query(ordersRef, where('userId', '==', userId), orderBy('createdAt', 'desc'));

    const querySnapshot = await getDocs(q);
    const orders: StoreOrder[] = [];

    querySnapshot.forEach((doc) => {
      orders.push({ id: doc.id, ...doc.data() } as StoreOrder);
    });

    return { success: true, orders };
  } catch (error: any) {
    console.error('Error getting user orders:', error);
    return { success: false, error: error.message, orders: [] };
  }
};

/**
 * Get club's store orders
 */
export const getClubStoreOrders = async (clubId: string) => {
  try {
    const ordersRef = collection(db, 'storeOrders');
    const q = query(ordersRef, where('clubId', '==', clubId), orderBy('createdAt', 'desc'));

    const querySnapshot = await getDocs(q);
    const orders: StoreOrder[] = [];

    querySnapshot.forEach((doc) => {
      orders.push({ id: doc.id, ...doc.data() } as StoreOrder);
    });

    return { success: true, orders };
  } catch (error: any) {
    console.error('Error getting club orders:', error);
    return { success: false, error: error.message, orders: [] };
  }
};

/**
 * Save shipping address to user profile
 */
export const saveShippingAddress = async (userId: string, address: Omit<ShippingAddress, 'id'>) => {
  try {
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);

    if (!userDoc.exists()) {
      return { success: false, error: 'User not found' };
    }

    const userData = userDoc.data();
    const savedAddresses = userData.savedAddresses || [];

    // Generate new address ID
    const newAddress: ShippingAddress = {
      ...address,
      id: `addr_${Date.now()}`
    };

    // If this is the first address or marked as default, make it default
    if (savedAddresses.length === 0 || address.isDefault) {
      savedAddresses.forEach((addr: ShippingAddress) => {
        addr.isDefault = false;
      });
      newAddress.isDefault = true;
    }

    savedAddresses.push(newAddress);

    await updateDoc(userRef, {
      savedAddresses
    });

    return { success: true, addressId: newAddress.id };
  } catch (error: any) {
    console.error('Error saving shipping address:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Update shipping address
 */
export const updateShippingAddress = async (userId: string, addressId: string, updates: Partial<ShippingAddress>) => {
  try {
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);

    if (!userDoc.exists()) {
      return { success: false, error: 'User not found' };
    }

    const userData = userDoc.data();
    const savedAddresses = userData.savedAddresses || [];

    const addressIndex = savedAddresses.findIndex((addr: ShippingAddress) => addr.id === addressId);

    if (addressIndex === -1) {
      return { success: false, error: 'Address not found' };
    }

    // If setting as default, unset all others
    if (updates.isDefault) {
      savedAddresses.forEach((addr: ShippingAddress) => {
        addr.isDefault = false;
      });
    }

    savedAddresses[addressIndex] = { ...savedAddresses[addressIndex], ...updates };

    await updateDoc(userRef, {
      savedAddresses
    });

    return { success: true };
  } catch (error: any) {
    console.error('Error updating shipping address:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Delete shipping address
 */
export const deleteShippingAddress = async (userId: string, addressId: string) => {
  try {
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);

    if (!userDoc.exists()) {
      return { success: false, error: 'User not found' };
    }

    const userData = userDoc.data();
    const savedAddresses = userData.savedAddresses || [];

    const filteredAddresses = savedAddresses.filter((addr: ShippingAddress) => addr.id !== addressId);

    // If we deleted the default address, make the first one default
    if (filteredAddresses.length > 0) {
      const hadDefault = savedAddresses.some((addr: ShippingAddress) => addr.id === addressId && addr.isDefault);
      if (hadDefault) {
        filteredAddresses[0].isDefault = true;
      }
    }

    await updateDoc(userRef, {
      savedAddresses: filteredAddresses
    });

    return { success: true };
  } catch (error: any) {
    console.error('Error deleting shipping address:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Get user's saved shipping addresses
 */
export const getUserAddresses = async (userId: string) => {
  try {
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);

    if (!userDoc.exists()) {
      return { success: true, addresses: [] };
    }

    const userData = userDoc.data();
    const addresses = userData.savedAddresses || [];

    return { success: true, addresses };
  } catch (error: any) {
    console.error('Error getting user addresses:', error);
    return { success: false, error: error.message, addresses: [] };
  }
};

// --- 12. Legacy Support - Backward compatibility exports ---
// onAuthStateChange is already exported above, no need to redeclare

// --- 13. Export Firebase instances ---
export { auth, db, storage, app };

// --- 14. Export all types for convenience ---
export type {
  User,
  UserProfile,
  Club,
  Event,
  ClubJoinRequest,
  FeaturedEvent,
  StoreItem,
  StoreItemVariant,
  StoreOrder,
  ShippingAddress,
  Timestamp,
  FirebaseUser
};
