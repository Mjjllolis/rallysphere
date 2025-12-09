# Test Data Seeding Scripts

## Overview

This directory contains scripts to populate your Firebase database with test data for development and testing purposes.

## Prerequisites

1. **Service Account Key**: You need a Firebase service account key file
   - Go to Firebase Console > Project Settings > Service Accounts
   - Click "Generate New Private Key"
   - Save the downloaded JSON file as `service-account-key.json` in the root of the project
   - **IMPORTANT**: Add this file to `.gitignore` to prevent committing credentials

2. **Firebase Admin SDK**: Install if not already installed
   ```bash
   npm install firebase-admin --save-dev
   ```

## Running the Seed Script

### Method 1: Using Node 22 (via nvm)

```bash
cd /Users/mishawnlolis/Documents/DevRepo/rallysphere
source ~/.nvm/nvm.sh
nvm use 22
node scripts/seedTestData.js
```

### Method 2: Direct execution

```bash
cd /Users/mishawnlolis/Documents/DevRepo/rallysphere
node scripts/seedTestData.js
```

## What Gets Created

The seed script creates:

### 📍 Clubs (3 clubs)
- **Rally Racing Club** - Premier rally racing club in San Francisco
- **Mountain Bikers United** - Mountain biking club in Boulder
- **Urban Running Crew** - Running group in New York

### 📅 Events (3 events)
- **Spring Rally Championship 2025** - Competition event ($35/ticket)
- **Mountain Trail Ride** - Guided trail ride ($25/ticket)
- **City Marathon 2025** - Full/half marathon ($85/ticket)

### 🛍️ Store Items (5 items)
- **Rally Racing Jacket** - $129.99 (with size and color variants)
- **Team T-Shirt** - $29.99 (with size variants)
- **Pro Racing Helmet** - $249.99 (with size variants)
- **Rally Gloves** - $59.99 (with size variants)
- **Team Water Bottle** - $24.99 (no variants)

## Features

- All items include multiple high-quality sample images
- Store items have realistic inventory and pricing
- Events have future dates and ticket pricing
- Clubs are linked to events and store items
- Proper Firebase timestamps and field values

## Clearing Data

To clear test data before reseeding:

```bash
# Use Firebase Console
# Go to Firestore Database > Delete collections manually

# OR use Firebase CLI
firebase firestore:delete --all-collections
```

## Customization

Edit `scripts/seedTestData.js` to:
- Add more clubs, events, or store items
- Change pricing or inventory
- Update categories and variants
- Modify sample images (currently using Unsplash)

## Troubleshooting

**Error: "Cannot find module 'firebase-admin'"**
```bash
npm install firebase-admin --save-dev
```

**Error: "service-account-key.json not found"**
- Download the service account key from Firebase Console
- Place it in the project root directory

**Error: "Permission denied"**
- Make sure your service account has Firestore write permissions
- Check Firebase Console > Project Settings > Service Accounts

## Safety Notes

- ⚠️ **Never commit `service-account-key.json` to git**
- 🔒 Always add it to `.gitignore`
- 🧪 Only use this script in development/staging environments
- 📊 Review data before running in production-like environments
