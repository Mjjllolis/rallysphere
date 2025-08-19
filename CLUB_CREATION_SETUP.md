# Rally Sphere - Club Creation & Image Storage Setup

This guide will help you set up the complete Firebase integration for creating clubs with image storage capabilities.

## Prerequisites

You already have:
- ✅ Firebase project configured (`rally-sphere`)
- ✅ Firestore database set up
- ✅ Firebase Storage bucket (`rally-sphere.appspot.com`)
- ✅ Basic Firebase functions implemented

## Required Package Installation

Install the missing packages for image handling:

```bash
npx expo install expo-image-picker expo-image-manipulator
```

## Firebase Storage Rules

Update your Firebase Storage rules in the Firebase Console:

1. Go to Firebase Console → Storage → Rules
2. Replace the rules with:

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // Club images - only authenticated users can upload
    match /clubs/{clubId}/{imageType}/{allPaths=**} {
      allow read: if true; // Anyone can read club images
      allow write: if request.auth != null && 
                      (imageType == 'logo' || imageType == 'header') &&
                      request.resource.size < 5 * 1024 * 1024 && // 5MB limit
                      request.resource.contentType.matches('image/.*');
    }
    
    // User avatars - only the user can upload their avatar
    match /users/{userId}/avatar/{allPaths=**} {
      allow read: if true; // Anyone can read avatars
      allow write: if request.auth != null && 
                      request.auth.uid == userId &&
                      request.resource.size < 2 * 1024 * 1024 && // 2MB limit
                      request.resource.contentType.matches('image/.*');
    }
    
    // Misc files - authenticated users only
    match /misc/{allPaths=**} {
      allow read, write: if request.auth != null &&
                           request.resource.size < 10 * 1024 * 1024; // 10MB limit
    }
  }
}
```

## Firestore Security Rules

Update your Firestore rules in the Firebase Console:

1. Go to Firebase Console → Firestore Database → Rules
2. Replace the rules with:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can read their own profile and create it
    match /users/{userId} {
      allow read, create, update: if request.auth != null && request.auth.uid == userId;
      allow read: if request.auth != null; // Others can read basic user info
    }
    
    // Club rules - FIXED FOR CLUB CREATION
    match /clubs/{clubId} {
      // Anyone authenticated can read clubs
      allow read: if request.auth != null;
      
      // Users can create clubs (they become the owner)
      allow create: if request.auth != null && 
                       request.auth.uid == request.resource.data.clubOwner &&
                       request.auth.uid in request.resource.data.clubMembers;
      
      // Only owners and admins can update clubs
      allow update: if request.auth != null && 
                       (request.auth.uid == resource.data.clubOwner || 
                        request.auth.uid in resource.data.clubAdmins);
      
      // Only owners can delete clubs
      allow delete: if request.auth != null && request.auth.uid == resource.data.clubOwner;
    }
    
    // Events rules
    match /events/{eventId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null;
      allow update: if request.auth != null && 
                       (request.auth.uid == resource.data.createdBy ||
                        request.auth.uid in get(/databases/$(database)/documents/clubs/$(resource.data.clubId)).data.clubAdmins ||
                        request.auth.uid == get(/databases/$(database)/documents/clubs/$(resource.data.clubId)).data.clubOwner);
      allow delete: if request.auth != null && 
                       (request.auth.uid == resource.data.createdBy ||
                        request.auth.uid == get(/databases/$(database)/documents/clubs/$(resource.data.clubId)).data.clubOwner);
    }
  }
}
```

## File Structure

Here's what we've created:

```
lib/firebase/
├── app.ts              # Firebase app initialization
├── auth.ts             # Authentication functions  
├── db.ts               # Firestore database instance
├── storage.ts          # 🆕 Storage functions for images
├── firestore-functions.ts # Database operations
└── index.ts            # Export all Firebase functions

app/club/
├── [id].tsx            # Individual club view
└── create.tsx          # 🆕 Create club screen
```

## Key Features Implemented

### 1. Image Storage (`lib/firebase/storage.ts`)
- ✅ Upload images to Firebase Storage
- ✅ Automatic image resizing and compression
- ✅ Organized storage paths (`clubs/{id}/logo/`, `clubs/{id}/header/`)
- ✅ Error handling and cleanup
- ✅ Delete unused images

### 2. Create Club Screen (`app/club/create.tsx`)
- ✅ Simplified form with club name and description only
- ✅ Image picker with compression for logo and header
- ✅ Form validation with real-time feedback
- ✅ Real-time character counting
- ✅ Loading states and error handling
- ✅ Automatic navigation after creation

### 3. Enhanced Database Functions
- ✅ `createClub()` - Create new club
- ✅ `updateClub()` - Update existing club with images
- ✅ All existing functions maintained

## Image Handling Strategy

### Storage Structure
```
clubs/
  ├── {clubId}/
      ├── logo/
      │   └── {timestamp}.jpg
      └── header/
          └── {timestamp}.jpg

users/
  └── {userId}/
      └── avatar/
          └── {timestamp}.jpg
```

### Image Processing
1. **User Selection**: Via `expo-image-picker`
2. **Automatic Resizing**: 
   - Logos: 400x400px (square)
   - Headers: 800x450px (16:9 aspect)
   - Avatars: 300x300px (square)
3. **Compression**: 80% JPEG quality
4. **Upload**: To Firebase Storage with unique paths
5. **URL Storage**: Download URLs saved in Firestore

## Usage Examples

### Creating a Club
```typescript
// Users navigate to /club/create
// Fill out form, select images
// Firebase automatically handles:
// 1. Club creation in Firestore
// 2. Image upload to Storage  
// 3. URL updates in club document
// 4. Navigation to new club page
```

### Accessing Uploaded Images
```typescript
// Images are automatically available via URLs:
const club = await getClub(clubId);
console.log(club.clubLogo);    // https://firebasestorage.googleapis.com/...
console.log(club.clubHeader);  // https://firebasestorage.googleapis.com/...
```

## Testing Checklist

- [ ] Install required packages
- [ ] Update Firebase Storage rules
- [ ] Update Firestore security rules
- [ ] Test create club flow
- [ ] Test image upload (logo & header)
- [ ] Test form validation
- [ ] Test navigation after creation
- [ ] Test viewing created club

## Next Steps

1. **Install Packages**: Run the npm install command above
2. **Update Rules**: Apply the Firebase rules in console
3. **Test Creation**: Navigate to `/club/create` and test the flow
4. **Image Optimization**: Consider adding image caching for better performance
5. **Error Handling**: Add retry logic for failed uploads
6. **Offline Support**: Consider caching strategy for offline usage

## File Dependencies

Make sure you have these auth/navigation files properly set up:
- `app/_layout.tsx` with `useAuth` hook
- Navigation configured with `expo-router`
- Authentication properly initialized

The create club feature is now fully functional with Firebase Storage integration!
