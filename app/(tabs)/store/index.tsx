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
  TextInput,
} from 'react-native';
import {
  Text,
  useTheme,
  ActivityIndicator,
} from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { getAllStoreItems } from '../../../lib/firebase';
import type { StoreItem } from '../../../lib/firebase';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useCart } from '../../../lib/cartContext';
import { useFavorites } from '../../../lib/favoritesContext';
import FilterPanel from '../../../components/FilterPanel';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 48) / 2;

const BASE_CATEGORIES = [
  { id: 'all', label: 'Everything' },
];

const SORT_OPTIONS = [
  { id: 'featured', label: 'Featured' },
  { id: 'price-low', label: 'Price: Low to High' },
  { id: 'price-high', label: 'Price: High to Low' },
  { id: 'newest', label: 'Newest' },
];

const MOCK_ITEMS: StoreItem[] = [
  {
    id: 'mock-1',
    name: 'Rally Club T-Shirt',
    description: 'Official Rally Club merchandise - premium cotton t-shirt',
    price: 25,
    inventory: 50,
    sold: 12,
    category: 'Apparel',
    clubId: 'mock-club-1',
    clubName: 'Rally Enthusiasts',
    images: ['https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=400'],
    createdAt: { toDate: () => new Date() } as any,
  },
  {
    id: 'mock-2',
    name: 'Campus Water Bottle',
    description: 'Eco-friendly stainless steel water bottle',
    price: 18,
    inventory: 30,
    sold: 8,
    category: 'Accessories',
    clubId: 'mock-club-2',
    clubName: 'Student Council',
    images: ['https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=400'],
    createdAt: { toDate: () => new Date() } as any,
  },
  {
    id: 'mock-3',
    name: 'Team Hoodie',
    description: 'Comfortable hoodie with team logo',
    price: 45,
    inventory: 25,
    sold: 15,
    category: 'Apparel',
    clubId: 'mock-club-3',
    clubName: 'Athletics Department',
    images: ['https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=400'],
    createdAt: { toDate: () => new Date() } as any,
  },
  {
    id: 'mock-4',
    name: 'Club Sticker Pack',
    description: 'Set of 10 assorted club stickers',
    price: 8,
    inventory: 100,
    sold: 45,
    category: 'Accessories',
    clubId: 'mock-club-4',
    clubName: 'Art & Design Club',
    images: ['https://images.unsplash.com/photo-1611532736579-6b16e2b50449?w=400'],
    createdAt: { toDate: () => new Date() } as any,
  },
  {
    id: 'mock-5',
    name: 'Event Ticket Bundle',
    description: '3-event pass for spring semester activities',
    price: 35,
    inventory: 20,
    sold: 5,
    category: 'Tickets',
    clubId: 'mock-club-5',
    clubName: 'Event Committee',
    images: ['https://images.unsplash.com/photo-1594608661623-aa0bd8a69834?w=400'],
    createdAt: { toDate: () => new Date() } as any,
  },
  {
    id: 'mock-6',
    name: 'Notebook Set',
    description: 'Premium branded notebooks (3-pack)',
    price: 15,
    inventory: 40,
    sold: 22,
    category: 'Stationery',
    clubId: 'mock-club-6',
    clubName: 'Academic Society',
    images: ['https://images.unsplash.com/photo-1517971129774-8a2b38fa128e?w=400'],
    createdAt: { toDate: () => new Date() } as any,
  },
];

export default function StoreScreen() {
  const theme = useTheme();
  const { getCartCount } = useCart();
  const { getFavoritesCount } = useFavorites();
  const insets = useSafeAreaInsets();

  const [items, setItems] = useState<StoreItem[]>([]);
  const [filteredItems, setFilteredItems] = useState<StoreItem[]>([]);
  const [categories, setCategories] = useState(BASE_CATEGORIES);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedSort, setSelectedSort] = useState('featured');
  const [filterPanelVisible, setFilterPanelVisible] = useState(false);

  const cartCount = getCartCount();
  const favoritesCount = getFavoritesCount();

  useEffect(() => {
    loadStoreItems();
  }, []);

  useEffect(() => {
    filterAndSortItems();
  }, [searchQuery, items, selectedCategory, selectedSort]);

  const loadStoreItems = async () => {
    try {
      setLoading(true);
      const result = await getAllStoreItems();

      // Merge Firebase items with mock items
      const allItems = result.success ? [...result.items, ...MOCK_ITEMS] : MOCK_ITEMS;
      setItems(allItems);

      // Extract unique categories from all items
      const uniqueCategories = new Set<string>();
      allItems.forEach((item) => {
        if (item.category) {
          uniqueCategories.add(item.category);
        }
      });

      // Build dynamic categories
      const dynamicCategories = [
        { id: 'all', label: 'Everything' },
        ...Array.from(uniqueCategories)
          .sort()
          .map((cat) => ({ id: cat, label: cat })),
      ];

      setCategories(dynamicCategories);
    } catch (error) {
      console.error('Error loading store items:', error);
      // If Firebase fails, still show mock items
      setItems(MOCK_ITEMS);

      const uniqueCategories = new Set<string>();
      MOCK_ITEMS.forEach((item) => {
        if (item.category) {
          uniqueCategories.add(item.category);
        }
      });

      const dynamicCategories = [
        { id: 'all', label: 'Everything' },
        ...Array.from(uniqueCategories)
          .sort()
          .map((cat) => ({ id: cat, label: cat })),
      ];

      setCategories(dynamicCategories);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadStoreItems();
    setRefreshing(false);
  };

  const filterAndSortItems = () => {
    let filtered = [...items];

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (item) =>
          item.name.toLowerCase().includes(query) ||
          item.description.toLowerCase().includes(query) ||
          item.clubName.toLowerCase().includes(query)
      );
    }

    if (selectedCategory !== 'all') {
      filtered = filtered.filter((item) => item.category === selectedCategory);
    }

    switch (selectedSort) {
      case 'price-low':
        filtered.sort((a, b) => a.price - b.price);
        break;
      case 'price-high':
        filtered.sort((a, b) => b.price - a.price);
        break;
      case 'newest':
        filtered.sort((a, b) => {
          const dateA = a.createdAt?.toDate?.() || new Date(0);
          const dateB = b.createdAt?.toDate?.() || new Date(0);
          return dateB.getTime() - dateA.getTime();
        });
        break;
      default:
        break;
    }

    setFilteredItems(filtered);
  };

  const renderStoreItem = ({ item }: { item: StoreItem }) => {
    const inStock = item.inventory > item.sold;

    return (
      <TouchableOpacity
        style={[styles.card, { backgroundColor: theme.colors.surface }]}
        onPress={() => router.push(`/(tabs)/store/${item.id}`)}
        activeOpacity={0.9}
      >
        {/* Image Container */}
        <View style={styles.imageContainer}>
          {item.images && item.images.length > 0 ? (
            <>
              <Image
                source={{ uri: item.images[0] }}
                style={styles.itemImage}
                resizeMode="cover"
              />
              {!inStock && (
                <View style={styles.soldOutOverlay}>
                  <LinearGradient
                    colors={['rgba(0,0,0,0.4)', 'rgba(0,0,0,0.7)']}
                    style={styles.soldOutGradient}
                  >
                    <Text style={styles.soldOutText}>SOLD OUT</Text>
                  </LinearGradient>
                </View>
              )}
              {/* Category Badge */}
              {item.category && (
                <View style={[styles.categoryBadge, { backgroundColor: theme.colors.primary }]}>
                  <Text style={styles.categoryBadgeText}>{item.category}</Text>
                </View>
              )}
            </>
          ) : (
            <View style={styles.placeholderImage}>
              <Ionicons name="image-outline" size={40} color="#ccc" />
            </View>
          )}
        </View>

        {/* Product Info */}
        <View style={styles.cardContent}>
          {/* Club Name Badge */}
          <View style={styles.clubBadge}>
            <Ionicons name="people" size={12} color={theme.colors.primary} />
            <Text style={[styles.clubText, { color: theme.colors.primary }]} numberOfLines={1}>
              {item.clubName}
            </Text>
          </View>

          {/* Product Name */}
          <Text style={[styles.itemName, { color: theme.colors.onSurface }]} numberOfLines={2}>
            {item.name}
          </Text>

          {/* Price and Stock Row */}
          <View style={styles.priceRow}>
            <Text style={[styles.price, { color: theme.colors.primary }]}>${item.price.toFixed(0)}</Text>
            {inStock && item.inventory - item.sold < 10 && (
              <View style={styles.stockBadge}>
                <Text style={styles.stockText}>{item.inventory - item.sold} left</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Header with Gradient */}
      <LinearGradient
        colors={[theme.colors.primary, theme.colors.primary + 'DD']}
        style={[styles.headerGradient, { paddingTop: insets.top }]}
      >
        <View style={styles.header}>
          {/* Title */}
          <Text style={styles.headerTitle}>Store</Text>

          {/* Search Bar */}
          <View style={styles.searchRow}>
            <View style={styles.searchContainer}>
              <Ionicons name="search-outline" size={20} color="#999" style={styles.searchIcon} />
              <TextInput
                placeholder="Search products..."
                value={searchQuery}
                onChangeText={setSearchQuery}
                style={styles.searchInput}
                placeholderTextColor="#999"
              />
            </View>
            <TouchableOpacity style={styles.iconButton} onPress={() => setFilterPanelVisible(true)}>
              <Ionicons name="options-outline" size={22} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconButton} onPress={() => router.push('/profile/orders')}>
              <Ionicons name="receipt-outline" size={22} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconButton} onPress={() => router.push('/(tabs)/store/favorites')}>
              <Ionicons name="heart" size={22} color="#fff" />
              {favoritesCount > 0 && (
                <View style={[styles.badge, { backgroundColor: '#FF4444' }]}>
                  <Text style={styles.badgeText}>{favoritesCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </LinearGradient>

      {/* Items Grid */}
      {filteredItems.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="bag-outline" size={64} color="#ccc" />
          <Text style={styles.emptyTitle}>
            {searchQuery ? 'No items found' : 'No items available'}
          </Text>
          <Text style={styles.emptySubtitle}>
            {searchQuery ? 'Try a different search' : 'Check back soon'}
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
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Filter Panel */}
      <FilterPanel
        visible={filterPanelVisible}
        onClose={() => setFilterPanelVisible(false)}
        selectedSort={selectedSort}
        onSortChange={(sort) => {
          setSelectedSort(sort);
        }}
        categories={categories}
        selectedCategory={selectedCategory}
        onCategoryChange={(category) => {
          setSelectedCategory(category);
        }}
      />
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
  headerGradient: {
    paddingBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
  },
  header: {
    paddingTop: 12,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: '#fff',
    paddingHorizontal: 16,
    marginBottom: 16,
    letterSpacing: 0.5,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 12,
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 48,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    padding: 0,
    margin: 0,
    color: '#333',
  },
  iconButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: 6,
    right: 6,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
  categoriesSection: {
    paddingVertical: 16,
    marginBottom: 12,
  },
  categoriesContainer: {
    paddingHorizontal: 16,
    gap: 10,
  },
  categoryPill: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: '#F5F5F5',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  categoryPillActive: {
    borderColor: 'transparent',
  },
  categoryPillText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#666',
  },
  categoryPillTextActive: {
    fontWeight: '800',
  },
  gridContainer: {
    padding: 16,
  },
  row: {
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  card: {
    width: CARD_WIDTH,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    marginBottom: 4,
  },
  imageContainer: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#F8F8F8',
    position: 'relative',
    overflow: 'hidden',
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
  soldOutOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
  },
  soldOutGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  soldOutText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1,
  },
  categoryBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    zIndex: 5,
  },
  categoryBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  cardContent: {
    padding: 12,
  },
  clubBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.03)',
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  clubText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  itemName: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
    lineHeight: 22,
    minHeight: 44,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  price: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  stockBadge: {
    backgroundColor: '#FFF3E0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  stockText: {
    fontSize: 10,
    color: '#FF6B00',
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  cartButton: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
    color: '#333',
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#999',
  },
});
