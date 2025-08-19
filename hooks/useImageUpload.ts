// hooks/useImageUpload.ts - Reusable image upload hook
import { useState } from 'react';
import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { uploadImage, generateImagePath } from '../lib/firebase';

export type ImageType = 'club-logo' | 'club-header' | 'user-avatar';

interface UseImageUploadOptions {
    maxWidth?: number;
    maxHeight?: number;
    aspect?: [number, number];
    quality?: number;
}

interface UseImageUploadReturn {
    imageUri: string | null;
    isUploading: boolean;
    pickImage: () => Promise<void>;
    uploadSelectedImage: (type: ImageType, id: string, fileName?: string) => Promise<string | null>;
    clearImage: () => void;
}

export const useImageUpload = (options: UseImageUploadOptions = {}): UseImageUploadReturn => {
    const {
        maxWidth = 800,
        maxHeight = 800,
        aspect,
        quality = 0.8
    } = options;

    const [imageUri, setImageUri] = useState<string | null>(null);
    const [isUploading, setIsUploading] = useState(false);

    const pickImage = async (): Promise<void> => {
        try {
            // Request permission
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permission needed', 'Please grant photo library permission to select images.');
                return;
            }

            // Launch image picker
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: [ImagePicker.MediaType.Images],
                allowsEditing: true,
                aspect: aspect,
                quality: quality,
            });

            if (!result.canceled && result.assets[0]) {
                const asset = result.assets[0];
                
                // Resize image to optimize storage
                const manipResult = await ImageManipulator.manipulateAsync(
                    asset.uri,
                    [
                        {
                            resize: {
                                width: maxWidth,
                                height: maxHeight,
                            },
                        },
                    ],
                    {
                        compress: quality,
                        format: ImageManipulator.SaveFormat.JPEG,
                    }
                );

                setImageUri(manipResult.uri);
            }
        } catch (error) {
            console.error('Error picking image:', error);
            Alert.alert('Error', 'Failed to select image. Please try again.');
        }
    };

    const uploadSelectedImage = async (
        type: ImageType, 
        id: string, 
        fileName: string = 'image.jpg'
    ): Promise<string | null> => {
        if (!imageUri) {
            return null;
        }

        setIsUploading(true);
        
        try {
            const imagePath = generateImagePath(type, id, fileName);
            const downloadUrl = await uploadImage(imageUri, imagePath);
            return downloadUrl;
        } catch (error) {
            console.error('Error uploading image:', error);
            Alert.alert('Upload Error', 'Failed to upload image. Please try again.');
            return null;
        } finally {
            setIsUploading(false);
        }
    };

    const clearImage = (): void => {
        setImageUri(null);
    };

    return {
        imageUri,
        isUploading,
        pickImage,
        uploadSelectedImage,
        clearImage,
    };
};

// Preset configurations for common use cases
export const useClubLogoUpload = () => useImageUpload({
    maxWidth: 400,
    maxHeight: 400,
    aspect: [1, 1],
    quality: 0.8
});

export const useClubHeaderUpload = () => useImageUpload({
    maxWidth: 800,
    maxHeight: 450,
    aspect: [16, 9],
    quality: 0.8
});

export const useAvatarUpload = () => useImageUpload({
    maxWidth: 300,
    maxHeight: 300,
    aspect: [1, 1],
    quality: 0.8
});
