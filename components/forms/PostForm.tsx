// components/forms/PostForm.tsx
import React, { useState, useEffect } from 'react';
import { View, Alert, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { getClubs } from '../../lib/firebase';
import { useAuth } from '../../app/_layout';
import GlassInput from '../GlassInput';
import GlassSwitch from '../GlassSwitch';
import GlassDropdown from '../GlassDropdown';
import GlassImageCard from '../GlassImageCard';
import GlassButton from '../GlassButton';
import type { Club } from '../../lib/firebase';

interface PostFormProps {
  onColorsExtracted: (colors: string[]) => void;
  onSuccess: () => void;
}

export default function PostForm({ onColorsExtracted, onSuccess }: PostFormProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [availableClubs, setAvailableClubs] = useState<Club[]>([]);
  const [selectedClub, setSelectedClub] = useState<Club | null>(null);
  const [coverImage, setCoverImage] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    title: '',
    content: '',
  });

  const [isPublic, setIsPublic] = useState(true);

  useEffect(() => {
    loadAvailableClubs();
  }, []);

  const loadAvailableClubs = async () => {
    if (!user) return;
    const result = await getClubs();
    if (result.success) {
      const userClubs = result.clubs.filter(c =>
        c.admins.includes(user.uid) || c.members.includes(user.uid)
      );
      setAvailableClubs(userClubs);
      if (userClubs.length > 0) {
        setSelectedClub(userClubs[0]);
      }
    }
  };

  const updateFormData = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleClubSelect = (clubName: string) => {
    const club = availableClubs.find(c => c.name === clubName);
    if (club) {
      setSelectedClub(club);
    }
  };

  const validateForm = () => {
    if (!formData.title.trim()) {
      Alert.alert('Error', 'Post title is required');
      return false;
    }
    if (!formData.content.trim()) {
      Alert.alert('Error', 'Post content is required');
      return false;
    }
    if (!selectedClub) {
      Alert.alert('Error', 'Please select a club');
      return false;
    }
    return true;
  };

  const handleCreatePost = async () => {
    if (!validateForm()) return;
    if (!user || !selectedClub) return;

    setLoading(true);
    try {
      // TODO: Implement post creation in Firebase
      // For now, just show a placeholder success message

      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate API call

      Alert.alert(
        'Coming Soon!',
        'Post creation will be implemented in the next update.',
        [{
          text: 'OK',
          onPress: () => {
            onSuccess();
          }
        }]
      );
    } catch (error) {
      console.error('Create post error:', error);
      Alert.alert('Error', 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Image Card */}
      <GlassImageCard
        imageUri={coverImage}
        onImageSelected={setCoverImage}
        onColorsExtracted={onColorsExtracted}
        aspectRatio={[16, 9]}
        placeholder="Tap to add post image"
      />

      {/* Club Selection */}
      <GlassDropdown
        label="Post to Club *"
        value={selectedClub?.name || ''}
        options={availableClubs.map(c => c.name)}
        onSelect={handleClubSelect}
        placeholder="Select a club..."
        icon="account-group"
      />

      {/* Basic Info */}
      <GlassInput
        label="Post Title *"
        value={formData.title}
        onChangeText={(value) => updateFormData('title', value)}
        placeholder="Enter post title"
      />

      <GlassInput
        label="Content *"
        value={formData.content}
        onChangeText={(value) => updateFormData('content', value)}
        placeholder="What's on your mind?"
        multiline
        numberOfLines={6}
        style={{ height: 140 }}
      />

      <GlassSwitch
        label="Public Post"
        description="Anyone can view this post"
        value={isPublic}
        onValueChange={setIsPublic}
      />

      {/* Submit Button */}
      <GlassButton
        title="Create Post"
        onPress={handleCreatePost}
        loading={loading}
        disabled={loading}
        variant="primary"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
