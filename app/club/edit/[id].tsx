// app/club/edit/[id].tsx - Modern Edit Club Screen
import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, Alert, Image, TouchableOpacity } from 'react-native';
import {
  Text,
  TextInput,
  Button,
  Card,
  useTheme,
  Switch,
  IconButton,
  Menu
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { getClub, updateClub, uploadImage, testStorageConnection } from '../../../lib/firebase';
import { useAuth } from '../../_layout';
import type { Club } from '../../../lib/firebase';
import BackButton from '../../../components/BackButton';

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

export default function EditClubScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const { id } = useLocalSearchParams();
  const clubId = id as string;

  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [showSportsMenu, setShowSportsMenu] = useState(false);
  const [showTagsMenu, setShowTagsMenu] = useState(false);
  const [club, setClub] = useState<Club | null>(null);

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

        setFormData({
          name: clubData.name || '',
          description: clubData.description || '',
          sport: clubData.category || '',
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
      } else {
        Alert.alert('Error', 'Club not found', [
          { text: 'OK', onPress: () => router.back() }
        ]);
      }
    } catch (error) {
      console.error('Error loading club:', error);
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

  const pickImage = async (type: 'cover' | 'logo') => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'We need camera roll permissions to select images.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        allowsEditing: true,
        aspect: type === 'cover' ? [16, 9] : [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        if (type === 'cover') {
          setCoverImage(result.assets[0].uri);
        } else {
          setLogo(result.assets[0].uri);
        }
      }
    } catch (error) {
      console.error('Image picker error:', error);
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
        isPublic,
        tags: selectedTags,
        socialLinks: Object.keys(socialLinks).length > 0 ? socialLinks : undefined,
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
      console.error('Update club error:', error);
      Alert.alert('Error', 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  if (initialLoading) {
    return (
      <View style={styles.container}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          stickyHeaderIndices={[0]}
        >
          <View>
            <LinearGradient
              colors={['#1B365D', '#2B4A73', '#3A5F8F']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.header}
            >
              <SafeAreaView edges={['top']}>
                <View style={styles.headerContent}>
                  <BackButton color="white" backgroundColor="rgba(255,255,255,0.2)" />
                  <Text style={styles.headerTitle}>Edit Club</Text>
                  <View style={styles.placeholder} />
                </View>
              </SafeAreaView>
            </LinearGradient>
          </View>
          <View style={styles.loadingContainer}>
            <Text variant="bodyLarge">Loading club data...</Text>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[0]}
      >
        {/* Header with Gradient */}
        <View>
          <LinearGradient
            colors={['#1B365D', '#2B4A73', '#3A5F8F']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.header}
          >
            <SafeAreaView edges={['top']}>
              <View style={styles.headerContent}>
                <BackButton color="white" backgroundColor="rgba(255,255,255,0.2)" />
                <Text style={styles.headerTitle}>Edit Club</Text>
                <View style={styles.placeholder} />
              </View>
            </SafeAreaView>
          </LinearGradient>
        </View>

        <View style={styles.content}>
          {/* Cover Image Section */}
          <Card style={styles.formCard} mode="elevated">
            <Card.Content style={styles.cardContent}>
              <View style={styles.sectionHeader}>
                <View style={styles.iconBadge}>
                  <IconButton icon="image" size={20} iconColor="#1B365D" />
                </View>
                <Text variant="titleLarge" style={styles.sectionTitle}>Cover Image</Text>
              </View>

              <TouchableOpacity onPress={() => pickImage('cover')} activeOpacity={0.7}>
                <LinearGradient
                  colors={['#E1E7F1', '#D4DCE8']}
                  style={styles.coverImageContainer}
                >
                  {coverImage ? (
                    <Image source={{ uri: coverImage }} style={styles.coverImage} />
                  ) : (
                    <View style={styles.imagePlaceholder}>
                      <IconButton icon="camera-plus" size={40} iconColor="#1B365D" />
                      <Text style={styles.imagePlaceholderText}>Tap to add cover image</Text>
                      <Text style={styles.imageHint}>16:9 recommended</Text>
                    </View>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </Card.Content>
          </Card>

          {/* Logo Section */}
          <Card style={styles.formCard} mode="elevated">
            <Card.Content style={styles.cardContent}>
              <View style={styles.sectionHeader}>
                <View style={styles.iconBadge}>
                  <IconButton icon="shield-account" size={20} iconColor="#1B365D" />
                </View>
                <Text variant="titleLarge" style={styles.sectionTitle}>Club Logo</Text>
              </View>

              <TouchableOpacity onPress={() => pickImage('logo')} activeOpacity={0.7}>
                <View style={styles.logoWrapper}>
                  <LinearGradient
                    colors={['#E1E7F1', '#D4DCE8']}
                    style={styles.logoContainer}
                  >
                    {logo ? (
                      <Image source={{ uri: logo }} style={styles.logoImage} />
                    ) : (
                      <View style={styles.logoPlaceholder}>
                        <IconButton icon="account-circle" size={40} iconColor="#1B365D" />
                        <Text style={styles.logoHint}>Club Logo</Text>
                      </View>
                    )}
                  </LinearGradient>
                </View>
              </TouchableOpacity>
            </Card.Content>
          </Card>

          {/* Basic Information */}
          <Card style={styles.formCard} mode="elevated">
            <Card.Content style={styles.cardContent}>
              <View style={styles.sectionHeader}>
                <View style={styles.iconBadge}>
                  <IconButton icon="information" size={20} iconColor="#1B365D" />
                </View>
                <Text variant="titleLarge" style={styles.sectionTitle}>Club Details</Text>
              </View>

              <TextInput
                label="Club Name *"
                value={formData.name}
                onChangeText={(value) => updateFormData('name', value)}
                mode="outlined"
                style={styles.input}
              />

              <TextInput
                label="Description *"
                value={formData.description}
                onChangeText={(value) => updateFormData('description', value)}
                mode="outlined"
                multiline
                numberOfLines={4}
                style={styles.input}
                placeholder="What is your club about? What activities do you do?"
              />

              <Text variant="bodyLarge" style={styles.fieldLabel}>Category *</Text>
              <Menu
                visible={showSportsMenu}
                onDismiss={() => setShowSportsMenu(false)}
                anchor={
                  <TouchableOpacity
                    style={styles.categorySelector}
                    onPress={() => setShowSportsMenu(true)}
                  >
                    <Text style={styles.categorySelectorText}>
                      {formData.sport || 'Select a category...'}
                    </Text>
                    <IconButton icon="chevron-down" size={20} />
                  </TouchableOpacity>
                }
              >
                {SPORTS.map((sport) => (
                  <Menu.Item
                    key={sport}
                    onPress={() => {
                      updateFormData('sport', sport);
                      setShowSportsMenu(false);
                    }}
                    title={sport}
                  />
                ))}
              </Menu>

              <TextInput
                label="Contact Email"
                value={formData.contactEmail}
                onChangeText={(value) => updateFormData('contactEmail', value)}
                mode="outlined"
                keyboardType="email-address"
                autoCapitalize="none"
                style={styles.input}
                left={<TextInput.Icon icon="email" />}
              />
            </Card.Content>
          </Card>

          {/* Social Links */}
          <Card style={styles.formCard} mode="elevated">
            <Card.Content style={styles.cardContent}>
              <View style={styles.sectionHeader}>
                <View style={styles.iconBadge}>
                  <IconButton icon="link-variant" size={20} iconColor="#1B365D" />
                </View>
                <Text variant="titleLarge" style={styles.sectionTitle}>Social Links</Text>
              </View>

              <TextInput
                label="Website"
                value={formData.website}
                onChangeText={(value) => updateFormData('website', value)}
                mode="outlined"
                autoCapitalize="none"
                style={styles.input}
                left={<TextInput.Icon icon="web" />}
              />

              <TextInput
                label="Instagram"
                value={formData.instagram}
                onChangeText={(value) => updateFormData('instagram', value)}
                mode="outlined"
                autoCapitalize="none"
                style={styles.input}
                left={<TextInput.Icon icon="instagram" />}
                placeholder="@username"
              />

              <TextInput
                label="Twitter / X"
                value={formData.twitter}
                onChangeText={(value) => updateFormData('twitter', value)}
                mode="outlined"
                autoCapitalize="none"
                style={styles.input}
                left={<TextInput.Icon icon="twitter" />}
                placeholder="@username"
              />

              <TextInput
                label="Facebook"
                value={formData.facebook}
                onChangeText={(value) => updateFormData('facebook', value)}
                mode="outlined"
                autoCapitalize="none"
                style={styles.input}
                left={<TextInput.Icon icon="facebook" />}
                placeholder="Page URL or username"
              />

              <TextInput
                label="TikTok"
                value={formData.tiktok}
                onChangeText={(value) => updateFormData('tiktok', value)}
                mode="outlined"
                autoCapitalize="none"
                style={styles.input}
                left={<TextInput.Icon icon="music-note" />}
                placeholder="@username"
              />

              <TextInput
                label="Discord"
                value={formData.discord}
                onChangeText={(value) => updateFormData('discord', value)}
                mode="outlined"
                autoCapitalize="none"
                style={styles.input}
                left={<TextInput.Icon icon="discord" />}
                placeholder="Invite link"
              />
            </Card.Content>
          </Card>

          {/* Settings */}
          <Card style={styles.formCard} mode="elevated">
            <Card.Content style={styles.cardContent}>
              <View style={styles.sectionHeader}>
                <View style={styles.iconBadge}>
                  <IconButton icon="cog" size={20} iconColor="#1B365D" />
                </View>
                <Text variant="titleLarge" style={styles.sectionTitle}>Club Settings</Text>
              </View>

              <Text variant="bodyLarge" style={styles.fieldLabel}>Club Type</Text>
              <Menu
                visible={showTagsMenu}
                onDismiss={() => setShowTagsMenu(false)}
                anchor={
                  <TouchableOpacity
                    style={styles.categorySelector}
                    onPress={() => setShowTagsMenu(true)}
                  >
                    <Text style={styles.categorySelectorText}>
                      {selectedTags.length > 0 ? selectedTags.join(', ') : 'Select club type(s)...'}
                    </Text>
                    <IconButton icon="chevron-down" size={20} />
                  </TouchableOpacity>
                }
              >
                {TAGS.map((tag) => (
                  <Menu.Item
                    key={tag}
                    onPress={() => toggleTag(tag)}
                    title={tag}
                    leadingIcon={selectedTags.includes(tag) ? 'check' : undefined}
                  />
                ))}
              </Menu>

              <View style={styles.switchRow}>
                <View style={styles.switchContent}>
                  <Text variant="bodyLarge" style={styles.switchLabel}>Public Club</Text>
                  <Text variant="bodySmall" style={styles.switchDescription}>
                    Anyone can discover and join
                  </Text>
                </View>
                <Switch value={isPublic} onValueChange={setIsPublic} />
              </View>
            </Card.Content>
          </Card>

          <Button
            mode="contained"
            onPress={handleUpdateClub}
            loading={loading}
            disabled={loading}
            style={styles.updateButton}
            contentStyle={styles.buttonContent}
          >
            Update Club
          </Button>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    paddingBottom: 16,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: 'white',
  },
  placeholder: {
    width: 40,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  content: {
    padding: 16,
  },
  formCard: {
    marginBottom: 16,
    borderRadius: 16,
    elevation: 2,
    backgroundColor: 'white',
  },
  cardContent: {
    padding: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  iconBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E1E7F1',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  sectionTitle: {
    fontWeight: 'bold',
    color: '#1B365D',
  },
  coverImageContainer: {
    height: 160,
    borderRadius: 12,
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
    color: '#1B365D',
    fontWeight: '600',
    marginTop: 8,
  },
  imageHint: {
    fontSize: 12,
    color: '#1B365D',
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
    color: '#1B365D',
    opacity: 0.7,
    marginTop: 4,
  },
  input: {
    marginBottom: 12,
    borderRadius: 12,
  },
  fieldLabel: {
    fontWeight: '600',
    marginBottom: 8,
    color: '#1B365D',
  },
  categorySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    minHeight: 56,
    marginBottom: 12,
  },
  categorySelectorText: {
    fontSize: 16,
    flex: 1,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#E1E7F1',
    marginTop: 8,
  },
  switchContent: {
    flex: 1,
    marginRight: 16,
  },
  switchLabel: {
    fontWeight: '600',
    color: '#1B365D',
  },
  switchDescription: {
    color: '#666',
    marginTop: 2,
  },
  updateButton: {
    marginTop: 8,
    marginBottom: 20,
    borderRadius: 12,
    backgroundColor: '#1B365D',
  },
  buttonContent: {
    paddingVertical: 12,
  },
});
