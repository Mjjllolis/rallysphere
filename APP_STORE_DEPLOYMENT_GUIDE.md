# RallySphere App Store Deployment Guide

## Prerequisites

### 1. Apple Developer Account
- **Required**: You need a paid Apple Developer Account ($99/year)
- **Sign up**: https://developer.apple.com/programs/

### 2. App Store Connect Setup
- **Create App**: https://appstoreconnect.apple.com
- **App Name**: RallySphere
- **Bundle ID**: com.rallysphere.app (or your preferred domain)
- **SKU**: rallysphere-ios

## Step-by-Step Deployment Process

### Phase 1: Initial Setup

#### 1. Install EAS CLI
```bash
npm install -g @expo/eas-cli
```

#### 2. Login to Expo
```bash
cd /Users/mishawnlolis/Documents/DevRepo/rallysphere
eas login
```

#### 3. Configure EAS Project
```bash
eas build:configure
```
This will create/update your `eas.json` file.

#### 4. Update Project ID
After running the configure command, EAS will give you a project ID. Update `app.json`:
```json
"extra": {
  "eas": {
    "projectId": "your-actual-project-id-here"
  }
}
```

### Phase 2: Build for TestFlight

#### 1. Create iOS Build
```bash
# For TestFlight/App Store
eas build --platform ios --profile production
```

This process takes about 10-20 minutes and happens in the cloud.

#### 2. Alternative: Preview Build (for testing)
```bash
# For internal testing
eas build --platform ios --profile preview
```

### Phase 3: Submit to TestFlight

#### Option A: Automatic Submission
```bash
eas submit --platform ios --profile production
```

#### Option B: Manual Submission
1. Download the `.ipa` file from Expo dashboard
2. Use Xcode's Application Loader or Transporter app
3. Upload to App Store Connect

### Phase 4: TestFlight Configuration

#### In App Store Connect:
1. **Go to TestFlight tab**
2. **Add Test Information**:
   - What to Test: "Initial release of RallySphere - sports club management app"
   - App Review Information: Fill in contact details
3. **Add Internal/External Testers**
4. **Submit for Review** (for external testing)

## Required Assets & Information

### App Icons & Screenshots
**You'll need**:
- App Icon (1024x1024px)
- iPhone Screenshots (various sizes)
- iPad Screenshots (if supporting iPad)

### App Store Listing Information
**Prepare these details**:
- **App Name**: RallySphere
- **Subtitle**: Manage Sports Clubs & Events
- **Description**: 
```
RallySphere is the ultimate platform for managing sports clubs and events. Create and join clubs, organize tournaments, manage events, and connect with fellow sports enthusiasts.

Features:
• Create and manage sports clubs
• Organize events and tournaments
• Join clubs and participate in events
• Real-time event updates
• Member management tools
• Event cost tracking
• Social features for sports communities

Perfect for tennis clubs, pickleball groups, running clubs, and any sports organization looking to streamline their management and grow their community.
```
- **Keywords**: sports, clubs, events, tournaments, management, tennis, pickleball, community
- **Category**: Sports
- **Age Rating**: 4+ (appropriate for all ages)

### Privacy Policy & Terms
**You'll need**:
- Privacy Policy URL
- Terms of Service URL

**Quick solution**: Use services like:
- https://www.privacypolicygenerator.info/
- https://www.termsandconditionsgenerator.com/

## Testing Workflow

### 1. Internal Testing (Immediate)
```bash
# Build for internal testing
eas build --platform ios --profile preview
```
- Install on your device via Expo Go
- Share with up to 25 internal testers
- No App Review required

### 2. External Testing (1-2 days review)
```bash
# Build for external testing/production
eas build --platform ios --profile production
eas submit --platform ios
```
- Up to 2000 external testers
- Requires App Review approval
- Takes 1-2 business days

### 3. App Store Release (3-7 days review)
- Same build as TestFlight
- Submit for App Store Review
- Takes 3-7 business days
- Requires complete app metadata

## Common Issues & Solutions

### Build Failures
```bash
# Clear cache and rebuild
eas build --platform ios --profile production --clear-cache
```

### Missing Credentials
- EAS will automatically generate certificates
- Or provide your own via Apple Developer Portal

### App Review Rejections
**Common issues**:
- Missing app functionality (ensure Firebase is working)
- Incomplete app information
- Missing privacy policy
- App crashes on launch

**Solutions**:
- Test thoroughly before submission
- Provide test account credentials if needed
- Ensure all Firebase services are properly configured

## Cost Breakdown

### Required Costs:
- **Apple Developer Account**: $99/year
- **Expo EAS Build**: Free tier (limited builds) or $29/month

### Optional Costs:
- **App Store Optimization**: $0-500 (design/marketing)
- **Firebase**: Free tier should be sufficient initially

## Timeline Estimate

### Fastest Path to TestFlight:
- **Setup**: 2-4 hours (first time)
- **Build**: 20-30 minutes
- **TestFlight Upload**: 5-10 minutes
- **Internal Testing**: Immediate
- **External Testing**: 1-2 days (review)

### Full App Store Release:
- **Additional Time**: 3-7 days (review)
- **Total from Start**: 1-2 weeks

## Next Steps

1. **Get Apple Developer Account** (if you don't have one)
2. **Run the EAS commands above**
3. **Test the build thoroughly**
4. **Prepare app store assets**
5. **Submit to TestFlight**
6. **Gather feedback from testers**
7. **Submit to App Store**

## Commands Summary

```bash
# Setup
npm install -g @expo/eas-cli
eas login
eas build:configure

# Build for TestFlight/App Store
eas build --platform ios --profile production

# Submit to App Store
eas submit --platform ios --profile production

# Check build status
eas build:list

# View project dashboard
eas open
```

## Support Resources

- **Expo Docs**: https://docs.expo.dev/
- **EAS Build**: https://docs.expo.dev/build/introduction/
- **App Store Connect**: https://appstoreconnect.apple.com/
- **Expo Discord**: https://chat.expo.dev/

Your app is definitely ready for TestFlight and the App Store! The UI is polished, functionality is solid, and you have a great foundation for a sports club management app.
