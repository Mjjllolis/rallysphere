// app/club/edit/[id].tsx - Modern Edit Club Screen
import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, Alert, Image, Dimensions } from 'react-native';
import { 
  Text, 
  TextInput, 
  Button, 
  Card,
  useTheme,
  Switch,
  Chip,
  IconButton,
  Divider,
  Menu,
  Surface
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { getClub, updateClub, uploadImage, testStorageConnection } from '../../../lib/firebase';
import { useAuth } from '../../_layout';
import type { Club } from '../../../lib/firebase';

const { width, height } = Dimensions.get('window');

const SPORTS = [
  'Basketball', 'Football', 'Soccer', 'Tennis', 'Baseball', 'Volleyball',
  'Swimming', 'Track & Field', 'Golf', 'Hockey', 'Wrestling', 'Cross Country',
  'Softball', 'Lacrosse', 'Rugby', 'Cricket', 'Badminton', 'Table Tennis',
  'Martial Arts', 'Cycling', 'Running', 'Fitness', 'Other'
];

const TAGS = [
  'Beginner Friendly', 'Competitive', 'Social', 'Professional Development',
  'Weekly Meetings', 'Monthly Events', 'Fundraising', 'Networking'
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
      Alert.alert('Error', 'Please select a sport');
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
      <SafeAreaView style={[styles.container, { backgroundColor: 'white' }]}>
        <LinearGradient
          colors={['#2C5282', '#2A4B7C']}
          style={styles.heroHeader}
        >
          <IconButton 
            icon="arrow-left" 
            size={24}
            onPress={() => router.back()}
            style={styles.backButton}
            iconColor="white"
          />
          <View style={styles.heroContent}>
            <Text style={styles.heroTitle}>Edit Club</Text>
          </View>
          <View style={[styles.headerBottom, { backgroundColor: 'white' }]} />
        </LinearGradient>
        <View style={styles.loadingContainer}>
          <Text variant="bodyLarge">Loading club data...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: 'white' }]}>
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={['#2C5282', '#2A4B7C']}
          style={styles.heroHeader}
        >
          <IconButton 
            icon="arrow-left" 
            size={24}
            onPress={() => router.back()}
            style={styles.backButton}
            iconColor="white"
          />
          <View style={styles.heroContent}>
            <Text style={styles.heroTitle}>Edit Club</Text>
          </View>
          <View style={[styles.headerBottom, { backgroundColor: 'white' }]} />
        </LinearGradient>

        <View style={styles.content}>
          <Card style={styles.sectionCard} mode="elevated">
            <Card.Content style={styles.cardContent}>
              <Text variant="headlineSmall" style={[styles.sectionTitle, { color: theme.colors.primary }]}>
                Club Images
              </Text>
              
              <View style={styles.imageSection}>
                <Text variant="bodyMedium" style={styles.imageLabel}>Cover Image</Text>
                <Surface style={[styles.imageContainer, styles.coverImageContainer]} elevation={1}>
                  {coverImage ? (
                    <Image source={{ uri: coverImage }} style={styles.coverImage} />
                  ) : (
                    <View style={[styles.imagePlaceholder, { backgroundColor: theme.colors.surfaceVariant }]}>
                      <IconButton icon="image" size={32} iconColor={theme.colors.onSurfaceVariant} />
                      <Text style={{ color: theme.colors.onSurfaceVariant, marginTop: 8 }}>16:9 aspect ratio</Text>
                    </View>
                  )}
                  <Surface style={styles.imageButtonContainer} elevation={3}>
                    <IconButton
                      icon="camera"
                      mode="contained"
                      onPress={() => pickImage('cover')}
                      size={20}
                    />
                  </Surface>
                </Surface>
              </View>

              <View style={styles.imageSection}>
                <Text variant="bodyMedium" style={styles.imageLabel}>Logo</Text>
                <View style={styles.logoWrapper}>
                  <Surface style={[styles.imageContainer, styles.logoContainer]} elevation={1}>
                    {logo ? (
                      <Image source={{ uri: logo }} style={styles.logoImage} />
                    ) : (
                      <View style={[styles.imagePlaceholder, { backgroundColor: theme.colors.surfaceVariant }]}>
                        <IconButton icon="account-circle" size={24} iconColor={theme.colors.onSurfaceVariant} />
                        <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12 }}>Square</Text>
                      </View>
                    )}
                    <Surface style={styles.logoButtonContainer} elevation={3}>
                      <IconButton
                        icon="camera"
                        mode="contained"
                        onPress={() => pickImage('logo')}
                        size={16}
                      />
                    </Surface>
                  </Surface>
                </View>
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
              />

              <Text variant="bodyMedium" style={styles.fieldLabel}>Sport *</Text>
              <Menu
                visible={showSportsMenu}
                onDismiss={() => setShowSportsMenu(false)}
                anchor={
                  <Button 
                    mode="outlined" 
                    onPress={() => setShowSportsMenu(true)}
                    style={styles.sportSelector}
                    contentStyle={styles.sportSelectorContent}
                    icon="chevron-down"
                  >
                    {formData.sport || 'Select a sport'}
                  </Button>
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
              />

              <Divider style={styles.divider} />

              <Text variant="titleMedium" style={styles.sectionTitle}>Social Links</Text>

              <TextInput
                label="Website"
                value={formData.website}
                onChangeText={(value) => updateFormData('website', value)}
                mode="outlined"
                style={styles.input}
                left={<TextInput.Icon icon="web" />}
              />

              <TextInput
                label="Instagram"
                value={formData.instagram}
                onChangeText={(value) => updateFormData('instagram', value)}
                mode="outlined"
                style={styles.input}
                left={<TextInput.Icon icon="instagram" />}
                placeholder="@username"
              />

              <View style={styles.row}>
                <View style={styles.halfInputContainer}>
                  <TextInput
                    label="Twitter"
                    value={formData.twitter}
                    onChangeText={(value) => updateFormData('twitter', value)}
                    mode="outlined"
                    style={styles.input}
                    left={<TextInput.Icon icon="twitter" />}
                    placeholder="@username"
                  />
                </View>
                <View style={styles.halfInputContainer}>
                  <TextInput
                    label="Discord"
                    value={formData.discord}
                    onChangeText={(value) => updateFormData('discord', value)}
                    mode="outlined"
                    style={styles.input}
                    placeholder="Invite link"
                  />
                </View>
              </View>

              <Divider style={styles.divider} />

              <Text variant="bodyMedium" style={styles.fieldLabel}>Club Type</Text>
              <Menu
                visible={showTagsMenu}
                onDismiss={() => setShowTagsMenu(false)}
                anchor={
                  <Button 
                    mode="outlined" 
                    onPress={() => setShowTagsMenu(true)}
                    style={styles.tagSelector}
                    contentStyle={styles.tagSelectorContent}
                    icon="chevron-down"
                  >
                    {selectedTags.length > 0 ? selectedTags.join(', ') : 'Select club type(s)'}
                  </Button>
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

              <View style={styles.switchContainer}>
                <View style={styles.switchContent}>
                  <Text variant="bodyLarge">Public Club</Text>
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    Anyone can discover and join this club
                  </Text>
                </View>
                <Switch
                  value={isPublic}
                  onValueChange={setIsPublic}
                />
              </View>

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
            </Card.Content>
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
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
    padding: 20,
  },
  heroHeader: {
    height: 120,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 40,
    position: 'relative',
    overflow: 'hidden',
  },
  backButton: {
    position: 'absolute',
    left: 20,
    top: 50,
    zIndex: 10,
  },
  heroContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 10,
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
    textAlign: 'center',
  },
  headerBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 30,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    padding: 20,
    paddingTop: 20,
  },
  sectionCard: {
    borderRadius: 16,
    elevation: 2,
  },
  cardContent: {
    padding: 24,
  },
  sectionTitle: {
    marginBottom: 16,
    fontWeight: 'bold',
  },
  imageSection: {
    marginBottom: 24,
  },
  imageLabel: {
    marginBottom: 12,
    fontWeight: '600',
  },
  imageContainer: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  coverImageContainer: {
    height: 140,
    position: 'relative',
  },
  logoWrapper: {
    alignItems: 'center',
  },
  logoContainer: {
    width: 120,
    height: 120,
    position: 'relative',
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: 12,
  },
  imageButtonContainer: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    borderRadius: 20,
  },
  logoButtonContainer: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    borderRadius: 16,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  halfInputContainer: {
    flex: 1,
  },
  input: {
    marginBottom: 20,
  },
  fieldLabel: {
    marginBottom: 12,
    fontWeight: '600',
  },
  sportSelector: {
    marginBottom: 20,
    justifyContent: 'flex-start',
  },
  sportSelectorContent: {
    flexDirection: 'row-reverse',
  },
  tagSelector: {
    marginBottom: 20,
    justifyContent: 'flex-start',
  },
  tagSelectorContent: {
    flexDirection: 'row-reverse',
  },
  switchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
    paddingVertical: 8,
  },
  switchContent: {
    flex: 1,
    marginRight: 16,
  },
  divider: {
    marginVertical: 24,
  },
  updateButton: {
    marginTop: 16,
    borderRadius: 12,
  },
  buttonContent: {
    paddingVertical: 12,
  },
});
