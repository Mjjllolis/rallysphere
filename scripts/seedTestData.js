// scripts/seedTestData.js
// Script to seed Firebase with test data for clubs, events, and store items

const admin = require('firebase-admin');
const serviceAccount = require('../service-account-key.json');

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: 'rally-sphere.firebasestorage.app'
});

const db = admin.firestore();

// Sample image URLs (using placeholder images)
const sampleImages = {
  apparel: [
    'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800',
    'https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?w=800',
    'https://images.unsplash.com/photo-1576566588028-4147f3842f27?w=800',
  ],
  equipment: [
    'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=800',
    'https://images.unsplash.com/photo-1517649763962-0c623066013b?w=800',
    'https://images.unsplash.com/photo-1593786481097-0940d66d8245?w=800',
  ],
  events: [
    'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800',
    'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=800',
    'https://images.unsplash.com/photo-1511632765486-a01980e01a18?w=800',
  ],
};

// Test Clubs Data
const testClubs = [
  {
    name: 'Rally Racing Club',
    description: 'Premier rally racing club for enthusiasts and professionals. Join us for weekly races and training sessions.',
    sport: 'Rally Racing',
    category: 'Competitive',
    location: 'San Francisco, CA',
    memberCount: 145,
    imageUrl: sampleImages.events[0],
    coverImageUrl: sampleImages.events[1],
    isVerified: true,
    contactEmail: 'contact@rallyracingclub.com',
    website: 'https://rallyracingclub.com',
    socialMedia: {
      instagram: '@rallyracingclub',
      twitter: '@rallyracingclub',
    },
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  },
  {
    name: 'Mountain Bikers United',
    description: 'Explore trails and mountains with fellow biking enthusiasts. All skill levels welcome!',
    sport: 'Mountain Biking',
    category: 'Recreational',
    location: 'Boulder, CO',
    memberCount: 89,
    imageUrl: 'https://images.unsplash.com/photo-1541625602330-2277a4c46182?w=800',
    coverImageUrl: 'https://images.unsplash.com/photo-1559395812-58a8b7d1b50f?w=800',
    isVerified: true,
    contactEmail: 'hello@mountainbikers.com',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  },
  {
    name: 'Urban Running Crew',
    description: 'City running group meeting every weekend. Marathon training and social runs.',
    sport: 'Running',
    category: 'Social',
    location: 'New York, NY',
    memberCount: 203,
    imageUrl: 'https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=800',
    coverImageUrl: 'https://images.unsplash.com/photo-1513593771513-7b58b6c4af38?w=800',
    isVerified: false,
    contactEmail: 'crew@urbanrunning.com',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  },
];

// Test Events Data
const testEvents = [
  {
    title: 'Spring Rally Championship 2025',
    description: 'Annual spring rally championship featuring 50+ teams from across the country. Spectators welcome!',
    startDate: admin.firestore.Timestamp.fromDate(new Date('2025-04-15T09:00:00')),
    endDate: admin.firestore.Timestamp.fromDate(new Date('2025-04-15T18:00:00')),
    location: 'Golden Gate Park, San Francisco',
    venue: 'Rally Track Stadium',
    ticketPrice: 35,
    maxAttendees: 500,
    currentAttendees: 127,
    images: [sampleImages.events[0], sampleImages.events[1]],
    category: 'Competition',
    isVirtual: false,
    requiresTicket: true,
    tags: ['Rally', 'Championship', 'Outdoor'],
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  },
  {
    title: 'Mountain Trail Ride',
    description: 'Guided mountain biking trail ride through scenic routes. Intermediate level recommended.',
    startDate: admin.firestore.Timestamp.fromDate(new Date('2025-03-20T08:00:00')),
    endDate: admin.firestore.Timestamp.fromDate(new Date('2025-03-20T14:00:00')),
    location: 'Rocky Mountain National Park',
    venue: 'Trail Head #5',
    ticketPrice: 25,
    maxAttendees: 30,
    currentAttendees: 18,
    images: ['https://images.unsplash.com/photo-1559395812-58a8b7d1b50f?w=800'],
    category: 'Trail Ride',
    isVirtual: false,
    requiresTicket: true,
    tags: ['Mountain Biking', 'Outdoor', 'Adventure'],
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  },
  {
    title: 'City Marathon 2025',
    description: 'Full and half marathon options available. Run through the heart of the city with thousands of participants.',
    startDate: admin.firestore.Timestamp.fromDate(new Date('2025-05-10T07:00:00')),
    endDate: admin.firestore.Timestamp.fromDate(new Date('2025-05-10T13:00:00')),
    location: 'Downtown New York',
    venue: 'Central Park Start Line',
    ticketPrice: 85,
    maxAttendees: 2000,
    currentAttendees: 1456,
    images: ['https://images.unsplash.com/photo-1452626038306-9aae5e071dd3?w=800'],
    category: 'Marathon',
    isVirtual: false,
    requiresTicket: true,
    tags: ['Running', 'Marathon', 'Fitness'],
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  },
];

// Test Store Items Data - All Pickleball Products
const testStoreItems = [
  {
    name: 'Pro Carbon Fiber Paddle',
    description: 'Premium carbon fiber pickleball paddle with textured surface for maximum spin. Lightweight design with comfort grip.',
    price: 129.99,
    category: 'equipment',
    images: ['https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=800', 'https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?w=800'],
    inventory: 50,
    sold: 12,
    taxRate: 8.5,
    shippingCost: 8.00,
    pickupOnly: false,
    allowPickup: true,
    pickupAddress: '123 Sports Center Dr, San Francisco, CA 94102',
    variants: [
      {
        id: 'grip',
        name: 'Grip Size',
        options: ['Small', 'Medium', 'Large'],
      },
      {
        id: 'color',
        name: 'Color',
        options: ['Blue', 'Red', 'Green'],
      },
    ],
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  },
  {
    name: 'Performance Pickleball Shoes',
    description: 'Court-specific pickleball shoes with non-marking soles and superior lateral support. Enhanced cushioning for all-day comfort.',
    price: 89.99,
    category: 'apparel',
    images: ['https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800', 'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=800'],
    inventory: 75,
    sold: 28,
    taxRate: 8.5,
    shippingCost: 10.00,
    pickupOnly: false,
    allowPickup: true,
    pickupAddress: '123 Sports Center Dr, San Francisco, CA 94102',
    variants: [
      {
        id: 'size',
        name: 'Size',
        options: ['XS', 'S', 'M', 'L', 'XL', '2XL'],
      },
    ],
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  },
  {
    name: 'Tournament Pickleball Set',
    description: 'Professional tournament-grade pickleballs. Pack of 6 indoor balls with optimal bounce and durability.',
    price: 24.99,
    category: 'equipment',
    images: ['https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?w=800'],
    inventory: 150,
    sold: 67,
    taxRate: 8.5,
    shippingCost: 6.00,
    pickupOnly: false,
    allowPickup: true,
    pickupAddress: '123 Sports Center Dr, San Francisco, CA 94102',
    variants: [
      {
        id: 'type',
        name: 'Ball Type',
        options: ['Indoor', 'Outdoor'],
      },
    ],
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  },
  {
    name: 'Moisture-Wicking Jersey',
    description: 'Lightweight performance jersey with UV protection. Perfect for outdoor play with quick-dry technology.',
    price: 39.99,
    category: 'apparel',
    images: ['https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800', 'https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?w=800'],
    inventory: 80,
    sold: 34,
    taxRate: 8.5,
    shippingCost: 7.00,
    pickupOnly: false,
    allowPickup: true,
    pickupAddress: '123 Sports Center Dr, San Francisco, CA 94102',
    variants: [
      {
        id: 'size',
        name: 'Size',
        options: ['XS', 'S', 'M', 'L', 'XL', '2XL'],
      },
      {
        id: 'color',
        name: 'Color',
        options: ['Navy', 'White', 'Gray', 'Teal'],
      },
    ],
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  },
  {
    name: 'Paddle Cover & Bag',
    description: 'Durable paddle cover with storage pockets for balls and accessories. Padded protection for your paddle.',
    price: 29.99,
    category: 'accessories',
    images: ['https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800'],
    inventory: 60,
    sold: 18,
    taxRate: 8.5,
    shippingCost: 8.00,
    pickupOnly: false,
    allowPickup: true,
    pickupAddress: '123 Sports Center Dr, San Francisco, CA 94102',
    variants: [
      {
        id: 'color',
        name: 'Color',
        options: ['Black', 'Blue', 'Pink'],
      },
    ],
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  },
  {
    name: 'Performance Headband',
    description: 'Sweat-wicking headband to keep you focused. Non-slip design stays in place during intense matches.',
    price: 12.99,
    category: 'accessories',
    images: ['https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=800'],
    inventory: 120,
    sold: 45,
    taxRate: 8.5,
    shippingCost: 4.00,
    pickupOnly: false,
    allowPickup: true,
    pickupAddress: '123 Sports Center Dr, San Francisco, CA 94102',
    variants: [
      {
        id: 'color',
        name: 'Color',
        options: ['Black', 'White', 'Blue', 'Pink', 'Green'],
      },
    ],
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  },
  {
    name: 'Court Line Marking Kit',
    description: 'Complete kit for marking your own pickleball court. Includes tape, stakes, and measuring guide.',
    price: 79.99,
    category: 'equipment',
    images: ['https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=800'],
    inventory: 30,
    sold: 11,
    taxRate: 8.5,
    shippingCost: 12.00,
    pickupOnly: false,
    allowPickup: true,
    pickupAddress: '123 Sports Center Dr, San Francisco, CA 94102',
    variants: [],
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  },
  {
    name: 'Portable Net System',
    description: 'Professional-grade portable pickleball net. Easy setup and takedown with carrying case included.',
    price: 199.99,
    category: 'equipment',
    images: ['https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=800'],
    inventory: 20,
    sold: 5,
    taxRate: 8.5,
    shippingCost: 25.00,
    pickupOnly: true,
    allowPickup: true,
    pickupAddress: '123 Sports Center Dr, San Francisco, CA 94102',
    variants: [],
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  },
];

async function seedData() {
  console.log('🌱 Starting to seed test data...\n');

  try {
    // Seed Clubs
    console.log('📍 Creating test clubs...');
    const clubRefs = [];
    for (const club of testClubs) {
      const clubRef = await db.collection('clubs').add(club);
      clubRefs.push(clubRef.id);
      console.log(`  ✓ Created club: ${club.name} (ID: ${clubRef.id})`);
    }

    // Seed Events (link to first club)
    console.log('\n📅 Creating test events...');
    for (const event of testEvents) {
      const eventData = {
        ...event,
        clubId: clubRefs[0], // Link to first club
        clubName: testClubs[0].name,
      };
      const eventRef = await db.collection('events').add(eventData);
      console.log(`  ✓ Created event: ${event.title} (ID: ${eventRef.id})`);
    }

    // Seed Store Items (link to first club)
    console.log('\n🛍️  Creating test store items...');
    for (const item of testStoreItems) {
      const itemData = {
        ...item,
        clubId: clubRefs[0], // Link to first club
        clubName: testClubs[0].name,
      };
      const itemRef = await db.collection('store_items').add(itemData);
      console.log(`  ✓ Created store item: ${item.name} (ID: ${itemRef.id})`);
    }

    console.log('\n✅ Test data seeding completed successfully!');
    console.log('\nSummary:');
    console.log(`  - ${testClubs.length} clubs created`);
    console.log(`  - ${testEvents.length} events created`);
    console.log(`  - ${testStoreItems.length} store items created`);

  } catch (error) {
    console.error('❌ Error seeding data:', error);
    process.exit(1);
  }

  process.exit(0);
}

// Run the seed function
seedData();
