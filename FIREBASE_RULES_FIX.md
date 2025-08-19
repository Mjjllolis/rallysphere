# 🔥 URGENT: Firebase Security Rules Fix

You're getting a **Firebase permissions error** because your Firestore security rules are blocking club creation. Here are the correct rules you need to apply:

## Firestore Security Rules

Go to **Firebase Console → Firestore Database → Rules** and replace your current rules with these:

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

## Firebase Storage Rules

Also make sure your **Storage Rules** are correct. Go to **Firebase Console → Storage → Rules**:

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

## Steps to Fix:

1. **Go to Firebase Console**: https://console.firebase.google.com
2. **Select your project**: rally-sphere
3. **Navigate to Firestore Database → Rules**
4. **Replace the current rules** with the Firestore rules above
5. **Click "Publish"**
6. **Navigate to Storage → Rules**
7. **Replace the current rules** with the Storage rules above
8. **Click "Publish"**

## What the Fix Does:

- ✅ **Allows club creation**: Users can create clubs where they are the owner
- ✅ **Proper permissions**: Only owners/admins can update clubs
- ✅ **Image uploads**: Authenticated users can upload club images
- ✅ **Security**: Prevents unauthorized access while allowing legitimate operations

After applying these rules, try creating a club again. The permissions error should be resolved!

## Test After Applying Rules:

1. Make sure you're logged in to your app
2. Navigate to `/club/create`
3. Fill out the form
4. Add some images
5. Click "Create Club"

The club should be created successfully without any permissions errors.
