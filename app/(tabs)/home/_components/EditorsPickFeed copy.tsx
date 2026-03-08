import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, ImageBackground, StyleSheet, Dimensions, ActivityIndicator } from 'react-native';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../../../../lib/firebase';

const { width, height } = Dimensions.get('window');

export default function EditorsPickFeed() {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const q = query(
          collection(db, 'events'),
          orderBy('createdAt', 'desc'),
          limit(10)
        );

        const snapshot = await getDocs(q);
        const list = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        setEvents(list);
      } catch (error) {
        console.error('Error fetching events:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchEvents();
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#000" />
        <Text>Loading events...</Text>
      </View>
    );
  }

  if (!events.length) {
    return (
      <View style={styles.center}>
        <Text>No events found.</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={events}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => {
        const imageUrl =
          typeof item.imageUrl === 'string' && item.imageUrl.startsWith('http')
            ? item.imageUrl
            : 'https://via.placeholder.com/800x600.png?text=No+Image';

        return (
          <View style={styles.card}>
            <ImageBackground
              source={{ uri: imageUrl }}
              style={styles.image}
              imageStyle={styles.imageStyle}
            >
              <View style={styles.titleContainer}>
                <Text style={styles.titleText}>
                  {item.title || 'Untitled Event'}
                </Text>
              </View>
            </ImageBackground>
          </View>
        );
      }}
      showsVerticalScrollIndicator={false}
      snapToInterval={height * 0.85}
      decelerationRate="fast"
      pagingEnabled
    />
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    height: height * 0.85,
    width,
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    height: '90%',
    width: '90%',
    justifyContent: 'flex-end',
  },
  imageStyle: {
    borderRadius: 20,
  },
  titleContainer: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  titleText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
});
