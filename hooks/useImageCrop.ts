// hooks/useImageCrop.ts - Image cropping utilities
import * as ImageManipulator from 'expo-image-manipulator';
import { Image } from 'react-native';

export interface CropData {
  originX: number;
  originY: number;
  width: number;
  height: number;
}

export interface ImageDimensions {
  width: number;
  height: number;
}

/**
 * Get the dimensions of an image from its URI
 */
export const getImageDimensions = (uri: string): Promise<ImageDimensions> => {
  return new Promise((resolve, reject) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      (error) => reject(error)
    );
  });
};

/**
 * Calculate the initial scale needed for an image to cover the crop frame
 */
export const calculateInitialScale = (
  imageWidth: number,
  imageHeight: number,
  cropFrameWidth: number,
  cropFrameHeight: number
): number => {
  const scaleX = cropFrameWidth / imageWidth;
  const scaleY = cropFrameHeight / imageHeight;
  // Use the larger scale to ensure the image covers the crop frame
  return Math.max(scaleX, scaleY);
};

/**
 * Calculate the crop region from gesture state
 * @param imageWidth - Original image width in pixels
 * @param imageHeight - Original image height in pixels
 * @param displayedWidth - Width of the image as displayed (after initial scale)
 * @param displayedHeight - Height of the image as displayed (after initial scale)
 * @param cropFrameWidth - Width of the crop frame
 * @param cropFrameHeight - Height of the crop frame
 * @param scale - Current zoom scale (relative to initial fit)
 * @param translateX - Current X translation
 * @param translateY - Current Y translation
 */
export const calculateCropRegion = (
  imageWidth: number,
  imageHeight: number,
  displayedWidth: number,
  displayedHeight: number,
  cropFrameWidth: number,
  cropFrameHeight: number,
  scale: number,
  translateX: number,
  translateY: number
): CropData => {
  // The displayed size after applying zoom scale
  const scaledWidth = displayedWidth * scale;
  const scaledHeight = displayedHeight * scale;

  // The crop frame is centered at (0, 0) in our coordinate system
  // translateX/Y moves the image, so we need to find where the crop frame
  // falls on the image

  // Center of the image in display coordinates
  const imageCenterX = translateX;
  const imageCenterY = translateY;

  // The crop frame spans from -cropFrameWidth/2 to +cropFrameWidth/2
  // Relative to the image center, the crop frame origin is at:
  const cropFrameRelativeX = -cropFrameWidth / 2 - imageCenterX;
  const cropFrameRelativeY = -cropFrameHeight / 2 - imageCenterY;

  // Convert to image coordinates (accounting for the scale)
  // First, offset by half the scaled image to get from center to top-left origin
  const offsetFromTopLeftX = cropFrameRelativeX + scaledWidth / 2;
  const offsetFromTopLeftY = cropFrameRelativeY + scaledHeight / 2;

  // Scale back to original image pixels
  const pixelScale = imageWidth / scaledWidth;
  const originX = offsetFromTopLeftX * pixelScale;
  const originY = offsetFromTopLeftY * pixelScale;
  const width = cropFrameWidth * pixelScale;
  const height = cropFrameHeight * pixelScale;

  // Clamp to image bounds
  return {
    originX: Math.max(0, Math.min(originX, imageWidth - width)),
    originY: Math.max(0, Math.min(originY, imageHeight - height)),
    width: Math.min(width, imageWidth),
    height: Math.min(height, imageHeight),
  };
};

/**
 * Crop an image using expo-image-manipulator
 */
export const cropImage = async (
  sourceUri: string,
  cropData: CropData,
  outputWidth: number = 800,
  quality: number = 0.8
): Promise<string> => {
  // Calculate output height maintaining aspect ratio
  const aspectRatio = cropData.width / cropData.height;
  const outputHeight = Math.round(outputWidth / aspectRatio);

  const result = await ImageManipulator.manipulateAsync(
    sourceUri,
    [
      {
        crop: {
          originX: Math.round(cropData.originX),
          originY: Math.round(cropData.originY),
          width: Math.round(cropData.width),
          height: Math.round(cropData.height),
        },
      },
      {
        resize: {
          width: outputWidth,
          height: outputHeight,
        },
      },
    ],
    {
      compress: quality,
      format: ImageManipulator.SaveFormat.JPEG,
    }
  );

  return result.uri;
};

/**
 * Calculate translation bounds to keep the image covering the crop frame
 */
export const calculateTranslationBounds = (
  displayedWidth: number,
  displayedHeight: number,
  cropFrameWidth: number,
  cropFrameHeight: number,
  scale: number
): { minX: number; maxX: number; minY: number; maxY: number } => {
  const scaledWidth = displayedWidth * scale;
  const scaledHeight = displayedHeight * scale;

  // The max translation is how much the image can move while still covering the crop frame
  const maxTranslateX = (scaledWidth - cropFrameWidth) / 2;
  const maxTranslateY = (scaledHeight - cropFrameHeight) / 2;

  return {
    minX: -maxTranslateX,
    maxX: maxTranslateX,
    minY: -maxTranslateY,
    maxY: maxTranslateY,
  };
};
