// app/club/create.tsx
import React, { useState } from 'react';
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
  Divider
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { createClub, uploadImage } from '../../lib/firebase';
import { useAuth } from '../_layout';

const CATEGORIES = [
  'Academic', 'Sports', 'Arts & Culture', 'Technology', 'Business',
  'Community Service', 'Hobbies', 'Religious', 'Political', 'Social'
];

const TAGS = [
  'Beginner Friendly', 'Competitive', 'Social', 'Professional Development',
  'Weekly Meetings', 'Monthly Events', 'Fundraising', 'Networking'
];

export default function CreateClubScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: '',
    location: '',
    university: '',
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
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: type === 'cover' ? [16, 9] : [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        if (type === 'cover') {
          setCoverImage(result.assets[0].uri);
        } else {
          setLogo(result.assets[0].uri);
        }
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
    if (!formData.category) {
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

      // Upload images if selected
      if (coverImage) {
        const coverPath = `clubs/covers/${Date.now()}_cover.jpg`;
        coverImageUrl = await uploadImage(coverImage, coverPath) || undefined;
      }

      if (logo) {
        const logoPath = `clubs/logos/${Date.now()}_logo.jpg`;
        logoUrl = await uploadImage(logo, logoPath) || undefined;
      }

      const clubData = {
        name: formData.name.trim(),
        description: formData.description.trim(),
        category: formData.category,
        location: formData.location.trim() || undefined,
        university: formData.university.trim() || undefined,
        contactEmail: formData.contactEmail.trim() || undefined,
        coverImage: coverImageUrl,
        logo: logoUrl,
        createdBy: user.uid,
        isPublic,
        tags: selectedTags.length > 0 ? selectedTags : undefined,
        socialLinks: {
          website: formData.website.trim() || undefined,
          instagram: formData.instagram.trim() || undefined,
          twitter: formData.twitter.trim() || undefined,
          discord: formData.discord.trim() || undefined,
        }
      };

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
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text variant="headlineMedium" style={[styles.title, { color: theme.colors.primary }]}>
            Create a Club
          </Text>
          <Text variant="bodyMedium" style={[styles.subtitle, { color: theme.colors.onSurface }]}>
            Start building your community
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

            {/* Category Selection */}
            <Text variant="bodyMedium" style={styles.fieldLabel}>Category *</Text>
            <View style={styles.categoryContainer}>
              {CATEGORIES.map((category) => (
                <Chip
                  key={category}
                  selected={formData.category === category}
                  onPress={() => updateFormData('category', category)}
                  style={styles.categoryChip}
                  showSelectedOverlay
                >
                  {category}
                </Chip>
              ))}
            </View>

            <View style={styles.row}>
              <TextInput
                label="Location"
                value={formData.location}
                onChangeText={(value) => updateFormData('location', value)}
                mode="outlined"
                style={[styles.input, styles.halfInput]}
                placeholder="e.g., Student Center Room 201"
              />
              <TextInput
                label="University"
                value={formData.university}
                onChangeText={(value) => updateFormData('university', value)}
                mode="outlined"
                style={[styles.input, styles.halfInput]}
                placeholder="e.g., Boston University"
              />
            </View>

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
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
  categoryContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  categoryChip: {
    margin: 4,
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
  createButton: {
    marginTop: 8,
  },
  buttonContent: {
    paddingVertical: 8,
  },
});
