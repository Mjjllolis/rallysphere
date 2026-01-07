// components/forms/ClubForm.tsx
import React, { useState } from 'react';
import { View, Alert, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { createClub, uploadImage } from '../../lib/firebase';
import { useAuth } from '../../app/_layout';
import GlassInput from '../GlassInput';
import GlassSwitch from '../GlassSwitch';
import GlassDropdown from '../GlassDropdown';
import GlassImageCard from '../GlassImageCard';
import GlassButton from '../GlassButton';
import { Text } from 'react-native-paper';

const SPORTS = [
  'Basketball', 'Football', 'Soccer', 'Tennis', 'Baseball', 'Volleyball',
  'Swimming', 'Track & Field', 'Golf', 'Hockey', 'Wrestling', 'Cross Country',
  'Softball', 'Lacrosse', 'Rugby', 'Cricket', 'Badminton', 'Table Tennis',
  'Martial Arts', 'Cycling', 'Running', 'Fitness', 'Other'
];

const TAGS = [
  'Beginner Friendly', 'Competitive', 'Social', 'Recreational',
  'Training Focused', 'Tournament Play', 'All Skill Levels', 'Advanced Players Only'
];

interface ClubFormProps {
  onColorsExtracted: (colors: string[]) => void;
  onSuccess: () => void;
}

export default function ClubForm({ onColorsExtracted, onSuccess }: ClubFormProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [coverImage, setCoverImage] = useState<string | null>(null);
  const [logo, setLogo] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    sport: '',
    contactEmail: '',
    website: '',
    instagram: '',
    twitter: '',
    facebook: '',
    tiktok: '',
    discord: '',
  });

  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isPublic, setIsPublic] = useState(true);

  const updateFormData = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleTagSelect = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag)
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
  };

  const validateForm = () => {
    if (!formData.name.trim()) {
      Alert.alert('Error', 'Club name is required');
      return false;
    }
    if (!formData.description.trim()) {
      Alert.alert('Error', 'Club description is required');
      return false;
    }
    if (!formData.sport) {
      Alert.alert('Error', 'Please select a category');
      return false;
    }
    return true;
  };

  const handleCreateClub = async () => {
    if (!validateForm()) return;
    if (!user) {
      Alert.alert('Error', 'You must be logged in to create a club');
      return;
    }

    setLoading(true);
    try {
      let coverImageUrl: string | undefined;
      let logoUrl: string | undefined;

      if (coverImage) {
        const coverPath = `clubs/covers/${Date.now()}_cover.jpg`;
        coverImageUrl = await uploadImage(coverImage, coverPath) || undefined;
      }

      if (logo) {
        const logoPath = `clubs/logos/${Date.now()}_logo.jpg`;
        logoUrl = await uploadImage(logo, logoPath) || undefined;
      }

      const socialLinks: any = {};
      if (formData.website.trim()) socialLinks.website = formData.website.trim();
      if (formData.instagram.trim()) socialLinks.instagram = formData.instagram.trim();
      if (formData.twitter.trim()) socialLinks.twitter = formData.twitter.trim();
      if (formData.facebook.trim()) socialLinks.facebook = formData.facebook.trim();
      if (formData.tiktok.trim()) socialLinks.tiktok = formData.tiktok.trim();
      if (formData.discord.trim()) socialLinks.discord = formData.discord.trim();

      const clubData: any = {
        name: formData.name.trim(),
        description: formData.description.trim(),
        category: formData.sport,
        createdBy: user.uid,
        isPublic,
      };

      if (formData.contactEmail.trim()) {
        clubData.contactEmail = formData.contactEmail.trim();
      }
      if (coverImageUrl) {
        clubData.coverImage = coverImageUrl;
      }
      if (logoUrl) {
        clubData.logo = logoUrl;
      }
      if (selectedTags.length > 0) {
        clubData.tags = selectedTags;
      }
      if (Object.keys(socialLinks).length > 0) {
        clubData.socialLinks = socialLinks;
      }

      const result = await createClub(clubData);
      if (result.success) {
        Alert.alert(
          'Success!',
          'Your club has been created successfully!',
          [{
            text: 'OK',
            onPress: () => {
              onSuccess();
              router.push(`/club/${result.clubId}`);
            }
          }]
        );
      } else {
        Alert.alert('Error', result.error || 'Failed to create club');
      }
    } catch (error) {
      console.error('Create club error:', error);
      Alert.alert('Error', 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Cover Image Card */}
      <GlassImageCard
        imageUri={coverImage}
        onImageSelected={setCoverImage}
        onColorsExtracted={onColorsExtracted}
        aspectRatio={[16, 9]}
        placeholder="Tap to add club cover"
      />

      {/* Logo Image Card */}
      <Text style={styles.sectionLabel}>Club Logo</Text>
      <GlassImageCard
        imageUri={logo}
        onImageSelected={setLogo}
        aspectRatio={[1, 1]}
        placeholder="Tap to add club logo"
      />

      {/* Basic Info */}
      <GlassInput
        label="Club Name *"
        value={formData.name}
        onChangeText={(value) => updateFormData('name', value)}
        placeholder="Enter club name"
      />

      <GlassInput
        label="Description *"
        value={formData.description}
        onChangeText={(value) => updateFormData('description', value)}
        placeholder="What is your club about?"
        multiline
        numberOfLines={4}
        style={{ height: 100 }}
      />

      {/* Category */}
      <GlassDropdown
        label="Category *"
        value={formData.sport}
        options={SPORTS}
        onSelect={(value) => updateFormData('sport', value)}
        placeholder="Select a category..."
        icon="soccer"
      />

      {/* Club Type Tags */}
      <GlassDropdown
        label="Club Type"
        value={selectedTags.length > 0 ? selectedTags.join(', ') : ''}
        options={TAGS}
        onSelect={handleTagSelect}
        placeholder="Select club type(s)..."
        icon="tag-multiple"
      />

      {/* Contact Info */}
      <GlassInput
        label="Contact Email"
        value={formData.contactEmail}
        onChangeText={(value) => updateFormData('contactEmail', value)}
        placeholder="club@example.com"
        keyboardType="email-address"
        autoCapitalize="none"
        icon="email"
      />

      {/* Social Links */}
      <Text style={styles.sectionLabel}>Social Links</Text>

      <GlassInput
        label="Website"
        value={formData.website}
        onChangeText={(value) => updateFormData('website', value)}
        placeholder="https://yourclub.com"
        autoCapitalize="none"
        icon="web"
      />

      <GlassInput
        label="Instagram"
        value={formData.instagram}
        onChangeText={(value) => updateFormData('instagram', value)}
        placeholder="@username"
        autoCapitalize="none"
        icon="instagram"
      />

      <GlassInput
        label="Twitter / X"
        value={formData.twitter}
        onChangeText={(value) => updateFormData('twitter', value)}
        placeholder="@username"
        autoCapitalize="none"
        icon="twitter"
      />

      <GlassInput
        label="Facebook"
        value={formData.facebook}
        onChangeText={(value) => updateFormData('facebook', value)}
        placeholder="Page URL or username"
        autoCapitalize="none"
        icon="facebook"
      />

      <GlassInput
        label="TikTok"
        value={formData.tiktok}
        onChangeText={(value) => updateFormData('tiktok', value)}
        placeholder="@username"
        autoCapitalize="none"
        icon="music-note"
      />

      <GlassInput
        label="Discord"
        value={formData.discord}
        onChangeText={(value) => updateFormData('discord', value)}
        placeholder="Invite link"
        autoCapitalize="none"
        icon="discord"
      />

      <GlassSwitch
        label="Public Club"
        description="Anyone can discover and join"
        value={isPublic}
        onValueChange={setIsPublic}
      />

      {/* Submit Button */}
      <GlassButton
        title="Create Club"
        onPress={handleCreateClub}
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
  sectionLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: 'white',
    marginBottom: 12,
    marginTop: 8,
    marginLeft: 4,
  },
});
