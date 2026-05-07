# Image Crop Feature Documentation

A comprehensive guide to understanding and implementing the image cropping feature in RallySphere. This documentation is designed for new developers and project managers.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [File Structure](#file-structure)
4. [Dependencies](#dependencies)
5. [Component Deep Dive](#component-deep-dive)
   - [GlassImageCard](#glassimagecard)
   - [ImageCropScreen](#imagecropscreen)
   - [useImageCrop Hook](#useimagecrop-hook)
6. [User Flow](#user-flow)
7. [How to Use](#how-to-use)
8. [Customization Options](#customization-options)
9. [Technical Concepts Explained](#technical-concepts-explained)
10. [Troubleshooting](#troubleshooting)

---

## Overview

### What is this feature?

The Image Crop Feature allows users to select an image from their device and crop it to a specific aspect ratio (default 4:5) before using it in the app. This ensures all event cover images have a consistent look and feel.

### Key Capabilities

- Select images from device photo library
- Pan (drag) images to reposition
- Pinch to zoom in/out
- Fixed aspect ratio cropping (4:5 by default)
- Rule-of-thirds grid overlay for composition
- Change image without leaving the crop screen
- Automatic image optimization (resize & compress)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      User Interface                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────┐         ┌──────────────────────────┐  │
│  │  GlassImageCard  │ ──────► │    ImageCropScreen       │  │
│  │  (Entry Point)   │         │    (Full-screen Modal)   │  │
│  └──────────────────┘         └──────────────────────────┘  │
│           │                              │                   │
│           │                              │                   │
│           ▼                              ▼                   │
│  ┌──────────────────┐         ┌──────────────────────────┐  │
│  │  expo-image-     │         │    useImageCrop          │  │
│  │  picker          │         │    (Utility Functions)   │  │
│  └──────────────────┘         └──────────────────────────┘  │
│                                          │                   │
│                                          ▼                   │
│                               ┌──────────────────────────┐  │
│                               │  expo-image-manipulator  │  │
│                               │  (Actual Cropping)       │  │
│                               └──────────────────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## File Structure

```
rallysphere/
├── components/
│   ├── GlassImageCard.tsx    # Image picker card component
│   └── ImageCropScreen.tsx   # Full-screen crop modal
├── hooks/
│   └── useImageCrop.ts       # Crop calculation utilities
└── docs/
    └── IMAGE_CROP_FEATURE.md # This documentation
```

---

## Dependencies

The feature uses these npm packages (already installed):

| Package | Version | Purpose |
|---------|---------|---------|
| `expo-image-picker` | ~17.0.10 | Select images from device |
| `expo-image-manipulator` | ~14.0.8 | Crop and resize images |
| `react-native-gesture-handler` | ~2.28.0 | Pan and pinch gestures |
| `react-native-reanimated` | ~4.1.1 | Smooth gesture animations |
| `react-native-safe-area-context` | 5.4.0 | Handle device notches |

---

## Component Deep Dive

### GlassImageCard

**Location:** `components/GlassImageCard.tsx`

**Purpose:** A beautiful, glass-morphism styled card that displays the selected image or a placeholder. Tapping it opens the image picker.

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `imageUri` | `string \| null` | - | URI of the currently selected image |
| `onImageSelected` | `(uri: string) => void` | - | Callback when image is selected/cropped |
| `onColorsExtracted` | `(colors: string[], imageUri?: string) => void` | - | Optional callback for gradient themes |
| `aspectRatio` | `[number, number]` | `[16, 9]` | Display aspect ratio of the card |
| `placeholder` | `string` | `'Tap to add image'` | Placeholder text |
| `enableCrop` | `boolean` | `true` | Whether to show crop screen after selection |
| `cropAspectRatio` | `[number, number]` | `[4, 5]` | Aspect ratio for cropping |

#### Key Functions

```typescript
// Opens the device image picker
const pickImage = async () => {
  // 1. Request permissions
  // 2. Launch image picker
  // 3. If enableCrop, show crop screen
  // 4. Otherwise, directly call onImageSelected
};

// Called when user completes cropping
const handleCropComplete = (croppedUri: string) => {
  setCropScreenVisible(false);
  setPendingImageUri(null);
  onImageSelected(croppedUri);
};

// Called when user cancels cropping
const handleCropCancel = () => {
  setCropScreenVisible(false);
  setPendingImageUri(null);
};

// Allows changing image while in crop screen
const handleChangeImage = async () => {
  // Opens picker again without closing crop screen
  // Updates pendingImageUri with new selection
};
```

#### State Variables

| State | Type | Purpose |
|-------|------|---------|
| `cropScreenVisible` | `boolean` | Controls crop modal visibility |
| `pendingImageUri` | `string \| null` | Image waiting to be cropped |
| `imageAspectRatio` | `number \| null` | Calculated aspect ratio of current image |
| `themeIndex` | `number` | Current gradient theme index |

---

### ImageCropScreen

**Location:** `components/ImageCropScreen.tsx`

**Purpose:** A full-screen modal where users can pan and zoom their image to position it within the crop frame.

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `visible` | `boolean` | - | Whether modal is visible |
| `imageUri` | `string \| null` | - | URI of image to crop |
| `aspectRatio` | `[number, number]` | `[4, 5]` | Crop aspect ratio |
| `onCropComplete` | `(croppedUri: string) => void` | - | Called with cropped image URI |
| `onCancel` | `() => void` | - | Called when user cancels |
| `onChangeImage` | `() => void` | - | Called when user wants different image |

#### Layout Structure

```
┌─────────────────────────────────────────┐
│  Header                                 │
│  ┌─────────────────────────────────┐ X  │
│  │ Crop Event Image                │    │
│  │ Recommended 4:5 aspect ratio... │    │
│  └─────────────────────────────────┘    │
├─────────────────────────────────────────┤
│                                         │
│          ┌───────┬───────┬───────┐      │
│          │       │       │       │      │
│          │       │       │       │      │
│          ├───────┼───────┼───────┤      │
│          │       │ IMAGE │       │      │
│          │       │       │       │      │
│          ├───────┼───────┼───────┤      │
│          │       │       │       │      │
│          │       │       │       │      │
│          └───────┴───────┴───────┘      │
│              (with grid overlay)        │
│                                         │
├─────────────────────────────────────────┤
│  Footer                                 │
│  Change Image                    [Done] │
└─────────────────────────────────────────┘
```

#### Gesture Handling

The component uses `react-native-gesture-handler` and `react-native-reanimated` for smooth, performant gestures.

**Pan Gesture (Dragging)**
```typescript
const panGesture = Gesture.Pan()
  .onUpdate((event) => {
    'worklet';  // Runs on UI thread for performance
    // Calculate new position
    // Clamp to bounds so image always covers crop frame
    translateX.value = clamp(newX, -bounds.maxX, bounds.maxX);
    translateY.value = clamp(newY, -bounds.maxY, bounds.maxY);
  })
  .onEnd(() => {
    'worklet';
    // Save final position
    savedTranslateX.value = translateX.value;
    savedTranslateY.value = translateY.value;
  });
```

**Pinch Gesture (Zooming)**
```typescript
const pinchGesture = Gesture.Pinch()
  .onUpdate((event) => {
    'worklet';
    // Calculate new scale (between MIN_SCALE and MAX_SCALE)
    const newScale = clamp(savedScale.value * event.scale, 1.0, 4.0);
    scale.value = newScale;
    // Adjust position to stay within bounds at new scale
  })
  .onEnd(() => {
    'worklet';
    savedScale.value = scale.value;
  });
```

**Combined Gesture**
```typescript
// Both gestures work simultaneously
const composedGesture = Gesture.Simultaneous(panGesture, pinchGesture);
```

#### Shared Values (Animation State)

| Value | Purpose |
|-------|---------|
| `scale` | Current zoom level (1.0 - 4.0) |
| `savedScale` | Scale at gesture end |
| `translateX` | Horizontal position |
| `translateY` | Vertical position |
| `savedTranslateX` | X position at gesture end |
| `savedTranslateY` | Y position at gesture end |

#### Crop Frame Calculation

```typescript
// Available screen space for crop area
const availableHeight = SCREEN_HEIGHT - HEADER_HEIGHT - FOOTER_HEIGHT;

// Start with full width
const cropFrameWidth = SCREEN_WIDTH;

// Calculate height based on aspect ratio (4:5)
const cropFrameHeightFromWidth = cropFrameWidth * (5 / 4);

// Use smaller value to fit in available space
const cropFrameHeight = Math.min(cropFrameHeightFromWidth, availableHeight);

// Recalculate width if height was constrained
const actualCropFrameWidth = cropFrameHeight * (4 / 5);
```

---

### useImageCrop Hook

**Location:** `hooks/useImageCrop.ts`

**Purpose:** Contains all the mathematical calculations for cropping. Separated for reusability and testing.

#### Exported Functions

**1. getImageDimensions**
```typescript
export const getImageDimensions = (uri: string): Promise<ImageDimensions>
```
Gets the width and height of an image from its URI.

**2. calculateInitialScale**
```typescript
export const calculateInitialScale = (
  imageWidth: number,
  imageHeight: number,
  cropFrameWidth: number,
  cropFrameHeight: number
): number
```
Calculates the minimum scale needed for an image to completely cover the crop frame. Uses `Math.max` because we need the larger scale factor.

**Example:**
```
Image: 1000 x 2000 pixels (portrait)
Crop Frame: 400 x 500 pixels (4:5)

scaleX = 400 / 1000 = 0.4
scaleY = 500 / 2000 = 0.25

initialScale = max(0.4, 0.25) = 0.4
```

**3. calculateCropRegion**
```typescript
export const calculateCropRegion = (
  imageWidth: number,      // Original image dimensions
  imageHeight: number,
  displayedWidth: number,  // Image size on screen (after initial scale)
  displayedHeight: number,
  cropFrameWidth: number,  // Crop area dimensions
  cropFrameHeight: number,
  scale: number,           // User's zoom level
  translateX: number,      // User's pan position
  translateY: number
): CropData
```

This is the core function that converts the user's gesture state into pixel coordinates for cropping.

**How it works:**

1. The crop frame is centered at (0, 0) in our coordinate system
2. `translateX/Y` represents how much the image has moved
3. We calculate where the crop frame falls on the original image
4. Convert screen coordinates to original image pixel coordinates

**Returns:**
```typescript
interface CropData {
  originX: number;  // Top-left X in original image pixels
  originY: number;  // Top-left Y in original image pixels
  width: number;    // Crop width in original image pixels
  height: number;   // Crop height in original image pixels
}
```

**4. cropImage**
```typescript
export const cropImage = async (
  sourceUri: string,
  cropData: CropData,
  outputWidth: number = 800,
  quality: number = 0.8
): Promise<string>
```

Performs the actual crop using `expo-image-manipulator`:

1. Crops the image to the calculated region
2. Resizes to the output width (maintains aspect ratio)
3. Compresses with specified quality
4. Returns URI of the new cropped image

**5. calculateTranslationBounds**
```typescript
export const calculateTranslationBounds = (
  displayedWidth: number,
  displayedHeight: number,
  cropFrameWidth: number,
  cropFrameHeight: number,
  scale: number
): { minX: number; maxX: number; minY: number; maxY: number }
```

Calculates how far the image can be panned while still covering the crop frame. Used to prevent users from revealing empty space.

---

## User Flow

```
┌──────────────────┐
│   User taps      │
│   GlassImageCard │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Permission      │
│  requested       │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Image picker    │
│  opens           │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐     ┌──────────────────┐
│  User selects    │────►│  Crop screen     │
│  an image        │     │  opens           │
└──────────────────┘     └────────┬─────────┘
                                  │
         ┌────────────────────────┼────────────────────────┐
         │                        │                        │
         ▼                        ▼                        ▼
┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐
│  User pans &     │   │  User taps       │   │  User taps       │
│  zooms image     │   │  "Change Image"  │   │  X (cancel)      │
└────────┬─────────┘   └────────┬─────────┘   └────────┬─────────┘
         │                      │                      │
         ▼                      │                      ▼
┌──────────────────┐            │             ┌──────────────────┐
│  User taps       │            │             │  Return to       │
│  "Done"          │            │             │  previous screen │
└────────┬─────────┘            │             │  (no image)      │
         │                      │             └──────────────────┘
         ▼                      │
┌──────────────────┐            │
│  Image cropped   │◄───────────┘
│  & optimized     │    (new image loaded)
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Cropped image   │
│  returned to     │
│  parent component│
└──────────────────┘
```

---

## How to Use

### Basic Usage

```tsx
import GlassImageCard from '@/components/GlassImageCard';

function MyComponent() {
  const [coverImage, setCoverImage] = useState<string | null>(null);

  return (
    <GlassImageCard
      imageUri={coverImage}
      onImageSelected={(uri) => setCoverImage(uri)}
      placeholder="Tap to add event cover"
    />
  );
}
```

### With All Options

```tsx
<GlassImageCard
  imageUri={coverImage}
  onImageSelected={(uri) => setCoverImage(uri)}
  onColorsExtracted={(colors, uri) => {
    // Use extracted colors for gradients
    setGradientColors(colors);
  }}
  placeholder="Add your photo"
  enableCrop={true}
  cropAspectRatio={[4, 5]}  // Instagram-style portrait
/>
```

### Disable Cropping

```tsx
<GlassImageCard
  imageUri={profileImage}
  onImageSelected={(uri) => setProfileImage(uri)}
  enableCrop={false}  // Image used as-is
/>
```

### Custom Aspect Ratio

```tsx
// Square crop (like profile pictures)
<GlassImageCard
  imageUri={avatar}
  onImageSelected={(uri) => setAvatar(uri)}
  cropAspectRatio={[1, 1]}
/>

// Wide crop (like YouTube thumbnails)
<GlassImageCard
  imageUri={thumbnail}
  onImageSelected={(uri) => setThumbnail(uri)}
  cropAspectRatio={[16, 9]}
/>
```

---

## Customization Options

### Aspect Ratios

Common aspect ratios you can use:

| Ratio | Use Case |
|-------|----------|
| `[1, 1]` | Square (profile pictures) |
| `[4, 5]` | Portrait (Instagram posts) |
| `[3, 4]` | Classic portrait |
| `[16, 9]` | Widescreen (videos, banners) |
| `[9, 16]` | Stories (vertical video) |
| `[3, 2]` | Classic photo |

### Output Quality

In `useImageCrop.ts`, the `cropImage` function accepts:

- `outputWidth`: Default 800px (good balance of quality/size)
- `quality`: Default 0.8 (80% JPEG quality)

Adjust these for your needs:
```typescript
// Higher quality, larger file
const croppedUri = await cropImage(imageUri, cropData, 1200, 0.9);

// Lower quality, smaller file (for thumbnails)
const croppedUri = await cropImage(imageUri, cropData, 400, 0.6);
```

### Zoom Limits

In `ImageCropScreen.tsx`:
```typescript
const MIN_SCALE = 1.0;  // Can't zoom out past "cover" scale
const MAX_SCALE = 4.0;  // Max 4x zoom
```

---

## Technical Concepts Explained

### What is a "worklet"?

The `'worklet'` directive tells React Native Reanimated to run that function on the **UI thread** instead of the JavaScript thread. This makes animations smooth (60fps) because they're not blocked by JS operations.

```typescript
const panGesture = Gesture.Pan()
  .onUpdate((event) => {
    'worklet';  // This function runs on UI thread
    translateX.value = event.translationX;
  });
```

### Why use Shared Values?

`useSharedValue` creates values that can be read/written from both JS and UI threads. Regular React state would cause lag because it only works on the JS thread.

```typescript
// Good: Shared value (works on UI thread)
const scale = useSharedValue(1);

// Bad: Regular state (causes lag)
const [scale, setScale] = useState(1);
```

### What is GestureHandlerRootView?

All gesture handlers must be descendants of `GestureHandlerRootView`. Since our crop screen is in a Modal (which creates a new view hierarchy), we need our own root view:

```tsx
<Modal>
  <GestureHandlerRootView style={{ flex: 1 }}>
    {/* Gestures work here */}
  </GestureHandlerRootView>
</Modal>
```

### How does expo-image-manipulator work?

It's a library that processes images. You give it a URI and a list of actions:

```typescript
const result = await ImageManipulator.manipulateAsync(
  sourceUri,
  [
    { crop: { originX: 0, originY: 0, width: 500, height: 625 } },
    { resize: { width: 800, height: 1000 } },
  ],
  { compress: 0.8, format: SaveFormat.JPEG }
);
// result.uri is the new image
```

---

## Troubleshooting

### Common Issues

**1. "GestureDetector must be used as a descendant of GestureHandlerRootView"**

Make sure you wrap your Modal content with `GestureHandlerRootView`:
```tsx
<Modal>
  <GestureHandlerRootView style={{ flex: 1 }}>
    <GestureDetector gesture={gesture}>
      ...
    </GestureDetector>
  </GestureHandlerRootView>
</Modal>
```

**2. Gestures feel laggy**

Ensure all gesture callbacks use `'worklet'`:
```typescript
.onUpdate((event) => {
  'worklet';  // Don't forget this!
  ...
});
```

**3. Image doesn't cover crop frame**

Check that `initialScale` uses `Math.max` (not `Math.min`):
```typescript
return Math.max(scaleX, scaleY);  // Correct
```

**4. Buttons behind status bar/notch**

Use `useSafeAreaInsets` and apply padding:
```typescript
const insets = useSafeAreaInsets();
<View style={{ paddingTop: insets.top }}>
```

**5. Crop produces wrong region**

The coordinate system assumes:
- Crop frame is centered at (0, 0)
- Positive translateX moves image right (crop moves left on image)
- Scale is relative to initial "cover" scale

---

## Summary

The Image Crop Feature consists of three main parts:

1. **GlassImageCard** - Entry point, handles image picker
2. **ImageCropScreen** - Full-screen crop UI with gestures
3. **useImageCrop** - Math utilities for cropping

Key technologies:
- `expo-image-picker` for selection
- `react-native-gesture-handler` for pan/pinch
- `react-native-reanimated` for smooth animations
- `expo-image-manipulator` for actual cropping

The feature ensures consistent 4:5 images throughout the app while giving users control over the crop area.
