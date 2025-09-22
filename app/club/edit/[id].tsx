// app/club/edit/[id].tsx
import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, Alert, Image } from 'react-native';
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
  Appbar,
  Menu
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { getClub, updateClub, uploadImage, testStorageConnection } from '../../../lib/firebase';
import { useAuth } from '../../_layout';
import type { Club } from '../../../lib/firebase';

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
        
        // Check if user is admin
        if (!user || !clubData.admins.includes(user.uid)) {
          Alert.alert('Access Denied', 'You are not authorized to edit this club.', [
            { text: 'OK', onPress: () => router.back() }
          ]);
          return;
        }
        
        // Populate form with existing data
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
      // Request permissions first
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
      // Test storage first
      console.log('Testing storage before upload...');
      const storageTest = await testStorageConnection();
      if (!storageTest.success) {
        Alert.alert('Storage Error', `Storage test failed: ${storageTest.error}`);
        setLoading(false);
        return;
      }
      console.log('Storage test passed!');
      
      let coverImageUrl = originalCoverImage;
      let logoUrl = originalLogo;

      // Upload new cover image if changed
      if (coverImage && coverImage !== originalCoverImage) {
        console.log('Uploading new cover image...');
        const coverPath = `clubs/covers/${Date.now()}_cover.jpg`;
        const uploadedCoverUrl = await uploadImage(coverImage, coverPath);
        if (uploadedCoverUrl) {
          coverImageUrl = uploadedCoverUrl;
          console.log('Cover image uploaded successfully');
        } else {
          Alert.alert('Upload Failed', 'Failed to upload cover image');
        }
      }

      // Upload new logo if changed
      if (logo && logo !== originalLogo) {
        console.log('Uploading new logo...');
        const logoPath = `clubs/logos/${Date.now()}_logo.jpg`;
        const uploadedLogoUrl = await uploadImage(logo, logoPath);
        if (uploadedLogoUrl) {
          logoUrl = uploadedLogoUrl;
          console.log('Logo uploaded successfully');
        } else {
          Alert.alert('Upload Failed', 'Failed to upload logo');
        }
      }

      // Clean up the social links data
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
        tags: selectedTags.length > 0 ? selectedTags : [],
        socialLinks: Object.keys(socialLinks).length > 0 ? socialLinks : undefined,
      };

      // Only update optional fields if they have values or were cleared
      if (formData.contactEmail.trim() || club.contactEmail) {
        clubData.contactEmail = formData.contactEmail.trim() || null;
      }
      if (coverImageUrl || club.coverImage) {
        clubData.coverImage = coverImageUrl || null;
      }
      if (logoUrl || club.logo) {
        clubData.logo = logoUrl || null;
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
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <Appbar.Header>
          <Appbar.BackAction onPress={() => router.back()} />
          <Appbar.Content title="Edit Club" />
        </Appbar.Header>
        <View style={styles.loadingContainer}>
          <Text variant="bodyLarge">Loading club data...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* App Bar with Back Button */}
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Edit Club" />
      </Appbar.Header>
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text variant="headlineMedium" style={[styles.title, { color: theme.colors.primary }]}>
            Edit Club
          </Text>
          <Text variant="bodyMedium" style={[styles.subtitle, { color: theme.colors.onSurface }]}>
            Update your club information
          </Text>
        </View>

        <Card style={styles.card}>
          <Card.Content style={styles.cardContent}>
            {/* Cover Image */}
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Club Images
            </Text>
            
            <View style={styles.imageSection}>
              <Text variant="bodyMedium" style={styles.imageLabel}>Cover Image</Text>
              <View style={[styles.imageContainer, styles.coverImageContainer]}>
                {coverImage ? (
                  <Image source={{ uri: coverImage }} style={styles.coverImage} />
                ) : (
                  <View style={[styles.imagePlaceholder, styles.coverImagePlaceholder, { backgroundColor: theme.colors.surfaceVariant }]}>
                    <Text style={{ color: theme.colors.onSurfaceVariant }}>16:9 aspect ratio</Text>
                  </View>
                )}
                <IconButton
                  icon="camera"
                  mode="contained"
                  onPress={() => pickImage('cover')}
                  style={styles.imageButton}
                />
              </View>
            </View>

            <View style={styles.imageSection}>
              <Text variant="bodyMedium" style={styles.imageLabel}>Logo</Text>
              <View style={[styles.imageContainer, styles.logoContainer]}>
                {logo ? (
                  <Image source={{ uri: logo }} style={styles.logoImage} />
                ) : (
                  <View style={[styles.imagePlaceholder, styles.logoPlaceholder, { backgroundColor: theme.colors.surfaceVariant }]}>
                    <Text style={{ color: theme.colors.onSurfaceVariant }}>Square</Text>
                  </View>
                )}
                <IconButton
                  icon="camera"
                  mode="contained"
                  onPress={() => pickImage('logo')}
                  style={styles.imageButton}
                />
              </View>
            </View>

            <Divider style={styles.divider} />

            {/* Basic Information */}
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Basic Information
            </Text>

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

            {/* Sport Selection */}
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

            {/* Social Links */}
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Social Links (Optional)
            </Text>

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

            <View style={styles.row}>
              <TextInput
                label="Twitter"
                value={formData.twitter}
                onChangeText={(value) => updateFormData('twitter', value)}
                mode="outlined"
                autoCapitalize="none"
                style={[styles.input, styles.halfInput]}
                left={<TextInput.Icon icon="twitter" />}
                placeholder="@username"
              />
              <TextInput
                label="Discord"
                value={formData.discord}
                onChangeText={(value) => updateFormData('discord', value)}
                mode="outlined"
                autoCapitalize="none"
                style={[styles.input, styles.halfInput]}
                placeholder="Invite link"
              />
            </View>

            <Divider style={styles.divider} />

            {/* Tags */}
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Tags (Optional)
            </Text>
            <Text variant="bodySmall" style={[styles.tagsHint, { color: theme.colors.onSurfaceVariant }]}>
              Help members find your club
            </Text>

            <View style={styles.tagsContainer}>
              {TAGS.map((tag) => (
                <Chip
                  key={tag}
                  selected={selectedTags.includes(tag)}
                  onPress={() => toggleTag(tag)}
                  style={styles.tagChip}
                  showSelectedOverlay
                >
                  {tag}
                </Chip>
              ))}
            </View>

            <Divider style={styles.divider} />

            {/* Privacy Settings */}
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Privacy Settings
            </Text>

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
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    textAlign: 'center',
    opacity: 0.8,
  },
  card: {
    elevation: 4,
  },
  cardContent: {
    padding: 24,
  },
  sectionTitle: {
    marginBottom: 16,
    fontWeight: 'bold',
  },
  imageSection: {
    marginBottom: 16,
  },
  imageLabel: {
    marginBottom: 8,
    fontWeight: '500',
  },
  imageContainer: {
    position: 'relative',
  },
  coverImageContainer: {
    height: 120,
    marginBottom: 16,
  },
  logoContainer: {
    width: 100,
    height: 100,
    alignSelf: 'center',
  },
  coverImage: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
  },
  logoImage: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
  },
  imagePlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 2,
    borderStyle: 'dashed',
  },
  coverImagePlaceholder: {
    width: '100%',
    height: '100%',
  },
  logoPlaceholder: {
    width: '100%',
    height: '100%',
  },
  imageButton: {
    position: 'absolute',
    bottom: 8,
    right: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  input: {
    marginBottom: 16,
  },
  halfInput: {
    flex: 0.48,
  },
  fieldLabel: {
    marginBottom: 8,
    fontWeight: '500',
  },
  sportSelector: {
    marginBottom: 16,
    justifyContent: 'flex-start',
  },
  sportSelectorContent: {
    flexDirection: 'row-reverse',
  },
  tagsHint: {
    marginBottom: 12,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  tagChip: {
    margin: 4,
  },
  switchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  switchContent: {
    flex: 1,
    marginRight: 16,
  },
  divider: {
    marginVertical: 20,
  },
  updateButton: {
    marginTop: 8,
  },
  buttonContent: {
    paddingVertical: 8,
  },
});
