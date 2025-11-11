// app/(tabs)/store.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  FlatList,
  Image,
  TouchableOpacity,
  RefreshControl,
  Dimensions,
} from 'react-native';
import {
  Text,
  useTheme,
  Searchbar,
  Chip,
  Card,
  Surface,
  ActivityIndicator,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { getAllStoreItems } from '../../lib/firebase';
import type { StoreItem } from '../../lib/firebase';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 48) / 2; // 2 columns with padding

export default function StoreScreen() {
  const theme = useTheme();
  const [items, setItems] = useState<StoreItem[]>([]);
  const [filteredItems, setFilteredItems] = useState<StoreItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadStoreItems();
  }, []);

  useEffect(() => {
    filterItems();
  }, [searchQuery, items]);

  const loadStoreItems = async () => {
    try {
      setLoading(true);
      const result = await getAllStoreItems();
      if (result.success) {
        setItems(result.items);
      }
    } catch (error) {
      console.error('Error loading store items:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadStoreItems();
    setRefreshing(false);
  };

  const filterItems = () => {
    if (!searchQuery.trim()) {
      setFilteredItems(items);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = items.filter(
      (item) =>
        item.name.toLowerCase().includes(query) ||
        item.description.toLowerCase().includes(query) ||
        item.clubName.toLowerCase().includes(query)
    );
    setFilteredItems(filtered);
  };

  const renderStoreItem = ({ item }: { item: StoreItem }) => {
    const inStock = item.inventory > item.sold;

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push(`/store/${item.id}`)}
        activeOpacity={0.7}
      >
        <Surface style={[styles.cardSurface, { backgroundColor: theme.colors.surface }]} elevation={2}>
          <View style={styles.cardInner}>
            {/* Image */}
            <View style={styles.imageContainer}>
              {item.images && item.images.length > 0 ? (
                <Image
                  source={{ uri: item.images[0] }}
                  style={styles.itemImage}
                  resizeMode="cover"
                />
              ) : (
                <View style={[styles.placeholderImage, { backgroundColor: theme.colors.surfaceVariant }]}>
                  <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant }}>
                    No Image
                  </Text>
                </View>
              )}

              {/* Stock badge */}
              {!inStock && (
                <View style={[styles.stockBadge, { backgroundColor: theme.colors.errorContainer }]}>
                  <Text variant="labelSmall" style={{ color: theme.colors.onErrorContainer }}>
                    Sold Out
                  </Text>
                </View>
              )}
            </View>

            {/* Info */}
            <View style={styles.cardContent}>
              <Text variant="titleMedium" numberOfLines={2} style={styles.itemName}>
                {item.name}
              </Text>

              <Text variant="bodySmall" style={{ color: theme.colors.primary }} numberOfLines={1}>
                {item.clubName}
              </Text>

              <View style={styles.priceRow}>
                <Text variant="titleMedium" style={{ color: theme.colors.primary, fontWeight: 'bold' }}>
                  ${item.price.toFixed(2)}
                </Text>

                {item.pickupOnly ? (
                  <Chip compact textStyle={{ fontSize: 10 }} style={{ height: 24 }}>
                    Pickup Only
                  </Chip>
                ) : (
                  <Chip compact textStyle={{ fontSize: 10 }} style={{ height: 24 }}>
                    + Shipping
                  </Chip>
                )}
              </View>

              {item.inventory > 0 && (
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  {item.inventory - item.sold} left
                </Text>
              )}
            </View>
          </View>
        </Surface>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" />
          <Text variant="bodyLarge" style={{ marginTop: 16 }}>
            Loading store...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.colors.background }]}>
        <Text variant="headlineLarge" style={[styles.title, { color: theme.colors.onBackground }]}>
          RallyStore
        </Text>
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
          Shop from your favorite clubs
        </Text>
      </View>

      {/* Search */}
      <View style={[styles.searchContainer, { backgroundColor: theme.colors.background }]}>
        <Searchbar
          placeholder="Search products or clubs..."
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={styles.searchBar}
        />
      </View>

      {/* Items Grid */}
      {filteredItems.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text variant="headlineSmall" style={{ color: theme.colors.onSurfaceVariant }}>
            {searchQuery ? 'No items found' : 'No items available'}
          </Text>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 8 }}>
            {searchQuery ? 'Try a different search' : 'Check back later for new products'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredItems}
          renderItem={renderStoreItem}
          keyExtractor={(item) => item.id}
          numColumns={2}
          contentContainerStyle={styles.gridContainer}
          columnWrapperStyle={styles.row}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        />
      )}
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
  header: {
    padding: 24,
    paddingTop: 16,
  },
  title: {
    fontWeight: 'bold',
    marginBottom: 4,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  searchBar: {
    elevation: 0,
  },
  gridContainer: {
    padding: 16,
  },
  row: {
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  card: {
    width: CARD_WIDTH,
  },
  cardSurface: {
    borderRadius: 12,
  },
  cardInner: {
    overflow: 'hidden',
    borderRadius: 12,
  },
  imageContainer: {
    width: '100%',
    height: CARD_WIDTH,
    position: 'relative',
  },
  itemImage: {
    width: '100%',
    height: '100%',
  },
  placeholderImage: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stockBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  cardContent: {
    padding: 12,
  },
  itemName: {
    fontWeight: '600',
    marginBottom: 4,
    height: 44, // 2 lines
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 4,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
});
