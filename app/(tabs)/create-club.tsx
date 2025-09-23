// app/(tabs)/create-club.tsx
import React, { useState } from 'react';
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
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { createClub, uploadImage } from '../../lib/firebase';
import { useAuth } from '../_layout';
import { LinearGradient } from 'expo-linear-gradient';

const { width, height } = Dimensions.get('window');

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

export default function CreateClubScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [showSportsMenu, setShowSportsMenu] = useState(false);
  const [showTagsMenu, setShowTagsMenu] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    sport: 'Pickleball', // Default sport - will add sport selection later
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
    // Note: Sport validation temporarily disabled since we're using Pickleball as default
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
        if (!coverImageUrl) {
          Alert.alert(
            'Image Upload Failed', 
            'Cover image could not be uploaded. Continue creating club without image?',
            [
              { text: 'Cancel', style: 'cancel', onPress: () => { setLoading(false); return; } },
              { text: 'Continue', style: 'default' }
            ]
          );
        }
      }

      if (logo) {
        const logoPath = `clubs/logos/${Date.now()}_logo.jpg`;
        logoUrl = await uploadImage(logo, logoPath) || undefined;
        if (!logoUrl) {
          Alert.alert(
            'Image Upload Failed', 
            'Logo could not be uploaded. Continue creating club without logo?',
            [
              { text: 'Cancel', style: 'cancel', onPress: () => { setLoading(false); return; } },
              { text: 'Continue', style: 'default' }
            ]
          );
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
            onPress: () => router.push(`/club/${result.clubId}`)
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
  <SafeAreaView style={[styles.container, { backgroundColor: 'white' }]}>
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Header - compact style */}
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
            <Text style={styles.heroTitle}>Create Club</Text>
          </View>
          
          {/* White Rounded Bottom - bevel effect */}
          <View style={[styles.headerBottom, { backgroundColor: 'white' }]} />
        </LinearGradient>

        <View style={styles.content}>
          {/* Images Section */}
          <Card style={[styles.sectionCard, styles.imagesCard]} mode="elevated">
            <Card.Content style={styles.cardContent}>
              <Text variant="headlineSmall" style={[styles.sectionTitle, { color: theme.colors.primary }]}>
                Club Images
              </Text>
              <Text variant="bodyMedium" style={[styles.sectionDescription, { color: theme.colors.onSurfaceVariant }]}>
                Make your club stand out with great visuals
              </Text>
            
            <View style={styles.imageSection}>
              <Text variant="bodyMedium" style={styles.imageLabel}>Cover Image</Text>
              <Surface style={[styles.imageContainer, styles.coverImageContainer]} elevation={1}>
                {coverImage ? (
                  <Image source={{ uri: coverImage }} style={styles.coverImage} />
                ) : (
                  <View style={[styles.imagePlaceholder, styles.coverImagePlaceholder, { backgroundColor: theme.colors.surfaceVariant }]}>
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
                    <View style={[styles.imagePlaceholder, styles.logoPlaceholder, { backgroundColor: theme.colors.surfaceVariant }]}>
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
            </Card.Content>
          </Card>

          {/* Basic Info Section */}
          <Card style={[styles.sectionCard, styles.infoCard]} mode="elevated">
            <Card.Content style={styles.cardContent}>
              <Text variant="headlineSmall" style={[styles.sectionTitle, { color: theme.colors.primary }]}>
                Basic Information
              </Text>
              <Text variant="bodyMedium" style={[styles.sectionDescription, { color: theme.colors.onSurfaceVariant }]}>
                Tell us about your club
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

            {/* Sport Selection - Commented out for now, using Pickleball as default */}
            {/* 
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
            */}

            <TextInput
              label="Contact Email"
              value={formData.contactEmail}
              onChangeText={(value) => updateFormData('contactEmail', value)}
              mode="outlined"
              keyboardType="email-address"
              autoCapitalize="none"
              style={styles.input}
            />
            </Card.Content>
          </Card>

          {/* Social Links Section */}
          <Card style={[styles.sectionCard, styles.socialCard]} mode="elevated">
            <Card.Content style={styles.cardContent}>
              <Text variant="headlineSmall" style={[styles.sectionTitle, { color: theme.colors.primary }]}>
                Social Links
              </Text>
              <Text variant="bodyMedium" style={[styles.sectionDescription, { color: theme.colors.onSurfaceVariant }]}>
                Connect with your community (optional)
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
              <View style={styles.halfInputContainer}>
                <TextInput
                  label="Twitter"
                  value={formData.twitter}
                  onChangeText={(value) => updateFormData('twitter', value)}
                  mode="outlined"
                  autoCapitalize="none"
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
                  autoCapitalize="none"
                  style={styles.input}
                  placeholder="Invite link"
                />
              </View>
            </View>
            </Card.Content>
          </Card>

          {/* Tags & Settings Section */}
          <Card style={[styles.sectionCard, styles.settingsCard]} mode="elevated">
            <Card.Content style={styles.cardContent}>
              <Text variant="headlineSmall" style={[styles.sectionTitle, { color: theme.colors.primary }]}>
                Club Settings
              </Text>
              <Text variant="bodyMedium" style={[styles.sectionDescription, { color: theme.colors.onSurfaceVariant }]}>
                Customize your club preferences
              </Text>

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
              onPress={handleCreateClub}
              loading={loading}
              disabled={loading}
              style={styles.createButton}
              contentStyle={styles.buttonContent}
            >
              Create Club
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
    marginBottom: 20,
    borderRadius: 16,
    elevation: 2,
  },
  cardContent: {
    padding: 24,
  },
  sectionTitle: {
    marginBottom: 8,
    fontWeight: 'bold',
  },
  sectionDescription: {
    marginBottom: 24,
    lineHeight: 20,
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
  coverImagePlaceholder: {
    borderRadius: 12,
  },
  logoPlaceholder: {
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
    justifyContent: 'space-between',
    gap: 12,
  },
  halfInputContainer: {
    flex: 1,
  },
  input: {
    marginBottom: 20,
  },
  halfInput: {
    flex: 0.48,
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
  createButton: {
    marginTop: 16,
    borderRadius: 12,
  },
  buttonContent: {
    paddingVertical: 12,
  },
});
