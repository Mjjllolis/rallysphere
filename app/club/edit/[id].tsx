// app/club/edit/[id].tsx - Modern Edit Club Screen
import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, Alert, TouchableOpacity, KeyboardAvoidingView, Platform, Text as RNText } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import {
  Text,
  useTheme,
  IconButton,
  Chip,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { getClub, updateClub, uploadImage, testStorageConnection } from '../../../lib/firebase';
import { useAuth, useThemeToggle } from '../../_layout';
import type { Club } from '../../../lib/firebase';
import GlassInput from '../../../components/GlassInput';
import GlassSwitch from '../../../components/GlassSwitch';
import GlassButton from '../../../components/GlassButton';

const SPORTS = [
  'Basketball', 'Football', 'Soccer', 'Tennis', 'Pickleball', 'Baseball', 'Volleyball',
  'Swimming', 'Track & Field', 'Golf', 'Hockey', 'Wrestling', 'Cross Country',
  'Softball', 'Lacrosse', 'Rugby', 'Cricket', 'Badminton', 'Table Tennis',
  'Martial Arts', 'Cycling', 'Running', 'Fitness', 'Other'
];

const TAGS = [
  'Beginner Friendly', 'Competitive', 'Social', 'Recreational',
  'Training Focused', 'Tournament Play', 'All Skill Levels', 'Advanced Players Only'
];

export default function EditClubScreen() {
  const theme = useTheme();
  const { isDark } = useThemeToggle();
  const { user } = useAuth();
  const { id } = useLocalSearchParams();
  const clubId = id as string;

  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [club, setClub] = useState<Club | null>(null);
  const [backgroundColors, setBackgroundColors] = useState<string[]>(['#6366f1', '#8b5cf6', '#d946ef']);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    sport: '',
    address: '',
    address2: '',
    city: '',
    state: '',
    zipCode: '',
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
  const [coverImage, setCoverImage] = useState<string | null>(null);
  const [logo, setLogo] = useState<string | null>(null);
  const [originalCoverImage, setOriginalCoverImage] = useState<string | null>(null);
  const [originalLogo, setOriginalLogo] = useState<string | null>(null);

  useEffect(() => {
    if (clubId) {
      loadClub();
    }
  }, [clubId]);

  const loadClub = async () => {
    try {
      setInitialLoading(true);
      const result = await getClub(clubId);

      if (result.success && result.club) {
        const clubData = result.club;
        setClub(clubData);

        if (!user || !clubData.admins.includes(user.uid)) {
          Alert.alert('Access Denied', 'You are not authorized to edit this club.', [
            { text: 'OK', onPress: () => router.back() }
          ]);
          return;
        }

        // Parse existing location into structured fields
        const locationStr = clubData.location || '';
        const parts = locationStr.split(', ');

        setFormData({
          name: clubData.name || '',
          description: clubData.description || '',
          sport: clubData.category || '',
          address: parts[0] || '',
          address2: parts.length > 2 ? parts[1] || '' : '',
          city: parts.length >= 2 ? (parts[parts.length - 1]?.split(' ')[0] || '') : '',
          state: parts.length >= 2 ? (parts[parts.length - 1]?.split(' ')[1] || '') : '',
          zipCode: parts.length >= 2 ? (parts[parts.length - 1]?.split(' ')[2] || '') : '',
          contactEmail: clubData.contactEmail || '',
          website: clubData.socialLinks?.website || '',
          instagram: clubData.socialLinks?.instagram || '',
          twitter: clubData.socialLinks?.twitter || '',
          facebook: clubData.socialLinks?.facebook || '',
          tiktok: clubData.socialLinks?.tiktok || '',
          discord: clubData.socialLinks?.discord || '',
        });

        setSelectedTags(clubData.tags || []);
        setIsPublic(clubData.isPublic);
        setCoverImage(clubData.coverImage || null);
        setLogo(clubData.logo || null);
        setOriginalCoverImage(clubData.coverImage || null);
        setOriginalLogo(clubData.logo || null);

        // Extract colors from cover image
        if (clubData.coverImage) {
          handleColorsExtracted(['#6366f1', '#8b5cf6', '#d946ef']);
        }
      } else {
        Alert.alert('Error', 'Club not found', [
          { text: 'OK', onPress: () => router.back() }
        ]);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to load club data');
    } finally {
      setInitialLoading(false);
    }
  };

  const updateFormData = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const toggleTag = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag)
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
  };

  const pickCoverImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'We need camera roll permissions to select images.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        setCoverImage(result.assets[0].uri);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const pickLogo = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'We need camera roll permissions to select images.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        setLogo(result.assets[0].uri);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to pick image');
    }
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

  const handleUpdateClub = async () => {
    if (!validateForm()) return;
    if (!user || !club) return;

    setLoading(true);
    try {
      const storageTest = await testStorageConnection();
      if (!storageTest.success) {
        Alert.alert('Storage Error', `Storage test failed: ${storageTest.error}`);
        setLoading(false);
        return;
      }

      let coverImageUrl = originalCoverImage;
      let logoUrl = originalLogo;

      if (coverImage && coverImage !== originalCoverImage) {
        const coverPath = `clubs/covers/${Date.now()}_cover.jpg`;
        const uploadedCoverUrl = await uploadImage(coverImage, coverPath);
        if (uploadedCoverUrl) {
          coverImageUrl = uploadedCoverUrl;
        }
      }

      if (logo && logo !== originalLogo) {
        const logoPath = `clubs/logos/${Date.now()}_logo.jpg`;
        const uploadedLogoUrl = await uploadImage(logo, logoPath);
        if (uploadedLogoUrl) {
          logoUrl = uploadedLogoUrl;
        }
      }

      const socialLinks: any = {
        website: formData.website.trim(),
        instagram: formData.instagram.trim(),
        twitter: formData.twitter.trim(),
        facebook: formData.facebook.trim(),
        tiktok: formData.tiktok.trim(),
        discord: formData.discord.trim(),
      };

      const location = [
        formData.address.trim(),
        formData.address2.trim(),
        formData.city.trim() || formData.state.trim() || formData.zipCode.trim()
          ? `${formData.city.trim()}, ${formData.state.trim().toUpperCase()} ${formData.zipCode.trim()}`
          : '',
      ].filter(Boolean).join(', ');

      const clubData: any = {
        name: formData.name.trim(),
        description: formData.description.trim(),
        category: formData.sport,
        isPublic,
        tags: selectedTags,
        socialLinks,
        location,
        contactEmail: formData.contactEmail.trim(),
      };
      if (coverImageUrl) {
        clubData.coverImage = coverImageUrl;
      }
      if (logoUrl) {
        clubData.logo = logoUrl;
      }

      const result = await updateClub(clubId, clubData);
      if (result.success) {
        Alert.alert(
          'Success!',
          'Club updated successfully!',
          [{
            text: 'OK',
            onPress: () => router.push(`/club/${clubId}`)
          }]
        );
      } else {
        Alert.alert('Error', result.error || 'Failed to update club');
      }
    } catch (error) {
      Alert.alert('Error', 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleColorsExtracted = (colors: string[]) => {
    setBackgroundColors(colors);
  };

  const isFormComplete = () => {
    return (
      formData.name.trim().length > 0 &&
      formData.description.trim().length > 0 &&
      formData.sport.trim().length > 0
    );
  };

  if (initialLoading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <View style={styles.loadingContainer}>
          <Text style={{ color: theme.colors.onSurface }}>Loading club data...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Background with Gradient Overlay */}
      <View style={StyleSheet.absoluteFill}>
        <View style={[styles.themedBackground, { backgroundColor: theme.colors.background }]} />
      </View>
      <LinearGradient
        colors={[
          `rgba(${parseInt(backgroundColors[0].slice(1, 3), 16)}, ${parseInt(backgroundColors[0].slice(3, 5), 16)}, ${parseInt(backgroundColors[0].slice(5, 7), 16)}, 0.25)`,
          `rgba(${parseInt(backgroundColors[1].slice(1, 3), 16)}, ${parseInt(backgroundColors[1].slice(3, 5), 16)}, ${parseInt(backgroundColors[1].slice(5, 7), 16)}, 0.15)`,
          `rgba(${parseInt(backgroundColors[2].slice(1, 3), 16)}, ${parseInt(backgroundColors[2].slice(3, 5), 16)}, ${parseInt(backgroundColors[2].slice(5, 7), 16)}, 0.08)`,
          'rgba(0, 0, 0, 0)'
        ]}
        locations={[0, 0.3, 0.6, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Header */}
        <View style={[styles.headerContainer, { borderBottomColor: theme.colors.outline }]}>
          <View style={styles.headerContent}>
            <TouchableOpacity style={styles.closeButton} onPress={() => router.back()}>
              <IconButton icon="close" size={24} iconColor={theme.colors.onSurfaceVariant} style={{ margin: 0 }} />
            </TouchableOpacity>
            <View style={styles.typeSelectorWrapper}>
              <View style={[styles.typeSelector, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]}>
                <Text style={[styles.typeSelectorText, { color: theme.colors.onSurface }]}>Edit Club</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Form Content */}
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            style={styles.content}
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={true}
            indicatorStyle={isDark ? "white" : "black"}
            bounces={true}
            keyboardShouldPersistTaps="handled"
          >
            {/* Club Info Label */}
            {club && (
              <View style={styles.clubInfoLabel}>
                <Text style={[styles.clubInfoText, { color: theme.colors.onSurface }]}>
                  Editing <Text style={{ fontWeight: 'bold' }}>{club.name}</Text>
                </Text>
              </View>
            )}

            {/* Cover Image */}
            <View style={styles.imageSection}>
              <Text style={[styles.sectionLabel, { color: theme.colors.onSurface }]}>Cover Image</Text>
              <TouchableOpacity onPress={pickCoverImage} activeOpacity={0.7}>
                <LinearGradient
                  colors={isDark ? ['rgba(30,40,60,0.8)', 'rgba(20,30,48,0.8)'] : ['#E1E7F1', '#D4DCE8']}
                  style={styles.coverImageContainer}
                >
                  {coverImage ? (
                    <ExpoImage source={{ uri: coverImage }} style={styles.coverImage} contentFit="cover" transition={200} cachePolicy="memory-disk" />
                  ) : (
                    <View style={styles.imagePlaceholder}>
                      <IconButton icon="camera-plus" size={40} iconColor={theme.colors.primary} />
                      <RNText style={styles.imagePlaceholderText}>Tap to add cover image</RNText>
                      <RNText style={styles.imageHint}>16:9 recommended</RNText>
                    </View>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>

            {/* Logo */}
            <View style={styles.imageSection}>
              <Text style={[styles.sectionLabel, { color: theme.colors.onSurface }]}>Club Logo</Text>
              <TouchableOpacity onPress={pickLogo} activeOpacity={0.7}>
                <View style={styles.logoWrapper}>
                  <LinearGradient
                    colors={isDark ? ['rgba(30,40,60,0.8)', 'rgba(20,30,48,0.8)'] : ['#E1E7F1', '#D4DCE8']}
                    style={styles.logoContainer}
                  >
                    {logo ? (
                      <ExpoImage source={{ uri: logo }} style={styles.logoImage} contentFit="cover" transition={200} cachePolicy="memory-disk" />
                    ) : (
                      <View style={styles.logoPlaceholder}>
                        <IconButton icon="account-circle" size={40} iconColor={theme.colors.primary} />
                        <RNText style={styles.logoHint}>Club Logo</RNText>
                      </View>
                    )}
                  </LinearGradient>
                </View>
              </TouchableOpacity>
            </View>

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
              placeholder="What is your club about? What activities do you do?"
              multiline
              numberOfLines={4}
            />

            {/* Category Picker */}
            <View style={styles.pickerContainer}>
              <Text style={[styles.sectionLabel, { color: theme.colors.onSurface }]}>Category *</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.categoryScroll}
              >
                {SPORTS.map((sport) => (
                  <Chip
                    key={sport}
                    selected={formData.sport === sport}
                    onPress={() => updateFormData('sport', sport)}
                    style={styles.categoryChip}
                    mode={formData.sport === sport ? "flat" : "outlined"}
                    selectedColor={theme.colors.primary}
                  >
                    {sport}
                  </Chip>
                ))}
              </ScrollView>
            </View>

            <GlassInput
              label="Contact Email"
              value={formData.contactEmail}
              onChangeText={(value) => updateFormData('contactEmail', value)}
              placeholder="contact@club.com"
              keyboardType="email-address"
              autoCapitalize="none"
              icon="email"
            />

            {/* Location */}
            <GlassInput
              label="Address"
              value={formData.address}
              onChangeText={(value) => updateFormData('address', value)}
              placeholder="123 Main St"
              icon="map-marker"
            />

            <GlassInput
              label="Address Line 2"
              value={formData.address2}
              onChangeText={(value) => updateFormData('address2', value)}
              placeholder="Suite, Unit, Floor (optional)"
            />

            <View style={styles.addressRow}>
              <GlassInput
                label="City"
                value={formData.city}
                onChangeText={(value) => updateFormData('city', value)}
                placeholder="City"
                style={styles.addressCity}
                compact
              />
              <GlassInput
                label="State"
                value={formData.state}
                onChangeText={(value) => updateFormData('state', value)}
                placeholder="TX"
                maxLength={2}
                autoCapitalize="characters"
                style={styles.addressState}
                compact
              />
              <GlassInput
                label="Zip"
                value={formData.zipCode}
                onChangeText={(value) => updateFormData('zipCode', value)}
                placeholder="75001"
                keyboardType="number-pad"
                maxLength={5}
                style={styles.addressZip}
                compact
              />
            </View>

            {/* Social Links */}
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
              icon="forum"
            />

            {/* Club Settings */}
            <View style={styles.tagsSection}>
              <Text style={[styles.sectionLabel, { color: theme.colors.onSurface }]}>Club Type(s)</Text>
              <Text style={[styles.fieldHint, { color: theme.colors.onSurfaceVariant }]}>
                Select all that apply
              </Text>
              <View style={styles.chipsContainer}>
                {TAGS.map((tag) => (
                  <Chip
                    key={tag}
                    selected={selectedTags.includes(tag)}
                    onPress={() => toggleTag(tag)}
                    style={styles.chip}
                    mode={selectedTags.includes(tag) ? "flat" : "outlined"}
                    selectedColor={theme.colors.primary}
                  >
                    {tag}
                  </Chip>
                ))}
              </View>
            </View>

            <GlassSwitch
              label="Public Club"
              description="Anyone can discover and join"
              value={isPublic}
              onValueChange={setIsPublic}
            />

            {/* Submit Button */}
            <GlassButton
              title="Update Club"
              onPress={handleUpdateClub}
              loading={loading}
              disabled={loading}
              variant="primary"
              isReady={isFormComplete()}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  themedBackground: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  headerContainer: {
    paddingTop: 8,
    paddingBottom: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  typeSelectorWrapper: {
    flex: 1,
    alignItems: 'center',
    marginRight: 40,
  },
  typeSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  typeSelectorText: {
    fontSize: 17,
    fontWeight: '600',
    marginRight: 4,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  clubInfoLabel: {
    marginBottom: 16,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.3)',
  },
  clubInfoText: {
    fontSize: 14,
    textAlign: 'center',
  },
  imageSection: {
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  coverImageContainer: {
    height: 160,
    borderRadius: 16,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  coverImage: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  imagePlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  imagePlaceholderText: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 8,
  },
  imageHint: {
    fontSize: 12,
    opacity: 0.7,
    marginTop: 4,
  },
  logoWrapper: {
    alignItems: 'center',
  },
  logoContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoImage: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  logoPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoHint: {
    fontSize: 12,
    opacity: 0.7,
    marginTop: 4,
  },
  pickerContainer: {
    marginBottom: 16,
  },
  categoryScroll: {
    gap: 8,
    paddingRight: 16,
  },
  categoryChip: {
    marginBottom: 4,
  },
  addressRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  addressCity: {
    flex: 3,
  },
  addressState: {
    flex: 1.5,
  },
  addressZip: {
    flex: 2,
  },
  tagsSection: {
    marginBottom: 16,
  },
  fieldHint: {
    fontSize: 13,
    marginBottom: 12,
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    marginBottom: 4,
  },
});
