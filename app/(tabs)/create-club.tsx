// app/(tabs)/create-club.tsx
import React, { useState } from 'react';
import { View, ScrollView, StyleSheet, Alert, TouchableOpacity, Modal, FlatList, KeyboardAvoidingView, Platform } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import {
  Text,
  TextInput,
  Button,
  Card,
  useTheme,
  Switch,
  IconButton,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { createClub, uploadImage } from '../../lib/firebase';
import { useAuth, useThemeToggle } from '../_layout';
import { LinearGradient } from 'expo-linear-gradient';
import BackButton from '../../components/BackButton';

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

export default function CreateClubScreen() {
  const theme = useTheme();
  const { isDark } = useThemeToggle();
  const { user } = useAuth();
  const inputTheme = isDark ? { colors: { background: theme.colors.elevation.level2 } } : undefined;
  const [loading, setLoading] = useState(false);
  const [showSportsMenu, setShowSportsMenu] = useState(false);
  const [showTagsMenu, setShowTagsMenu] = useState(false);

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
    discord: '',
  });

  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isPublic, setIsPublic] = useState(true);
  const [coverImage, setCoverImage] = useState<string | null>(null);
  const [logo, setLogo] = useState<string | null>(null);

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
      // console.error('Image picker error:', error);
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
      if (formData.discord.trim()) socialLinks.discord = formData.discord.trim();

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
        createdBy: user.uid,
        isPublic,
        ...(location ? { location } : {}),
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
            onPress: () => router.push(`/club/${result.clubId}`)
          }]
        );
      } else {
        Alert.alert('Error', result.error || 'Failed to create club');
      }
    } catch (error) {
      // console.error('Create club error:', error);
      Alert.alert('Error', 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: theme.colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[0]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header with Gradient */}
        <View>
          <LinearGradient
            colors={(theme as any).gradients?.primary || ['#1B365D', '#2B4A73', '#3A5F8F']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.header}
          >
            <SafeAreaView edges={['top']}>
              <View style={styles.headerContent}>
                <BackButton color="white" backgroundColor="rgba(255,255,255,0.2)" />
                <Text style={styles.headerTitle}>Create Club</Text>
                <View style={styles.placeholder} />
              </View>
            </SafeAreaView>
          </LinearGradient>
        </View>

        <View style={styles.content}>
          {/* Cover Image Section */}
          <Card style={[styles.formCard, { backgroundColor: isDark ? theme.colors.elevation.level2 : theme.colors.surface }]} mode="elevated">
            <Card.Content style={styles.cardContent}>
              <View style={styles.sectionHeader}>
                <View style={[styles.iconBadge, { backgroundColor: theme.colors.primaryContainer }]}>
                  <IconButton icon="image" size={20} iconColor={theme.colors.primary} />
                </View>
                <Text variant="titleLarge" style={[styles.sectionTitle, { color: theme.colors.primary }]}>Cover Image</Text>
              </View>

              <TouchableOpacity onPress={() => pickImage('cover')} activeOpacity={0.7}>
                <LinearGradient
                  colors={isDark ? ['rgba(30,40,60,0.8)', 'rgba(20,30,48,0.8)'] : ['#E1E7F1', '#D4DCE8']}
                  style={styles.coverImageContainer}
                >
                  {coverImage ? (
                    <ExpoImage source={{ uri: coverImage }} style={styles.coverImage} contentFit="cover" transition={200} cachePolicy="memory-disk" />
                  ) : (
                    <View style={styles.imagePlaceholder}>
                      <IconButton icon="camera-plus" size={40} iconColor={theme.colors.primary} />
                      <Text style={styles.imagePlaceholderText}>Tap to add cover image</Text>
                      <Text style={styles.imageHint}>16:9 recommended</Text>
                    </View>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </Card.Content>
          </Card>

          {/* Logo Section */}
          <Card style={[styles.formCard, { backgroundColor: isDark ? theme.colors.elevation.level2 : theme.colors.surface }]} mode="elevated">
            <Card.Content style={styles.cardContent}>
              <View style={styles.sectionHeader}>
                <View style={[styles.iconBadge, { backgroundColor: theme.colors.primaryContainer }]}>
                  <IconButton icon="shield-account" size={20} iconColor={theme.colors.primary} />
                </View>
                <Text variant="titleLarge" style={[styles.sectionTitle, { color: theme.colors.primary }]}>Club Logo</Text>
              </View>

              <TouchableOpacity onPress={() => pickImage('logo')} activeOpacity={0.7}>
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
                        <Text style={styles.logoHint}>Club Logo</Text>
                      </View>
                    )}
                  </LinearGradient>
                </View>
              </TouchableOpacity>
            </Card.Content>
          </Card>

          {/* Basic Information */}
          <Card style={[styles.formCard, { backgroundColor: isDark ? theme.colors.elevation.level2 : theme.colors.surface }]} mode="elevated">
            <Card.Content style={styles.cardContent}>
              <View style={styles.sectionHeader}>
                <View style={[styles.iconBadge, { backgroundColor: theme.colors.primaryContainer }]}>
                  <IconButton icon="information" size={20} iconColor={theme.colors.primary} />
                </View>
                <Text variant="titleLarge" style={[styles.sectionTitle, { color: theme.colors.primary }]}>Club Details</Text>
              </View>

              <TextInput
                theme={inputTheme}
                label="Club Name *"
                value={formData.name}
                onChangeText={(value) => updateFormData('name', value)}
                mode="outlined"
                style={styles.input}
              />

              <TextInput
                theme={inputTheme}
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
              <TouchableOpacity
                style={[styles.categorySelector, { borderColor: theme.colors.outlineVariant, backgroundColor: isDark ? theme.colors.elevation.level2 : theme.colors.surface }]}
                onPress={() => setShowSportsMenu(true)}
              >
                <Text style={[styles.categorySelectorText, { color: formData.sport ? theme.colors.onSurface : theme.colors.onSurfaceVariant }]}>
                  {formData.sport || 'Select a category...'}
                </Text>
                <IconButton icon="chevron-down" size={20} pointerEvents="none" />
              </TouchableOpacity>

              <TextInput
                theme={inputTheme}
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

          {/* Location */}
          <Card style={[styles.formCard, { backgroundColor: isDark ? theme.colors.elevation.level2 : theme.colors.surface }]} mode="elevated">
            <Card.Content style={styles.cardContent}>
              <View style={styles.sectionHeader}>
                <View style={[styles.iconBadge, { backgroundColor: theme.colors.primaryContainer }]}>
                  <IconButton icon="map-marker" size={20} iconColor={theme.colors.primary} />
                </View>
                <Text variant="titleLarge" style={[styles.sectionTitle, { color: theme.colors.primary }]}>Location</Text>
              </View>

              <TextInput
                theme={inputTheme}
                label="Address"
                value={formData.address}
                onChangeText={(value) => updateFormData('address', value)}
                mode="outlined"
                style={styles.input}
                placeholder="123 Main St"
              />

              <TextInput
                theme={inputTheme}
                label="Address Line 2"
                value={formData.address2}
                onChangeText={(value) => updateFormData('address2', value)}
                mode="outlined"
                style={styles.input}
                placeholder="Suite, Unit, Floor (optional)"
              />

              <View style={styles.addressRow}>
                <TextInput
                  theme={inputTheme}
                  label="City"
                  value={formData.city}
                  onChangeText={(value) => updateFormData('city', value)}
                  mode="outlined"
                  style={[styles.input, styles.addressCity]}
                  placeholder="City"
                />
                <TextInput
                  theme={inputTheme}
                  label="State"
                  value={formData.state}
                  onChangeText={(value) => updateFormData('state', value)}
                  mode="outlined"
                  style={[styles.input, styles.addressState]}
                  placeholder="TX"
                  maxLength={2}
                  autoCapitalize="characters"
                />
                <TextInput
                  theme={inputTheme}
                  label="Zip"
                  value={formData.zipCode}
                  onChangeText={(value) => updateFormData('zipCode', value)}
                  mode="outlined"
                  style={[styles.input, styles.addressZip]}
                  placeholder="75001"
                  keyboardType="number-pad"
                  maxLength={5}
                />
              </View>
            </Card.Content>
          </Card>

          {/* Social Links */}
          <Card style={[styles.formCard, { backgroundColor: isDark ? theme.colors.elevation.level2 : theme.colors.surface }]} mode="elevated">
            <Card.Content style={styles.cardContent}>
              <View style={styles.sectionHeader}>
                <View style={[styles.iconBadge, { backgroundColor: theme.colors.primaryContainer }]}>
                  <IconButton icon="link-variant" size={20} iconColor={theme.colors.primary} />
                </View>
                <Text variant="titleLarge" style={[styles.sectionTitle, { color: theme.colors.primary }]}>Social Links</Text>
              </View>

              <TextInput
                theme={inputTheme}
                label="Website"
                value={formData.website}
                onChangeText={(value) => updateFormData('website', value)}
                mode="outlined"
                autoCapitalize="none"
                style={styles.input}
                left={<TextInput.Icon icon="web" />}
              />

              <TextInput
                theme={inputTheme}
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
                theme={inputTheme}
                label="Twitter"
                value={formData.twitter}
                onChangeText={(value) => updateFormData('twitter', value)}
                mode="outlined"
                autoCapitalize="none"
                style={styles.input}
                left={<TextInput.Icon icon="twitter" />}
                placeholder="@username"
              />

              <TextInput
                theme={inputTheme}
                label="Discord"
                value={formData.discord}
                onChangeText={(value) => updateFormData('discord', value)}
                mode="outlined"
                autoCapitalize="none"
                style={styles.input}
                placeholder="Invite link"
              />
            </Card.Content>
          </Card>

          {/* Settings */}
          <Card style={[styles.formCard, { backgroundColor: isDark ? theme.colors.elevation.level2 : theme.colors.surface }]} mode="elevated">
            <Card.Content style={styles.cardContent}>
              <View style={styles.sectionHeader}>
                <View style={[styles.iconBadge, { backgroundColor: theme.colors.primaryContainer }]}>
                  <IconButton icon="cog" size={20} iconColor={theme.colors.primary} />
                </View>
                <Text variant="titleLarge" style={[styles.sectionTitle, { color: theme.colors.primary }]}>Club Settings</Text>
              </View>

              <Text variant="bodyLarge" style={styles.fieldLabel}>Club Type</Text>
              <TouchableOpacity
                style={[styles.categorySelector, { borderColor: theme.colors.outlineVariant, backgroundColor: isDark ? theme.colors.elevation.level2 : theme.colors.surface }]}
                onPress={() => setShowTagsMenu(true)}
              >
                <Text style={[styles.categorySelectorText, { color: selectedTags.length > 0 ? theme.colors.onSurface : theme.colors.onSurfaceVariant }]}>
                  {selectedTags.length > 0 ? selectedTags.join(', ') : 'Select club type(s)...'}
                </Text>
                <IconButton icon="chevron-down" size={20} pointerEvents="none" />
              </TouchableOpacity>

              <View style={[styles.switchRow, { borderTopColor: theme.colors.outlineVariant }]}>
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
            onPress={handleCreateClub}
            loading={loading}
            disabled={loading}
            style={styles.createButton}
            contentStyle={styles.buttonContent}
          >
            Create Club
          </Button>
        </View>
      </ScrollView>

      {/* Category Picker Modal */}
      <Modal
        visible={showSportsMenu}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSportsMenu(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowSportsMenu(false)}
        >
          <View style={[styles.modalContent, { backgroundColor: isDark ? theme.colors.elevation.level2 : theme.colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text variant="titleMedium" style={[styles.modalTitle, { color: theme.colors.onSurface }]}>Select Category</Text>
              <IconButton icon="close" size={20} onPress={() => setShowSportsMenu(false)} />
            </View>
            <FlatList
              data={SPORTS}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.modalOption,
                    { borderBottomColor: theme.colors.outlineVariant },
                    formData.sport === item && { backgroundColor: theme.colors.primaryContainer },
                  ]}
                  onPress={() => {
                    updateFormData('sport', item);
                    setShowSportsMenu(false);
                  }}
                >
                  <Text style={[
                    styles.modalOptionText,
                    { color: theme.colors.onSurface },
                    formData.sport === item && { color: theme.colors.primary, fontWeight: '700' },
                  ]}>
                    {item}
                  </Text>
                  {formData.sport === item && (
                    <IconButton icon="check" size={18} iconColor={theme.colors.primary} style={{ margin: 0 }} />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Club Type Picker Modal */}
      <Modal
        visible={showTagsMenu}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTagsMenu(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowTagsMenu(false)}
        >
          <View style={[styles.modalContent, { backgroundColor: isDark ? theme.colors.elevation.level2 : theme.colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text variant="titleMedium" style={[styles.modalTitle, { color: theme.colors.onSurface }]}>Select Club Type(s)</Text>
              <IconButton icon="close" size={20} onPress={() => setShowTagsMenu(false)} />
            </View>
            <FlatList
              data={TAGS}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.modalOption,
                    { borderBottomColor: theme.colors.outlineVariant },
                    selectedTags.includes(item) && { backgroundColor: theme.colors.primaryContainer },
                  ]}
                  onPress={() => toggleTag(item)}
                >
                  <Text style={[
                    styles.modalOptionText,
                    { color: theme.colors.onSurface },
                    selectedTags.includes(item) && { color: theme.colors.primary, fontWeight: '700' },
                  ]}>
                    {item}
                  </Text>
                  {selectedTags.includes(item) && (
                    <IconButton icon="check" size={18} iconColor={theme.colors.primary} style={{ margin: 0 }} />
                  )}
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity
              style={[styles.modalDoneButton, { backgroundColor: theme.colors.primary }]}
              onPress={() => setShowTagsMenu(false)}
            >
              <Text style={[styles.modalDoneText, { color: theme.colors.onPrimary }]}>Done</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
  content: {
    padding: 16,
  },
  formCard: {
    marginBottom: 16,
    borderRadius: 16,
    elevation: 2,
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
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  sectionTitle: {
    fontWeight: 'bold',
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
  input: {
    marginBottom: 12,
    borderRadius: 12,
    backgroundColor: 'transparent',
  },
  addressRow: {
    flexDirection: 'row',
    gap: 8,
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
  fieldLabel: {
    fontWeight: '600',
    marginBottom: 8,
  },
  categorySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
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
    marginTop: 8,
  },
  switchContent: {
    flex: 1,
    marginRight: 16,
  },
  switchLabel: {
    fontWeight: '600',
  },
  switchDescription: {
    marginTop: 2,
  },
  createButton: {
    marginTop: 8,
    marginBottom: 20,
    borderRadius: 12,
  },
  buttonContent: {
    paddingVertical: 12,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '60%',
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  modalTitle: {
    fontWeight: '700',
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalOptionText: {
    fontSize: 16,
    flex: 1,
  },
  modalDoneButton: {
    marginHorizontal: 20,
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalDoneText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
